# Implementation: `engine/storage/rx-db.ts`

Reusable, Zod-validated RxDB save/state layer for every generated game (the `saves/` folder per
`generations/info.md`). A single save-slot store covers the common case (one JSON blob of state per
named slot); a generic typed-collection factory covers structured tables. Every data boundary is
Zod-validated before it reaches RxDB. Built from `research/rxdb.md`.

**Deps:** `rxdb` (createRxDatabase/addRxPlugin/types), `zod`. Lazy-imported plugins:
`rxdb/plugins/dev-mode`, `rxdb/plugins/validate-ajv`, `rxdb/plugins/storage-dexie`.

### Storage / dev-mode
Dexie (IndexedDB) is the free browser default; tests inject `getRxStorageMemory()`. Dev-mode is
registered once in non-production (`disableWarnings()` silences the banner) and, when active,
mandates a top-level JSON-schema validator on the storage (RxError DVM1) — so the storage is
wrapped with `wrappedValidateAjvStorage` in non-prod and left raw in prod (Zod still guards writes).
RxDB primary keys must be strings with a `maxLength` bound (`SAVE_SLOT_MAX_LENGTH = 128`).

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `SAVE_SLOT_MAX_LENGTH` | `const` (128) | PK string length bound. |
| `SaveSlotDoc` | interface | `{ slot, state, version, updatedAt }` persisted shape. |
| `SaveStore<TState>` | interface | `{ db; save(slot, state); load(slot); listSlots(); deleteSlot(slot); close() }`. |
| `CreateSaveStoreOptions<TState>` | interface | `{ dbName?, gameName, stateSchema, storage?, stateVersion?, origin? }`. |
| `createSaveStore<TState>(options)` | `=> Promise<SaveStore<TState>>` | Open/create a Zod-validated save store. |
| `TypedDoc` | `Record<string, unknown>` | Typed collection doc (string PK field). |
| `CreateTypedCollectionOptions<TDoc>` | interface | `{ db, name, schema, docSchema, origin? }`. |
| `TypedCollection<TDoc>` | interface | `{ collection; put(doc); get(pk); remove(pk); all() }`. |
| `createTypedCollection<TDoc extends TypedDoc>(options)` | `=> Promise<TypedCollection<TDoc>>` | Attach a Zod-guarded typed collection to an existing db. |

`SaveStore` methods: `save(slot, state): Promise<SaveSlotDoc>`, `load(slot): Promise<TState | null>`,
`listSlots(): Promise<string[]>` (newest write first), `deleteSlot(slot): Promise<boolean>`,
`close(): Promise<void>`. `TypedCollection`: `put(doc): Promise<TDoc>`, `get(pk): Promise<TDoc | null>`,
`remove(pk): Promise<boolean>`, `all(): Promise<TDoc[]>`.

### Usage

```ts
import { createSaveStore, createTypedCollection } from '@/engine/storage/rx-db';
import { z } from 'zod';

const store = await createSaveStore({
  gameName: 'space-miner',
  stateSchema: z.object({ level: z.number(), gold: z.number() }),
});
await store.save('autosave', { level: 3, gold: 120 });
const state = await store.load('autosave'); // Zod-validated on read, null on miss

const inv = await createTypedCollection({
  db: store.db, name: 'inventory',
  schema: { version: 0, primaryKey: 'id', type: 'object',
    properties: { id: { type: 'string', maxLength: 64 }, qty: { type: 'number' } },
    required: ['id', 'qty'] },
  docSchema: z.object({ id: z.string(), qty: z.number() }),
});
```

### Design notes
- `save` JSON-serializes `stateSchema`-validated data into `state`; `load` JSON-parses then
  re-validates, throwing a structured error on corrupt JSON or schema drift.
- `normalizeDbName` lowercases/url-sanitizes; `ignoreDuplicate` is enabled outside production so
  hot-reload re-opening the same db name doesn't throw.
- Every method logs an `origin=` provenance tag (defaults to `gameName`/collection name).

### Test
`engine/storage/rx-db.test.ts` — run `npx tsx engine/storage/rx-db.test.ts` (memory-storage adapter,
fully offline).
