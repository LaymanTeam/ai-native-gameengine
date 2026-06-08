# ai-native-gameengine

Prototype AI-native game engine demo: a prompt-shaped `GameDefinition` drives the Forge runtime
with movement, combat, waves, upgrades, boss patterns, win/lose states, standalone export, and
browser QA.

This is a prototype vertical slice, not a claim that the system one-shots a polished game from
scratch. The engine is reusable; the AI generates bounded game data for that engine to validate,
run, test, and export.

## Public Demo

The hosted demo is intentionally **no-spend**:

- Open `/forge?play`.
- The page renders a frozen bakery portal raid prototype from the deterministic local generator.
- The game auto-enters a staged boss encounter so reviewers immediately see enemies, boss pressure,
  and the bakery portal arena instead of a blank/title state.
- Visitors do not need an API key.
- The public deploy should not include `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, or `FORGE_MODEL_API_ENABLED=1`.

This is deliberate. The deployed URL is a playable demo output for reviewers. It does not spend the
owner's model quota when people open or share the link.

## How To Read The Surfaces

- `Core` (`/demo`) is the instant runtime sandbox: local `GameSpec` -> small playable loop. It proves
  the core engine path is interactive and keyless.
- `Forge builder` (`/forge`) is the AI-native build surface: prompt -> `GameDefinition` -> richer
  runtime, reviewed-art hooks, export, and deploy packaging.
- `Bakery prototype` (`/forge?play`) is the submitted public vertical slice: one generated output
  frozen so reviewers can play it without triggering paid API calls.

The intended story is: the core engine is reusable, Forge is the builder/workshop, and the bakery
prototype is one polished output from that engine path.

## Suggested Submission Framing

This is an AI-native game engine prototype. The submitted bakery demo is a curated vertical slice:
the game is represented as a structured `GameDefinition`, and the reusable runtime turns that data
into playable mechanics, UI, tests, and exportable output.

It is not positioned as a one-shot system that creates a finished game from the ground up. The
engine can make games in this style, but polished results take iteration, model tokens, reviewed
assets, and runtime tuning. The public URL is frozen to avoid charging the project owner; people can
clone the repo and add their own Gemini key to try live generation.

## Multimodal Vision

The long-term goal is not endless manual iteration. The intended system is a multimodal conductor
that coordinates specialist agents:

- a game designer agent shaping mechanics, objectives, pacing, and feel
- an art director agent reviewing references, screenshots, sprite sheets, and generated assets
- an engineer agent turning the structured definition into runnable systems
- a QA/playtest agent using browser state, screenshots, and runtime telemetry to find regressions
- a deploy agent packaging, verifying, and publishing the playable output

Those agents would use text, images, generated assets, browser screenshots, runtime telemetry, and
playtest results as shared evidence. The conductor keeps the loop bounded: propose, build, inspect,
fix, and ship. The bakery prototype is a frozen example of where that loop can land; the repo shows
the runtime contract and early agent/tooling path for making the loop faster.

## Prototype Scope

What this demo is:

- a playable proof that AI-shaped structured game data can drive a reusable game runtime
- a curated first-game vertical slice with bakery art, enemies, boss pressure, upgrades, and tests
- a repo people can clone to run deterministic local generation or try Gemini with their own key

What this demo is not yet:

- a fully polished commercial game
- a from-scratch engine generated uniquely for each prompt
- a guarantee that any arbitrary prompt produces art at the same quality as the bakery slice
- a public live-generation endpoint paid for by the project owner

## Local Model Generation

People who clone the repo can test generation with their own Gemini key:

```bash
npm install
cp .env.example .env
# edit .env and set GOOGLE_API_KEY plus FORGE_MODEL_API_ENABLED=1
npm run dev -- --port 3027
```

Then open:

```text
http://localhost:3027/forge?gemini=1
```

The current Forge model path uses Gemini through `GOOGLE_API_KEY`. The local/no-key path remains
available at `/forge` and `/forge?play`.

## What The AI Generates

The AI does **not** write a new engine for every prompt. The engine is the reusable Forge runtime.
The AI generates a structured `GameDefinition` that the runtime can validate and play.

Generated fields include:

- title, theme, palette, and runtime template
- player stats and weapon cadence
- enemy roles and wave schedule
- boss, boss patterns, and win condition
- upgrade list, objective targets, and arena metadata
- asset keys and asset prompts

The runtime owns:

- movement, collision, combat, dash, attacks, and camera
- enemy AI roles, timed waves, boss telegraphs, and hazards
- HUD, radar, director feed, upgrades, win/lose/restart
- asset binding, sprite-sheet playback, procedural/source-backed fallbacks
- browser self-test hooks and standalone export/deploy packaging

The hosted demo uses the deterministic local generator so it is reliable and free to view. With
`FORGE_MODEL_API_ENABLED=1`, Gemini can generate the same `GameDefinition` shape from a prompt.

## Custom Art Expectations

If a prompt says "make the enemies birds instead of circles," the request can flow into names,
theme, asset keys, and asset prompts. The public demo will still use the local/source-backed art
path unless reviewed art generation is explicitly enabled.

For actual new bird sprites, run locally with model APIs enabled and use the reviewed-art pipeline.
Without that, the runtime still plays the game, but it may render deterministic fallback/source
sprites rather than bespoke generated bird art.

## Demo Controls

- Move with `WASD` or arrow keys.
- Attack with `Space` or `J`.
- Dash with `Shift` or `K`.
- Pause with `P`.

## Verification

Useful checks:

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
```
