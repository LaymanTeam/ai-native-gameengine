# Implementation: `engine/ecs/bitecs.ts`

The bitECS **0.4** world/component/system surface every generated game's `systems/` code imports.
bitECS 0.4 is a full rewrite — the 0.3 API (`defineComponent`, `defineQuery`, `Types.f32`,
enter/exitQuery) is GONE. This module wraps the raw 0.4 primitives with a typed `GameWorld`
carrying a `time` context, SoA store factories, entity lifecycle helpers (null-guarded, structured
logging), query/system factories, and observer wrappers — then re-exports the raw primitives so
generated games never dual-import. Built from `research/bitecs.md`.

**Deps:** `bitecs` (createWorld/addEntity/query/observe/soa/And/Or/Not/…).

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `TimeContext` | interface | `{ delta: number; elapsed: number; then: number }` — per-frame timing (seconds). |
| `GameWorldContext` | interface | `{ time: TimeContext }` — context every world carries. |
| `GameWorld<T extends object = {}>` | `World<GameWorldContext & T>` | bitECS world + engine context. |
| `System<T extends object = {}>` | `(world: GameWorld<T>) => void` | Plain-function system (no `defineSystem`). |
| `QueryFn<T extends object = {}>` | `(world: GameWorld<T>) => QueryResult` | Memoized callable query. |
| `FieldSpec<V>` | `V[] \| Float32Array \| Float64Array \| Int32Array \| Uint32Array \| Uint8Array` | SoA field store. |
| `ComponentStore` | `Record<string, FieldSpec<unknown>>` | Struct-of-arrays component. |
| `createGameWorld<T extends object = {}>(extra?: T)` | `=> GameWorld<T>` | World + `time` context; refuses to clobber engine-owned `time`. |
| `destroyGameWorld(world)` | `(GameWorld<object>) => void` | `deleteWorld`, guarded. |
| `advanceTime(world, timestampMs?, maxDelta?)` | `=> number` | Update `time` ctx, returns clamped delta (sec). Guards NaN/negative; clamps hitches to `maxDelta` (default 0.25). |
| `defineComponentStore<S extends ComponentStore>(spec)` | `=> S` | Mark spec as SoA via `soa()` (no `defineComponent` in 0.4). |
| `spawnEntity(world, components?)` | `(GameWorld<object>, ComponentRef[]) => EntityId` | `addEntity` + optional `addComponents`. |
| `despawnEntity(world, eid)` | `=> void` | `removeEntity`, no-op+warn if absent. |
| `attach(world, eid, component)` | `=> boolean` | `addComponent`; true if newly added. |
| `detach(world, eid, ...components)` | `=> void` | `removeComponent`. |
| `has(world, eid, component)` | `=> boolean` | `hasComponent`. |
| `createQuery<T extends object = {}>(terms: QueryTerm[])` | `=> QueryFn<T>` | 0.4 replacement for `defineQuery` (bitECS caches compiled query). |
| `createSystem<T extends object = {}>(name, fn, options?)` | `=> System<T>` | Wrap with try/catch + logging; `{ rethrow?: boolean }` (default false). |
| `createPipeline<T extends object = {}>(...systems)` | `=> System<T>` | Manual left-to-right composition (NOT bitECS `pipe`, which threads return values — wrong for void systems). |
| `runSystems<T extends object = {}>(world, systems)` | `=> void` | Imperative per-tick run. |
| `onEntityAdded(world, terms, callback)` | `=> () => void` | `observe(world, onAdd(...terms), …)` (replaces 0.3 enterQuery); returns unsubscribe. |
| `onEntityRemoved(world, terms, callback)` | `=> () => void` | `observe(world, onRemove(...terms), …)` (replaces 0.3 exitQuery). |

Re-exported raw bitECS primitives: operators `And`/`Or`/`Not`; primitives `query`, `addComponent`,
`addComponents`, `removeComponent`, `hasComponent`, `getComponent`, `setComponent`, `addEntity`,
`removeEntity`, `entityExists`, `getEntityComponents`, `observe`, `onAdd`, `onRemove`; types
`World`, `EntityId`, `QueryResult`, `QueryTerm`, `ComponentRef`.

### Usage

```ts
import { createGameWorld, defineComponentStore, spawnEntity, createQuery, createSystem,
         createPipeline, advanceTime } from '@/engine/ecs/bitecs';

const world = createGameWorld();
const Position = defineComponentStore({ x: [] as number[], y: [] as number[] });
const Velocity = defineComponentStore({ x: new Float32Array(1000), y: new Float32Array(1000) });

const eid = spawnEntity(world, [Position, Velocity]);
const moving = createQuery([Position, Velocity]);
const move = createSystem('move', (w) => { for (const e of moving(w)) { /* ... */ } });
const update = createPipeline(move);
function loop(t: number) { advanceTime(world, t); update(world); requestAnimationFrame(loop); }
```

### Design notes

- `createGameWorld` builds a plain context record then casts once; it ignores `extra.time` so the
  engine-owned timing context can never be overwritten.
- `createPipeline` deliberately does **not** use bitECS's `pipe` — `pipe` is functional
  composition that threads each function's return value to the next, which is wrong for void
  systems sharing one world. Each system here is called with the original world, in order.

### Test

`engine/ecs/bitecs.test.ts` — run `npx tsx engine/ecs/bitecs.test.ts`.
