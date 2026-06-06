/**
 * We'll make a general series of typesafe, zod schemaed, RxDB methods that the games can call and reuse for logic.
 */

/**
 * engine/storage/rx-db.ts
 *
 * Reusable, Zod-validated RxDB save/state layer for every generated game (the `saves/` folder
 * per generations/info.md). Generated games import these factories instead of hand-rolling
 * persistence: a single save-slot store covering the common case (one JSON blob of game state
 * per named slot), plus a generic typed-collection factory for games that need structured
 * tables.
 *
 * Storage: Dexie (IndexedDB) is the free browser default per research/rxdb.md. Tests inject the
 * memory storage adapter. RxDB primary keys must be strings with maxLength; this module enforces
 * that and validates EVERY data boundary with Zod before it reaches RxDB.
 *
 * Conventions match engine/ai/providers.ts: named exports, factory functions, structured
 * console logging of success AND error states (with the originating component recorded per the
 * user's logging convention), defensive null guards.
 */

import {
  createRxDatabase,
  addRxPlugin,
  type RxDatabase,
  type RxCollection,
  type RxJsonSchema,
  type RxStorage,
} from 'rxdb';
import { z } from 'zod';

const STORAGE_LOG_PREFIX = '[engine/storage/rx-db]';

/** Set true once dev-mode plugin is registered so we never add it twice (throws otherwise). */
let devModeRegistered = false;

/**
 * Register RxDB dev-mode in non-production for readable schema/query errors.
 * NEVER active in production per research/rxdb.md.
 */
async function ensureDevMode(): Promise<void> {
  if (devModeRegistered) return;
  if (process.env['NODE_ENV'] === 'production') return;
  try {
    const { RxDBDevModePlugin, disableWarnings } = await import('rxdb/plugins/dev-mode');
    addRxPlugin(RxDBDevModePlugin);
    // Silence the noisy "dev-mode is enabled" console banner; we do our own logging.
    if (typeof disableWarnings === 'function') disableWarnings();
    devModeRegistered = true;
    console.log(`${STORAGE_LOG_PREFIX} dev-mode plugin registered`);
  } catch (err) {
    console.error(`${STORAGE_LOG_PREFIX} dev-mode plugin registration failed`, err);
  }
}

/**
 * When dev-mode is active, RxDB requires the storage to carry a top-level JSON-schema validator
 * (RxError DVM1). Wrap the given storage with the AJV validator in non-production. In production
 * (where dev-mode is off) the storage is returned unchanged — Zod still guards every write.
 */
async function withDevModeValidator(
  storage: RxStorage<unknown, unknown>,
): Promise<RxStorage<unknown, unknown>> {
  if (process.env['NODE_ENV'] === 'production') return storage;
  try {
    const { wrappedValidateAjvStorage } = await import('rxdb/plugins/validate-ajv');
    return wrappedValidateAjvStorage({ storage }) as RxStorage<unknown, unknown>;
  } catch (err) {
    console.error(`${STORAGE_LOG_PREFIX} AJV validator wrap failed; using raw storage`, err);
    return storage;
  }
}

/* -------------------------------------------------------------------------- */
/* Save-slot store — the common case                                          */
/* -------------------------------------------------------------------------- */

/** Maximum length of a save-slot id (primary key). RxDB requires a bound on PK strings. */
export const SAVE_SLOT_MAX_LENGTH = 128;

/**
 * RxDocument shape persisted for each save slot. `state` is a JSON-serialized snapshot of the
 * game state validated by the caller's Zod schema before write and after read.
 */
export interface SaveSlotDoc {
  /** Save-slot id (primary key), e.g. "autosave", "slot-1". */
  slot: string;
  /** JSON-serialized, Zod-validated game state. */
  state: string;
  /** Schema version of the persisted state (caller-defined, for migrations). */
  version: number;
  /** Epoch millis of last write. */
  updatedAt: number;
}

const saveSlotJsonSchema: RxJsonSchema<SaveSlotDoc> = {
  version: 0,
  primaryKey: 'slot',
  type: 'object',
  properties: {
    slot: { type: 'string', maxLength: SAVE_SLOT_MAX_LENGTH },
    state: { type: 'string' },
    version: { type: 'number' },
    updatedAt: { type: 'number', minimum: 0, maximum: 1e15, multipleOf: 1 },
  },
  required: ['slot', 'state', 'version', 'updatedAt'],
  indexes: ['updatedAt'],
};

type SaveSlotCollection = RxCollection<SaveSlotDoc>;

/** Database handle bundling the underlying RxDatabase with the save-slot collection. */
export interface SaveStore<TState> {
  /** Underlying RxDatabase — exposed for advanced callers (replication, custom collections). */
  readonly db: RxDatabase;
  /** Persist (insert or overwrite) game state into a slot. Validates with the store's schema. */
  save(slot: string, state: TState): Promise<SaveSlotDoc>;
  /** Load and Zod-validate the game state for a slot, or null if the slot is empty. */
  load(slot: string): Promise<TState | null>;
  /** List the ids of all non-deleted save slots, newest write first. */
  listSlots(): Promise<string[]>;
  /** Remove a save slot. Returns true if a slot was removed, false if it did not exist. */
  deleteSlot(slot: string): Promise<boolean>;
  /** Close the database connection (frees storage handles). */
  close(): Promise<void>;
}

export interface CreateSaveStoreOptions<TState> {
  /** Database name — lowercase, becomes the storage key. Defaults to `<gameName>_saves`. */
  dbName?: string;
  /** Generated game name; used to derive a default dbName and for log provenance. */
  gameName: string;
  /** Zod schema validating the game state at every read/write boundary. */
  stateSchema: z.ZodType<TState>;
  /**
   * RxStorage adapter. Defaults to Dexie (IndexedDB) for browsers. Tests pass
   * `getRxStorageMemory()`. Required when running in Node without IndexedDB.
   */
  storage?: RxStorage<unknown, unknown>;
  /** Caller-defined state schema version persisted alongside each slot (default 0). */
  stateVersion?: number;
  /** Component name that originated this store, for log provenance (per user convention). */
  origin?: string;
}

function normalizeDbName(raw: string): string {
  // RxDB database names must be lowercase and url-safe-ish; sanitize defensively.
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'game';
}

/**
 * Create (or open) a Zod-validated save store for a generated game.
 *
 * @example
 *   const store = await createSaveStore({
 *     gameName: 'space-miner',
 *     stateSchema: z.object({ level: z.number(), gold: z.number() }),
 *   });
 *   await store.save('autosave', { level: 3, gold: 120 });
 *   const state = await store.load('autosave');
 */
export async function createSaveStore<TState>(
  options: CreateSaveStoreOptions<TState>,
): Promise<SaveStore<TState>> {
  if (!options || typeof options !== 'object') {
    throw new Error(`${STORAGE_LOG_PREFIX} createSaveStore: options object is required`);
  }
  const { gameName, stateSchema } = options;
  if (!gameName || typeof gameName !== 'string') {
    throw new Error(`${STORAGE_LOG_PREFIX} createSaveStore: gameName must be a non-empty string`);
  }
  if (!stateSchema || typeof stateSchema.safeParse !== 'function') {
    throw new Error(`${STORAGE_LOG_PREFIX} createSaveStore: stateSchema must be a Zod schema`);
  }

  const origin = options.origin ?? gameName;
  const stateVersion = options.stateVersion ?? 0;
  const dbName = normalizeDbName(options.dbName ?? `${gameName}_saves`);

  await ensureDevMode();

  let storage: RxStorage<unknown, unknown>;
  if (options.storage) {
    storage = options.storage;
  } else {
    // Lazy-import Dexie storage so Node test/build paths that pass memory storage never load it.
    const { getRxStorageDexie } = await import('rxdb/plugins/storage-dexie');
    storage = getRxStorageDexie();
  }
  // Dev-mode mandates a top-level schema validator on the storage (RxError DVM1). Wrap with AJV
  // in non-production; in production we skip the wrapper for performance (Zod already guards writes).
  storage = await withDevModeValidator(storage);

  console.log(
    `${STORAGE_LOG_PREFIX} createSaveStore origin=${origin} dbName=${dbName} stateVersion=${stateVersion} storage=${options.storage ? 'injected' : 'dexie'}`,
  );

  let db: RxDatabase;
  try {
    db = await createRxDatabase({
      name: dbName,
      storage,
      ignoreDuplicate: process.env['NODE_ENV'] !== 'production',
    });
  } catch (err) {
    console.error(`${STORAGE_LOG_PREFIX} createSaveStore origin=${origin} db creation failed`, err);
    throw err;
  }

  let collection: SaveSlotCollection;
  try {
    const created = await db.addCollections<{ saveslots: { schema: typeof saveSlotJsonSchema } }>({
      saveslots: { schema: saveSlotJsonSchema },
    });
    collection = created.saveslots;
  } catch (err) {
    console.error(`${STORAGE_LOG_PREFIX} createSaveStore origin=${origin} addCollections failed`, err);
    await db.close().catch(() => undefined);
    throw err;
  }

  console.log(`${STORAGE_LOG_PREFIX} createSaveStore ready origin=${origin} dbName=${dbName}`);

  return {
    db,

    async save(slot, state) {
      if (!slot || typeof slot !== 'string') {
        throw new Error(`${STORAGE_LOG_PREFIX} save: slot must be a non-empty string (origin=${origin})`);
      }
      if (slot.length > SAVE_SLOT_MAX_LENGTH) {
        throw new Error(
          `${STORAGE_LOG_PREFIX} save: slot exceeds ${SAVE_SLOT_MAX_LENGTH} chars (origin=${origin})`,
        );
      }
      const parsed = stateSchema.safeParse(state);
      if (!parsed.success) {
        console.error(
          `${STORAGE_LOG_PREFIX} save validation failed origin=${origin} slot=${slot}`,
          parsed.error.issues,
        );
        throw new Error(
          `${STORAGE_LOG_PREFIX} save: state failed Zod validation (origin=${origin}, slot=${slot}): ${parsed.error.message}`,
        );
      }
      const doc: SaveSlotDoc = {
        slot,
        state: JSON.stringify(parsed.data),
        version: stateVersion,
        updatedAt: Date.now(),
      };
      try {
        const written = await collection.upsert(doc);
        console.log(`${STORAGE_LOG_PREFIX} save ok origin=${origin} slot=${slot} bytes=${doc.state.length}`);
        return written.toJSON() as SaveSlotDoc;
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} save failed origin=${origin} slot=${slot}`, err);
        throw err;
      }
    },

    async load(slot) {
      if (!slot || typeof slot !== 'string') {
        throw new Error(`${STORAGE_LOG_PREFIX} load: slot must be a non-empty string (origin=${origin})`);
      }
      try {
        const found = await collection.findOne(slot).exec();
        if (!found) {
          console.log(`${STORAGE_LOG_PREFIX} load miss origin=${origin} slot=${slot}`);
          return null;
        }
        const raw = found.get('state');
        let decoded: unknown;
        try {
          decoded = JSON.parse(raw);
        } catch (parseErr) {
          console.error(`${STORAGE_LOG_PREFIX} load JSON parse failed origin=${origin} slot=${slot}`, parseErr);
          throw new Error(`${STORAGE_LOG_PREFIX} load: corrupt JSON in slot ${slot} (origin=${origin})`);
        }
        const parsed = stateSchema.safeParse(decoded);
        if (!parsed.success) {
          console.error(
            `${STORAGE_LOG_PREFIX} load validation failed origin=${origin} slot=${slot}`,
            parsed.error.issues,
          );
          throw new Error(
            `${STORAGE_LOG_PREFIX} load: persisted state failed Zod validation (origin=${origin}, slot=${slot}): ${parsed.error.message}`,
          );
        }
        console.log(`${STORAGE_LOG_PREFIX} load ok origin=${origin} slot=${slot}`);
        return parsed.data;
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} load failed origin=${origin} slot=${slot}`, err);
        throw err;
      }
    },

    async listSlots() {
      try {
        const docs = await collection.find({ sort: [{ updatedAt: 'desc' }] }).exec();
        const slots = docs.map((d) => d.get('slot'));
        console.log(`${STORAGE_LOG_PREFIX} listSlots ok origin=${origin} count=${slots.length}`);
        return slots;
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} listSlots failed origin=${origin}`, err);
        throw err;
      }
    },

    async deleteSlot(slot) {
      if (!slot || typeof slot !== 'string') {
        throw new Error(`${STORAGE_LOG_PREFIX} deleteSlot: slot must be a non-empty string (origin=${origin})`);
      }
      try {
        const found = await collection.findOne(slot).exec();
        if (!found) {
          console.log(`${STORAGE_LOG_PREFIX} deleteSlot miss origin=${origin} slot=${slot}`);
          return false;
        }
        await found.remove();
        console.log(`${STORAGE_LOG_PREFIX} deleteSlot ok origin=${origin} slot=${slot}`);
        return true;
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} deleteSlot failed origin=${origin} slot=${slot}`, err);
        throw err;
      }
    },

    async close() {
      try {
        await db.close();
        console.log(`${STORAGE_LOG_PREFIX} close ok origin=${origin} dbName=${dbName}`);
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} close failed origin=${origin} dbName=${dbName}`, err);
        throw err;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Generic typed-collection factory — for structured game tables              */
/* -------------------------------------------------------------------------- */

/** A typed document persisted in a generic collection: must carry a string primary key field. */
export type TypedDoc = Record<string, unknown>;

export interface CreateTypedCollectionOptions<TDoc extends TypedDoc> {
  /** Existing RxDatabase to attach the collection to (e.g. `saveStore.db`). */
  db: RxDatabase;
  /** Collection name (lowercase, letters/digits). */
  name: string;
  /** RxDB JSON schema for the collection (PK string needs maxLength per research/rxdb.md). */
  schema: RxJsonSchema<TDoc>;
  /** Zod schema validating each document at the write boundary. */
  docSchema: z.ZodType<TDoc>;
  /** Component name that originated this collection, for log provenance. */
  origin?: string;
}

/** A Zod-guarded typed collection wrapper. */
export interface TypedCollection<TDoc extends TypedDoc> {
  /** The underlying RxCollection for reactive/advanced use. */
  readonly collection: RxCollection<TDoc>;
  /** Validate then upsert a document. */
  put(doc: TDoc): Promise<TDoc>;
  /** Fetch a document by primary key, or null. */
  get(primaryKey: string): Promise<TDoc | null>;
  /** Remove a document by primary key. Returns true if removed. */
  remove(primaryKey: string): Promise<boolean>;
  /** Return all non-deleted documents. */
  all(): Promise<TDoc[]>;
}

/**
 * Attach a Zod-validated typed collection to an existing database. Useful for games that need
 * structured persistence (inventory rows, entity records) beyond a single state blob.
 *
 * @example
 *   const inv = await createTypedCollection({
 *     db: store.db,
 *     name: 'inventory',
 *     schema: { version: 0, primaryKey: 'id', type: 'object',
 *       properties: { id: { type: 'string', maxLength: 64 }, qty: { type: 'number' } },
 *       required: ['id', 'qty'] },
 *     docSchema: z.object({ id: z.string(), qty: z.number() }),
 *   });
 */
export async function createTypedCollection<TDoc extends TypedDoc>(
  options: CreateTypedCollectionOptions<TDoc>,
): Promise<TypedCollection<TDoc>> {
  if (!options || typeof options !== 'object') {
    throw new Error(`${STORAGE_LOG_PREFIX} createTypedCollection: options object is required`);
  }
  const { db, name, schema, docSchema } = options;
  if (!db) throw new Error(`${STORAGE_LOG_PREFIX} createTypedCollection: db is required`);
  if (!name || typeof name !== 'string') {
    throw new Error(`${STORAGE_LOG_PREFIX} createTypedCollection: name must be a non-empty string`);
  }
  if (!schema || typeof schema !== 'object') {
    throw new Error(`${STORAGE_LOG_PREFIX} createTypedCollection: schema is required`);
  }
  if (!docSchema || typeof docSchema.safeParse !== 'function') {
    throw new Error(`${STORAGE_LOG_PREFIX} createTypedCollection: docSchema must be a Zod schema`);
  }

  const origin = options.origin ?? name;
  const primaryKeyField =
    typeof schema.primaryKey === 'string' ? schema.primaryKey : schema.primaryKey.key;

  let collection: RxCollection<TDoc>;
  try {
    const created = await db.addCollections<Record<string, { schema: RxJsonSchema<TDoc> }>>({
      [name]: { schema },
    });
    collection = created[name] as RxCollection<TDoc>;
  } catch (err) {
    console.error(`${STORAGE_LOG_PREFIX} createTypedCollection failed origin=${origin} name=${name}`, err);
    throw err;
  }

  console.log(`${STORAGE_LOG_PREFIX} createTypedCollection ready origin=${origin} name=${name} pk=${primaryKeyField}`);

  return {
    collection,

    async put(doc) {
      const parsed = docSchema.safeParse(doc);
      if (!parsed.success) {
        console.error(
          `${STORAGE_LOG_PREFIX} put validation failed origin=${origin} name=${name}`,
          parsed.error.issues,
        );
        throw new Error(
          `${STORAGE_LOG_PREFIX} put: doc failed Zod validation (origin=${origin}, name=${name}): ${parsed.error.message}`,
        );
      }
      try {
        const written = await collection.upsert(parsed.data);
        console.log(`${STORAGE_LOG_PREFIX} put ok origin=${origin} name=${name}`);
        return written.toJSON() as TDoc;
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} put failed origin=${origin} name=${name}`, err);
        throw err;
      }
    },

    async get(primaryKey) {
      if (!primaryKey || typeof primaryKey !== 'string') {
        throw new Error(`${STORAGE_LOG_PREFIX} get: primaryKey must be a non-empty string (origin=${origin})`);
      }
      try {
        const found = await collection.findOne(primaryKey).exec();
        if (!found) {
          console.log(`${STORAGE_LOG_PREFIX} get miss origin=${origin} name=${name} pk=${primaryKey}`);
          return null;
        }
        console.log(`${STORAGE_LOG_PREFIX} get ok origin=${origin} name=${name} pk=${primaryKey}`);
        return found.toJSON() as TDoc;
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} get failed origin=${origin} name=${name} pk=${primaryKey}`, err);
        throw err;
      }
    },

    async remove(primaryKey) {
      if (!primaryKey || typeof primaryKey !== 'string') {
        throw new Error(`${STORAGE_LOG_PREFIX} remove: primaryKey must be a non-empty string (origin=${origin})`);
      }
      try {
        const found = await collection.findOne(primaryKey).exec();
        if (!found) {
          console.log(`${STORAGE_LOG_PREFIX} remove miss origin=${origin} name=${name} pk=${primaryKey}`);
          return false;
        }
        await found.remove();
        console.log(`${STORAGE_LOG_PREFIX} remove ok origin=${origin} name=${name} pk=${primaryKey}`);
        return true;
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} remove failed origin=${origin} name=${name} pk=${primaryKey}`, err);
        throw err;
      }
    },

    async all() {
      try {
        const docs = await collection.find().exec();
        console.log(`${STORAGE_LOG_PREFIX} all ok origin=${origin} name=${name} count=${docs.length}`);
        return docs.map((d) => d.toJSON() as TDoc);
      } catch (err) {
        console.error(`${STORAGE_LOG_PREFIX} all failed origin=${origin} name=${name}`, err);
        throw err;
      }
    },
  };
}
