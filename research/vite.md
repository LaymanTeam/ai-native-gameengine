# Vite Reference (verified against vite.dev)

> Researched 2026-06-06. Current: **Vite 8** (8.0.16 docs) — production builds now use **Rolldown** (Rust bundler), not Rollup. Node.js **20.19+ or 22.12+** required.

## Scaffolding & commands

```bash
npm create vite@latest                              # interactive
npm create vite@latest my-app -- --template react-ts
# templates: vanilla(-ts), vue(-ts), react(-ts), preact(-ts), lit(-ts), svelte(-ts), solid(-ts), qwik(-ts)
```

```json
{ "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" } }
```

- `index.html` lives at **project root** and is the entry point (part of the module graph); reference your entry with `<script type="module" src="/src/main.tsx">`.
- Static files in `public/` are served at `/` verbatim.

## vite.config.ts

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },  // mirror in tsconfig "paths"
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api/, '') },
    },
    warmup: { clientFiles: ['./src/heavy/*.ts'] },
  },
  build: {
    target: 'baseline-widely-available',  // default (Chrome 111, Edge 111, FF 114, Safari 16.4)
    outDir: 'dist',
    sourcemap: true,
  },
});
// Conditional config: export defineConfig(({ command, mode, isSsrBuild }) => ({...}))
```

## Env variables

- Only vars prefixed **`VITE_`** are exposed to client code: `import.meta.env.VITE_API_URL`.
- Built-ins: `import.meta.env.MODE`, `.DEV`, `.PROD`, `.BASE_URL`, `.SSR`.
- Files: `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local`.
- NOT `process.env` in client code.

## Asset & module features (Vite-specific idioms)

```ts
import imgUrl from './img.png';                      // → URL string
import raw from './shader.glsl?raw';                 // raw string
import worker from './w.ts?worker';                  // Worker constructor (also ?sharedworker)
import url from './big.bin?url';                     // explicit URL
const pages = import.meta.glob('./pages/*.tsx');     // lazy map of dynamic imports
const eager = import.meta.glob('./data/*.json', { eager: true });
new URL('./asset.png', import.meta.url).href;        // runtime asset URL
if (import.meta.hot) import.meta.hot.accept(...)     // HMR API
```

- Dynamic `import()` works with code-splitting out of the box.
- Web Workers: `new Worker(new URL('./w.ts', import.meta.url), { type: 'module' })` also works.
- CSS: plain imports, CSS modules via `.module.css`, PostCSS config auto-detected (relevant for Mantine's `postcss-preset-mantine`).

## Notes for this stack

- Pixi/bitECS/RxDB are all plain ESM — no special Vite config needed; large binary game assets go in `public/` or use `?url`.
- For deploying SPA on Vercel: build output `dist/`, SPA rewrite to `/index.html`; API routes live separately as Vercel functions (see vercel-langchain-gemini.md) — use `server.proxy` in dev to reach them, or `vercel dev`.

## Sources
- https://vite.dev/guide/ (v8)
- https://vite.dev/config/, https://vite.dev/config/server-options, https://vite.dev/config/build-options
