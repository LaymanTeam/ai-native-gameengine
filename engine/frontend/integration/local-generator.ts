'use client';

/**
 * In-app local GameSpec generator — keyword-themed, deterministic, NO API key, NO network.
 *
 * Lets the engine produce a playable spec entirely in-app (the game then runs via runtime.ts).
 * This is the key-free path; when the real Gemini/director pipeline produces specs, route through
 * it instead (or use this as the offline fallback, same as the engine's own local generator).
 */
import type { GameSpec, GameSpecEnemy } from './contracts';

interface Theme {
  key: string;
  match: string[];
  palette: GameSpec['palette'];
  enemyNames: [string, string, string];
  arena: string;
}

const THEMES: Theme[] = [
  {
    key: 'spooky', match: ['ghost', 'haunt', 'grave', 'vampire', 'witch', 'crypt', 'spirit', 'bone'],
    palette: { background: '#161320', player: '#cbb4e3', accent: '#8a6f8c', danger: '#b3445f', xp: '#e0c879' },
    enemyNames: ['Wisp', 'Revenant', 'Crypt Maw'], arena: 'Haunted Hall',
  },
  {
    key: 'space', match: ['space', 'alien', 'star', 'moon', 'planet', 'orbit', 'comet', 'void', 'cosmic'],
    palette: { background: '#0c1020', player: '#9ad7e6', accent: '#5f7c8a', danger: '#ff6f6f', xp: '#ffd479' },
    enemyNames: ['Drone', 'Asteroid Spirit', 'Star Leviathan'], arena: 'Moon Temple',
  },
  {
    key: 'food', match: ['bakery', 'pizza', 'kitchen', 'chef', 'food', 'pastr', 'cake', 'sugar', 'bread'],
    palette: { background: '#241a14', player: '#f3d9a8', accent: '#c2895a', danger: '#d65a3c', xp: '#ffe08a' },
    enemyNames: ['Macaron', 'Rolling Pin', 'Oven Horror'], arena: 'Enchanted Kitchen',
  },
  {
    key: 'coastal', match: ['coast', 'tide', 'ocean', 'sea', 'wave', 'harbor', 'beach', 'calm'],
    palette: { background: '#dfe3da', player: '#5f6b4d', accent: '#c2a77f', danger: '#8ea1ab', xp: '#cbb88f' },
    enemyNames: ['Tide Wisp', 'Drift Hound', 'Harbor Maw'], arena: 'Coastal Keep',
  },
];

const DEFAULT_THEME: Theme = {
  key: 'neon', match: [],
  palette: { background: '#0d0f14', player: '#f6fff8', accent: '#2ec4b6', danger: '#e71d36', xp: '#7bdff2' },
  enemyNames: ['Shard', 'Charger', 'Rift Brute'], arena: 'Neon Rift',
};

const ROLES: GameSpecEnemy['role'][] = ['shooter · ranged', 'charger · melee', 'boss'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateSpecLocal(prompt: string): GameSpec {
  const clean = prompt.trim() || 'neon rift survivor';
  const words = clean.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const theme = THEMES.find((t) => t.match.some((m) => words.some((w) => w.includes(m)))) ?? DEFAULT_THEME;
  const seed = hash(clean);
  const subject = titleCase(words.slice(0, 3).join(' ') || theme.arena);

  const enemies: GameSpecEnemy[] = theme.enemyNames.map((name, i) => ({
    name,
    role: ROLES[i] ?? 'charger · melee',
    color: [theme.palette.danger, theme.palette.accent, theme.palette.xp][i] ?? theme.palette.danger,
    hp: i === 2 ? 600 + (seed % 400) : 14 + i * 12 + (seed % 8),
    spd: i === 2 ? 1.0 : 1.6 + i * 0.6,
  }));

  return {
    title: subject,
    genre: 'survivor',
    theme: clean,
    palette: theme.palette,
    player: {
      maxHealth: 100 + (seed % 60),
      speed: 2.0 + ((seed >>> 3) % 12) / 10,
      projectiles: 1 + ((seed >>> 5) % 3),
      cooldownMs: 380 + ((seed >>> 7) % 320),
    },
    enemies,
    waves: 6 + (seed % 6),
  };
}
