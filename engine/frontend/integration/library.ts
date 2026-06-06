/**
 * Library data seam — the list of generated games.
 *
 * Returns mock data today. When the engine exposes a real source (a content store under
 * engine/storage, or a Vercel deployments API), replace the body of `listGames` with that call.
 * It's already async so the swap is a one-liner and callers don't change.
 */
import type { GameSummary } from './contracts';

export const MOCK_GAMES: GameSummary[] = [
  { id: 'coastal', title: 'Coastal Run', genre: 'survivor · top-down', version: 'v4', score: 94, palette: { field: '#e7e4db', player: '#5f6b4d', enemies: ['#c2a77f', '#8ea1ab', '#b89aa0'] } },
  { id: 'tide', title: 'Tide Keeper', genre: 'dodger · top-down', version: 'v3', score: 88, palette: { field: '#e2e7ea', player: '#4a6470', enemies: ['#9aa7b0', '#cdb89a', '#a9b59c'] } },
  { id: 'ember', title: 'Ember Drift', genre: 'shooter · arena', version: 'v2', score: 84, palette: { field: '#e6e2ea', player: '#6b5570', enemies: ['#b29bb6', '#9aa7b0', '#c2a77f'] } },
  { id: 'rust', title: 'Rust Harvest', genre: 'survivor · top-down', version: 'v2', score: 81, palette: { field: '#ece2d6', player: '#9a5e46', enemies: ['#c98e6e', '#a7a382', '#bf9a8a'] } },
  { id: 'glass', title: 'Glasswing', genre: 'puzzle · grid', version: 'v1', score: 79, palette: { field: '#eef1f3', player: '#5f7c8a', enemies: ['#9aa7b0', '#cdb89a', '#a9b59c'] } },
  { id: 'bakery', title: 'Bakery Brawl', genre: 'collector · arena', version: 'v1', score: 76, palette: { field: '#f0e7da', player: '#a0744a', enemies: ['#cda06a', '#b0a07a', '#c89a86'] } },
];

export async function listGames(): Promise<GameSummary[]> {
  // SEAM: swap for the real source, e.g.
  //   const { listGames } = await import('@/engine/storage/rx-db');
  //   return listGames();
  return MOCK_GAMES;
}

export function findGame(id: string): GameSummary | undefined {
  return MOCK_GAMES.find((g) => g.id === id);
}
