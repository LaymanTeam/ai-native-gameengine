/**
 * Design pipeline (phase 1): scaffold the info.md game tree, persist the bounded GDD,
 * then optionally run the RESEARCHER subagent to ground the design in vetted references
 * (research/<topic>.md notes the designer/coder consume).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tool } from 'langchain';
import * as z from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { renderGddMarkdown, type GameDesignDocument } from '../agents/designer';
import {
  createResearcherAgent,
  researcherThreadConfig,
  renderResearchNoteMarkdown,
  researchNoteSchema,
  type ResearchNote,
} from '../agents/researcher';
import { scaffoldGame } from '../../compiler/game-scaffold';
import type { EmitEvent } from '../events';
import { PIPELINES_LOG_PREFIX, resolveInside } from './shared';

export interface DesignResult {
  game: string;
  gameRoot: string;
  researchNotes: string[];
}

export interface DesignDeps {
  /** Runs the researcher subagent for one topic, persisting notes. Injected in tests. */
  research?: (args: { gameRoot: string; game: string; topic: string }) => Promise<string[]>;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'game';
}

/** Default researcher step: researcher agent + injected note-persistence tool. */
async function researchWithAgent(args: { gameRoot: string; game: string; topic: string }): Promise<string[]> {
  const written: string[] = [];
  const writeNoteTool = tool(
    async (note: ResearchNote) => {
      const fileName = `${slugify(note.topic)}.md`;
      const abs = resolveInside(args.gameRoot, path.posix.join('research', fileName));
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, renderResearchNoteMarkdown(note), 'utf8');
      written.push(`research/${fileName}`);
      console.log(`${PIPELINES_LOG_PREFIX} research note written: ${fileName}`);
      return `Note saved as research/${fileName}.`;
    },
    {
      name: 'write_research_note',
      description: 'Persist one focused research note into the game research/ folder.',
      schema: researchNoteSchema,
    },
  );
  const researcher = createResearcherAgent({ tools: [writeNoteTool] });
  await researcher.invoke(
    {
      messages: [
        new HumanMessage(
          `Research this topic for the game and persist 1-3 focused notes via write_research_note: ${args.topic}`,
        ),
      ],
    },
    { ...researcherThreadConfig(`researcher-${args.game}`), recursionLimit: 30 },
  );
  return written;
}

/**
 * Run the design phase. Scaffolds generations/<slug>/, writes reports/gdd.md + config/gdd.json,
 * then researches each requested topic with the researcher subagent.
 */
export async function runDesignPipeline(
  args: { gdd: GameDesignDocument; researchTopics: string[]; emit: EmitEvent },
  deps: DesignDeps = {},
): Promise<DesignResult> {
  const research = deps.research ?? researchWithAgent;
  const slug = slugify(args.gdd.title);
  const { gameRoot, gameName } = await scaffoldGame(slug);
  await fs.writeFile(path.join(gameRoot, 'reports', 'gdd.md'), renderGddMarkdown(args.gdd), 'utf8');
  await fs.writeFile(path.join(gameRoot, 'config', 'gdd.json'), JSON.stringify(args.gdd, null, 2), 'utf8');
  console.log(`${PIPELINES_LOG_PREFIX} design: scaffolded + GDD persisted generations/${gameName}`);

  const researchNotes: string[] = [];
  for (const topic of args.researchTopics) {
    args.emit({ type: 'tool_start', name: 'research', detail: topic });
    try {
      const notes = await research({ gameRoot, game: gameName, topic });
      researchNotes.push(...notes);
      args.emit({ type: 'tool_end', name: 'research', ok: true, detail: `${notes.length} note(s)` });
    } catch (error) {
      // Research is enrichment, not a gate — log + surface, never block the design phase on it.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${PIPELINES_LOG_PREFIX} research failed topic=${topic}`, error);
      args.emit({ type: 'tool_end', name: 'research', ok: false, detail: message.slice(0, 160) });
    }
  }

  return { game: gameName, gameRoot, researchNotes };
}

/** Zod schema for design tool args beyond the GDD itself. */
export const designExtrasSchema = z.object({
  researchTopics: z
    .array(z.string().min(1))
    .max(3)
    .describe('0-3 topics for the researcher subagent (e.g. "match-3 scoring conventions"); [] to skip'),
});
