# Runtime SDK (Path A — M1)

The reusable game runtime the AI-generated games target. The AI fills a **`GameDefinition`**
(data + sprite references + behavior selections); the SDK's systems do the heavy lifting. See
`docs/PATH-A-PLAN.md` for the full plan.

> The AI writes the *thin* game-specific layer. The SDK is the toolbox. Reliability and
> sophistication come from the SDK being deep, not from the model writing an engine.

## Contract
- **`game-definition.ts`** — the Zod-validated `GameDefinition` the coder produces and the loader
  consumes (palette, assets, player+weapons, enemies, boss+patterns, waves, upgrades, arena,
  win/lose). `parseGameDefinition()` validates model output. ✅ drafted.

## Loader (to build)
- **`loader.ts`** — `mountGame(target, definition, assets)`: validates the definition, wires the
  ECS world + systems + renderer, binds asset-manifest keys to sprites, runs the loop. The common
  case needs **no per-game engine code** — only a `GameDefinition`.

## Systems library — `engine/runtime/systems/` (to build)
Each: pure where possible, typed, individually testable. The AI never rewrites these.

| System | Responsibility |
|---|---|
| `movement` | input/AI velocity → position; bounds, knockback |
| `collision` | circle/AABB broadphase; player↔enemy, shot↔enemy, player↔pickup |
| `combat` | weapons, projectiles, damage, i-frames, death → drops |
| `spawn` | wave scheduling from `waves[]`; difficulty ramp |
| `ai` | enemy roles: chaser / charger / shooter / brute / orbiter |
| `boss` | timed attack patterns: spiral-shot / radial-burst / charge / summon / beam |
| `pickups` | XP / health / magnet; level-up trigger |
| `upgrades` | apply `upgrades[]` on level-up; selection UI hook |
| `hud` | health, score, timer, wave, boss bar |
| `vfx` | hit flashes, particles, screenshake, death poofs |
| `audio` | sfx/music playback keyed to events (uses `engine/audio`) |
| `render` | sprite draw, animation frames, camera, z-order (uses `engine/renderer/pixi-js`) |

## How the coder targets it (M2)
Given the GDD, the coder emits a `GameDefinition` (validated by `parseGameDefinition`) with the
**golden game** as in-context example. Novel mechanics may add a small custom system module; the
typecheck loop bounds it. Everything else is data.

## Golden game (to build)
One hand-authored `GameDefinition` (+ a hand-made sprite atlas) that hits the quality bar using
ONLY the SDK — the reference the coder imitates and the SDK's acceptance test for M1.

## Status
- [x] `game-definition.ts` contract
- [ ] systems library
- [ ] loader
- [ ] golden game + atlas
