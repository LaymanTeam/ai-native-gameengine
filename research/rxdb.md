# RxDB API Reference (verified against official docs/repo)

> Researched 2026-06-06 against https://github.com/pubkey/rxdb (README + docs-src) and rxdb.info.
> Latest at research time: **rxdb 17.3.0** (May 2026). Install: `npm install rxdb rxjs` (rxjs is a peer dep).
> License: Apache-2.0 core; some storages are **premium/paid** — see Storage section.

## Database creation

```js
import { createRxDatabase } from 'rxdb';            // or 'rxdb/plugins/core'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';

const db = await createRxDatabase({
  name: 'heroesdb',            // lowercase, becomes storage key
  storage: getRxStorageDexie(),
  // optional: password, multiInstance (default true in browser), eventReduce, ignoreDuplicate
});
```

### Dev mode (always add in development, NEVER in prod)

```js
import { addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
addRxPlugin(RxDBDevModePlugin);   // readable errors + schema/api validation
```

## Storage adapters

| Storage | Import | Free? |
|---|---|---|
| LocalStorage | `getRxStorageLocalstorage` from `rxdb/plugins/storage-localstorage` | ✅ (simplest, small data) |
| Dexie (IndexedDB via Dexie.js) | `getRxStorageDexie` from `rxdb/plugins/storage-dexie` | ✅ (default free choice for browser) |
| Memory | `getRxStorageMemory` from `rxdb/plugins/storage-memory` | ✅ (tests/cache) |
| IndexedDB (native) | `getRxStorageIndexedDB` from `rxdb-premium/plugins/storage-indexeddb` | 💰 premium |
| OPFS | premium (`rxdb-premium/...`) — fastest browser persistence | 💰 premium |
| SQLite, others | mostly premium | 💰 |

## Schema (JSON Schema dialect)

```js
const heroSchema = {
  version: 0,                       // starts at 0; bump for migrations
  primaryKey: 'name',               // must be string, unique, final, required
  type: 'object',
  properties: {
    name:  { type: 'string', maxLength: 100 },  // maxLength REQUIRED on primary key string
    healthpoints: { type: 'number' },
    active: { type: 'boolean' },
  },
  required: ['name', 'healthpoints'],
  indexes: ['active', ['active', 'name']],      // indexed string/number fields need maxLength / min+max+multipleOf
  // encrypted: ['secretField'], attachments: { encrypted: true },
};
```

- Composite primary key: `primaryKey: { key: 'id', fields: ['firstName','lastName'], separator: '|' }`
- `additionalProperties: false` forced at top level; field names must match `^[a-zA-Z](?:[a-zA-Z0-9_]*[a-zA-Z0-9])?$`; reserved names (collection, primary, revision, toJSON…) forbidden.
- `final: true` on a field = immutable after creation. `default` works on first-level fields.

## Collections

```js
await db.addCollections({
  heroes: {
    schema: heroSchema,
    // migrationStrategies: {...},  // see Migration
  },
});
db.heroes // RxCollection
```

## CRUD

```js
const doc = await db.heroes.insert({ name: 'Bob', healthpoints: 100 });
await db.heroes.upsert({ name: 'Bob', healthpoints: 50 });
await db.heroes.bulkInsert([...]);

// Queries — Mango selector syntax
const alive = await db.heroes.find({ selector: { healthpoints: { $gt: 0 } } }).exec();
const one  = await db.heroes.findOne({ selector: { name: 'alice' } }).exec();   // doc | null
const byPk = await db.heroes.findOne('Bob').exec();        // shortcut: primary key
const must = await db.heroes.findOne('Bob').exec(true);    // throws if missing
const n    = await db.heroes.count({ selector: { healthpoints: { $gt: 0 } } }).exec(); // needs index-backed selector
// sort/skip/limit go in the query object: { selector, sort: [{name:'asc'}], skip: 10, limit: 20 }

// Optional chained builder:
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
addRxPlugin(RxDBQueryBuilderPlugin);
db.heroes.find().where('age').gt(18);
```

RxQueries are immutable — chaining returns NEW query objects; keep the returned reference.

## RxDocument

```js
doc.name;                    // proxied field access
doc.get('name');
await doc.patch({ healthpoints: 50 });            // set fields; may conflict on stale doc
await doc.incrementalPatch({ healthpoints: 50 }); // conflict-safe (refetches latest)
await doc.modify(d => { d.healthpoints++; return d; });
await doc.incrementalModify(d => {...});          // conflict-safe
await doc.remove();          // soft delete (_deleted: true)
doc.getLatest();             // newest snapshot
doc.toJSON();                // immutable plain object; toJSON(true) incl. metadata
doc.toMutableJSON();
```

**Documents are immutable snapshots** — writes produce new instances. Writing through a stale reference throws a conflict error; use `incremental*` or `getLatest()`.

## Reactivity (RxJS)

```js
db.heroes.find({ selector: {...} }).$.subscribe(docs => {...}); // BehaviorSubject — live query results
doc.$.subscribe(d => {...});         // whole document
doc.get$('name').subscribe(v => {...});  // single field
doc.name$.subscribe(v => {...});     // shorthand field observable
doc.deleted$.subscribe(b => {...});  // deletion state; doc.deleted sync getter
```

## Migration

```js
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
addRxPlugin(RxDBMigrationSchemaPlugin);

await db.addCollections({
  heroes: {
    schema: schemaV2,              // version: 2
    migrationStrategies: {
      1: (oldDoc) => { oldDoc.time = new Date(oldDoc.time).getTime(); return oldDoc; },
      2: (oldDoc) => oldDoc.time < cutoff ? null : oldDoc,   // return null → delete doc
    },
  },
});
```

One strategy per version step; runs automatically on collection creation (or on demand).

## Replication (overview)

Plugins for GraphQL, CouchDB, WebSocket, HTTP, Firestore, NATS, Supabase (community), P2P/WebRTC. General shape: `replicateRxCollection({ collection, replicationIdentifier, pull: {...}, push: {...}, live: true })` from `rxdb/plugins/replication` (protocol-specific variants in their own plugin paths). Verify the specific plugin doc before use.

## Common pitfalls

1. **Primary key string MUST have `maxLength`** — schema rejected otherwise.
2. Indexed fields need bounds (`maxLength`, or `minimum`+`maximum`+`multipleOf` for numbers).
3. Without dev-mode plugin, errors are minified codes — add it in dev.
4. `createRxDatabase` with the same name twice throws unless `ignoreDuplicate: true` (dev only).
5. Soft deletes: `remove()` keeps a `_deleted` tombstone (needed for replication).
6. Schema changes require a version bump + migration strategy — no in-place edits.
7. rxjs must be installed; observables end in `$` by convention.

## Sources
- https://github.com/pubkey/rxdb (README, v17.3.0)
- https://github.com/pubkey/rxdb/blob/master/docs-src/docs/rx-document.md
- https://github.com/pubkey/rxdb/blob/master/docs-src/docs/rx-schema.md
- https://github.com/pubkey/rxdb/blob/master/docs-src/docs/rx-query.md
- https://github.com/pubkey/rxdb/blob/master/docs-src/docs/migration-schema.md
- https://rxdb.info/rx-storage.html, https://rxdb.info/premium/
