/**
 * Node-based programmatic pixel sprite generation — the "node based tool to create pixel images
 * via code" branch of generations/info.md assets/sprites. Implements the pixel-sprite-generator
 * algorithm (Mask → Sprite) headlessly with ZERO native deps (do NOT use the abandoned
 * pixel-sprite-generator-nodejs wrapper). Research: research/pixel-sprite-generator.md
 *
 * The algorithm is a faithful, dependency-free re-implementation of zfedoran's
 * pixel-sprite-generator (Dave Bollinger's "Pixel Spaceships"):
 *   1. A Mask (2D int array) is optionally mirrored on X / Y.
 *   2. Mask cells are resolved to a body/border integer grid:
 *        -1 → always border,  0 → always empty,
 *         1 → random body|empty,  2 → random body|border.
 *   3. Internal edges (body cells adjacent to empty space) are promoted to border.
 *   4. Each body pixel is coloured in HSL with per-pixel brightness noise, a vertical
 *      shading gradient and per-sprite colour variation; borders are darkened.
 *   5. The result is encoded as a PNG with a pure node:zlib encoder (no node-canvas — the
 *      engine's dependency set is fixed to package.json; native canvas builds are not allowed).
 *
 * RNG is injectable (defaults to Math.random) so generation is deterministic in tests.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

export const PIXELART_LOG_PREFIX = '[engine/tools/generators/pixel-art]';

/** Pseudo-random number generator: returns a float in [0, 1). */
export type Rng = () => number;

/** Resolved body/border integer values inside the generated grid. */
const CELL_EMPTY = 0;
const CELL_BODY = 1;
const CELL_BORDER = 2;

/**
 * Mask cell vocabulary (per research/pixel-sprite-generator.md):
 *   -1 always border · 0 always empty · 1 random body/empty · 2 random body/border.
 */
export interface MaskInput {
  /** Row-major flat array of length width*height. Allowed values: -1, 0, 1, 2. */
  readonly data: ReadonlyArray<number>;
  /** Template width (pre-mirror). */
  readonly width: number;
  /** Template height (pre-mirror). */
  readonly height: number;
  /** Mirror horizontally (default true, matching the reference lib). */
  readonly mirrorX?: boolean;
  /** Mirror vertically (default true, matching the reference lib). */
  readonly mirrorY?: boolean;
}

/** Sprite colour/appearance options (defaults match the reference lib). */
export interface SpriteOptions {
  /** Colour the sprite (true) or render greyscale (false). Default true. */
  readonly colored?: boolean;
  /** How much darker borders/edges are, 0–1. Default 0.3. */
  readonly edgeBrightness?: number;
  /** Per-sprite hue variation amount, 0–1. Default 0.2. */
  readonly colorVariations?: number;
  /** Per-pixel brightness noise amount, 0–1. Default 0.3. */
  readonly brightnessNoise?: number;
  /** Base saturation, 0–1. Default 0.5. */
  readonly saturation?: number;
  /** Injectable RNG for deterministic output. Default Math.random. */
  readonly rng?: Rng;
}

/** A fully generated sprite: its dimensions, resolved cell grid, and RGBA pixel buffer. */
export interface GeneratedSprite {
  /** Final width = templateWidth * (mirrorX ? 2 : 1). */
  readonly width: number;
  /** Final height = templateHeight * (mirrorY ? 2 : 1). */
  readonly height: number;
  /** Resolved cell grid (row-major): CELL_EMPTY | CELL_BODY | CELL_BORDER. */
  readonly cells: ReadonlyArray<number>;
  /** RGBA8888 pixel buffer of length width*height*4. */
  readonly pixels: Uint8ClampedArray;
}

interface ResolvedSpriteOptions {
  colored: boolean;
  edgeBrightness: number;
  colorVariations: number;
  brightnessNoise: number;
  saturation: number;
  rng: Rng;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function resolveOptions(opts: SpriteOptions | undefined): ResolvedSpriteOptions {
  const o = opts ?? {};
  return {
    colored: o.colored ?? true,
    edgeBrightness: clamp01(o.edgeBrightness ?? 0.3),
    colorVariations: clamp01(o.colorVariations ?? 0.2),
    brightnessNoise: clamp01(o.brightnessNoise ?? 0.3),
    saturation: clamp01(o.saturation ?? 0.5),
    rng: typeof o.rng === 'function' ? o.rng : Math.random,
  };
}

/**
 * Deterministic, seedable RNG (mulberry32). Use to drive {@link generateSprite} in tests or
 * whenever reproducible sprites are required.
 */
export function createSeededRng(seed: number): Rng {
  let a = (seed >>> 0) || 1;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validateMask(mask: MaskInput): void {
  if (!mask || typeof mask !== 'object') {
    throw new Error(`${PIXELART_LOG_PREFIX} validateMask: mask must be an object`);
  }
  const { data, width, height } = mask;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(
      `${PIXELART_LOG_PREFIX} validateMask: width/height must be positive integers (got ${String(width)}x${String(height)})`,
    );
  }
  if (!Array.isArray(data)) {
    throw new Error(`${PIXELART_LOG_PREFIX} validateMask: data must be an array`);
  }
  if (data.length !== width * height) {
    throw new Error(
      `${PIXELART_LOG_PREFIX} validateMask: data length ${data.length} != width*height ${width * height}`,
    );
  }
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v !== -1 && v !== 0 && v !== 1 && v !== 2) {
      throw new Error(
        `${PIXELART_LOG_PREFIX} validateMask: cell ${i} has invalid value ${String(v)} (allowed: -1,0,1,2)`,
      );
    }
  }
}

/**
 * Mirror the template mask on X and/or Y into a new flat grid, returning the final dimensions.
 * Mirroring reflects each template row/column to its opposite side (reference-lib semantics).
 */
function mirrorMask(mask: MaskInput): { data: number[]; width: number; height: number } {
  const mirrorX = mask.mirrorX ?? true;
  const mirrorY = mask.mirrorY ?? true;
  const w = mask.width;
  const h = mask.height;
  const finalW = w * (mirrorX ? 2 : 1);
  const finalH = h * (mirrorY ? 2 : 1);
  const out = new Array<number>(finalW * finalH).fill(CELL_EMPTY);

  const readTemplate = (x: number, y: number): number => {
    const v = mask.data[y * w + x];
    return v ?? CELL_EMPTY;
  };

  for (let y = 0; y < finalH; y++) {
    const srcY = mirrorY && y >= h ? finalH - 1 - y : y;
    for (let x = 0; x < finalW; x++) {
      const srcX = mirrorX && x >= w ? finalW - 1 - x : x;
      out[y * finalW + x] = readTemplate(srcX, srcY);
    }
  }
  return { data: out, width: finalW, height: finalH };
}

/** Resolve mask cells (-1/0/1/2) to body/border integers using the RNG. */
function resolveCells(maskData: ReadonlyArray<number>, rng: Rng): number[] {
  const cells = new Array<number>(maskData.length).fill(CELL_EMPTY);
  for (let i = 0; i < maskData.length; i++) {
    const v = maskData[i] ?? CELL_EMPTY;
    if (v === -1) {
      cells[i] = CELL_BORDER;
    } else if (v === 1) {
      cells[i] = rng() < 0.5 ? CELL_BODY : CELL_EMPTY;
    } else if (v === 2) {
      cells[i] = rng() < 0.5 ? CELL_BODY : CELL_BORDER;
    } else {
      cells[i] = CELL_EMPTY;
    }
  }
  return cells;
}

function isEmptyInSnapshot(
  snapshot: ReadonlyArray<number>,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return true; // out-of-bounds = empty
  return (snapshot[y * width + x] ?? CELL_EMPTY) === CELL_EMPTY;
}

/**
 * Promote body pixels that border empty space to border pixels, producing the dark outline
 * characteristic of the algorithm. Empty/border cells are left untouched. Promotion is based on
 * a snapshot of the original body layout so it does not cascade across the grid.
 */
function generateEdges(cells: number[], width: number, height: number): void {
  const snapshot = cells.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((snapshot[y * width + x] ?? CELL_EMPTY) !== CELL_BODY) continue;
      if (
        isEmptyInSnapshot(snapshot, width, height, x - 1, y) ||
        isEmptyInSnapshot(snapshot, width, height, x + 1, y) ||
        isEmptyInSnapshot(snapshot, width, height, x, y - 1) ||
        isEmptyInSnapshot(snapshot, width, height, x, y + 1)
      ) {
        cells[y * width + x] = CELL_BORDER;
      }
    }
  }
}

/** Convert HSL (all 0–1) to an [r,g,b] triple (0–255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  const sat = clamp01(s);
  const lum = clamp01(l);
  if (sat === 0) {
    const g = Math.round(lum * 255);
    return [g, g, g];
  }
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const channel = (t0: number): number => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(channel(hue + 1 / 3) * 255),
    Math.round(channel(hue) * 255),
    Math.round(channel(hue - 1 / 3) * 255),
  ];
}

/**
 * Generate a sprite from a mask. Pure (no I/O): returns dimensions, the resolved cell grid, and
 * an RGBA pixel buffer. Each call with a fresh RNG state yields a different random sprite.
 */
export function generateSprite(mask: MaskInput, options?: SpriteOptions): GeneratedSprite {
  validateMask(mask);
  const opts = resolveOptions(options);
  const mirrored = mirrorMask(mask);
  const { width, height } = mirrored;

  const cells = resolveCells(mirrored.data, opts.rng);
  generateEdges(cells, width, height);

  // Per-sprite base hue (the reference lib draws one hue per sprite).
  const baseHue = opts.rng();
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    // Vertical brightness gradient: top brighter, bottom darker (subtle shading).
    const verticalShade = 1 - (y / Math.max(1, height - 1)) * 0.35;
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = cells[idx] ?? CELL_EMPTY;
      const p = idx * 4;
      if (cell === CELL_EMPTY) {
        pixels[p] = 0;
        pixels[p + 1] = 0;
        pixels[p + 2] = 0;
        pixels[p + 3] = 0;
        continue;
      }

      const hueJitter = (opts.rng() - 0.5) * opts.colorVariations;
      const hue = opts.colored ? baseHue + hueJitter : 0;
      const saturation = opts.colored ? opts.saturation : 0;

      // Per-pixel brightness noise around the vertical gradient.
      const noise = (opts.rng() - 0.5) * opts.brightnessNoise;
      let lightness = 0.5 * verticalShade + noise;
      if (cell === CELL_BORDER) {
        lightness -= opts.edgeBrightness;
      }
      lightness = clamp01(lightness);

      const [r, g, b] = hslToRgb(hue, saturation, lightness);
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }

  console.log(
    `${PIXELART_LOG_PREFIX} generateSprite done dims=${width}x${height} ` +
      `body=${cells.filter((c) => c === CELL_BODY).length} border=${cells.filter((c) => c === CELL_BORDER).length} ` +
      `colored=${opts.colored}`,
  );
  return { width, height, cells, pixels };
}

// ---------------------------------------------------------------------------
// Pure-Node PNG encoding (no native deps): RGBA8 → PNG (IHDR + IDAT/zlib + IEND).
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (byte === undefined) continue;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Encode a generated sprite to a PNG Buffer with a pure node:zlib encoder, with optional
 * integer nearest-neighbour scaling (replicated pixels keep the art crisp — research/pixijs.md).
 */
export function spriteToPngBuffer(sprite: GeneratedSprite, scale = 1): Buffer {
  if (!sprite || !(sprite.pixels instanceof Uint8ClampedArray)) {
    throw new Error(`${PIXELART_LOG_PREFIX} spriteToPngBuffer: invalid sprite`);
  }
  const factor = Number.isInteger(scale) && scale >= 1 ? scale : 1;
  const outW = sprite.width * factor;
  const outH = sprite.height * factor;

  // Raw scanlines: each row prefixed with filter byte 0 (None), pixels nearest-neighbour scaled.
  const raw = Buffer.alloc(outH * (1 + outW * 4));
  let offset = 0;
  for (let y = 0; y < outH; y++) {
    raw[offset++] = 0; // filter: None
    const srcY = Math.floor(y / factor);
    for (let x = 0; x < outW; x++) {
      const srcX = Math.floor(x / factor);
      const p = (srcY * sprite.width + srcX) * 4;
      raw[offset++] = sprite.pixels[p] ?? 0;
      raw[offset++] = sprite.pixels[p + 1] ?? 0;
      raw[offset++] = sprite.pixels[p + 2] ?? 0;
      raw[offset++] = sprite.pixels[p + 3] ?? 0;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0);
  ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Result of writing a sprite PNG to disk. */
export interface WrittenSprite {
  readonly filePath: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

/**
 * Generate a sprite from a mask and write it as a PNG to `filePath` (parent dirs created).
 * Intended target: a game's assets/sprites/ directory.
 */
export async function generateSpritePng(
  mask: MaskInput,
  filePath: string,
  options?: SpriteOptions & { scale?: number },
): Promise<WrittenSprite> {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`${PIXELART_LOG_PREFIX} generateSpritePng: filePath must be a non-empty string`);
  }
  const { scale, ...spriteOpts } = options ?? {};
  const factor = typeof scale === 'number' && Number.isInteger(scale) && scale >= 1 ? scale : 1;
  try {
    const sprite = generateSprite(mask, spriteOpts);
    const buffer = spriteToPngBuffer(sprite, factor);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    const result: WrittenSprite = {
      filePath,
      width: sprite.width * factor,
      height: sprite.height * factor,
      bytes: buffer.length,
    };
    console.log(
      `${PIXELART_LOG_PREFIX} generateSpritePng wrote path=${filePath} dims=${result.width}x${result.height} bytes=${result.bytes}`,
    );
    return result;
  } catch (err) {
    console.error(
      `${PIXELART_LOG_PREFIX} generateSpritePng failed path=${filePath} error=${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}
