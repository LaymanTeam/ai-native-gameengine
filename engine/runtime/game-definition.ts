/**
 * GameDefinition — the typed contract the AI fills to specify a game, and that the runtime SDK
 * loads into a running game. This is the heart of Path A (see docs/PATH-A-PLAN.md): the coder
 * produces a GameDefinition (data + references to generated sprites + light behavior selection)
 * rather than writing the engine; the SDK's systems (movement, combat, AI, waves, boss, HUD, VFX)
 * do the heavy lifting. Rich enough for sprite-based, rule-deep games (the hackathon3 bar) while
 * staying bounded and declarative so structured-output models can produce it reliably.
 *
 * NOTE: explicit, closed objects on purpose — Gemini structured output needs every field defined.
 */
import * as z from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color like #1a2b3c');
const id = z.string().min(1).regex(/^[a-z0-9-]+$/, 'kebab-case id');

/** Palette the renderer + generated art conform to. */
export const paletteSchema = z.object({
  background: hexColor,
  floor: hexColor,
  accent: hexColor,
  player: hexColor,
  projectile: hexColor,
  danger: hexColor,
  xp: hexColor,
});

/** A sprite/icon the asset pipeline generates and the loader binds by `key`. */
export const assetSchema = z.object({
  key: id.describe('manifest key the entity references, e.g. "player" or "enemy-crumb"'),
  kind: z.enum(['sprite', 'icon', 'tile', 'background', 'fx']),
  prompt: z.string().min(1).describe('image-gen prompt; the style bible is prepended automatically'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const weaponSchema = z.object({
  id,
  name: z.string().min(1),
  damage: z.number().positive(),
  cooldownMs: z.number().int().positive(),
  projectileSpeed: z.number().positive(),
  projectiles: z.number().int().min(1).max(12).describe('shots per fire'),
  spread: z.number().min(0).describe('radians between shots'),
  pierce: z.number().int().min(0),
});

export const playerSchema = z.object({
  spriteKey: id.describe('asset key for the player sprite'),
  maxHealth: z.number().positive(),
  speed: z.number().positive(),
  radius: z.number().positive(),
  weapons: z.array(weaponSchema).min(1),
});

/** Behaviors the SDK's AI system implements; the AI only selects one per enemy. */
export const enemyRole = z.enum(['chaser', 'charger', 'shooter', 'brute', 'orbiter']);

export const enemySchema = z.object({
  id,
  name: z.string().min(1),
  spriteKey: id,
  role: enemyRole,
  health: z.number().positive(),
  speed: z.number().positive(),
  damage: z.number().positive(),
  radius: z.number().positive(),
  xp: z.number().int().min(0),
  score: z.number().int().min(0),
});

/** Boss = a tougher enemy plus timed attack patterns the SDK's boss system runs. */
export const bossPattern = z.enum(['spiral-shot', 'radial-burst', 'charge', 'summon', 'beam']);

export const bossSchema = enemySchema.extend({
  spawnAtSeconds: z.number().min(0),
  patterns: z.array(bossPattern).min(1),
});

export const waveSchema = z.object({
  atSeconds: z.number().min(0),
  enemyId: id,
  count: z.number().int().min(1),
  everyMs: z.number().int().positive(),
});

export const upgradeSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(['damage', 'cooldown', 'speed', 'maxHealth', 'projectiles', 'magnet', 'healing']),
  amount: z.number(),
});

export const arenaSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().int().positive().describe('survive this long to win, when winCondition=survive'),
  tileKey: id.optional().describe('asset key for the floor tile'),
});

export const gameDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  genre: z.string().min(1),
  theme: z.string().min(1),
  palette: paletteSchema,
  assets: z.array(assetSchema).min(1).describe('every sprite/icon the game needs'),
  player: playerSchema,
  enemies: z.array(enemySchema).min(1),
  boss: bossSchema.optional(),
  waves: z.array(waveSchema).min(1),
  upgrades: z.array(upgradeSchema).default([]),
  arena: arenaSchema,
  controls: z.array(z.string().min(1)).min(1),
  winCondition: z.enum(['survive', 'defeat-boss', 'score-target', 'clear-waves']),
  loseCondition: z.literal('health-zero'),
});

export type Palette = z.infer<typeof paletteSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Weapon = z.infer<typeof weaponSchema>;
export type Enemy = z.infer<typeof enemySchema>;
export type Boss = z.infer<typeof bossSchema>;
export type Wave = z.infer<typeof waveSchema>;
export type Upgrade = z.infer<typeof upgradeSchema>;
export type Arena = z.infer<typeof arenaSchema>;
export type GameDefinition = z.infer<typeof gameDefinitionSchema>;

/** Validate unknown input as a GameDefinition; discriminated result for safe call sites. */
export function parseGameDefinition(
  value: unknown,
): { ok: true; definition: GameDefinition } | { ok: false; errors: string[] } {
  const result = gameDefinitionSchema.safeParse(value);
  if (result.success) return { ok: true, definition: result.data };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
