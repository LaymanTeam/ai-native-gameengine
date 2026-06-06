# PixiJS v8 API Reference (verified against official docs)

> Researched 2026-06-06 against https://pixijs.com/8.x/guides and https://pixijs.com/versions.
> Latest stable at research time: **pixi.js 8.18.1**. Single package: `npm i pixi.js` — the `@pixi/*` sub-packages are v7-era and gone in v8.
> Purpose: prevent hallucinated v7-era APIs. When unsure, check https://pixijs.download/release/docs/index.html

## Application (async init — REQUIRED in v8)

```js
import { Application } from 'pixi.js';

const app = new Application();          // constructor takes NO options in v8
await app.init({                        // options go to init(), it is async
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb,
  resizeTo: window,                     // Window | HTMLElement — auto-resize
  antialias: true,
  resolution: window.devicePixelRatio,
  preference: 'webgl',                  // 'webgl' | 'webgpu' (default 'webgl')
  autoStart: true,                      // default true
  sharedTicker: false,                  // default false
  backgroundAlpha: 1,
  // per-renderer overrides:
  webgl: { antialias: true },
  webgpu: { antialias: false },
});
document.body.appendChild(app.canvas);  // app.canvas, NOT app.view (v7)
```

Core properties: `app.canvas`, `app.stage` (root Container), `app.renderer`, `app.ticker`.
Cleanup: `app.destroy()`.

Application plugins: implement `{ extension: ExtensionType.Application, init(options), destroy() }` and register via `extensions.add(plugin)`.

## Ticker (callback signature changed in v8)

```js
import { Ticker } from 'pixi.js';
app.ticker.add((ticker) => {            // receives Ticker instance, NOT delta number
  bunny.rotation += ticker.deltaTime;   // ticker.deltaTime, ticker.deltaMS, ticker.elapsedMS, ticker.FPS
});
Ticker.shared.add(fn); Ticker.shared.remove(fn);
```

## Scene objects

Base class is `Container` (`DisplayObject` is REMOVED in v8). Leaf nodes (Sprite, Graphics, Text, Mesh) should NOT have children — wrap in a Container.

Common properties on all scene objects:
- `position` (`obj.position.set(x, y)` or `obj.x`/`obj.y`), `rotation` (radians), `scale` (`.set(2, 1.5)`), `alpha` (0–1), `visible`, `tint` (e.g. `0xff0000`; `0xffffff` = off)
- `pivot` — pixel-based rotation origin (Containers); `anchor` — normalized 0–1 origin (Sprites only; `sprite.anchor.set(0.5)` = center)
- `addChild(obj)`, `removeChild(obj)`, `setSize(w, h)`, `getSize()`, `getLocalBounds()`, `getBounds()` (returns a `Bounds` object; rectangle via `.rectangle`)
- `container.label` (was `container.name` in v7)
- Per-frame logic: `obj.onRender = () => {...}` (replaces v7 `updateTransform` override); unset with `null`
- `cacheAsTexture()` replaces v7 `cacheAsBitmap`

```js
import { Container, Sprite, Text } from 'pixi.js';
const sprite = new Sprite(texture);
const text = new Text({ text: 'Hello', style: { fontSize: 24 } });  // options object ctor
```

## Graphics (fully reworked in v8 — biggest hallucination trap)

Build shape FIRST, then style. `beginFill`/`endFill`/`lineStyle`/`drawRect` etc. DO NOT EXIST in v8.

```js
import { Graphics } from 'pixi.js';
const g = new Graphics()
  .rect(50, 50, 100, 100)               // drawRect → rect
  .fill(0xff0000)                       // or .fill({ color: 0xffff00, alpha: 0.5 })
  .circle(100, 100, 50)                 // drawCircle → circle
  .stroke({ color: 0xfeeb77, width: 2 }); // lineStyle → stroke (after shape)
// poly() (was drawPolygon), ellipse(), roundRect(), star(), arc(), moveTo()/lineTo()
// Holes: define shape then .cut()
```

`GraphicsGeometry` → `GraphicsContext` (shareable drawing data).

## Textures & Assets

- `BaseTexture` is REMOVED. Textures wrap a `TextureSource` (ImageSource, CanvasSource, VideoSource, BufferSource, CompressedSource): `new Texture({ source: new ImageSource({ resource: image }) })`.
- `Texture.from(url)` no longer loads URLs — assets must be loaded via `Assets.load()` first.

```js
import { Assets } from 'pixi.js';
await Assets.init({ basePath: 'assets/', manifest });   // optional
const texture = await Assets.load('hero.png');           // single
const many = await Assets.load(['a.png', 'b.png']);      // multiple
await Assets.load({ alias: 'bunny', src: 'bunny.png' }); // alias form (object, NOT (name, url) args)
Assets.add({ alias: 'bunny', src: 'bunny.png' });        // register without loading
const t = Assets.get('bunny');                            // sync, after load
await Assets.unload('hero.png');
```

Cached by URL/alias automatically. Supports png/jpg/gif/webp/avif/svg, spritesheet .json, fonts (ttf/otf/woff/woff2, .fnt), video, ktx2/basis/dds compressed, json/txt. Bundles via manifest + `Assets.loadBundle(name)`, background loading via `Assets.backgroundLoad`.

## Events / interaction

Default `eventMode` is `'passive'` (v7 default was `'auto'`). Set `'static'` or `'dynamic'` to make an object interactive.

| eventMode | meaning |
|---|---|
| `none` | ignores events incl. children |
| `passive` | (default) children can be interactive, object itself isn't |
| `auto` | hit-tested only if parent interactive |
| `static` | emits events, hit-tested |
| `dynamic` | static + synthetic events for moving objects |

```js
sprite.eventMode = 'static';
sprite.cursor = 'pointer';
sprite.hitArea = new Rectangle(0, 0, 100, 100);   // optional custom hit area
sprite.on('pointerdown', (e) => {...});           // on/once/off — recommended
sprite.addEventListener('click', fn, { once: true }); // DOM-style also works
sprite.onclick = fn;                               // callback property also works
sprite.isInteractive();                            // true if static/dynamic
```

Event names: `pointerdown/up/upoutside/move/over/out/enter/leave/cancel/tap`, `globalpointermove`, plus mouse/touch/click/wheel equivalents.

## ParticleContainer (reworked in v8)

```js
import { ParticleContainer, Particle, Rectangle } from 'pixi.js';
const pc = new ParticleContainer({ boundsArea: new Rectangle(0, 0, 500, 500) }); // boundsArea required
pc.addParticle(new Particle(texture));   // NOT addChild(new Sprite(...))
// particles live in pc.particleChildren, not the scene graph
```

## Other v7→v8 renames/removals (do not use the old names)

- `settings` object removed → `AbstractRenderer.defaultOptions`; `settings.ADAPTER` → `DOMAdapter`
- `utils` namespace removed → direct named imports
- `SimpleMesh`→`MeshSimple`, `SimplePlane`→`MeshPlane`, `SimpleRope`→`MeshRope`, `NineSlicePlane`→`NineSliceSprite`
- Enum constants (scale/wrap/draw modes) → string literals (e.g. `scaleMode: 'nearest'`)
- Constructors generally take a single named-options object
- Uniforms need explicit types: `new UniformGroup({ uTime: { value: 1, type: 'f32' } })`; textures are "resources", not uniforms
- Culling is manual: `Culler.shared.cull(stage, screen)`
- RenderGroups: `new Container({ isRenderGroup: true })` for GPU-side transform batching of large static subtrees

## Sources
- https://pixijs.com/8.x/guides/migrations/v8
- https://pixijs.com/8.x/guides/components/application
- https://pixijs.com/8.x/guides/components/assets
- https://pixijs.com/8.x/guides/components/scene-objects
- https://pixijs.com/8.x/guides/components/events
- https://pixijs.com/versions (8.18.1 stable)
