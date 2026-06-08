# ai-native-gameengine

AI-native game engine demo: a prompt-shaped `GameDefinition` drives the Forge runtime with
movement, combat, waves, upgrades, boss patterns, win/lose states, standalone export, and browser QA.

## Public Demo

The hosted demo is intentionally **no-spend**:

- Open `/forge?play`.
- The page renders the baked bakery portal raid vertical slice from the deterministic local generator.
- The game auto-enters a staged boss encounter so reviewers immediately see enemies, boss pressure,
  and the bakery portal arena instead of a blank/title state.
- Visitors do not need an API key.
- The public deploy should not include `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, or `FORGE_MODEL_API_ENABLED=1`.

This is deliberate. The deployed URL is a playable demo output for reviewers. It does not spend the
owner's model quota when people open or share the link.

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
