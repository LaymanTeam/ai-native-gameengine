/**
 * Coder agent — phase 2 of the pipeline. Generates the generated game's systems/ and ui/ code
 * (per generations/info.md: rules/, entities/, physics/, controller/, ui/components/, ui/methods/,
 * main.ts) against the engine runtime layers. Receives the bounded GDD, the config/ asset manifest,
 * and the game's research/ folder as context. Self-verifies with a typecheck tool that spawns
 * `npx tsc --noEmit` on the game directory and feeds the diagnostics back into its own loop.
 *
 * Architecture: LangChain v1 `createAgent` (LangGraph loop) — same pattern as director.ts.
 * No custom state machine. Uses the strongest coding model from engine/ai/providers.ts. File-write
 * tools are INJECTED (built in parallel); the typecheck tool is defined locally because it is the
 * coder's own self-verification primitive. Research:
 * research/langchain-agents-chains-gemini.md, research/vercel-langchain-gemini.md.
 */
import { spawn } from 'node:child_process';
import { createAgent, tool } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import * as z from 'zod';
import { createCoderModel } from '../providers';

export const CODER_LOG_PREFIX = '[engine/ai/agents/coder]';

/** Structured result of running tsc on a generated game directory. */
export interface TypecheckResult {
  ok: boolean;
  exitCode: number;
  /** Combined stdout+stderr, trimmed to a bounded length to protect the model context. */
  diagnostics: string;
}

/** Max chars of tsc output handed back to the model (keeps context small on big error dumps). */
export const TYPECHECK_OUTPUT_LIMIT = 8000;

/**
 * Spawn `npx tsc --noEmit` in the given game directory and collect diagnostics. Defensive:
 * validates the directory string, never throws on tsc failure (a failing typecheck is data the
 * agent acts on), and clamps output length.
 */
export async function runTypecheck(gameDir: string): Promise<TypecheckResult> {
  if (typeof gameDir !== 'string' || gameDir.trim().length === 0) {
    throw new Error(`${CODER_LOG_PREFIX} runTypecheck: gameDir must be a non-empty string`);
  }
  console.log(`${CODER_LOG_PREFIX} runTypecheck start dir=${gameDir}`);
  return new Promise<TypecheckResult>((resolve) => {
    let out = '';
    const child = spawn('npx', ['tsc', '--noEmit'], {
      cwd: gameDir,
      shell: false,
      env: process.env,
    });
    const append = (buf: Buffer): void => {
      if (out.length < TYPECHECK_OUTPUT_LIMIT) out += buf.toString('utf8');
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (err) => {
      console.error(`${CODER_LOG_PREFIX} runTypecheck spawn error`, err);
      resolve({ ok: false, exitCode: -1, diagnostics: `Failed to run tsc: ${err.message}` });
    });
    child.on('close', (code) => {
      const exitCode = code ?? -1;
      const diagnostics = clampDiagnostics(out);
      console.log(`${CODER_LOG_PREFIX} runTypecheck done exitCode=${exitCode} chars=${diagnostics.length}`);
      resolve({ ok: exitCode === 0, exitCode, diagnostics });
    });
  });
}

/** Clamp + tidy tsc output for the model context. Pure + testable. */
export function clampDiagnostics(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return '(no diagnostics — clean)';
  if (trimmed.length <= TYPECHECK_OUTPUT_LIMIT) return trimmed;
  return `${trimmed.slice(0, TYPECHECK_OUTPUT_LIMIT)}\n…(truncated)`;
}

/**
 * Local typecheck tool bound to a single game directory. The agent calls it with no path argument
 * (Gemini tool schemas still need an explicit object) and receives the diagnostics back.
 */
export function makeTypecheckTool(gameDir: string): StructuredToolInterface {
  return tool(
    async ({ noop }: { noop?: boolean }) => {
      void noop;
      const result = await runTypecheck(gameDir);
      if (result.ok) return 'Typecheck passed: no errors.';
      return `Typecheck failed (exit ${result.exitCode}). Fix these, then re-run:\n${result.diagnostics}`;
    },
    {
      name: 'typecheck_game',
      description:
        'Run the TypeScript compiler (tsc --noEmit) over the generated game to self-verify the ' +
        'code you wrote. Call after writing/editing files; fix reported errors and re-run until clean.',
      schema: z.object({
        noop: z
          .boolean()
          .optional()
          .describe('Unused — the directory is fixed; pass true or omit'),
      }),
    },
  ) as unknown as StructuredToolInterface;
}

const SYSTEM_PROMPT =
  'You are the coder for an AI game engine. Write the generated game\'s systems/ and ui/ code in ' +
  'TypeScript against the engine runtime layers (bitECS world/systems, PixiJS v8 renderer, RxDB ' +
  'saves, the input controller, audio playback). You are given the bounded GDD (the source of ' +
  'truth), the config/ asset manifest (bind every referenced asset to its manifest key), and the ' +
  'game\'s research/ notes. Follow the architecture idioms of gameprogrammingpatterns.com where ' +
  'they fit (game loop, update method, component, state, observer) — the research notes may cite ' +
  'specific patterns; honor them. Implement ONLY what the GDD specifies — respect its non-goals. ' +
  'After writing or editing files, call typecheck_game to verify; fix every error and re-run until ' +
  'the typecheck is clean before reporting done. Prefer minimal, correct, well-guarded code.';

/** Module-scoped checkpointer so the write→typecheck→fix loop persists across warm invocations. */
const checkpointer = new MemorySaver();

export interface CoderAgentOptions {
  /** Absolute path to the generated game directory (for the self-verify typecheck tool). */
  gameDir: string;
  /** Injected file-write/read tools (built in parallel). Optional; defaults to none. */
  tools?: StructuredToolInterface[];
}

/**
 * Build the coder agent. The typecheck tool is always present (the coder's self-verification);
 * file-IO tools are injected by the caller.
 */
export function createCoderAgent(options: CoderAgentOptions) {
  if (!options || typeof options.gameDir !== 'string' || options.gameDir.trim().length === 0) {
    throw new Error(`${CODER_LOG_PREFIX} createCoderAgent: options.gameDir is required`);
  }
  const injected = options.tools ?? [];
  const tools = [...injected, makeTypecheckTool(options.gameDir)];
  console.log(`${CODER_LOG_PREFIX} create gameDir=${options.gameDir} toolCount=${tools.length}`);
  return createAgent({
    model: createCoderModel(),
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer,
  });
}

/** Config helper: checkpointer keys the coding loop by thread_id (one per game). */
export function coderThreadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}
