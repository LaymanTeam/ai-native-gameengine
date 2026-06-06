/**
 * Offline tests for vite-creator. Run: npx tsx engine/compiler/vite-creator.test.ts
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createViteProject } from './vite-creator.js';

async function makeGameDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vite-creator-'));
  // Simulate a minimal info.md tree.
  await writeFile(path.join(dir, 'main.ts'), 'export {};\n', 'utf8');
  return dir;
}

async function testWritesAllProjectFiles(): Promise<void> {
  const gameDir = await makeGameDir();
  try {
    const result = await createViteProject({ gameDir, name: 'space-blaster', title: 'Space Blaster' });

    assert.equal(result.gameDir, path.resolve(gameDir));
    assert.equal(result.skipped.length, 0);
    const names = result.written.map((p) => path.basename(p)).sort();
    assert.deepEqual(names, ['index.html', 'package.json', 'tsconfig.json', 'vercel.json', 'vite.config.ts']);

    // index.html: title escaped + module entry referenced.
    const html = await readFile(path.join(gameDir, 'index.html'), 'utf8');
    assert.match(html, /<title>Space Blaster<\/title>/);
    assert.match(html, /<script type="module" src="\/main\.ts"><\/script>/);

    // package.json valid JSON with vite scripts + deps.
    const pkg = JSON.parse(await readFile(path.join(gameDir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'space-blaster');
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.scripts.build, 'vite build');
    assert.equal(pkg.dependencies['pixi.js'], '^8.0.0');
    assert.ok(pkg.devDependencies.vite.startsWith('^8'));

    // vite.config.ts references Vite + dist outDir.
    const viteCfg = await readFile(path.join(gameDir, 'vite.config.ts'), 'utf8');
    assert.match(viteCfg, /defineConfig/);
    assert.match(viteCfg, /outDir: 'dist'/);

    // tsconfig strict flags.
    const ts = JSON.parse(await readFile(path.join(gameDir, 'tsconfig.json'), 'utf8'));
    assert.equal(ts.compilerOptions.strict, true);
    assert.equal(ts.compilerOptions.noUncheckedIndexedAccess, true);

    // vercel.json SPA rewrite.
    const vercel = JSON.parse(await readFile(path.join(gameDir, 'vercel.json'), 'utf8'));
    assert.equal(vercel.rewrites[0].destination, '/index.html');

    console.log('ok: writes all project files');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testTitleDefaultsToNameAndHtmlEscaped(): Promise<void> {
  const gameDir = await makeGameDir();
  try {
    await createViteProject({ gameDir, name: 'tag<&>name' });
    const html = await readFile(path.join(gameDir, 'index.html'), 'utf8');
    assert.match(html, /<title>tag&lt;&amp;&gt;name<\/title>/);
    console.log('ok: title defaults to name and is HTML-escaped');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testCustomEntryAndDeps(): Promise<void> {
  const gameDir = await makeGameDir();
  try {
    await createViteProject({
      gameDir,
      name: 'g',
      entry: 'src/index.ts',
      dependencies: { 'extra-lib': '^1.2.3' },
    });
    const html = await readFile(path.join(gameDir, 'index.html'), 'utf8');
    assert.match(html, /src="\/src\/index\.ts"/);
    const pkg = JSON.parse(await readFile(path.join(gameDir, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies['extra-lib'], '^1.2.3');
    assert.equal(pkg.dependencies['pixi.js'], '^8.0.0'); // defaults preserved
    console.log('ok: custom entry and merged deps');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testOverwriteFalseSkips(): Promise<void> {
  const gameDir = await makeGameDir();
  try {
    await writeFile(path.join(gameDir, 'package.json'), '{"name":"preexisting"}', 'utf8');
    const result = await createViteProject({ gameDir, name: 'g', overwrite: false });
    const skippedNames = result.skipped.map((p) => path.basename(p));
    assert.ok(skippedNames.includes('package.json'));
    const pkg = JSON.parse(await readFile(path.join(gameDir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'preexisting'); // untouched
    console.log('ok: overwrite=false skips existing files');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testMissingGameDirThrows(): Promise<void> {
  const missing = path.join(tmpdir(), `vite-creator-missing-${Date.now()}`);
  await assert.rejects(
    () => createViteProject({ gameDir: missing, name: 'g' }),
    /gameDir does not exist/,
  );
  console.log('ok: missing gameDir throws');
}

async function testInvalidOptionsThrow(): Promise<void> {
  const gameDir = await makeGameDir();
  try {
    await assert.rejects(
      () => createViteProject({ gameDir, name: '' }),
      /invalid options/,
    );
    console.log('ok: invalid options throw');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  // suppress noisy module logs during tests but keep failures visible
  await testWritesAllProjectFiles();
  await testTitleDefaultsToNameAndHtmlEscaped();
  await testCustomEntryAndDeps();
  await testOverwriteFalseSkips();
  await testMissingGameDirThrows();
  await testInvalidOptionsThrow();
  console.log('\nvite-creator: ALL TESTS PASSED');
}

main().catch((err) => {
  console.error('vite-creator: TEST FAILURE', err);
  process.exit(1);
});
