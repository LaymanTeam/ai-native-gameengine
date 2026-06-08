# All-In Plan - AI-Native Game Engine

This plan expands `docs/PATH-A-PLAN.md` into the full product direction: a prompt-to-game engine
where AI agents generate a complete playable 2D game on top of a reusable runtime SDK.

## North Star

A user describes a game. The system designs it, produces coherent assets, generates a validated
`GameDefinition`, builds any narrow custom logic needed, playtests it, repairs failures, and ships a
playable URL.

The engine is the product. Each generated game is an artifact.

## Product Shape

The finished product should have four visible surfaces:

1. **Studio** - prompt, constraints, references, scope confirmation, progress stream, and final game.
2. **Library** - generated games, versions, verification status, assets, and deploy history.
3. **Inspector** - `GameDefinition`, asset manifest, validation results, playtest traces, and repair log.
4. **Player** - the exported playable game, isolated from the builder surface.

The user-facing story is simple: describe a game, approve direction, watch the engine build, then
play or share the result.

## Core Architecture

### 1. Runtime SDK

Build the engine around a real reusable 2D SDK:

- `engine/ecs/bitecs.ts` for world state, entities, components, and deterministic systems.
- `engine/renderer/pixi-js.ts` for sprites, animation, camera, layers, particles, and text.
- `engine/input/` for keyboard, touch, and gamepad actions.
- `engine/audio/` for music, sound effects, volume, and event-driven playback.
- `engine/runtime/systems/` for movement, collision, combat, enemies, bosses, pickups, upgrades,
  objectives, HUD, VFX, save state, and scene flow.

The AI should not write the engine for each prompt. It should target this SDK.

### 2. GameDefinition Contract

`GameDefinition` is the boundary between AI generation and reliable runtime execution. It should
describe:

- game metadata, theme, palette, camera, and scene list
- player stats, weapons, abilities, controls, and starting state
- enemy roles, waves, spawn rules, boss phases, and attack patterns
- objectives, win/lose rules, score, upgrades, pickups, and progression
- asset keys, sprite sheets, animations, audio refs, fonts, and UI text
- optional custom behavior hooks for mechanics outside the common SDK

The model fills structured data. The loader validates it, binds assets, and runs it.

### 3. Agent Pipeline

The pipeline should be phase-based so each step is bounded, inspectable, and repairable:

1. **Designer** turns the prompt into a bounded GDD and `GameDefinition` draft.
2. **Art director** builds a style bible and asset list from prompt plus references.
3. **Asset producer** generates or fetches sprites, backgrounds, UI art, audio, and fonts.
4. **Image reviewer** scores assets against the style bible and requests bounded retries.
5. **Coder** emits the final `GameDefinition` and minimal custom code only when required.
6. **Logic evaluator** checks rule coherence before runtime execution.
7. **Playtester** drives the game headlessly, records telemetry, and captures screenshots.
8. **Debugger** applies minimal repairs from structured failures.
9. **Deployer** exports and deploys only after verification passes.

The director coordinates phases, but the quality comes from explicit contracts, tools, tests, and
review loops.

### 4. Multimodal Loop

The original idea becomes strongest when the engine reasons over more than text:

- prompt and chat constraints
- image references and style bible
- generated sprite sheets and backgrounds
- browser screenshots and canvas crops
- runtime telemetry, player traces, and failure reports
- asset review scores and repair instructions

Every loop should produce evidence the next agent can use. The system should not rely on vague
"try again" prompts.

## Repository Shape

The repository should make the engine boundary obvious:

```text
engine/
  ai/
    agents/
    pipelines/
    events.ts
    providers.ts
  runtime/
    game-definition.ts
    loader.ts
    systems/
    templates/
  ecs/
  renderer/
  input/
  audio/
  tools/
    visualizers/
    generators/
    fetchers/
  compiler/
  testing/
app/
  studio/
  library/
  inspector/
  play/[id]/
generations/
  info.md
  <game-id>/
```

Generated games should follow `generations/info.md` and remain portable. The engine should be able
to export a generated game into a standalone Vite project.

## Workstreams

### A. Runtime Depth

Goal: one hand-authored `GameDefinition` can produce a polished golden game.

Deliverables:

- ECS component model and system scheduler
- sprite animation and atlas binding
- top-down movement, collision, combat, enemy AI, boss patterns, pickups, upgrades, HUD, VFX
- title, pause, game-over, win, restart, save state
- runtime test hooks for headless playtesting

Acceptance:

- the golden game runs entirely through the SDK
- no per-game engine code is needed for common arena-action games
- systems are individually testable

### B. Contract and Loader

Goal: the AI has a stable target.

Deliverables:

- strict `GameDefinition` schema
- asset manifest schema
- loader from definition plus manifest into runtime world
- schema migration/versioning
- readable validation errors for the repair loop

Acceptance:

- invalid definitions fail with actionable errors
- valid definitions consistently load without manual glue code

### C. Agentic Build Pipeline

Goal: prompts become verified build artifacts.

Deliverables:

- phase graph: design, visual direction, assets, code, verify, deploy
- resumable state per game
- streamed progress events
- human approval gates for scope and visual direction
- bounded retry policies

Acceptance:

- each phase can be run, resumed, inspected, and tested independently
- failures create structured repair tasks instead of raw chat logs

### D. Asset Quality

Goal: generated games use coherent art, not placeholders.

Deliverables:

- style bible
- sprite-sheet prompts with exact frame constraints
- atlas assembly
- asset provenance
- image-review rubric
- retained rejected assets for inspection

Acceptance:

- player, enemies, boss, environment, UI, and pickups share one visual direction
- asset failures are caught before deploy

### E. Verification and Eval

Goal: quality improves through measurement.

Deliverables:

- schema validation
- typecheck and manifest validation
- logic evaluator for win/lose reachability and rule contradictions
- browser playtester with input traces
- screenshot/canvas visual checks
- prompt-set eval harness
- regression dashboard

Acceptance:

- at least 80% of bounded prompts produce playable games without human fixes
- regressions are caught before they reach deploy

### F. Export and Distribution

Goal: generated games are real artifacts.

Deliverables:

- Vite export
- static asset packaging
- deploy gate
- shareable URL
- local download
- version history

Acceptance:

- a verified game can run outside the builder app
- deployments refuse unverified output

## Phased Roadmap

### Phase 0 - Product Reset

Duration: 1-2 days.

- Confirm one target genre for the first golden game.
- Freeze the `GameDefinition` v1 scope.
- Define the prompt eval set.
- Decide the first asset style constraints.

Exit gate: a written spec for the golden game and the v1 definition contract.

### Phase 1 - SDK Foundation

Duration: 1-2 weeks.

- Build ECS, renderer helpers, input, runtime loop, camera, collision, combat, HUD, and scene flow.
- Implement the golden game from a hand-authored definition.
- Add runtime unit tests and browser self-test hooks.

Exit gate: the golden game is playable through the SDK only.

### Phase 2 - Definition-First Generation

Duration: 3-5 days.

- Make the designer/coder produce `GameDefinition` instead of broad freeform code.
- Add schema validation, manifest validation, and repairable error messages.
- Run a small prompt matrix against the loader.

Exit gate: varied prompts validate and run through the same SDK path.

### Phase 3 - Multimodal Asset Loop

Duration: 1-2 weeks.

- Generate style bibles, sprite sheets, backgrounds, UI art, and audio lists.
- Review assets with a rubric.
- Assemble manifests and bind assets in the loader.

Exit gate: generated games render coherent custom art for the core entities.

### Phase 4 - Verify/Repair Flywheel

Duration: 1 week.

- Add logic evaluator, browser playtester, screenshot checks, and bounded debugger retries.
- Store structured failure reports per generated game.
- Require green verification before export/deploy.

Exit gate: the system repairs common generation failures without manual intervention.

### Phase 5 - Product Surface

Duration: 1 week.

- Build Studio, Library, Inspector, and Player routes.
- Show generation phases, approval gates, assets, validation, playtest traces, and versions.
- Keep the first screen focused on generating and playing a game.

Exit gate: a user can create, inspect, play, export, and redeploy a game from the UI.

### Phase 6 - Scale and Quality

Duration: ongoing.

- Expand templates only after the first genre is reliable.
- Add prompt eval dashboards.
- Track cost, latency, pass rate, art score, and gameplay score.
- Tune models, prompts, SDK systems, and repair policies against measured failures.

Exit gate: quality rises through repeatable evals, not one-off demos.

## First Golden Game

The first golden game should be intentionally narrow:

- one camera perspective
- one core movement model
- one combat loop
- three enemy roles
- one boss with three attack patterns
- one upgrade path
- one win condition
- one coherent asset style

It should be polished enough to become the reference every agent can imitate.

## Success Metrics

- 80% of bounded prompts produce playable games with no human fixes.
- 95% of generated definitions pass schema validation after one repair.
- 90% of exported games pass headless smoke tests.
- Asset review score averages above the chosen pass threshold.
- Median prompt-to-playable time is predictable enough for users to wait through.
- Every deployed game has a reproducible build record.

## What To Avoid

- letting models write a new engine from scratch per prompt
- expanding to many genres before one genre is reliable
- treating screenshots as final proof without runtime telemetry
- accepting generated assets without style and sprite-sheet constraints
- deploying output that has not passed verification
- hiding failures in prose instead of structured repair reports

## Next Concrete Step

Start with the SDK-first golden game:

1. Lock `GameDefinition` v1 for one top-down action genre.
2. Build the ECS/runtime systems needed for that single game.
3. Hand-author one polished definition.
4. Make the agent generate only that definition shape.
5. Add eval prompts and measure pass rate before expanding scope.

