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
  'You help the user shape a bounded game concept — mechanics, visual direction, audio mood, save/state needs — ' +
  'then drive generation phase by phase (design → assets → code → test → deploy). ' +
  'Use generate_image to explore visual direction when the user discusses look and feel. ' +
  'Be concise and concrete; confirm scope before generating.';

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
