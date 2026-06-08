/**
 * Build pipeline (phase 3): the quality-loop CHAIN around the code-writing subagents.
 *
 *   manifest PRE-gate (assets exist) → CODER subagent (file tools + typecheck self-verify)
 *   → manifest POST-gate (bidirectional) → TESTER subagent (authors + runs tests/tests.ts)
 *   → failures? → DEBUGGER subagent (minimal diffs, code-bounded retries) → re-test
 *   (≤ MAX_FIX_CYCLES) → structured result.
 *
 * Failure routing is structural — the director never has to "remember" to call a fixer.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tool } from 'langchain';
import * as z from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createCoderAgent, coderThreadConfig } from '../agents/coder';
import { createTesterAgent } from '../agents/tester';
import { createDebuggerAgent, type StructuredFailure } from '../agents/debugger';
import { validateManifest } from '../../compiler/asset-manifest';
import { styleBibleToPromptPreamble } from '../../tools/visualizers/visual-direction';
import type { GameDesignDocument } from '../agents/designer';
import type { EmitEvent } from '../events';
import {
  PIPELINES_LOG_PREFIX,
  formatIssues,
  loadStyleBible,
  readJsonIfExists,
  readOrInitManifest,
  resolveInside,
} from './shared';

export const MAX_FIX_CYCLES = 2;

export interface BuildResult {
  ok: boolean;
  refused: string | null;
  coderSummary: string;
  manifestOk: boolean;
  manifestIssues: string;
  testsPassed: boolean;
  testFailures: number;
  fixCycles: number;
}

interface TestFailure {
  message: string;
  stack: string[];
}

interface TestRunResult {
  passed: boolean;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  failures: TestFailure[];
}

export interface BuildDeps {
  /** Runs the coder subagent; returns its summary. Injected in tests. */
  invokeCoder?: (args: { gameRoot: string; game: string; brief: string }) => Promise<string>;
  /** Authors tests via the tester subagent, then returns the run result. Injected in tests. */
  authorAndRunTests?: (args: { gameRoot: string; game: string; gdd: GameDesignDocument }) => Promise<TestRunResult>;
  /** Runs the debugger subagent on failures; returns its summary. Injected in tests. */
  fixFailures?: (args: { gameRoot: string; game: string; failures: StructuredFailure[] }) => Promise<string>;
  /** Re-runs the test file (after fixes). Injected in tests. */
  runTests?: (testFile: string) => Promise<TestRunResult>;
}

/** Game-root-bounded file tools for the coder subagent. */
export function makeCoderFileTools(gameRoot: string) {
  const writeFileTool = tool(
    async ({ file, content }: { file: string; content: string }) => {
      const abs = resolveInside(gameRoot, file);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf8');
      console.log(`${PIPELINES_LOG_PREFIX} coder write_file ${file} chars=${content.length}`);
      return `Wrote ${file} (${content.length} chars).`;
    },
    {
      name: 'write_file',
      description: 'Write a source file inside the game directory (path relative to game root).',
      schema: z.object({ file: z.string(), content: z.string() }),
    },
  );
  const readFileTool = tool(
    async ({ file }: { file: string }) => {
      try {
        const text = await fs.readFile(resolveInside(gameRoot, file), 'utf8');
        return text.length > 24_000 ? `${text.slice(0, 24_000)}\n…(truncated)` : text;
      } catch (error) {
        return `read failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'read_file',
      description: 'Read a file inside the game directory (path relative to game root).',
      schema: z.object({ file: z.string() }),
    },
  );
  const listFilesTool = tool(
    async ({ dir }: { dir: string }) => {
      try {
        const entries = await fs.readdir(resolveInside(gameRoot, dir || '.'), { withFileTypes: true });
        return (
          entries.map((e) => `${e.isDirectory() ? 'dir ' : 'file'} ${path.join(dir, e.name)}`).join('\n') || '(empty)'
        );
      } catch (error) {
        return `list failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'list_files',
      description: 'List files in a directory inside the game (path relative to game root).',
      schema: z.object({ dir: z.string() }),
    },
  );
  return [writeFileTool, readFileTool, listFilesTool];
}

const HEADLESS_BRIDGE_SPEC =
  'Also write tests/headless-session.ts exporting `createHeadlessSession()` returning the playtest ' +
  'GameSession: { reset(): void; dispatch(action: string): void; step(deltaMs: number): number ' +
  '(returns wall-clock ms the step took); positions(): Array<{eid:number,x:number,y:number}>; ' +
  'isWin(): boolean; isLose(): boolean; availableActions(): string[] }. It must drive the real ' +
  'game systems (bitECS world) WITHOUT PixiJS/DOM — pure simulation, importable under Node.';

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

  const startedAt = Date.now();
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
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        passed: exitCode === 0 && !timedOut,
        exitCode,
        signal: signal ?? null,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        failures: exitCode === 0 && !timedOut ? [] : parseFailures(`${stdout}\n${stderr}`),
      });
    });
  });
}

async function defaultInvokeCoder(args: { gameRoot: string; game: string; brief: string }): Promise<string> {
  const coder = createCoderAgent({ gameDir: args.gameRoot, tools: makeCoderFileTools(args.gameRoot) });
  const result = await coder.invoke(
    { messages: [new HumanMessage(args.brief)] },
    { ...coderThreadConfig(`coder-${args.game}`), recursionLimit: 80 },
  );
  const last = result.messages.at(-1);
  return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
}

async function defaultAuthorAndRunTests(args: {
  gameRoot: string;
  game: string;
  gdd: GameDesignDocument;
}): Promise<TestRunResult> {
  let lastRun: TestRunResult | null = null;
  const tester = createTesterAgent({
    writer: {
      writeTestFile: async ({ relativePath, source }) => {
        const abs = resolveInside(args.gameRoot, relativePath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, source, 'utf8');
        return { path: abs };
      },
    },
    runner: {
      // Adapt the engine TestRunResult to the tester agent's own result shape.
      run: async ({ testFile }) => {
        lastRun = await runGeneratedGameTests(resolveInside(args.gameRoot, testFile));
        return {
          passed: lastRun.passed,
          total: lastRun.failures.length, // total unknown from raw output; failures drive routing
          failed: lastRun.failures.length,
          output: `${lastRun.stdout}\n${lastRun.stderr}`.slice(0, 4000),
          failures: lastRun.failures.map((f) => ({ testName: '', message: f.message, file: 'tests/tests.ts' })),
        };
      },
    },
  });
  await tester.invoke(
    {
      messages: [
        new HumanMessage(
          `Author tests/tests.ts asserting the GDD's win/lose rules and core mechanic, then run them.\n\n## GDD\n${JSON.stringify(args.gdd, null, 2)}`,
        ),
      ],
    },
    { configurable: { thread_id: `tester-${args.game}` }, recursionLimit: 40 },
  );
  if (lastRun) return lastRun;
  // Tester never ran the suite — run it directly so the gate is code-enforced regardless.
  return runGeneratedGameTests(path.join(args.gameRoot, 'tests', 'tests.ts'));
}

async function defaultFixFailures(args: {
  gameRoot: string;
  game: string;
  failures: StructuredFailure[];
}): Promise<string> {
  const dbg = createDebuggerAgent({
    io: {
      readFile: (rel) => fs.readFile(resolveInside(args.gameRoot, rel), 'utf8'),
      writeFile: async (rel, content) => {
        await fs.writeFile(resolveInside(args.gameRoot, rel), content, 'utf8');
      },
    },
  });
  const result = await dbg.invoke(
    {
      messages: [
        new HumanMessage(
          `Fix these test failures with MINIMAL diffs (apply_minimal_diff). Failures:\n${JSON.stringify(args.failures, null, 2)}`,
        ),
      ],
    },
    { configurable: { thread_id: `debugger-${args.game}` }, recursionLimit: 40 },
  );
  const last = result.messages.at(-1);
  return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
}

function toStructuredFailures(run: TestRunResult): StructuredFailure[] {
  return run.failures.map((f) => ({
    source: 'tester' as const,
    file: 'tests/tests.ts',
    message: f.message,
    detail: f.stack.join('\n'),
  }));
}

/** Run the build phase chain for one game. */
export async function runBuildPipeline(
  args: { game: string; gameRoot: string; instructions: string; emit: EmitEvent },
  deps: BuildDeps = {},
): Promise<BuildResult> {
  const invokeCoder = deps.invokeCoder ?? defaultInvokeCoder;
  const authorAndRunTests = deps.authorAndRunTests ?? defaultAuthorAndRunTests;
  const fixFailures = deps.fixFailures ?? defaultFixFailures;
  const runTests = deps.runTests ?? ((testFile: string) => runGeneratedGameTests(testFile));
  const { game, gameRoot, emit } = args;

  const refusal = (reason: string): BuildResult => ({
    ok: false,
    refused: reason,
    coderSummary: '',
    manifestOk: false,
    manifestIssues: '',
    testsPassed: false,
    testFailures: 0,
    fixCycles: 0,
  });

  const gdd = await readJsonIfExists<GameDesignDocument>(path.join(gameRoot, 'config', 'gdd.json'));
  if (!gdd) return refusal('no config/gdd.json — run design_game first');

  // Manifest PRE-gate: assets must exist on disk before code references them.
  // unreferenced-key issues are EXPECTED pre-code and filtered out here.
  const manifest = await readOrInitManifest(gameRoot, game);
  const pre = await validateManifest(gameRoot, manifest);
  const preBlockers = pre.issues.filter((i) => i.kind !== 'unreferenced-key');
  if (preBlockers.length > 0) return refusal(`manifest pre-check failed: ${formatIssues(preBlockers)}`);

  /* ---- coder subagent ---- */
  emit({ type: 'tool_start', name: 'coder', detail: game });
  const bible = await loadStyleBible(gameRoot);
  const brief =
    `Implement the game in this directory per the GDD below. Write systems/ code, ui/ code, and main.ts. ` +
    `Reference assets ONLY through the manifest variables. Run typecheck_game until clean.\n` +
    `${HEADLESS_BRIDGE_SPEC}\n\n` +
    `## GDD\n${JSON.stringify(gdd, null, 2)}\n\n## Asset manifest\n${JSON.stringify(manifest.assets, null, 2)}` +
    (bible ? `\n\n## Style\n${styleBibleToPromptPreamble(bible)}` : '') +
    (args.instructions ? `\n\n## Additional instructions\n${args.instructions}` : '');
  let coderSummary: string;
  try {
    coderSummary = await invokeCoder({ gameRoot, game, brief });
    emit({ type: 'tool_end', name: 'coder', ok: true, detail: 'code written' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${PIPELINES_LOG_PREFIX} coder failed game=${game}`, error);
    emit({ type: 'tool_end', name: 'coder', ok: false, detail: message.slice(0, 160) });
    return refusal(`coder failed: ${message}`);
  }

  // Manifest POST-gate: bidirectional (every key referenced, every asset exists).
  const post = await validateManifest(gameRoot, await readOrInitManifest(gameRoot, game));

  /* ---- tester subagent + debugger fix loop ---- */
  emit({ type: 'tool_start', name: 'tester', detail: game });
  let run: TestRunResult;
  try {
    run = await authorAndRunTests({ gameRoot, game, gdd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${PIPELINES_LOG_PREFIX} tester failed game=${game}`, error);
    emit({ type: 'tool_end', name: 'tester', ok: false, detail: message.slice(0, 160) });
    return { ...refusal(`tester failed: ${message}`), coderSummary };
  }
  emit({ type: 'tool_end', name: 'tester', ok: run.passed, detail: `${run.failures.length} failure(s)` });

  let fixCycles = 0;
  while (!run.passed && fixCycles < MAX_FIX_CYCLES) {
    fixCycles += 1;
    emit({ type: 'tool_start', name: 'debugger', detail: `fix cycle ${fixCycles}/${MAX_FIX_CYCLES}` });
    try {
      await fixFailures({ gameRoot, game, failures: toStructuredFailures(run) });
      run = await runTests(path.join(gameRoot, 'tests', 'tests.ts'));
      emit({ type: 'tool_end', name: 'debugger', ok: run.passed, detail: run.passed ? 'fixed' : `${run.failures.length} still failing` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${PIPELINES_LOG_PREFIX} debugger cycle failed game=${game}`, error);
      emit({ type: 'tool_end', name: 'debugger', ok: false, detail: message.slice(0, 160) });
      break;
    }
  }

  return {
    ok: post.ok && run.passed,
    refused: null,
    coderSummary: coderSummary.slice(0, 1500),
    manifestOk: post.ok,
    manifestIssues: formatIssues(post.issues),
    testsPassed: run.passed,
    testFailures: run.failures.length,
    fixCycles,
  };
}
