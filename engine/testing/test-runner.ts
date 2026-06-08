/**
 * Executes a generated game's tests/tests.ts via tsx in a child process, captures structured
 * pass/fail output and stack traces, and returns them as machine-readable results for the
 * tester agent to relay to the coder agent.
 */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { z } from 'zod';

const TESTRUNNER_LOG_PREFIX = '[engine/testing/test-runner]';

/** One parsed failure: a line that signals a failed assertion/test plus its trailing stack. */
export const TestFailureSchema = z.object({
  /** The failing line as printed by the test file (e.g. "FAIL - player can move"). */
  message: z.string(),
  /** Stack-trace lines following the failure message, if any. */
  stack: z.array(z.string()),
});
export type TestFailure = z.infer<typeof TestFailureSchema>;

export const TestRunResultSchema = z.object({
  /** True when the child exited 0. */
  passed: z.boolean(),
  exitCode: z.number().nullable(),
  /** Signal that killed the process, if any (e.g. SIGTERM on timeout). */
  signal: z.string().nullable(),
  /** True when the run was killed by the timeout guard. */
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  failures: z.array(TestFailureSchema),
});
export type TestRunResult = z.infer<typeof TestRunResultSchema>;

export interface RunGameTestsOptions {
  /** Hard wall for the child process. Default 120_000 ms. */
  timeoutMs?: number;
  /** Override the spawned command (default: npx tsx <testFile>). Used by tests. */
  command?: { cmd: string; args: string[] };
}

const FAILURE_LINE = /\b(FAIL(?:ED)?|✖|AssertionError|Error:)\b/;
const STACK_LINE = /^\s+at\s/;

/** Parse failure messages + their stack lines out of combined child output. */
export function parseFailures(output: string): TestFailure[] {
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

/**
 * Run a generated game's tests/tests.ts with tsx in a child process and return structured,
 * machine-readable results (never throws on test failure — only on missing file/spawn errors).
 */
export async function runGameTests(
  testFilePath: string,
  options?: RunGameTestsOptions,
): Promise<TestRunResult> {
  if (typeof testFilePath !== 'string' || testFilePath.trim().length === 0) {
    throw new Error(`${TESTRUNNER_LOG_PREFIX} runGameTests: testFilePath must be a non-empty string`);
  }
  await access(/* turbopackIgnore: true */ testFilePath).catch(() => {
    throw new Error(`${TESTRUNNER_LOG_PREFIX} runGameTests: test file not found at ${testFilePath}`);
  });

  const timeoutMs = options?.timeoutMs ?? 120_000;
  const { cmd, args } = options?.command ?? { cmd: 'npx', args: ['tsx', testFilePath] };
  const startedAt = Date.now();
  console.log(`${TESTRUNNER_LOG_PREFIX} start file=${testFilePath} cmd=${cmd} timeoutMs=${timeoutMs}`);

  return new Promise<TestRunResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(/* turbopackIgnore: true */ cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`${TESTRUNNER_LOG_PREFIX} timeout after ${timeoutMs}ms — killing child`);
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`${TESTRUNNER_LOG_PREFIX} spawn error: ${err.message}`);
      reject(new Error(`${TESTRUNNER_LOG_PREFIX} failed to spawn ${cmd}: ${err.message}`));
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const result: TestRunResult = {
        passed: exitCode === 0 && !timedOut,
        exitCode,
        signal: signal ?? null,
        timedOut,
        durationMs,
        stdout,
        stderr,
        failures: exitCode === 0 && !timedOut ? [] : parseFailures(`${stdout}\n${stderr}`),
      };
      const log = result.passed ? console.log : console.error;
      log(
        `${TESTRUNNER_LOG_PREFIX} done passed=${result.passed} exitCode=${exitCode} ` +
          `failures=${result.failures.length} durationMs=${durationMs}`,
      );
      resolve(TestRunResultSchema.parse(result));
    });
  });
}
