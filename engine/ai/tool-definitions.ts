/**
 * LangChain tool() definitions the agents call (research/langchain-agents-chains-gemini.md).
 * Implementations live in engine modules; these are thin, Zod-schemaed wrappers.
 *
 * Tools are constructed per-request via a factory so they can emit structured
 * events (tool progress, generated images) onto the route's SSE stream without
 * round-tripping megabytes of base64 through the model context.
 */
import { tool } from 'langchain';
import * as z from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generateImage } from './providers';
import { buildLocalGdd, gddSchema, renderGddMarkdown } from './agents/designer';
import type { GameDesignDocument } from './agents/designer';

const TOOLS_LOG_PREFIX = '[engine/ai/tool-definitions]';

/** Structured events tools push to the frontend (SSE frames on /api/chat). */
export type EngineEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; name: string; detail: string }
  | { type: 'tool_end'; name: string; ok: boolean; detail: string }
  | { type: 'image'; id: string; dataUrl: string; caption: string }
  | { type: 'artifact'; kind: string; title: string; markdown: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type EmitEvent = (event: EngineEvent) => void;

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'game';
}

/** Persist the GDD into the generated-game tree (reports/gdd.md + config/gdd.json). Returns the slug. */
async function persistGdd(gdd: GameDesignDocument): Promise<string> {
  const slug = `${slugify(gdd.title)}-${Date.now().toString(36).slice(-4)}`;
  try {
    const dir = path.join(process.cwd(), 'generations', slug);
    await fs.mkdir(path.join(dir, 'reports'), { recursive: true });
    await fs.mkdir(path.join(dir, 'config'), { recursive: true });
    await fs.writeFile(path.join(dir, 'reports', 'gdd.md'), renderGddMarkdown(gdd), 'utf8');
    await fs.writeFile(path.join(dir, 'config', 'gdd.json'), JSON.stringify(gdd, null, 2), 'utf8');
    console.log(`${TOOLS_LOG_PREFIX} persistGdd wrote generations/${slug}`);
  } catch (error) {
    console.error(`${TOOLS_LOG_PREFIX} persistGdd failed (ephemeral FS?)`, error);
  }
  return slug;
}

/**
 * Keyless design turn — runs the design phase without the Gemini director (no GOOGLE_API_KEY).
 * Builds a bounded GDD locally, persists it, emits it as an artifact, and returns a chat summary.
 */
export async function localDesignTurn(emit: EmitEvent, prompt: string): Promise<string> {
  emit({ type: 'tool_start', name: 'design_game', detail: 'designing (local)' });
  const gdd = buildLocalGdd(prompt);
  const slug = await persistGdd(gdd);
  emit({ type: 'artifact', kind: 'gdd', title: gdd.title, markdown: renderGddMarkdown(gdd) });
  emit({ type: 'tool_end', name: 'design_game', ok: true, detail: slug });
  return (
    `I drafted a bounded design for “${gdd.title}” — a ${gdd.genre} with one core mechanic and ` +
    `${gdd.scenes.length} scene. Review the GDD above, then tell me what to change or say “go” to ` +
    `move to the asset phase. (Running keyless — set GOOGLE_API_KEY for the full Gemini director.)`
  );
}

/**
 * Director toolset. The generated image is emitted to the client as an SSE frame;
 * only a short reference string returns to the model (keeps the context small).
 */
export function makeDirectorTools(emit: EmitEvent) {
  let imageCounter = 0;

  const generateImageTool = tool(
    async ({ prompt, useProModel }: { prompt: string; useProModel: boolean }) => {
      const id = `img-${++imageCounter}`;
      console.log(`${TOOLS_LOG_PREFIX} generate_image start id=${id} pro=${useProModel}`);
      emit({ type: 'tool_start', name: 'generate_image', detail: prompt.slice(0, 140) });
      try {
        const image = await generateImage(prompt, { pro: useProModel });
        emit({ type: 'image', id, dataUrl: image.dataUrl, caption: image.text || prompt.slice(0, 140) });
        emit({ type: 'tool_end', name: 'generate_image', ok: true, detail: id });
        console.log(`${TOOLS_LOG_PREFIX} generate_image done id=${id}`);
        return `Image ${id} generated and shown to the user. Model notes: ${image.text || '(none)'}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} generate_image failed id=${id}`, error);
        emit({ type: 'tool_end', name: 'generate_image', ok: false, detail: message.slice(0, 200) });
        return `Image generation failed: ${message}. You may retry with a simpler prompt.`;
      }
    },
    {
      name: 'generate_image',
      description:
        'Generate a concept image (sprite, scene, background, visual-direction still) with Gemini image models. ' +
        'The image is displayed to the user automatically; you receive a short reference id.',
      schema: z.object({
        prompt: z.string().describe('Detailed visual prompt: subject, style, palette, composition'),
        useProModel: z
          .boolean()
          .describe('true for high-fidelity contextual scenes (slower), false for fast iteration'),
      }),
    },
  );

  const designTool = tool(
    async (gdd: GameDesignDocument) => {
      console.log(`${TOOLS_LOG_PREFIX} design_game start title=${gdd.title}`);
      emit({ type: 'tool_start', name: 'design_game', detail: gdd.title });
      const slug = await persistGdd(gdd);
      emit({ type: 'artifact', kind: 'gdd', title: gdd.title, markdown: renderGddMarkdown(gdd) });
      emit({ type: 'tool_end', name: 'design_game', ok: true, detail: slug });
      return (
        `GDD for "${gdd.title}" saved to generations/${slug} (reports/gdd.md + config/gdd.json). ` +
        `Core mechanic: ${gdd.coreMechanic}. Win: ${gdd.winCondition}. ` +
        `Summarize it for the user and ask them to approve or adjust before the asset phase.`
      );
    },
    {
      name: 'design_game',
      description:
        'Produce and persist the bounded Game Design Document (reports/gdd.md + config/gdd.json). ' +
        'Call this once the concept and scope are clear: provide ONE core mechanic, 1-3 scenes, ' +
        'explicit win/lose conditions, controls, and explicit non-goals (scope cuts).',
      schema: gddSchema,
    },
  );

  return [generateImageTool, designTool];
}
