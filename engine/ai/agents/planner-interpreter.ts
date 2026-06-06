//gamemechanicexplorer.com use this as a source - https://gamemechanicexplorer.com/
/**
 * Planner-interpreter agent — turns the user's free-form plan/prompt into a STRUCTURED pipeline
 * instruction the director can act on: which phases to run, the bounded scope signals (genre,
 * core mechanic candidate, target scenes), explicit constraints, and any open questions that must
 * be resolved with the user first. It does not generate anything itself — it interprets intent into
 * a machine-readable plan so the director's phase loop has a clear contract.
 *
 * Architecture: LangChain v1 `createAgent` (LangGraph loop) — same pattern as director.ts.
 * No custom state machine. Model from engine/ai/providers.ts; structured output via the agent's
 * responseFormat (Zod). Sibling tools are INJECTED — never imported here. Research:
 * research/langchain-agents-chains-gemini.md, research/vercel-langchain-gemini.md.
 */
import { createAgent } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import * as z from 'zod';
import { createConversationModel } from '../providers';

export const PLANNER_LOG_PREFIX = '[engine/ai/agents/planner-interpreter]';

/** The pipeline phases the director sequences (one phase per chat turn, Vercel 300s budget). */
export const pipelinePhaseSchema = z.enum(['design', 'assets', 'code', 'test', 'deploy']);
export type PipelinePhase = z.infer<typeof pipelinePhaseSchema>;

/**
 * Structured plan the director consumes. Gemini structured-output schemas must define every field
 * explicitly (no loose props) — research/langchain-agents-chains-gemini.md.
 */
export const pipelinePlanSchema = z.object({
  gameIdea: z.string().min(1).describe('One-line restatement of what the user wants to build'),
  genre: z.string().min(1).describe('Inferred primary genre'),
  coreMechanicCandidate: z
    .string()
    .min(1)
    .describe('Best-guess single core mechanic for the designer to confirm/refine'),
  targetSceneCount: z
    .number()
    .int()
    .min(1)
    .max(3)
    .describe('How many scenes the user seems to want (bounded 1-3)'),
  phases: z
    .array(pipelinePhaseSchema)
    .min(1)
    .describe('Ordered phases the director should run for this request'),
  constraints: z
    .array(z.string().min(1))
    .describe('Hard requirements/limits stated or implied by the user (may be empty)'),
  openQuestions: z
    .array(z.string().min(1))
    .describe('Ambiguities that must be resolved with the user before proceeding (may be empty)'),
});

export type PipelinePlan = z.infer<typeof pipelinePlanSchema>;

/** Validates an unknown value as a pipeline plan; discriminated result for safe call sites. */
export function parsePipelinePlan(
  value: unknown,
): { ok: true; plan: PipelinePlan } | { ok: false; errors: string[] } {
  const result = pipelinePlanSchema.safeParse(value);
  if (result.success) {
    console.log(
      `${PLANNER_LOG_PREFIX} parsePipelinePlan ok phases=${result.data.phases.join(',')}`,
    );
    return { ok: true, plan: result.data };
  }
  const errors = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(`${PLANNER_LOG_PREFIX} parsePipelinePlan failed`, errors);
  return { ok: false, errors };
}

/** Whether the plan is blocked on the user (has unresolved open questions). Pure + testable. */
export function planNeedsUserInput(plan: PipelinePlan): boolean {
  return plan.openQuestions.length > 0;
}

const SYSTEM_PROMPT =
  'You are the planner-interpreter for an AI game engine. Read the user\'s plan or prompt and ' +
  'interpret it into a structured pipeline plan: restate the game idea, infer the genre and a ' +
  'single core-mechanic candidate, decide how many scenes (1-3) and which phases ' +
  '(design, assets, code, test, deploy) to run, capture any hard constraints, and list open ' +
  'questions for genuine ambiguities. Keep scope bounded — prefer the smallest plan that satisfies ' +
  'the user. Use game-mechanic references when reasoning about mechanics. Do not build anything; ' +
  'only produce the plan.';

export interface PlannerAgentOptions {
  /** Injected tools (e.g. mechanic-reference lookup). Optional; defaults to none. */
  tools?: StructuredToolInterface[];
}

/**
 * Build the planner-interpreter agent. Uses responseFormat so the director gets a parsed plan via
 * `result.structuredResponse` rather than free text.
 */
export function createPlannerInterpreterAgent(options: PlannerAgentOptions = {}) {
  const tools = options.tools ?? [];
  console.log(`${PLANNER_LOG_PREFIX} create toolCount=${tools.length}`);
  return createAgent({
    model: createConversationModel(),
    tools,
    systemPrompt: SYSTEM_PROMPT,
    responseFormat: pipelinePlanSchema,
  });
}
