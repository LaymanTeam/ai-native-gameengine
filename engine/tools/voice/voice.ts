/**
 * Handles the transfer of the CLI interface to VOICE, should be performant
 * receives speech to text using OS libraries.
 *
 * Speech-to-text voice layer over the chat interface. Wraps the browser Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition) with a typed, event-driven state machine and a
 * graceful unsupported fallback. The pure state-machine reducer (voiceReduce) is exported and
 * unit-tested independently of any real recognition backend.
 *
 * Note: the engine surface is a Vercel-hosted chat UI; speech recognition runs client-side in the
 * browser (no OS/native binding) — the "OS libraries" intent maps to the browser Web Speech API.
 */

const LOG_PREFIX = '[engine/tools/voice/voice]';

/** Recognition lifecycle states. */
export type VoiceState = 'idle' | 'listening' | 'error' | 'unsupported';

/** Events that drive the state machine. */
export type VoiceEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'RESULT'; transcript: string; isFinal: boolean }
  | { type: 'ERROR'; error: string }
  | { type: 'END' }
  | { type: 'UNSUPPORTED' };

export interface VoiceMachineState {
  status: VoiceState;
  /** Accumulated finalized transcript across the current session. */
  finalTranscript: string;
  /** The latest interim (not-yet-final) chunk. */
  interimTranscript: string;
  /** Last error code/message, if any. */
  error: string | null;
}

export const initialVoiceState: VoiceMachineState = {
  status: 'idle',
  finalTranscript: '',
  interimTranscript: '',
  error: null,
};

/**
 * Pure reducer for the voice state machine. Deterministic and backend-agnostic — the unit tests
 * drive it directly with a mocked recognition backend's event sequence.
 */
export function voiceReduce(state: VoiceMachineState, event: VoiceEvent): VoiceMachineState {
  switch (event.type) {
    case 'UNSUPPORTED':
      return { ...state, status: 'unsupported', error: 'speech-recognition-unsupported' };
    case 'START':
      if (state.status === 'unsupported') return state;
      // Fresh session: clear transcripts and error.
      return { status: 'listening', finalTranscript: '', interimTranscript: '', error: null };
    case 'RESULT': {
      if (state.status !== 'listening') return state;
      if (event.isFinal) {
        const sep = state.finalTranscript.length > 0 ? ' ' : '';
        return {
          ...state,
          finalTranscript: `${state.finalTranscript}${sep}${event.transcript}`.trim(),
          interimTranscript: '',
        };
      }
      return { ...state, interimTranscript: event.transcript };
    }
    case 'ERROR':
      return { ...state, status: 'error', error: event.error, interimTranscript: '' };
    case 'STOP':
    case 'END':
      if (state.status === 'unsupported') return state;
      return { ...state, status: 'idle', interimTranscript: '' };
    default:
      return state;
  }
}

/** The combined transcript a consumer typically displays/sends. */
export function combinedTranscript(state: VoiceMachineState): string {
  return [state.finalTranscript, state.interimTranscript].filter((s) => s.length > 0).join(' ').trim();
}

/* ------------------------------------------------------------------ *
 * Browser backend (minimal structural typings of the Web Speech API)  *
 * ------------------------------------------------------------------ */

interface RecognitionAlternativeLike {
  transcript: string;
}
interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternativeLike;
}
interface RecognitionResultListLike {
  readonly length: number;
  [index: number]: RecognitionResultLike;
}
interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: RecognitionResultListLike;
}
interface RecognitionErrorEventLike {
  readonly error: string;
}

/** The subset of SpeechRecognition we drive. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

/** Factory that produces a recognition instance (so it can be mocked / feature-detected). */
export type SpeechRecognitionFactory = () => SpeechRecognitionLike;

export interface VoiceControllerOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  /** Inject a recognition factory (for tests / non-browser environments). */
  recognitionFactory?: SpeechRecognitionFactory | null;
  /** Called on every state transition with the new state. */
  onState?: (state: VoiceMachineState) => void;
}

/**
 * Detect a Web Speech API constructor in the current global, returning a factory or null.
 * Guards every access defensively — works in SSR/Node where `window` is undefined.
 */
export function detectSpeechRecognition(): SpeechRecognitionFactory | null {
  const g = globalThis as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  if (typeof Ctor !== 'function') return null;
  return () => new Ctor();
}

/**
 * Stateful voice controller bound to a recognition backend. Owns the VoiceMachineState, wires the
 * backend's callbacks into voiceReduce, and exposes start/stop. Falls back to 'unsupported' when no
 * recognition backend is available (graceful degradation — caller hides the mic button).
 */
export class VoiceController {
  private state: VoiceMachineState = initialVoiceState;
  private recognition: SpeechRecognitionLike | null = null;
  private readonly factory: SpeechRecognitionFactory | null;
  private readonly onState: ((state: VoiceMachineState) => void) | undefined;
  private readonly lang: string;
  private readonly continuous: boolean;
  private readonly interimResults: boolean;

  constructor(options: VoiceControllerOptions = {}) {
    this.factory =
      options.recognitionFactory !== undefined ? options.recognitionFactory : detectSpeechRecognition();
    this.onState = options.onState;
    this.lang = options.lang ?? 'en-US';
    this.continuous = options.continuous ?? true;
    this.interimResults = options.interimResults ?? true;

    if (!this.factory) {
      console.warn(`${LOG_PREFIX} no SpeechRecognition backend — voice disabled (unsupported)`);
      this.dispatch({ type: 'UNSUPPORTED' });
    } else {
      console.log(`${LOG_PREFIX} initialized lang=${this.lang} continuous=${this.continuous}`);
    }
  }

  getState(): VoiceMachineState {
    return this.state;
  }

  isSupported(): boolean {
    return this.factory !== null;
  }

  private dispatch(event: VoiceEvent): void {
    const next = voiceReduce(this.state, event);
    if (next !== this.state) {
      this.state = next;
      this.onState?.(next);
    }
  }

  /** Begin a listening session. No-op (logged) when unsupported or already listening. */
  start(): void {
    if (!this.factory) {
      console.warn(`${LOG_PREFIX} start ignored — unsupported`);
      return;
    }
    if (this.state.status === 'listening') {
      console.log(`${LOG_PREFIX} start ignored — already listening`);
      return;
    }
    try {
      const recognition = this.factory();
      recognition.lang = this.lang;
      recognition.continuous = this.continuous;
      recognition.interimResults = this.interimResults;

      recognition.onresult = (event: RecognitionEventLike): void => {
        const results = event?.results;
        if (!results) return;
        for (let i = event.resultIndex ?? 0; i < results.length; i += 1) {
          const result = results[i];
          if (!result) continue;
          const alt = result[0];
          const transcript = alt?.transcript ?? '';
          if (transcript.length === 0) continue;
          this.dispatch({ type: 'RESULT', transcript, isFinal: Boolean(result.isFinal) });
        }
      };
      recognition.onerror = (event: RecognitionErrorEventLike): void => {
        const code = event?.error ?? 'unknown';
        console.error(`${LOG_PREFIX} recognition error=${code}`);
        this.dispatch({ type: 'ERROR', error: code });
      };
      recognition.onend = (): void => {
        console.log(`${LOG_PREFIX} recognition ended`);
        this.dispatch({ type: 'END' });
        this.recognition = null;
      };

      this.recognition = recognition;
      this.dispatch({ type: 'START' });
      recognition.start();
      console.log(`${LOG_PREFIX} listening started`);
    } catch (err) {
      console.error(`${LOG_PREFIX} start failed: ${(err as Error).message}`);
      this.dispatch({ type: 'ERROR', error: (err as Error).message });
      this.recognition = null;
    }
  }

  /** Stop the current session; finalized transcript is preserved on state. */
  stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.error(`${LOG_PREFIX} stop failed: ${(err as Error).message}`);
      }
    }
    this.dispatch({ type: 'STOP' });
    console.log(`${LOG_PREFIX} stopped`);
  }
}
