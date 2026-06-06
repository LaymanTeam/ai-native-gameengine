/**
 * Authors the generated game's tests/tests.ts (self-authored tests of the game system per
 * generations/info.md), invokes engine/testing/test-runner.ts to execute them with tsx, and
 * feeds failures back to the coder agent until green. Closes the code-quality loop the same
 * way image-reviewer closes the asset loop.
 *
 * ARCHITECTURE: LangChain v1 `createAgent`. The model authors test source; the engine modules
 * that WRITE files and RUN tsx are INJECTED as tools (engine/testing/test-runner.ts and the
 * game-scaffold writer are built in parallel — typed locally, never imported). Failures are
 * returned to the agent verbatim so it can hand a StructuredFailure to the coder/debugger.
 *
 * Research: research/langchain-agents-chains-gemini.md (createAgent, tool, structured output).
 */
import { createAgent, tool } from 'langchain';
import * as z from 'zod';
import { createCoderModel } from '../providers';

const TESTER_LOG_PREFIX = '[engine/ai/agents/tester]';

// ---------------------------------------------------------------------------
// Schemas.
// ---------------------------------------------------------------------------

/** Result of running tests/tests.ts via the injected tsx runner. */
export const TestRunResultSchema = z.object({
  passed: z.boolean(),
  total: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Combined stdout/stderr (truncated by the runner). */
  output: z.string(),
  /** Per-failure summaries for routing to the coder/debugger. */
  failures: z.array(
    z.object({
      testName: z.string(),
      message: z.string(),
      file: z.string().default(''),
    }),
  ),
});
export type TestRunResult = z.infer<typeof TestRunResultSchema>;

// ---------------------------------------------------------------------------
// Injected dependencies.
// ---------------------------------------------------------------------------

/** Writes test source into the game tree (engine/compiler/game-scaffold writer), injected. */
export interface TestFileWriter {
  /** Persist tests/tests.ts (or other test files) for the game; returns the absolute path. */
  writeTestFile(args: { relativePath: string; source: string }): Promise<{ path: string }>;
}

/** Runs the game's tests with tsx (engine/testing/test-runner.ts), injected. */
export interface TestRunner {
  run(args: { testFile: string }): Promise<TestRunResult>;
}

/** Notifies the coder of failures so it can repair (the director routes this), injected. */
export type ReportFailures = (result: TestRunResult) => void;

export interface TesterDeps {
  writer: TestFileWriter;
  runner: TestRunner;
  onFailures?: ReportFailures;
  /** Default test file path within the game tree. */
  testFilePath?: string;
}

const SYSTEM_PROMPT =
  'You are the tester. Given the GDD and the generated systems/ and ui/ code, author tests/tests.ts ' +
  'using node:assert that exercise the game systems (state transitions, win/lose conditions, save ' +
  'load round-trips, controller actions). Call write_tests to persist them, then run_tests to execute ' +
  'them with tsx. If tests fail, summarize each failure concisely so the coder/debugger can repair. ' +
  'Iterate until green or until you have a clear, minimal failure report. Test behavior, not internals.';

/**
 * Factory: build the tester agent. File writing and tsx execution are injected so this agent has
 * no hard dependency on sibling modules still under construction.
 */
export function createTesterAgent(deps: TesterDeps) {
  if (!deps || !deps.writer || !deps.runner) {
    throw new Error(`${TESTER_LOG_PREFIX} deps.writer and deps.runner are required`);
  }
  const testFilePath = deps.testFilePath ?? 'tests/tests.ts';
  console.log(`${TESTER_LOG_PREFIX} create testFilePath=${testFilePath}`);

  const writeTool = tool(
    async (input: { source: string; relativePath?: string }) => {
      const relativePath = input.relativePath ?? testFilePath;
      console.log(`${TESTER_LOG_PREFIX} write_tests path=${relativePath} chars=${input.source.length}`);
      try {
        const { path } = await deps.writer.writeTestFile({ relativePath, source: input.source });
        return `Wrote ${path} (${input.source.length} chars).`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TESTER_LOG_PREFIX} write_tests failed`, error);
        return `Failed to write tests: ${message}`;
      }
    },
    {
      name: 'write_tests',
      description: 'Persist test source into the game tree (defaults to tests/tests.ts).',
      schema: z.object({
        source: z.string().describe('full TypeScript test file source using node:assert'),
        relativePath: z.string().default('tests/tests.ts').describe('path within the game tree'),
      }),
    },
  );

  const runTool = tool(
    async (input: { testFile?: string }) => {
      const testFile = input.testFile ?? testFilePath;
      console.log(`${TESTER_LOG_PREFIX} run_tests file=${testFile}`);
      let result: TestRunResult;
      try {
        result = await deps.runner.run({ testFile });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TESTER_LOG_PREFIX} run_tests threw`, error);
        result = {
          passed: false,
          total: 0,
          failed: 1,
          output: message,
          failures: [{ testName: '(runner)', message, file: testFile }],
        };
      }
      if (!result.passed) {
        try {
          deps.onFailures?.(result);
        } catch (cbErr) {
          console.error(`${TESTER_LOG_PREFIX} onFailures callback threw`, cbErr);
        }
      }
      console.log(
        `${TESTER_LOG_PREFIX} run_tests done passed=${result.passed} failed=${result.failed}/${result.total}`,
      );
      return JSON.stringify(result);
    },
    {
      name: 'run_tests',
      description: 'Execute the game tests with tsx and return a structured pass/fail result.',
      schema: z.object({
        testFile: z.string().default('tests/tests.ts').describe('test file to run'),
      }),
    },
  );

  return createAgent({
    model: createCoderModel(),
    tools: [writeTool, runTool],
    systemPrompt: SYSTEM_PROMPT,
  });
}
