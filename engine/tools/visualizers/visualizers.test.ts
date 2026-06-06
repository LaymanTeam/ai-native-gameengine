/**
 * Tests for engine/tools/visualizers/{visual-direction,prototype-still,asset-review}.ts.
 * Run: npx tsx engine/tools/visualizers/visualizers.test.ts
 * All model/fs/compositor backends are injected fakes — no network, no API key, no sharp.
 */
process.env.GOOGLE_API_KEY ??= 'offline-test-key';

import assert from 'node:assert/strict';
import {
  StyleBibleSchema,
  VisualDirectionResultSchema,
  extractText,
  parseVisualDirection,
  renderStyleMarkdown,
  styleBibleToPromptPreamble,
  runVisualDirection,
  type StyleBible,
  type GroundedModelLike,
} from './visual-direction';
import {
  resolveLayerBuffer,
  composePrototypeStill,
  type Compositor,
} from './prototype-still';
import {
  DEFAULT_ACCEPT_THRESHOLD,
  DEFAULT_MAX_RETRIES,
  RUBRIC_CRITERIA,
  computeScore,
  decideFromScore,
  parseModelJudgment,
  buildReviewPrompt,
  reviewAsset,
  buildHumanVerdict,
  type RubricScores,
} from './asset-review';

let passed = 0;
function ok(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      throw err;
    });
}

const STYLE: StyleBible = {
  title: 'Cozy 16-bit fishing village',
  summary: 'Warm SNES-era pixel art.',
  artStyle: '16-bit SNES JRPG',
  palette: ['#aabbcc', '112233'],
  spriteResolution: 32,
  perspective: 'top-down',
  outline: { enabled: true, color: '000000', notes: '1px selective outer outline' },
  shading: 'dithered',
  mood: ['cozy', 'warm'],
  rules: ['no anti-aliasing'],
};

const DIRECTION_RESULT = {
  style: STYLE,
  references: [{ title: 'Stardew Valley', reason: 'palette + perspective match', url: 'https://example.com' }],
  notes: 'Grounded notes body.',
};

async function main(): Promise<void> {
  console.log('visual-direction:');

  await ok('StyleBibleSchema accepts valid bible and rejects bad hex', () => {
    StyleBibleSchema.parse(STYLE);
    assert.throws(() => StyleBibleSchema.parse({ ...STYLE, palette: ['#zzzzzz'] }));
  });

  await ok('extractText handles string and block-array content', () => {
    assert.equal(extractText('plain'), 'plain');
    assert.equal(extractText([{ type: 'text', text: 'a' }, { type: 'image', url: 'x' }, 'b']), 'a\nb');
    assert.equal(extractText(42), '');
  });

  await ok('parseVisualDirection parses fenced JSON and rejects garbage', () => {
    const fenced = '```json\n' + JSON.stringify(DIRECTION_RESULT) + '\n```';
    const parsed = parseVisualDirection(fenced);
    VisualDirectionResultSchema.parse(parsed);
    assert.equal(parsed.style.title, STYLE.title);
    // Bare (unfenced) JSON with surrounding prose:
    const bare = parseVisualDirection(`Here you go: ${JSON.stringify(DIRECTION_RESULT)} done.`);
    assert.equal(bare.references.length, 1);
    assert.throws(() => parseVisualDirection(''), /empty model response/);
    assert.throws(() => parseVisualDirection('no json here'), /no JSON object/);
    assert.throws(() => parseVisualDirection('{ broken'), /no JSON object|invalid JSON/);
  });

  await ok('renderStyleMarkdown includes normalized palette, rules, references', () => {
    const md = renderStyleMarkdown(DIRECTION_RESULT);
    assert.match(md, /# Style Bible — Cozy 16-bit fishing village/);
    assert.match(md, /#aabbcc, #112233/);
    assert.match(md, /no anti-aliasing/);
    assert.match(md, /Stardew Valley/);
    assert.match(md, /\[source\]\(https:\/\/example\.com\)/);
  });

  await ok('styleBibleToPromptPreamble is deterministic and complete', () => {
    const pre = styleBibleToPromptPreamble(STYLE);
    assert.match(pre, /^STYLE BIBLE — obey strictly:/);
    assert.match(pre, /Palette \(use only these\): #aabbcc, #112233\./);
    assert.match(pre, /outlined in #000000/);
    assert.match(pre, /Rules: no anti-aliasing\./);
    assert.equal(pre, styleBibleToPromptPreamble(STYLE));
  });

  await ok('runVisualDirection writes all four artifacts via injected fs', async () => {
    const writes = new Map<string, string>();
    const mkdirs: string[] = [];
    const model: GroundedModelLike = {
      invoke: async () => ({
        content: '```json\n' + JSON.stringify(DIRECTION_RESULT) + '\n```',
        response_metadata: { groundingMetadata: { chunks: 2 } },
      }),
    };
    const out = await runVisualDirection(
      { prompt: 'cozy fishing game', gameRoot: '/tmp/game' },
      {
        model,
        writeFile: async (f, d) => void writes.set(f, d),
        mkdir: async (d) => void mkdirs.push(d),
      },
    );
    assert.equal(out.files.styleJson, '/tmp/game/config/style.json');
    assert.equal(out.files.styleMd, '/tmp/game/reports/style.md');
    assert.equal(writes.size, 4);
    const styleJson = JSON.parse(writes.get(out.files.styleJson) ?? '{}') as StyleBible;
    // Hex normalized to leading-# on disk:
    assert.deepEqual(styleJson.palette, ['#aabbcc', '#112233']);
    assert.equal(styleJson.outline.color, '#000000');
    const refs = JSON.parse(writes.get(out.files.referencesJson) ?? '{}') as { grounding: unknown };
    assert.deepEqual(refs.grounding, { chunks: 2 });
    assert.equal(mkdirs.length, 4);
  });

  await ok('runVisualDirection validates inputs', async () => {
    await assert.rejects(() => runVisualDirection({ prompt: ' ', gameRoot: '/x' }), /prompt/);
    await assert.rejects(() => runVisualDirection({ prompt: 'x', gameRoot: '' }), /gameRoot/);
  });

  console.log('prototype-still:');

  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  await ok('resolveLayerBuffer decodes data URLs and reads absolute paths', async () => {
    const dataUrl = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
    const fromUrl = await resolveLayerBuffer(dataUrl, async () => {
      throw new Error('should not read fs');
    });
    assert.deepEqual(fromUrl, PNG_BYTES);
    const fromFile = await resolveLayerBuffer('/abs/sprite.png', async (f) => {
      assert.equal(f, '/abs/sprite.png');
      return PNG_BYTES;
    });
    assert.deepEqual(fromFile, PNG_BYTES);
    await assert.rejects(() => resolveLayerBuffer('data:image/png;base64', async () => PNG_BYTES), /malformed/);
    await assert.rejects(() => resolveLayerBuffer('relative/path.png', async () => PNG_BYTES), /absolute/);
    await assert.rejects(() => resolveLayerBuffer('  ', async () => PNG_BYTES), /empty source/);
  });

  await ok('composePrototypeStill resolves layers, composites, writes PNG', async () => {
    const composeCalls: unknown[] = [];
    const written: { file?: string; bytes?: Buffer } = {};
    const compositor: Compositor = {
      compose: async (opts) => {
        composeCalls.push(opts);
        assert.equal(opts.width, 320);
        assert.equal(opts.background, '#112233'); // normalized from bare hex
        assert.equal(opts.layers.length, 2);
        assert.equal(opts.layers[0]?.name, 'bg');
        assert.equal(opts.layers[1]?.x, 16);
        return Buffer.from('composite');
      },
    };
    const out = await composePrototypeStill(
      {
        scene: {
          width: 320,
          height: 180,
          background: '112233',
          layers: [
            { name: 'bg', source: `data:image/png;base64,${PNG_BYTES.toString('base64')}` },
            { name: 'player', source: '/abs/player.png', x: 16, y: 32 },
          ],
        },
        outPath: '/tmp/game/references/prototype.png',
      },
      {
        compositor,
        readFile: async () => PNG_BYTES,
        writeFile: async (f, d) => {
          written.file = f;
          written.bytes = d;
        },
        mkdir: async () => undefined,
      },
    );
    assert.equal(composeCalls.length, 1);
    assert.equal(written.file, '/tmp/game/references/prototype.png');
    assert.equal(written.bytes?.toString(), 'composite');
    assert.deepEqual(out, { outPath: '/tmp/game/references/prototype.png', width: 320, height: 180, layerCount: 2 });
  });

  await ok('composePrototypeStill rejects bad scene / relative outPath', async () => {
    const compositor: Compositor = { compose: async () => Buffer.alloc(0) };
    await assert.rejects(() =>
      composePrototypeStill(
        { scene: { width: 0, height: 10, layers: [{ name: 'a', source: '/x.png' }] }, outPath: '/o.png' },
        { compositor },
      ),
    );
    await assert.rejects(
      () =>
        composePrototypeStill(
          { scene: { width: 1, height: 1, layers: [{ name: 'a', source: '/x.png' }] }, outPath: 'rel.png' },
          { compositor },
        ),
      /absolute/,
    );
  });

  console.log('asset-review:');

  const RUBRIC: RubricScores = {
    paletteAdherence: 90,
    styleConsistency: 80,
    resolutionFidelity: 70,
    subjectAccuracy: 60,
    outlineCompliance: 50,
  };

  await ok('computeScore is the equal-weight rounded mean', () => {
    assert.equal(computeScore(RUBRIC), 70);
    assert.equal(RUBRIC_CRITERIA.length, 5);
  });

  await ok('decideFromScore: accept / retry / escalate boundaries', () => {
    const cfg = { acceptThreshold: DEFAULT_ACCEPT_THRESHOLD, maxRetries: DEFAULT_MAX_RETRIES, attempt: 0 };
    assert.equal(decideFromScore(75, cfg), 'accept');
    assert.equal(decideFromScore(74, cfg), 'retry');
    assert.equal(decideFromScore(74, { ...cfg, attempt: 3 }), 'escalate');
    assert.equal(decideFromScore(100, { ...cfg, attempt: 3 }), 'accept');
  });

  await ok('parseModelJudgment parses fenced JSON, rejects malformed', () => {
    const good = parseModelJudgment(
      '```json\n' + JSON.stringify({ rubric: RUBRIC, issues: ['darker outline'], rationale: 'ok' }) + '\n```',
    );
    assert.equal(good.issues[0], 'darker outline');
    assert.throws(() => parseModelJudgment(''), /empty/);
    assert.throws(() => parseModelJudgment('prose only'), /no JSON/);
    assert.throws(() => parseModelJudgment('{"rubric":{}}'), /./); // zod failure
  });

  await ok('buildReviewPrompt embeds style preamble + asset intent', () => {
    const prompt = buildReviewPrompt({ name: 'sprites/player', dataUrl: 'data:x', intent: 'idle player' }, STYLE);
    assert.match(prompt, /STYLE BIBLE — obey strictly:/);
    assert.match(prompt, /Asset under review: sprites\/player/);
    assert.match(prompt, /Intended subject: idle player/);
  });

  await ok('reviewAsset: model judgment → deterministic verdict (multimodal payload)', async () => {
    let sawImage = false;
    const verdict = await reviewAsset(
      { name: 'sprites/player', dataUrl: 'data:image/png;base64,AAAA', intent: 'idle player' },
      STYLE,
      { attempt: 1 },
      {
        model: {
          invoke: async (input) => {
            const messages = input as { role: string; content: unknown }[];
            const user = messages.find((m) => m.role === 'user');
            sawImage = JSON.stringify(user?.content).includes('image_url');
            return {
              content: JSON.stringify({ rubric: RUBRIC, issues: ['fix outline'], rationale: 'meh' }),
            };
          },
        },
      },
    );
    assert.ok(sawImage, 'review prompt must include the image block');
    assert.equal(verdict.score, 70);
    assert.equal(verdict.decision, 'retry'); // 70 < 75, attempt 1 < 3
    assert.equal(verdict.human, false);
  });

  await ok('reviewAsset rejects empty dataUrl', async () => {
    await assert.rejects(
      () => reviewAsset({ name: 'x', dataUrl: ' ', intent: 'y' }, STYLE, {}, { model: { invoke: async () => ({ content: '' }) } }),
      /dataUrl/,
    );
  });

  await ok('buildHumanVerdict clamps score and marks human', () => {
    const accept = buildHumanVerdict({ accept: true });
    assert.equal(accept.score, 100);
    assert.equal(accept.decision, 'accept');
    assert.equal(accept.human, true);
    const reject = buildHumanVerdict({ accept: false, score: 250, issues: ['too dark'] });
    assert.equal(reject.score, 100); // clamped
    assert.equal(reject.decision, 'retry');
    assert.deepEqual(reject.issues, ['too dark']);
    const low = buildHumanVerdict({ accept: false, score: -5 });
    assert.equal(low.score, 0);
  });

  console.log(`\n${passed} visualizer tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
