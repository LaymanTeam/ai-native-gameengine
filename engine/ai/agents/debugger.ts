/**
 * Debugger agent — repair, not regeneration. Receives structured failures (tester output,
 * playtester invariant violations, logic-evaluator contradictions, runtime stack traces) plus
 * the specific offending file, and produces MINIMAL diffs that preserve working code. Never
 * rewrites whole files; bounded retry budget, then escalates to the user with a clear report.
 *
 * ARCHITECTURE: LangChain v1 `createAgent`. The model proposes minimal find/replace edits; the
 * deterministic `applyMinimalDiff` engine below APPLIES them (verifying the anchor exists and is
 * unique, and rejecting whole-file rewrites) — plain, unit-testable TypeScript. File reads/writes
 * are injected (sibling scaffold writer, never imported). After the retry budget is exhausted the
 * agent escalates with a structured report.
 *
 * Research: research/langchain-agents-chains-gemini.md (createAgent, tool, structured output).
 */
import { createAgent, tool } from 'langchain';
import * as z from 'zod';
import { createCoderModel } from '../providers';

const DEBUGGER_LOG_PREFIX = '[engine/ai/agents/debugger]';

/** Default retry budget before escalation. */
export const DEFAULT_DEBUG_MAX_RETRIES = 3;
/**
 * Reject any single edit whose replacement rewrites more than this fraction of the file — the
 * debugger must make MINIMAL diffs, not regenerate. Guards against whole-file rewrites.
 */
export const MAX_REWRITE_FRACTION = 0.5;

// ---------------------------------------------------------------------------
// Schemas.
// ---------------------------------------------------------------------------

/** A structured failure handed to the debugger (from tester/playtester/logic-evaluator/runtime). */
export const StructuredFailureSchema = z.object({
  source: z.enum(['tester', 'playtester', 'logic_evaluator', 'runtime', 'typecheck']),
  /** The offending file, relative to the game tree. */
  file: z.string(),
  message: z.string(),
  /** Optional stack trace / details. */
  detail: z.string().default(''),
});
export type StructuredFailure = z.infer<typeof StructuredFailureSchema>;

/** One minimal find/replace edit. `find` must occur EXACTLY once in the file. */
export const MinimalEditSchema = z.object({
  find: z.string().min(1).describe('exact existing snippet to replace (must be unique in the file)'),
  replace: z.string().describe('the corrected snippet'),
  reason: z.string().describe('why this edit fixes the failure'),
});
export type MinimalEdit = z.infer<typeof MinimalEditSchema>;

export const DiffResultSchema = z.object({
  ok: z.boolean(),
  /** The new file content (only when ok). */
  content: z.string().default(''),
  /** Number of edits applied. */
  applied: z.number().int().nonnegative(),
  /** Error explaining rejection (when not ok). */
  error: z.string().default(''),
});
export type DiffResult = z.infer<typeof DiffResultSchema>;

// ---------------------------------------------------------------------------
// Deterministic minimal-diff engine (model-free, unit-testable).
// ---------------------------------------------------------------------------

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Apply a sequence of minimal find/replace edits to `original`.
 * Rejects (ok=false) if: any `find` is missing, any `find` is ambiguous (>1 match), or the
 * cumulative replacement rewrites more than MAX_REWRITE_FRACTION of the file (a disguised rewrite).
 * Edits apply in order; each subsequent edit sees the result of the previous one.
 */
export function applyMinimalDiff(original: string, edits: MinimalEdit[]): DiffResult {
  if (typeof original !== 'string') {
    return { ok: false, content: '', applied: 0, error: 'original content must be a string' };
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, content: '', applied: 0, error: 'no edits provided' };
  }

  let content = original;
  let applied = 0;
  let totalReplacedChars = 0;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    if (edit === undefined) continue;
    if (edit.find.length === 0) {
      return { ok: false, content: '', applied, error: `edit ${i}: empty find anchor` };
    }
    const occurrences = countOccurrences(content, edit.find);
    if (occurrences === 0) {
      return { ok: false, content: '', applied, error: `edit ${i}: anchor not found: ${edit.find.slice(0, 80)}` };
    }
    if (occurrences > 1) {
      return {
        ok: false,
        content: '',
        applied,
        error: `edit ${i}: anchor is ambiguous (${occurrences} matches) — make it more specific`,
      };
    }
    content = content.replace(edit.find, () => edit.replace);
    totalReplacedChars += edit.find.length;
    applied++;
  }

  // Guard against disguised whole-file rewrites.
  const baseline = Math.max(1, original.length);
  if (totalReplacedChars / baseline > MAX_REWRITE_FRACTION) {
    return {
      ok: false,
      content: '',
      applied,
      error: `rejected: edits rewrite ${((totalReplacedChars / baseline) * 100).toFixed(0)}% of the file ` +
        `(> ${MAX_REWRITE_FRACTION * 100}%). The debugger must make minimal diffs, not regenerate.`,
    };
  }

  return { ok: true, content, applied, error: '' };
}

// ---------------------------------------------------------------------------
// Injected dependencies.
// ---------------------------------------------------------------------------

export interface FileIO {
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
}

/** Escalation surface (chat/director) when the retry budget is exhausted, injected. */
export type EscalateToUser = (report: {
  failure: StructuredFailure;
  attempts: number;
  lastError: string;
}) => void;

export interface DebuggerDeps {
  io: FileIO;
  escalate?: EscalateToUser;
  maxRetries?: number;
}

const SYSTEM_PROMPT =
  'You are the debugger. You receive a structured failure and the offending file. REPAIR, do not ' +
  'regenerate: call read_file, then apply_minimal_diff with the SMALLEST set of exact find/replace ' +
  'edits that fix the failure while preserving all working code. Never paste a whole file. Each ' +
  '`find` anchor must be unique in the file. If apply_minimal_diff rejects your edit, make the anchor ' +
  'more specific or the change smaller. After the retry budget is exhausted, call escalate with a ' +
  'clear report of what you tried and why it could not be repaired automatically.';

/**
 * Factory: build the debugger agent. The minimal-diff application is deterministic code (anchors
 * verified, whole-file rewrites rejected); the model only proposes the edits.
 */
export function createDebuggerAgent(deps: DebuggerDeps) {
  if (!deps || !deps.io) {
    throw new Error(`${DEBUGGER_LOG_PREFIX} deps.io is required`);
  }
  const maxRetries = deps.maxRetries ?? DEFAULT_DEBUG_MAX_RETRIES;
  let attempts = 0;
  console.log(`${DEBUGGER_LOG_PREFIX} create maxRetries=${maxRetries}`);

  const readTool = tool(
    async (input: { file: string }) => {
      console.log(`${DEBUGGER_LOG_PREFIX} read_file ${input.file}`);
      try {
        const content = await deps.io.readFile(input.file);
        return content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${DEBUGGER_LOG_PREFIX} read_file failed ${input.file}`, error);
        return `Failed to read ${input.file}: ${message}`;
      }
    },
    {
      name: 'read_file',
      description: 'Read the current content of a file in the game tree.',
      schema: z.object({ file: z.string() }),
    },
  );

  const applyTool = tool(
    async (input: { file: string; edits: MinimalEdit[] }) => {
      attempts++;
      console.log(`${DEBUGGER_LOG_PREFIX} apply_minimal_diff ${input.file} edits=${input.edits.length} attempt=${attempts}`);
      let original: string;
      try {
        original = await deps.io.readFile(input.file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ ok: false, content: '', applied: 0, error: `read failed: ${message}` });
      }
      const result = applyMinimalDiff(original, input.edits);
      if (!result.ok) {
        console.warn(`${DEBUGGER_LOG_PREFIX} diff rejected: ${result.error}`);
        return JSON.stringify({ ...result, attemptsUsed: attempts, retriesRemaining: Math.max(0, maxRetries - attempts) });
      }
      try {
        await deps.io.writeFile(input.file, result.content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${DEBUGGER_LOG_PREFIX} write failed ${input.file}`, error);
        return JSON.stringify({ ok: false, content: '', applied: 0, error: `write failed: ${message}` });
      }
      console.log(`${DEBUGGER_LOG_PREFIX} applied ${result.applied} edit(s) to ${input.file}`);
      // Do not echo full file content back to the model (keeps context small).
      return JSON.stringify({ ok: true, applied: result.applied, error: '', attemptsUsed: attempts, retriesRemaining: Math.max(0, maxRetries - attempts) });
    },
    {
      name: 'apply_minimal_diff',
      description:
        'Apply minimal find/replace edits to a file. Each `find` must be unique; whole-file ' +
        'rewrites are rejected. Returns { ok, applied, error, retriesRemaining }.',
      schema: z.object({
        file: z.string(),
        edits: z.array(MinimalEditSchema).min(1),
      }),
    },
  );

  const escalateTool = tool(
    async (input: { failure: StructuredFailure; lastError: string }) => {
      console.log(`${DEBUGGER_LOG_PREFIX} escalate file=${input.failure.file} attempts=${attempts}`);
      try {
        deps.escalate?.({ failure: input.failure, attempts, lastError: input.lastError });
      } catch (cbErr) {
        console.error(`${DEBUGGER_LOG_PREFIX} escalate callback threw`, cbErr);
      }
      return `Escalated ${input.failure.file} to the user after ${attempts} attempt(s).`;
    },
    {
      name: 'escalate',
      description:
        'Escalate to the user after the retry budget is exhausted, with a clear report of what was ' +
        'tried and why automated repair failed.',
      schema: z.object({
        failure: StructuredFailureSchema,
        lastError: z.string().describe('the final blocking error'),
      }),
    },
  );

  return createAgent({
    model: createCoderModel(),
    tools: [readTool, applyTool, escalateTool],
    systemPrompt: SYSTEM_PROMPT,
  });
}
