# Frontend ↔ engine integration seams

The UI is wired to this layer, not to mock data directly, so the incoming engine code can slot
in with minimal edits. Each seam is one of two kinds:

- **Live conditional import** — already tries the real module at runtime and falls back if it's
  not ready. Lights up automatically when the engine module exports the expected symbol.
- **One-line swap** — a documented passthrough/mock; flip it to the real call when that module
  exists. (Used where the target module doesn't exist yet, so a dynamic import would break the
  build.)

| Seam | File | Kind | Wire it up by |
|---|---|---|---|
| **Game runtime (play)** | `runtime.ts` | 🔌 live conditional import | Export `mountGame(target, spec): GameRuntime` from `engine/renderer/pixi-js.ts` (PixiJS v8). The adapter feature-detects it and replaces the placeholder. |
| **Chat transport** | `chat.ts` | swap | Already talks to the live `POST /api/chat` SSE stream. Change the body only if the protocol changes. |
| **GameSpec type** | `contracts.ts` | swap | Replace `interface GameSpec` with `z.infer<typeof gameSpecSchema>` once the engine ships the Zod schema. |
| **GameSpec validation** | `gamespec.ts` | swap | Replace `validateGameSpec` passthrough with `gameSpecSchema.parse`. |
| **Library listing** | `library.ts` | swap | Replace `listGames()` mock with the real content store / deployments source. |
| **Deploy URL** | `deploy.ts` | swap | Populate `GameSummary.deployedUrl` from `engine/compiler/vercel-deploy.ts`; `openGame` already prefers it over the in-app `/play/<id>` fallback. |

## Contracts the engine is expected to satisfy
- `MountGame = (target: HTMLElement, spec: GameSpec) => Promise<GameRuntime> | GameRuntime`
- `GameRuntime = { destroy(): void }`
- SSE `EngineEvent` (re-exported from `engine/ai/tool-definitions.ts`): `token | tool_start | tool_end | image | error | done`

## Who consumes what
- `engine/frontend/components/Chat.tsx` → `chat.ts` (transport) + `EngineEvent`
- `app/library/page.tsx` → `library.ts` (`MOCK_GAMES`) + `deploy.ts` (`openGame`)
- `app/schema/page.tsx` → `gamespec.ts` (`FALLBACK_SPEC`) + `GameSpec`
- `app/play/[id]/page.tsx` → `runtime.ts` (`mountGame`) + `gamespec.ts` (`specFromPalette`)
