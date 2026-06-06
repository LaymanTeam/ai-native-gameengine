# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

An **AI-native game engine**: an AI agent pipeline (Gemini via LangChain.js, hosted on Vercel) that generates complete, playable 2D games — code, sprites, backgrounds, SFX, music, fonts, and save state — from a user's prompt. The engine itself is the reusable scaffolding (`engine/`); each generated game is an artifact whose per-game folder layout is described in `generations/info.md`.

**Interface evolution (important context):** the original goal was a CLI-driven engine, but because the project must be hosted on Vercel, the interface is now a simple AI chat frontend (see the header comment in `engine/frontend/components/utilities/index.ts`). A voice layer over the interface is also planned (`engine/tools/voice/voice.ts`).

## Current State

Early scaffolding phase, now with a working Next.js 16 (App Router) shell. Implemented: `app/` (Mantine provider layout — **no Clerk gate on the engine UI; Clerk is tooling for generated games**), `app/api/chat/route.ts` (director agent → **SSE** stream: token/tool_start/tool_end/image/error/done events), `engine/ai/providers.ts` (Gemini model factories + image gen), `engine/ai/tool-definitions.ts` (per-request tool factory with event emitter; generate_image), `engine/ai/agents/director.ts` (createAgent + module-scoped MemorySaver checkpointer — conversation history lives server-side keyed by `threadId`; client sends only the new message), `engine/frontend/components/Chat.tsx` (SSE consumer, tool badges, inline images). No branding in the UI yet (pending user decision). Most other `engine/` `.ts` files remain **stubs** — their header comments are the authoritative statement of each module's purpose; read them before implementing.

## Commands

- `npm run dev` — Next.js dev server (chat UI at `/`; needs `GOOGLE_API_KEY` in `.env` for responses; Clerk runs keyless in dev)
- `npm run build` — production build (also typechecks)
- `npm run typecheck` — `tsc --noEmit`
- No lint or test setup yet — update this when added (including how to run a single test).

Notes: `package.json` is `"type": "module"` (required by Next build). API routes that use LangChain must declare `export const runtime = 'nodejs'`. Tool routes (`api/tools/*`, `compile`, `deploy`) are intentionally not created yet — they land with their Phase 2/4 implementations.

## Directory Map

```
engine/                      # The reusable engine — the product
├── ai/
│   ├── providers.ts         # Gemini provider: image gen, sound gen, web search, communication
│   ├── tool-definitions.ts  # LangChain tool definitions for the agents
│   └── agents/              # director (conductor), designer (GDD/scope), coder, image-reviewer,
│                            #   search-and-get, logic-evaluator, playtester, tester, debugger
│                            #   — see the agent roster table in the Plan of Action below
├── auth/
│   ├── clerk.ts             # Reusable Clerk auth/user-management methods shared across games
│   └── sendblue.ts          # (messaging/notification channel — stub) -- for multiplayer fucntionationality and logging in
├── compiler/
│   ├── vite-creator.ts      # Scaffolds the generated game as a Vite project 
│   └── vercel-deploy.ts     # Deploys the generated game to Vercel
├── renderer/pixi-js.ts      # PixiJS v8 rendering layer for generated games
├── storage/rx-db.ts         # Typesafe, Zod-schemaed RxDB methods games reuse for save/state logic
├── tools/
│   ├── visualizers/         # visual-direction.ts (Gemini web-search for visual references),
│   │                        #   prototype-still.ts, asset-review.ts (human/AI review surfaces)
│   └── voice/voice.ts       # Speech-to-text voice layer over the interface
└── frontend/components/     # Mantine-based AI chat interface (Vercel-hosted entry point)

generations/                 # Where generated games land; info.md defines the per-game folder
                             #   structure (assets/, systems/, ui/, saves/, config/, tests/, main.ts)

research/                    # Verified API reference docs (dated 2026-06-06) for each library in the
                             #   stack: bitecs, pixijs, rxdb, clerk, mantine, vite, sendblue,
                             #   vercel-langchain-gemini, langchain-agents-chains-gemini,
                             #   vercel-deploy-api, pixel-sprite-generator,
                             #   plus structure.md (an architecture proposal)
```

## How the Pieces Interrelate

User prompt → chat frontend (`engine/frontend/`, optionally voice) → LangChain/Gemini agents (`engine/ai/`) use tools (`engine/tools/`) to research visual direction, generate/fetch assets (with a review loop), and write game code → game is assembled against the engine runtime layers (`renderer/pixi-js`, `storage/rx-db`, `auth/clerk`) → `compiler/vite-creator` scaffolds it and `compiler/vercel-deploy` ships it → output lives under `generations/<game-name>/` per `generations/info.md`.

## Structure Documents — `generations/info.md` Wins

**User ruling: `generations/info.md` is the authoritative spec** for the per-generated-game folder layout (assets/, systems/, ui/, saves/, config/, render/, tests/, main.ts). The on-disk `engine/` tree is the machinery that produces that output. `research/structure.md` is an earlier, superseded proposal — do not follow its layout (and the engine uses **bitECS**, not Miniplex).

Clarifications from the user:
- **`ui/` in info.md is the generated game's in-game UI, built with Mantine.**
- **Orchestration lives in LangChain** — `createAgent` from LangChain v1 (LangGraph loop under the hood, see `research/langchain-agents-chains-gemini.md`). Do NOT build a custom orchestrator/state machine; compose agents, tools, and chains.
- `auth/sendblue.ts` is for multiplayer functionality and logging in (iMessage/SMS channel, see `research/sendblue.md`).

## Plan of Action — Filling the Stubs

The goal: every folder of an info.md game tree must have an engine module that produces it. Build order below; each phase's modules depend only on earlier phases. Consult the matching `research/*.md` doc before writing each module.

### Phase 1 — AI core (everything else hangs off this)
1. `engine/ai/providers.ts` — Gemini model instances (`@langchain/google-genai`): chat (flash), code (pro), image gen, plus web-search wiring. Research: `vercel-langchain-gemini.md`, `langchain-agents-chains-gemini.md`.
2. `engine/ai/tool-definitions.ts` — LangChain `tool()` definitions (Zod schemas) the agents call; thin wrappers re-exporting implementations from `engine/tools/`.
3. `engine/ai/agents/*` — `createAgent`-based agents. **The pipeline conductor is itself a LangChain agent** (`director.ts`) composing the others as tools/subagents. Full roster:

| Agent | Role |
|---|---|
| `director.ts` | conductor — phase-aware + resumable (LangGraph checkpointer per game); each chat turn = one phase (design → assets → code → test → deploy) to fit Vercel's 300s wall; human approval gates at the visualizer surfaces |
| `designer.ts` | prompt → **bounded GDD** (`reports/gdd.md` + `config/gdd.json`); confirms scope with user before generation; GDD is the cross-agent source of truth |
| `coder.ts` | systems/ + ui/ code; receives GDD + asset manifest + game's research/ folder; has a typecheck tool to self-verify |
| `image-reviewer.ts` | scores assets against the **style bible** with a numeric rubric; bounded loop (3 retries) then escalates to the human via asset-review surface (`humanInTheLoopMiddleware`) |
| `search-and-get.ts` | open-source sfx/music/asset trawl — primary domains per `generations/info.md`: **OpenGameArt** (`opengameart.org/art-search-advanced?keys=QUERY`, no NC/ND) and **Kenney** (`kenney.nl/assets`, mostly CC0); records **license provenance** (`assets/**/LICENSE.json`) and filters GPL-incompatible licenses |
| `logic-evaluator.ts` | static logic verification of rules: propositions extracted by model, consistency checked by deterministic truth-table/case enumeration (win/lose mutually exclusive + reachable, no contradictory rules, all transitions defined); spec gaps → designer, impl gaps → debugger |
| `playtester.ts` | drives the game headlessly via the controller action API against the bitECS world; asserts playability invariants; vision-checks prototype-still screenshots of the *composed* scene |
| `tester.ts` | authors + runs `tests/tests.ts`, feeds failures onward |
| `debugger.ts` | repair, not regeneration — minimal diffs from structured failures; bounded retries then escalates to user |

Pipeline-quality contracts (decided 2026-06-06):
- **Style bible**: visual-direction outputs `reports/style.md` + `config/style.json` (palette, sprite resolution, perspective, outline rules) prepended to EVERY image prompt.
- **Manifest-first coding**: `config/` asset manifests are generated before the coder runs; a plain-code (non-agent) validation pass checks bidirectionally that every manifest key is referenced and every referenced asset exists.
- Logic-evaluator proves the RULES are coherent; playtester proves the BUILD obeys them — both required before deploy.

### Phase 2 — Tools (the agents' hands)
4. `engine/tools/generators/pixel-art.ts` — programmatic sprite gen (pixel-sprite-generator algorithm w/ node-canvas; research: `pixel-sprite-generator.md`).
5. `engine/tools/fetchers/sfx.ts`, `fetchers/music.ts` — open-source audio library fetch tools for search-and-get.
6. `engine/tools/fetchers/fonts.ts` — Google Fonts CDN download.
7. `engine/tools/generators/text-trees.ts` — JSONIC dialogue/text trees for `assets/text/`.
8. `engine/tools/visualizers/*` — visual-direction (Gemini web search → references/), prototype-still, asset-review (review-loop surface).

### Phase 3 — Runtime layers (reused inside every generated game)
9. `engine/ecs/bitecs.ts` — bitECS 0.4 world/component/system helpers (research: `bitecs.md`; 0.3 API is GONE).
10. `engine/renderer/pixi-js.ts` — PixiJS v8 app/scene/sprite helpers (async `init()`; research: `pixijs.md`).
11. `engine/storage/rx-db.ts` — Zod-schemaed RxDB save/state methods (research: `rxdb.md`).
12. `engine/audio/playback.ts` — sfx/music playback layer.
13. `engine/input/controller.ts` — keyboard/touch/gamepad helper backing `systems/controller`.
14. `engine/auth/clerk.ts` (research: `clerk.md`) and `engine/auth/sendblue.ts` (multiplayer + login messaging; research: `sendblue.md`).

### Phase 4 — Generation plumbing (writes the info.md tree)
15. `engine/compiler/game-scaffold.ts` — creates `generations/<game-name>/` exactly per info.md, including `main.ts` skeleton.
16. `engine/compiler/asset-manifest.ts` — `config/` JSON binding each asset file to its code variable + styling JSON.
17. `engine/compiler/vite-creator.ts` — Vite 8 project scaffolding around the game tree (research: `vite.md`).
18. `engine/compiler/vercel-deploy.ts` — programmatic deploy via Vercel REST API/SDK (research: `vercel-deploy-api.md`).

### Phase 5 — Quality loop + surface
19. `engine/ai/agents/tester.ts` + `engine/testing/test-runner.ts` — author `tests/tests.ts`, run it (tsx), feed failures back to coder.
20. `engine/frontend/` — Mantine v9 chat interface + `engine/frontend/api/` streaming Node-runtime Vercel routes (research: `mantine.md`, `vercel-langchain-gemini.md`).
21. `engine/tools/voice/voice.ts` — speech-to-text layer over the interface.

## Research Docs Are Load-Bearing

The `research/*.md` files exist to prevent hallucinated/outdated API usage — each documents version traps (e.g. bitECS 0.4 rewrite, PixiJS v8 async `init()`, Mantine v9, Clerk `clerkMiddleware`, Vite 8/Rolldown, LangChain-on-Vercel Node-runtime constraint). **Consult the relevant research doc before writing code against any of these libraries.**

## Conventions

- TypeScript, strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`); `module: nodenext`, `jsx: react-jsx`.
- `package.json` is `"type": "commonjs"` — note `tsconfig` uses `nodenext`, so file extensions/module style matter.
- Zod schemas for typed data boundaries (per `engine/storage/rx-db.ts` intent and `research/structure.md`).

## License

GPL-3.0 per LICENSE and this file — any code added must be GPL-3.0 compatible. ⚠️ `package.json` currently says `"license": "ISC"`, which contradicts LICENSE; should be reconciled.
