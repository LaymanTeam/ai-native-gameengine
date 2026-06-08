import { createStandaloneForgeProject } from '@/engine/runtime/standalone-publisher';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface DeployForgeBody {
  prompt?: string;
  definition?: unknown;
  slug?: string;
  deploy?: boolean;
  target?: 'production' | 'staging' | 'preview';
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as DeployForgeBody;
    if (!body.definition) {
      return Response.json({ ok: false, error: 'definition required' }, { status: 400 });
    }
    const result = await createStandaloneForgeProject({
      definition: body.definition,
      prompt: body.prompt,
      slug: body.slug,
      deploy: body.deploy === true,
      target: body.target,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Forge deploy preparation failed.' },
      { status: 500 },
    );
  }
}
