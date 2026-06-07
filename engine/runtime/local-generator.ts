/**
 * Local, model-free GameDefinition generator — the keyless path for the Phaser runtime.
 * Produces a valid, themed GameDefinition from a prompt so the engine can generate & play a real
 * game with no API key. The director/coder produces richer definitions when a key is present.
 */
import { gameDefinitionSchema, type GameDefinition } from './game-definition';

interface Theme {
  match: string[];
  palette: GameDefinition['palette'];
  enemies: [string, string, string];
  boss: string;
  tile: string;
}

const THEMES: Theme[] = [
  {
    match: ['ghost', 'haunt', 'grave', 'vampire', 'witch', 'crypt', 'spirit', 'bone', 'spooky'],
    palette: { background: '#161320', floor: '#211c2e', accent: '#8a6f8c', player: '#cbb4e3', projectile: '#e0c879', danger: '#b3445f', xp: '#7bdff2' },
    enemies: ['Wisp', 'Revenant', 'Crypt Hound'], boss: 'Crypt Maw', tile: '#211c2e',
  },
  {
    match: ['space', 'alien', 'star', 'moon', 'planet', 'orbit', 'comet', 'void', 'cosmic', 'neon', 'cyber'],
    palette: { background: '#0c1020', floor: '#141a2e', accent: '#46e3d0', player: '#9ad7e6', projectile: '#ffd479', danger: '#ff6f6f', xp: '#7bdff2' },
    enemies: ['Drone', 'Ion Wisp', 'Star Reaver'], boss: 'Void Leviathan', tile: '#141a2e',
  },
  {
    match: ['bakery', 'pizza', 'kitchen', 'chef', 'food', 'pastr', 'cake', 'sugar', 'bread', 'cozy'],
    palette: { background: '#241a14', floor: '#2e221a', accent: '#c2895a', player: '#f3d9a8', projectile: '#ffe08a', danger: '#d65a3c', xp: '#ffd479' },
    enemies: ['Macaron', 'Rolling Pin', 'Proofling'], boss: 'Oven Horror', tile: '#2e221a',
  },
  {
    match: ['coast', 'tide', 'ocean', 'sea', 'wave', 'harbor', 'beach', 'forest', 'meadow'],
    palette: { background: '#dfe3da', floor: '#d5dac9', accent: '#7e8b6d', player: '#5f6b4d', projectile: '#3a3a33', danger: '#b85c5c', xp: '#c2a77f' },
    enemies: ['Tide Wisp', 'Drift Hound', 'Reef Charger'], boss: 'Harbor Maw', tile: '#d5dac9',
  },
];

const DEFAULT_THEME: Theme = {
  match: [],
  palette: { background: '#0d0f14', floor: '#161922', accent: '#c4e070', player: '#f6fff8', projectile: '#c4e070', danger: '#e71d36', xp: '#7bdff2' },
  enemies: ['Shard', 'Charger', 'Brute'], boss: 'Rift Warden', tile: '#161922',
};

const ROLES = ['chaser', 'shooter', 'charger'] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function titleCase(s: string): string { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }
function kebab(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'; }

export function buildLocalGameDefinition(prompt: string): GameDefinition {
  const clean = prompt.trim() || 'neon rift survivor';
  const words = clean.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const theme = THEMES.find((t) => t.match.some((m) => words.some((w) => w.includes(m)))) ?? DEFAULT_THEME;
  const seed = hash(clean);
  const title = titleCase(words.slice(0, 4).join(' ')) || 'Neon Rift';

  const enemies = theme.enemies.map((name, i) => ({
    id: `enemy-${kebab(name)}`,
    name,
    spriteKey: `enemy-${i}`,
    role: ROLES[i] ?? 'chaser',
    health: 14 + i * 10 + (seed % 8),
    speed: 70 + i * 18,
    damage: 6 + i * 2,
    radius: 12 + i * 2,
    xp: 3 + i * 2,
    score: 10 + i * 5,
  }));

  const boss = {
    id: 'boss',
    name: theme.boss,
    spriteKey: 'boss',
    role: 'brute' as const,
    health: 600 + (seed % 400),
    speed: 45,
    damage: 18,
    radius: 34,
    xp: 50,
    score: 500,
    spawnAtSeconds: 75,
    patterns: ['radial-burst', 'spiral-shot'] as ('spiral-shot' | 'radial-burst' | 'charge' | 'summon' | 'beam')[],
  };

  const assets = [
    { key: 'player', kind: 'sprite' as const, prompt: `${title} hero, top-down`, width: 32, height: 32 },
    ...enemies.map((e, i) => ({ key: `enemy-${i}`, kind: 'sprite' as const, prompt: `${e.name}, ${theme.enemies[i]} enemy, top-down`, width: 28, height: 28 })),
    { key: 'boss', kind: 'sprite' as const, prompt: `${theme.boss} boss, top-down, large`, width: 72, height: 72 },
  ];

  const def: GameDefinition = {
    schemaVersion: 1,
    title,
    genre: 'survivor',
    theme: clean,
    palette: theme.palette,
    assets,
    player: {
      spriteKey: 'player',
      maxHealth: 100 + (seed % 60),
      speed: 200,
      radius: 14,
      weapons: [{
        id: 'primary',
        name: 'Auto Bolt',
        damage: 10,
        cooldownMs: 360 + ((seed >>> 5) % 240),
        projectileSpeed: 460,
        projectiles: 1 + ((seed >>> 7) % 3),
        spread: 0.18,
        pierce: 0,
      }],
    },
    enemies,
    boss,
    waves: [
      { atSeconds: 1, enemyId: enemies[0]!.id, count: 6, everyMs: 900 },
      { atSeconds: 15, enemyId: enemies[1]!.id, count: 8, everyMs: 800 },
      { atSeconds: 35, enemyId: enemies[2]!.id, count: 10, everyMs: 700 },
      { atSeconds: 55, enemyId: enemies[0]!.id, count: 14, everyMs: 500 },
    ],
    upgrades: [
      { id: 'up-damage', name: 'Sharper Bolts', kind: 'damage', amount: 5 },
      { id: 'up-cooldown', name: 'Rapid Fire', kind: 'cooldown', amount: 60 },
      { id: 'up-speed', name: 'Swift Boots', kind: 'speed', amount: 30 },
      { id: 'up-projectiles', name: 'Split Shot', kind: 'projectiles', amount: 1 },
    ],
    arena: { name: `${titleCase(words.slice(0, 2).join(' ') || 'Rift')} Arena`, width: 1280, height: 720, durationSeconds: 90, tileKey: 'floor' },
    controls: ['move (WASD/arrows)', 'auto-fire', 'pick upgrade on level up'],
    winCondition: 'defeat-boss',
    loseCondition: 'health-zero',
  };

  return gameDefinitionSchema.parse(def);
}
