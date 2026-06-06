/**
 * Research Gemini API and provider for image generation, sound generation, web search, and communnication
 *
 * Gemini provider instances for the engine, via @langchain/google-genai.
 * Model IDs verified in research/langchain-agents-chains-gemini.md (Gemini model lineup).
 * All models read GOOGLE_API_KEY from the environment automatically.
 */
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

const PROVIDER_LOG_PREFIX = '[engine/ai/providers]';

function logModelInit(role: string, model: string): void {
  console.log(`${PROVIDER_LOG_PREFIX} init role=${role} model=${model} apiKeySet=${Boolean(process.env['GOOGLE_API_KEY'])}`);
}

/** Conversation + director agent model — fast, agentic. */
export function createConversationModel(): ChatGoogleGenerativeAI {
  const model = 'gemini-3.5-flash';
  logModelInit('conversation', model);
  return new ChatGoogleGenerativeAI({ model, temperature: 0.7, maxRetries: 2 });
}

/** Coder agent model — strongest reasoning/coding for systems/ and ui/ generation. */
export function createCoderModel(): ChatGoogleGenerativeAI {
  const model = 'gemini-3.1-pro-preview';
  logModelInit('coder', model);
  return new ChatGoogleGenerativeAI({ model, temperature: 0.2, maxRetries: 2 });
}

/** Cheap triage model — classification, review scoring. */
export function createTriageModel(): ChatGoogleGenerativeAI {
  const model = 'gemini-3.1-flash-lite';
  logModelInit('triage', model);
  return new ChatGoogleGenerativeAI({ model, temperature: 0, maxRetries: 2 });
}

/**
 * Image generation model (Nano Banana 2) — sprites, backgrounds, scenes.
 * Invoke with response modalities per research doc; consumed by engine/tools generators.
 */
export function createImageModel(): ChatGoogleGenerativeAI {
  const model = 'gemini-3.1-flash-image';
  logModelInit('image', model);
  return new ChatGoogleGenerativeAI({ model, maxRetries: 2 });
}

/** Nano Banana Pro — contextual image generation for hero scenes needing fidelity. */
export function createImageProModel(): ChatGoogleGenerativeAI {
  const model = 'gemini-3-pro-image';
  logModelInit('image-pro', model);
  return new ChatGoogleGenerativeAI({ model, maxRetries: 2 });
}

/**
 * Conversation model with Gemini's native Google Search grounding bound — used by
 * visual-direction and search-and-get for web research. Grounding sources arrive on
 * response_metadata. This is a Gemini specialty tool, not a LangChain function tool.
 */
export function createSearchGroundedModel() {
  const base = createConversationModel();
  console.log(`${PROVIDER_LOG_PREFIX} bind specialty-tool=googleSearch`);
  return base.bindTools([{ googleSearch: {} }]);
}

/** Embeddings for asset/search indexing. */
export function createEmbeddings(): GoogleGenerativeAIEmbeddings {
  const model = 'gemini-embedding-001';
  logModelInit('embeddings', model);
  return new GoogleGenerativeAIEmbeddings({ model });
}

export interface GeneratedImage {
  /** data: URL (base64 PNG) from the image_url content block. */
  dataUrl: string;
  /** Accompanying text the model produced alongside the image, if any. */
  text: string;
}

/**
 * Generate an image with Nano Banana and return the first image content block.
 * Throws when no image block is present — the asset-review loop treats that as retryable.
 */
export async function generateImage(prompt: string, opts: { pro?: boolean } = {}): Promise<GeneratedImage> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: prompt must be a non-empty string`);
  }
  const llm = opts.pro ? createImageProModel() : createImageModel();
  const started = Date.now();
  console.log(`${PROVIDER_LOG_PREFIX} generateImage start pro=${Boolean(opts.pro)} promptChars=${prompt.length}`);

  // responseModalities is required for image output; call-option plumbing varies across
  // @langchain/google-genai versions — verified against research/langchain-agents-chains-gemini.md.
  const response = await llm.invoke(prompt, { responseModalities: ['TEXT', 'IMAGE'] } as never);

  const blocks = Array.isArray(response.content)
    ? response.content
    : [{ type: 'text', text: String(response.content ?? '') }];

  let dataUrl: string | undefined;
  const texts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b['type'] === 'image_url') {
      const raw = b['image_url'];
      const url =
        typeof raw === 'string'
          ? raw
          : typeof (raw as Record<string, unknown> | undefined)?.['url'] === 'string'
            ? ((raw as Record<string, unknown>)['url'] as string)
            : undefined;
      if (url !== undefined && dataUrl === undefined) dataUrl = url;
    } else if (b['type'] === 'text' && typeof b['text'] === 'string') {
      texts.push(b['text']);
    }
  }

  const durationMs = Date.now() - started;
  if (dataUrl === undefined) {
    console.error(`${PROVIDER_LOG_PREFIX} generateImage no-image durationMs=${durationMs} blocks=${blocks.map((x) => (x as { type?: string })?.type).join(',')}`);
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: model returned no image block (retryable)`);
  }
  console.log(`${PROVIDER_LOG_PREFIX} generateImage done durationMs=${durationMs} textChars=${texts.join('').length}`);
  return { dataUrl, text: texts.join('\n') };
}
