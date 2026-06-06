/**
 * Tests for engine/tools/voice/voice.ts — pure reducer + VoiceController with a fake
 * SpeechRecognition backend (no browser, no Web Speech API).
 * Run: npx tsx engine/tools/voice/voice.test.ts
 */
import assert from 'node:assert/strict';
import {
  initialVoiceState,
  voiceReduce,
  combinedTranscript,
  detectSpeechRecognition,
  VoiceController,
  type SpeechRecognitionLike,
  type VoiceMachineState,
} from './voice';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Fake Web Speech backend the controller drives; tests fire its callbacks manually. */
class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  started = 0;
  stopped = 0;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  start(): void {
    this.started += 1;
  }
  stop(): void {
    this.stopped += 1;
    this.onend?.();
  }
  abort(): void {}
  /** Emit one recognition result through the real Web Speech event shape. */
  emit(transcript: string, isFinal: boolean): void {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript } } },
    });
  }
}

console.log('voiceReduce (pure state machine):');

ok('START begins a fresh listening session', () => {
  const s = voiceReduce({ ...initialVoiceState, finalTranscript: 'old', error: 'e' }, { type: 'START' });
  assert.deepEqual(s, { status: 'listening', finalTranscript: '', interimTranscript: '', error: null });
});

ok('RESULT accumulates finals with spacing, interim replaces', () => {
  let s = voiceReduce(initialVoiceState, { type: 'START' });
  s = voiceReduce(s, { type: 'RESULT', transcript: 'make a', isFinal: false });
  assert.equal(s.interimTranscript, 'make a');
  s = voiceReduce(s, { type: 'RESULT', transcript: 'make a game', isFinal: true });
  assert.equal(s.finalTranscript, 'make a game');
  assert.equal(s.interimTranscript, '');
  s = voiceReduce(s, { type: 'RESULT', transcript: 'about fish', isFinal: true });
  assert.equal(s.finalTranscript, 'make a game about fish');
});

ok('RESULT outside listening is ignored', () => {
  const s = voiceReduce(initialVoiceState, { type: 'RESULT', transcript: 'x', isFinal: true });
  assert.equal(s.finalTranscript, '');
});

ok('ERROR records and clears interim; END returns to idle preserving final', () => {
  let s = voiceReduce(initialVoiceState, { type: 'START' });
  s = voiceReduce(s, { type: 'RESULT', transcript: 'hello', isFinal: true });
  s = voiceReduce(s, { type: 'RESULT', transcript: 'wor', isFinal: false });
  const errored = voiceReduce(s, { type: 'ERROR', error: 'no-speech' });
  assert.equal(errored.status, 'error');
  assert.equal(errored.error, 'no-speech');
  assert.equal(errored.interimTranscript, '');
  const ended = voiceReduce(s, { type: 'END' });
  assert.equal(ended.status, 'idle');
  assert.equal(ended.finalTranscript, 'hello');
});

ok('UNSUPPORTED is terminal — START/END cannot leave it', () => {
  let s = voiceReduce(initialVoiceState, { type: 'UNSUPPORTED' });
  assert.equal(s.status, 'unsupported');
  s = voiceReduce(s, { type: 'START' });
  assert.equal(s.status, 'unsupported');
  s = voiceReduce(s, { type: 'END' });
  assert.equal(s.status, 'unsupported');
});

ok('combinedTranscript joins final + interim', () => {
  assert.equal(
    combinedTranscript({ status: 'listening', finalTranscript: 'make a game', interimTranscript: 'about', error: null }),
    'make a game about',
  );
  assert.equal(combinedTranscript(initialVoiceState), '');
});

console.log('detectSpeechRecognition:');

ok('returns null in Node, picks up an injected global constructor', () => {
  assert.equal(detectSpeechRecognition(), null);
  const g = globalThis as unknown as { SpeechRecognition?: unknown };
  g.SpeechRecognition = FakeRecognition;
  try {
    const factory = detectSpeechRecognition();
    assert.ok(factory);
    assert.ok(factory() instanceof FakeRecognition);
  } finally {
    delete g.SpeechRecognition;
  }
});

console.log('VoiceController (fake backend):');

ok('full session: start → interim → final → stop', () => {
  const states: VoiceMachineState[] = [];
  let rec: FakeRecognition | null = null;
  const controller = new VoiceController({
    lang: 'en-GB',
    recognitionFactory: () => {
      rec = new FakeRecognition();
      return rec;
    },
    onState: (s) => states.push(s),
  });
  assert.ok(controller.isSupported());
  controller.start();
  assert.ok(rec);
  const fake = rec as FakeRecognition;
  assert.equal(fake.lang, 'en-GB');
  assert.equal(fake.started, 1);
  assert.equal(controller.getState().status, 'listening');

  fake.emit('build me', false);
  assert.equal(controller.getState().interimTranscript, 'build me');
  fake.emit('build me a platformer', true);
  assert.equal(controller.getState().finalTranscript, 'build me a platformer');

  controller.stop();
  assert.equal(fake.stopped, 1);
  assert.equal(controller.getState().status, 'idle');
  assert.equal(controller.getState().finalTranscript, 'build me a platformer');
  assert.ok(states.length >= 4, 'onState fired per transition');
});

ok('double start does not spawn a second backend', () => {
  let created = 0;
  const controller = new VoiceController({
    recognitionFactory: () => {
      created += 1;
      return new FakeRecognition();
    },
  });
  controller.start();
  controller.start();
  assert.equal(created, 1);
});

ok('backend error transitions to error state', () => {
  let rec: FakeRecognition | null = null;
  const controller = new VoiceController({
    recognitionFactory: () => {
      rec = new FakeRecognition();
      return rec;
    },
  });
  controller.start();
  (rec as unknown as FakeRecognition).onerror?.({ error: 'not-allowed' });
  assert.equal(controller.getState().status, 'error');
  assert.equal(controller.getState().error, 'not-allowed');
});

ok('factory that throws on start() lands in error state, not a crash', () => {
  const controller = new VoiceController({
    recognitionFactory: () => {
      throw new Error('mic exploded');
    },
  });
  controller.start();
  assert.equal(controller.getState().status, 'error');
  assert.match(controller.getState().error ?? '', /mic exploded/);
});

ok('null factory → unsupported, start is a safe no-op', () => {
  const controller = new VoiceController({ recognitionFactory: null });
  assert.equal(controller.isSupported(), false);
  assert.equal(controller.getState().status, 'unsupported');
  controller.start();
  assert.equal(controller.getState().status, 'unsupported');
});

console.log(`\n${passed} voice tests passed`);
