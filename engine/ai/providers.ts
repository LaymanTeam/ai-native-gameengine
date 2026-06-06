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
  /** data: URL (base64 PNG) of the generated image. */
  dataUrl: string;
  /** Accompanying text the model produced alongside the image, if any. */
  text: string;
}

// ---------------------------------------------------------------------------
// Multimodal GENERATION goes straight to the AI Studio REST API.
//
// WHY NOT LANGCHAIN: @langchain/google-genai (≤2.1.x) wraps the legacy
// @google/generative-ai SDK, and NEITHER supports generationConfig.responseModalities —
// the option was silently dropped on invoke, so image models always answered text-only
// and generateImage threw "no image block" on every call. LangChain remains the agent
// layer (chat/tools/checkpointing); generation-with-modalities uses the same AI Studio
// key over plain fetch. Same pattern will serve TTS/audio modalities later.
// ---------------------------------------------------------------------------

const AI_STUDIO_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Injectable fetch (tests run offline against a fake). */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** Subset of the AI Studio generateContent response we read. */
interface GenerateContentResponseLike {
  candidates?: {
    content?: {
      parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
    };
  }[];
  error?: { message?: string; status?: string };
}

export interface GenerateImageOptions {
  pro?: boolean;
  /** Injected fetch for testing; defaults to globalThis.fetch. */
  fetchImpl?: FetchLike;
}

/**
 * Generate an image with Nano Banana via the AI Studio REST API and return it as a data URL.
 * Throws when the response carries no inlineData image part — the asset-review loop treats
 * that as retryable.
 */
export async function generateImage(prompt: string, opts: GenerateImageOptions = {}): Promise<GeneratedImage> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: prompt must be a non-empty string`);
  }
  const apiKey = process.env['GOOGLE_API_KEY'];
  if (!apiKey) {
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: GOOGLE_API_KEY is not set`);
  }
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: no fetch implementation available`);
  }

  const model = opts.pro ? 'gemini-3-pro-image' : 'gemini-3.1-flash-image';
  const started = Date.now();
  console.log(`${PROVIDER_LOG_PREFIX} generateImage start model=${model} promptChars=${prompt.length}`);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(`${AI_STUDIO_BASE}/${model}:generateContent`, {
      method: 'POST',
      // Key travels in a header, never in the URL (avoids key leakage into logs/traces).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${PROVIDER_LOG_PREFIX} generateImage network-error model=${model}: ${message}`);
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: network error: ${message} (retryable)`);
  }

  const raw = await response.text();
  if (!response.ok) {
    // Redact: log status + a bounded slice of the error body, never the request/key.
    console.error(`${PROVIDER_LOG_PREFIX} generateImage http-${response.status} model=${model} body=${raw.slice(0, 300)}`);
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: HTTP ${response.status} from AI Studio (retryable)`);
  }

  let parsed: GenerateContentResponseLike;
  try {
    parsed = JSON.parse(raw) as GenerateContentResponseLike;
  } catch {
    console.error(`${PROVIDER_LOG_PREFIX} generateImage bad-json model=${model} bytes=${raw.length}`);
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: unparseable AI Studio response (retryable)`);
  }

  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  let dataUrl: string | undefined;
  const texts: string[] = [];
  for (const part of parts) {
    if (part.inlineData?.data && dataUrl === undefined) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      dataUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (typeof part.text === 'string') {
      texts.push(part.text);
    }
  }

  const durationMs = Date.now() - started;
  if (dataUrl === undefined) {
    console.error(
      `${PROVIDER_LOG_PREFIX} generateImage no-image model=${model} durationMs=${durationMs} ` +
        `parts=${parts.map((p) => (p.inlineData ? 'inlineData' : p.text !== undefined ? 'text' : 'other')).join(',')}`,
    );
    throw new Error(`${PROVIDER_LOG_PREFIX} generateImage: model returned no image part (retryable)`);
  }
  console.log(`${PROVIDER_LOG_PREFIX} generateImage done model=${model} durationMs=${durationMs} textChars=${texts.join('').length}`);
  return { dataUrl, text: texts.join('\n') };
}
