/**
 * The pipeline conductor — a LangChain v1 `createAgent` (LangGraph loop) that orchestrates the
 * full generation: prompt → research/visual direction → assets (with review loop) → systems/ui code
 * → tests → scaffold → deploy. Orchestration lives IN LangChain: the other agents (coder,
 * image-reviewer, search-and-get, tester) and engine tools are exposed to this agent as tools.
 * No custom state machine. Research: research/langchain-agents-chains-gemini.md
 *
 * Conversation persistence: a module-scoped MemorySaver checkpointer keyed by thread_id.
 * NOTE: in-memory — survives warm serverless invocations only; swap for a durable
 * checkpointer (e.g. Postgres) before production.
 */
import { createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import { createConversationModel } from '../providers';
import { makeDirectorTools, type EmitEvent } from '../tool-definitions';

const DIRECTOR_LOG_PREFIX = '[engine/ai/agents/director]';

const SYSTEM_PROMPT =
  'You are the director of an AI game engine that generates complete, playable 2D games. ' +
  'You have exactly one tool per phase; each tool runs a full pipeline chain internally ' +
  '(subagents included) — your job is the CONVERSATION: agree scope with the user, compile their ' +
  'intent into one declarative tool call per phase, report results, and get approval between phases.\n' +
  '1. design_game — once concept/scope are agreed (one core mechanic, 1-3 scenes, win/lose, non-goals). ' +
  'Returns the game slug; use it in every later call. Include researchTopics when grounding would help.\n' +
  '2. set_visual_direction — persist the style bible. Required before assets; use explore_image for ' +
  'throwaway concepts while discussing the look.\n' +
  '3. produce_assets — compile the FULL asset plan (every sprite/background/scene with prompts and ' +
  'variable names, audio queries, fonts) into one call. Images are auto-reviewed; escalations are ' +
  'queued for the user — surface them.\n' +
  '4. build_game — the coder/tester/debugger chain implements and self-tests the game.\n' +
  '5. verify_game — all deploy gates (typecheck, manifest, tests, logic coherence, headless playtest). ' +
  'Then deploy_game (refuses without green verification).\n' +
  'Be concise and concrete; never skip a phase, never deploy unverified.';

// Module scope: shared across warm invocations so threads keep their history.
const checkpointer = new MemorySaver();

export function createDirectorAgent(emit: EmitEvent) {
  console.log(`${DIRECTOR_LOG_PREFIX} create`);
  return createAgent({
    model: createConversationModel(),
    tools: makeDirectorTools(emit),
    systemPrompt: SYSTEM_PROMPT,
    checkpointer,
  });
}

/** Config helper: checkpointer keys conversation history by thread_id. */
export function directorThreadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}
