# Runtime SDK (Path A — M1)

The reusable game runtime the AI-generated games target. The AI fills a **`GameDefinition`**
(data + sprite references + behavior selections); the SDK's systems do the heavy lifting. See
`docs/PATH-A-PLAN.md` for the full plan.

> The AI writes the *thin* game-specific layer. The SDK is the toolbox. Reliability and
> sophistication come from the SDK being deep, not from the model writing an engine.

## Contract
- **`game-definition.ts`** — the Zod-validated `GameDefinition` the coder produces and the loader
  consumes (palette, runtime template, assets with optional bounded sprite-sheet metadata and named animation clips, player+weapons, enemies, boss+patterns, waves, upgrades, arena,
  optional puzzle-room grid data, optional decision-room boardroom data, optional agent-dashboard operations data, named feel profile/playstyle knobs, win/lose, optional score/relic/capture/escort/defend/repair/extract/rescue/unlock/solve-puzzle/select-decision/approve-deploy targets). `parseGameDefinition()` validates model output. ✅ drafted.

## Runtime decision: Phaser as the SDK ✅
Rather than hand-build an ECS + systems library, the runtime uses **Phaser 3** (mature 2D engine:
arcade physics, real collisions, tweens, input, scenes) — adopting hackathon2's key insight. This
collapses most of M1: the deep "systems" already exist in Phaser; we write a thin, data-driven
loader that turns a `GameDefinition` into a running game.

- **`phaser/forge-game.ts`** — `createForgeGame(parent, definition)`: a Phaser scene that reads the
  `GameDefinition` and runs the game. Implements: runtime template selection (`arena-action`, a side-view `flight-shooter`, a side-view `platformer` with gravity/jump/ledge colliders, a top-down `puzzle-room` with grid stepping, pushable blocks, switches, gems, hazards, move limits, and exit solving, a `decision-room` boardroom with stakeholders, evidence, options, recommendation, audit trail, and select-to-commit flow, or an `agent-dashboard` operations cockpit with agent status, task queues, approval gates, logs, metrics, deployment health, and approve-to-ship flow), WASD/arrow movement, mobile virtual-stick/action
  controls, named feel profiles layered over playStyle for reference-targeted pressure/cadence/objective/boss pacing,
  auto-fire weapons, enemy AI by role (chaser/shooter/sniper/sapper/support/guardian/sentinel/charger/orbiter/wanderer/brute), timed waves with
  deterministic elite variants (swift/armored/volatile), XP
  pickups with magnet support, objective pickups for score-target/survive/collect-relics variants, a hold-to-capture zone objective, an escort ally route objective, a defend-core objective with core health/progress, a repair-nodes objective with multi-point hold progress, an extraction-gate hold objective with contested progress, a rescue objective with survivor stabilization plus extraction progress, an unlock-gate objective with access-key collection plus exit hold progress, interactive
  level-up upgrade choices, a timed kill-combo score multiplier with HUD/FX feedback, a boss with attack patterns
  (radial burst / spiral / charge / summon / beam / minefield / vortex / shockwave / laser-grid) and pattern-specific warning telegraphs, HUD (HP/score/level/timer/objective), win conditions (defeat-boss /
  survive / clear-waves / score-target / collect-relics / capture-zone / escort / defend-core / repair-nodes / extract / rescue / unlock-gate / solve-puzzle / select-decision / approve-deploy), lose, restart (R), asset-key texture binding with
  procedural fallbacks, sprite-sheet loading/state-aware named clip frame stepping for actor assets, and runtime polish effects (shadows, facing, dash trails, hit sparks,
  actor-state animation accents, procedural actor rig overlays, boss transition rig telegraphs, impact camera shake, telegraphed wave spawns, enemy health readouts, floating damage numbers,
  damage flashes, objective guidance markers for static goals and live pickups, and late-run telegraphed arena hazards). Arena
  rendering now includes deterministic theme-aware room dressing: corner rooms, lane glow, central landmarks,
  prompt-themed props, non-colliding combat-pocket anchors, foreground edge fixtures, and pulsing
  lights, plus flight lane/starboard pressure dressing for sky/airplane prompts and platform ledge dressing for jump/castle prompts, subtle ambient motion layers, profile-specific screen framing/animation beats, and profile-aware camera director framing that
  improve the first-read room feel without changing collision/balance.
  Client-only (dynamic-import in the browser). ✅
- **`local-generator.ts`** — `buildLocalGameDefinition(prompt)`: keyless themed definition so the
  runtime works with no API key. It now selects different objective templates from the prompt:
  defeat-boss, survive, clear-waves, score-target, collect-relics, capture-zone, escort, defend-core, repair-nodes, extract, rescue, unlock-gate, solve-puzzle, select-decision, or approve-deploy.
  It also selects `runtimeTemplate: "flight-shooter"` for airplane/jet/sky/dogfight prompts, `runtimeTemplate: "platformer"` for platform/jump/ledge/castle/side-view prompts, `runtimeTemplate: "puzzle-room"` for puzzle/maze/switch/block/mirror prompts, `runtimeTemplate: "decision-room"` for decision/boardroom/strategy/stakeholder/evidence/recommendation/audit/options/launch/roadmap prompts, `runtimeTemplate: "agent-dashboard"` for agent/ops/queue/approval/deploy/Vercel/MCP/CLI/dashboard prompts, and keeps
  `runtimeTemplate: "arena-action"` for the default top-down action family.
  It also authors profile-specific enemy role kits and wave schedules, e.g. chaser/sapper/shooter
  area denial for arcade-survivor prompts, shooter/orbiter/sniper crossfire for raid prompts,
  sturdier brute/guardian/support protected-sustain pressure for siege prompts, gentler roaming pressure for cozy prompts, and
  charger/sentinel/sniper scoring lanes for score-chaser prompts. Actor assets now
  declare eight-frame horizontal sheets with named clips for idle, move, attack/fire, dash/hurt,
  boss telegraph/execute, and objective contested states. Boss prompts select pattern kits from
  radial/spiral, charge, summon, beam, minefield area-denial, vortex pull-field, shockwave ring-pressure, and laser-grid lane-lock behaviors. ✅
- **`definition-generator.ts`** — prompt → validated `GameDefinition` boundary. Uses structured
  model output when available, falls back to the local generator keylessly, and rejects definitions
  whose sprite/tile references do not exist in `assets[]`. ✅
- **`local-asset-sources.ts`** — deterministic source-backed SVG/SVG-sprite-sheet asset fill for keyless/model
  definitions that do not yet have reviewed image-generation output, with shaded role-specific
  sprites, prompt-mood decals, and shaded floor tiles. Existing real `src` values are preserved. ✅
- **`asset-plan.ts`** — bridge from `GameDefinition.assets[]` to a reviewed image-production plan.
  It emits runtime-specific sprite/background prompts for the asset pipeline, including transparent
  actor sprite-sheet constraints and named clip maps when `assets[].spriteSheet` is present, single-sprite constraints otherwise, seamless floor-tile constraints, palette anchors, and can attach
  approved produced asset paths back onto `assets[].src` as `runtime:` references. ✅
- **`asset-production.ts`** — server-only Forge adapter for the reviewed asset pipeline. It
  synthesizes a runtime style bible, runs image generation/review into a batch workspace, publishes
  approved PNGs under `public/runtime/forge/<batch>/`, retains rejected images under
  `public/runtime/forge/<batch>/review/`, writes `asset-production.json`, can promote a retained
  review image into the approved runtime path, can retry one rejected asset using review feedback,
  prunes old retained batches with a keep-latest retention policy, and returns definitions/refs
  with approved `runtime:` sources attached. ✅
  The runtime asset prompts/style bible now explicitly require usable Phaser sprite sheets: exact
  equal-width contact-sheet cells, one horizontal row, no gutters/grid/labels, consistent actor
  scale/facing/center point, no baked actor shadows, and floor tiles without unique landmarks or
  vignettes. ✅
- **`standalone-publisher.ts`** — server-only export/deploy bridge for generated Forge runtime
  games. It validates a `GameDefinition`, scaffolds a Vite/Phaser project under
  `generations/forge-runtime/`, copies the runtime source and referenced `runtime:` assets into the
  project, embeds the definition as the playable entry point, and can call the Vercel deployer when
  explicitly requested with `VERCEL_TOKEN` configured. `npm run test:standalone` exports a temporary
  project and runs a production Vite build to prove the standalone package compiles. `npm run
  test:deploy-route` exercises the live Next `/api/forge/definition` -> `/api/forge/deploy` export
  path and cleans up its generated project; `DEPLOY_SMOKE_DEPLOY=1` additionally probes `deploy:true`. ✅
- Frontend: `engine/frontend/components/PhaserGame.tsx` mounts it; **`/forge`** page = prompt →
  local demo `GameDefinition` by default, or `/api/forge/definition` /
  `/api/forge/definition/stream` when opened with `?gemini=1`, `?model=1`, or `?source=model` →
  play in-app, including
  planned/approved production asset status and an opt-in reviewed-art path with streaming
  generation/review progress, batch manifest, review-queue links, and explicit Export/Deploy
  actions for standalone generated games. The page now exposes a concrete first-game vertical slice
  preset (`engine/runtime/first-game.ts`): a bakery portal raid that stays on the prompt →
  `GameDefinition` → Phaser path while proving a boss-backed arena target. ✅
  This keeps the public demo no-spend/no-model by default while preserving the Gemini generation
  path for local clones or private demos with `GOOGLE_API_KEY` configured. Server routes also default
  to local generation unless `FORGE_MODEL_API_ENABLED=1` is set; use that flag plus `?gemini=1`
  when intentionally exercising Gemini. ✅
  Reviewed art is server-gated by `/api/forge/assets/capability`; the switch is available when
  `GOOGLE_API_KEY` is configured, and default-on behavior requires `FORGE_REVIEWED_ART_DEFAULT=true`
  so quota/quality validation can stay explicit. ✅
  Review queue entries can be accepted in-place, which updates the live `GameDefinition` source and
  remounts the Phaser preview with the accepted art. They can also be retried; passing retries patch
  the live preview, while failing retries replace the retained review image. Reviewed-art summaries
  also expose a cleanup action for old retained batches. `npm run test:reviewed-art-route` checks the
  live capability route, keyless SSE stream, accept/retry validation, and cleanup dry-run without
  spending image quota; `REVIEWED_ART_SMOKE_PRODUCE=1` opts into real reviewed-art generation. ✅
- Browser QA: `npm run test:browser` drives `/forge?play&selftest=1` in headless Chrome across
  desktop/tablet/mobile viewports and checks scene flow, test actions, asset-key binding,
  source-backed texture loading, state-aware sprite-sheet clip telemetry, mobile touch-control presence, live canvas pixel quality,
  frame-to-frame canvas motion,
  responsive layout fit, saved play screenshots with coarse visual-detail metrics, a canvas-crop
  visual-detail gate that isolates the Phaser scene from the surrounding UI, arena dressing anchor
  presence, ambient room motion presence, profile-specific framing presence, profile camera-director presence, profile-specific enemy/wave composition, sniper/sapper/support/guardian/sentinel behavior-state coverage, sapper mine telegraph visibility, support pulse visibility, guardian shield visibility, sentinel lane-burst visibility, elite enemy visibility, arena hazard telegraph visibility,
  objective-pickup visibility/reward checks for score-target, survive, and collect-relics prompts,
  objective guidance marker checks, capture-zone visibility/progress checks, escort ally visibility/progress checks, defend-core visibility/progress checks, repair-node visibility/progress checks, extraction-gate visibility/progress checks, rescue survivor stabilization/extraction checks, unlock-gate key/gate progress checks, puzzle-room grid/gem/block/switch/exit checks, decision-room boardroom/option/evidence/stakeholder/recommendation checks, agent-dashboard cockpit/approval/task/health checks, and conditional
  boss pattern telegraph visibility for boss-backed prompts. `npm run test:visual` serializes a
  focused boss/beam-boss/laser-grid-boss/charge-boss/summon-boss/minefield-boss/vortex-boss/shockwave-boss/flight/platformer/puzzle/decision-room/agent-dashboard/score/survive/relic/capture/escort/defend/repair/extract/rescue/unlock prompt matrix, crops each Phaser canvas from the
  screenshots, builds 48x27 RGB signatures, and fails on near-duplicate or low-average visual
  diversity while writing canvas crop PNGs, a baseline-ready `visual-matrix.json` manifest, local/model
  visual-review scores, and a `visual-review.html` contact sheet for human review. The same runner can
  compare against a prior manifest with `VISUAL_MATRIX_BASELINE=<path>` to fail same-scenario perceptual
  drift beyond `VISUAL_MATRIX_MAX_BASELINE_DISTANCE`, and `VISUAL_MATRIX_BASELINE_OUT=<path>` writes a
  curated signature-only baseline snapshot after a passing run. Focused runs can use
  `VISUAL_MATRIX_SCENARIOS=id,objective`; scenario filters match exact ids/objectives by default, and
  `VISUAL_MATRIX_SCENARIO_MATCH=fuzzy` restores substring matching for intentionally broad groups. The
  first-game bakery slice is available as an exact opt-in visual scenario with
  `VISUAL_MATRIX_SCENARIOS=first-game-tablet`; it is excluded from the default broad diversity matrix
  because it intentionally overlaps the bakery summoner baseline. ✅

## How the coder targets it (M2)
Given the GDD, the coder/director produces a `GameDefinition` (validated by `parseGameDefinition`)
— pure structured data, far more reliable than freeform code. Novel mechanics can later extend the
runtime with custom Phaser behavior. The local generator is the keyless fallback.

## Next
- [x] `game-definition.ts` contract
- [x] Phaser data-driven runtime (`createForgeGame`) + local generator + `/forge`
- [x] Add prompt/API boundary that emits `GameDefinition` with keyless fallback
- [x] Bind `assets[]` keys/optional `src` to Phaser textures with procedural fallbacks
- [x] Keyless/model fallback fills `assets[].src` with deterministic mood-aware SVG sprites/tiles
- [x] Add asset-plan bridge for replacing fallback image sources with reviewed generated output
- [x] Wire opt-in reviewed asset production into the Forge definition API/UI
- [x] Retain reviewed-art batch manifests and rejected-image review artifacts
- [x] Add human-review accept action for retained rejected images
- [x] Add human-review retry/regenerate action for retained rejected images
- [x] Add reviewed-art batch cleanup/retention policy
- [x] Add streaming progress for reviewed-art generation/review
- [x] Gate reviewed art from server capability with explicit default-on flag
- [x] Add live reviewed-art route smoke coverage without spending image quota
- [x] Strengthen generated sprite/tile prompts for runtime usability
- [x] Runtime + local generator support multiple objective templates, including score-target, collect-relics, capture-zone, escort, defend-core, repair-nodes, extract, rescue, and unlock-gate
- [x] Add runtime-template selection with a keyless side-view flight-shooter path
- [x] Add runtime-template selection with a keyless top-down puzzle-room path
- [x] Add runtime-template selection with a keyless decision-room boardroom path
- [x] Add runtime-template selection with a keyless agent-dashboard operations cockpit path
- [x] Add objective-specific pickup director for score caches, survive supply beacons, and relic shards
- [x] Add hold-to-capture zone objective with HUD/progress state and browser-test coverage
- [x] Add escort ally route objective with HUD/progress state and browser-test coverage
- [x] Add defend-core objective with HUD/progress/health state and browser-test coverage
- [x] Add repair-node objective with HUD/progress state and browser-test coverage
- [x] Add extraction-gate objective with HUD/progress/contested state and browser-test coverage
- [x] Add rescue survivor objective with stabilization, escort-to-extract phase, HUD/progress/health state, and browser-test coverage
- [x] Add unlock-gate objective with access-key pickups, exit-hold phase, HUD/progress state, and browser-test coverage
- [x] Add richer theme-aware arena room dressing and landmarks
- [x] Add non-colliding combat-pocket anchors and browser-test coverage for room dressing presence
- [x] Add mood-aware ambient room motion and browser-test coverage for animation-layer presence
- [x] Add temporal canvas-motion browser QA so animated scenes cannot regress to static images
- [x] Add non-colliding foreground set dressing, pulsing edge lights, and impact camera shake
- [x] Add interactive level-up upgrade choices and XP pickup magnet support
- [x] Add timed kill-combo rewards with HUD/FX feedback and browser-test coverage
- [x] Add objective guidance markers for static goals/pickups with browser-test coverage
- [x] Add mobile virtual-stick/action controls inherited by generated games
- [x] Add readable combat feedback with enemy health readouts and damage numbers
- [x] Add deterministic elite enemy variants with visible tells and browser-test coverage
- [x] Add late-run telegraphed arena hazards with browser-test coverage
- [x] Add telegraphed wave/boss spawns with pending-spawn objective tracking
- [x] Add pattern-specific boss attack telegraphs and browser-test hooks
- [x] Add named feel profiles for reference-targeted wave pressure, weapon cadence, upgrade economy, boss pacing, and objective tempo
- [x] Add profile-specific screen framing and animation beat tuning with browser-test telemetry
- [x] Add actor-state animation accents for player/enemy roles with browser-test telemetry
- [x] Add sniper long-range enemy role with profile wave routing, local SVG fallback, behavior-state telemetry, and browser-test coverage
- [x] Add sapper area-denial enemy role with profile wave routing, local SVG fallback, mine telegraph, behavior-state telemetry, and browser-test coverage
- [x] Add support/healer enemy role with siege profile routing, SVG fallback, healing pulse behavior, and browser/visual coverage
- [x] Add guardian/shield enemy role with siege profile routing, SVG fallback, ally shield behavior, and browser/visual coverage
- [x] Add sentinel/lane-lock enemy role with score profile routing, SVG fallback, burst-lane behavior, and browser coverage
- [x] Add profile-aware camera director framing and tiny pressure zoom with browser-test telemetry
- [x] Add procedural actor rig overlays and boss transition telemetry with browser-test coverage
- [x] Add bounded actor sprite-sheet metadata, local SVG sheet fallbacks, runtime frame stepping, and browser-test telemetry
- [x] Add state-aware sprite-sheet animation clips, reviewed-art clip prompts, and browser-test telemetry for active clips
- [x] Harden reviewed-art sprite-sheet/tile prompts for Phaser contact-sheet alignment and runtime mountability
- [x] Add minefield area-denial boss pattern with prompt routing, telegraph/execution, and visual-matrix coverage
- [x] Add vortex pull-field boss pattern with prompt routing, telegraph/execution, and visual-matrix coverage
- [x] Add shockwave ring-pressure boss pattern with prompt routing, telegraph/execution, and visual-matrix coverage
- [x] Add laser-grid lane-lock boss pattern with prompt routing, telegraph/execution, and visual-matrix coverage
- [x] Browser runtime gate covers desktop/tablet/mobile layout, canvas quality, screenshot
      visual-detail metrics, and canvas-crop visual-detail metrics
- [x] Add focused visual-matrix browser QA with canvas-crop perceptual signatures, review manifest, and HTML contact sheet
- [x] Add optional visual-matrix baseline comparison for same-scenario perceptual drift
- [x] Add local/model visual-review scoring over saved visual-matrix canvas crops plus curated baseline output
- [x] Add standalone generated-game export/deploy bridge and Vite build verifier for GameDefinition-backed Phaser builds
- [x] Add live Next route smoke coverage for `/api/forge/deploy` export preparation
- [x] Add first-game vertical-slice preset and browser proof for a bakery portal raid
- [x] Add exact visual-matrix coverage for the first-game bakery slice
- [x] Add first-game boss threat UI and player/pickup contrast polish
- [ ] Re-run reviewed generated art after API quota is available and tune generated output quality
- [ ] Validate real token-backed Vercel deployment for standalone exported games
