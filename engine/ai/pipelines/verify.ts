/**
 * Verify pipeline (phase 4): the deploy gate CHAIN. Runs every quality verdict and writes
 * reports/verification.json — deploy_game refuses without ok:true here.
 *
 *   typecheck (deterministic) + manifest bidirectional validation (deterministic)
 *   + game test suite (deterministic) + LOGIC-EVALUATOR subagent (model extracts the RuleSpec
 *   from the GDD; truth-table verdict is deterministic) + headless playtest (subprocess driving
 *   the game's tests/headless-session.ts bridge through the deterministic harness).
 *
 * Pipeline contract: logic-evaluator proves the RULES are coherent; the playtester proves the
 * BUILD obeys them — both required before deploy.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HumanMessage } from '@langchain/core/messages';
import { runTypecheck } from '../agents/coder';
import { createLogicEvaluatorAgent, type LogicVerdict } from '../agents/logic-evaluator';
import { PlaytestReportSchema, type PlaytestReport } from '../agents/playtester';
import { validateManifest } from '../../compiler/asset-manifest';
import type { GameDesignDocument } from '../agents/designer';
import type { EmitEvent } from '../events';
import {
  PIPELINES_LOG_PREFIX,
  VERIFICATION_FILENAME,
  formatIssues,
  readJsonIfExists,
  readOrInitManifest,
} from './shared';

export interface VerificationReport {
  game: string;
  verifiedAt: string;
  ok: boolean;
  typecheck: { ok: boolean; output: string };
  manifest: { ok: boolean; issues: string };
  tests: { passed: boolean; failures: string[] };
  logic: { ok: boolean; detail: string };
  playtest: { ok: boolean; detail: string };
}

interface TestFailure {
  message: string;
  stack: string[];
}

interface TestRunResult {
  passed: boolean;
  failures: TestFailure[];
  stdout: string;
  stderr: string;
}

export interface VerifyDeps {
  /** Logic-evaluator subagent step. Injected in tests. */
  evaluateLogic?: (gdd: GameDesignDocument, game: string) => Promise<{ ok: boolean; detail: string }>;
  /** Headless playtest step. Injected in tests. */
  runPlaytest?: (gameRoot: string) => Promise<{ ok: boolean; detail: string }>;
}

/** Default logic step: the LOGIC-EVALUATOR subagent extracts the RuleSpec; verdict is deterministic. */
async function evaluateLogicWithAgent(gdd: GameDesignDocument, game: string): Promise<{ ok: boolean; detail: string }> {
  let verdict: LogicVerdict | null = null;
  const agent = createLogicEvaluatorAgent((v) => {
    verdict = v;
  });
  await agent.invoke(
    {
      messages: [
        new HumanMessage(
          `Extract the rule propositions, win/lose expressions, constraints, and state machines from ` +
            `this GDD, then call verify_rule_spec.\n\n## GDD\n${JSON.stringify(gdd, null, 2)}`,
        ),
      ],
    },
    { configurable: { thread_id: `logic-${game}` }, recursionLimit: 30 },
  );
  if (!verdict) return { ok: false, detail: 'logic-evaluator produced no verdict (verify_rule_spec never called)' };
  const v = verdict as LogicVerdict;
  return {
    ok: v.coherent,
    detail: v.coherent
      ? `coherent (${v.casesEnumerated} cases enumerated)`
      : v.issues.map((i) => `${i.route}: ${i.detail}`).join('; ').slice(0, 600),
  };
}

/** Default playtest step: spawn the tsx runner so the game's TS bridge loads outside Next. */
function runPlaytestSubprocess(gameRoot: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', path.join('engine', 'testing', 'playtest-runner.ts'), gameRoot], {
      cwd: /* turbopackIgnore: true */ process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ ok: false, detail: 'playtest timed out (120s)' });
    }, 120_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 2) {
        resolve({ ok: false, detail: `headless bridge missing/unloadable: ${stderr.trim().slice(0, 300)} — re-run build_game (the coder must write tests/headless-session.ts)` });
        return;
      }
      const parsed = PlaytestReportSchema.safeParse(JSON.parse(stdout || 'null'));
      if (!parsed.success) {
        resolve({ ok: false, detail: `unparseable playtest report: ${stdout.slice(0, 200)}` });
        return;
      }
      const report: PlaytestReport = parsed.data;
      const failed = report.invariants.filter((i) => !i.passed).map((i) => i.name);
      resolve({
        ok: report.playable,
        detail: report.playable
          ? `playable (${report.stepsRun} steps, worst ${report.worstStepMs.toFixed(1)}ms)`
          : `invariants failed: ${failed.join(', ')}`,
      });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: `playtest spawn failed: ${error.message}` });
    });
  });
}

const FAILURE_LINE = /\b(FAIL(?:ED)?|AssertionError|Error:)\b/;
const STACK_LINE = /^\s+at\s/;

function parseFailures(output: string): TestFailure[] {
  const failures: TestFailure[] = [];
  const lines = output.split(/\r?\n/);
  let current: TestFailure | null = null;
  for (const line of lines) {
    if (FAILURE_LINE.test(line)) {
      current = { message: line.trim(), stack: [] };
      failures.push(current);
    } else if (current && STACK_LINE.test(line)) {
      current.stack.push(line.trim());
    } else if (current && line.trim() === '') {
      current = null;
    }
  }
  return failures;
}

async function runGeneratedGameTests(testFile: string): Promise<TestRunResult> {
  if (typeof testFile !== 'string' || testFile.trim().length === 0) {
    throw new Error(`${PIPELINES_LOG_PREFIX} runGeneratedGameTests: test file must be non-empty`);
  }
  await fs.access(/* turbopackIgnore: true */ testFile).catch(() => {
    throw new Error(`${PIPELINES_LOG_PREFIX} runGeneratedGameTests: test file not found at ${testFile}`);
  });

  return new Promise<TestRunResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(/* turbopackIgnore: true */ 'npx', ['tsx', testFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${PIPELINES_LOG_PREFIX} runGeneratedGameTests: failed to spawn npx: ${error.message}`));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        passed: exitCode === 0 && !timedOut,
        stdout,
        stderr,
        failures: exitCode === 0 && !timedOut ? [] : parseFailures(`${stdout}\n${stderr}`),
      });
    });
  });
}

/** Run every gate and persist reports/verification.json. */
export async function runVerifyPipeline(
  args: { game: string; gameRoot: string; emit: EmitEvent },
  deps: VerifyDeps = {},
): Promise<VerificationReport> {
  const evaluateLogic = deps.evaluateLogic ?? evaluateLogicWithAgent;
  const runPlaytest = deps.runPlaytest ?? runPlaytestSubprocess;
  const { game, gameRoot, emit } = args;

  const gate = async <T>(name: string, fn: () => Promise<T>, detail: (r: T) => { ok: boolean; text: string }): Promise<T> => {
    emit({ type: 'tool_start', name, detail: game });
    const result = await fn();
    const d = detail(result);
    emit({ type: 'tool_end', name, ok: d.ok, detail: d.text.slice(0, 160) });
    return result;
  };

  const typecheck = await gate('typecheck', () => runTypecheck(gameRoot), (r) => ({ ok: r.ok, text: r.ok ? 'clean' : 'errors' }));
  const manifest = await gate(
    'manifest',
    async () => validateManifest(gameRoot, await readOrInitManifest(gameRoot, game)),
    (r) => ({ ok: r.ok, text: r.ok ? 'bidirectional ok' : formatIssues(r.issues) }),
  );
  const tests = await gate(
    'tests',
    () => runGeneratedGameTests(path.join(gameRoot, 'tests', 'tests.ts')),
    (r) => ({ ok: r.passed, text: r.passed ? 'green' : `${r.failures.length} failing` }),
  );

  const gdd = await readJsonIfExists<GameDesignDocument>(path.join(gameRoot, 'config', 'gdd.json'));
  const logic = await gate(
    'logic-evaluator',
    () => (gdd ? evaluateLogic(gdd, game) : Promise.resolve({ ok: false, detail: 'no GDD' })),
    (r) => ({ ok: r.ok, text: r.detail }),
  );
  const playtest = await gate('playtest', () => runPlaytest(gameRoot), (r) => ({ ok: r.ok, text: r.detail }));

  const report: VerificationReport = {
    game,
    verifiedAt: new Date().toISOString(),
    ok: typecheck.ok && manifest.ok && tests.passed && logic.ok && playtest.ok,
    typecheck: { ok: typecheck.ok, output: typecheck.diagnostics.slice(0, 2000) },
    manifest: { ok: manifest.ok, issues: formatIssues(manifest.issues) },
    tests: { passed: tests.passed, failures: tests.failures.map((f) => f.message).slice(0, 10) },
    logic,
    playtest,
  };
  await fs.mkdir(path.join(gameRoot, 'reports'), { recursive: true });
  await fs.writeFile(path.join(gameRoot, 'reports', VERIFICATION_FILENAME), JSON.stringify(report, null, 2), 'utf8');
  console.log(`${PIPELINES_LOG_PREFIX} verify game=${game} ok=${report.ok}`);
  return report;
}
