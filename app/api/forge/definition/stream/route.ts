import { generateGameDefinition } from '@/engine/runtime/definition-generator';
import type { EngineEvent } from '@/engine/ai/events';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface DefinitionStreamRequestBody {
  prompt?: string;
  forceLocal?: boolean;
  produceAssets?: boolean;
}

const STREAM_ROUTE_LOG_PREFIX = '[api/forge/definition/stream]';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (!raw) return fallback;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return fallback;
}

export async function POST(req: Request): Promise<Response> {
  let body: DefinitionStreamRequestBody;
  try {
    body = (await req.json()) as DefinitionStreamRequestBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body?.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    return Response.json({ error: 'prompt (string) required' }, { status: 400 });
  }

  const prompt = body.prompt;
  const modelApiEnabled = envFlag('FORGE_MODEL_API_ENABLED', false);
  const forceLocal = body.forceLocal === true || !modelApiEnabled;
  const produceAssets = body.produceAssets === true && modelApiEnabled;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: EngineEvent): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        console.log(
          `${STREAM_ROUTE_LOG_PREFIX} start chars=${prompt.length} forceLocal=${forceLocal} produceAssets=${produceAssets}`,
        );
        emit({
          type: 'tool_start',
          name: 'generate_definition',
          detail: forceLocal ? 'local runtime definition' : 'model runtime definition',
        });
        const result = await generateGameDefinition({
          prompt,
          forceLocal,
          produceAssets,
          assetProduction: { emit },
        });
        emit({ type: 'tool_end', name: 'generate_definition', ok: true, detail: result.definition.title });
        emit({
          type: 'artifact',
          kind: 'forge-definition-result',
          title: result.definition.title,
          markdown: JSON.stringify(result),
        });
        emit({ type: 'done' });
        console.log(`${STREAM_ROUTE_LOG_PREFIX} done title="${result.definition.title}"`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'GameDefinition generation failed.';
        console.error(`${STREAM_ROUTE_LOG_PREFIX} error=${message}`);
        emit({ type: 'tool_end', name: 'generate_definition', ok: false, detail: message.slice(0, 160) });
        emit({ type: 'error', message });
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
