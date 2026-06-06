# Implementation: `engine/renderer/pixi-js.ts`

The PixiJS **v8** rendering layer a generated game's `render/` folder and `main.ts` consume.
Visual-only (audio + input are separate layers). Config builders, manifest mapping, and type
guards are pure / Node-safe (unit-tested headlessly); the app/scene/sprite helpers require a
browser + WebGL. Built from `research/pixijs.md`.

**Deps:** `pixi.js` (Application, Assets, Container, Graphics, Sprite, Text, Texture, types), `zod`.

### v8 API traps respected
- `new Application()` takes NO options — you MUST `await app.init({...})`.
- `app.canvas` (not v7 `app.view`). BaseTexture / beginFill / drawRect are GONE — Graphics is
  shape-first then `.fill()/.stroke()`. Load via `Assets.load` (`Texture.from(url)` no longer
  fetches). Ticker callbacks receive a `Ticker`; use `ticker.deltaTime`.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `RENDERER_LOG_PREFIX` | `string` | Log prefix. |
| `RendererPreference` | `'webgl' \| 'webgpu'` | String-literal renderer pref (v8 enums removed). |
| `RenderConfigSchema` | zod (strict) | width/height/backgroundColor/backgroundAlpha/antialias/roundPixels/resolution/preference/autoStart with defaults. |
| `RenderConfig` / `RenderConfigInput` | `z.infer` / `z.input` | Parsed / raw config. |
| `parseRenderConfig(input?: unknown)` | `=> RenderConfig` | Validate + default; throws structured on invalid. |
| `buildApplicationOptions(config)` | `(RenderConfig) => Partial<ApplicationOptions>` | Pure translation to `app.init()` options. |
| `AssetEntrySchema` / `AssetEntry` | zod (strict) / type | `{ alias, src }`. |
| `AssetManifestSchema` / `AssetManifest` | zod / type | `AssetEntry[]`. |
| `parseAssetManifest(input: unknown)` | `=> AssetManifest` | Validate + assert unique aliases; throws on duplicate. |
| `manifestToAliasMap(manifest)` | `(AssetManifest) => Record<string, string>` | alias→src record (pure). |
| `isColorValue(value: unknown)` | `=> value is number` | Finite non-negative hex/number guard. |
| `isContainer(value: unknown)` | `=> value is Container` | Container guard. |
| `isSprite(value: unknown)` | `=> value is Sprite` | Sprite guard. |
| `CreateRendererResult` / `CreateRendererOptions` | interfaces | `{ app, canvas }` / `{ config?, mountTo? }`. |
| `createRenderer(options?)` | `=> Promise<CreateRendererResult>` | `new Application()` + `await app.init()`; optional `mountTo` append. |
| `loadTextures(manifest)` | `(AssetManifest) => Promise<Record<string, Texture>>` | `Assets.load([{alias,src}])` → alias→Texture. |
| `SpriteOptions` | interface | x/y/anchor/scale/rotation/alpha/tint/visible/label (all optional). |
| `createSprite(texture, options?)` | `=> Sprite` | Apply transform/style defensively; throws on missing texture. |
| `RectOptions` | interface | fill/fillAlpha/stroke/strokeWidth. |
| `createRect(x, y, width, height, options?)` | `=> Graphics` | v8 shape-first `.rect().fill().stroke()`. |
| `createText(content, style?)` | `(string, TextStyleOptions) => Text` | v8 options-object Text. |
| `createScene(label?, children?)` | `=> Container` | Container parent; skips non-Container children. |
| `UpdateFn` | `(ticker: Ticker) => void` | Per-frame callback (v8 Ticker, not a delta number). |
| `addUpdate(app, fn)` | `(Application, UpdateFn) => () => void` | Register on `app.ticker`; returns disposer. |
| `destroyRenderer(app)` | `(Application \| null \| undefined) => void` | `app.destroy(true, { children, texture })`, guarded. |

### Usage

```ts
import { createRenderer, loadTextures, createSprite, createScene, addUpdate } from '@/engine/renderer/pixi-js';

const { app, canvas } = await createRenderer({ config: { width: 640, height: 480 }, mountTo: document.body });
const textures = await loadTextures([{ alias: 'hero', src: 'assets/sprites/hero.png' }]);
const hero = createSprite(textures.hero, { anchor: 0.5, x: 100, y: 100 });
app.stage.addChild(createScene('main', [hero]));
const stop = addUpdate(app, (ticker) => { hero.x += ticker.deltaTime; });
```

### Design notes
- `parseAssetManifest` rejects duplicate aliases — a duplicate would silently shadow a texture at
  load time.
- `loadTextures` passes an array of `{ alias, src }` unresolved-asset objects (the v8 `Assets.load`
  shape); an empty/undefined manifest short-circuits to `{}`.

### Test
`engine/renderer/pixi-js.test.ts` — run `npx tsx engine/renderer/pixi-js.test.ts` (covers the pure
config/manifest/guard surface headlessly).
