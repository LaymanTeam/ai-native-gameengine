/**
 * Local, model-free GameDefinition generator - the keyless path for the Forge runtime.
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
    match: ['laser-grid', 'grid', 'lattice', 'scanner', 'security', 'crossfire', 'tripwire', 'firewall', 'lockdown'],
    palette: { background: '#101217', floor: '#171a20', accent: '#f5c542', player: '#dff7ff', projectile: '#6be8ff', danger: '#ff3b78', xp: '#dcff63' },
    enemies: ['Grid Drone', 'Lockstep Seer', 'Firewall Warden'], boss: 'Lattice Overlord', tile: '#171a20',
  },
  {
    match: ['air', 'airplane', 'plane', 'jet', 'flight', 'sky', 'cloud', 'storm', 'zeppelin', 'dogfight', 'pilot', 'fighter'],
    palette: { background: '#0b1326', floor: '#12203a', accent: '#65d6ff', player: '#f8fbff', projectile: '#ffd166', danger: '#ff5f7a', xp: '#9dffcb' },
    enemies: ['Storm Fighter', 'Cloud Skimmer', 'Ace Interceptor'], boss: 'Storm Zeppelin', tile: '#12203a',
  },
  {
    match: ['platform', 'platformer', 'jump', 'jumper', 'ledge', 'castle', 'cave', 'ruin', 'temple', 'sideview', 'sidescroller'],
    palette: { background: '#171717', floor: '#25352a', accent: '#8bcf7a', player: '#f5f1d8', projectile: '#ffcf5a', danger: '#d95d4f', xp: '#82d8ff' },
    enemies: ['Ledge Imp', 'Moss Bat', 'Clockwork Guard'], boss: 'Clockwork Colossus', tile: '#25352a',
  },
  {
    match: ['puzzle', 'maze', 'mirror', 'switch', 'block', 'blocks', 'prism', 'crystal', 'archive', 'archivist'],
    palette: { background: '#101827', floor: '#172235', accent: '#7dd3fc', player: '#f8fafc', projectile: '#facc15', danger: '#fb7185', xp: '#c4b5fd' },
    enemies: ['Mirror Sentry', 'Prism Wisp', 'Lock Golem'], boss: 'Moon Gate', tile: '#172235',
  },
  {
    match: ['agent', 'agents', 'ops', 'operation', 'operations', 'queue', 'approval', 'approvals', 'deploy', 'deployment', 'vercel', 'mcp', 'cli', 'dashboard'],
    palette: { background: '#0f1720', floor: '#142033', accent: '#38bdf8', player: '#e2f7ff', projectile: '#22c55e', danger: '#f97316', xp: '#fde68a' },
    enemies: ['Backlog Spike', 'Quota Drift', 'Deploy Risk'], boss: 'Release Gate', tile: '#142033',
  },
  {
    match: ['space', 'alien', 'star', 'moon', 'planet', 'orbit', 'comet', 'void', 'cosmic', 'neon', 'cyber'],
    palette: { background: '#0c1020', floor: '#141a2e', accent: '#46e3d0', player: '#9ad7e6', projectile: '#ffd479', danger: '#ff6f6f', xp: '#7bdff2' },
    enemies: ['Drone', 'Ion Wisp', 'Star Reaver'], boss: 'Void Leviathan', tile: '#141a2e',
  },
  {
    match: ['bakery', 'pizza', 'kitchen', 'chef', 'food', 'pastr', 'cake', 'sugar', 'bread'],
    palette: { background: '#241a14', floor: '#2e221a', accent: '#c2895a', player: '#f3d9a8', projectile: '#ffe08a', danger: '#d65a3c', xp: '#ffd479' },
    enemies: ['Crumb Skitter', 'Burnt Macaron', 'Rolling Pan'], boss: 'Overproofed King', tile: '#2e221a',
  },
  {
    match: ['shockwave', 'shock', 'seismic', 'quake', 'earthquake', 'tremor', 'sonic', 'stomp', 'slam', 'basalt', 'fault'],
    palette: { background: '#121516', floor: '#25231f', accent: '#d8b84e', player: '#f4e8b0', projectile: '#72d6c4', danger: '#f05a3c', xp: '#f2d15c' },
    enemies: ['Fault Imp', 'Basalt Roller', 'Echo Seer'], boss: 'Fault Titan', tile: '#25231f',
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

type WinCondition = GameDefinition['winCondition'];
type RuntimeTemplate = GameDefinition['runtimeTemplate'];
type BossPattern = NonNullable<GameDefinition['boss']>['patterns'][number];
type PlayStyle = GameDefinition['playStyle'];
type FeelProfile = GameDefinition['feelProfile'];
type EnemyRole = GameDefinition['enemies'][number]['role'];
type WaveDefinition = GameDefinition['waves'][number];
type SpriteSheetAnimation = NonNullable<NonNullable<GameDefinition['assets'][number]['spriteSheet']>['animations']>[number];

const DEFAULT_ACTOR_SHEET_ANIMATIONS: SpriteSheetAnimation[] = [
  { name: 'idle', frames: [0, 1], frameMs: 240 },
  { name: 'move', frames: [2, 3, 4, 3], frameMs: 110 },
  { name: 'attack', frames: [5, 6, 5], frameMs: 88 },
  { name: 'fire', frames: [5, 6], frameMs: 82 },
  { name: 'dash', frames: [4, 5, 6], frameMs: 70 },
  { name: 'hurt', frames: [7, 0], frameMs: 120 },
  { name: 'telegraph', frames: [5, 6, 7, 6], frameMs: 96 },
  { name: 'execute', frames: [6, 7, 6], frameMs: 76 },
  { name: 'contested', frames: [7, 6], frameMs: 115 },
  { name: 'boss-idle', frames: [0, 1, 2, 1], frameMs: 210 },
  { name: 'boss-telegraph', frames: [5, 6, 7, 6], frameMs: 92 },
  { name: 'boss-execute', frames: [6, 7, 6], frameMs: 72 },
  { name: 'escort-move', frames: [2, 3, 4, 3], frameMs: 130 },
  { name: 'escort-contested', frames: [7, 6, 7], frameMs: 110 },
  { name: 'defend-idle', frames: [0, 1, 2, 1], frameMs: 190 },
  { name: 'defend-contested', frames: [5, 6, 7, 6], frameMs: 105 },
];

const PROFILE_ROLE_KITS: Record<FeelProfile, readonly [EnemyRole, EnemyRole, EnemyRole]> = {
  'arcade-survivor': ['chaser', 'sapper', 'shooter'],
  'bullet-hell-raid': ['shooter', 'orbiter', 'sniper'],
  'siege-defense': ['brute', 'guardian', 'support'],
  'cozy-explorer': ['wanderer', 'chaser', 'orbiter'],
  'score-chaser': ['charger', 'sentinel', 'sniper'],
};

const ROLE_STATS: Record<EnemyRole, {
  health: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  score: number;
}> = {
  chaser: { health: 1, speed: 1, damage: 1, radius: 1, xp: 1, score: 1 },
  shooter: { health: 0.9, speed: 0.9, damage: 0.95, radius: 0.95, xp: 1.1, score: 1.1 },
  sniper: { health: 0.82, speed: 0.72, damage: 1.28, radius: 0.92, xp: 1.35, score: 1.4 },
  sapper: { health: 0.96, speed: 0.86, damage: 1.08, radius: 0.98, xp: 1.28, score: 1.3 },
  support: { health: 1.05, speed: 0.84, damage: 0.74, radius: 0.98, xp: 1.45, score: 1.42 },
  guardian: { health: 1.22, speed: 0.78, damage: 0.86, radius: 1.08, xp: 1.5, score: 1.48 },
  sentinel: { health: 1.08, speed: 0.66, damage: 1.05, radius: 1.02, xp: 1.32, score: 1.55 },
  charger: { health: 1.08, speed: 1.16, damage: 1.12, radius: 1.05, xp: 1.1, score: 1.15 },
  orbiter: { health: 0.95, speed: 1.08, damage: 0.9, radius: 0.95, xp: 1.2, score: 1.2 },
  wanderer: { health: 0.78, speed: 0.78, damage: 0.75, radius: 0.9, xp: 1.2, score: 1.15 },
  brute: { health: 1.55, speed: 0.68, damage: 1.25, radius: 1.22, xp: 1.5, score: 1.55 },
};

const PROFILE_ENEMY_STATS: Record<FeelProfile, {
  health: number;
  speed: number;
  damage: number;
  xp: number;
  score: number;
}> = {
  'arcade-survivor': { health: 1, speed: 1, damage: 1, xp: 1, score: 1 },
  'bullet-hell-raid': { health: 0.95, speed: 1.08, damage: 1, xp: 1.1, score: 1.15 },
  'siege-defense': { health: 1.25, speed: 0.92, damage: 1.08, xp: 1.05, score: 1.05 },
  'cozy-explorer': { health: 0.78, speed: 0.82, damage: 0.72, xp: 1.15, score: 0.95 },
  'score-chaser': { health: 0.88, speed: 1.12, damage: 0.92, xp: 1.25, score: 1.55 },
};

function spriteSheetAsset(key: string, prompt: string, frameWidth: number, frameHeight = frameWidth) {
  const frames = 8;
  return {
    key,
    kind: 'sprite' as const,
    prompt,
    width: frameWidth * frames,
    height: frameHeight,
    spriteSheet: { frameWidth, frameHeight, frames, animations: DEFAULT_ACTOR_SHEET_ANIMATIONS },
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function titleCase(s: string): string { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }
function kebab(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'; }
function matchesThemeWord(word: string, matcher: string): boolean { return word === matcher || word.startsWith(matcher); }

function selectWinCondition(words: string[], seed: number): WinCondition {
  const has = (...needles: string[]) => needles.some((needle) => words.some((word) => word === needle || word.startsWith(needle)));
  if (has('boss', 'raid', 'leviathan', 'horror', 'warden', 'maw')) return 'defeat-boss';
  if (has('rescue', 'stranded', 'downed', 'medic', 'recover', 'save')) return 'rescue';
  if (has('defend', 'base', 'core', 'generator', 'reactor', 'shrine', 'outpost', 'ward', 'keep', 'sanctum', 'fortress')) return 'defend-core';
  if (has('escort', 'protect', 'convoy', 'caravan', 'guide', 'deliver', 'pilgrim', 'companion')) return 'escort';
  if (has('unlock', 'key', 'keys', 'keycard', 'lock', 'door', 'vault', 'terminal', 'access')) return 'unlock-gate';
  if (has('repair', 'fix', 'uplink', 'node', 'tower', 'beacon', 'console', 'circuit', 'signal', 'network', 'hack')) return 'repair-nodes';
  if (has('extract', 'extraction', 'escape', 'evac', 'evacuate', 'portal', 'gate', 'exit', 'exfil')) return 'extract';
  if (has('capture', 'zone', 'altar', 'ritual', 'control', 'claim', 'hack', 'sigil')) return 'capture-zone';
  if (has('collect', 'relic', 'artifact', 'treasure', 'crystal', 'shard')) return 'collect-relics';
  if (has('score', 'points', 'arcade', 'challenge')) return 'score-target';
  if (has('survive', 'survivor', 'endure', 'hold', 'gather', 'light', 'cozy')) return 'survive';
  if (has('clear', 'wave', 'roguelite', 'dungeon', 'arena')) return 'clear-waves';
  return (['defeat-boss', 'survive', 'clear-waves', 'score-target', 'collect-relics', 'capture-zone', 'escort', 'defend-core', 'repair-nodes', 'extract', 'rescue', 'unlock-gate'] as const)[seed % 12]!;
}

function selectRuntimeTemplate(words: string[]): RuntimeTemplate {
  const has = (...needles: string[]) => needles.some((needle) => words.some((word) => word === needle || word.startsWith(needle)));
  if (has('decision', 'decisions', 'boardroom', 'strategy', 'strategic', 'stakeholder', 'stakeholders', 'evidence', 'recommendation', 'recommend', 'audit', 'option', 'options', 'launch', 'roadmap')) {
    return 'decision-room';
  }
  if (has('agent', 'agents', 'ops', 'operation', 'operations', 'queue', 'approval', 'approvals', 'deploy', 'deployment', 'vercel', 'mcp', 'cli', 'dashboard')) {
    return 'agent-dashboard';
  }
  if (has('puzzle', 'maze', 'mirror', 'switch', 'block', 'blocks', 'sokoban', 'logic')) {
    return 'puzzle-room';
  }
  if (has('flight', 'air', 'airplane', 'plane', 'jet', 'sky', 'cloud', 'zeppelin', 'dogfight', 'pilot', 'fighter')) {
    return 'flight-shooter';
  }
  if (
    has('platform', 'platformer', 'jump', 'jumper', 'ledge', 'castle', 'cave', 'ruin', 'temple', 'sideview', 'sidescroller') ||
    (words.includes('side') && words.some((word) => word === 'scrolling' || word === 'scroller' || word === 'view'))
  ) {
    return 'platformer';
  }
  return 'arena-action';
}

function selectBossPatterns(words: string[], seed: number): BossPattern[] {
  const has = (...needles: string[]) => needles.some((needle) => words.some((word) => word === needle || word.startsWith(needle)));
  const unique = (patterns: BossPattern[]): BossPattern[] => [...new Set(patterns)];

  if (has('laser-grid', 'grid', 'lattice', 'scanner', 'security', 'crossfire', 'tripwire')) return ['laser-grid', 'beam', 'radial-burst'];
  if (has('shockwave', 'shock', 'pulse', 'quake', 'seismic', 'sonic', 'ring', 'stomp', 'slam')) return ['shockwave', 'radial-burst', 'charge'];
  if (has('vortex', 'gravity', 'singularity', 'blackhole', 'rift', 'maelstrom')) return ['vortex', 'spiral-shot', 'beam'];
  if (has('mine', 'minefield', 'trap', 'bomb', 'hazard', 'meteor')) return ['minefield', 'radial-burst', 'charge'];
  if (has('beam', 'laser', 'ray', 'lance', 'cannon', 'rail')) return ['beam', 'spiral-shot', 'radial-burst'];
  if (has('charge', 'charging', 'rush', 'ram', 'bull', 'beast', 'hound')) return ['charge', 'radial-burst', 'spiral-shot'];
  if (has('summon', 'summoner', 'swarm', 'hive', 'portal', 'necromancer', 'minion')) return ['summon', 'radial-burst', 'spiral-shot'];
  if (has('space', 'cosmic', 'orbit', 'spiral', 'star', 'void', 'neon', 'cyber')) return ['spiral-shot', 'beam', 'radial-burst'];
  if (has('haunt', 'ghost', 'crypt', 'spirit', 'witch', 'horror')) return ['summon', 'radial-burst', 'beam'];

  const kits: BossPattern[][] = [
    ['radial-burst', 'spiral-shot', 'charge'],
    ['spiral-shot', 'beam', 'radial-burst'],
    ['charge', 'summon', 'radial-burst'],
    ['summon', 'beam', 'spiral-shot'],
    ['minefield', 'radial-burst', 'spiral-shot'],
    ['vortex', 'spiral-shot', 'radial-burst'],
    ['shockwave', 'radial-burst', 'charge'],
    ['laser-grid', 'beam', 'spiral-shot'],
  ];
  return unique(kits[seed % kits.length] ?? kits[0]!);
}

function selectFeelProfile(words: string[], winCondition: WinCondition, seed: number): FeelProfile {
  const has = (...needles: string[]) => needles.some((needle) => words.some((word) => word === needle || word.startsWith(needle)));
  if (winCondition === 'select-decision') return 'cozy-explorer';
  if (winCondition === 'approve-deploy') return 'siege-defense';
  if (winCondition === 'solve-puzzle') return 'cozy-explorer';
  if (winCondition === 'unlock-gate') return 'score-chaser';
  if (winCondition === 'defend-core' || winCondition === 'repair-nodes' || winCondition === 'extract' || winCondition === 'rescue') return 'siege-defense';
  if (has('boss', 'raid', 'beam', 'laser', 'grid', 'lattice', 'scanner', 'charge', 'summon', 'swarm', 'horde', 'bullet', 'hell')) return 'bullet-hell-raid';
  if (winCondition === 'score-target' || has('score', 'arcade', 'combo', 'points', 'challenge')) return 'score-chaser';
  if (winCondition === 'collect-relics' || winCondition === 'escort' || has('cozy', 'meadow', 'garden', 'gather', 'coast', 'light')) return 'cozy-explorer';
  return seed % 6 === 0 ? 'score-chaser' : 'arcade-survivor';
}

function selectPlayStyle(words: string[], winCondition: WinCondition, feelProfile: FeelProfile, seed: number): PlayStyle {
  const has = (...needles: string[]) => needles.some((needle) => words.some((word) => word === needle || word.startsWith(needle)));
  const pressure: PlayStyle['pressure'] = feelProfile === 'cozy-explorer' || has('cozy', 'gather', 'meadow', 'garden', 'gentle')
    ? 'relaxed'
    : feelProfile === 'siege-defense' || winCondition === 'defend-core' || winCondition === 'repair-nodes' || winCondition === 'extract' || winCondition === 'rescue'
      ? 'siege'
      : feelProfile === 'bullet-hell-raid' || has('bullet', 'hell', 'swarm', 'horde', 'onslaught', 'chaos', 'raid')
        ? 'intense'
        : (seed % 5 === 0 ? 'intense' : 'standard');
  const weaponCadence: PlayStyle['weaponCadence'] = feelProfile === 'bullet-hell-raid' || has('bullet', 'hell', 'swarm', 'horde', 'neon', 'arcade')
    ? 'bullet-hell'
    : has('sniper', 'heavy', 'cannon', 'blade', 'deliberate')
      ? 'deliberate'
      : pressure === 'intense'
        ? 'rapid'
        : 'steady';
  const camera: PlayStyle['camera'] = feelProfile === 'bullet-hell-raid' || has('boss', 'raid', 'charge', 'impact', 'horror')
    ? 'dramatic'
    : pressure === 'relaxed'
      ? 'steady'
      : 'responsive';
  const readability: PlayStyle['readability'] = feelProfile === 'bullet-hell-raid' || feelProfile === 'score-chaser' || has('neon', 'cyber', 'arcade', 'bullet', 'hell')
    ? 'high-contrast'
    : pressure === 'relaxed'
      ? 'clean'
      : 'arcade';
  return { pressure, weaponCadence, camera, readability };
}

function selectEnemyRoles(feelProfile: FeelProfile): readonly [EnemyRole, EnemyRole, EnemyRole] {
  return PROFILE_ROLE_KITS[feelProfile] ?? PROFILE_ROLE_KITS['arcade-survivor'];
}

function scaledStat(value: number, ...scales: number[]) {
  return Math.max(1, Math.round(scales.reduce((next, scale) => next * scale, value)));
}

function buildProfileWaves(enemies: { id: string; role: EnemyRole }[], feelProfile: FeelProfile, seed: number): WaveDefinition[] {
  const first = enemies[0]?.id ?? 'enemy-0';
  const second = enemies[1]?.id ?? first;
  const third = enemies[2]?.id ?? first;
  const pulse = seed % 3;

  if (feelProfile === 'bullet-hell-raid') {
    return [
      { atSeconds: 1, enemyId: first, count: 5 + pulse, everyMs: 820 },
      { atSeconds: 9, enemyId: second, count: 6 + pulse, everyMs: 760 },
      { atSeconds: 20, enemyId: first, count: 8 + pulse, everyMs: 660 },
      { atSeconds: 34, enemyId: third, count: 9 + pulse, everyMs: 610 },
      { atSeconds: 52, enemyId: second, count: 12 + pulse, everyMs: 520 },
    ];
  }

  if (feelProfile === 'siege-defense') {
    return [
      { atSeconds: 1, enemyId: first, count: 4 + pulse, everyMs: 1080 },
      { atSeconds: 12, enemyId: second, count: 5 + pulse, everyMs: 980 },
      { atSeconds: 25, enemyId: first, count: 7 + pulse, everyMs: 900 },
      { atSeconds: 39, enemyId: third, count: 8 + pulse, everyMs: 820 },
      { atSeconds: 56, enemyId: second, count: 9 + pulse, everyMs: 760 },
    ];
  }

  if (feelProfile === 'cozy-explorer') {
    return [
      { atSeconds: 1, enemyId: first, count: 4 + pulse, everyMs: 1280 },
      { atSeconds: 22, enemyId: second, count: 5 + pulse, everyMs: 1160 },
      { atSeconds: 43, enemyId: first, count: 6 + pulse, everyMs: 1040 },
      { atSeconds: 65, enemyId: third, count: 7 + pulse, everyMs: 980 },
    ];
  }

  if (feelProfile === 'score-chaser') {
    return [
      { atSeconds: 1, enemyId: first, count: 5 + pulse, everyMs: 760 },
      { atSeconds: 8, enemyId: second, count: 6 + pulse, everyMs: 760 },
      { atSeconds: 18, enemyId: first, count: 8 + pulse, everyMs: 640 },
      { atSeconds: 29, enemyId: third, count: 10 + pulse, everyMs: 580 },
      { atSeconds: 43, enemyId: second, count: 9 + pulse, everyMs: 620 },
    ];
  }

  return [
    { atSeconds: 1, enemyId: first, count: 6, everyMs: 900 },
    { atSeconds: 15, enemyId: second, count: 8, everyMs: 800 },
    { atSeconds: 35, enemyId: third, count: 10, everyMs: 700 },
    { atSeconds: 55, enemyId: first, count: 14, everyMs: 500 },
  ];
}

function objectiveControlText(
  winCondition: WinCondition,
  scoreTarget?: number,
  relicTarget?: number,
  captureTargetSeconds?: number,
  escortTargetDistance?: number,
  defendTargetSeconds?: number,
  repairNodeCount?: number,
  repairSecondsPerNode?: number,
  extractHoldSeconds?: number,
  rescueHoldSeconds?: number,
  rescueExtractSeconds?: number,
  unlockKeyTarget?: number,
  unlockHoldSeconds?: number,
): string {
  if (winCondition === 'select-decision') return 'objective: review evidence and choose the recommended decision option';
  if (winCondition === 'approve-deploy') return 'objective: approve every release gate in the agent dashboard';
  if (winCondition === 'solve-puzzle') return 'objective: solve the grid puzzle and open the exit';
  if (winCondition === 'survive') return 'objective: survive the timer';
  if (winCondition === 'clear-waves') return 'objective: clear every wave';
  if (winCondition === 'score-target') return `objective: reach ${scoreTarget ?? 200} score`;
  if (winCondition === 'collect-relics') return `objective: collect ${relicTarget ?? 4} relics`;
  if (winCondition === 'capture-zone') return `objective: hold the zone for ${captureTargetSeconds ?? 24}s`;
  if (winCondition === 'escort') return `objective: escort the ally ${escortTargetDistance ?? 560}px`;
  if (winCondition === 'defend-core') return `objective: defend the core for ${defendTargetSeconds ?? 30}s`;
  if (winCondition === 'repair-nodes') return `objective: repair ${repairNodeCount ?? 3} nodes (${repairSecondsPerNode ?? 5}s each)`;
  if (winCondition === 'extract') return `objective: hold extraction for ${extractHoldSeconds ?? 8}s`;
  if (winCondition === 'rescue') return `objective: stabilize survivor for ${rescueHoldSeconds ?? 5}s, then extract for ${rescueExtractSeconds ?? 6}s`;
  if (winCondition === 'unlock-gate') return `objective: collect ${unlockKeyTarget ?? 3} access keys, then hold exit for ${unlockHoldSeconds ?? 6}s`;
  return 'objective: defeat the boss';
}

function buildPuzzleRoom(title: string, seed: number): NonNullable<GameDefinition['puzzleRoom']> {
  const gridWidth = 8 + (seed % 2);
  const gridHeight = 6 + ((seed >>> 4) % 2);
  const walls: Array<{ x: number; y: number }> = [];
  for (let x = 0; x < gridWidth; x++) {
    walls.push({ x, y: 0 }, { x, y: gridHeight - 1 });
  }
  for (let y = 1; y < gridHeight - 1; y++) {
    walls.push({ x: 0, y }, { x: gridWidth - 1, y });
  }
  if (gridWidth > 8) walls.push({ x: 6, y: 2 });
  if (gridHeight > 6) walls.push({ x: 2, y: 5 });

  return {
    name: `${title} Puzzle Room`,
    gridWidth,
    gridHeight,
    start: { x: 1, y: 1 },
    exit: { x: gridWidth - 2, y: gridHeight - 2 },
    walls,
    blocks: [{ id: 'block-mirror', x: 3, y: 2 }],
    switches: [{ x: 4, y: 2 }],
    gems: [
      { id: 'gem-prism', x: 2, y: 1, value: 50 },
      { id: 'gem-moon', x: Math.min(gridWidth - 3, 5), y: 3, value: 75 },
    ],
    hazards: [{ x: 3, y: Math.min(gridHeight - 2, 4) }],
    moveLimit: 34 + (seed % 14),
  };
}

function buildAgentDashboard(prompt: string, title: string, seed: number): NonNullable<GameDefinition['agentDashboard']> {
  const subject = title || 'Forge';
  const confidence = 68 + (seed % 24);
  const agents = [
    { id: 'planner', name: 'Planner', role: 'Scope and sequence', status: 'working' as const, load: 62 + (seed % 18), focus: 'turn prompt into template-safe milestones' },
    { id: 'builder', name: 'Builder', role: 'Runtime implementation', status: 'working' as const, load: 58 + ((seed >>> 3) % 24), focus: 'wire definition data into playable Forge systems' },
    { id: 'tester', name: 'Tester', role: 'Browser and visual QA', status: 'idle' as const, load: 42 + ((seed >>> 5) % 20), focus: 'run self-test, screenshot, and visual matrix gates' },
    { id: 'deployer', name: 'Deployer', role: 'Release handoff', status: 'blocked' as const, load: 35 + ((seed >>> 7) % 18), focus: 'wait for approval and token-backed deploy validation' },
  ];
  const approvals = [
    { id: 'approve-art', title: 'Accept reviewed-art quality gate', requesterId: 'tester', status: 'pending' as const, risk: 'medium' as const },
    { id: 'approve-ship', title: 'Ship standalone player URL', requesterId: 'deployer', status: 'pending' as const, risk: 'high' as const },
  ];
  const checksTotal = 8;
  const checksPassing = 5 + (seed % 3);
  return {
    mission: `Ship ${subject} safely`,
    summary: `Coordinate agents, approvals, QA signals, and deployment health for "${prompt.slice(0, 74)}".`,
    operatingMode: checksPassing >= 7 ? 'deploy' : 'test',
    confidence,
    agents,
    tasks: [
      { id: 'task-route', title: 'Route prompt to supported runtime template', ownerId: 'planner', status: 'done' as const, priority: 'high' as const, eta: 'done' },
      { id: 'task-build', title: 'Generate validated GameDefinition', ownerId: 'builder', status: 'done' as const, priority: 'high' as const, eta: 'done' },
      { id: 'task-browser', title: 'Run browser self-test matrix', ownerId: 'tester', status: 'working' as const, priority: 'high' as const, eta: 'next gate' },
      { id: 'task-art', title: 'Review generated sprite-sheet art', ownerId: 'tester', status: 'todo' as const, priority: 'medium' as const, eta: 'quota ready' },
      { id: 'task-deploy', title: 'Validate Vercel deploy token path', ownerId: 'deployer', status: 'blocked' as const, priority: 'medium' as const, eta: 'token needed' },
    ],
    approvals,
    logs: [
      { id: 'log-template', agentId: 'planner', message: 'Template contract selected and constraints loaded.', tone: 'success' as const },
      { id: 'log-runtime', agentId: 'builder', message: 'Runtime artifact staged with source-backed assets.', tone: 'info' as const },
      { id: 'log-qa', agentId: 'tester', message: 'Waiting on final screenshot and interaction smoke test.', tone: 'warning' as const },
      { id: 'log-deploy', agentId: 'deployer', message: 'Production release is gated on approval.', tone: 'info' as const },
    ],
    metrics: [
      { label: 'Confidence', value: `${confidence}%`, trend: 'up' as const },
      { label: 'QA checks', value: `${checksPassing}/${checksTotal}`, trend: checksPassing >= 7 ? 'up' as const : 'flat' as const },
      { label: 'Approvals', value: `0/${approvals.length}`, trend: 'flat' as const },
      { label: 'Deploy health', value: checksPassing >= 7 ? 'ready' : 'gated', trend: checksPassing >= 7 ? 'up' as const : 'flat' as const },
    ],
    deploymentHealth: {
      checksPassing,
      checksTotal,
      targetUrl: 'pending-vercel-url',
    },
  };
}

function buildDecisionRoom(prompt: string, title: string, seed: number): NonNullable<GameDefinition['decisionRoom']> {
  const confidence = 70 + (seed % 18);
  const stakeholders = [
    { id: 'product', name: 'Product Lead', role: 'Customer value', stance: 'support' as const, priority: 'high' as const },
    { id: 'engineering', name: 'Engineering Lead', role: 'Delivery risk', stance: 'concerned' as const, priority: 'high' as const },
    { id: 'growth', name: 'Growth Lead', role: 'Launch narrative', stance: 'neutral' as const, priority: 'medium' as const },
    { id: 'finance', name: 'Finance Partner', role: 'Runway impact', stance: seed % 2 === 0 ? 'neutral' as const : 'concerned' as const, priority: 'medium' as const },
  ];
  const options = [
    {
      id: 'option-phased-launch',
      title: 'Phased Launch',
      summary: 'Ship the core experience first, keep scope locked, and route feedback into one follow-up pass.',
      ownerId: 'product',
      cost: 'medium' as const,
      upside: 78 + (seed % 9),
      risk: 34 + ((seed >>> 3) % 11),
    },
    {
      id: 'option-big-bang',
      title: 'Big Bang Launch',
      summary: 'Hold release until art, deployment, and extended template depth are all bundled together.',
      ownerId: 'growth',
      cost: 'high' as const,
      upside: 86 + ((seed >>> 4) % 8),
      risk: 62 + ((seed >>> 6) % 14),
    },
    {
      id: 'option-beta-ring',
      title: 'Private Beta Ring',
      summary: 'Open to a small review group, collect visual and gameplay feedback, then promote the strongest slice.',
      ownerId: 'engineering',
      cost: 'low' as const,
      upside: 70 + ((seed >>> 8) % 10),
      risk: 24 + ((seed >>> 10) % 10),
    },
  ];
  const recommended = options[0]!;
  return {
    brief: `Decide how to advance ${title}`,
    recommendation: `Recommend ${recommended.title}: it balances shipping momentum with verifiable runtime quality.`,
    stakeholders,
    evidence: [
      { id: 'evidence-runtime', title: 'Playable runtime templates are green', source: 'browser self-test', confidence: confidence + 4, impact: 'upside' as const },
      { id: 'evidence-art', title: 'Reviewed art still needs quota-backed validation', source: 'asset pipeline notes', confidence: 68 + ((seed >>> 2) % 12), impact: 'risk' as const },
      { id: 'evidence-deploy', title: 'Token-backed deployment is not yet proven', source: 'deploy smoke', confidence: 64 + ((seed >>> 5) % 14), impact: 'constraint' as const },
      { id: 'evidence-scope', title: `Prompt scope: ${prompt.slice(0, 70)}`, source: 'user prompt', confidence, impact: 'upside' as const },
    ],
    options,
    auditTrail: [
      { id: 'audit-brief', actorId: 'product', action: 'Framed the decision around a playable vertical slice.', tone: 'info' as const },
      { id: 'audit-risk', actorId: 'engineering', action: 'Flagged art and deployment validation as release risks.', tone: 'warning' as const },
      { id: 'audit-growth', actorId: 'growth', action: 'Compared launch narrative against visible polish.', tone: 'support' as const },
      { id: 'audit-finance', actorId: 'finance', action: 'Kept the preferred path inside the current build budget.', tone: 'info' as const },
    ],
    decisionGate: {
      recommendedOptionId: recommended.id,
      minimumConfidence: 68,
    },
  };
}

export function buildLocalGameDefinition(prompt: string): GameDefinition {
  const clean = prompt.trim() || 'neon rift survivor';
  const promptLower = clean.toLowerCase();
  const words = clean.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const bakeryTheme = THEMES.find((candidate) => candidate.boss === 'Overproofed King');
  const theme = /(bakery|pizza|kitchen|chef|food|pastr|cake|sugar|bread|oven)/.test(promptLower)
    ? bakeryTheme ?? DEFAULT_THEME
    : THEMES.find((t) => t.match.some((m) => words.some((w) => matchesThemeWord(w, m)))) ?? DEFAULT_THEME;
  const seed = hash(clean);
  const title = titleCase(words.slice(0, 4).join(' ')) || 'Neon Rift';
  const runtimeTemplate = selectRuntimeTemplate(words);
  const playerSpriteKey = 'hero';
  const winCondition: WinCondition = runtimeTemplate === 'puzzle-room'
    ? 'solve-puzzle'
    : runtimeTemplate === 'agent-dashboard'
      ? 'approve-deploy'
      : runtimeTemplate === 'decision-room'
        ? 'select-decision'
        : selectWinCondition(words, seed);
  const isBakeryTheme = theme.boss === 'Overproofed King' || /(bakery|pizza|kitchen|chef|food|pastr|cake|sugar|bread|oven)/.test(promptLower);
  const wantsBakeryPortalBackdrop = winCondition === 'defeat-boss' && isBakeryTheme;
  const feelProfile = selectFeelProfile(words, winCondition, seed);
  const playStyle = runtimeTemplate === 'puzzle-room'
    ? { pressure: 'relaxed' as const, weaponCadence: 'deliberate' as const, camera: 'steady' as const, readability: 'clean' as const }
    : runtimeTemplate === 'agent-dashboard'
      ? { pressure: 'siege' as const, weaponCadence: 'deliberate' as const, camera: 'steady' as const, readability: 'clean' as const }
      : runtimeTemplate === 'decision-room'
        ? { pressure: 'relaxed' as const, weaponCadence: 'deliberate' as const, camera: 'steady' as const, readability: 'clean' as const }
        : selectPlayStyle(words, winCondition, feelProfile, seed);
  const usesBoss = winCondition === 'defeat-boss';
  const bossSpriteKey = `boss-${kebab(theme.boss)}`;
  const escortSpriteKey = 'escort';
  const rescueSpriteKey = 'rescue-survivor';
  const defendSpriteKey = 'defend-core';
  const floorKey = 'floor';
  const backdropKey = 'scene-backdrop';
  const enemyRoles = selectEnemyRoles(feelProfile);

  const enemies = theme.enemies.map((name, i) => ({
    id: `enemy-${kebab(name)}`,
    name,
    spriteKey: `enemy-${kebab(name)}`,
    role: enemyRoles[i] ?? 'chaser',
    health: wantsBakeryPortalBackdrop
      ? [18, 30, 24][i] ?? 20
      : scaledStat(14 + i * 10 + (seed % 8), ROLE_STATS[enemyRoles[i] ?? 'chaser'].health, PROFILE_ENEMY_STATS[feelProfile].health),
    speed: wantsBakeryPortalBackdrop
      ? [92, 118, 74][i] ?? 90
      : scaledStat(70 + i * 18, ROLE_STATS[enemyRoles[i] ?? 'chaser'].speed, PROFILE_ENEMY_STATS[feelProfile].speed),
    damage: wantsBakeryPortalBackdrop
      ? [6, 9, 8][i] ?? 7
      : scaledStat(6 + i * 2, ROLE_STATS[enemyRoles[i] ?? 'chaser'].damage, PROFILE_ENEMY_STATS[feelProfile].damage),
    radius: wantsBakeryPortalBackdrop
      ? [15, 17, 16][i] ?? 15
      : scaledStat(12 + i * 2, ROLE_STATS[enemyRoles[i] ?? 'chaser'].radius),
    xp: wantsBakeryPortalBackdrop
      ? [5, 7, 8][i] ?? 5
      : scaledStat(3 + i * 2, ROLE_STATS[enemyRoles[i] ?? 'chaser'].xp, PROFILE_ENEMY_STATS[feelProfile].xp),
    score: wantsBakeryPortalBackdrop
      ? [25, 40, 55][i] ?? 30
      : scaledStat(10 + i * 5, ROLE_STATS[enemyRoles[i] ?? 'chaser'].score, PROFILE_ENEMY_STATS[feelProfile].score),
  }));
  const waves = wantsBakeryPortalBackdrop
    ? [
        { atSeconds: 1, enemyId: enemies[0]?.id ?? 'enemy-macaron', count: 4, everyMs: 920 },
        { atSeconds: 7, enemyId: enemies[1]?.id ?? 'enemy-rolling-pin', count: 3, everyMs: 980 },
        { atSeconds: 14, enemyId: enemies[0]?.id ?? 'enemy-macaron', count: 6, everyMs: 760 },
        { atSeconds: 23, enemyId: enemies[2]?.id ?? 'enemy-proofling', count: 4, everyMs: 820 },
        { atSeconds: 34, enemyId: enemies[1]?.id ?? 'enemy-rolling-pin', count: 5, everyMs: 740 },
      ]
    : buildProfileWaves(enemies, feelProfile, seed);

  const boss = usesBoss ? {
    id: 'boss',
    name: theme.boss,
    spriteKey: bossSpriteKey,
    role: 'brute' as const,
    health: wantsBakeryPortalBackdrop ? 680 : 600 + (seed % 400),
    speed: wantsBakeryPortalBackdrop ? 34 : 45,
    damage: 18,
    radius: wantsBakeryPortalBackdrop ? 42 : 34,
    xp: 50,
    score: 500,
    spawnAtSeconds: wantsBakeryPortalBackdrop ? 32 : 75,
    patterns: wantsBakeryPortalBackdrop ? (['summon', 'radial-burst', 'beam'] as BossPattern[]) : selectBossPatterns(words, seed),
  } : undefined;
  const scoreTarget = winCondition === 'score-target' ? 210 + (seed % 110) : undefined;
  const relicTarget = winCondition === 'collect-relics' ? 3 + (seed % 3) : undefined;
  const captureTargetSeconds = winCondition === 'capture-zone' ? 20 + (seed % 11) : undefined;
  const escortTargetDistance = winCondition === 'escort' ? 520 + (seed % 170) : undefined;
  const defendTargetSeconds = winCondition === 'defend-core' ? 28 + (seed % 13) : undefined;
  const defendMaxHealth = winCondition === 'defend-core' ? 72 + (seed % 38) : undefined;
  const repairNodeCount = winCondition === 'repair-nodes' ? 3 + (seed % 2) : undefined;
  const repairSecondsPerNode = winCondition === 'repair-nodes' ? 4 + (seed % 3) : undefined;
  const extractHoldSeconds = winCondition === 'extract' ? 7 + (seed % 5) : undefined;
  const rescueHoldSeconds = winCondition === 'rescue' ? 4 + (seed % 3) : undefined;
  const rescueExtractSeconds = winCondition === 'rescue' ? 5 + (seed % 4) : undefined;
  const unlockKeyTarget = winCondition === 'unlock-gate' ? 3 + (seed % 2) : undefined;
  const unlockHoldSeconds = winCondition === 'unlock-gate' ? 5 + (seed % 4) : undefined;
  const puzzleRoom = runtimeTemplate === 'puzzle-room' ? buildPuzzleRoom(title, seed) : undefined;
  const agentDashboard = runtimeTemplate === 'agent-dashboard' ? buildAgentDashboard(clean, title, seed) : undefined;
  const decisionRoom = runtimeTemplate === 'decision-room' ? buildDecisionRoom(clean, title, seed) : undefined;
  const playerFrameSize = runtimeTemplate === 'platformer'
    ? 50
    : runtimeTemplate === 'puzzle-room'
      ? 48
      : wantsBakeryPortalBackdrop
        ? 48
      : winCondition === 'collect-relics' || winCondition === 'survive'
        ? 46
        : runtimeTemplate === 'flight-shooter'
          ? 42
          : 38;
  const enemyFrameSize = runtimeTemplate === 'platformer'
    ? 44
    : runtimeTemplate === 'puzzle-room'
      ? 40
      : wantsBakeryPortalBackdrop
        ? 44
      : winCondition === 'collect-relics' || winCondition === 'survive'
        ? 40
        : runtimeTemplate === 'flight-shooter'
          ? 40
          : 34;
  const bossFrameSize = runtimeTemplate === 'platformer'
    ? 116
    : wantsBakeryPortalBackdrop
      ? 118
    : /(coast|tide|harbor|beast|hound|maw|charge)/.test(promptLower)
      ? 108
      : runtimeTemplate === 'flight-shooter'
        ? 108
        : 104;
  const wantsHauntedBossBackdrop = winCondition === 'defeat-boss'
    && /(ghost|haunt|grave|vampire|witch|crypt|spirit|bone|spooky|horror)/.test(promptLower);
  const wantsShockwaveBackdrop = winCondition === 'defeat-boss'
    && /(shockwave|shock|seismic|quake|earthquake|tremor|sonic|stomp|slam|basalt|fault)/.test(promptLower);
  const wantsCoastalObjectiveBackdrop = (winCondition === 'survive' || winCondition === 'escort')
    && /(^|\s)(coast(?:al)?|tide|ocean|sea|waves?|harbor|beach|reef|shore)(\s|$)/.test(promptLower);
  const wantsCoastalBossBackdrop = winCondition === 'defeat-boss'
    && /(^|\s)(coast(?:al)?|tide|ocean|sea|waves?|harbor|beach|reef|beast|hound|maw|charge)(\s|$)/.test(promptLower);
  const wantsFlightBackdrop = runtimeTemplate === 'flight-shooter';
  const wantsLiteralBackdrop = wantsFlightBackdrop
    || runtimeTemplate === 'platformer'
    || runtimeTemplate === 'puzzle-room'
    || wantsHauntedBossBackdrop
    || wantsBakeryPortalBackdrop
    || wantsShockwaveBackdrop
    || wantsCoastalObjectiveBackdrop
    || wantsCoastalBossBackdrop;

  const assets = [
    ...(wantsLiteralBackdrop ? [{
      key: backdropKey,
      kind: 'background' as const,
      prompt: wantsFlightBackdrop
        ? `${title} side-view storm cloud flight shooter background, huge zeppelin boss silhouette on the right, enemy fighter planes, open left flight lane, no UI or text`
        : runtimeTemplate === 'platformer'
        ? `${title} side-view castle platformer background, crenellated walls, towers, moonlit ledges, no UI or text`
        : runtimeTemplate === 'puzzle-room'
          ? `${title} top-down crystal temple puzzle room background, moon gate, crystal columns, readable stone floor, no UI or text`
          : wantsHauntedBossBackdrop
            ? `${title} haunted crypt boss arena background, gothic arches, candles, bones, spectral maw, readable empty combat floor, no UI or text`
            : wantsBakeryPortalBackdrop
              ? `${title} bakery portal summoner boss arena background, magical oven portal, pastry shelves, warm stone combat floor, no UI or text`
              : wantsShockwaveBackdrop
                ? `${title} seismic shockwave boss arena background, cracked basalt floor, magma fissures, impact crater rings, huge rocky titan silhouette, readable empty combat floor, no UI or text`
              : wantsCoastalObjectiveBackdrop
                ? `${title} cozy coastal survivor escort arena background, beach meadow, turquoise waves, lantern beacons, supply crates, readable empty center, no UI or text`
                : `${title} coastal beast boss arena background, ocean waves, sandbar, harbor rocks, dramatic monster lair, no UI or text`,
      width: 1280,
      height: 720,
    }] : []),
    spriteSheetAsset(
      playerSpriteKey,
      runtimeTemplate === 'flight-shooter'
        ? `${title} large hero aircraft, side-view arcade flight shooter, readable cockpit silhouette, eight-frame banking and firing sprite sheet`
        : runtimeTemplate === 'platformer'
          ? `${title} large side-view platformer hero character, clear head torso legs, run jump attack, eight-frame state animation sprite sheet`
          : runtimeTemplate === 'puzzle-room'
            ? `${title} large grid puzzle hero, readable top-down explorer character, robe satchel silhouette, eight-frame thinking and step animation sprite sheet`
            : runtimeTemplate === 'agent-dashboard'
              ? `${title} agent dashboard operator cursor, readable command avatar, eight-frame status animation sprite sheet`
              : runtimeTemplate === 'decision-room'
                ? `${title} decision room facilitator cursor, readable boardroom avatar, eight-frame review and selection animation sprite sheet`
                : wantsBakeryPortalBackdrop
                  ? `${title} pastry chef hero, white chef hat, apron, wooden spoon frosting wand, readable top-down character, eight-frame move attack dash sprite sheet`
                : `${title} large top-down hero character, readable body silhouette, eight-frame state animation sprite sheet`,
      playerFrameSize,
    ),
    ...(winCondition === 'escort' ? [spriteSheetAsset(escortSpriteKey, `${title} escorted wagon companion, protected caravan ally, top-down, readable wheels canopy and passenger silhouette, eight-frame route and contested animation sprite sheet`, 128, 88)] : []),
    ...(winCondition === 'rescue' ? [spriteSheetAsset(rescueSpriteKey, `${title} rescued survivor ally, downed then extracted, top-down, eight-frame rescue and contested animation sprite sheet`, 30)] : []),
    ...(winCondition === 'defend-core' ? [spriteSheetAsset(defendSpriteKey, `${title} defense core, protected base objective, top-down, eight-frame idle and contested sprite sheet`, 42)] : []),
    ...enemies.map((e, i) => spriteSheetAsset(
      e.spriteKey,
      runtimeTemplate === 'flight-shooter'
        ? `${e.name}, ${theme.enemies[i]} large enemy aircraft, side-view flight shooter, readable hostile silhouette, eight-frame attack animation sprite sheet`
        : runtimeTemplate === 'platformer'
          ? `${e.name}, ${theme.enemies[i]} large side-view platformer monster enemy, readable limbs and head, patrol jump attack, eight-frame role animation sprite sheet`
          : runtimeTemplate === 'puzzle-room'
            ? `${e.name}, ${theme.enemies[i]} puzzle-room obstacle marker, top-down, eight-frame idle animation sprite sheet`
            : runtimeTemplate === 'agent-dashboard'
              ? `${e.name}, ${theme.enemies[i]} operations risk marker, dashboard alert sprite sheet`
              : runtimeTemplate === 'decision-room'
                ? `${e.name}, ${theme.enemies[i]} boardroom risk marker, stakeholder signal sprite sheet`
                : wantsBakeryPortalBackdrop
                  ? `${e.name} pastry minion, bakery-themed enemy silhouette, readable top-down arcade sprite sheet`
                : `${e.name}, ${theme.enemies[i]} large top-down monster enemy, readable hostile silhouette, eight-frame role animation sprite sheet`,
      enemyFrameSize,
    )),
    ...(boss ? [spriteSheetAsset(
      bossSpriteKey,
      runtimeTemplate === 'flight-shooter'
        ? `${theme.boss} huge boss airship, side-view flight shooter, clear silhouette and telegraph pose, large eight-frame phase and telegraph animation sprite sheet`
        : runtimeTemplate === 'platformer'
          ? `${theme.boss} huge side-view platformer boss monster, horns armor stomp telegraph, large eight-frame phase animation sprite sheet`
        : wantsBakeryPortalBackdrop
          ? `${theme.boss} oven portal boss, brick oven body, purple portal mouth, glowing eyes, summon telegraph, large eight-frame phase sprite sheet`
        : `${theme.boss} huge boss monster, top-down, horns claws maw and clear telegraph pose, large eight-frame phase and telegraph animation sprite sheet`,
      bossFrameSize,
    )] : []),
    ...(runtimeTemplate === 'platformer' ? [{
      key: 'platformer-foreground',
      kind: 'fx' as const,
      prompt: `${title} polished side-view platformer foreground actors, knight hero, ledge imps, clockwork boss, transparent overlay`,
      width: 1672,
      height: 941,
      src: 'runtime:forge/curated/sprite/castle-platformer-foreground.png',
    }] : []),
    ...(runtimeTemplate === 'flight-shooter' ? [{
      key: 'flight-foreground',
      kind: 'fx' as const,
      prompt: `${title} polished side-view flight shooter foreground aircraft, hero plane, enemy fighters, muzzle flashes, transparent overlay`,
      width: 1280,
      height: 720,
      src: 'runtime:forge/curated/sprite/storm-zeppelin-flight-foreground.png',
    }] : []),
    ...(wantsShockwaveBackdrop ? [{
      key: 'shockwave-foreground',
      kind: 'fx' as const,
      prompt: `${title} seismic shockwave foreground telegraph, cracked basalt impact rings, dust, small hero, transparent overlay`,
      width: 1280,
      height: 720,
      src: 'runtime:forge/curated/sprite/seismic-shockwave-foreground.png',
    }] : []),
    ...(wantsCoastalBossBackdrop ? [{
      key: 'coastal-charge-foreground',
      kind: 'fx' as const,
      prompt: `${title} coastal beast boss foreground charge lane, hero dodge, target rings, readable combat telegraph, transparent overlay`,
      width: 1280,
      height: 720,
      src: 'runtime:forge/curated/sprite/coastal-beast-charge-foreground.png',
    }] : []),
    { key: 'bullet', kind: 'fx' as const, prompt: `${title} player projectile, readable top-down game effect`, width: 12, height: 12 },
    { key: 'ebullet', kind: 'fx' as const, prompt: `${title} enemy projectile, readable hostile game effect`, width: 12, height: 12 },
    { key: 'orb', kind: 'fx' as const, prompt: `${title} collectible XP orb, readable top-down game pickup`, width: 12, height: 12 },
    {
      key: floorKey,
      kind: 'tile' as const,
      prompt: runtimeTemplate === 'puzzle-room'
        ? `${title} puzzle room grid floor tile, seamless top-down logic game tile`
        : runtimeTemplate === 'agent-dashboard'
          ? `${title} agent dashboard panel texture, seamless low-contrast operations cockpit tile`
          : runtimeTemplate === 'decision-room'
            ? `${title} decision room boardroom table texture, seamless low-contrast evidence panel tile`
            : `${title} arena floor tile, seamless top-down game tile`,
      width: 64,
      height: 64,
    },
  ];

  const def: GameDefinition = {
    schemaVersion: 1,
    title,
    genre: runtimeTemplate === 'flight-shooter'
      ? 'flight-shooter'
      : runtimeTemplate === 'platformer'
        ? 'platformer'
        : runtimeTemplate === 'puzzle-room'
          ? 'puzzle-room'
          : runtimeTemplate === 'agent-dashboard'
          ? 'agent-dashboard'
          : runtimeTemplate === 'decision-room'
            ? 'decision-room'
            : 'survivor',
    runtimeTemplate,
    theme: clean,
    palette: theme.palette,
    feelProfile,
    playStyle,
    assets,
    player: {
      spriteKey: playerSpriteKey,
      maxHealth: 100 + (seed % 60),
      speed: runtimeTemplate === 'flight-shooter' ? 230 : runtimeTemplate === 'platformer' ? 215 : 200,
      radius: 14,
      dashCooldownMs: 850 + ((seed >>> 3) % 250),
      meleeDamage: 18 + ((seed >>> 9) % 8),
      meleeRange: 46,
      weapons: [{
        id: 'primary',
        name: wantsBakeryPortalBackdrop ? 'Searing Spatula' : 'Auto Bolt',
        damage: wantsBakeryPortalBackdrop ? 12 : 10,
        cooldownMs: wantsBakeryPortalBackdrop ? 310 : 360 + ((seed >>> 5) % 240),
        projectileSpeed: wantsBakeryPortalBackdrop ? 500 : 460,
        projectiles: wantsBakeryPortalBackdrop ? 2 : 1 + ((seed >>> 7) % 3),
        spread: wantsBakeryPortalBackdrop ? 0.24 : 0.18,
        pierce: wantsBakeryPortalBackdrop ? 1 : 0,
      }],
    },
    enemies,
    ...(boss ? { boss } : {}),
    waves,
    upgrades: wantsBakeryPortalBackdrop
      ? [
          { id: 'up-keen-edge', name: 'Keen Edge', kind: 'damage', amount: 5 },
          { id: 'up-fast-hands', name: 'Fast Hands', kind: 'cooldown', amount: 60 },
          { id: 'up-quick-step', name: 'Quick Step', kind: 'speed', amount: 28 },
          { id: 'up-sugar-lance', name: 'Sugar Lance', kind: 'projectiles', amount: 1 },
          { id: 'up-crumb-magnet', name: 'Crumb Magnet', kind: 'magnet', amount: 90 },
          { id: 'up-warm-heart', name: 'Warm Heart', kind: 'maxHealth', amount: 25 },
        ]
      : [
          { id: 'up-damage', name: 'Sharper Bolts', kind: 'damage', amount: 5 },
          { id: 'up-cooldown', name: 'Rapid Fire', kind: 'cooldown', amount: 60 },
          { id: 'up-speed', name: 'Swift Boots', kind: 'speed', amount: 30 },
          { id: 'up-projectiles', name: 'Split Shot', kind: 'projectiles', amount: 1 },
          { id: 'up-magnet', name: 'Magnet Trail', kind: 'magnet', amount: 80 },
          { id: 'up-health', name: 'Bigger Heart', kind: 'maxHealth', amount: 25 },
        ],
    arena: {
      name: runtimeTemplate === 'puzzle-room' && puzzleRoom
        ? puzzleRoom.name
        : runtimeTemplate === 'agent-dashboard'
          ? `${titleCase(words.slice(0, 2).join(' ') || 'Agent')} Ops Cockpit`
          : runtimeTemplate === 'decision-room'
            ? `${titleCase(words.slice(0, 2).join(' ') || 'Decision')} Boardroom`
            : wantsBakeryPortalBackdrop
              ? 'Bakery Portal Arena'
            : `${titleCase(words.slice(0, 2).join(' ') || 'Rift')} Arena`,
      width: 1280,
      height: 720,
      durationSeconds: winCondition === 'survive' ? 100 : 90,
      tileKey: floorKey,
    },
    ...(puzzleRoom ? { puzzleRoom } : {}),
    ...(agentDashboard ? { agentDashboard } : {}),
    ...(decisionRoom ? { decisionRoom } : {}),
    controls: [
      'move (WASD/arrows)',
      'manual attack (Space/J)',
      'dash (Shift/K)',
      'auto-fire',
      'pick upgrade on level up',
      ...(wantsBakeryPortalBackdrop ? ['clear the haunted bakery: cut through enchanted pastries, dodge sugar magic, and defeat the Overproofed King'] : []),
      ...(runtimeTemplate === 'flight-shooter' ? ['flight template: forward pressure lanes'] : []),
      ...(runtimeTemplate === 'platformer' ? ['platformer template: jump arcs and ledges'] : []),
      ...(runtimeTemplate === 'puzzle-room' ? ['puzzle-room template: step, push blocks, light switches, reach exit'] : []),
      ...(runtimeTemplate === 'agent-dashboard' ? ['agent-dashboard template: select agents, review queues, approve release gates'] : []),
      ...(runtimeTemplate === 'decision-room' ? ['decision-room template: review stakeholders, evidence, options, and select recommendation'] : []),
      objectiveControlText(winCondition, scoreTarget, relicTarget, captureTargetSeconds, escortTargetDistance, defendTargetSeconds, repairNodeCount, repairSecondsPerNode, extractHoldSeconds, rescueHoldSeconds, rescueExtractSeconds, unlockKeyTarget, unlockHoldSeconds),
    ],
    winCondition,
    ...(scoreTarget ? { scoreTarget } : {}),
    ...(relicTarget ? { relicTarget } : {}),
    ...(captureTargetSeconds ? { captureTargetSeconds } : {}),
    ...(escortTargetDistance ? { escortSpriteKey, escortTargetDistance } : {}),
    ...(defendTargetSeconds && defendMaxHealth ? { defendSpriteKey, defendTargetSeconds, defendMaxHealth } : {}),
    ...(repairNodeCount && repairSecondsPerNode ? { repairNodeCount, repairSecondsPerNode } : {}),
    ...(extractHoldSeconds ? { extractHoldSeconds } : {}),
    ...(rescueHoldSeconds && rescueExtractSeconds ? { rescueSpriteKey, rescueHoldSeconds, rescueExtractSeconds } : {}),
    ...(unlockKeyTarget && unlockHoldSeconds ? { unlockKeyTarget, unlockHoldSeconds } : {}),
    loseCondition: 'health-zero',
  };

  return gameDefinitionSchema.parse(def);
}
