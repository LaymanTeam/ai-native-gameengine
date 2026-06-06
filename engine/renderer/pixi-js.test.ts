/**
 * Headless unit tests for engine/renderer/pixi-js.ts.
 *
 * PixiJS needs a browser/WebGL, so we exercise only the pure / Node-safe surface:
 * config builders, manifest mapping, and type guards. Run with:
 *   npx tsx engine/renderer/pixi-js.test.ts
 *
 * NOTE: pixi.js keeps the Node event loop alive (background extension/worker plumbing),
 * so this file calls `process.exit()` explicitly once assertions complete — otherwise the
 * process would hang after printing the results.
 */
import assert from 'node:assert/strict';
import {
  RenderConfigSchema,
  parseRenderConfig,
  buildApplicationOptions,
  parseAssetManifest,
  manifestToAliasMap,
  isColorValue,
  RENDERER_LOG_PREFIX,
  type AssetManifest,
} from './pixi-js';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('[test] engine/renderer/pixi-js');

// --- parseRenderConfig --------------------------------------------------------
test('parseRenderConfig applies defaults on empty input', () => {
  const cfg = parseRenderConfig({});
  assert.equal(cfg.width, 800);
  assert.equal(cfg.height, 600);
  assert.equal(cfg.preference, 'webgl');
  assert.equal(cfg.antialias, true);
  assert.equal(cfg.backgroundAlpha, 1);
});

test('parseRenderConfig defaults when given undefined', () => {
  const cfg = parseRenderConfig(undefined);
  assert.equal(cfg.width, 800);
});

test('parseRenderConfig honors overrides', () => {
  const cfg = parseRenderConfig({ width: 1280, height: 720, preference: 'webgpu', roundPixels: true });
  assert.equal(cfg.width, 1280);
  assert.equal(cfg.height, 720);
  assert.equal(cfg.preference, 'webgpu');
  assert.equal(cfg.roundPixels, true);
});

test('parseRenderConfig rejects non-positive dimensions', () => {
  assert.throws(() => parseRenderConfig({ width: 0 }), /invalid render config/);
  assert.throws(() => parseRenderConfig({ height: -5 }), /invalid render config/);
});

test('parseRenderConfig rejects unknown preference', () => {
  assert.throws(() => parseRenderConfig({ preference: 'metal' }), /invalid render config/);
});

test('parseRenderConfig rejects backgroundAlpha out of range', () => {
  assert.throws(() => parseRenderConfig({ backgroundAlpha: 2 }), /invalid render config/);
});

test('parseRenderConfig rejects unknown keys (strict schema)', () => {
  assert.throws(() => parseRenderConfig({ bogus: true }), /invalid render config/);
});

// --- buildApplicationOptions --------------------------------------------------
test('buildApplicationOptions maps config to v8 init options', () => {
  const cfg = parseRenderConfig({ width: 640, height: 480, backgroundColor: 0x1099bb });
  const opts = buildApplicationOptions(cfg);
  assert.equal(opts.width, 640);
  assert.equal(opts.height, 480);
  assert.equal(opts.backgroundColor, 0x1099bb);
  assert.equal(opts.preference, 'webgl');
  // v8: NO `view`/`canvas` passed in; ensure we never leak v7 keys.
  assert.equal((opts as Record<string, unknown>)['view'], undefined);
});

// --- parseAssetManifest -------------------------------------------------------
test('parseAssetManifest accepts a valid manifest', () => {
  const m = parseAssetManifest([
    { alias: 'hero', src: 'assets/sprites/hero.png' },
    { alias: 'bg', src: 'assets/background/sky.png' },
  ]);
  assert.equal(m.length, 2);
  assert.equal(m[0]?.alias, 'hero');
});

test('parseAssetManifest accepts empty array', () => {
  assert.deepEqual(parseAssetManifest([]), []);
});

test('parseAssetManifest rejects duplicate aliases', () => {
  assert.throws(
    () =>
      parseAssetManifest([
        { alias: 'hero', src: 'a.png' },
        { alias: 'hero', src: 'b.png' },
      ]),
    /duplicate asset alias/,
  );
});

test('parseAssetManifest rejects empty alias/src', () => {
  assert.throws(() => parseAssetManifest([{ alias: '', src: 'a.png' }]), /invalid manifest/);
  assert.throws(() => parseAssetManifest([{ alias: 'x', src: '' }]), /invalid manifest/);
});

test('parseAssetManifest rejects non-array input', () => {
  assert.throws(() => parseAssetManifest({ alias: 'x', src: 'y.png' }), /invalid manifest/);
});

// --- manifestToAliasMap -------------------------------------------------------
test('manifestToAliasMap produces alias→src record', () => {
  const manifest: AssetManifest = [
    { alias: 'hero', src: 'h.png' },
    { alias: 'bg', src: 'b.png' },
  ];
  const map = manifestToAliasMap(manifest);
  assert.deepEqual(map, { hero: 'h.png', bg: 'b.png' });
});

test('manifestToAliasMap of empty manifest is empty object', () => {
  assert.deepEqual(manifestToAliasMap([]), {});
});

// --- isColorValue -------------------------------------------------------------
test('isColorValue accepts finite non-negative numbers', () => {
  assert.equal(isColorValue(0x000000), true);
  assert.equal(isColorValue(0xff0000), true);
  assert.equal(isColorValue(0), true);
});

test('isColorValue rejects bad values', () => {
  assert.equal(isColorValue(-1), false);
  assert.equal(isColorValue(NaN), false);
  assert.equal(isColorValue(Infinity), false);
  assert.equal(isColorValue('red'), false);
  assert.equal(isColorValue(undefined), false);
  assert.equal(isColorValue(null), false);
});

// --- misc ---------------------------------------------------------------------
test('RENDERER_LOG_PREFIX is the conventional tag', () => {
  assert.equal(RENDERER_LOG_PREFIX, '[engine/renderer/pixi-js]');
});

test('RenderConfigSchema is exported and parseable directly', () => {
  const r = RenderConfigSchema.safeParse({ width: 100, height: 100 });
  assert.equal(r.success, true);
});

console.log(`\n[test] engine/renderer/pixi-js — ${passed} passed`);

// pixi.js keeps the event loop alive; exit explicitly so the runner terminates.
process.exit(0);
