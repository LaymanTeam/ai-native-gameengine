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
import { generateImage } from './providers';

const TOOLS_LOG_PREFIX = '[engine/ai/tool-definitions]';

/** Structured events tools push to the frontend (SSE frames on /api/chat). */
export type EngineEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; name: string; detail: string }
  | { type: 'tool_end'; name: string; ok: boolean; detail: string }
  | { type: 'image'; id: string; dataUrl: string; caption: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type EmitEvent = (event: EngineEvent) => void;

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

  return [generateImageTool];
}
