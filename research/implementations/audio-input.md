# Implementation: `engine/audio/playback.ts` + `engine/input/controller.ts`

The two runtime layers that drive a generated game's sound and input. Both are framework-native
(Web Audio / DOM + Gamepad API) — **no research doc**; both dependency-inject their browser
surface so they run headlessly in tests and the playtester.

---

## `engine/audio/playback.ts`

Web-Audio playback keyed by the asset-manifest `config/` bindings, plays `assets/sfx/` and
`assets/music/`. Per-voice gain → channel bus (sfx/music) → master gain → destination. The module
never touches a global `AudioContext`; it is passed an `AudioContextLike`.

**Deps:** `zod` (+ injected `AudioContextLike`, optional `AudioFetcher` defaulting to `fetch`).

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `AudioManifestEntrySchema` / `AudioManifestEntry` | zod / type | `{ key, url, kind: 'sfx'\|'music', gain?, loop? }`. |
| `AudioManifestSchema` / `AudioManifest` | zod / type | `AudioManifestEntry[]`. |
| `AudioChannel` | `'sfx' \| 'music'` | Channel classifier. |
| `AudioGainNodeLike`, `AudioDestinationNodeLike`, `AudioBufferSourceLike`, `AudioBufferLike`, `AudioContextLike` | interfaces | Minimal structural slices of the Web Audio nodes used. |
| `AudioFetcher` | `(url: string) => Promise<ArrayBuffer>` | Injectable byte loader. |
| `AudioPlaybackOptions` | interface | `{ context, fetcher?, masterVolume?, sfxVolume?, musicVolume? }`. |
| `PlayOptions` | interface | `{ loop?, gain? }`. |
| `PlaybackHandle` | interface | `{ id, key, channel, stop(), stopped }`. |
| `AudioPlayer` | class | The player (methods below). |
| `createAudioPlayer(opts)` | `(AudioPlaybackOptions) => AudioPlayer` | Provider-style factory. |

`AudioPlayer`: `load(manifest: unknown): void` (Zod-validated, replaces by key), `keys(): string[]`,
`preload(key): Promise<void>`, `preloadAll(): Promise<void>`, `play(key, opts?): Promise<PlaybackHandle>`,
`loop(key, opts?): Promise<PlaybackHandle>`, `stop(key): number`, `stopChannel(channel): number`,
`stopAll(): number`, `setMasterVolume(v): void`, `setChannelVolume(channel, v): void`,
`getMasterVolume(): number`, `getChannelVolume(channel): number`, `activeCount(key?): number`,
`dispose(): Promise<void>`.

### Design notes
- Loop default: `opts.loop ?? entry.loop ?? channel === 'music'` (music loops by default, sfx not).
- Voice gain = `clamp01(assetGain * playGain)`; all volumes clamped 0..1.
- A `suspended` context (autoplay policy) is best-effort `resume()`d on first `play`; `onended`
  auto-disposes the voice. Decoding is lazy on first `play` unless `preload`/`preloadAll` is called.

### Usage
```ts
import { createAudioPlayer } from '@/engine/audio/playback';
const audio = createAudioPlayer({ context: new AudioContext() });
audio.load([{ key: 'jump', url: 'assets/sfx/jump.wav', kind: 'sfx' },
            { key: 'theme', url: 'assets/music/theme.mp3', kind: 'music' }]);
const music = await audio.loop('theme');
await audio.play('jump', { gain: 0.8 });
audio.setChannelVolume('music', 0.5);
```

---

## `engine/input/controller.ts`

Keyboard + touch + gamepad mapped to a typed action set the game's systems query each tick. The
playtester drives the same action set headlessly via `inject`/`injectAxis`/`tap` without any DOM.

**Deps:** `zod` (+ injected `EventSourceLike` / `GamepadProviderLike`).

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `ActionBindingSchema` / `ActionBinding` | zod / type | `{ keyboard?: string[]; gamepadButtons?: number[]; touchZones?: string[] }` (`KeyboardEvent.code` values). |
| `ActionMapSchema` / `ActionMap` | zod / type | `Record<string, ActionBinding>`. |
| `ActionState` | interface | `{ active, pressed, released, value }`. |
| `EventSourceLike`, `GamepadProviderLike`, `GamepadLike` | interfaces | Structural DOM/Gamepad slices. |
| `ControllerOptions` | interface | `{ bindings, keyboardSource?, touchSource?, gamepadProvider?, gamepadDeadzone? }`. |
| `Controller` | class | The controller (methods below). |
| `createController(opts)` | `(ControllerOptions) => Controller` | Provider-style factory. |

`Controller`: `actionNames(): string[]`, `attach(): void`, `detach(): void`,
`inject(action, down): void`, `injectAxis(action, value): void`, `tap(action): void`,
`poll(): void`, `getAction(action): ActionState`, `isActive(action): boolean`,
`isPressed(action): boolean`, `isReleased(action): boolean`, `getValue(action): number`,
`snapshot(): Record<string, ActionState>`, `endFrame(): void`, `reset(): void`.

### Design notes
- Per-tick contract: `poll()` (samples gamepad + aggregates all sources, derives pressed/released
  edges) → query → `endFrame()`. One-shot `tap()` and `injectAxis()` values are consumed by a
  single poll; clearing them at the END of `poll` (not the start) is load-bearing — clearing first
  would wipe `injectAxis` before it is read, breaking the playtester's analog path.
- Gamepad axis/button magnitude below `gamepadDeadzone` (default 0.15) counts as zero (stick drift
  guard). Digital sources are keyed `source:id` so multiple devices coexist.

### Usage
```ts
import { createController } from '@/engine/input/controller';
const ctrl = createController({
  bindings: { jump: { keyboard: ['Space'], gamepadButtons: [0] }, left: { keyboard: ['ArrowLeft'] } },
  keyboardSource: window, gamepadProvider: navigator,
});
ctrl.attach();
function tick() { ctrl.poll(); if (ctrl.isPressed('jump')) {/* ... */} ctrl.endFrame(); requestAnimationFrame(tick); }
// playtester: ctrl.tap('jump'); ctrl.poll(); assert(ctrl.isPressed('jump'));
```

---

## Tests
- `engine/audio/playback.test.ts` — `npx tsx engine/audio/playback.test.ts` (fake AudioContext +
  injected fetcher, offline).
- `engine/input/controller.test.ts` — `npx tsx engine/input/controller.test.ts` (`node:assert/strict`,
  fake event sources / gamepad provider, offline).
