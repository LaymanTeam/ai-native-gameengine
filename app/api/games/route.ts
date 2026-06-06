/**
 * Lists generated games — every generations/<slug>/ that has a built game.html, with its title
 * and genre from config/gdd.json. Powers the Library. Read-only.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GameListItem {
  slug: string;
  title: string;
  genre: string;
  mtime: number;
}

export async function GET(): Promise<Response> {
  const root = path.join(process.cwd(), 'generations');
  const games: GameListItem[] = [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      try {
        const stat = await fs.stat(path.join(dir, 'game.html'));
        let title = entry.name;
        let genre = '';
        try {
          const gdd = JSON.parse(await fs.readFile(path.join(dir, 'config', 'gdd.json'), 'utf8')) as { title?: string; genre?: string };
          title = gdd.title ?? title;
          genre = gdd.genre ?? '';
        } catch { /* no gdd.json — keep slug as title */ }
        games.push({ slug: entry.name, title, genre, mtime: stat.mtimeMs });
      } catch { /* no game.html — not a playable game */ }
    }
  } catch { /* no generations dir yet */ }
  games.sort((a, b) => b.mtime - a.mtime);
  return Response.json({ games });
}
