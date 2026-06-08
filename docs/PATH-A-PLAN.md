# Path A — Agentic codegen to sophisticated games

Expanded operating plan: `docs/ALL-IN-ORIGINAL-PLAN.md`.

**Goal:** a user prompt → the engine **generates** a polished, sprite-based game (icons, rules,
systems, boss, waves, win/lose) that **actually runs** — at the sophistication level of a
hand-crafted vertical slice, but produced by the AI pipeline.

> We are **not porting** any existing game. The benchmark is a polished playable vertical slice. Path A
> builds our **own** runtime SDK and the AI generates games on top of it.

## The core idea
LLMs are unreliable at writing a whole engine, but reliable at **filling in rules/data and small
logic against a solid toolbox.** So we build that toolbox (the **SDK**), and the AI writes the thin,
game-specific layer on top. **Sophistication = SDK depth × asset quality × codegen reliability.**

Where each piece of a polished generated game comes from:
| Ingredient | Source |
|---|---|
| Sprites / icons / art | Asset pipeline (image model → style bible → sprite atlas) — M4 |
| Rules / mechanics / waves / upgrades | AI fills the `GameDefinition` (design + code) — M1 contract, M2 |
| Heavy systems (movement, combat, boss AI, VFX, HUD) | The **SDK**, written once, reused every game — M1 |
| It actually runs, every time | verify → repair loop — M3 |

## Definition of done (the bar)
A prompt yields a **deployed, running** game with: consistent sprite art, movement + collision +
combat, enemies with behaviors + a boss, waves/progression, HUD, basic VFX/audio, clear win/lose —
and **≥80% of prompts produce a playable result with no human fixes.** Consistency is the target,
not one-off demos.

## Prerequisites (week 0)
- **Gemini billing** (unlocks Pro coder + image models; removes the 20 req/day free cap) — or
  OpenRouter for a strong coder model.
- **`VERCEL_TOKEN`** for the deploy phase.
- A **golden game**: one example game hand-built on our SDK that hits the bar — the in-context
  reference the coder imitates. (Built fresh on our SDK; not a port.)

## Milestones

### M1 — Runtime SDK v1  ⭐ (the foundation; ~70% of the quality)
Build `engine/runtime/` into a real, documented SDK the generated game targets:
- **`GameDefinition` contract** (`engine/runtime/game-definition.ts`) — the typed, Zod-validated
  shape the AI fills: meta, palette, assets (sprite/icon refs), player + weapons, enemies (sprite +
  behavior), boss + patterns, waves, upgrades, arena/scenes, HUD, controls, win/lose.
- **Renderer** (`engine/renderer/pixi-js`, started) — sprite/animation/camera/text helpers.
- **ECS** (`engine/ecs/bitecs`) — world + standard components (position, velocity, health, sprite,
  collider, ai, lifetime).
- **Systems library** (`engine/runtime/systems/`) — movement, collision, combat/damage,
  spawn/waves, enemy AI (chaser/charger/shooter/brute), boss patterns, pickups/XP, upgrades, HUD,
  VFX, audio, input. Each is a pure, typed, individually-testable module.
- **Loader** — turns a validated `GameDefinition` (+ asset manifest) into a running game via the
  SDK (no per-game engine code required for the common case).
- **Acceptance:** a hand-written `GameDefinition` produces the golden game using only the SDK.

### M2 — Coder targets the SDK
- The coder agent emits a `GameDefinition` (+ minimal custom system code for novel mechanics)
  against the SDK, with the golden game in context; the existing typecheck loop bounds the surface.
- **Acceptance:** from a GDD, the coder emits a definition that validates, typechecks, and runs
  across N varied test prompts.

### M3 — Verify / repair flywheel (reliability)
- `verify_game` gates (exist): schema/typecheck → manifest bind → logic-evaluator (rules coherent)
  → **playtester** (headless: player moves, enemies spawn, win/lose reachable, no NaN/errors, fps).
- `debugger` repair loop on failures, bounded retries; clean escalation to the user.
- **Acceptance:** ≥80% of prompts pass verify without human help.

### M4 — Asset pipeline → real art
- `set_visual_direction` → style bible (palette, resolution, perspective, outline rules) prepended
  to every image prompt. `produce_assets` → sprite gen (image model) + image-reviewer loop →
  assemble a **sprite atlas + asset-manifest**; the loader binds manifest keys to entities.
- **Acceptance:** generated games use consistent generated sprites/icons, not shapes.

### M5 — Deploy + polish
- `game-scaffold` → `vite-creator` → `vercel-deploy` → shareable URL (refuses unverified).
- Audio (sfx/music fetchers), fonts, juice (screenshake/particles), title/game-over screens.
- **Acceptance:** prompt → deployed, polished, playable URL.

### M6 — Eval harness (the quality engine)
- Batch-run a prompt set; score each (runs? playable? on-theme? art quality via LLM judge); track
  regressions across prompt/model/SDK changes. This loop is how quality climbs over time.

## Risks → mitigations
- **Generated code won't run reliably** → strong SDK + golden example + verify/repair (the whole strategy).
- **Cost/latency** (~minutes + $ per game) → phase-by-phase turns, prompt caching, scope bounds, cheaper models where possible.
- **Art inconsistency** → style bible on every image prompt + review loop.
- **Per-game scope creep** → the bounded GDD (one core mechanic, 1–3 scenes) already enforces this.

## What already exists (not starting from zero)
Wired/started in `engine/`: `coder`, `playtester`, `debugger`, `verify`/gates, `produce_assets`,
asset fetchers, `pixi-js` helpers, `asset-manifest`, `vite-creator`, `vercel-deploy`. The skeleton
is there; the gap is **SDK depth (M1)**, **reliability tuning (M3)**, and **assets (M4)**.

## Rough timeline (1 focused dev, models unblocked)
- M1 SDK: **1–2 weeks** (it's a real engine)
- M2 coder-on-SDK: ~3–5 days · M3 to 80%: ~1 week · M4 art: ~1 week · M5 deploy/polish: ~3–5 days · M6 eval: ongoing
- **First consistently sophisticated output: ~4–6 weeks.** A rough/inconsistent version much sooner (~2 weeks).

**Start at M1 — the SDK is where the quality lives.** First concrete deliverable:
`engine/runtime/game-definition.ts` (the contract) + the `engine/runtime/systems/` structure.
