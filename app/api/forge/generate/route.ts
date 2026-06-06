export const runtime = 'nodejs';
export const maxDuration = 120;

const DEFAULT_FORGE_API_BASE = 'https://prompt-roguelite-forge.vercel.app';

function forgeApiBase() {
  return (process.env['FORGE_API_BASE'] || DEFAULT_FORGE_API_BASE).replace(/\/$/, '');
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const upstream = await fetch(`${forgeApiBase()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Forge generation proxy failed.' },
      { status: 500 },
    );
  }
}
