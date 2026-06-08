import { generateGameDefinition } from '@/engine/runtime/definition-generator';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface DefinitionRequestBody {
  prompt?: string;
  forceLocal?: boolean;
  produceAssets?: boolean;
}

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (!raw) return fallback;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return fallback;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as DefinitionRequestBody;
    if (!body?.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      return Response.json({ error: 'prompt (string) required' }, { status: 400 });
    }
    const modelApiEnabled = envFlag('FORGE_MODEL_API_ENABLED', false);
    const result = await generateGameDefinition({
      prompt: body.prompt,
      forceLocal: body.forceLocal === true || !modelApiEnabled,
      produceAssets: body.produceAssets === true && modelApiEnabled,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'GameDefinition generation failed.' },
      { status: 500 },
    );
  }
}
