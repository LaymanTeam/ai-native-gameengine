/**
 * Prototype-still composer: layers generated/fetched assets (background, then sprites/scene
 * elements at given positions) into a single static PNG of the COMPOSED scene, for human/AI
 * review of how the pieces look together — the playtester vision-checks this still and the
 * asset-review surface presents it.
 *
 * Per research/architecture.md: playtester "vision-checks prototype-still screenshots of the
 * *composed* scene". This module produces that composite headlessly (Node) via a pluggable
 * compositor — `sharp` by default (lazily imported so the module has no hard type dependency),
 * fully injectable for tests.
 */
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';

const LOG_PREFIX = '[engine/tools/visualizers/prototype-still]';

/** A layer to place on the canvas. Source is either a data: URL or an absolute file path. */
export const SceneLayerSchema = z.object({
  /** Label for logging, e.g. "player", "tree-01". */
  name: z.string().min(1),
  /** Either a data:image/...;base64,... URL or an absolute filesystem path to a PNG. */
  source: z.string().min(1),
  /** Top-left x in canvas px. Defaults to 0. */
  x: z.number().int().optional(),
  /** Top-left y in canvas px. Defaults to 0. */
  y: z.number().int().optional(),
});

export type SceneLayer = z.infer<typeof SceneLayerSchema>;

export const PrototypeSceneSchema = z.object({
  /** Canvas width in px. */
  width: z.number().int().positive(),
  /** Canvas height in px. */
  height: z.number().int().positive(),
  /** Background fill colour (#RRGGBB). Defaults to #000000 when omitted. */
  background: z.string().regex(/^#?[0-9a-fA-F]{6}$/u).optional(),
  /** Ordered layers; index 0 is drawn first (bottom). */
  layers: z.array(SceneLayerSchema).min(1),
});

export type PrototypeScene = z.infer<typeof PrototypeSceneSchema>;

/** A composited layer ready for the compositor: raw PNG bytes + placement. */
export interface ResolvedLayer {
  name: string;
  buffer: Buffer;
  x: number;
  y: number;
}

/**
 * Structural compositor interface — `sharp`'s relevant surface. Implemented by the default
 * sharp-backed compositor and trivially mockable in tests.
 */
export interface Compositor {
  /**
   * Compose `layers` (each a PNG buffer at x/y) onto a `width`x`height` canvas filled with
   * `background`, returning the composite as PNG bytes.
   */
  compose(opts: {
    width: number;
    height: number;
    background: string;
    layers: ResolvedLayer[];
  }): Promise<Buffer>;
}

export interface PrototypeStillDeps {
  compositor?: Compositor;
  /** Reads a file path → Buffer; defaults to node:fs/promises. */
  readFile?: (file: string) => Promise<Buffer>;
  writeFile?: (file: string, data: Buffer) => Promise<void>;
  mkdir?: (dir: string, opts: { recursive: boolean }) => Promise<unknown>;
}

export interface PrototypeStillOptions {
  scene: PrototypeScene;
  /** Absolute output PNG path (e.g. generations/<game>/references/prototype.png). */
  outPath: string;
}

export interface PrototypeStillOutput {
  outPath: string;
  width: number;
  height: number;
  layerCount: number;
}

const DEFAULT_BACKGROUND = '#000000';
const DATA_URL_RE = /^data:image\/[a-zA-Z.+-]+;base64,(.+)$/u;

/** Decode a data: URL or read a file path into a PNG Buffer. */
export async function resolveLayerBuffer(
  source: string,
  readFile: (file: string) => Promise<Buffer>,
): Promise<Buffer> {
  if (!source || source.trim().length === 0) {
    throw new Error(`${LOG_PREFIX} resolveLayerBuffer: empty source`);
  }
  const match = source.match(DATA_URL_RE);
  if (match?.[1]) {
    return Buffer.from(match[1], 'base64');
  }
  if (source.startsWith('data:')) {
    throw new Error(`${LOG_PREFIX} resolveLayerBuffer: malformed data URL`);
  }
  if (!path.isAbsolute(source)) {
    throw new Error(`${LOG_PREFIX} resolveLayerBuffer: file source must be an absolute path: ${source}`);
  }
  return readFile(source);
}

/** Normalize a hex colour to leading-# form. */
function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

/**
 * Default sharp-backed compositor. Lazily imports `sharp` so the module carries no compile-time
 * dependency on sharp's typings (it is a hoisted transitive dep). Throws a clear error if absent.
 */
export function createSharpCompositor(): Compositor {
  return {
    async compose({ width, height, background, layers }): Promise<Buffer> {
      let sharpMod: unknown;
      try {
        sharpMod = (await import('sharp')).default;
      } catch (err) {
        throw new Error(
          `${LOG_PREFIX} sharp not available — install 'sharp' or inject a Compositor: ${(err as Error).message}`,
        );
      }
      // Structural call into sharp; typed loosely because sharp ships no types here.
      type SharpFactory = (opts: {
        create: { width: number; height: number; channels: 4; background: string };
      }) => {
        composite(items: { input: Buffer; left: number; top: number }[]): {
          png(): { toBuffer(): Promise<Buffer> };
        };
      };
      const sharp = sharpMod as SharpFactory;
      const base = sharp({
        create: { width, height, channels: 4, background: normalizeHex(background) },
      });
      const composite = base.composite(layers.map((l) => ({ input: l.buffer, left: l.x, top: l.y })));
      return composite.png().toBuffer();
    },
  };
}

/**
 * Compose the scene into a single PNG file and return its dimensions/metadata.
 */
export async function composePrototypeStill(
  options: PrototypeStillOptions,
  deps: PrototypeStillDeps = {},
): Promise<PrototypeStillOutput> {
  const scene = PrototypeSceneSchema.parse(options?.scene);
  const outPath = options?.outPath?.trim();
  if (!outPath) throw new Error(`${LOG_PREFIX} composePrototypeStill: outPath must be a non-empty string`);
  if (!path.isAbsolute(outPath)) {
    throw new Error(`${LOG_PREFIX} composePrototypeStill: outPath must be absolute: ${outPath}`);
  }

  const compositor = deps.compositor ?? createSharpCompositor();
  const readFile = deps.readFile ?? ((f: string) => fsPromises.readFile(f));
  const writeFile = deps.writeFile ?? ((f: string, d: Buffer) => fsPromises.writeFile(f, d));
  const mkdir = deps.mkdir ?? ((d: string, o: { recursive: boolean }) => fsPromises.mkdir(d, o));

  const started = Date.now();
  console.log(
    `${LOG_PREFIX} composePrototypeStill start out=${outPath} ` +
      `size=${scene.width}x${scene.height} layers=${scene.layers.length}`,
  );

  let resolved: ResolvedLayer[];
  try {
    resolved = await Promise.all(
      scene.layers.map(async (layer) => ({
        name: layer.name,
        buffer: await resolveLayerBuffer(layer.source, readFile),
        x: layer.x ?? 0,
        y: layer.y ?? 0,
      })),
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} composePrototypeStill resolve-error: ${(err as Error).message}`);
    throw err;
  }

  let png: Buffer;
  try {
    png = await compositor.compose({
      width: scene.width,
      height: scene.height,
      background: scene.background ? normalizeHex(scene.background) : DEFAULT_BACKGROUND,
      layers: resolved,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} composePrototypeStill compose-error: ${(err as Error).message}`);
    throw err;
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, png);

  console.log(
    `${LOG_PREFIX} composePrototypeStill done out=${outPath} bytes=${png.length} ` +
      `durationMs=${Date.now() - started}`,
  );
  return { outPath, width: scene.width, height: scene.height, layerCount: resolved.length };
}
