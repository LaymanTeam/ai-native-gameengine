/**
 * Tests for engine/compiler/asset-manifest.ts — run via: npx tsx engine/compiler/asset-manifest.test.ts
 * Scaffolds a temp game, round-trips the manifest + style, and exercises the bidirectional
 * validation (missing asset, unreferenced key, duplicate path, happy path). Cleans up.
 */
import assert from 'node:assert';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scaffoldGame } from './game-scaffold.js';
import {
  buildManifest,
  writeManifest,
  readManifest,
  writeStyle,
  readStyle,
  validateManifest,
  type AssetEntry,
} from './asset-manifest.js';

async function run(): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'manifest-test-'));
  try {
    const { gameRoot, gameName } = await scaffoldGame('Manifest Test', { generationsDir: tmp });

    const heroEntry: AssetEntry = {
      variable: 'heroSprite',
      path: 'assets/sprites/hero.png',
      category: 'sprites',
      description: 'player sprite',
    };
    const bgEntry: AssetEntry = {
      variable: 'forestBg',
      path: 'assets/background/forest.png',
      category: 'background',
    };

    const manifest = buildManifest(gameName, [heroEntry, bgEntry]);
    assert.equal(Object.keys(manifest.assets).length, 2);
    assert.equal(manifest.game, gameName);

    // Round-trip manifest.
    await writeManifest(gameRoot, manifest);
    const reread = await readManifest(gameRoot);
    assert.deepEqual(reread.assets, manifest.assets);
    assert.equal(reread.game, manifest.game);

    // Round-trip style.
    await writeStyle(gameRoot, { palette: ['#000', '#fff'], spriteResolution: '32x32' });
    const style = await readStyle(gameRoot);
    assert.deepEqual(style.palette, ['#000', '#fff']);
    assert.equal(style.spriteResolution, '32x32');

    // buildManifest rejects duplicate variable names.
    assert.throws(
      () => buildManifest(gameName, [heroEntry, { ...bgEntry, variable: 'heroSprite' }]),
      /duplicate variable/,
    );

    // buildManifest rejects invalid identifiers.
    assert.throws(
      () => buildManifest(gameName, [{ ...heroEntry, variable: '1-bad' }]),
      /identifier|variable/i,
    );

    // ---- Validation: initial state should FAIL (assets not on disk, vars not referenced).
    const v0 = await validateManifest(gameRoot, manifest);
    assert.equal(v0.ok, false);
    assert.ok(v0.issues.some((i) => i.kind === 'missing-asset' && i.variable === 'heroSprite'));
    assert.ok(v0.issues.some((i) => i.kind === 'unreferenced-key'));

    // Create the asset files on disk.
    await writeFile(path.join(gameRoot, 'assets/sprites/hero.png'), 'png');
    await writeFile(path.join(gameRoot, 'assets/background/forest.png'), 'png');

    // Reference both variables in code (systems/).
    await writeFile(
      path.join(gameRoot, 'systems/entities/player.ts'),
      'export const a = heroSprite;\nexport const b = forestBg;\n',
    );

    // ---- Validation: now should PASS.
    const v1 = await validateManifest(gameRoot, manifest);
    assert.deepEqual(v1.issues, [], `expected no issues, got: ${JSON.stringify(v1.issues)}`);
    assert.equal(v1.ok, true);

    // ---- Validation catches a MISSING ASSET specifically.
    const missingAssetManifest = buildManifest(gameName, [
      heroEntry,
      bgEntry,
      { variable: 'ghostSprite', path: 'assets/sprites/ghost.png', category: 'sprites' },
    ]);
    await writeFile(
      path.join(gameRoot, 'systems/entities/player.ts'),
      'export const a = heroSprite;\nexport const b = forestBg;\nexport const c = ghostSprite;\n',
    );
    const v2 = await validateManifest(gameRoot, missingAssetManifest);
    assert.equal(v2.ok, false);
    assert.ok(
      v2.issues.some((i) => i.kind === 'missing-asset' && i.variable === 'ghostSprite'),
      'should flag ghostSprite as missing-asset',
    );

    // ---- Validation catches an UNREFERENCED KEY specifically.
    const unrefManifest = buildManifest(gameName, [
      heroEntry,
      bgEntry,
      { variable: 'orphanSprite', path: 'assets/sprites/orphan.png', category: 'sprites' },
    ]);
    await writeFile(path.join(gameRoot, 'assets/sprites/orphan.png'), 'png');
    // Note: orphanSprite intentionally NOT referenced in code.
    const v3 = await validateManifest(gameRoot, unrefManifest);
    assert.equal(v3.ok, false);
    assert.ok(
      v3.issues.some((i) => i.kind === 'unreferenced-key' && i.variable === 'orphanSprite'),
      'should flag orphanSprite as unreferenced-key',
    );

    // ---- Validation catches a DUPLICATE PATH.
    await mkdir(path.join(gameRoot, 'systems/ai'), { recursive: true });
    await writeFile(
      path.join(gameRoot, 'systems/ai/dup.ts'),
      'export const x = heroSprite;\nexport const y = aliasSprite;\n',
    );
    const dupManifest = buildManifest(gameName, [
      heroEntry,
      { variable: 'aliasSprite', path: 'assets/sprites/hero.png', category: 'sprites' },
    ]);
    const v4 = await validateManifest(gameRoot, dupManifest);
    assert.ok(
      v4.issues.some((i) => i.kind === 'duplicate-path'),
      'should flag duplicate-path',
    );

    console.log('asset-manifest.test.ts — all assertions passed');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('asset-manifest.test.ts FAILED:', err);
  process.exit(1);
});
