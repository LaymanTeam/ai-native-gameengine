/**
 * engine/storage/rx-db.test.ts
 *
 * Node-safe tests for the RxDB save/state layer using RxDB's memory storage adapter.
 * Run: npx tsx engine/storage/rx-db.test.ts
 */

import assert from 'node:assert';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { z } from 'zod';
import {
  createSaveStore,
  createTypedCollection,
  SAVE_SLOT_MAX_LENGTH,
  type SaveStore,
} from './rx-db';

const TEST_LOG_PREFIX = '[engine/storage/rx-db.test]';

const gameStateSchema = z.object({
  level: z.number().int(),
  gold: z.number().int(),
  player: z.string(),
});
type GameState = z.infer<typeof gameStateSchema>;

let passed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`${TEST_LOG_PREFIX} PASS: ${name}`);
  } catch (err) {
    console.error(`${TEST_LOG_PREFIX} FAIL: ${name}`, err);
    process.exitCode = 1;
    throw err;
  }
}

function newStore(dbName: string): Promise<SaveStore<GameState>> {
  return createSaveStore<GameState>({
    gameName: 'test-game',
    dbName,
    stateSchema: gameStateSchema,
    storage: getRxStorageMemory(),
    origin: 'rx-db.test',
  });
}

async function main(): Promise<void> {
  await test('save then load round-trips game state', async () => {
    const store = await newStore('roundtrip-db');
    const state: GameState = { level: 3, gold: 120, player: 'Hero' };
    await store.save('autosave', state);
    const loaded = await store.load('autosave');
    assert.deepStrictEqual(loaded, state, 'loaded state should equal saved state');
    await store.close();
  });

  await test('load returns null for an empty slot', async () => {
    const store = await newStore('empty-db');
    const loaded = await store.load('does-not-exist');
    assert.strictEqual(loaded, null, 'missing slot must return null');
    await store.close();
  });

  await test('save overwrites an existing slot (upsert)', async () => {
    const store = await newStore('overwrite-db');
    await store.save('slot-1', { level: 1, gold: 0, player: 'A' });
    await store.save('slot-1', { level: 2, gold: 50, player: 'A' });
    const loaded = await store.load('slot-1');
    assert.deepStrictEqual(loaded, { level: 2, gold: 50, player: 'A' });
    await store.close();
  });

  await test('schema validation rejects bad data on save', async () => {
    const store = await newStore('badsave-db');
    await assert.rejects(
      // @ts-expect-error — intentionally invalid: gold is a string, player missing
      () => store.save('slot-1', { level: 1, gold: 'lots' }),
      /Zod validation/,
      'invalid state should be rejected by Zod',
    );
    const loaded = await store.load('slot-1');
    assert.strictEqual(loaded, null, 'rejected save must not persist anything');
    await store.close();
  });

  await test('save rejects empty and oversized slot ids', async () => {
    const store = await newStore('slotid-db');
    await assert.rejects(() => store.save('', { level: 1, gold: 0, player: 'A' }), /non-empty string/);
    await assert.rejects(
      () => store.save('x'.repeat(SAVE_SLOT_MAX_LENGTH + 1), { level: 1, gold: 0, player: 'A' }),
      /exceeds/,
    );
    await store.close();
  });

  await test('listSlots and deleteSlot manage slots', async () => {
    const store = await newStore('list-db');
    await store.save('a', { level: 1, gold: 0, player: 'A' });
    await store.save('b', { level: 2, gold: 0, player: 'B' });
    const slots = await store.listSlots();
    assert.strictEqual(slots.length, 2, 'two slots expected');
    assert.ok(slots.includes('a') && slots.includes('b'), 'both slots present');

    const removed = await store.deleteSlot('a');
    assert.strictEqual(removed, true, 'deleteSlot returns true for existing slot');
    const removedAgain = await store.deleteSlot('a');
    assert.strictEqual(removedAgain, false, 'deleteSlot returns false for missing slot');
    const after = await store.listSlots();
    assert.deepStrictEqual(after, ['b'], 'only b remains');
    await store.close();
  });

  await test('createTypedCollection round-trips and validates structured docs', async () => {
    const store = await newStore('typed-db');
    const itemSchema = z.object({ id: z.string(), qty: z.number().int() });
    type Item = z.infer<typeof itemSchema>;
    const inv = await createTypedCollection<Item>({
      db: store.db,
      name: 'inventory',
      schema: {
        version: 0,
        primaryKey: 'id',
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 64 },
          qty: { type: 'number' },
        },
        required: ['id', 'qty'],
      },
      docSchema: itemSchema,
      origin: 'rx-db.test',
    });

    await inv.put({ id: 'potion', qty: 5 });
    const got = await inv.get('potion');
    assert.deepStrictEqual(got, { id: 'potion', qty: 5 });

    await assert.rejects(
      // @ts-expect-error — qty must be a number
      () => inv.put({ id: 'sword', qty: 'one' }),
      /Zod validation/,
    );

    const all = await inv.all();
    assert.strictEqual(all.length, 1, 'only the valid doc persisted');
    const removed = await inv.remove('potion');
    assert.strictEqual(removed, true);
    assert.strictEqual(await inv.get('potion'), null);
    await store.close();
  });

  console.log(`${TEST_LOG_PREFIX} all ${passed} tests passed`);
}

main().catch((err) => {
  console.error(`${TEST_LOG_PREFIX} test run failed`, err);
  process.exitCode = 1;
});
