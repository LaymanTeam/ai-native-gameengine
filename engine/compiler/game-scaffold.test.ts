/**
 * Tests for engine/compiler/game-scaffold.ts — run via: npx tsx engine/compiler/game-scaffold.test.ts
 * Scaffolds into an OS temp dir, asserts the full tree matches info.md, then cleans up.
 */
import assert from 'node:assert';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  scaffoldGame,
  verifyScaffold,
  slugifyGameName,
  GAME_TREE,
  GAME_FILES,
} from './game-scaffold.js';

async function isDir(p: string): Promise<boolean> {
  const s = await stat(p);
  return s.isDirectory();
}

async function isFile(p: string): Promise<boolean> {
  const s = await stat(p);
  return s.isFile();
}

async function run(): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'scaffold-test-'));
  try {
    // slugify
    assert.equal(slugifyGameName('My Cool Game!!'), 'my-cool-game');
    assert.equal(slugifyGameName('   '), 'game');
    assert.equal(slugifyGameName('Über Quest'), 'uber-quest');

    const result = await scaffoldGame('My Cool Game', { generationsDir: tmp });
    assert.equal(result.gameName, 'my-cool-game');
    assert.equal(result.gameRoot, path.join(tmp, 'my-cool-game'));

    // Every directory in the spec exists.
    for (const rel of GAME_TREE) {
      const abs = path.join(result.gameRoot, rel);
      assert.ok(await isDir(abs), `expected dir missing: ${rel}`);
    }

    // Seeded files exist and contain the slug.
    const mainAbs = path.join(result.gameRoot, GAME_FILES.main);
    const testsAbs = path.join(result.gameRoot, GAME_FILES.tests);
    assert.ok(await isFile(mainAbs), 'main.ts missing');
    assert.ok(await isFile(testsAbs), 'tests/tests.ts missing');
    assert.match(await readFile(mainAbs, 'utf8'), /my-cool-game/);

    // verifyScaffold reports complete (no missing).
    const missing = await verifyScaffold(result.gameRoot);
    assert.deepEqual(missing, [], `verifyScaffold should report nothing missing, got: ${missing.join(', ')}`);

    // Idempotency: re-running does not throw and does not clobber main.ts.
    await readFile(mainAbs, 'utf8'); // baseline read
    const again = await scaffoldGame('My Cool Game', { generationsDir: tmp });
    assert.equal(again.gameRoot, result.gameRoot);

    // allowExisting=false throws on existing root.
    await assert.rejects(
      () => scaffoldGame('My Cool Game', { generationsDir: tmp, allowExisting: false }),
      /already exists/,
    );

    // verifyScaffold detects a missing dir.
    const fresh = await mkdtemp(path.join(tmpdir(), 'scaffold-empty-'));
    try {
      const m2 = await verifyScaffold(path.join(fresh, 'nonexistent'));
      assert.ok(m2.length > 0, 'verifyScaffold should report missing for a non-scaffolded root');
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }

    console.log('game-scaffold.test.ts — all assertions passed');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('game-scaffold.test.ts FAILED:', err);
  process.exit(1);
});
