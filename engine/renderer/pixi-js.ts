/**
 * PixiJS v8 rendering layer for generated games.
 *
 * The reusable visual runtime that a generated game's `render/` folder and `main.ts`
 * consume. Visual-only: audio is a separate layer (`engine/audio/playback.ts`),
 * input is a separate layer (`engine/input/controller.ts`).
 *
 * v8 API traps respected (see research/pixijs.md):
 * - `new Application()` takes NO options; you MUST `await app.init({...})`.
 * - `app.canvas` (not v7 `app.view`).
 * - BaseTexture / beginFill / drawRect are GONE. Graphics is shape-first then `.fill()/.stroke()`.
 * - Load textures via `Assets.load` (Texture.from no longer loads URLs).
 * - Ticker callbacks receive a `Ticker`; use `ticker.deltaTime`.
 *
 * Design note: config builders, manifest mapping, and type guards are pure / Node-safe
 * and unit-tested headlessly. The app/scene/sprite helpers require a browser/WebGL.
 */
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type ApplicationOptions,
  type ColorSource,
  type TextStyleOptions,
  type Ticker,
} from 'pixi.js';
import { z } from 'zod';

export const RENDERER_LOG_PREFIX = '[engine/renderer/pixi-js]';

/* ------------------------------------------------------------------ *
 * Config builders (pure / Node-safe)                                  *
 * ------------------------------------------------------------------ */

/** Renderer preference — string literals in v8 (enums removed). */
export type RendererPreference = 'webgl' | 'webgpu';

/** Zod schema for the subset of init options a generated game declares in config/. */
export const RenderConfigSchema = z
  .object({
    width: z.number().int().positive().default(800),
    height: z.number().int().positive().default(600),
    /** Hex color (e.g. 0x1099bb) for the canvas background. */
    backgroundColor: z.number().int().nonnegative().default(0x000000),
    backgroundAlpha: z.number().min(0).max(1).default(1),
    antialias: z.boolean().default(true),
    /** Pixel-art games want crisp scaling — default OFF so callers opt in. */
    roundPixels: z.boolean().default(false),
    resolution: z.number().positive().default(1),
    preference: z.enum(['webgl', 'webgpu']).default('webgl'),
    autoStart: z.boolean().default(true),
  })
  .strict();

/** Parsed, defaulted render config a generated game persists in `config/`. */
export type RenderConfig = z.infer<typeof RenderConfigSchema>;

/** Raw (pre-default) shape accepted from config JSON / agents. */
export type RenderConfigInput = z.input<typeof RenderConfigSchema>;

/**
 * Validate + apply defaults to a raw render config. Throws (with a structured message)
 * on invalid input so the manifest-validation pass can surface it.
 */
export function parseRenderConfig(input: unknown = {}): RenderConfig {
  const result = RenderConfigSchema.safeParse(input ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ');
    console.error(`${RENDERER_LOG_PREFIX} parseRenderConfig invalid config issues=[${issues}]`);
    throw new Error(`${RENDERER_LOG_PREFIX} parseRenderConfig: invalid render config — ${issues}`);
  }
  console.log(
    `${RENDERER_LOG_PREFIX} parseRenderConfig ok width=${result.data.width} height=${result.data.height} preference=${result.data.preference}`,
  );
  return result.data;
}

/**
 * Translate a validated RenderConfig into the v8 `app.init()` options object.
 * Kept pure (no Pixi calls) so it is unit-testable headlessly.
 */
export function buildApplicationOptions(config: RenderConfig): Partial<ApplicationOptions> {
  const options: Partial<ApplicationOptions> = {
    width: config.width,
    height: config.height,
    backgroundColor: config.backgroundColor as ColorSource,
    backgroundAlpha: config.backgroundAlpha,
    antialias: config.antialias,
    roundPixels: config.roundPixels,
    resolution: config.resolution,
    preference: config.preference,
    autoStart: config.autoStart,
  };
  console.log(`${RENDERER_LOG_PREFIX} buildApplicationOptions size=${config.width}x${config.height}`);
  return options;
}

/* ------------------------------------------------------------------ *
 * Asset manifest mapping (pure / Node-safe)                           *
 * ------------------------------------------------------------------ */

/**
 * A single asset entry from a generated game's `config/` manifest, binding an alias used
 * in code to its on-disk source path (per generations/info.md "json files for each asset
 * tied to the variable used in code").
 */
export const AssetEntrySchema = z
  .object({
    alias: z.string().min(1),
    src: z.string().min(1),
  })
  .strict();

export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const AssetManifestSchema = z.array(AssetEntrySchema);
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

/**
 * Parse + validate a raw asset manifest, asserting unique aliases (a duplicate alias would
 * silently shadow a texture at load time). Throws a structured error otherwise.
 */
export function parseAssetManifest(input: unknown): AssetManifest {
  const result = AssetManifestSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ');
    console.error(`${RENDERER_LOG_PREFIX} parseAssetManifest invalid issues=[${issues}]`);
    throw new Error(`${RENDERER_LOG_PREFIX} parseAssetManifest: invalid manifest — ${issues}`);
  }
  const seen = new Set<string>();
  for (const entry of result.data) {
    if (seen.has(entry.alias)) {
      console.error(`${RENDERER_LOG_PREFIX} parseAssetManifest duplicate alias=${entry.alias}`);
      throw new Error(`${RENDERER_LOG_PREFIX} parseAssetManifest: duplicate asset alias "${entry.alias}"`);
    }
    seen.add(entry.alias);
  }
  console.log(`${RENDERER_LOG_PREFIX} parseAssetManifest ok count=${result.data.length}`);
  return result.data;
}

/**
 * Convert a manifest into the alias→src record callers can inspect. Pure; the actual
 * `Assets.load` call lives in {@link loadTextures}.
 */
export function manifestToAliasMap(manifest: AssetManifest): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of manifest) {
    map[entry.alias] = entry.src;
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * Type guards (pure / Node-safe)                                      *
 * ------------------------------------------------------------------ */

/** True when `value` is a finite, usable hex/number color source. */
export function isColorValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Narrowing guard for a Pixi Container (and its subclasses Sprite/Graphics/Text). */
export function isContainer(value: unknown): value is Container {
  return value instanceof Container;
}

/** Narrowing guard for a Pixi Sprite. */
export function isSprite(value: unknown): value is Sprite {
  return value instanceof Sprite;
}

/* ------------------------------------------------------------------ *
 * Application / scene helpers (require browser + WebGL)               *
 * ------------------------------------------------------------------ */

export interface CreateRendererResult {
  app: Application;
  /** The backing canvas (v8 `app.canvas`) — attach to the DOM yourself, or pass `mountTo`. */
  canvas: HTMLCanvasElement;
}

export interface CreateRendererOptions {
  /** Raw config (validated via {@link parseRenderConfig}). */
  config?: RenderConfigInput | undefined;
  /** Optional element to append the canvas into after init. */
  mountTo?: HTMLElement | undefined;
}

/**
 * Create + asynchronously initialize a PixiJS v8 Application (v8 requires `await app.init`).
 * Returns the app and its canvas. Optionally mounts the canvas into `mountTo`.
 */
export async function createRenderer(options: CreateRendererOptions = {}): Promise<CreateRendererResult> {
  const config = parseRenderConfig(options.config ?? {});
  const initOptions = buildApplicationOptions(config);
  const started = Date.now();
  console.log(`${RENDERER_LOG_PREFIX} createRenderer start preference=${config.preference}`);

  const app = new Application();
  try {
    await app.init(initOptions);
  } catch (err) {
    console.error(`${RENDERER_LOG_PREFIX} createRenderer init failed: ${(err as Error)?.message ?? String(err)}`);
    throw err;
  }

  const canvas = app.canvas;
  if (!canvas) {
    console.error(`${RENDERER_LOG_PREFIX} createRenderer no canvas after init`);
    throw new Error(`${RENDERER_LOG_PREFIX} createRenderer: Application produced no canvas`);
  }
  if (options.mountTo) {
    options.mountTo.appendChild(canvas);
    console.log(`${RENDERER_LOG_PREFIX} createRenderer mounted canvas to <${options.mountTo.tagName.toLowerCase()}>`);
  }

  console.log(`${RENDERER_LOG_PREFIX} createRenderer done durationMs=${Date.now() - started}`);
  return { app, canvas };
}

/**
 * Load textures from a parsed manifest via `Assets.load` (v8: textures must be loaded
 * before use; `Texture.from(url)` no longer fetches). Returns alias→Texture.
 */
export async function loadTextures(manifest: AssetManifest): Promise<Record<string, Texture>> {
  const parsed = manifest === undefined ? [] : parseAssetManifest(manifest);
  if (parsed.length === 0) {
    console.log(`${RENDERER_LOG_PREFIX} loadTextures empty manifest — nothing to load`);
    return {};
  }
  const started = Date.now();
  const bundle = parsed.map((entry) => ({ alias: entry.alias, src: entry.src }));
  console.log(`${RENDERER_LOG_PREFIX} loadTextures start count=${bundle.length}`);

  let loaded: Record<string, Texture>;
  try {
    // Assets.load accepts an array of { alias, src } unresolved asset objects in v8.
    loaded = (await Assets.load(bundle)) as Record<string, Texture>;
  } catch (err) {
    console.error(`${RENDERER_LOG_PREFIX} loadTextures failed: ${(err as Error)?.message ?? String(err)}`);
    throw err;
  }

  console.log(`${RENDERER_LOG_PREFIX} loadTextures done count=${Object.keys(loaded).length} durationMs=${Date.now() - started}`);
  return loaded;
}

export interface SpriteOptions {
  x?: number | undefined;
  y?: number | undefined;
  /** Normalized 0–1 anchor (Sprites only); 0.5 = centered. */
  anchor?: number | undefined;
  scale?: number | undefined;
  rotation?: number | undefined;
  alpha?: number | undefined;
  /** Tint hex; 0xffffff = off. */
  tint?: number | undefined;
  visible?: boolean | undefined;
  label?: string | undefined;
}

/**
 * Create a Sprite from a texture and apply common transform/style properties defensively.
 * Throws on a missing texture (the asset-review loop treats that as a wiring error).
 */
export function createSprite(texture: Texture, options: SpriteOptions = {}): Sprite {
  if (!texture) {
    console.error(`${RENDERER_LOG_PREFIX} createSprite missing texture`);
    throw new Error(`${RENDERER_LOG_PREFIX} createSprite: texture is required`);
  }
  const sprite = new Sprite(texture);
  if (options.anchor !== undefined) sprite.anchor.set(options.anchor);
  if (options.x !== undefined || options.y !== undefined) sprite.position.set(options.x ?? 0, options.y ?? 0);
  if (options.scale !== undefined) sprite.scale.set(options.scale);
  if (options.rotation !== undefined) sprite.rotation = options.rotation;
  if (options.alpha !== undefined) sprite.alpha = options.alpha;
  if (isColorValue(options.tint)) sprite.tint = options.tint;
  if (options.visible !== undefined) sprite.visible = options.visible;
  if (options.label !== undefined) sprite.label = options.label;
  return sprite;
}

export interface RectOptions {
  fill?: number | undefined;
  fillAlpha?: number | undefined;
  stroke?: number | undefined;
  strokeWidth?: number | undefined;
}

/**
 * Build a filled/stroked rectangle the v8 way (shape FIRST, then `.fill()/.stroke()`).
 * v7 `beginFill`/`drawRect`/`endFill` do NOT exist.
 */
export function createRect(x: number, y: number, width: number, height: number, options: RectOptions = {}): Graphics {
  const g = new Graphics().rect(x, y, width, height);
  if (isColorValue(options.fill)) {
    g.fill({ color: options.fill, alpha: options.fillAlpha ?? 1 });
  }
  if (isColorValue(options.stroke)) {
    g.stroke({ color: options.stroke, width: options.strokeWidth ?? 1 });
  }
  return g;
}

/**
 * Create a Text node with v8's options-object constructor.
 */
export function createText(content: string, style: TextStyleOptions = {}): Text {
  const text = new Text({ text: content ?? '', style });
  return text;
}

/**
 * Create an empty Container, optionally labelled and pre-populated with children.
 * Containers are the proper parents — leaf nodes (Sprite/Graphics/Text) should not nest.
 */
export function createScene(label?: string, children: Container[] = []): Container {
  const scene = new Container();
  if (label !== undefined) scene.label = label;
  for (const child of children) {
    if (isContainer(child)) scene.addChild(child);
    else console.error(`${RENDERER_LOG_PREFIX} createScene skipped non-Container child`);
  }
  console.log(`${RENDERER_LOG_PREFIX} createScene label=${label ?? '<none>'} children=${scene.children.length}`);
  return scene;
}

/** A per-frame update callback receiving the v8 Ticker (use `ticker.deltaTime`). */
export type UpdateFn = (ticker: Ticker) => void;

/**
 * Register a per-frame update on the app ticker. Returns a disposer that removes it.
 * v8 ticker callbacks receive a Ticker instance, NOT a delta number.
 */
export function addUpdate(app: Application, fn: UpdateFn): () => void {
  if (!app?.ticker) {
    console.error(`${RENDERER_LOG_PREFIX} addUpdate missing app.ticker`);
    throw new Error(`${RENDERER_LOG_PREFIX} addUpdate: app.ticker is unavailable`);
  }
  app.ticker.add(fn);
  console.log(`${RENDERER_LOG_PREFIX} addUpdate registered (fps=${Math.round(app.ticker.FPS)})`);
  return () => {
    app.ticker.remove(fn);
    console.log(`${RENDERER_LOG_PREFIX} addUpdate disposed`);
  };
}

/**
 * Tear down a renderer: destroy the app + its canvas/textures.
 * Safe to call once; guards against a null/already-destroyed app.
 */
export function destroyRenderer(app: Application | null | undefined): void {
  if (!app) {
    console.log(`${RENDERER_LOG_PREFIX} destroyRenderer no-op (null app)`);
    return;
  }
  try {
    app.destroy(true, { children: true, texture: true });
    console.log(`${RENDERER_LOG_PREFIX} destroyRenderer ok`);
  } catch (err) {
    console.error(`${RENDERER_LOG_PREFIX} destroyRenderer failed: ${(err as Error)?.message ?? String(err)}`);
  }
}
