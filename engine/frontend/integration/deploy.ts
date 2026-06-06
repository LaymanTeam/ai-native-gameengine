'use client';

/**
 * Play/deploy seam — where a generated game is opened.
 *
 * If the game has a deployedUrl (set by engine/compiler/vercel-deploy.ts) we open that; otherwise
 * we fall back to the in-app /play/<id> route, which mounts the runtime adapter (placeholder now,
 * PixiJS once engine/renderer/pixi-js ships). Either way the UI calls openGame() and nothing else.
 */
import type { GameSummary } from './contracts';

export function gamePlayUrl(game: GameSummary): string {
  return game.deployedUrl ?? `/play/${game.id}`;
}

export function openGame(game: GameSummary): void {
  const url = gamePlayUrl(game);
  const w = 980;
  const h = 660;
  const left = (window.screen.width - w) / 2;
  const top = (window.screen.height - h) / 2;
  window.open(url, `play_${game.id}`, `width=${w},height=${h},left=${left},top=${top}`);
}
