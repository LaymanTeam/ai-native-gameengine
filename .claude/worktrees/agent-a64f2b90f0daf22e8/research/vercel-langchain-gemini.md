# LangChain.js on Vercel (Node runtime) → streaming routes → Gemini conversation model

> Researched 2026-06-06. Architecture constraint: the tool must live on Vercel; LangChain runs server-side in Vercel Functions (Node.js runtime) behind API routes that stream async back to the frontend; the conversation model is Google Gemini via `@langchain/google-genai`.

## Hard constraints (verified)

1. **LangChain.js requires the Node.js runtime on Vercel — NOT Edge.** LangChain uses Node APIs (e.g. `fs`) unavailable in the Edge runtime; there is no workaround. Never put `export const runtime = 'edge'` in a route that imports LangChain.
2. **Streaming works fine from Node functions.** Vercel Node functions support HTTP streaming (return a `Response` with a `ReadableStream`, or write to the res stream).
3. **Duration:** with Fluid Compute (default now) all plans default to **300s max execution**; tune with `export const maxDuration = 60` (seconds) in the route file or `vercel.json`. Use `waitUntil()` from `@vercel/functions` for post-response background work (e.g. persisting the conversation).

## Packages

```bash
npm i langchain @langchain/core @langchain/google-genai
```

Env var: `GOOGLE_API_KEY` (set in Vercel project settings). Key from https://ai.google.dev.

## Gemini chat model (`@langchain/google-genai`)

```ts
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',     // or 'gemini-2.5-pro'; flash = fast/cheap conversation default
  temperature: 0.7,
  maxRetries: 2,
  // apiKey defaults to process.env.GOOGLE_API_KEY
});
```

Invocation & streaming:

```ts
const response = await llm.invoke([
  ['system', 'You are a helpful assistant.'],
  ['human', 'Hello'],
]);                                  // response.content

const stream = await llm.stream([['human', 'Write a poem']]);
for await (const chunk of stream) { /* chunk.content */ }
```

Tool calling: `llm.bindTools([tool])` → `result.tool_calls`. Tool schemas must explicitly define every object field (no unknown properties).

Gemini quirks (from official docs):
- Messages must alternate human/AI; system message is merged into the first user message.
- Max one user message when sending image inputs.
- Docs note `@langchain/google-genai` wraps the older Google SDK; `ChatGoogle` (`@langchain/google-gauth` / `google-common`) is the recommended newer path — both expose the same LangChain chat-model interface (`invoke`/`stream`/`bindTools`). Verify current guidance before locking in.

## Route shape (Next.js App Router on Vercel)

`app/api/chat/route.ts`:

```ts
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

export const runtime = 'nodejs';     // explicit: LangChain cannot run on edge
export const maxDuration = 60;       // seconds; Fluid Compute allows up to 300 default cap

const llm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: 0.7 });

export async function POST(req: Request) {
  const { messages } = await req.json();   // [{role:'user'|'assistant', content}, ...]
  const history = messages.map((m: any) =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));

  const stream = await llm.stream([new SystemMessage('You are the game master.'), ...history]);

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(typeof chunk.content === 'string' ? chunk.content : ''));
        }
      } finally { controller.close(); }
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
```

(For a plain Vercel `api/` function instead of Next.js, the same pattern applies — Node functions accept returning a web `Response` with a stream, or `res.write()` chunks.)

## Frontend consumption (async back to the conversation UI)

```ts
const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ messages }) });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let text = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  text += decoder.decode(value, { stream: true });
  setAssistantMessage(text);          // incremental UI update
}
```

Alternative: LangChain's `.streamEvents()` for structured event streams (tool calls + tokens), serialized as SSE (`Content-Type: text/event-stream`, `data: {...}\n\n` frames) — useful once tools/agents are in the loop.

## Conversation state

Vercel functions are stateless — pass full message history from the frontend each request (as above), or persist server-side (DB) keyed by conversation id and use `waitUntil(savePromise)` from `@vercel/functions` to persist after streaming completes without delaying the response.

## Gotchas

1. `runtime = 'edge'` + LangChain import = build/runtime failure. Always `nodejs`.
2. Without Fluid Compute, old serverless default durations are much shorter — confirm Fluid Compute is on (default for new projects) and set `maxDuration`.
3. Start streaming early; buffering the whole LLM response defeats the purpose and risks proxy timeouts.
4. `chunk.content` can be a string OR an array of content blocks (multimodal) — guard before concatenating.
5. Keep the LangChain client at module scope (reused across warm invocations under Fluid Compute).
6. The Vercel AI SDK (`ai` package) is an alternative integration layer (`toDataStreamResponse`, `useChat`) and is edge-compatible — but the LangChain requirement pins us to Node; mixing is possible via `LangChainAdapter` from `ai` if the frontend uses `useChat`.

## Sources
- https://docs.langchain.com/oss/javascript/integrations/chat/google_generative_ai
- https://www.npmjs.com/package/@langchain/google-genai
- https://vercel.com/docs/functions/streaming-functions
- https://vercel.com/docs/functions/configuring-functions/duration (Fluid Compute 300s defaults)
- https://vercel.com/docs/functions/limitations
- https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide (LangChain.js Node-only on Vercel)
