/**
 * GameDefinition — the typed contract the AI fills to specify a game, and that the runtime SDK
 * loads into a running game. This is the heart of Path A (see docs/PATH-A-PLAN.md): the coder
 * produces a GameDefinition (data + references to generated sprites + light behavior selection)
 * rather than writing the engine; the SDK's systems (movement, combat, AI, waves, boss, HUD, VFX)
 * do the heavy lifting. Rich enough for sprite-based, rule-deep games while
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

const playStyleDefaults = {
  pressure: 'standard',
  weaponCadence: 'steady',
  camera: 'responsive',
  readability: 'arcade',
} as const;

export const feelProfileSchema = z.enum([
  'arcade-survivor',
  'bullet-hell-raid',
  'siege-defense',
  'cozy-explorer',
  'score-chaser',
]).default('arcade-survivor')
  .describe('named reference game-feel profile layered on top of playStyle');

export const runtimeTemplateSchema = z.enum([
  'arena-action',
  'flight-shooter',
  'platformer',
  'puzzle-room',
  'decision-room',
  'agent-dashboard',
]).default('arena-action')
  .describe('runtime template family the SDK should mount');

/** High-level game-feel knobs the renderer uses to tune pressure, cadence, and feedback. */
export const playStyleSchema = z.object({
  pressure: z.enum(['relaxed', 'standard', 'intense', 'siege'])
    .default(playStyleDefaults.pressure)
    .describe('spawn density and arena-director pressure'),
  weaponCadence: z.enum(['deliberate', 'steady', 'rapid', 'bullet-hell'])
    .default(playStyleDefaults.weaponCadence)
    .describe('player auto-fire rhythm and projectile presentation'),
  camera: z.enum(['steady', 'responsive', 'dramatic'])
    .default(playStyleDefaults.camera)
    .describe('camera shake and impact response intensity'),
  readability: z.enum(['clean', 'arcade', 'high-contrast'])
    .default(playStyleDefaults.readability)
    .describe('HUD/FX contrast preference for the runtime'),
}).default(playStyleDefaults);

/** A sprite/icon the asset pipeline generates and the loader binds by `key`. */
export const spriteSheetAnimationSchema = z.object({
  name: id.describe('runtime state or state family, e.g. idle, move, attack, boss-telegraph'),
  frames: z.array(z.number().int().min(0).max(11)).min(1).max(12),
  frameMs: z.number().int().positive().optional().describe('milliseconds per animation frame'),
}).describe('optional named frame range for sprite-sheet actor states');

export const spriteSheetSchema = z.object({
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  frames: z.number().int().min(2).max(12),
  animations: z.array(spriteSheetAnimationSchema).max(16).optional(),
}).describe('optional bounded sprite-sheet metadata for frame-stepped actor assets');

export const assetSchema = z.object({
  key: id.describe('manifest key the entity references, e.g. "player" or "enemy-crumb"'),
  kind: z.enum(['sprite', 'icon', 'tile', 'background', 'fx']),
  prompt: z.string().min(1).describe('image-gen prompt; the style bible is prepended automatically'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  spriteSheet: spriteSheetSchema.optional(),
  src: z.string().min(1).optional().describe('optional loadable image URL, data: URL, or runtime:<file> reference'),
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
  autoFire: z.boolean().default(true).describe('whether the runtime fires this weapon automatically at the nearest enemy'),
});

export const playerMovementModelSchema = z.enum(['direct', 'accelerated'])
  .default('direct')
  .describe('top-down movement model: direct arcade velocity or acceleration/drag character control');

export const playerSchema = z.object({
  spriteKey: id.describe('asset key for the player sprite'),
  maxHealth: z.number().positive(),
  speed: z.number().positive(),
  radius: z.number().positive(),
  movementModel: playerMovementModelSchema,
  acceleration: z.number().positive().optional().describe('top-down acceleration used when movementModel=accelerated'),
  drag: z.number().positive().optional().describe('top-down drag used when movementModel=accelerated'),
  dashMultiplier: z.number().positive().optional().describe('velocity multiplier applied to a dash impulse'),
  dashDurationMs: z.number().int().positive().optional().describe('milliseconds the dash state remains active'),
  dashCooldownMs: z.number().int().positive().default(900),
  meleeDamage: z.number().positive().default(18),
  meleeRange: z.number().positive().default(44),
  meleeDurationMs: z.number().int().positive().optional().describe('milliseconds the melee hit arc remains active'),
  meleeCooldownMs: z.number().int().positive().optional().describe('minimum milliseconds between melee attacks'),
  weapons: z.array(weaponSchema).min(1),
});

/** Behaviors the SDK's AI system implements; the AI only selects one per enemy. */
export const enemyRole = z.enum(['chaser', 'charger', 'shooter', 'sniper', 'sapper', 'support', 'guardian', 'sentinel', 'brute', 'orbiter', 'wanderer']);

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
export const bossPattern = z.enum(['spiral-shot', 'radial-burst', 'charge', 'summon', 'beam', 'minefield', 'vortex', 'shockwave', 'laser-grid']);

export const bossSchema = enemySchema.extend({
  spawnAtSeconds: z.number().min(0),
  spawnAfterWavesCleared: z.number().int().min(1).max(12).optional()
    .describe('optional wave-clear gate; when set, the boss waits until this many authored waves are fully cleared'),
  patterns: z.array(bossPattern).min(1),
});

export const waveSchema = z.object({
  atSeconds: z.number().min(0),
  enemyId: id,
  enemyIds: z.array(id).min(1).max(8).optional()
    .describe('optional enemy-id cycle for mixed waves; defaults to [enemyId]'),
  count: z.number().int().min(1),
  everyMs: z.number().int().positive(),
  spawnAfterWavesCleared: z.number().int().min(0).max(12).optional()
    .describe('optional sequential gate; when set, this wave is queued after this many authored waves are fully cleared'),
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
  worldWidth: z.number().int().positive().optional().describe('optional physics world width; defaults to viewport width'),
  worldHeight: z.number().int().positive().optional().describe('optional physics world height; defaults to viewport height'),
  cameraFollow: z.boolean().default(false).describe('whether the camera follows the player inside a larger world'),
  durationSeconds: z.number().int().positive().describe('survive this long to win, when winCondition=survive'),
  tileKey: id.optional().describe('asset key for the floor tile'),
});

export const puzzlePointSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

export const puzzleBlockSchema = puzzlePointSchema.extend({
  id,
});

export const puzzleGemSchema = puzzlePointSchema.extend({
  id,
  value: z.number().int().positive(),
});

export const puzzleRoomSchema = z.object({
  name: z.string().min(1),
  gridWidth: z.number().int().min(5).max(16),
  gridHeight: z.number().int().min(5).max(12),
  start: puzzlePointSchema,
  exit: puzzlePointSchema,
  walls: z.array(puzzlePointSchema).max(96),
  blocks: z.array(puzzleBlockSchema).max(12),
  switches: z.array(puzzlePointSchema).max(12),
  gems: z.array(puzzleGemSchema).max(16),
  hazards: z.array(puzzlePointSchema).max(16),
  moveLimit: z.number().int().positive().max(200),
}).describe('bounded grid-puzzle configuration used when runtimeTemplate=puzzle-room');

export const agentDashboardSchema = z.object({
  mission: z.string().min(1),
  summary: z.string().min(1),
  operatingMode: z.enum(['plan', 'build', 'test', 'deploy']),
  confidence: z.number().int().min(0).max(100),
  agents: z.array(z.object({
    id,
    name: z.string().min(1),
    role: z.string().min(1),
    status: z.enum(['idle', 'working', 'blocked', 'done']),
    load: z.number().int().min(0).max(100),
    focus: z.string().min(1),
  })).min(3).max(8),
  tasks: z.array(z.object({
    id,
    title: z.string().min(1),
    ownerId: id,
    status: z.enum(['todo', 'working', 'blocked', 'done']),
    priority: z.enum(['low', 'medium', 'high']),
    eta: z.string().min(1),
  })).min(3).max(12),
  approvals: z.array(z.object({
    id,
    title: z.string().min(1),
    requesterId: id,
    status: z.enum(['pending', 'approved']),
    risk: z.enum(['low', 'medium', 'high']),
  })).min(1).max(6),
  logs: z.array(z.object({
    id,
    agentId: id,
    message: z.string().min(1),
    tone: z.enum(['info', 'success', 'warning', 'error']),
  })).min(3).max(12),
  metrics: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    trend: z.enum(['up', 'flat', 'down']),
  })).min(3).max(8),
  deploymentHealth: z.object({
    checksPassing: z.number().int().min(0),
    checksTotal: z.number().int().positive(),
    targetUrl: z.string().min(1).optional(),
  }),
}).describe('bounded agent operations cockpit configuration used when runtimeTemplate=agent-dashboard');

export const decisionRoomSchema = z.object({
  brief: z.string().min(1),
  recommendation: z.string().min(1),
  stakeholders: z.array(z.object({
    id,
    name: z.string().min(1),
    role: z.string().min(1),
    stance: z.enum(['support', 'neutral', 'concerned', 'blocking']),
    priority: z.enum(['low', 'medium', 'high']),
  })).min(3).max(8),
  evidence: z.array(z.object({
    id,
    title: z.string().min(1),
    source: z.string().min(1),
    confidence: z.number().int().min(0).max(100),
    impact: z.enum(['upside', 'risk', 'constraint']),
  })).min(3).max(10),
  options: z.array(z.object({
    id,
    title: z.string().min(1),
    summary: z.string().min(1),
    ownerId: id,
    cost: z.enum(['low', 'medium', 'high']),
    upside: z.number().int().min(0).max(100),
    risk: z.number().int().min(0).max(100),
  })).min(2).max(5),
  auditTrail: z.array(z.object({
    id,
    actorId: id,
    action: z.string().min(1),
    tone: z.enum(['info', 'support', 'warning', 'risk']),
  })).min(3).max(12),
  decisionGate: z.object({
    recommendedOptionId: id,
    minimumConfidence: z.number().int().min(0).max(100),
  }),
}).describe('bounded boardroom decision configuration used when runtimeTemplate=decision-room');

export const gameDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  genre: z.string().min(1),
  runtimeTemplate: runtimeTemplateSchema,
  theme: z.string().min(1),
  palette: paletteSchema,
  feelProfile: feelProfileSchema,
  playStyle: playStyleSchema,
  assets: z.array(assetSchema).min(1).describe('every sprite/icon the game needs'),
  player: playerSchema,
  enemies: z.array(enemySchema).min(1),
  boss: bossSchema.optional(),
  waves: z.array(waveSchema).min(1),
  upgrades: z.array(upgradeSchema).default([]),
  arena: arenaSchema,
  puzzleRoom: puzzleRoomSchema.optional(),
  agentDashboard: agentDashboardSchema.optional(),
  decisionRoom: decisionRoomSchema.optional(),
  controls: z.array(z.string().min(1)).min(1),
  winCondition: z.enum(['survive', 'defeat-boss', 'score-target', 'clear-waves', 'collect-relics', 'capture-zone', 'escort', 'defend-core', 'repair-nodes', 'extract', 'rescue', 'unlock-gate', 'solve-puzzle', 'approve-deploy', 'select-decision']),
  scoreTarget: z.number().int().positive().optional().describe('required when winCondition=score-target'),
  relicTarget: z.number().int().positive().optional().describe('required when winCondition=collect-relics'),
  captureTargetSeconds: z.number().int().positive().optional().describe('required when winCondition=capture-zone'),
  escortSpriteKey: id.optional().describe('required when winCondition=escort'),
  escortTargetDistance: z.number().int().positive().optional().describe('required when winCondition=escort'),
  defendSpriteKey: id.optional().describe('required when winCondition=defend-core'),
  defendTargetSeconds: z.number().int().positive().optional().describe('required when winCondition=defend-core'),
  defendMaxHealth: z.number().int().positive().optional().describe('required when winCondition=defend-core'),
  repairNodeCount: z.number().int().positive().optional().describe('required when winCondition=repair-nodes'),
  repairSecondsPerNode: z.number().int().positive().optional().describe('required when winCondition=repair-nodes'),
  extractHoldSeconds: z.number().int().positive().optional().describe('required when winCondition=extract'),
  rescueSpriteKey: id.optional().describe('required when winCondition=rescue'),
  rescueHoldSeconds: z.number().int().positive().optional().describe('required when winCondition=rescue'),
  rescueExtractSeconds: z.number().int().positive().optional().describe('required when winCondition=rescue'),
  unlockKeyTarget: z.number().int().positive().optional().describe('required when winCondition=unlock-gate'),
  unlockHoldSeconds: z.number().int().positive().optional().describe('required when winCondition=unlock-gate'),
  loseCondition: z.literal('health-zero'),
});

export type Palette = z.infer<typeof paletteSchema>;
export type FeelProfile = z.infer<typeof feelProfileSchema>;
export type RuntimeTemplate = z.infer<typeof runtimeTemplateSchema>;
export type PlayStyle = z.infer<typeof playStyleSchema>;
export type SpriteSheetAnimation = z.infer<typeof spriteSheetAnimationSchema>;
export type SpriteSheet = z.infer<typeof spriteSheetSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Weapon = z.infer<typeof weaponSchema>;
export type PlayerMovementModel = z.infer<typeof playerMovementModelSchema>;
export type Enemy = z.infer<typeof enemySchema>;
export type Boss = z.infer<typeof bossSchema>;
export type Wave = z.infer<typeof waveSchema>;
export type Upgrade = z.infer<typeof upgradeSchema>;
export type Arena = z.infer<typeof arenaSchema>;
export type PuzzlePoint = z.infer<typeof puzzlePointSchema>;
export type PuzzleBlock = z.infer<typeof puzzleBlockSchema>;
export type PuzzleGem = z.infer<typeof puzzleGemSchema>;
export type PuzzleRoom = z.infer<typeof puzzleRoomSchema>;
export type AgentDashboard = z.infer<typeof agentDashboardSchema>;
export type DecisionRoom = z.infer<typeof decisionRoomSchema>;
export type GameDefinition = z.infer<typeof gameDefinitionSchema>;

/** Validate unknown input as a GameDefinition; discriminated result for safe call sites. */
export function parseGameDefinition(
  value: unknown,
): { ok: true; definition: GameDefinition } | { ok: false; errors: string[] } {
  const result = gameDefinitionSchema.safeParse(value);
  if (result.success) return { ok: true, definition: result.data };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

/** Cross-field integrity checks Zod cannot express without making model output brittle. */
export function validateGameDefinitionReferences(definition: GameDefinition): string[] {
  const errors: string[] = [];
  const assetCounts = new Map<string, number>();
  for (const asset of definition.assets) assetCounts.set(asset.key, (assetCounts.get(asset.key) ?? 0) + 1);

  for (const [key, count] of assetCounts.entries()) {
    if (count > 1) errors.push(`assets: duplicate key "${key}"`);
  }
  for (const asset of definition.assets) {
    if (!asset.spriteSheet) continue;
    if (asset.kind !== 'sprite') errors.push(`asset "${asset.key}": spriteSheet is only supported for sprite assets`);
    const columns = Math.max(1, Math.floor(asset.width / asset.spriteSheet.frameWidth));
    const rows = Math.max(1, Math.floor(asset.height / asset.spriteSheet.frameHeight));
    if (asset.width < asset.spriteSheet.frameWidth || asset.height < asset.spriteSheet.frameHeight) {
      errors.push(`asset "${asset.key}": spriteSheet frame size exceeds asset dimensions`);
    }
    if (columns * rows < asset.spriteSheet.frames) {
      errors.push(`asset "${asset.key}": spriteSheet dimensions cannot contain ${asset.spriteSheet.frames} frames`);
    }
    const animationNames = new Set<string>();
    for (const animation of asset.spriteSheet.animations ?? []) {
      if (animationNames.has(animation.name)) errors.push(`asset "${asset.key}": duplicate spriteSheet animation "${animation.name}"`);
      animationNames.add(animation.name);
      for (const frame of animation.frames) {
        if (frame >= asset.spriteSheet.frames) {
          errors.push(`asset "${asset.key}": spriteSheet animation "${animation.name}" references frame ${frame} outside ${asset.spriteSheet.frames} frames`);
        }
      }
    }
  }

  const hasAsset = (key: string, label: string) => {
    if (!assetCounts.has(key)) errors.push(`${label}: missing asset key "${key}"`);
  };

  hasAsset(definition.player.spriteKey, 'player.spriteKey');
  for (const enemy of definition.enemies) hasAsset(enemy.spriteKey, `enemy "${enemy.id}" spriteKey`);
  if (definition.boss) hasAsset(definition.boss.spriteKey, 'boss.spriteKey');
  if (definition.arena.tileKey) hasAsset(definition.arena.tileKey, 'arena.tileKey');
  if (definition.escortSpriteKey) hasAsset(definition.escortSpriteKey, 'escortSpriteKey');
  if (definition.defendSpriteKey) hasAsset(definition.defendSpriteKey, 'defendSpriteKey');
  if (definition.rescueSpriteKey) hasAsset(definition.rescueSpriteKey, 'rescueSpriteKey');
  if (definition.winCondition === 'defeat-boss' && !definition.boss) {
    errors.push('winCondition: defeat-boss requires boss');
  }
  if (definition.winCondition === 'score-target' && !definition.scoreTarget) {
    errors.push('winCondition: score-target requires scoreTarget');
  }
  if (definition.winCondition === 'collect-relics' && !definition.relicTarget) {
    errors.push('winCondition: collect-relics requires relicTarget');
  }
  if (definition.winCondition === 'capture-zone' && !definition.captureTargetSeconds) {
    errors.push('winCondition: capture-zone requires captureTargetSeconds');
  }
  if (definition.winCondition === 'escort') {
    if (!definition.escortSpriteKey) errors.push('winCondition: escort requires escortSpriteKey');
    if (!definition.escortTargetDistance) errors.push('winCondition: escort requires escortTargetDistance');
  }
  if (definition.winCondition === 'defend-core') {
    if (!definition.defendSpriteKey) errors.push('winCondition: defend-core requires defendSpriteKey');
    if (!definition.defendTargetSeconds) errors.push('winCondition: defend-core requires defendTargetSeconds');
    if (!definition.defendMaxHealth) errors.push('winCondition: defend-core requires defendMaxHealth');
  }
  if (definition.winCondition === 'repair-nodes') {
    if (!definition.repairNodeCount) errors.push('winCondition: repair-nodes requires repairNodeCount');
    if (!definition.repairSecondsPerNode) errors.push('winCondition: repair-nodes requires repairSecondsPerNode');
  }
  if (definition.winCondition === 'extract' && !definition.extractHoldSeconds) {
    errors.push('winCondition: extract requires extractHoldSeconds');
  }
  if (definition.winCondition === 'rescue') {
    if (!definition.rescueSpriteKey) errors.push('winCondition: rescue requires rescueSpriteKey');
    if (!definition.rescueHoldSeconds) errors.push('winCondition: rescue requires rescueHoldSeconds');
    if (!definition.rescueExtractSeconds) errors.push('winCondition: rescue requires rescueExtractSeconds');
  }
  if (definition.winCondition === 'unlock-gate') {
    if (!definition.unlockKeyTarget) errors.push('winCondition: unlock-gate requires unlockKeyTarget');
    if (!definition.unlockHoldSeconds) errors.push('winCondition: unlock-gate requires unlockHoldSeconds');
  }
  if (definition.runtimeTemplate === 'puzzle-room') {
    if (definition.winCondition !== 'solve-puzzle') {
      errors.push('runtimeTemplate: puzzle-room requires winCondition=solve-puzzle');
    }
    if (!definition.puzzleRoom) {
      errors.push('runtimeTemplate: puzzle-room requires puzzleRoom');
    }
  }
  if (definition.winCondition === 'solve-puzzle') {
    if (definition.runtimeTemplate !== 'puzzle-room') {
      errors.push('winCondition: solve-puzzle requires runtimeTemplate=puzzle-room');
    }
    if (!definition.puzzleRoom) errors.push('winCondition: solve-puzzle requires puzzleRoom');
  }
  if (definition.runtimeTemplate === 'agent-dashboard') {
    if (definition.winCondition !== 'approve-deploy') {
      errors.push('runtimeTemplate: agent-dashboard requires winCondition=approve-deploy');
    }
    if (!definition.agentDashboard) {
      errors.push('runtimeTemplate: agent-dashboard requires agentDashboard');
    }
  }
  if (definition.winCondition === 'approve-deploy') {
    if (definition.runtimeTemplate !== 'agent-dashboard') {
      errors.push('winCondition: approve-deploy requires runtimeTemplate=agent-dashboard');
    }
    if (!definition.agentDashboard) errors.push('winCondition: approve-deploy requires agentDashboard');
  }
  if (definition.runtimeTemplate === 'decision-room') {
    if (definition.winCondition !== 'select-decision') {
      errors.push('runtimeTemplate: decision-room requires winCondition=select-decision');
    }
    if (!definition.decisionRoom) {
      errors.push('runtimeTemplate: decision-room requires decisionRoom');
    }
  }
  if (definition.winCondition === 'select-decision') {
    if (definition.runtimeTemplate !== 'decision-room') {
      errors.push('winCondition: select-decision requires runtimeTemplate=decision-room');
    }
    if (!definition.decisionRoom) errors.push('winCondition: select-decision requires decisionRoom');
  }
  if (definition.puzzleRoom) {
    const puzzle = definition.puzzleRoom;
    const pointKey = (point: PuzzlePoint) => `${point.x},${point.y}`;
    const inBounds = (point: PuzzlePoint) =>
      point.x >= 0 && point.y >= 0 && point.x < puzzle.gridWidth && point.y < puzzle.gridHeight;
    const seen = new Map<string, string>();
    const requireInBounds = (point: PuzzlePoint, label: string) => {
      if (!inBounds(point)) errors.push(`puzzleRoom.${label}: point ${pointKey(point)} outside ${puzzle.gridWidth}x${puzzle.gridHeight}`);
    };
    const requireUnique = (point: PuzzlePoint, label: string) => {
      const key = pointKey(point);
      const existing = seen.get(key);
      if (existing) errors.push(`puzzleRoom.${label}: point ${key} overlaps ${existing}`);
      seen.set(key, label);
    };
    requireInBounds(puzzle.start, 'start');
    requireInBounds(puzzle.exit, 'exit');
    requireUnique(puzzle.start, 'start');
    for (const [index, wall] of puzzle.walls.entries()) {
      requireInBounds(wall, `walls.${index}`);
      requireUnique(wall, `walls.${index}`);
    }
    for (const [index, block] of puzzle.blocks.entries()) {
      requireInBounds(block, `blocks.${index}`);
      requireUnique(block, `blocks.${index}`);
    }
    for (const [index, switchPoint] of puzzle.switches.entries()) {
      requireInBounds(switchPoint, `switches.${index}`);
    }
    for (const [index, gem] of puzzle.gems.entries()) {
      requireInBounds(gem, `gems.${index}`);
      requireUnique(gem, `gems.${index}`);
    }
    for (const [index, hazard] of puzzle.hazards.entries()) {
      requireInBounds(hazard, `hazards.${index}`);
    }
    if (puzzle.blocks.length < puzzle.switches.length) {
      errors.push('puzzleRoom: switches require at least as many pushable blocks');
    }
  }
  if (definition.agentDashboard) {
    const agentIds = new Set(definition.agentDashboard.agents.map((agent) => agent.id));
    for (const task of definition.agentDashboard.tasks) {
      if (!agentIds.has(task.ownerId)) errors.push(`agentDashboard.tasks "${task.id}": ownerId "${task.ownerId}" is not in agents`);
    }
    for (const approval of definition.agentDashboard.approvals) {
      if (!agentIds.has(approval.requesterId)) errors.push(`agentDashboard.approvals "${approval.id}": requesterId "${approval.requesterId}" is not in agents`);
    }
    for (const log of definition.agentDashboard.logs) {
      if (!agentIds.has(log.agentId)) errors.push(`agentDashboard.logs "${log.id}": agentId "${log.agentId}" is not in agents`);
    }
    if (definition.agentDashboard.deploymentHealth.checksPassing > definition.agentDashboard.deploymentHealth.checksTotal) {
      errors.push('agentDashboard.deploymentHealth: checksPassing cannot exceed checksTotal');
    }
  }
  if (definition.decisionRoom) {
    const stakeholderIds = new Set(definition.decisionRoom.stakeholders.map((stakeholder) => stakeholder.id));
    const optionIds = new Set(definition.decisionRoom.options.map((option) => option.id));
    for (const option of definition.decisionRoom.options) {
      if (!stakeholderIds.has(option.ownerId)) errors.push(`decisionRoom.options "${option.id}": ownerId "${option.ownerId}" is not in stakeholders`);
    }
    for (const audit of definition.decisionRoom.auditTrail) {
      if (!stakeholderIds.has(audit.actorId)) errors.push(`decisionRoom.auditTrail "${audit.id}": actorId "${audit.actorId}" is not in stakeholders`);
    }
    if (!optionIds.has(definition.decisionRoom.decisionGate.recommendedOptionId)) {
      errors.push(`decisionRoom.decisionGate: recommendedOptionId "${definition.decisionRoom.decisionGate.recommendedOptionId}" is not in options`);
    }
  }

  return errors;
}
