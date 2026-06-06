/**
 * Offline tests for the phase pipeline chains (engine/ai/pipelines/*).
 * All subagent/model/network steps are dependency-injected fakes — no API keys, no network.
 * Run: npx tsx engine/ai/pipelines/pipelines.test.ts
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDesignPipeline } from './design.js';
import { runAssetsPipeline, type AssetPlan } from './assets.js';
import { runBuildPipeline } from './build.js';
import { runVerifyPipeline } from './verify.js';
import { runDeployPipeline } from './deploy.js';
import { readOrInitManifest, resolveGameRoot, resolveInside } from './shared.js';
import type { EngineEvent } from '../events.js';
import type { GameDesignDocument } from '../agents/designer.js';
import { StyleBibleSchema, styleBibleToPromptPreamble } from '../../tools/visualizers/visual-direction.js';

const LOG = '[engine/ai/pipelines/pipelines.test]';
let passed = 0;
const events: EngineEvent[] = [];
const emit = (e: EngineEvent) => void events.push(e);

const GDD: GameDesignDocument = {
  title: 'Pipe Test Quest',
  pitch: 'Match tiles before the moves run out.',
  genre: 'puzzle',
  coreMechanic: 'swap adjacent tiles to match three',
  scenes: [{ id: 'board', name: 'Board', description: 'a single 8x8 board' }],
  winCondition: 'score reaches 100',
  loseCondition: 'moves reach 0',
  controls: ['swap'],
  nonGoals: ['multiplayer', 'meta progression'],
};

const STYLE_BIBLE = {
  title: 'Flat candy',
  summary: 'flat bright candy shapes',
  artStyle: 'modern flat pixel',
  palette: ['#ff0066', '#00ccff'],
  spriteResolution: 32,
  perspective: 'top-down',
  outline: { enabled: false, notes: 'no outlines' },
  shading: 'flat',
  mood: ['playful'],
  rules: ['no gradients'],
};

// 1x1 transparent PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG_B64}`;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`${LOG} ok - ${name}`);
  } catch (error) {
    console.error(`${LOG} FAIL - ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pipelines-test-'));
  const cwd = process.cwd();
  process.chdir(tmp); // defaultGenerationsDir() = <cwd>/generations

  /* ---- design ---- */
  let game = '';
  let gameRoot = '';
  await test('design pipeline scaffolds tree, persists GDD, runs injected researcher', async () => {
    const result = await runDesignPipeline(
      { gdd: GDD, researchTopics: ['match-3 scoring'], emit },
      {
        research: async ({ gameRoot: root, topic }) => {
          const file = resolveInside(root, 'research/note.md');
          await fs.writeFile(file, `# ${topic}\n`, 'utf8');
          return ['research/note.md'];
        },
      },
    );
    game = result.game;
    gameRoot = result.gameRoot;
    assert.equal(game, 'pipe-test-quest');
    assert.deepEqual(result.researchNotes, ['research/note.md']);
    const gdd = JSON.parse(await fs.readFile(path.join(gameRoot, 'config', 'gdd.json'), 'utf8'));
    assert.equal(gdd.title, GDD.title);
    await fs.access(path.join(gameRoot, 'reports', 'gdd.md'));
    await fs.access(path.join(gameRoot, 'systems')); // scaffold ran
  });

  await test('design research failure does not block the phase', async () => {
    const result = await runDesignPipeline(
      { gdd: { ...GDD, title: 'Pipe Test Quest B' }, researchTopics: ['x'], emit },
      { research: async () => Promise.reject(new Error('offline')) },
    );
    assert.equal(result.researchNotes.length, 0); // failed but pipeline completed
  });

  /* ---- assets ---- */
  await test('assets pipeline refuses images without a style bible', async () => {
    const plan: AssetPlan = { images: [{ variable: 'hero', prompt: 'a hero', fileName: 'hero.png', category: 'sprites' }], sfx: [], music: [], fonts: [] };
    const result = await runAssetsPipeline({ game, gameRoot, plan, emit }, { generate: async () => ({ dataUrl: DATA_URL, text: '' }) });
    assert.equal(result.ok, false);
    assert.match(result.failures[0] ?? '', /style bible/);
  });

  await test('assets pipeline: style-prepended generate → review (regen once) → save + manifest', async () => {
    await fs.writeFile(path.join(gameRoot, 'config', 'style-bible.json'), JSON.stringify(STYLE_BIBLE), 'utf8');
    const prompts: string[] = [];
    let reviewCalls = 0;
    const plan: AssetPlan = { images: [{ variable: 'heroSprite', prompt: 'a hero', fileName: 'hero.png', category: 'sprites' }], sfx: [], music: [], fonts: [] };
    const result = await runAssetsPipeline(
      { game, gameRoot, plan, emit },
      {
        generate: async (prompt) => {
          prompts.push(prompt);
          return { dataUrl: DATA_URL, text: '' };
        },
        review: async (args) => {
          reviewCalls += 1;
          await args.regenerate('more contrast'); // exercise the regen path
          return { approved: true, note: 'passed (score 0.91)' };
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(reviewCalls, 1);
    assert.equal(result.produced[0]?.approved, true);
    // style bible prepended to BOTH the original and the regeneration prompt
    const preamble = styleBibleToPromptPreamble(StyleBibleSchema.parse(STYLE_BIBLE));
    assert.equal(prompts.length, 2);
    assert.ok(prompts.every((p) => p.includes(preamble) && p.includes('Subject: a hero')));
    await fs.access(path.join(gameRoot, 'assets', 'sprites', 'hero.png'));
    const manifest = await readOrInitManifest(gameRoot, game);
    assert.ok(manifest.assets['heroSprite']);
  });

  await test('assets pipeline fetches audio + fonts through injected fetch and registers manifest entries', async () => {
    const ogaSearch = `<a href="/content/laser-1">x</a>`;
    const ogaDetail = `<h1>Laser</h1><a href="https://opengameart.org/sites/default/files/laser.ogg">laser.ogg</a><div class="license-name">CC0</div><div class="field-name-author">anon</div>`;
    const fontCss = `@font-face { font-family: 'Pressy'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/pressy.woff2) format('woff2'); }`;
    const fetchImpl = (async (input: string) => {
      const url = String(input);
      const body = url.includes('art-search') ? ogaSearch : url.includes('/content/') ? ogaDetail : url.includes('css2') ? fontCss : 'BINARY';
      return new Response(url.endsWith('.ogg') || url.endsWith('.woff2') ? Buffer.from([1, 2, 3]) : body, { status: 200 });
    }) as never;
    const plan: AssetPlan = { images: [], sfx: ['laser'], music: [], fonts: [{ family: 'Pressy', weights: [400] }] };
    const result = await runAssetsPipeline({ game, gameRoot, plan, emit }, { fetchImpl });
    assert.equal(result.audioSaved, 1);
    assert.equal(result.fontFaces, 1);
    const manifest = await readOrInitManifest(gameRoot, game);
    const paths = Object.values(manifest.assets).map((a) => a.path);
    assert.ok(paths.some((p) => p.startsWith('assets/sfx/')));
    assert.ok(paths.some((p) => p.startsWith('assets/fonts/')));
  });

  /* ---- build ---- */
  await test('build pipeline: coder → tester (1 failure) → debugger fix → re-test green', async () => {
    let fixCalls = 0;
    let testRuns = 0;
    const result = await runBuildPipeline(
      { game, gameRoot, instructions: '', emit },
      {
        invokeCoder: async ({ gameRoot: root }) => {
          // fake coder references every manifest variable so the post-gate passes
          const manifest = await readOrInitManifest(root, game);
          const refs = Object.keys(manifest.assets).join(' ');
          await fs.writeFile(path.join(root, 'main.ts'), `// uses: ${refs}\n`, 'utf8');
          return 'wrote main.ts';
        },
        authorAndRunTests: async () => ({
          passed: false, exitCode: 1, signal: null, timedOut: false, durationMs: 5,
          stdout: '', stderr: '', failures: [{ message: 'score never reaches 100', stack: [] }],
        }),
        fixFailures: async () => {
          fixCalls += 1;
          return 'patched';
        },
        runTests: async () => {
          testRuns += 1;
          return { passed: true, exitCode: 0, signal: null, timedOut: false, durationMs: 5, stdout: 'ok', stderr: '', failures: [] };
        },
      },
    );
    assert.equal(result.refused, null);
    assert.equal(fixCalls, 1);
    assert.equal(testRuns, 1);
    assert.equal(result.fixCycles, 1);
    assert.equal(result.testsPassed, true);
    assert.equal(result.manifestOk, true);
    assert.equal(result.ok, true);
  });

  await test('build pipeline refuses without a GDD', async () => {
    const bare = resolveGameRoot('bare-game');
    await fs.mkdir(bare, { recursive: true });
    const result = await runBuildPipeline({ game: 'bare-game', gameRoot: bare, instructions: '', emit }, {});
    assert.match(result.refused ?? '', /gdd/i);
  });

  /* ---- verify ---- */
  await test('verify pipeline aggregates gates and writes verification.json (red path)', async () => {
    const report = await runVerifyPipeline(
      { game, gameRoot, emit },
      {
        evaluateLogic: async () => ({ ok: true, detail: 'coherent (8 cases)' }),
        runPlaytest: async () => ({ ok: false, detail: 'invariants failed: win_reachable' }),
      },
    );
    assert.equal(report.logic.ok, true);
    assert.equal(report.playtest.ok, false);
    assert.equal(report.ok, false); // any red gate → red verification
    const onDisk = JSON.parse(await fs.readFile(path.join(gameRoot, 'reports', 'verification.json'), 'utf8'));
    assert.equal(onDisk.ok, false);
  });

  /* ---- deploy ---- */
  await test('deploy pipeline REFUSES on red verification', async () => {
    const result = await runDeployPipeline(
      { game, gameRoot, emit },
      { createProject: async () => ({ gameDir: gameRoot, written: [], skipped: [] }), deploy: async () => ({ id: 'x', url: 'u', httpsUrl: 'https://u', readyState: 'READY' }) },
    );
    assert.equal(result.ok, false);
    assert.match(result.refused ?? '', /verification/);
  });

  await test('deploy pipeline ships on green verification', async () => {
    const green = { game, verifiedAt: new Date().toISOString(), ok: true };
    await fs.writeFile(path.join(gameRoot, 'reports', 'verification.json'), JSON.stringify(green), 'utf8');
    let wrapped = false;
    const result = await runDeployPipeline(
      { game, gameRoot, emit },
      {
        createProject: async () => {
          wrapped = true;
          return { gameDir: gameRoot, written: [], skipped: [] };
        },
        deploy: async () => ({ id: 'dep_1', url: 'game.vercel.app', httpsUrl: 'https://game.vercel.app', readyState: 'READY' }),
      },
    );
    assert.equal(result.ok, true);
    assert.equal(wrapped, true);
    assert.equal(result.url, 'https://game.vercel.app');
    assert.ok(events.some((e) => e.type === 'artifact' && e.kind === 'deploy'));
  });

  /* ---- shared guards ---- */
  await test('resolveGameRoot rejects traversal slugs; resolveInside blocks escapes', () => {
    assert.throws(() => resolveGameRoot('../etc'));
    assert.throws(() => resolveInside(gameRoot, '../../outside.txt'));
  });

  process.chdir(cwd);
  await fs.rm(tmp, { recursive: true, force: true });
  console.log(`${LOG} all ${passed} tests passed`);
}

void main();
