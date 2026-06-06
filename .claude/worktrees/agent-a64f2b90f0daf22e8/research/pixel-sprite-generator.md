# pixel-sprite-generator Reference (verified against source)

> Researched 2026-06-06 against https://github.com/zfedoran/pixel-sprite-generator (README + `pixel-sprite-generator.js` source + `example/index.html`). For the procedural sprite path in `generations/info.md` (assets/sprites). `npm install pixel-sprite-generator`. Global namespace **`psg`** (UMD-ish browser global; the lib renders to an HTML canvas).
> ⚠️ Headless Node usage requires `node-canvas` (lib calls `document.createElement('canvas')`). The `pixel-sprite-generator-nodejs` wrapper (blipn) exists but is inactive since ~2023 with known Snyk flags — prefer running the core algorithm with node-canvas yourself, or the TypeScript rewrite `seiyria/mixel`. Pattern-based alternative: `pixel-art-gen`.

## Mask

```js
// new psg.Mask(data, width, height, mirrorX, mirrorY)
// mirrorX/mirrorY DEFAULT TO TRUE if omitted
const spaceship = new psg.Mask([
  0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 1,-1,
  0, 0, 0, 1, 1,-1,
  0, 0, 0, 1, 1,-1,
  0, 0, 1, 1, 1,-1,
  0, 1, 1, 1, 2, 2,
  0, 1, 1, 1, 2, 2,
  0, 1, 1, 1, 2, 2,
  0, 1, 1, 1, 1,-1,
  0, 0, 0, 1, 1, 1,
  0, 0, 0, 0, 0, 0
], 6, 12, true, false);   // 6×12 template, mirrored on X → final sprite 12×12
```

Mask cell values:
| Value | Meaning |
|---|---|
| `-1` | always border |
| `0` | always empty |
| `1` | randomized: body or empty |
| `2` | randomized: body or border |

Final sprite size = `width * (mirrorX ? 2 : 1)` × `height * (mirrorY ? 2 : 1)`.

## Sprite

```js
const sprite = new psg.Sprite(mask, {
  colored:         true,   // default true — false = greyscale
  edgeBrightness:  0.3,    // default 0.3  (0–1)
  colorVariations: 0.2,    // default 0.2  (0–1)
  brightnessNoise: 0.3,    // default 0.3  (0–1)
  saturation:      0.5,    // default 0.5  (0–1; e.g. 0.1 = washed-out)
});
sprite.canvas;             // HTMLCanvasElement, ready immediately (generation runs in constructor)
// each `new psg.Sprite(mask, opts)` call yields a DIFFERENT random sprite from the same mask
```

Browser use: append/scale `sprite.canvas` (use nearest-neighbor scaling: `ctx.imageSmoothingEnabled = false` when blitting up).

## Headless Node → PNG (node-canvas pairing)

The lib's only DOM dependency is canvas creation. With `node-canvas`, shim `document.createElement('canvas')` (or patch `initCanvas`) and export:

```js
import { createCanvas } from 'canvas';
global.document = { createElement: () => createCanvas(1, 1) }; // canvas resized by lib
const psg = require('pixel-sprite-generator');
const sprite = new psg.Sprite(mask, { colored: true });
fs.writeFileSync('sprite.png', sprite.canvas.toBuffer('image/png'));
```

(Verify the shim against the installed version's `initCanvas`; it sets `canvas.width/height` after creation, which node-canvas supports.)

## Pipeline notes (per generations/info.md)

- Use for sprites/ when Gemini image-gen isn't suitable; PNGs feed straight into PixiJS `Assets.load`.
- For PixiJS, scale at render time with `texture.source.scaleMode = 'nearest'` (see [[research/pixijs.md]]) to keep pixels crisp.
- Asset libraries alternative: OpenGameArt (https://opengameart.org/art-search-advanced?keys=QUERY) and Kenney (https://kenney.nl/assets, mostly CC0).

## Sources
- https://github.com/zfedoran/pixel-sprite-generator (README, source, example/index.html — defaults read from source)
- Algorithm: Dave Bollinger's Pixel Spaceships (archived)
