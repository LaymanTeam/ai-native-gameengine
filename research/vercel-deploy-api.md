# Vercel Programmatic Deployment Reference (verified against vercel.com/docs)

> Researched 2026-06-06. For `engine/compiler/vercel-deploy.ts` — deploying generated games to Vercel without git. Three options: REST API (most control), `@vercel/sdk` (typed wrapper), `@vercel/client` (file-upload helper, v17.5.x). Auth for all: **Vercel Access Token** → `Authorization: Bearer <TOKEN>`.

## REST API: create a deployment

`POST https://api.vercel.com/v13/deployments`

Query params: `teamId` or `slug` (act on behalf of team), `forceNew=1`, `skipAutoDetectionConfirmation=1`.

Body (required: `name`):

```jsonc
{
  "name": "generated-game-slug",        // or "project": "<projectId>" (overrides name)
  "target": "production",               // "staging" | "production" | omitted = preview
  "files": [
    // inline small files directly:
    { "file": "index.html", "data": "<base64-or-utf8>", "encoding": "base64" },
    // or reference pre-uploaded blobs by sha (see Upload below):
    { "file": "dist/bundle.js", "sha": "<sha1>", "size": 12345 }
  ],
  "projectSettings": {                  // REQUIRED on a project's first deployment; persisted after
    "framework": "vite",
    "buildCommand": null,               // null = auto-detect
    "outputDirectory": null,
    "installCommand": null,
    "devCommand": null
  },
  "gitMetadata": { "remoteUrl": "..." } // optional cosmetic metadata
  // "gitSource": {...}                 // git-based deploy — CANNOT be combined with files
  // "deploymentId": "..."              // redeploy an existing deployment
}
```

- File entries are EITHER inlined (`file` + `data` [+ `encoding`]) OR referenced (`file` + `sha` of a previously uploaded file).
- Upload large files first: `POST https://api.vercel.com/v2/files` with headers `x-vercel-digest: <sha1>` and raw body, then reference by sha.
- Response includes `id`, `url` (deployment URL), `readyState` (`QUEUED`→`BUILDING`→`READY` / `ERROR`), `alias`, `projectSettings`. Poll `GET /v13/deployments/{id}` until `readyState === 'READY'`.

```ts
const res = await fetch('https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, target: 'production', files, projectSettings: { framework: 'vite' } }),
});
const deployment = await res.json();   // deployment.url, deployment.id
```

## @vercel/sdk (typed)

```ts
import { Vercel } from '@vercel/sdk';
const vercel = new Vercel({ bearerToken: process.env.VERCEL_TOKEN });
const dep = await vercel.deployments.createDeployment({
  requestBody: { name, target: 'production', files, projectSettings: {...} },
});
```

## @vercel/client (handles hashing/uploading a directory)

```ts
import { createDeployment } from '@vercel/client';
for await (const event of createDeployment({
  token: process.env.VERCEL_TOKEN, path: '/abs/path/to/generated-game',
  // plus any vercel.json-valid fields; teamId optional
})) {
  if (event.type === 'ready') console.log(event.payload.url);
}
```

Emits progress events (hashes-calculated, file-count, created, building, ready, error) — good fit for streaming deploy progress back to the chat UI.

## Notes for this engine

- Each generated game = its own Vercel project; first deploy must carry `projectSettings` (framework `vite`).
- Token via env `VERCEL_TOKEN`; scope to a team with `teamId`.
- SPA rewrites etc. go in the generated game's own `vercel.json` (a deployed file).
- Rate/size limits apply to inline files — prefer the upload-by-sha flow (`@vercel/client` does this automatically).

## Sources
- https://vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment
- https://vercel.com/docs/rest-api
- https://www.npmjs.com/package/@vercel/client
- https://vercel.com/docs/rest-api/sdk/examples/deployments-automation
