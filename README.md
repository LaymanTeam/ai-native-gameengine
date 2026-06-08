# AI Native Game Engine

An AI-native game engine prototype for generating and running small 2D games from structured game definitions.

The public demo is **Baker Pantry Panic**, a keyless playable build that shows the runtime executing one generated `GameDefinition`: manual melee combat, wave progression, a gated boss fight, and source-backed game art.

## Demo

- Open `/demo` for the public playable demo.
- `/demo` redirects to `/forge?play`, which loads the Baker Pantry build without making model API calls.
- Press `Enter` or `Space` to start, then use `WASD`/arrow keys to move, `Space`/`J` to swing, and `Shift`/`K` to dash.

## Local Setup

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/demo`.

## Optional Live Generation

The demo is intentionally keyless. To try model-backed generation locally, provide your own Gemini key and enable model routes:

```bash
GOOGLE_API_KEY=...
FORGE_MODEL_API_ENABLED=1
```

Then open `/forge?gemini=1`.

## Verification

```bash
npm run typecheck
npm test
npm run test:public-demo
npm run test:browser
npm run build
```

## Plans

The original engine plan is preserved in `docs/PATH-A-PLAN.md`. The all-in version is in `docs/ALL-IN-ORIGINAL-PLAN.md`.
