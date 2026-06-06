/**
 * bitECS 0.4 world/component/system helpers reused by every generated game's systems/ code.
 * CRITICAL: bitECS 0.4 is a full rewrite — the 0.3 API (defineComponent, defineQuery, Types.f32)
 * is GONE. Use createWorld/addEntity/addComponent/query per research/bitecs.md only.
 *
 * This module is the ergonomic, defensively-logged surface that generated games import from their
 * systems/ folder. It wraps the raw bitECS 0.4 primitives with:
 *   - a typed GameWorld carrying a `time` context (delta/elapsed) for movement-style systems,
 *   - SoA component-store factories (no defineComponent — plain arrays / TypedArrays),
 *   - entity lifecycle helpers with null guards + structured logging,
 *   - query + system factories that compose via the official 0.4 `pipe`,
 *   - observer wrappers (onAdd/onRemove) replacing the removed 0.3 enter/exitQuery.
 *
 * Raw bitECS primitives are re-exported at the bottom so generated games never dual-import.
 */
import {
  createWorld,
  deleteWorld,
  addEntity,
  removeEntity,
  entityExists,
  getEntityComponents,
  addComponent,
  addComponents,
  removeComponent,
  hasComponent,
  getComponent,
  setComponent,
  query,
  observe,
  onAdd,
  onRemove,
  And,
  Or,
  Not,
  soa,
  type World,
  type EntityId,
  type QueryResult,
  type QueryTerm,
  type ComponentRef,
} from 'bitecs';

const ECS_LOG_PREFIX = '[engine/ecs/bitecs]';

/**
 * Frame timing context stored on every GameWorld. Movement/physics systems read `delta`
 * (seconds) so behaviour is framerate-independent. Mirrors the `world.time` shape in
 * research/bitecs.md.
 */
export interface TimeContext {
  /** Seconds elapsed since the previous tick. */
  delta: number;
  /** Total seconds elapsed since world creation. */
  elapsed: number;
  /** Timestamp (ms, performance.now scale) of the previous tick. */
  then: number;
}

/** Custom context every generated game's world carries. Extendable per game via the type param. */
export interface GameWorldContext {
  time: TimeContext;
}

/** A bitECS world augmented with the engine's game context (time, etc.). */
export type GameWorld<T extends object = {}> = World<GameWorldContext & T>;

/** A system is a plain function of the world (bitECS 0.4 convention — no defineSystem). */
export type System<T extends object = {}> = (world: GameWorld<T>) => void;

/** A memoized, callable query bound to a fixed set of terms. */
export type QueryFn<T extends object = {}> = (world: GameWorld<T>) => QueryResult;

/**
 * SoA field spec: each component field is either a growable plain array or a fixed TypedArray.
 * Plain arrays auto-grow (good for prototypes / string/object fields); TypedArrays are the
 * perf/threading hot path but must be pre-sized to a max entity count.
 */
export type FieldSpec<V> = V[] | Float32Array | Float64Array | Int32Array | Uint32Array | Uint8Array;

/** A component store is a struct-of-arrays: a record of named field arrays indexed by eid. */
export type ComponentStore = Record<string, FieldSpec<unknown>>;

/** Monotonic clock; falls back to Date.now when performance is unavailable (some serverless ctx). */
function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Create a game world with an attached time context. Pass extra context fields via `extra`;
 * they are merged onto the world object (bitECS worlds are plain context objects).
 */
export function createGameWorld<T extends object = {}>(extra?: T): GameWorld<T> {
  try {
    // bitECS worlds are plain context objects; build the record then cast once to the typed view.
    const base = createWorld<GameWorldContext & T>() as Record<string, unknown>;
    base.time = { delta: 0, elapsed: 0, then: now() } satisfies TimeContext;
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        // Defensive: never clobber the engine-owned `time` context.
        if (key === 'time') {
          console.warn(`${ECS_LOG_PREFIX} createGameWorld ignored extra.time (engine-owned)`);
          continue;
        }
        base[key] = value;
      }
    }
    console.log(`${ECS_LOG_PREFIX} createGameWorld ok`, { extraKeys: extra ? Object.keys(extra) : [] });
    return base as GameWorld<T>;
  } catch (err) {
    console.error(`${ECS_LOG_PREFIX} createGameWorld failed`, err);
    throw err;
  }
}

/** Tear down a world's internal stores. Safe to call once at game shutdown. */
export function destroyGameWorld(world: GameWorld<object>): void {
  if (!world) {
    console.warn(`${ECS_LOG_PREFIX} destroyGameWorld called with no world`);
    return;
  }
  try {
    deleteWorld(world);
    console.log(`${ECS_LOG_PREFIX} destroyGameWorld ok`);
  } catch (err) {
    console.error(`${ECS_LOG_PREFIX} destroyGameWorld failed`, err);
    throw err;
  }
}

/**
 * Advance a world's time context. Call once per frame with the current high-res timestamp
 * (e.g. from requestAnimationFrame or a fixed-step loop). Returns the delta (seconds) applied.
 * Guards against negative/NaN deltas and absurd hitches (clamped to `maxDelta`).
 */
export function advanceTime(world: GameWorld<object>, timestampMs: number = now(), maxDelta = 0.25): number {
  if (!world || !world.time) {
    console.error(`${ECS_LOG_PREFIX} advanceTime: world or world.time missing`);
    return 0;
  }
  const ts = Number.isFinite(timestampMs) ? timestampMs : now();
  let delta = (ts - world.time.then) / 1000;
  if (!Number.isFinite(delta) || delta < 0) delta = 0;
  if (delta > maxDelta) {
    console.warn(`${ECS_LOG_PREFIX} advanceTime clamped hitch`, { delta, maxDelta });
    delta = maxDelta;
  }
  world.time.delta = delta;
  world.time.elapsed += delta;
  world.time.then = ts;
  return delta;
}

/**
 * Define an SoA component store from a field spec (no defineComponent in 0.4). Returns the spec
 * marked as struct-of-arrays via `soa` (identity-stable reference used as the component handle for
 * add/query). Use plain arrays for growable/string/object fields, TypedArrays for the numeric hot
 * path.
 *
 * @example
 *   const Position = defineComponentStore({ x: [] as number[], y: [] as number[] });
 *   const Velocity = defineComponentStore({ x: new Float32Array(10000), y: new Float32Array(10000) });
 */
export function defineComponentStore<S extends ComponentStore>(spec: S): S {
  if (!spec || typeof spec !== 'object') {
    const msg = `${ECS_LOG_PREFIX} defineComponentStore requires a field-spec object`;
    console.error(msg, { spec });
    throw new TypeError(msg);
  }
  // `soa` is the bitECS 0.4 marker for struct-of-arrays component stores.
  const store = soa(spec) as S;
  console.log(`${ECS_LOG_PREFIX} defineComponentStore ok`, { fields: Object.keys(spec) });
  return store;
}

/**
 * Spawn an entity, optionally attaching components in one call. Returns the new eid.
 * NOTE: bitECS recycles eids immediately on removal — never cache an eid past its removal.
 */
export function spawnEntity(world: GameWorld<object>, components: ComponentRef[] = []): EntityId {
  if (!world) {
    const msg = `${ECS_LOG_PREFIX} spawnEntity called with no world`;
    console.error(msg);
    throw new TypeError(msg);
  }
  try {
    const eid = addEntity(world);
    if (components.length > 0) {
      addComponents(world, eid, components);
    }
    console.log(`${ECS_LOG_PREFIX} spawnEntity ok`, { eid, components: components.length });
    return eid;
  } catch (err) {
    console.error(`${ECS_LOG_PREFIX} spawnEntity failed`, err);
    throw err;
  }
}

/** Remove an entity (and its components). No-op with a warning if it no longer exists. */
export function despawnEntity(world: GameWorld<object>, eid: EntityId): void {
  if (!world) {
    console.error(`${ECS_LOG_PREFIX} despawnEntity called with no world`);
    return;
  }
  if (!entityExists(world, eid)) {
    console.warn(`${ECS_LOG_PREFIX} despawnEntity: entity does not exist`, { eid });
    return;
  }
  try {
    removeEntity(world, eid);
    console.log(`${ECS_LOG_PREFIX} despawnEntity ok`, { eid });
  } catch (err) {
    console.error(`${ECS_LOG_PREFIX} despawnEntity failed`, { eid, err });
    throw err;
  }
}

/** Attach a single component to an entity. Returns true if it was newly added. */
export function attach(world: GameWorld<object>, eid: EntityId, component: ComponentRef): boolean {
  if (!world || component == null) {
    console.error(`${ECS_LOG_PREFIX} attach: missing world or component`, { eid });
    return false;
  }
  if (!entityExists(world, eid)) {
    console.warn(`${ECS_LOG_PREFIX} attach: entity does not exist`, { eid });
    return false;
  }
  const added = addComponent(world, eid, component);
  return added;
}

/** Detach one or more components from an entity. */
export function detach(world: GameWorld<object>, eid: EntityId, ...components: ComponentRef[]): void {
  if (!world || components.length === 0) {
    console.error(`${ECS_LOG_PREFIX} detach: missing world or components`, { eid });
    return;
  }
  if (!entityExists(world, eid)) {
    console.warn(`${ECS_LOG_PREFIX} detach: entity does not exist`, { eid });
    return;
  }
  removeComponent(world, eid, ...components);
}

/** True if the entity currently has the component. */
export function has(world: GameWorld<object>, eid: EntityId, component: ComponentRef): boolean {
  if (!world || component == null) return false;
  return hasComponent(world, eid, component);
}

/**
 * Build a memoized query callable from a fixed set of terms (plain components or And/Or/Not
 * operators). The returned function runs the query against a world each call — bitECS caches the
 * compiled query internally, so this is the idiomatic 0.4 replacement for defineQuery.
 *
 * @example
 *   const moving = createQuery([Position, Velocity]);
 *   for (const eid of moving(world)) { ... }
 */
export function createQuery<T extends object = {}>(terms: QueryTerm[]): QueryFn<T> {
  if (!Array.isArray(terms) || terms.length === 0) {
    const msg = `${ECS_LOG_PREFIX} createQuery requires a non-empty terms array`;
    console.error(msg, { terms });
    throw new TypeError(msg);
  }
  const fn: QueryFn<T> = (world) => {
    if (!world) {
      console.error(`${ECS_LOG_PREFIX} query invoked with no world`);
      return [];
    }
    return query(world, terms);
  };
  console.log(`${ECS_LOG_PREFIX} createQuery ok`, { termCount: terms.length });
  return fn;
}

/**
 * Wrap a system function with a name + try/catch + structured logging. The wrapped system never
 * throws past the loop boundary by default (errors are logged) unless `rethrow` is set — keeping a
 * single misbehaving system from killing the whole frame in a generated game.
 */
export function createSystem<T extends object = {}>(
  name: string,
  fn: System<T>,
  options: { rethrow?: boolean } = {},
): System<T> {
  if (typeof fn !== 'function') {
    const msg = `${ECS_LOG_PREFIX} createSystem("${name}") requires a function`;
    console.error(msg);
    throw new TypeError(msg);
  }
  const rethrow = options.rethrow ?? false;
  const wrapped: System<T> = (world) => {
    if (!world) {
      console.error(`${ECS_LOG_PREFIX} system "${name}" invoked with no world`);
      return;
    }
    try {
      fn(world);
    } catch (err) {
      console.error(`${ECS_LOG_PREFIX} system "${name}" threw`, err);
      if (rethrow) throw err;
    }
  };
  return wrapped;
}

/**
 * Compose systems into a single update function. Systems run left-to-right each tick against the
 * SAME world. Returns a function you call once per frame with the world.
 *
 * NOTE: bitECS's `pipe` threads each function's RETURN VALUE to the next (functional composition),
 * which is wrong for void systems that all operate on one shared world. The 0.4 guidance is to
 * "compose plain functions manually" (research/bitecs.md) — that's what this does: each system is
 * called with the original world, in order.
 *
 * @example
 *   const update = createPipeline(inputSystem, movementSystem, renderSystem);
 *   function loop(t: number) { advanceTime(world, t); update(world); requestAnimationFrame(loop); }
 */
export function createPipeline<T extends object = {}>(...systems: System<T>[]): System<T> {
  if (systems.length === 0) {
    console.warn(`${ECS_LOG_PREFIX} createPipeline created with zero systems (no-op)`);
    return () => {};
  }
  console.log(`${ECS_LOG_PREFIX} createPipeline ok`, { systemCount: systems.length });
  return (world) => {
    if (!world) {
      console.error(`${ECS_LOG_PREFIX} pipeline invoked with no world`);
      return;
    }
    for (const system of systems) system(world);
  };
}

/**
 * Run a list of systems imperatively (alternative to createPipeline when you need per-tick control
 * of the system set, e.g. pausing/skipping). Each system is invoked in array order.
 */
export function runSystems<T extends object = {}>(world: GameWorld<T>, systems: System<T>[]): void {
  if (!world) {
    console.error(`${ECS_LOG_PREFIX} runSystems invoked with no world`);
    return;
  }
  for (const system of systems) {
    if (typeof system === 'function') system(world);
  }
}

/**
 * Observe entities GAINING a set of components (replaces 0.3 enterQuery). Returns an unsubscribe
 * function. Terms accept the same operators as queries.
 */
export function onEntityAdded(
  world: GameWorld<object>,
  terms: QueryTerm[],
  callback: (eid: EntityId) => void,
): () => void {
  if (!world || !Array.isArray(terms) || terms.length === 0 || typeof callback !== 'function') {
    const msg = `${ECS_LOG_PREFIX} onEntityAdded requires world, non-empty terms, and a callback`;
    console.error(msg);
    throw new TypeError(msg);
  }
  const unsub = observe(world, onAdd(...terms), (eid: EntityId) => {
    try {
      callback(eid);
    } catch (err) {
      console.error(`${ECS_LOG_PREFIX} onEntityAdded callback threw`, { eid, err });
    }
  });
  console.log(`${ECS_LOG_PREFIX} onEntityAdded subscribed`, { termCount: terms.length });
  return unsub;
}

/**
 * Observe entities LOSING a set of components or being removed (replaces 0.3 exitQuery). Returns an
 * unsubscribe function.
 */
export function onEntityRemoved(
  world: GameWorld<object>,
  terms: QueryTerm[],
  callback: (eid: EntityId) => void,
): () => void {
  if (!world || !Array.isArray(terms) || terms.length === 0 || typeof callback !== 'function') {
    const msg = `${ECS_LOG_PREFIX} onEntityRemoved requires world, non-empty terms, and a callback`;
    console.error(msg);
    throw new TypeError(msg);
  }
  const unsub = observe(world, onRemove(...terms), (eid: EntityId) => {
    try {
      callback(eid);
    } catch (err) {
      console.error(`${ECS_LOG_PREFIX} onEntityRemoved callback threw`, { eid, err });
    }
  });
  console.log(`${ECS_LOG_PREFIX} onEntityRemoved subscribed`, { termCount: terms.length });
  return unsub;
}

// Raw bitECS 0.4 primitives re-exported so generated games import everything from this module.
export {
  // operators
  And,
  Or,
  Not,
  // direct primitives (escape hatch for advanced systems)
  query,
  addComponent,
  addComponents,
  removeComponent,
  hasComponent,
  getComponent,
  setComponent,
  addEntity,
  removeEntity,
  entityExists,
  getEntityComponents,
  observe,
  onAdd,
  onRemove,
};
export type { World, EntityId, QueryResult, QueryTerm, ComponentRef };
