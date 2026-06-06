/**
 * Director conversation route: frontend chat → director agent (LangChain createAgent + Gemini)
 * → SSE event stream back (tokens, tool progress, generated images).
 * Node runtime is REQUIRED for LangChain on Vercel (research/vercel-langchain-gemini.md).
 *
 * Conversation state lives SERVER-SIDE in the director's checkpointer, keyed by thread_id —
 * the client sends only the new user message + its threadId.
 */
import { isAIMessageChunk } from '@langchain/core/messages';
import { createDirectorAgent, directorThreadConfig } from '../../../engine/ai/agents/director';
import { hasPendingDesign, localBuildTurn, localDesignTurn, type EngineEvent } from '../../../engine/ai/tool-definitions';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ROUTE_LOG_PREFIX = '[api/chat]';

interface ChatRequestBody {
  message?: string;
  threadId?: string;
}

export async function POST(req: Request): Promise<Response> {
  // No Clerk gate here: the engine UI is open; Clerk is tooling for generated games.
  let message: string;
  let threadId: string;
  try {
    const body = (await req.json()) as ChatRequestBody;
    if (!body?.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
      console.error(`${ROUTE_LOG_PREFIX} bad request: missing message`);
      return Response.json({ error: 'message (string) required' }, { status: 400 });
    }
    if (!body.threadId || typeof body.threadId !== 'string') {
      console.error(`${ROUTE_LOG_PREFIX} bad request: missing threadId`);
      return Response.json({ error: 'threadId (string) required' }, { status: 400 });
    }
    message = body.message;
    threadId = body.threadId;
  } catch (error) {
    console.error(`${ROUTE_LOG_PREFIX} bad request: unparseable JSON`, error);
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  console.log(`${ROUTE_LOG_PREFIX} request thread=${threadId} chars=${message.length}`);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: EngineEvent): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      let tokens = 0;
      try {
        // Keyless dev path: without GOOGLE_API_KEY the Gemini director can't run, so run the
        // design phase locally so the engine still produces a real artifact (the GDD).
        if (!process.env['GOOGLE_API_KEY']) {
          const wantsBuild = /^\s*(build|go|yes|make it|play|approve|ship|generate)\b/i.test(message);
          console.log(`${ROUTE_LOG_PREFIX} no GOOGLE_API_KEY — keyless ${wantsBuild && hasPendingDesign() ? 'build' : 'design'} turn`);
          const summary = wantsBuild && hasPendingDesign()
            ? await localBuildTurn(emit)
            : await localDesignTurn(emit, message);
          for (const word of summary.split(/(\s+)/)) emit({ type: 'token', text: word });
          emit({ type: 'done' });
          return; // the `finally` closes the controller (avoid double-close)
        }
        const agent = createDirectorAgent(emit);
        // streamMode 'messages' yields [messageChunk, metadata] tuples token-by-token,
        // including tool-phase chunks (research/langchain-agents-chains-gemini.md).
        const agentStream = await agent.stream(
          { messages: [{ role: 'user' as const, content: message }] },
          { ...directorThreadConfig(threadId), streamMode: 'messages' },
        );
        for await (const tuple of agentStream) {
          const [chunk] = Array.isArray(tuple) ? tuple : [tuple];
          if (!isAIMessageChunk(chunk as never)) continue; // tool messages reach the client via emit()
          const aiChunk = chunk as { content: unknown };
          const text =
            typeof aiChunk.content === 'string'
              ? aiChunk.content
              : Array.isArray(aiChunk.content)
                ? aiChunk.content
                    .map((block) =>
                      typeof block === 'string'
                        ? block
                        : block && typeof block === 'object' && 'text' in block
                          ? String((block as { text: unknown }).text ?? '')
                          : '',
                    )
                    .join('')
                : '';
          if (text) {
            tokens += 1;
            emit({ type: 'token', text });
          }
        }
        emit({ type: 'done' });
        console.log(`${ROUTE_LOG_PREFIX} stream complete thread=${threadId} tokenChunks=${tokens}`);
      } catch (error) {
        console.error(`${ROUTE_LOG_PREFIX} stream error thread=${threadId} after tokenChunks=${tokens}`, error);
        emit({ type: 'error', message: 'The engine hit an error mid-response. Please retry.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
