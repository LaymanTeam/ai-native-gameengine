export const runtime = 'nodejs';
export const maxDuration = 120;

const DEFAULT_FORGE_API_BASE = 'https://prompt-roguelite-forge.vercel.app';

function forgeApiBase() {
  return (process.env['FORGE_API_BASE'] || DEFAULT_FORGE_API_BASE).replace(/\/$/, '');
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const upstream = await fetch(`${forgeApiBase()}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await upstream.json();
    const slug = payload?.artifact?.slug || body?.slug;
    return Response.json(
      {
        ...payload,
        forgeApiBase: forgeApiBase(),
        playerUrl: slug ? `${forgeApiBase()}/?play=1&game=${encodeURIComponent(slug)}` : undefined,
      },
      { status: upstream.status },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Forge game storage proxy failed.' },
      { status: 500 },
    );
  }
}
