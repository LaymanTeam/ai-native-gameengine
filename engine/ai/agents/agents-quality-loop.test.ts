/**
 * Offline tests for the quality-loop agents (Unit 12) — no API key needed. Exercises the
 * deterministic engines: truth-table logic evaluation, rubric scoring math, minimal-diff
 * application, headless playtest invariants, and factory construction with fake injected deps.
 */
import assert from 'node:assert/strict';
import {
  evaluateBooleanExpression,
  enumerateAssignments,
  evaluateRuleSpec,
  RuleSpecSchema,
  createLogicEvaluatorAgent,
} from './logic-evaluator';
import {
  buildVerdict,
  scoreRubric,
  DEFAULT_PASS_THRESHOLD,
  RubricVerdictSchema,
  createImageReviewerAgent,
  type RubricScores,
} from './image-reviewer';
import { applyMinimalDiff, createDebuggerAgent } from './debugger';
import {
  hasNanPosition,
  positionsChanged,
  runPlaytest,
  PlaytestReportSchema,
  createPlaytesterAgent,
  type GameSession,
} from './playtester';
import { createTesterAgent } from './tester';

const TEST_LOG_PREFIX = '[engine/ai/agents/agents-quality-loop.test]';

// Offline guard: factory-construction tests never call the API, but the Gemini client
// constructor requires a key to be present.
process.env.GOOGLE_API_KEY ??= 'offline-test-key';

type TestFn = () => void | Promise<void>;
const tests: Array<[string, TestFn]> = [];
function test(name: string, fn: TestFn): void {
  tests.push([name, fn]);
}

// ---------------------------------------------------------------------------
// logic-evaluator: deterministic truth-table engine
// ---------------------------------------------------------------------------

test('evaluateBooleanExpression handles and/or/not/parens/literals', () => {
  assert.equal(evaluateBooleanExpression('a and not b', { a: true, b: false }), true);
  assert.equal(evaluateBooleanExpression('a and b', { a: true, b: false }), false);
  assert.equal(evaluateBooleanExpression('(a or b) and not (a and b)', { a: true, b: true }), false);
  assert.equal(evaluateBooleanExpression('true or x', { x: false }), true);
  assert.throws(() => evaluateBooleanExpression('a; process.exit(1)', { a: true }), /token|character|parse/i);
});

test('enumerateAssignments produces 2^n rows', () => {
  assert.equal(enumerateAssignments([]).length, 1);
  assert.equal(enumerateAssignments(['a']).length, 2);
  assert.equal(enumerateAssignments(['a', 'b', 'c']).length, 8);
});

test('coherent spec passes: win/lose mutually exclusive and both reachable', () => {
  const spec = RuleSpecSchema.parse({
    propositions: [
      { name: 'reachedExit', meaning: 'player reached the exit' },
      { name: 'hpZero', meaning: 'player hp dropped to zero' },
    ],
    winCondition: { expression: 'reachedExit and not hpZero' },
    loseCondition: { expression: 'hpZero' },
  });
  const verdict = evaluateRuleSpec(spec);
  assert.equal(verdict.coherent, true, JSON.stringify(verdict.issues));
  assert.equal(verdict.issues.length, 0);
  assert.ok(verdict.casesEnumerated >= 4);
});

test('win/lose overlap is detected as incoherent', () => {
  const spec = RuleSpecSchema.parse({
    propositions: [{ name: 'x', meaning: 'x' }],
    winCondition: { expression: 'x' },
    loseCondition: { expression: 'x' },
  });
  const verdict = evaluateRuleSpec(spec);
  assert.equal(verdict.coherent, false);
  assert.ok(verdict.issues.some((i) => i.kind === 'win_lose_overlap'));
});

test('unreachable win is detected', () => {
  const spec = RuleSpecSchema.parse({
    propositions: [{ name: 'x', meaning: 'x' }],
    winCondition: { expression: 'x and not x' },
    loseCondition: { expression: 'x' },
  });
  const verdict = evaluateRuleSpec(spec);
  assert.equal(verdict.coherent, false);
  assert.ok(verdict.issues.some((i) => i.kind === 'win_unreachable'));
});

test('contradictory rule constraints are detected', () => {
  const spec = RuleSpecSchema.parse({
    propositions: [{ name: 'doorOpen', meaning: 'door open' }],
    winCondition: { expression: 'doorOpen' },
    loseCondition: { expression: 'not doorOpen' },
    ruleConstraints: [{ expression: 'doorOpen and not doorOpen', description: 'key opens door vs door never opens' }],
  });
  const verdict = evaluateRuleSpec(spec);
  assert.equal(verdict.coherent, false);
  assert.ok(verdict.issues.some((i) => i.kind === 'contradictory_constraint'));
});

test('state machines: undefined transitions / dead ends / unreachable states are detected', () => {
  const spec = RuleSpecSchema.parse({
    propositions: [{ name: 'w', meaning: 'w' }],
    winCondition: { expression: 'w' },
    loseCondition: { expression: 'not w' },
    stateMachines: [
      {
        entity: 'door',
        states: ['closed', 'open', 'stuck', 'phantom'],
        initial: 'closed',
        terminalStates: ['open'],
        transitions: [
          { from: 'closed', to: 'open', on: 'use_key' },
          { from: 'closed', to: 'stuck', on: 'break_key' },
          // 'stuck' is a non-terminal dead end; 'phantom' is unreachable.
        ],
      },
    ],
  });
  const verdict = evaluateRuleSpec(spec);
  assert.equal(verdict.coherent, false);
  assert.ok(verdict.issues.some((i) => i.kind === 'dead_end_state'));
  assert.ok(verdict.issues.some((i) => i.kind === 'unreachable_state'));
});

// ---------------------------------------------------------------------------
// image-reviewer: rubric math + verdicts
// ---------------------------------------------------------------------------

const PERFECT: RubricScores = {
  paletteAdherence: 1,
  resolutionFit: 1,
  perspective: 1,
  outlineRules: 1,
  subjectMatch: 1,
};

test('scoreRubric weights and clamps sub-scores', () => {
  assert.equal(scoreRubric(PERFECT), 1);
  assert.equal(scoreRubric({ ...PERFECT, paletteAdherence: 0 }) < 1, true);
  // out-of-range inputs are clamped, never NaN
  const wild = scoreRubric({ ...PERFECT, perspective: 42, outlineRules: -5 });
  assert.ok(wild >= 0 && wild <= 1);
  // zero weights fall back to unweighted mean (no NaN)
  const zeroWeighted = scoreRubric(PERFECT, {
    paletteAdherence: 0,
    resolutionFit: 0,
    perspective: 0,
    outlineRules: 0,
    subjectMatch: 0,
  });
  assert.equal(zeroWeighted, 1);
});

test('buildVerdict applies the pass threshold and validates against the schema', () => {
  const pass = buildVerdict({ assetId: 'a1', scores: PERFECT, feedback: 'great', attempt: 1 });
  assert.equal(pass.passed, true);
  RubricVerdictSchema.parse(pass);
  const low: RubricScores = { ...PERFECT, subjectMatch: 0, paletteAdherence: 0, perspective: 0 };
  const fail = buildVerdict({ assetId: 'a1', scores: low, feedback: 'off-style', attempt: 2 });
  assert.equal(fail.passed, fail.weightedScore >= DEFAULT_PASS_THRESHOLD);
  assert.equal(fail.passed, false);
});

// ---------------------------------------------------------------------------
// debugger: minimal-diff engine
// ---------------------------------------------------------------------------

test('applyMinimalDiff applies unique anchored edits in order', () => {
  // Original is large enough that two small edits stay under the rewrite-fraction guard.
  const original = `const speed = 1;\nconst gravity = 9.8;\n${'// padding line keeping edits minimal\n'.repeat(20)}`;
  const result = applyMinimalDiff(original, [
    { find: 'const speed = 1;', replace: 'const speed = 2;', reason: 'fix speed' },
    { find: 'const speed = 2;', replace: 'const speed = 3;', reason: 'sees prior edit' },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 2);
  assert.ok(result.content.includes('const speed = 3;'));
});

test('applyMinimalDiff rejects missing, ambiguous, and rewrite-scale edits', () => {
  const original = 'aaa bbb aaa\n';
  assert.equal(applyMinimalDiff(original, [{ find: 'zzz', replace: 'y', reason: 'r' }]).ok, false);
  assert.equal(applyMinimalDiff(original, [{ find: 'aaa', replace: 'y', reason: 'r' }]).ok, false, 'ambiguous');
  assert.equal(applyMinimalDiff(original, []).ok, false, 'no edits');
  const big = applyMinimalDiff('short', [{ find: 'short', replace: 'x'.repeat(10_000), reason: 'rewrite' }]);
  assert.equal(big.ok, false, 'disguised whole-file rewrite must be rejected');
});

// ---------------------------------------------------------------------------
// playtester: headless invariants with a fake GameSession
// ---------------------------------------------------------------------------

function makeFakeSession(opts: { winAt?: number; loseAt?: number; moves?: boolean; nan?: boolean }): GameSession {
  let steps = 0;
  let x = 0;
  return {
    reset() {
      steps = 0;
      x = 0;
    },
    dispatch(action: string) {
      if (opts.moves !== false && action.startsWith('move')) x += 1;
    },
    step() {
      steps++;
      return 1;
    },
    positions() {
      return [{ eid: 1, x: opts.nan ? Number.NaN : x, y: 0 }];
    },
    isWin() {
      return opts.winAt !== undefined && steps >= opts.winAt;
    },
    isLose() {
      return opts.loseAt !== undefined && steps >= opts.loseAt;
    },
    availableActions() {
      return ['move_left', 'move_right', 'jump'];
    },
  };
}

test('hasNanPosition / positionsChanged primitives', () => {
  assert.equal(hasNanPosition([{ eid: 1, x: 0, y: 0 }]), false);
  assert.equal(hasNanPosition([{ eid: 1, x: Number.NaN, y: 0 }]), true);
  assert.equal(hasNanPosition([{ eid: 1, x: Number.POSITIVE_INFINITY, y: 0 }]), true);
  assert.equal(positionsChanged([{ eid: 1, x: 0, y: 0 }], [{ eid: 1, x: 0, y: 0 }]), false);
  assert.equal(positionsChanged([{ eid: 1, x: 0, y: 0 }], [{ eid: 1, x: 1, y: 0 }]), true);
});

test('runPlaytest passes a playable game and validates the report schema', () => {
  const report = runPlaytest(makeFakeSession({ winAt: 5, loseAt: 50 }), { maxSteps: 100 });
  PlaytestReportSchema.parse(report);
  assert.equal(report.playable, true, JSON.stringify(report.invariants));
  for (const inv of report.invariants) assert.equal(inv.passed, true, inv.name);
});

test('runPlaytest fails an immobile game and a NaN-position game', () => {
  const immobile = runPlaytest(makeFakeSession({ winAt: 5, loseAt: 6, moves: false }), { maxSteps: 50 });
  assert.equal(immobile.playable, false);
  assert.ok(immobile.invariants.some((i) => i.name === 'player_can_move' && !i.passed));

  const nan = runPlaytest(makeFakeSession({ winAt: 5, loseAt: 6, nan: true }), { maxSteps: 50 });
  assert.equal(nan.playable, false);
  assert.ok(nan.invariants.some((i) => i.name === 'no_nan_positions' && !i.passed));
});

test('runPlaytest fails when win is never reachable', () => {
  const report = runPlaytest(makeFakeSession({ loseAt: 10 }), { maxSteps: 30 });
  assert.equal(report.playable, false);
  assert.ok(report.invariants.some((i) => i.name === 'win_reachable' && !i.passed));
});

// ---------------------------------------------------------------------------
// factories construct with fake injected deps (no API calls are made)
// ---------------------------------------------------------------------------

test('all five agent factories construct with fake deps', () => {
  assert.ok(createLogicEvaluatorAgent());
  assert.ok(
    createImageReviewerAgent({
      styleBible: '8x8 pixel art, 4-color palette',
      reviewSurface: { requestHumanReview: async () => ({ approved: true, note: '' }) },
      regenerator: { regenerate: async () => ({ dataUrl: 'data:image/png;base64,AA==' }) },
    }),
  );
  assert.ok(
    createDebuggerAgent({
      io: { readFile: async () => '', writeFile: async () => undefined },
    }),
  );
  assert.ok(
    createPlaytesterAgent({
      createSession: () => makeFakeSession({ winAt: 1 }),
      visionCheck: { inspect: async () => ({ ok: true, notes: '' }) },
      styleBible: '8x8 pixel art',
    }),
  );
  assert.ok(
    createTesterAgent({
      writer: { writeTestFile: async () => ({ path: '/tmp/tests.ts' }) },
      runner: {
        run: async () => ({ passed: true, total: 1, failed: 0, output: '', failures: [] }),
      },
    }),
  );
});

async function main(): Promise<void> {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`${TEST_LOG_PREFIX} ok - ${name}`);
    } catch (err) {
      failed++;
      console.error(`${TEST_LOG_PREFIX} FAIL - ${name}`, err);
    }
  }
  if (failed > 0) {
    console.error(`${TEST_LOG_PREFIX} ${failed}/${tests.length} tests FAILED`);
    process.exit(1);
  }
  console.log(`${TEST_LOG_PREFIX} all ${tests.length} tests passed`);
}

void main();
