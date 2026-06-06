/**
 * Audio playback layer for generated games — plays the fetched assets/sfx/ and assets/music/
 * (the renderer is visual-only). Web Audio based; exposes typed play/loop/stop/volume helpers
 * keyed by the asset-manifest config/ bindings.
 */
import { z } from 'zod';

const AUDIO_LOG_PREFIX = '[engine/audio/playback]';

/**
 * One audio entry from a generated game's `config/` manifest. The asset-manifest module
 * (built in parallel) emits these; we declare the shape locally rather than importing it so
 * the two modules can evolve independently. `key` is the variable name the game's code refers
 * to; `url` resolves the file under `assets/sfx/` or `assets/music/`.
 */
export const AudioManifestEntrySchema = z.object({
  /** Stable variable-name binding used by the game's systems/code. */
  key: z.string().min(1),
  /** Resolvable URL/path to the audio file (assets/sfx/* or assets/music/*). */
  url: z.string().min(1),
  /** Channel classification — drives default looping + per-channel volume buses. */
  kind: z.enum(['sfx', 'music']),
  /** Optional per-asset gain multiplier (0..1), applied on top of the channel volume. */
  gain: z.number().min(0).max(1).optional(),
  /** Optional default loop override (music defaults to looping, sfx does not). */
  loop: z.boolean().optional(),
});
export type AudioManifestEntry = z.infer<typeof AudioManifestEntrySchema>;

export const AudioManifestSchema = z.array(AudioManifestEntrySchema);
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

export type AudioChannel = 'sfx' | 'music';

/**
 * Minimal structural interface over the Web Audio nodes this layer needs. Lets generated
 * games pass a real `AudioContext` in the browser while tests inject a fake — the module never
 * touches a global `AudioContext`.
 */
export interface AudioGainNodeLike {
  readonly gain: { value: number };
  connect(destination: AudioGainNodeLike | AudioDestinationNodeLike): void;
  disconnect(): void;
}

export interface AudioDestinationNodeLike {
  /** Marker so destination and gain nodes aren't structurally interchangeable in intent. */
  readonly maxChannelCount?: number;
}

export interface AudioBufferSourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  onended: (() => void) | null;
  connect(destination: AudioGainNodeLike | AudioDestinationNodeLike): void;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioBufferLike {
  readonly duration: number;
}

/** The slice of `AudioContext` this layer depends on. Real browsers satisfy it natively. */
export interface AudioContextLike {
  readonly state: 'suspended' | 'running' | 'closed' | string;
  readonly destination: AudioDestinationNodeLike;
  createGain(): AudioGainNodeLike;
  createBufferSource(): AudioBufferSourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** Loads raw bytes for a manifest URL. Defaults to `fetch`; injectable for tests/node. */
export type AudioFetcher = (url: string) => Promise<ArrayBuffer>;

export interface AudioPlaybackOptions {
  /** Web Audio context (real `AudioContext` in browser, fake in tests). */
  context: AudioContextLike;
  /** Loads bytes for a URL. Defaults to a `fetch`-based loader. */
  fetcher?: AudioFetcher;
  /** Initial master volume (0..1). Default 1. */
  masterVolume?: number;
  /** Initial sfx-channel volume (0..1). Default 1. */
  sfxVolume?: number;
  /** Initial music-channel volume (0..1). Default 1. */
  musicVolume?: number;
}

/** Options for a single playback invocation. */
export interface PlayOptions {
  /** Override the manifest/channel default loop behaviour. */
  loop?: boolean;
  /** Per-play gain (0..1), multiplied with the asset + channel + master gains. */
  gain?: number;
}

/** Handle returned from `play`/`loop` so the caller can stop one specific voice. */
export interface PlaybackHandle {
  readonly id: number;
  readonly key: string;
  readonly channel: AudioChannel;
  stop(): void;
  readonly stopped: boolean;
}

interface ActiveVoice {
  id: number;
  key: string;
  channel: AudioChannel;
  source: AudioBufferSourceLike;
  voiceGain: AudioGainNodeLike;
  stopped: boolean;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

const defaultFetcher: AudioFetcher = async (url: string): Promise<ArrayBuffer> => {
  if (typeof fetch !== 'function') {
    throw new Error(`${AUDIO_LOG_PREFIX} no global fetch available; supply opts.fetcher`);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${AUDIO_LOG_PREFIX} fetch failed status=${res.status} url=${url}`);
  }
  return res.arrayBuffer();
};

/**
 * Typed audio player keyed by asset-manifest bindings. Construct via {@link createAudioPlayer},
 * register a manifest with {@link AudioPlayer.load}, then drive it from the game's systems with
 * `play(key)` / `loop(key)` / `stop(key)` and per-channel/master volume setters.
 */
export class AudioPlayer {
  private readonly context: AudioContextLike;
  private readonly fetcher: AudioFetcher;
  private readonly masterGain: AudioGainNodeLike;
  private readonly channelGains: Record<AudioChannel, AudioGainNodeLike>;
  private readonly entries = new Map<string, AudioManifestEntry>();
  private readonly buffers = new Map<string, AudioBufferLike>();
  private readonly voices = new Map<number, ActiveVoice>();
  private nextVoiceId = 1;

  constructor(opts: AudioPlaybackOptions) {
    if (!opts || !opts.context) {
      throw new Error(`${AUDIO_LOG_PREFIX} createAudioPlayer requires an AudioContextLike`);
    }
    this.context = opts.context;
    this.fetcher = opts.fetcher ?? defaultFetcher;

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = clamp01(opts.masterVolume ?? 1);
    this.masterGain.connect(this.context.destination);

    const sfxGain = this.context.createGain();
    sfxGain.gain.value = clamp01(opts.sfxVolume ?? 1);
    sfxGain.connect(this.masterGain);

    const musicGain = this.context.createGain();
    musicGain.gain.value = clamp01(opts.musicVolume ?? 1);
    musicGain.connect(this.masterGain);

    this.channelGains = { sfx: sfxGain, music: musicGain };

    console.log(
      `${AUDIO_LOG_PREFIX} init contextState=${this.context.state} master=${this.masterGain.gain.value} sfx=${sfxGain.gain.value} music=${musicGain.gain.value}`,
    );
  }

  /**
   * Validate + register a manifest. Replaces any previously registered entries with the same
   * key. Does not fetch audio — decoding is lazy on first `play`, or eager via {@link preload}.
   */
  load(manifest: unknown): void {
    const parsed = AudioManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      console.error(`${AUDIO_LOG_PREFIX} load: invalid manifest ${parsed.error.message}`);
      throw new Error(`${AUDIO_LOG_PREFIX} load: manifest failed validation`);
    }
    for (const entry of parsed.data) {
      this.entries.set(entry.key, entry);
    }
    console.log(`${AUDIO_LOG_PREFIX} load registered=${parsed.data.length} totalKeys=${this.entries.size}`);
  }

  /** Keys known to the player (registered via {@link load}). */
  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  private resolveEntry(key: string): AudioManifestEntry {
    const entry = this.entries.get(key);
    if (!entry) {
      console.error(`${AUDIO_LOG_PREFIX} unknown key=${key} known=${this.keys().join(',')}`);
      throw new Error(`${AUDIO_LOG_PREFIX} no manifest entry for key=${key}`);
    }
    return entry;
  }

  /** Fetch + decode the buffer for one key (idempotent). */
  async preload(key: string): Promise<void> {
    const entry = this.resolveEntry(key);
    if (this.buffers.has(key)) return;
    try {
      const bytes = await this.fetcher(entry.url);
      const buffer = await this.context.decodeAudioData(bytes);
      this.buffers.set(key, buffer);
      console.log(`${AUDIO_LOG_PREFIX} preload ok key=${key} durationSec=${buffer.duration}`);
    } catch (err) {
      console.error(`${AUDIO_LOG_PREFIX} preload failed key=${key} url=${entry.url} err=${String(err)}`);
      throw err;
    }
  }

  /** Decode every registered key. Resolves once all are ready. */
  async preloadAll(): Promise<void> {
    await Promise.all(this.keys().map((k) => this.preload(k)));
    console.log(`${AUDIO_LOG_PREFIX} preloadAll done keys=${this.buffers.size}`);
  }

  /**
   * Start a voice for `key`. Resolves the manifest entry, ensures the buffer is decoded, wires
   * a per-voice gain into the channel bus, and starts the source. Returns a handle to stop it.
   */
  async play(key: string, opts: PlayOptions = {}): Promise<PlaybackHandle> {
    const entry = this.resolveEntry(key);
    if (!this.buffers.has(key)) {
      await this.preload(key);
    }
    const buffer = this.buffers.get(key);
    if (!buffer) {
      throw new Error(`${AUDIO_LOG_PREFIX} play: buffer missing after preload key=${key}`);
    }

    // A suspended context (autoplay policy) won't produce sound — resume best-effort.
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
        console.log(`${AUDIO_LOG_PREFIX} context resumed for key=${key}`);
      } catch (err) {
        console.error(`${AUDIO_LOG_PREFIX} context.resume failed key=${key} err=${String(err)}`);
      }
    }

    const channel = entry.kind;
    const loop = opts.loop ?? entry.loop ?? channel === 'music';

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    const voiceGain = this.context.createGain();
    const assetGain = clamp01(entry.gain ?? 1);
    const playGain = clamp01(opts.gain ?? 1);
    voiceGain.gain.value = clamp01(assetGain * playGain);

    source.connect(voiceGain);
    voiceGain.connect(this.channelGains[channel]);

    const id = this.nextVoiceId++;
    const voice: ActiveVoice = { id, key, channel, source, voiceGain, stopped: false };
    this.voices.set(id, voice);

    source.onended = (): void => {
      this.disposeVoice(id, 'ended');
    };

    try {
      source.start();
    } catch (err) {
      this.disposeVoice(id, 'start-error');
      console.error(`${AUDIO_LOG_PREFIX} source.start failed key=${key} err=${String(err)}`);
      throw err;
    }

    console.log(`${AUDIO_LOG_PREFIX} play key=${key} channel=${channel} loop=${loop} voiceId=${id} active=${this.voices.size}`);

    const player = this;
    return {
      id,
      key,
      channel,
      get stopped(): boolean {
        const v = player.voices.get(id);
        return v ? v.stopped : true;
      },
      stop(): void {
        player.stopVoice(id);
      },
    };
  }

  /** Convenience wrapper for `play(key, { loop: true })`. */
  async loop(key: string, opts: Omit<PlayOptions, 'loop'> = {}): Promise<PlaybackHandle> {
    return this.play(key, { ...opts, loop: true });
  }

  private disposeVoice(id: number, reason: string): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    voice.stopped = true;
    try {
      voice.source.onended = null;
      voice.source.disconnect();
      voice.voiceGain.disconnect();
    } catch (err) {
      console.error(`${AUDIO_LOG_PREFIX} disposeVoice cleanup err id=${id} err=${String(err)}`);
    }
    this.voices.delete(id);
    console.log(`${AUDIO_LOG_PREFIX} voice removed id=${id} reason=${reason} active=${this.voices.size}`);
  }

  private stopVoice(id: number): void {
    const voice = this.voices.get(id);
    if (!voice || voice.stopped) return;
    try {
      voice.source.stop();
    } catch (err) {
      console.error(`${AUDIO_LOG_PREFIX} stopVoice source.stop err id=${id} err=${String(err)}`);
    }
    this.disposeVoice(id, 'stopped');
  }

  /** Stop every active voice for `key`. Returns the number of voices stopped. */
  stop(key: string): number {
    let count = 0;
    for (const voice of Array.from(this.voices.values())) {
      if (voice.key === key) {
        this.stopVoice(voice.id);
        count++;
      }
    }
    console.log(`${AUDIO_LOG_PREFIX} stop key=${key} stoppedVoices=${count}`);
    return count;
  }

  /** Stop every active voice on a channel (e.g. cut all music). Returns count stopped. */
  stopChannel(channel: AudioChannel): number {
    let count = 0;
    for (const voice of Array.from(this.voices.values())) {
      if (voice.channel === channel) {
        this.stopVoice(voice.id);
        count++;
      }
    }
    console.log(`${AUDIO_LOG_PREFIX} stopChannel channel=${channel} stoppedVoices=${count}`);
    return count;
  }

  /** Stop all active voices. Returns count stopped. */
  stopAll(): number {
    let count = 0;
    for (const voice of Array.from(this.voices.values())) {
      this.stopVoice(voice.id);
      count++;
    }
    console.log(`${AUDIO_LOG_PREFIX} stopAll stoppedVoices=${count}`);
    return count;
  }

  /** Set master volume (0..1, clamped). */
  setMasterVolume(value: number): void {
    const v = clamp01(value);
    this.masterGain.gain.value = v;
    console.log(`${AUDIO_LOG_PREFIX} setMasterVolume=${v}`);
  }

  /** Set per-channel volume (0..1, clamped). */
  setChannelVolume(channel: AudioChannel, value: number): void {
    const v = clamp01(value);
    this.channelGains[channel].gain.value = v;
    console.log(`${AUDIO_LOG_PREFIX} setChannelVolume channel=${channel} value=${v}`);
  }

  /** Current master volume. */
  getMasterVolume(): number {
    return this.masterGain.gain.value;
  }

  /** Current per-channel volume. */
  getChannelVolume(channel: AudioChannel): number {
    return this.channelGains[channel].gain.value;
  }

  /** Number of currently-active voices (optionally for one key). */
  activeCount(key?: string): number {
    if (key === undefined) return this.voices.size;
    let count = 0;
    for (const voice of this.voices.values()) {
      if (voice.key === key) count++;
    }
    return count;
  }

  /** Stop everything and release the underlying context. */
  async dispose(): Promise<void> {
    this.stopAll();
    try {
      this.masterGain.disconnect();
      this.channelGains.sfx.disconnect();
      this.channelGains.music.disconnect();
      await this.context.close();
      console.log(`${AUDIO_LOG_PREFIX} dispose ok`);
    } catch (err) {
      console.error(`${AUDIO_LOG_PREFIX} dispose err=${String(err)}`);
    }
  }
}

/** Factory mirroring the engine's provider-style API. */
export function createAudioPlayer(opts: AudioPlaybackOptions): AudioPlayer {
  return new AudioPlayer(opts);
}
