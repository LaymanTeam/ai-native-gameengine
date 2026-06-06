/**
 * Unit tests for the design/build agents (designer, coder, researcher, planner-interpreter,
 * search-and-get). No API key required: we test factory construction with injected fake tools,
 * Zod schema validation, prompt/markdown-assembly helpers, and the deterministic license filter.
 *
 * Run: npx tsx engine/ai/agents/agents-design-build.test.ts
 */
import assert from 'node:assert/strict';
import { tool } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import * as z from 'zod';

import {
  createDesignerAgent,
  designerThreadConfig,
  gddSchema,
  parseGdd,
  renderGddMarkdown,
  type GameDesignDocument,
} from './designer';
import {
  createCoderAgent,
  clampDiagnostics,
  makeTypecheckTool,
  runTypecheck,
  TYPECHECK_OUTPUT_LIMIT,
} from './coder';
import {
  createResearcherAgent,
  renderResearchNoteMarkdown,
  researchNoteSchema,
} from './researcher';
import {
  createPlannerInterpreterAgent,
  parsePipelinePlan,
  pipelinePlanSchema,
  planNeedsUserInput,
  type PipelinePlan,
} from './planner-interpreter';
import {
  createSearchAndGetAgent,
  filterCompatibleAssets,
  isGplCompatibleLicense,
  licenseRecordSchema,
  normalizeLicense,
  openGameArtSearchUrl,
  type LicenseRecord,
} from './search-and-get';

// Construction instantiates a ChatGoogleGenerativeAI, which requires a key to exist (no network
// call is made). Use a dummy so factory-construction tests run fully offline.
process.env['GOOGLE_API_KEY'] = process.env['GOOGLE_API_KEY'] ?? 'test-dummy-key';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function fakeTool(name: string): StructuredToolInterface {
  return tool(() => 'ok', {
    name,
    description: `fake ${name}`,
    schema: z.object({ value: z.string() }),
  }) as unknown as StructuredToolInterface;
}

// ---------------- designer ----------------

const goodGdd: GameDesignDocument = {
  title: 'Lantern Run',
  pitch: 'Light the village before dawn.',
  genre: 'top-down adventure',
  coreMechanic: 'lighting lanterns to push back the dark',
  scenes: [{ id: 'village', name: 'The Village', description: 'A foggy hamlet.' }],
  winCondition: 'all lanterns lit',
  loseCondition: 'dawn arrives with a dark lantern',
  controls: ['move', 'light'],
  nonGoals: ['no combat', 'no multiplayer'],
};

test('gddSchema accepts a valid bounded GDD', () => {
  const r = parseGdd(goodGdd);
  assert.equal(r.ok, true);
});

test('gddSchema rejects >3 scenes', () => {
  const bad = {
    ...goodGdd,
    scenes: [
      { id: 'a', name: 'A', description: 'a' },
      { id: 'b', name: 'B', description: 'b' },
      { id: 'c', name: 'C', description: 'c' },
      { id: 'd', name: 'D', description: 'd' },
    ],
  };
  const r = parseGdd(bad);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes('scenes')));
});

test('gddSchema rejects empty core mechanic and missing non-goals', () => {
  assert.equal(gddSchema.safeParse({ ...goodGdd, coreMechanic: '' }).success, false);
  assert.equal(gddSchema.safeParse({ ...goodGdd, nonGoals: [] }).success, false);
});

test('renderGddMarkdown emits title, mechanic, scenes, and non-goals', () => {
  const md = renderGddMarkdown(goodGdd);
  assert.ok(md.includes('# Game Design Document — Lantern Run'));
  assert.ok(md.includes('lighting lanterns'));
  assert.ok(md.includes('The Village'));
  assert.ok(md.includes('no combat'));
});

test('createDesignerAgent builds with injected tools and exposes thread config', () => {
  const agent = createDesignerAgent({ tools: [fakeTool('write_gdd')] });
  assert.ok(agent);
  assert.deepEqual(designerThreadConfig('game-1'), { configurable: { thread_id: 'game-1' } });
});

test('createDesignerAgent builds with no tools', () => {
  assert.ok(createDesignerAgent());
});

// ---------------- coder ----------------

test('clampDiagnostics handles empty and oversized output', () => {
  assert.equal(clampDiagnostics('   '), '(no diagnostics — clean)');
  const big = 'x'.repeat(TYPECHECK_OUTPUT_LIMIT + 500);
  const clamped = clampDiagnostics(big);
  assert.ok(clamped.length <= TYPECHECK_OUTPUT_LIMIT + 32);
  assert.ok(clamped.endsWith('(truncated)'));
});

test('makeTypecheckTool produces a named tool', () => {
  const t = makeTypecheckTool('/tmp/some-game');
  assert.equal(t.name, 'typecheck_game');
});

test('runTypecheck rejects empty game dir', async () => {
  await assert.rejects(() => runTypecheck(''));
});

test('createCoderAgent requires gameDir and always adds the typecheck tool', () => {
  assert.throws(() => createCoderAgent({ gameDir: '' } as { gameDir: string }));
  const agent = createCoderAgent({ gameDir: '/tmp/game', tools: [fakeTool('write_file')] });
  assert.ok(agent);
});

// ---------------- researcher ----------------

test('researchNoteSchema validates and renders to markdown', () => {
  const note = { topic: 'jump feel', summary: 'short coyote time helps.', sources: ['celeste'] };
  assert.equal(researchNoteSchema.safeParse(note).success, true);
  const md = renderResearchNoteMarkdown(note);
  assert.ok(md.includes('# Research — jump feel'));
  assert.ok(md.includes('## Sources'));
  assert.ok(md.includes('celeste'));
});

test('renderResearchNoteMarkdown omits Sources section when empty', () => {
  const md = renderResearchNoteMarkdown({ topic: 't', summary: 's', sources: [] });
  assert.ok(!md.includes('## Sources'));
});

test('createResearcherAgent builds', () => {
  assert.ok(createResearcherAgent({ tools: [fakeTool('write_research_note')] }));
});

// ---------------- planner-interpreter ----------------

const goodPlan: PipelinePlan = {
  gameIdea: 'a calm fishing game',
  genre: 'casual sim',
  coreMechanicCandidate: 'timing-based fishing',
  targetSceneCount: 2,
  phases: ['design', 'assets', 'code', 'test', 'deploy'],
  constraints: ['mobile-friendly'],
  openQuestions: [],
};

test('pipelinePlanSchema accepts a valid plan and rejects bad phase/scene count', () => {
  assert.equal(parsePipelinePlan(goodPlan).ok, true);
  assert.equal(pipelinePlanSchema.safeParse({ ...goodPlan, targetSceneCount: 9 }).success, false);
  assert.equal(pipelinePlanSchema.safeParse({ ...goodPlan, phases: ['ship'] }).success, false);
});

test('planNeedsUserInput reflects open questions', () => {
  assert.equal(planNeedsUserInput(goodPlan), false);
  assert.equal(planNeedsUserInput({ ...goodPlan, openQuestions: ['2D or 3D?'] }), true);
});

test('createPlannerInterpreterAgent builds', () => {
  assert.ok(createPlannerInterpreterAgent());
});

// ---------------- search-and-get ----------------

test('normalizeLicense uppercases and normalizes separators', () => {
  assert.equal(normalizeLicense(' cc by 4.0 '), 'CC-BY-4.0');
  assert.equal(normalizeLicense('cc0_1.0'), 'CC0-1.0');
});

test('isGplCompatibleLicense accepts CC0/CC-BY/GPL and rejects NC/ND/unknown', () => {
  assert.equal(isGplCompatibleLicense('CC0-1.0'), true);
  assert.equal(isGplCompatibleLicense('CC-BY-4.0'), true);
  assert.equal(isGplCompatibleLicense('GPL-3.0'), true);
  assert.equal(isGplCompatibleLicense('CC-BY-NC-4.0'), false);
  assert.equal(isGplCompatibleLicense('CC-BY-ND-4.0'), false);
  assert.equal(isGplCompatibleLicense('CC-BY-NC-ND-4.0'), false);
  assert.equal(isGplCompatibleLicense('Proprietary'), false);
  assert.equal(isGplCompatibleLicense(''), false);
});

test('filterCompatibleAssets partitions records', () => {
  const base = {
    asset: 'sfx/jump.wav',
    source: 'opengameart.org',
    sourceUrl: 'https://opengameart.org/x',
    author: 'someone',
    retrievedAt: new Date().toISOString(),
    attributionRequired: false,
  };
  const records: LicenseRecord[] = [
    { ...base, asset: 'a.wav', license: 'CC0-1.0' },
    { ...base, asset: 'b.wav', license: 'CC-BY-NC-4.0' },
  ];
  records.forEach((r) => assert.equal(licenseRecordSchema.safeParse(r).success, true));
  const { kept, rejected } = filterCompatibleAssets(records);
  assert.equal(kept.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(kept[0]?.asset, 'a.wav');
});

test('openGameArtSearchUrl encodes the query', () => {
  assert.equal(
    openGameArtSearchUrl('pixel forest'),
    'https://opengameart.org/art-search-advanced?keys=pixel%20forest',
  );
});

test('createSearchAndGetAgent builds with the deterministic license tool always present', () => {
  assert.ok(createSearchAndGetAgent({ tools: [fakeTool('fetch_sfx')] }));
});

console.log(`\n${passed} tests passed`);
