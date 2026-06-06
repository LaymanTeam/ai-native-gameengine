/**
 * Serves a generated game's single-file build (generations/<slug>/game.html) so the Studio can
 * embed/play it. Read-only; slug is sanitized to a single path segment.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const safe = slug.replace(/[^a-z0-9-]/gi, '');
  if (!safe) return new Response('Not found', { status: 404 });
  try {
    const file = path.join(process.cwd(), 'generations', safe, 'game.html');
    const html = await fs.readFile(file, 'utf8');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('Game build not found', { status: 404 });
  }
}
