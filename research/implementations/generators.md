# Implementation: `engine/tools/generators/*`

Programmatic asset generators for a game's `assets/` tree: `pixel-art.ts` synthesizes pixel sprites
from a mask; `text-trees.ts` generates JSONIC dialogue trees via Gemini structured output. Both
write into the generated game folder.

---

## `engine/tools/generators/pixel-art.ts`

A faithful, **zero-native-dependency** re-implementation of zfedoran's pixel-sprite-generator
(Dave Bollinger's "Pixel Spaceships"): Mask → resolved body/border grid → edge promotion → HSL
shading → **PNG encoded with a pure `node:zlib` encoder (no node-canvas)**. Do NOT use the
abandoned `pixel-sprite-generator-nodejs` wrapper or native canvas. RNG is injectable for
deterministic output. Built from `research/pixel-sprite-generator.md`.

**Deps:** `node:fs/promises` (mkdir/writeFile), `node:path`, `node:zlib` (`deflateSync`). No
runtime deps added.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `PIXELART_LOG_PREFIX` | `string` | Log prefix. |
| `Rng` | `() => number` | PRNG returning a float in [0,1). |
| `MaskInput` | interface | `{ data: ReadonlyArray<number>; width; height; mirrorX?; mirrorY? }` — cells -1/0/1/2. |
| `SpriteOptions` | interface | `{ colored?, edgeBrightness?, colorVariations?, brightnessNoise?, saturation?, rng? }`. |
| `GeneratedSprite` | interface | `{ width, height, cells: ReadonlyArray<number>, pixels: Uint8ClampedArray }`. |
| `createSeededRng(seed: number)` | `=> Rng` | Deterministic mulberry32 PRNG. |
| `generateSprite(mask, options?)` | `(MaskInput, SpriteOptions?) => GeneratedSprite` | Pure mask→sprite (no I/O). |
| `spriteToPngBuffer(sprite, scale?)` | `(GeneratedSprite, number) => Buffer` | RGBA8 → PNG via `node:zlib`; integer nearest-neighbour scaling. |
| `WrittenSprite` | interface | `{ filePath, width, height, bytes }`. |
| `generateSpritePng(mask, filePath, options?)` | `=> Promise<WrittenSprite>` | Generate + write PNG (parents created); `options` also accepts `{ scale? }`. |

Mask vocabulary: `-1` always border · `0` always empty · `1` random body/empty · `2` random
body/border. Final dims = template × 2 per mirrored axis (mirrorX/mirrorY default true).

### Usage
```ts
import { generateSpritePng, createSeededRng } from '@/engine/tools/generators/pixel-art';
await generateSpritePng(
  { data: [0,2,1, 2,1,1, 0,2,1], width: 3, height: 3 },
  'generations/my-game/assets/sprites/enemy.png',
  { rng: createSeededRng(42), scale: 4 },
);
```

### Design notes
- The PNG encoder is hand-rolled: CRC32 table, `pngChunk`, IHDR (8-bit RGBA) + IDAT (`deflateSync`)
  + IEND, scanlines filter-byte 0 (None), nearest-neighbour replicated pixels keep art crisp.
- Edge promotion uses a snapshot of the original body layout so border promotion does not cascade.

---

## `engine/tools/generators/text-trees.ts`

JSONIC dialogue/text trees for `assets/text/` via Gemini structured output against a Zod schema.
Gemini structured output forbids recursive (`z.lazy`) schemas, so a tree is a **flat node map** —
nodes with stable `id`s and `choices` that reference other ids by string. After generation the tree
is structurally validated (root resolves, ids unique, every `choice.next` references a real node)
before write. **No research doc** — model integration only. Header cites no library doc.

**Deps:** `node:fs/promises` (mkdir/writeFile), `node:path`, `zod`, and `createCoderModel` from
`engine/ai/providers`.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `TEXTTREES_LOG_PREFIX` | `string` | Log prefix. |
| `DialogueChoiceSchema` / `DialogueChoice` | zod / type | `{ label, next }`. |
| `DialogueNodeSchema` / `DialogueNode` | zod / type | `{ id, speaker, text, choices: DialogueChoice[] }`. |
| `DialogueTreeSchema` / `DialogueTree` | zod / type | `{ id, title, root, nodes: DialogueNode[] (min 1) }`. |
| `StructuredModel` | interface | `{ withStructuredOutput(schema): { invoke(input: string): Promise<unknown> } }` — injectable model contract. |
| `GenerateDialogueTreeOptions` | interface | `{ prompt; model?; context? }`. |
| `validateDialogueTree(tree)` | `(DialogueTree) => void` | Reference-integrity check; throws on first violation. |
| `generateDialogueTree(opts)` | `=> Promise<DialogueTree>` | Gemini structured output, Zod-parsed + structurally validated. |
| `WrittenDialogueTree` | interface | `{ filePath, id, nodeCount, bytes }`. |
| `writeDialogueTree(tree, filePath)` | `=> Promise<WrittenDialogueTree>` | Validate + write pretty JSON. |
| `generateAndWriteDialogueTree(opts & { filePath })` | `=> Promise<WrittenDialogueTree>` | One-shot generate + write. |

### Usage
```ts
import { generateAndWriteDialogueTree } from '@/engine/tools/generators/text-trees';
await generateAndWriteDialogueTree({
  prompt: 'A shopkeeper greets the hero and offers a quest.',
  filePath: 'generations/my-game/assets/text/shopkeeper.json',
});
```

---

## Tests
`engine/tools/generators/generators.test.ts` — run
`npx tsx engine/tools/generators/generators.test.ts` (deterministic seeded RNG for sprites; a stub
`StructuredModel` for dialogue trees; offline).
