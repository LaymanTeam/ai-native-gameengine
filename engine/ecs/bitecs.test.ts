/**
 * Unit tests for engine/ecs/bitecs.ts — run with: npx tsx engine/ecs/bitecs.test.ts
 * Covers world creation + time, component stores, entity lifecycle, queries, systems, pipelines,
 * and add/remove observers against the bitECS 0.4 API.
 */
import assert from 'node:assert/strict';
import {
  createGameWorld,
  destroyGameWorld,
  advanceTime,
  defineComponentStore,
  spawnEntity,
  despawnEntity,
  attach,
  detach,
  has,
  createQuery,
  createSystem,
  createPipeline,
  runSystems,
  onEntityAdded,
  onEntityRemoved,
  Not,
  type GameWorld,
} from './bitecs';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// --- Components shared across tests ---
const Position = defineComponentStore({ x: [] as number[], y: [] as number[] });
const Velocity = defineComponentStore({ x: [] as number[], y: [] as number[] });
const Stunned = defineComponentStore({ flag: [] as number[] });

test('createGameWorld returns a world with a zeroed time context', () => {
  const world = createGameWorld();
  assert.ok(world.time, 'world.time exists');
  assert.equal(world.time.delta, 0);
  assert.equal(world.time.elapsed, 0);
  assert.equal(typeof world.time.then, 'number');
  destroyGameWorld(world);
});

test('createGameWorld merges extra context but never clobbers time', () => {
  const world = createGameWorld<{ score: number }>({ score: 7 });
  assert.equal(world.score, 7);
  assert.ok(world.time, 'time still present');
  destroyGameWorld(world);
});

test('advanceTime accumulates elapsed and clamps hitches', () => {
  const world = createGameWorld();
  world.time.then = 1000;
  const d1 = advanceTime(world, 1016); // 16ms ~ one frame
  assert.ok(Math.abs(d1 - 0.016) < 1e-9, 'delta ~0.016s');
  assert.ok(Math.abs(world.time.elapsed - 0.016) < 1e-9);
  const d2 = advanceTime(world, 5016, 0.25); // 4s hitch -> clamped to 0.25
  assert.equal(d2, 0.25, 'hitch clamped to maxDelta');
  destroyGameWorld(world);
});

test('advanceTime guards a missing world.time', () => {
  // @ts-expect-error intentionally malformed world for the guard path
  const d = advanceTime({});
  assert.equal(d, 0);
});

test('spawnEntity + attach + has track component membership', () => {
  const world = createGameWorld();
  const eid = spawnEntity(world, [Position]);
  assert.equal(has(world, eid, Position), true);
  assert.equal(has(world, eid, Velocity), false);
  const added = attach(world, eid, Velocity);
  assert.equal(added, true);
  assert.equal(has(world, eid, Velocity), true);
  destroyGameWorld(world);
});

test('detach removes a component', () => {
  const world = createGameWorld();
  const eid = spawnEntity(world, [Position, Velocity]);
  detach(world, eid, Velocity);
  assert.equal(has(world, eid, Velocity), false);
  assert.equal(has(world, eid, Position), true);
  destroyGameWorld(world);
});

test('attach to a nonexistent entity returns false (guarded)', () => {
  const world = createGameWorld();
  const eid = spawnEntity(world, [Position]);
  despawnEntity(world, eid);
  // eid is recycled; create a clearly-absent id by removing then querying
  const absent = 999999;
  assert.equal(attach(world, absent, Position), false);
  destroyGameWorld(world);
});

test('createQuery finds entities matching all terms', () => {
  const world = createGameWorld();
  const a = spawnEntity(world, [Position, Velocity]);
  spawnEntity(world, [Position]); // only position — should NOT match [Position, Velocity]
  const moving = createQuery([Position, Velocity]);
  const result = Array.from(moving(world));
  assert.equal(result.length, 1);
  assert.equal(result[0], a);
  destroyGameWorld(world);
});

test('createQuery supports Not operator', () => {
  const world = createGameWorld();
  const free = spawnEntity(world, [Position]);
  const stuck = spawnEntity(world, [Position, Stunned]);
  const movable = createQuery([Position, Not(Stunned)]);
  const ids = Array.from(movable(world));
  assert.ok(ids.includes(free), 'free entity matches');
  assert.ok(!ids.includes(stuck), 'stunned entity excluded');
  destroyGameWorld(world);
});

test('createSystem runs and mutates component data via the world', () => {
  const world = createGameWorld();
  const eid = spawnEntity(world, [Position, Velocity]);
  Position.x[eid] = 0;
  Velocity.x[eid] = 10; // 10 units/sec
  world.time.delta = 0.5;

  const movement = createSystem('movement', (w: GameWorld) => {
    for (const e of createQuery([Position, Velocity])(w)) {
      Position.x[e] = (Position.x[e] ?? 0) + (Velocity.x[e] ?? 0) * w.time.delta;
    }
  });

  movement(world);
  assert.equal(Position.x[eid], 5, '0 + 10 * 0.5 = 5');
  destroyGameWorld(world);
});

test('createSystem swallows thrown errors by default', () => {
  const world = createGameWorld();
  const boom = createSystem('boom', () => {
    throw new Error('intentional');
  });
  assert.doesNotThrow(() => boom(world));
});

test('createSystem rethrows when configured', () => {
  const world = createGameWorld();
  const boom = createSystem('boom', () => {
    throw new Error('intentional');
  }, { rethrow: true });
  assert.throws(() => boom(world), /intentional/);
  destroyGameWorld(world);
});

test('createPipeline runs systems left-to-right', () => {
  const world = createGameWorld();
  const order: string[] = [];
  const update = createPipeline(
    createSystem('first', () => order.push('first')),
    createSystem('second', () => order.push('second')),
  );
  update(world);
  assert.deepEqual(order, ['first', 'second']);
  destroyGameWorld(world);
});

test('runSystems invokes each system once in order', () => {
  const world = createGameWorld();
  let count = 0;
  runSystems(world, [() => (count += 1), () => (count += 10)]);
  assert.equal(count, 11);
  destroyGameWorld(world);
});

test('onEntityAdded fires when a matching component is added', () => {
  const world = createGameWorld();
  const seen: number[] = [];
  const unsub = onEntityAdded(world, [Position], (eid) => seen.push(eid));
  const e = spawnEntity(world, [Position]);
  assert.ok(seen.includes(e), 'observer saw the added entity');
  unsub();
  destroyGameWorld(world);
});

test('onEntityRemoved fires when a matching component is removed', () => {
  const world = createGameWorld();
  const removed: number[] = [];
  const e = spawnEntity(world, [Position]);
  const unsub = onEntityRemoved(world, [Position], (eid) => removed.push(eid));
  detach(world, e, Position);
  assert.ok(removed.includes(e), 'observer saw the removed entity');
  unsub();
  destroyGameWorld(world);
});

console.log(`\n[engine/ecs/bitecs.test] ${passed} tests passed`);
