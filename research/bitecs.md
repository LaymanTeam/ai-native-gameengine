# bitECS API Reference (verified against official repo/docs)

> Researched 2026-06-06 against https://github.com/NateTheGreatt/bitECS (README + docs/Intro.md) and release notes.
> **CRITICAL VERSION TRAP:** bitECS **0.4.x** is a complete rewrite. The 0.3.x API (`defineComponent`, `Types.f32`, `defineQuery`, `defineSystem`, `pipe`, `addComponent(world, Component, eid)` arg order) is **GONE**. Most tutorials/LLM memory describe 0.3.x — do not mix the two. This doc covers **0.4 / current master**. `npm i bitecs` (~5kb, zero deps); 0.3.40 is the old legacy line.

## Imports

```ts
import {
  createWorld, createEntityIndex,
  addEntity, removeEntity, entityExists, getEntityComponents,
  addComponent, addComponents, removeComponent, hasComponent,
  getComponent, setComponent, registerComponent,
  query, And, Or, Not, isNested, asBuffer,
  observe, onAdd, onRemove, onSet, onGet,
  createRelation, withStore, withAutoRemoveSubject, makeExclusive,
  getRelationTargets, Wildcard, Hierarchy,
  getHierarchyDepth, getMaxHierarchyDepth,
  addPrefab, IsA,
} from 'bitecs'
```

## World

```ts
const world = createWorld()
// optional custom context object and/or shared entity index:
const world = createWorld({ components: {...}, time: { delta: 0, elapsed: 0, then: performance.now() } })
const idx = createEntityIndex()
const worldA = createWorld(idx); const worldB = createWorld(idx)  // shared eid space
```

The world is just a context object — store your components/time on it if you like (`world.components`, `world.time`).

## Entities

```ts
const eid = addEntity(world)        // number (eid)
removeEntity(world, eid)            // eids recycled IMMEDIATELY on removal
entityExists(world, eid)
getEntityComponents(world, eid)
```

## Components — plain objects, no defineComponent

Recommended SoA (struct-of-arrays):

```ts
const Position = { x: [] as number[], y: [] as number[] }
// or typed arrays (threading/perf): { x: new Float32Array(1e5), y: new Float32Array(1e5) }
// or AoS for small data: const Player = [] as { level: number; name: string }[]
```

```ts
addComponent(world, eid, Position)        // NOTE arg order: (world, eid, Component) — 0.3 was (world, Component, eid)
addComponents(world, eid, [Position, Velocity, Mass])
hasComponent(world, eid, Position)
removeComponent(world, eid, Position)
getComponent(world, eid, Position)        // goes through onGet observer if defined
setComponent(world, eid, Position, { x: 10, y: 20 })  // goes through onSet
registerComponent(world, Position)        // optional explicit registration

// direct mutation (the normal hot path):
Position.x[eid] = 0
Position.y[eid] += 1
// AoS: Player[eid] = { level: 1, name: 'a' }
```

## Queries — direct calls, no defineQuery

```ts
const ents = query(world, [Position, Velocity])     // implicit And
query(world, [Position, Or(Health, Shield), Not(Stunned)])
query(world, [Position], { commit: false })          // safe nested iteration
query(world, [Position], { buffered: true })         // returns Uint32Array
query(world, [Position], isNested)                   // modifier equivalents
query(world, [Position], asBuffer)
```

## Systems — plain functions, no defineSystem/pipe

```ts
const movementSystem = (world) => {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.x[eid] * world.time.delta
    Position.y[eid] += Velocity.y[eid] * world.time.delta
  }
}
const update = () => { movementSystem(world); requestAnimationFrame(update) }
```

## Observers (replace 0.3 enterQuery/exitQuery)

```ts
const unsub = observe(world, onAdd(Position, Not(Velocity)), (eid) => {...})
observe(world, onRemove(Health), (eid) => {...})
observe(world, onSet(Position), (eid, params) => {...})       // fired by setComponent
observe(world, onGet(Position), (eid) => ({ x: Position.x[eid], y: Position.y[eid] }))
```

## Relationships

```ts
const Contains = createRelation(withStore(() => ({ amount: [] as number[] })))
const ChildOf  = createRelation(withAutoRemoveSubject)   // child removed when parent is
const Targeting = createRelation(makeExclusive)          // one target max

addComponent(world, inventory, Contains(gold))
Contains(gold).amount[inventory] = 5

query(world, [Contains('*')])            // all entities containing anything
query(world, [ChildOf(parent)])          // children of specific parent
query(world, [ChildOf(Wildcard)])        // all children
query(world, [Wildcard(earth)])          // all entities related to earth
getRelationTargets(world, inventory, Contains)  // → [gold, ...]
```

## Hierarchies (topological iteration)

```ts
for (const eid of query(world, [Position, Hierarchy(ChildOf)])) { /* parents before children */ }
query(world, [Position, Hierarchy(ChildOf, 2)])   // only depth 2
getHierarchyDepth(world, eid, ChildOf)
getMaxHierarchyDepth(world, ChildOf)
```

## Prefabs

```ts
const Animal = addPrefab(world)
addComponent(world, Animal, Vitals); Vitals.health[Animal] = 100
const Sheep = addPrefab(world)
addComponent(world, Sheep, IsA(Animal))
const sheep = addEntity(world)
addComponent(world, sheep, IsA(Sheep))   // inherits; prefabs themselves excluded from queries
```

## 0.3.x → 0.4 cheat sheet (NEVER emit left column)

| 0.3.x (legacy — do not use) | 0.4 (current) |
|---|---|
| `defineComponent({ x: Types.f32 })` | plain object `{ x: [] as number[] }` |
| `Types.f32` etc. | gone — use arrays/TypedArrays |
| `addComponent(world, Comp, eid)` | `addComponent(world, eid, Comp)` |
| `defineQuery([A,B])` then `q(world)` | `query(world, [A,B])` |
| `enterQuery(q)` / `exitQuery(q)` | `observe(world, onAdd/onRemove(...), cb)` |
| `defineSystem(fn)` / `pipe(a,b)` | plain functions; compose manually |

A `legacy` compatibility module exists in 0.4, but don't target it.

## Sources
- https://github.com/NateTheGreatt/bitECS (README)
- https://github.com/NateTheGreatt/bitECS/blob/master/docs/Intro.md
- https://github.com/NateTheGreatt/bitECS/blob/main/docs/RELEASE_NOTES_0.4.0.md
- https://bitecs.dev/docs/introduction
