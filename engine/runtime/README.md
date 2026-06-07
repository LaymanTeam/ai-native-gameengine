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

## Runtime decision: Phaser as the SDK ✅
Rather than hand-build an ECS + systems library, the runtime uses **Phaser 3** (mature 2D engine:
arcade physics, real collisions, tweens, input, scenes) — adopting hackathon2's key insight. This
collapses most of M1: the deep "systems" already exist in Phaser; we write a thin, data-driven
loader that turns a `GameDefinition` into a running game.

- **`phaser/forge-game.ts`** — `createForgeGame(parent, definition)`: a Phaser scene that reads the
  `GameDefinition` and runs the game. Implements: WASD/arrow movement, auto-fire weapons, enemy AI
  by role (chaser/shooter/charger/brute), timed waves, XP pickups → level-up upgrades, a boss with
  attack patterns (radial burst / spiral), HUD (HP/score/level/timer), win (defeat-boss/survive) /
  lose, restart (R). Client-only (dynamic-import in the browser). ✅
- **`local-generator.ts`** — `buildLocalGameDefinition(prompt)`: keyless themed definition so the
  runtime works with no API key. ✅
- Frontend: `engine/frontend/components/PhaserGame.tsx` mounts it; **`/forge`** page = prompt →
  generate definition → play in-app. ✅

## How the coder targets it (M2)
Given the GDD, the coder/director produces a `GameDefinition` (validated by `parseGameDefinition`)
— pure structured data, far more reliable than freeform code. Novel mechanics can later extend the
runtime with custom Phaser behavior. The local generator is the keyless fallback.

## Next
- [x] `game-definition.ts` contract
- [x] Phaser data-driven runtime (`createForgeGame`) + local generator + `/forge`
- [ ] Wire the director/coder to emit `GameDefinition` (replace local generator on the key path)
- [ ] Asset pipeline → generated sprites bound to `assets[]` keys (replaces shape textures)
- [ ] Deploy generated games (scaffold the Phaser build → Vercel)
