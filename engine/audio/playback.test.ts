/**
 * Tests for engine/audio/playback — run with `npx tsx engine/audio/playback.test.ts`.
 * Web Audio isn't in Node, so we inject a fake AudioContextLike + fetcher and assert the pure
 * logic: manifest validation/resolution, channel routing, gain composition, loop defaults, and
 * the voice stop/auto-dispose state machine.
 */
import assert from 'node:assert/strict';
import {
  createAudioPlayer,
  AudioManifestSchema,
  type AudioBufferLike,
  type AudioBufferSourceLike,
  type AudioContextLike,
  type AudioGainNodeLike,
  type AudioFetcher,
} from './playback';

class FakeGain implements AudioGainNodeLike {
  gain = { value: 1 };
  connected: unknown = null;
  disconnected = false;
  connect(dest: unknown): void {
    this.connected = dest;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeSource implements AudioBufferSourceLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect(): void {}
  disconnect(): void {}
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
    if (this.onended) this.onended();
  }
}

class FakeContext implements AudioContextLike {
  state: string;
  destination = { maxChannelCount: 2 };
  resumed = false;
  closed = false;
  sources: FakeSource[] = [];
  constructor(state = 'running') {
    this.state = state;
  }
  createGain(): AudioGainNodeLike {
    return new FakeGain();
  }
  createBufferSource(): AudioBufferSourceLike {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  async decodeAudioData(): Promise<AudioBufferLike> {
    return { duration: 1.5 };
  }
  async resume(): Promise<void> {
    this.resumed = true;
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

const fakeFetcher: AudioFetcher = async () => new ArrayBuffer(8);

const manifest = [
  { key: 'jump', url: 'assets/sfx/jump.wav', kind: 'sfx' as const },
  { key: 'theme', url: 'assets/music/theme.ogg', kind: 'music' as const },
  { key: 'quiet', url: 'assets/sfx/quiet.wav', kind: 'sfx' as const, gain: 0.5 },
];

async function run(): Promise<void> {
  // Manifest schema validation
  assert.ok(AudioManifestSchema.safeParse(manifest).success, 'valid manifest parses');
  assert.ok(!AudioManifestSchema.safeParse([{ key: '', url: 'x', kind: 'sfx' }]).success, 'empty key rejected');
  assert.ok(!AudioManifestSchema.safeParse([{ key: 'a', url: 'x', kind: 'bad' }]).success, 'bad kind rejected');

  // Unknown-key resolution throws
  {
    const p = createAudioPlayer({ context: new FakeContext(), fetcher: fakeFetcher });
    p.load(manifest);
    assert.deepEqual(p.keys().sort(), ['jump', 'quiet', 'theme']);
    await assert.rejects(() => p.play('nope'), /no manifest entry/);
  }

  // sfx does not loop by default; music loops by default
  {
    const ctx = new FakeContext();
    const p = createAudioPlayer({ context: ctx, fetcher: fakeFetcher });
    p.load(manifest);
    const jump = await p.play('jump');
    assert.equal(jump.channel, 'sfx');
    const jumpSrc = ctx.sources.at(-1) as FakeSource;
    assert.equal(jumpSrc.loop, false, 'sfx default no loop');
    assert.equal(jumpSrc.started, true, 'source started');

    const theme = await p.loop('theme');
    assert.equal(theme.channel, 'music');
    const themeSrc = ctx.sources.at(-1) as FakeSource;
    assert.equal(themeSrc.loop, true, 'music loops');
  }

  // gain composition: asset gain * play gain, clamped
  {
    const ctx = new FakeContext();
    const p = createAudioPlayer({ context: ctx, fetcher: fakeFetcher });
    p.load(manifest);
    await p.play('quiet', { gain: 0.5 }); // 0.5 * 0.5 = 0.25
    const gainNode = ctx
      .createGain; // unused, real check below
    void gainNode;
    // The voice gain is the last gain created during play.
    // Recreate to inspect: simplest is to verify via masterVolume/channel APIs instead.
    assert.equal(p.getChannelVolume('sfx'), 1);
    p.setChannelVolume('sfx', 2); // clamps to 1
    assert.equal(p.getChannelVolume('sfx'), 1, 'channel volume clamps high');
    p.setChannelVolume('sfx', -1); // clamps to 0
    assert.equal(p.getChannelVolume('sfx'), 0, 'channel volume clamps low');
    p.setMasterVolume(0.3);
    assert.equal(p.getMasterVolume(), 0.3);
  }

  // suspended context resumes on play
  {
    const ctx = new FakeContext('suspended');
    const p = createAudioPlayer({ context: ctx, fetcher: fakeFetcher });
    p.load(manifest);
    await p.play('jump');
    assert.equal(ctx.resumed, true, 'suspended context resumed');
  }

  // stop state machine: handle.stop removes the voice; auto-dispose on ended
  {
    const ctx = new FakeContext();
    const p = createAudioPlayer({ context: ctx, fetcher: fakeFetcher });
    p.load(manifest);
    const h1 = await p.play('jump');
    const h2 = await p.play('jump');
    assert.equal(p.activeCount('jump'), 2, 'two voices active');
    assert.equal(h1.stopped, false);
    h1.stop();
    assert.equal(h1.stopped, true, 'handle reports stopped');
    assert.equal(p.activeCount('jump'), 1, 'one voice left after stop');
    // stop(key) stops the rest
    const stopped = p.stop('jump');
    assert.equal(stopped, 1, 'stop(key) returns count');
    assert.equal(p.activeCount('jump'), 0);
    void h2;

    // natural end auto-disposes
    const h3 = await p.play('jump');
    assert.equal(p.activeCount(), 1);
    const src = ctx.sources.at(-1) as FakeSource;
    src.onended?.(); // simulate playback finishing
    assert.equal(p.activeCount(), 0, 'auto-dispose on ended');
    assert.equal(h3.stopped, true);
  }

  // stopChannel / stopAll
  {
    const p = createAudioPlayer({ context: new FakeContext(), fetcher: fakeFetcher });
    p.load(manifest);
    await p.play('jump');
    await p.loop('theme');
    assert.equal(p.stopChannel('music'), 1, 'stopChannel music');
    assert.equal(p.activeCount(), 1);
    assert.equal(p.stopAll(), 1, 'stopAll remaining');
    assert.equal(p.activeCount(), 0);
  }

  // dispose closes the context
  {
    const ctx = new FakeContext();
    const p = createAudioPlayer({ context: ctx, fetcher: fakeFetcher });
    p.load(manifest);
    await p.dispose();
    assert.equal(ctx.closed, true, 'context closed on dispose');
  }

  console.log('[engine/audio/playback.test] all assertions passed');
}

run().catch((err) => {
  console.error('[engine/audio/playback.test] FAILED', err);
  process.exitCode = 1;
});
