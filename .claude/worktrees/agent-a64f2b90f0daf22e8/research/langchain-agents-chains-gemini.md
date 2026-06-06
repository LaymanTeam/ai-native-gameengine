# LangChain.js Agents & Chains with Gemini (verified against docs.langchain.com)

> Researched 2026-06-06. LangChain **v1** for JS changed the agent API: the primary entry point is **`createAgent` from the `langchain` package** (LangGraph-based loop under the hood). Older `initializeAgentExecutorWithOptions` / `AgentExecutor` / `createReactAgent`-from-prebuilt patterns are legacy — don't emit them.
> Companion docs: [[vercel-langchain-gemini]] (runtime/streaming/routes), this file (agent & chain composition).

## Packages

```bash
npm i langchain @langchain/core @langchain/google-genai zod
# memory/checkpointing: @langchain/langgraph
```

Env: `GOOGLE_API_KEY`.

## createAgent — the agent loop

"An agent = a model calling tools in a loop until the task is complete."

```ts
import { createAgent, tool } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import * as z from 'zod';

const search = tool(
  ({ query }) => `Results for: ${query}`,        // can be async
  {
    name: 'search',
    description: 'Search for information',
    schema: z.object({ query: z.string() }),     // zod schema = tool args
  },
);

const agent = createAgent({
  model: 'google-genai:gemini-2.5-flash',        // provider:model string…
  // …or an instance: model: new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash' })
  tools: [search],
  systemPrompt: 'You are the game master. Be concise.',
  checkpointer: new MemorySaver(),               // optional conversation persistence
  // responseFormat: z.object({...})             // optional structured final output
});
```

### Invoke / conversation threads

```ts
const config = { configurable: { thread_id: conversationId } };  // checkpointer keys history by thread_id
const result = await agent.invoke(
  { messages: [{ role: 'user', content: 'Spawn a quest near the village' }] },
  config,
);
// result.messages — full message list; final answer at .at(-1)
// with responseFormat: result.structuredResponse
```

### Streaming

```ts
const stream = await agent.stream(
  { messages: [{ role: 'user', content: '...' }] },
  { streamMode: 'values' },     // also: 'updates', 'messages' (token-level)
);
for await (const chunk of stream) {
  const latest = chunk.messages.at(-1);
  // forward latest.content to the HTTP response stream (see vercel doc)
}
```

### Context & middleware

- Per-run context: `agent.invoke(input, { configurable: { thread_id }, context: { user_id } })` with a `contextSchema` zod object on createAgent.
- Middleware stack (v1): `SummarizationMiddleware`, `MemoryMiddleware`, `SubAgentMiddleware`, `modelRetryMiddleware`, `toolRetryMiddleware`, `humanInTheLoopMiddleware`, `piiMiddleware`, etc.

## Gemini specifics

- Model string prefix is **`google-genai:`** (e.g. `google-genai:gemini-2.5-flash`, `google-genai:gemini-2.5-pro`). Uses `GOOGLE_API_KEY` automatically.
- Or pass an instance for full control:
  ```ts
  import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
  const llm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: 0.7, maxRetries: 2 });
  ```
- Gemini tool schemas must explicitly define all object fields (no unknown/loose properties); messages alternate human/AI; system prompt is merged into the first user turn by the provider layer.
- Tool calling, structured output, multimodal input are all supported on the 2.5 series.

## Chains (LCEL runnables) — for fixed pipelines, no tool loop

Use a chain when the flow is deterministic (prompt → model → parse), an agent when the model must decide which tools to call.

```ts
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You generate {artifact} for a game as terse JSON.'],
  ['human', '{input}'],
]);
const llm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash' });

const chain = prompt.pipe(llm).pipe(new StringOutputParser());   // .pipe() = JS equivalent of Python's |
const out = await chain.invoke({ artifact: 'quests', input: 'A fishing village' });

// streaming a chain:
for await (const chunk of await chain.stream({ artifact: 'quests', input: '...' })) { /* chunk is string */ }
```

- Composition helpers from `@langchain/core/runnables`: `RunnableSequence.from([prompt, llm, parser])`, `RunnableLambda`, `RunnablePassthrough`, `RunnableParallel` ({ a: chainA, b: chainB }).
- Structured output without an agent: `llm.withStructuredOutput(zodSchema)` → returns parsed object directly. Preferred over manually parsing JSON for schema-constrained generation.
- Batch: `chain.batch([inputs])`.

## Legacy APIs — do NOT use (pre-v1 hallucination traps)

- ❌ `initializeAgentExecutorWithOptions`, `AgentExecutor`, `ZeroShotAgent`
- ❌ `createReactAgent` from `@langchain/langgraph/prebuilt` as the primary path (superseded by `createAgent` from `langchain`)
- ❌ `LLMChain`, `ConversationChain`, `BufferMemory` — replaced by LCEL pipes + checkpointer/thread_id
- ❌ `new OpenAI()`-style text-completion classes — chat models only

## Gemini model lineup (exact IDs, verified 2026-06-06 against ai.google.dev/gemini-api/docs/models)

| Model ID | What it is | Use in this engine |
|---|---|---|
| `gemini-3.5-flash` | Gemini 3.5 Flash — stable, agentic/coding | default conversation + director agent |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro — strongest reasoning/coding (preview) | coder agent (systems/ + ui/) |
| `gemini-3-flash-preview` | Gemini 3 Flash — cost-efficient frontier (preview) | — |
| `gemini-3.1-flash-lite` | budget / low latency | cheap classification, review triage |
| `gemini-3.1-flash-image` | **Nano Banana 2** — image gen/edit, high volume | sprites/backgrounds/scenes |
| `gemini-3-pro-image` | **Nano Banana Pro** — contextual image gen | hero scenes needing context fidelity |
| `gemini-3.1-flash-live-preview` | native audio, real-time dialogue | voice layer (engine/tools/voice) |
| `gemini-3.1-flash-tts-preview` | low-latency TTS | voice output |
| `gemini-2.5-flash` / `gemini-2.5-flash-lite` / `gemini-2.5-pro` | stable previous gen | fallbacks |
| `gemini-2.5-flash-image` | Nano Banana (v1) | image-gen fallback |
| `gemini-embedding-001` / `gemini-embedding-2` | text / multimodal embeddings | asset/search indexing |
| `veo-3.1-generate-preview`, `veo-3.1-lite-generate-preview` | video gen | (future: cutscenes) |

> Preview IDs (`-preview`) churn — re-verify before shipping. LangChain model-string form: `google-genai:<model-id>`.

## ChatGoogleGenerativeAI constructor options (input API schema)

```ts
new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',     // REQUIRED — exact ID from the lineup table
  apiKey: process.env.GOOGLE_API_KEY,  // optional, read from env automatically
  temperature: 0.7,              // 0–2
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 8192,
  stopSequences: ['<END>'],
  maxRetries: 2,
  streaming: true,               // token streaming
  json: true,                    // force JSON responses (prefer withStructuredOutput instead)
  safetySettings: [{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                     threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }],  // from @google/generative-ai
  convertSystemMessageToHumanContent: true,  // legacy-model system-prompt compat
  thinkingConfig: { /* extended reasoning budget */ },
})
```

For **image generation** (Nano Banana models), pass response modalities via generation config on invoke:

```ts
const imageModel = new ChatGoogleGenerativeAI({ model: 'gemini-3.1-flash-image' });
const res = await imageModel.invoke(prompt, { responseModalities: ['TEXT', 'IMAGE'] } as any);
// image arrives as a content block: { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
// ⚠️ option plumbing differs across @langchain/google-genai versions — verify against the installed
//    v2.1.x typings before relying on it; fallback is calling @google/generative-ai directly.
```

## Input message schema (multimodal content blocks)

```ts
await llm.invoke([
  { role: 'system', content: 'You are…' },                 // merged into first turn by provider
  { role: 'user', content: [
    { type: 'text', text: 'Describe this sprite' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,…' } },  // or https URL
    // PDFs/docs: { type: 'application/pdf', data: '<base64>' }
  ]},
]);
```

Messages must alternate human/AI; Gemini tool schemas must define all object fields explicitly (no loose/unknown properties).

## Output schema (AIMessage shape)

```ts
{
  content: string | ContentBlock[],          // text, or blocks (incl. image_url for image models)
  tool_calls: [{ name, args, id, type: 'tool_call' }],
  usage_metadata: { input_tokens, output_tokens, total_tokens },
  response_metadata: { finishReason, safetyRatings, index },
}
```

With `llm.withStructuredOutput(zodSchema)` the return is the parsed object directly (no AIMessage unwrapping); with `createAgent`'s `responseFormat`, read `result.structuredResponse`.

## Sources
- https://docs.langchain.com/oss/javascript/langchain/agents (createAgent v1)
- https://reference.langchain.com/javascript/langchain-google-genai/ChatGoogleGenerativeAI (constructor options, message/output shapes)
- https://ai.google.dev/gemini-api/docs/models (model IDs)
- https://docs.langchain.com/oss/javascript/integrations/chat/google_generative_ai
- https://www.npmjs.com/package/@langchain/google-genai
- https://forum.langchain.com (google-genai: model-string usage)
