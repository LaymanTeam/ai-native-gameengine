/**
 * Researcher agent — gathers genre/mechanic references for a game into its research/ folder.
 * Uses the Gemini search-grounded conversation model (native Google Search grounding) to find
 * comparable games, mechanic patterns, and design conventions, then summarizes them into
 * research/reports/*.md notes the designer and coder consume. Grounding sources arrive on
 * response_metadata and are recorded for provenance.
 *
 * Architecture: LangChain v1 `createAgent` (LangGraph loop) — same pattern as director.ts.
 * No custom state machine. The search-grounded model comes from engine/ai/providers.ts; any
 * file-persistence tools are INJECTED (built in parallel) — never imported here. Research:
 * research/langchain-agents-chains-gemini.md, research/vercel-langchain-gemini.md.
 */
import { createAgent, tool } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import * as z from 'zod';
import { createConversationModel, createSearchGroundedModel } from '../providers';

export const RESEARCHER_LOG_PREFIX = '[engine/ai/agents/researcher]';

/** A single research note destined for the game's research/reports/ folder. */
export const researchNoteSchema = z.object({
  topic: z.string().min(1).describe('What this note covers, e.g. "platformer jump feel"'),
  summary: z.string().min(1).describe('Concise synthesized findings the designer/coder can act on'),
  sources: z
    .array(z.string().min(1))
    .describe('Reference URLs or titles backing the summary (may be empty if none surfaced)'),
});

export type ResearchNote = z.infer<typeof researchNoteSchema>;

/** Renders a research note to markdown for research/reports/<topic>.md. Pure + testable. */
export function renderResearchNoteMarkdown(note: ResearchNote): string {
  const lines: string[] = [`# Research — ${note.topic}`, '', note.summary, ''];
  if (note.sources.length > 0) {
    lines.push('## Sources', '');
    for (const s of note.sources) lines.push(`- ${s}`);
    lines.push('');
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT =
  'You are the researcher for an AI game engine. Given a game concept, gather concrete, ' +
  'actionable references: comparable games, the genre conventions and mechanic patterns that make ' +
  'them work, level/scene structures, control schemes, and visual/audio conventions. ' +
  'Use Google Search grounding to find real examples and cite them. ' +
  'Synthesize findings into focused notes (one topic each) that the designer and coder can act on; ' +
  'keep them terse and specific — no filler. When persistence tools are available, save each note ' +
  "into the game's research/ folder.";

/** Module-scoped checkpointer so multi-turn research keeps context across warm invocations. */
const checkpointer = new MemorySaver();

export interface ResearcherAgentOptions {
  /** Injected tools (e.g. write_research_note). Optional; defaults to none. */
  tools?: StructuredToolInterface[];
}

/**
 * Build the researcher agent. The model is the search-grounded conversation model so the agent
 * can ground claims in live web results. File-persistence tools are injected by the caller.
 */
/**
 * Grounded web research exposed as a regular function tool. createAgent rejects models with
 * pre-bound tools (MultipleToolsBoundError) and Gemini cannot mix the googleSearch specialty
 * tool with function tools on one model — so the grounded model is invoked INSIDE a tool the
 * (un-bound) agent model calls.
 */
export function makeGroundedSearchTool() {
  return tool(
    async ({ query }: { query: string }) => {
      console.log(`${RESEARCHER_LOG_PREFIX} grounded_web_research query=${query}`);
      try {
        const response = await createSearchGroundedModel().invoke(query);
        const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        console.log(`${RESEARCHER_LOG_PREFIX} grounded_web_research ok chars=${text.length}`);
        return text;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${RESEARCHER_LOG_PREFIX} grounded_web_research failed error=${message}`);
        return `Search failed: ${message}`;
      }
    },
    {
      name: 'grounded_web_research',
      description:
        'Run a Google-Search-grounded Gemini query for live web facts about games, genres, and mechanics. Returns grounded text.',
      schema: z.object({ query: z.string().min(1).describe('The research question to ground in web results.') }),
    },
  );
}

export function createResearcherAgent(options: ResearcherAgentOptions = {}) {
  const tools = [makeGroundedSearchTool(), ...(options.tools ?? [])];
  console.log(`${RESEARCHER_LOG_PREFIX} create toolCount=${tools.length}`);
  return createAgent({
    model: createConversationModel(),
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer,
  });
}

/** Config helper: checkpointer keys research context by thread_id (one per game). */
export function researcherThreadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}
