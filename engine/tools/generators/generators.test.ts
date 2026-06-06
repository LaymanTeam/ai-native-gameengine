/**
 * Tests for the generator tools. Run with: npx tsx engine/tools/generators/generators.test.ts
 *
 * pixel-art: seeded-RNG determinism, dimensions, mirroring, border rules, PNG write.
 * text-trees: Zod schema validation, reference-integrity validation, write path with a mocked model.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSeededRng,
  generateSprite,
  generateSpritePng,
  spriteToPngBuffer,
  type MaskInput,
} from './pixel-art';
import {
  DialogueTreeSchema,
  generateDialogueTree,
  validateDialogueTree,
  writeDialogueTree,
  type DialogueTree,
  type StructuredModel,
} from './text-trees';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
    throw err;
  }
}

// A small 3x4 template exercising every cell value.
const TEMPLATE: MaskInput = {
  data: [
    0, 1, 2,
    -1, 1, 2,
    0, 1, 1,
    0, 0, -1,
  ],
  width: 3,
  height: 4,
  mirrorX: true,
  mirrorY: false,
};

async function run(): Promise<void> {
  console.log('pixel-art:');

  await test('dimensions reflect mirrorX/mirrorY', () => {
    const both = generateSprite(
      { data: [1, 2, 0, -1], width: 2, height: 2, mirrorX: true, mirrorY: true },
      { rng: createSeededRng(1) },
    );
    assert.equal(both.width, 4);
    assert.equal(both.height, 4);

    const none = generateSprite(
      { data: [1, 2, 0, -1], width: 2, height: 2, mirrorX: false, mirrorY: false },
      { rng: createSeededRng(1) },
    );
    assert.equal(none.width, 2);
    assert.equal(none.height, 2);
    assert.equal(none.cells.length, 4);
  });

  await test('seeded RNG is deterministic', () => {
    const a = generateSprite(TEMPLATE, { rng: createSeededRng(42) });
    const b = generateSprite(TEMPLATE, { rng: createSeededRng(42) });
    assert.deepEqual([...a.cells], [...b.cells]);
    assert.deepEqual([...a.pixels], [...b.pixels]);
  });

  await test('different seeds yield different sprites', () => {
    const a = generateSprite(TEMPLATE, { rng: createSeededRng(1) });
    const b = generateSprite(TEMPLATE, { rng: createSeededRng(999) });
    assert.notDeepEqual([...a.cells], [...b.cells]);
  });

  await test('horizontal mirror reflects the cell grid', () => {
    // No randomness in this mask: all cells deterministic (-1 border, 0 empty).
    const m: MaskInput = { data: [-1, 0], width: 2, height: 1, mirrorX: true, mirrorY: false };
    const s = generateSprite(m, { rng: createSeededRng(7) });
    assert.equal(s.width, 4);
    assert.equal(s.height, 1);
    // Row reflected: [-1,0] -> [-1,0,0,-1]. Border=2, empty=0 in resolved cells.
    assert.deepEqual([...s.cells], [2, 0, 0, 2]);
  });

  await test('-1 always becomes border, 0 always empty', () => {
    const m: MaskInput = { data: [-1, 0, -1, 0], width: 2, height: 2, mirrorX: false, mirrorY: false };
    const s = generateSprite(m, { rng: createSeededRng(3) });
    assert.deepEqual([...s.cells], [2, 0, 2, 0]); // 2=border, 0=empty
  });

  await test('body pixels adjacent to empty are promoted to border', () => {
    // A 3x3 solid body surrounded by empty after mirror-off; every body cell touches empty,
    // so all become border. Use value 1 with a seed that resolves them to body.
    // Construct deterministically: center body via -1? -1 is border. Use a forced-body RNG.
    const alwaysBody = () => 0; // rng() < 0.5 -> body for value 1
    const m: MaskInput = {
      data: [
        0, 0, 0,
        0, 1, 0,
        0, 0, 0,
      ],
      width: 3,
      height: 3,
      mirrorX: false,
      mirrorY: false,
    };
    const s = generateSprite(m, { rng: alwaysBody });
    // The single body cell at index 4 is surrounded by empty -> promoted to border (2).
    assert.equal(s.cells[4], 2);
  });

  await test('empty cells are fully transparent', () => {
    const m: MaskInput = { data: [0, 0], width: 2, height: 1, mirrorX: false, mirrorY: false };
    const s = generateSprite(m, { rng: createSeededRng(5) });
    for (let i = 0; i < s.pixels.length; i += 4) {
      assert.equal(s.pixels[i + 3], 0, 'alpha should be 0 for empty cells');
    }
  });

  await test('invalid mask values are rejected', () => {
    assert.throws(() => generateSprite({ data: [5], width: 1, height: 1 }, { rng: createSeededRng(1) }));
    assert.throws(() => generateSprite({ data: [1, 1], width: 1, height: 1 }, { rng: createSeededRng(1) }));
  });

  await test('spriteToPngBuffer produces a valid PNG and scales', () => {
    const s = generateSprite(TEMPLATE, { rng: createSeededRng(11) });
    const buf = spriteToPngBuffer(s, 1);
    assert.ok(buf.length > 0);
    assert.ok(buf.subarray(0, 8).equals(PNG_MAGIC), 'PNG magic header present');
    const scaled = spriteToPngBuffer(s, 4);
    assert.ok(scaled.subarray(0, 8).equals(PNG_MAGIC));
  });

  let tmp = '';
  await test('generateSpritePng writes a PNG file', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'pixelart-'));
    const out = join(tmp, 'sprites', 'creature.png');
    const result = await generateSpritePng(TEMPLATE, out, { rng: createSeededRng(21), scale: 2 });
    assert.equal(result.filePath, out);
    assert.equal(result.width, 6 * 2); // template width 3, mirrorX -> 6, scale 2
    assert.equal(result.height, 4 * 2);
    const st = await stat(out);
    assert.ok(st.size > 0);
    const fileBuf = await readFile(out);
    assert.ok(fileBuf.subarray(0, 8).equals(PNG_MAGIC));
    assert.equal(result.bytes, fileBuf.length);
  });
  if (tmp) await rm(tmp, { recursive: true, force: true });

  console.log('text-trees:');

  const validTree: DialogueTree = {
    id: 'guard-intro',
    title: 'Guard Introduction',
    root: 'start',
    nodes: [
      { id: 'start', speaker: 'Guard', text: 'Halt! Who goes there?', choices: [{ label: 'A friend', next: 'friend' }, { label: 'Run', next: 'end' }] },
      { id: 'friend', speaker: 'Guard', text: 'Prove it.', choices: [{ label: 'Show badge', next: 'end' }] },
      { id: 'end', speaker: 'narrator', text: 'The encounter ends.', choices: [] },
    ],
  };

  await test('Zod schema accepts a valid tree', () => {
    const parsed = DialogueTreeSchema.parse(validTree);
    assert.equal(parsed.nodes.length, 3);
  });

  await test('Zod schema rejects malformed nodes', () => {
    assert.throws(() => DialogueTreeSchema.parse({ id: 'x', title: 't', root: 'a', nodes: [] }));
    assert.throws(() =>
      DialogueTreeSchema.parse({ id: 'x', title: 't', root: 'a', nodes: [{ id: 'a', speaker: 's', text: '', choices: [] }] }),
    );
  });

  await test('validateDialogueTree accepts a sound tree', () => {
    validateDialogueTree(validTree);
  });

  await test('validateDialogueTree catches dangling reference', () => {
    const bad: DialogueTree = {
      ...validTree,
      nodes: [{ id: 'start', speaker: 'G', text: 'Hi', choices: [{ label: 'go', next: 'missing' }] }],
    };
    assert.throws(() => validateDialogueTree(bad), /references a missing node/);
  });

  await test('validateDialogueTree catches missing root', () => {
    const bad: DialogueTree = { ...validTree, root: 'nope' };
    assert.throws(() => validateDialogueTree(bad), /does not reference an existing node/);
  });

  await test('validateDialogueTree catches duplicate ids', () => {
    const bad: DialogueTree = {
      ...validTree,
      root: 'dup',
      nodes: [
        { id: 'dup', speaker: 'G', text: 'a', choices: [] },
        { id: 'dup', speaker: 'G', text: 'b', choices: [] },
      ],
    };
    assert.throws(() => validateDialogueTree(bad), /duplicate node id/);
  });

  // Mocked model that returns a fixed tree regardless of input.
  const mockModel: StructuredModel = {
    withStructuredOutput: () => ({
      invoke: async () => validTree,
    }),
  };

  await test('generateDialogueTree uses injected model and validates', async () => {
    const tree = await generateDialogueTree({ prompt: 'A guard stops the player', model: mockModel });
    assert.equal(tree.id, 'guard-intro');
    assert.equal(tree.nodes.length, 3);
  });

  await test('generateDialogueTree rejects empty prompt', async () => {
    await assert.rejects(() => generateDialogueTree({ prompt: '   ', model: mockModel }));
  });

  await test('generateDialogueTree surfaces invalid model output', async () => {
    const badModel: StructuredModel = {
      withStructuredOutput: () => ({ invoke: async () => ({ ...validTree, root: 'nope' }) }),
    };
    await assert.rejects(() => generateDialogueTree({ prompt: 'x', model: badModel }));
  });

  let tmp2 = '';
  await test('writeDialogueTree writes valid JSON', async () => {
    tmp2 = await mkdtemp(join(tmpdir(), 'texttree-'));
    const out = join(tmp2, 'text', 'guard.json');
    const result = await writeDialogueTree(validTree, out);
    assert.equal(result.nodeCount, 3);
    const raw = await readFile(out, 'utf8');
    const reparsed = DialogueTreeSchema.parse(JSON.parse(raw));
    assert.equal(reparsed.id, 'guard-intro');
  });
  if (tmp2) await rm(tmp2, { recursive: true, force: true });

  await test('writeDialogueTree refuses invalid tree', async () => {
    const out = join(tmpdir(), 'should-not-exist.json');
    await assert.rejects(() => writeDialogueTree({ ...validTree, root: 'nope' }, out));
  });

  console.log(`\nAll ${passed} tests passed.`);
}

run().catch((err) => {
  console.error('Test run aborted:', err);
  process.exit(1);
});
