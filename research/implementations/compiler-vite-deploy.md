# Implementation: `engine/compiler/vite-creator.ts` + `engine/compiler/vercel-deploy.ts`

Phase 4 generation plumbing that ships a scaffolded game: `vite-creator.ts` wraps the
`generations/<game>/` tree (from `game-scaffold.ts`) in a Vite **8** project; `vercel-deploy.ts`
deploys that wrapped project via the Vercel REST API. Both decouple from sibling modules (small
local option shapes + the on-disk tree only) and inject `fetch`/IO for offline tests.

---

## `engine/compiler/vite-creator.ts`

Writes the project-level files Vite needs: `vite.config.ts`, `index.html`, `package.json`,
`tsconfig.json`, `vercel.json`. Built from `research/vite.md` (Vite 8 / Rolldown bundler; Node
20.19+/22.12+; `index.html` at project root is the entry; only `VITE_`-prefixed env reaches client;
build → `dist/`; `resolve.alias "@"` mirrored in tsconfig `paths`; SPA rewrite to `/index.html`).

**Deps:** `node:fs/promises` (access/mkdir/writeFile), `node:path`, `zod`.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `ViteCreatorOptionsSchema` | zod (strict) | `{ gameDir, name, title?, entry?, dependencies?, overwrite? }`. |
| `ViteCreatorOptions` | `z.input<typeof ViteCreatorOptionsSchema>` | Raw options. |
| `ViteCreatorResult` | interface | `{ gameDir, written: string[], skipped: string[] }` (absolute paths). |
| `createViteProject(options)` | `(ViteCreatorOptions) => Promise<ViteCreatorResult>` | Write project files; idempotent unless `overwrite:false`. Throws if options invalid or `gameDir` missing. |

Default pinned game deps: `bitecs ^0.4.0`, `pixi.js ^8.0.0`, `rxdb ^17.3.0`, `rxjs ^7.8.2`,
`zod ^4.4.3`; dev deps `vite ^8.0.0`, `typescript ^6.0.3`. `entry` defaults to `main.ts`,
`title` to `name`, `overwrite` to `true`.

### Usage
```ts
import { createViteProject } from '@/engine/compiler/vite-creator';
const { written } = await createViteProject({ gameDir: '/abs/generations/my-game', name: 'my-game' });
```

---

## `engine/compiler/vercel-deploy.ts`

Walks the wrapped game dir into a flat base64-inlined file list, `POST /v13/deployments` with
`projectSettings.framework='vite'`, polls `GET /v13/deployments/{id}` until `readyState==='READY'`
(or ERROR/CANCELED/timeout), returns the live URL. Built from `research/vercel-deploy-api.md`.

**Auth:** `VERCEL_TOKEN` env → `Authorization: Bearer <token>` (NEVER logged — log lines emit
`token=REDACTED`). **Deps:** `node:fs/promises` (readFile/readdir/stat), `node:path`, `zod`.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `FetchLike` | `(input: string, init?: {method?,headers?,body?}) => Promise<{ ok, status, json(), text() }>` | Injectable fetch (offline tests). |
| `DeployOptionsSchema` | zod (strict) | `{ gameDir, name, token?, target?, teamId?, pollIntervalMs?, pollTimeoutMs?, exclude?, fetchImpl? }`. |
| `DeployOptions` | `z.input<typeof DeployOptionsSchema>` | Raw options. |
| `DeployResult` | interface | `{ id, url, httpsUrl, readyState }`. |
| `deployToVercel(options)` | `(DeployOptions) => Promise<DeployResult>` | Create + wait until live. Throws on invalid options/env, create failure, build ERROR, or poll timeout. |

Defaults: `target` `'production'`, `pollIntervalMs` 2000, `pollTimeoutMs` 240000 (< Vercel 300s
wall), `exclude` `['node_modules', '.git', 'dist', '.vercel']`, `fetchImpl` global `fetch`,
`token` `process.env.VERCEL_TOKEN`.

### Usage
```ts
import { deployToVercel } from '@/engine/compiler/vercel-deploy';
const { httpsUrl } = await deployToVercel({ gameDir: '/abs/generations/my-game', name: 'my-game' });
```

### Design notes
- `collectFiles` skips excluded dir/file names and symlinks; throws if zero files found.
- First deployment must send `projectSettings.framework='vite'` (persisted afterward); the create
  URL carries `skipAutoDetectionConfirmation=1` and an optional `teamId` query param.

---

## Tests
- `engine/compiler/vite-creator.test.ts` — `npx tsx engine/compiler/vite-creator.test.ts` (offline,
  scaffolds into a temp dir).
- `engine/compiler/vercel-deploy.test.ts` — `npx tsx engine/compiler/vercel-deploy.test.ts` (mock
  `fetchImpl`, asserts redaction + the create/poll flow, fully offline).
