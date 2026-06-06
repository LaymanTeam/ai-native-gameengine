/**
 * Runtime-generated asset store — the persistence half of the runtime-asset convention
 * (see generations/info.md "Runtime-generated assets" and engine/compiler/game-scaffold.ts).
 *
 * Build-time assets live in assets/** and are imported via the `@` alias (Vite fingerprints
 * them into dist/). Assets a RUNNING game generates at play time (intra-AI generation:
 * sprites, scenes, sfx produced by in-game Gemini calls) cannot join the module graph after
 * the build, so they persist here instead — Zod-validated RxDB documents carrying the asset
 * as a data: URL, loadable directly by PixiJS (`Assets.load(dataUrl)`) and Web Audio
 * (`fetch(dataUrl)`), and surviving reloads alongside the game's saves.
 *
 * Built on createTypedCollection from ./rx-db (research/rxdb.md: PK strings need maxLength;
 * Dexie storage in browsers, memory storage in tests).
 */
import * as z from 'zod';
import type { RxDatabase, RxJsonSchema } from 'rxdb';
import { createTypedCollection, type TypedCollection } from './rx-db';

const RUNTIME_ASSETS_LOG_PREFIX = '[engine/storage/runtime-assets]';

/** Collection name within the game's database. */
export const RUNTIME_ASSETS_COLLECTION = 'runtimeassets';
/** Max id length (RxDB primary keys require an explicit maxLength). */
export const RUNTIME_ASSET_ID_MAX_LENGTH = 128;

/** Categories mirror the build-time assets/** tree so review/manifest tooling can reuse them. */
export const RUNTIME_ASSET_CATEGORIES = [
  'sprites',
  'background',
  'images',
  'sfx',
  'music',
  'scenes',
  'text',
] as const;

export const RuntimeAssetCategorySchema = z.enum(RUNTIME_ASSET_CATEGORIES);
export type RuntimeAssetCategory = z.infer<typeof RuntimeAssetCategorySchema>;

/** One runtime-generated asset, stored whole as a data: URL. */
export const RuntimeAssetDocSchema = z.object({
  /** Stable lookup key, e.g. "sprites/fire-imp-01". */
  id: z.string().min(1).max(RUNTIME_ASSET_ID_MAX_LENGTH),
  category: RuntimeAssetCategorySchema,
  /** data: URL (base64) — the exact shape providers.generateImage returns. */
  dataUrl: z.string().regex(/^data:[a-zA-Z0-9.+/-]+;base64,/u, 'expected a base64 data: URL'),
  mimeType: z.string().min(1),
  /** The prompt that generated this asset (provenance for review/regeneration). */
  prompt: z.string(),
  /** Epoch ms when the asset was generated. */
  createdAt: z.number().int().nonnegative(),
});

export type RuntimeAssetDoc = z.infer<typeof RuntimeAssetDocSchema>;

const RUNTIME_ASSET_RX_SCHEMA: RxJsonSchema<RuntimeAssetDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: RUNTIME_ASSET_ID_MAX_LENGTH },
    category: { type: 'string' },
    dataUrl: { type: 'string' },
    mimeType: { type: 'string' },
    prompt: { type: 'string' },
    createdAt: { type: 'number' },
  },
  required: ['id', 'category', 'dataUrl', 'mimeType', 'prompt', 'createdAt'],
};

/** The runtime-asset surface a generated game uses. */
export interface RuntimeAssetStore {
  /** Underlying typed collection (reactive queries etc.). */
  readonly collection: TypedCollection<RuntimeAssetDoc>;
  /** Validate + persist a runtime-generated asset. Upserts on id. */
  save(doc: RuntimeAssetDoc): Promise<RuntimeAssetDoc>;
  /** Resolve an asset id to its data: URL (PixiJS/Web Audio consume it directly), or null. */
  resolveUrl(id: string): Promise<string | null>;
  /** All stored assets of one category (e.g. to rebuild a sprite atlas on boot). */
  byCategory(category: RuntimeAssetCategory): Promise<RuntimeAssetDoc[]>;
  /** Remove an asset by id. */
  remove(id: string): Promise<boolean>;
}

export interface CreateRuntimeAssetStoreOptions {
  /** The game's RxDatabase (typically `saveStore.db` from createSaveStore). */
  db: RxDatabase;
  /** Component name that originated this store, for log provenance. */
  origin?: string;
}

/**
 * Attach the runtime-asset collection to the game's database.
 *
 * @example
 *   const store = await createSaveStore({ gameName: 'harbor-light' });
 *   const runtimeAssets = await createRuntimeAssetStore({ db: store.db, origin: 'systems/calls' });
 *   const { dataUrl } = await generateImage(stylePreamble + 'a fire imp sprite');
 *   await runtimeAssets.save({ id: 'sprites/fire-imp-01', category: 'sprites', dataUrl,
 *     mimeType: 'image/png', prompt: 'a fire imp sprite', createdAt: Date.now() });
 *   const texture = await Assets.load(await runtimeAssets.resolveUrl('sprites/fire-imp-01'));
 */
export async function createRuntimeAssetStore(
  options: CreateRuntimeAssetStoreOptions,
): Promise<RuntimeAssetStore> {
  if (!options || !options.db) {
    throw new Error(`${RUNTIME_ASSETS_LOG_PREFIX} createRuntimeAssetStore: options.db is required`);
  }
  const origin = options.origin ?? 'runtime-assets';
  console.log(`${RUNTIME_ASSETS_LOG_PREFIX} create origin=${origin}`);

  const collection = await createTypedCollection<RuntimeAssetDoc>({
    db: options.db,
    name: RUNTIME_ASSETS_COLLECTION,
    schema: RUNTIME_ASSET_RX_SCHEMA,
    docSchema: RuntimeAssetDocSchema,
    origin,
  });

  return {
    collection,

    async save(doc) {
      // createTypedCollection re-validates at the write boundary; log generation provenance here.
      console.log(
        `${RUNTIME_ASSETS_LOG_PREFIX} save origin=${origin} id=${doc?.id} category=${doc?.category} bytes~${doc?.dataUrl?.length ?? 0}`,
      );
      return collection.put(doc);
    },

    async resolveUrl(id) {
      if (!id || typeof id !== 'string') {
        console.warn(`${RUNTIME_ASSETS_LOG_PREFIX} resolveUrl invalid id origin=${origin}`);
        return null;
      }
      const doc = await collection.get(id);
      if (!doc) {
        console.warn(`${RUNTIME_ASSETS_LOG_PREFIX} resolveUrl miss origin=${origin} id=${id}`);
        return null;
      }
      return doc.dataUrl;
    },

    async byCategory(category) {
      const parsed = RuntimeAssetCategorySchema.safeParse(category);
      if (!parsed.success) {
        throw new Error(`${RUNTIME_ASSETS_LOG_PREFIX} byCategory: invalid category "${String(category)}"`);
      }
      const all = await collection.all();
      const matches = all.filter((d) => d.category === parsed.data);
      console.log(
        `${RUNTIME_ASSETS_LOG_PREFIX} byCategory origin=${origin} category=${parsed.data} count=${matches.length}`,
      );
      return matches;
    },

    async remove(id) {
      console.log(`${RUNTIME_ASSETS_LOG_PREFIX} remove origin=${origin} id=${id}`);
      return collection.remove(id);
    },
  };
}

/**
 * Resolve any asset reference to a loadable URL — THE single helper game code calls so the
 * build-time/runtime split stays invisible at call sites:
 * - data: URLs pass through (runtime assets already resolved from the store),
 * - "runtime:<file>" maps to the public-dir convention URL /runtime/<file>,
 * - anything else is returned as-is (an imported, fingerprinted build-time asset URL).
 */
export function resolveAssetUrl(ref: string): string {
  if (!ref || typeof ref !== 'string') {
    throw new Error(`${RUNTIME_ASSETS_LOG_PREFIX} resolveAssetUrl: ref must be a non-empty string`);
  }
  if (ref.startsWith('data:')) return ref;
  if (ref.startsWith('runtime:')) {
    const file = ref.slice('runtime:'.length).replace(/^\/+/, '');
    if (file.length === 0) {
      throw new Error(`${RUNTIME_ASSETS_LOG_PREFIX} resolveAssetUrl: empty runtime: reference`);
    }
    return `/runtime/${file}`;
  }
  return ref;
}
