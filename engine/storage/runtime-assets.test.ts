/**
 * engine/storage/runtime-assets.test.ts
 *
 * Node-safe tests for the runtime-generated asset store (RxDB memory storage) and the
 * resolveAssetUrl convention helper.
 * Run: npx tsx engine/storage/runtime-assets.test.ts
 */

import assert from 'node:assert';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { z } from 'zod';
import { createSaveStore } from './rx-db';
import {
  createRuntimeAssetStore,
  resolveAssetUrl,
  RuntimeAssetDocSchema,
  RUNTIME_ASSET_CATEGORIES,
  type RuntimeAssetDoc,
  type RuntimeAssetStore,
} from './runtime-assets';

const TEST_LOG_PREFIX = '[engine/storage/runtime-assets.test]';

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

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`;

function makeDoc(overrides: Partial<RuntimeAssetDoc> = {}): RuntimeAssetDoc {
  return {
    id: 'sprites/fire-imp-01',
    category: 'sprites',
    dataUrl: PNG_DATA_URL,
    mimeType: 'image/png',
    prompt: 'a fire imp sprite',
    createdAt: 1750000000000,
    ...overrides,
  };
}

async function newStore(dbName: string): Promise<RuntimeAssetStore> {
  const saveStore = await createSaveStore({
    gameName: 'test-game',
    dbName,
    stateSchema: z.object({ level: z.number() }),
    storage: getRxStorageMemory(),
    origin: 'runtime-assets.test',
  });
  return createRuntimeAssetStore({ db: saveStore.db, origin: 'runtime-assets.test' });
}

async function main(): Promise<void> {
  await test('schema accepts a valid doc, rejects non-data-URL and bad category', async () => {
    RuntimeAssetDocSchema.parse(makeDoc());
    assert.throws(() => RuntimeAssetDocSchema.parse(makeDoc({ dataUrl: 'https://cdn/x.png' })));
    assert.throws(() =>
      RuntimeAssetDocSchema.parse(makeDoc({ category: 'fonts' as never })),
      'fonts is build-time only — runtime categories exclude it',
    );
    assert.equal(RUNTIME_ASSET_CATEGORIES.includes('fonts' as never), false);
  });

  await test('save → resolveUrl round-trips the data URL', async () => {
    const store = await newStore('rtassets-roundtrip');
    await store.save(makeDoc());
    const url = await store.resolveUrl('sprites/fire-imp-01');
    assert.equal(url, PNG_DATA_URL);
  });

  await test('resolveUrl miss and invalid id return null', async () => {
    const store = await newStore('rtassets-miss');
    assert.equal(await store.resolveUrl('sprites/nope'), null);
    assert.equal(await store.resolveUrl(''), null);
  });

  await test('save upserts on id (regeneration replaces the asset)', async () => {
    const store = await newStore('rtassets-upsert');
    await store.save(makeDoc());
    const v2 = `data:image/png;base64,${Buffer.from('v2-png').toString('base64')}`;
    await store.save(makeDoc({ dataUrl: v2, prompt: 'a fire imp sprite, redder' }));
    assert.equal(await store.resolveUrl('sprites/fire-imp-01'), v2);
  });

  await test('byCategory filters and validates the category', async () => {
    const store = await newStore('rtassets-bycat');
    await store.save(makeDoc());
    await store.save(makeDoc({ id: 'sfx/roar-01', category: 'sfx', mimeType: 'audio/wav' }));
    await store.save(makeDoc({ id: 'sprites/imp-02' }));
    const sprites = await store.byCategory('sprites');
    assert.equal(sprites.length, 2);
    const sfx = await store.byCategory('sfx');
    assert.equal(sfx.length, 1);
    assert.equal(sfx[0]?.id, 'sfx/roar-01');
    await assert.rejects(() => store.byCategory('bogus' as never), /invalid category/);
  });

  await test('remove deletes; invalid save rejected at the Zod boundary', async () => {
    const store = await newStore('rtassets-remove');
    await store.save(makeDoc());
    assert.equal(await store.remove('sprites/fire-imp-01'), true);
    assert.equal(await store.resolveUrl('sprites/fire-imp-01'), null);
    await assert.rejects(() => store.save(makeDoc({ dataUrl: 'not-a-data-url' })), /Zod validation/);
  });

  await test('createRuntimeAssetStore requires db', async () => {
    await assert.rejects(
      () => createRuntimeAssetStore({} as never),
      /db is required/,
    );
  });

  await test('resolveAssetUrl implements the three-way convention', async () => {
    // data: passthrough (runtime asset resolved from the store)
    assert.equal(resolveAssetUrl(PNG_DATA_URL), PNG_DATA_URL);
    // runtime:<file> → public-dir URL
    assert.equal(resolveAssetUrl('runtime:sprites/imp.png'), '/runtime/sprites/imp.png');
    assert.equal(resolveAssetUrl('runtime:/leading-slash.png'), '/runtime/leading-slash.png');
    // imported build-time URL passes through untouched
    assert.equal(resolveAssetUrl('/assets/knight-Bx12.png'), '/assets/knight-Bx12.png');
    assert.throws(() => resolveAssetUrl(''), /non-empty/);
    assert.throws(() => resolveAssetUrl('runtime:'), /empty runtime: reference/);
  });

  console.log(`${TEST_LOG_PREFIX} ${passed} tests passed`);
}

main().catch(() => {
  process.exit(1);
});
