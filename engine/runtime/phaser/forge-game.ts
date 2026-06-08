/**
 * Phaser runtime — turns a validated GameDefinition into a playable top-down action game.
 *
 * This is the Path A SDK surface: the AI supplies bounded data, while the runtime owns movement,
 * combat, enemy AI, boss patterns, HUD, lifecycle, and deterministic browser test hooks.
 */
import * as Phaser from 'phaser';
import { resolveAssetUrl } from '../../storage/asset-url';
import type { Asset, Boss, Enemy, FeelProfile, GameDefinition, PlayStyle, SpriteSheetAnimation, Upgrade } from '../game-definition';

const hex = (c: string): number => Phaser.Display.Color.HexStringToColor(c).color;
const colorLuma = (color: number): number => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const isBrightPalette = (def: GameDefinition): boolean =>
  colorLuma(hex(def.palette.floor)) > 168 || colorLuma(hex(def.palette.background)) > 150;
const clamp = Phaser.Math.Clamp;
const DEFAULT_PLAY_STYLE: PlayStyle = {
  pressure: 'standard',
  weaponCadence: 'steady',
  camera: 'responsive',
  readability: 'arcade',
};
const DEFAULT_FEEL_PROFILE: FeelProfile = 'arcade-survivor';

interface ForgeHandle { destroy(): void; }

type ForgeSceneKey = 'title' | 'forge' | 'win' | 'lose';
type Facing = 'right' | 'left' | 'up' | 'down';
type TestAction = 'up' | 'down' | 'left' | 'right' | 'attack' | 'dash' | 'start' | 'pause' | 'restart';
type EliteKind = 'none' | 'swift' | 'armored' | 'volatile';
type PlayerAnimationState = 'idle' | 'move' | 'dash' | 'attack' | 'hurt' | 'fire';

interface ForgeTestState {
  scene: 'title' | 'play' | 'pause' | 'win' | 'lose';
  runtimeTemplate: GameDefinition['runtimeTemplate'];
  winCondition: GameDefinition['winCondition'];
  feelProfile: FeelProfile;
  playStyle: PlayStyle;
  weaponCooldownMs: number;
  weaponProjectiles: number;
  weaponAutoFire: boolean;
  spawnPressureScale: number;
  pressureRamp: number;
  upgradeChoiceKinds: Upgrade['kind'][];
  enemyRoleSignature: Enemy['role'][];
  waveRoleSignature: Enemy['role'][];
  waveCount: number;
  playerHealth: number;
  score: number;
  scoreTarget: number | null;
  relics: number;
  relicTarget: number | null;
  captureProgress: number;
  captureTarget: number | null;
  captureZoneVisible: boolean;
  captureContested: boolean;
  escortProgress: number;
  escortTarget: number | null;
  escortHealth: number | null;
  escortVisible: boolean;
  escortContested: boolean;
  defendProgress: number;
  defendTarget: number | null;
  defendHealth: number | null;
  defendVisible: boolean;
  defendContested: boolean;
  repairProgress: number;
  repairTarget: number | null;
  repairNodesFixed: number;
  repairVisible: boolean;
  repairContested: boolean;
  extractProgress: number;
  extractTarget: number | null;
  extractVisible: boolean;
  extractContested: boolean;
  rescuePhase: 'recover' | 'extract' | 'complete' | null;
  rescueProgress: number;
  rescueTarget: number | null;
  rescueExtractProgress: number;
  rescueExtractTarget: number | null;
  rescueHealth: number | null;
  rescueVisible: boolean;
  rescueContested: boolean;
  unlockKeys: number;
  unlockKeyTarget: number | null;
  unlockProgress: number;
  unlockTarget: number | null;
  unlockGateVisible: boolean;
  unlockReady: boolean;
  unlockContested: boolean;
  combo: number;
  comboMultiplier: number;
  comboVisible: boolean;
  level: number;
  choosingUpgrade: boolean;
  upgradeChoices: number;
  touchControlsVisible: boolean;
  combatFeedbackVisible: boolean;
  impactBeatVisible: boolean;
  impactBeatCount: number;
  bossTelegraphVisible: boolean;
  bossPhase: number | null;
  bossWindupSeconds: number;
  arenaHazardVisible: boolean;
  supportPulseVisible: boolean;
  guardianShieldVisible: boolean;
  sentinelLaneVisible: boolean;
  arenaDecorAnchors: number;
  ambientMotionFx: number;
  profilePresentationFx: number;
  profileDirectorPhase: string | null;
  profileFramingFx: number;
  profileFramingMode: string | null;
  profileAnimationFrame: number;
  cameraDirectorFx: number;
  cameraDirectorMode: string | null;
  cameraDirectorIntensity: number;
  literalBackdrop: boolean;
  quietLiteralBackdrop: boolean;
  visualEvidenceActive: boolean;
  visualEvidenceMaskCount: number;
  flightLaneFx: number;
  flightScrollOffset: number;
  platformerFx: number;
  platformerGrounded: boolean;
  platformerJumpFx: number;
  puzzleFx: number;
  puzzleMoves: number;
  puzzleMoveLimit: number | null;
  puzzleGems: number;
  puzzleGemTarget: number | null;
  puzzleSwitchesLit: number;
  puzzleSwitchTarget: number | null;
  puzzleBlocks: number;
  puzzleExitVisible: boolean;
  puzzleSolved: boolean;
  puzzlePlayerCell: { x: number; y: number } | null;
  agentDashboardFx: number;
  agentDashboardApprovals: number;
  agentDashboardApprovalTarget: number | null;
  agentDashboardTasksDone: number;
  agentDashboardTaskTarget: number | null;
  agentDashboardHealth: number | null;
  agentDashboardSelectedAgent: string | null;
  agentDashboardReady: boolean;
  decisionRoomFx: number;
  decisionRoomOptions: number;
  decisionRoomEvidence: number;
  decisionRoomStakeholders: number;
  decisionRoomSelectedOption: string | null;
  decisionRoomRecommendedOption: string | null;
  decisionRoomConfidence: number | null;
  decisionRoomReady: boolean;
  actorAnimationFx: number;
  playerAnimationState: PlayerAnimationState;
  enemyAnimationStates: string[];
  actorRigFx: number;
  actorRigFrame: number;
  bossTransitionFx: number;
  bossTransitionState: string | null;
  spriteSheetAssets: number;
  spriteSheetAnimatedKeys: string[];
  spriteSheetAnimationNames: string[];
  spriteSheetFrame: number;
  encounterPlateVisible: boolean;
  encounterPlateTitle: string | null;
  encounterPlateObjective: string | null;
  encounterThreatLevel: number;
  tacticalRadarVisible: boolean;
  tacticalRadarEnemyPips: number;
  tacticalRadarObjectivePips: number;
  tacticalRadarBossVisible: boolean;
  directorFeedVisible: boolean;
  directorFeedEntries: number;
  directorFeedLatest: string | null;
  objectivePickupVisible: boolean;
  objectiveGuideVisible: boolean;
  objectiveGuideLabel: string | null;
  objectiveGuideDistance: number | null;
  objectiveMotionFx: number;
  objectiveMotionFrame: number;
  pendingSpawns: number;
  enemiesAlive: number;
  eliteEnemies: number;
  bossHealth: number | null;
  playerPos: { x: number; y: number };
  assetKeys?: {
    player: string;
    firstEnemy: string | null;
    boss: string | null;
    floor: string | null;
    background: string | null;
  };
  textureKeys?: {
    player: string | null;
    firstEnemy: string | null;
    boss: string | null;
    floor: string | null;
    background: string | null;
  };
  sourceBacked?: {
    player: boolean;
    firstEnemy: boolean;
    boss: boolean;
    floor: boolean;
    background: boolean;
  };
  fallbackTextures?: {
    player: boolean;
    firstEnemy: boolean;
    boss: boolean;
    floor: boolean;
    background: boolean;
  };
}

interface ForgeTestApi {
  getState(): ForgeTestState;
  press(action: TestAction, ms?: number): void;
  spawnEnemy(typeIndex: number): void;
  spawnContactEnemy(typeIndex: number): void;
  spawnEliteEnemy(typeIndex: number): void;
  damagePlayer(amount: number): void;
  damageFirstEnemy(amount: number): void;
  triggerComboReward(): void;
  stageVisualEvidence(): void;
  stagePublicDemo(): void;
  spawnBoss(): void;
  spawnContactBoss(): void;
  triggerBossTelegraph(): void;
  triggerArenaHazard(): void;
  triggerSapperMine(): void;
  triggerObjectivePickup(): void;
  collectObjectivePickup(): void;
  enterCaptureZone(): void;
  advanceEscort(): void;
  fortifyDefendCore(): void;
  repairNode(): void;
  enterExtractZone(): void;
  rescueSurvivor(): void;
  enterRescueExtraction(): void;
  collectUnlockKey(): void;
  enterUnlockGate(): void;
  approveAgentDashboard(): void;
  chooseDecisionRoomOption(): void;
  levelUp(): void;
  chooseUpgrade(index: number): void;
  killAllEnemies(): void;
  triggerWin(): void;
  triggerLose(): void;
}

type BossPattern = Boss['patterns'][number];

declare global {
  interface Window {
    __GAME_TEST__?: ForgeTestApi;
  }
}

interface Intent {
  dx: number;
  dy: number;
  attack: boolean;
  dash: boolean;
}

type ArcadeImage = Phaser.Physics.Arcade.Image;
type ForgeTextureVariant = Enemy['role'] | 'player' | 'escort' | 'rescue' | 'defend-core' | 'bullet' | 'enemy-bullet' | 'orb' | 'boss';
type ArenaMood = 'haunted' | 'security' | 'space' | 'bakery' | 'coast' | 'sky' | 'platform' | 'seismic' | 'neutral';
type ObjectivePickupKind = 'score-cache' | 'supply' | 'relic' | 'access-key';
type EnemyReadout = {
  bg: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  width: number;
  height: number;
};
type EliteAura = {
  ring: Phaser.GameObjects.Arc;
  pip: Phaser.GameObjects.Rectangle;
  kind: Exclude<EliteKind, 'none'>;
};
type ArenaHazard = {
  x: number;
  y: number;
  radius: number;
  armAt: number;
  expireAt: number;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  spokes: Phaser.GameObjects.Graphics;
};
type ObjectivePickupExtras = {
  ring: Phaser.GameObjects.Arc;
  pip: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  aura?: Phaser.GameObjects.Graphics | undefined;
  kind: ObjectivePickupKind;
};
type ObjectiveGuideTarget = {
  x: number;
  y: number;
  label: string;
  color: string;
};
type ObjectiveGuide = {
  line: Phaser.GameObjects.Graphics;
  beacon: Phaser.GameObjects.Arc;
  arrow: Phaser.GameObjects.Triangle;
  label: Phaser.GameObjects.Text;
};
type PuzzleBoardLayout = {
  ox: number;
  oy: number;
  tile: number;
  width: number;
  height: number;
};
type PuzzleBlockRuntime = {
  id: string;
  x: number;
  y: number;
  rect: Phaser.GameObjects.Rectangle;
  shine: Phaser.GameObjects.Rectangle;
};
type PuzzleGemRuntime = {
  id: string;
  x: number;
  y: number;
  value: number;
  taken: boolean;
  gem: Phaser.GameObjects.Rectangle;
  halo: Phaser.GameObjects.Arc;
};
type PuzzleSwitchRuntime = {
  x: number;
  y: number;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Rectangle;
};
type PuzzleExitRuntime = {
  x: number;
  y: number;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Arc;
};
type AgentDashboardLayer = {
  container: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Rectangle;
  sweep: Phaser.GameObjects.Graphics;
  statusText: Phaser.GameObjects.Text;
  approvalText: Phaser.GameObjects.Text;
  healthText: Phaser.GameObjects.Text;
  agentTexts: Phaser.GameObjects.Text[];
  taskTexts: Phaser.GameObjects.Text[];
  approvalCards: Array<{
    id: string;
    card: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
    status: Phaser.GameObjects.Text;
  }>;
  logTexts: Phaser.GameObjects.Text[];
  metricTexts: Phaser.GameObjects.Text[];
};
type DecisionRoomLayer = {
  container: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Rectangle;
  sweep: Phaser.GameObjects.Graphics;
  statusText: Phaser.GameObjects.Text;
  recommendationText: Phaser.GameObjects.Text;
  stakeholderTexts: Phaser.GameObjects.Text[];
  evidenceTexts: Phaser.GameObjects.Text[];
  optionCards: Array<{
    id: string;
    card: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
    status: Phaser.GameObjects.Text;
  }>;
  auditTexts: Phaser.GameObjects.Text[];
};
type EncounterPlate = {
  container: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Rectangle;
  accent: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  objective: Phaser.GameObjects.Text;
  threat: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Rectangle[];
};
type TacticalRadar = {
  container: Phaser.GameObjects.Container;
  grid: Phaser.GameObjects.Graphics;
  sweep: Phaser.GameObjects.Graphics;
  player: Phaser.GameObjects.Triangle;
  enemyPips: Phaser.GameObjects.Arc[];
  objectivePips: Phaser.GameObjects.Rectangle[];
  bossPip: Phaser.GameObjects.Rectangle;
  width: number;
  height: number;
};
type DirectorEventEntry = {
  id: number;
  text: string;
  color: string;
  createdAt: number;
  expiresAt: number;
};
type DirectorFeed = {
  container: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  lines: Phaser.GameObjects.Text[];
  bars: Phaser.GameObjects.Rectangle[];
};
type ProfileFrameLayer = {
  mode: string;
  fx: number;
  pulse: Phaser.GameObjects.Graphics;
  accents: Phaser.GameObjects.GameObject[];
};
type CameraDirectorLayer = {
  mode: string;
  graphics: Phaser.GameObjects.Graphics;
};
type VisualEvidenceMaskState = {
  alpha: number | undefined;
  visible: boolean | undefined;
};
type ActorTell = {
  graphics: Phaser.GameObjects.Graphics;
  role: string;
  phase: number;
  radius: number;
  boss: boolean;
};
type ActorRig = {
  graphics: Phaser.GameObjects.Graphics;
  role: string;
  phase: number;
  radius: number;
  boss: boolean;
};
type CaptureZone = {
  x: number;
  y: number;
  radius: number;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  spokes: Phaser.GameObjects.Graphics;
  progress: Phaser.GameObjects.Graphics;
  pips: Phaser.GameObjects.Rectangle[];
};
type EscortRoute = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  line: Phaser.GameObjects.Graphics;
  progressLine: Phaser.GameObjects.Graphics;
  goal: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  beacons: Phaser.GameObjects.Rectangle[];
};
type DefendCore = {
  x: number;
  y: number;
  radius: number;
  image: ArcadeImage;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  shield: Phaser.GameObjects.Graphics;
  progress: Phaser.GameObjects.Graphics;
  healthBg: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
  pips: Phaser.GameObjects.Rectangle[];
};
type RepairNode = {
  x: number;
  y: number;
  radius: number;
  fixed: boolean;
  progress: number;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  signal: Phaser.GameObjects.Graphics;
  progressArc: Phaser.GameObjects.Graphics;
  pips: Phaser.GameObjects.Rectangle[];
};
type ExtractZone = {
  x: number;
  y: number;
  radius: number;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  beam: Phaser.GameObjects.Graphics;
  progress: Phaser.GameObjects.Graphics;
  pips: Phaser.GameObjects.Rectangle[];
};
type RescueObjective = {
  x: number;
  y: number;
  radius: number;
  ally: ArcadeImage;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  signal: Phaser.GameObjects.Graphics;
  progress: Phaser.GameObjects.Graphics;
  gateX: number;
  gateY: number;
  gateRadius: number;
  route: Phaser.GameObjects.Graphics;
  gate: Phaser.GameObjects.Arc;
  gateCore: Phaser.GameObjects.Arc;
  gateBeam: Phaser.GameObjects.Graphics;
  gateProgress: Phaser.GameObjects.Graphics;
  gateLabel: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Rectangle[];
};
type SpawnPoint = { x: number; y: number };
type TextureSpec = {
  key: string;
  color: string;
  radius: number;
  stroke: number;
  strokeAlpha: number;
  variant: ForgeTextureVariant;
};

const SAFE_STATE: ForgeTestState = {
  scene: 'title',
  runtimeTemplate: 'arena-action',
  winCondition: 'clear-waves',
  feelProfile: DEFAULT_FEEL_PROFILE,
  playStyle: DEFAULT_PLAY_STYLE,
  weaponCooldownMs: 0,
  weaponProjectiles: 0,
  weaponAutoFire: true,
  spawnPressureScale: 1,
  pressureRamp: 1,
  upgradeChoiceKinds: [],
  enemyRoleSignature: [],
  waveRoleSignature: [],
  waveCount: 0,
  playerHealth: 0,
  score: 0,
  scoreTarget: null,
  relics: 0,
  relicTarget: null,
  captureProgress: 0,
  captureTarget: null,
  captureZoneVisible: false,
  captureContested: false,
  escortProgress: 0,
  escortTarget: null,
  escortHealth: null,
  escortVisible: false,
  escortContested: false,
  defendProgress: 0,
  defendTarget: null,
  defendHealth: null,
  defendVisible: false,
  defendContested: false,
  repairProgress: 0,
  repairTarget: null,
  repairNodesFixed: 0,
  repairVisible: false,
  repairContested: false,
  extractProgress: 0,
  extractTarget: null,
  extractVisible: false,
  extractContested: false,
  rescuePhase: null,
  rescueProgress: 0,
  rescueTarget: null,
  rescueExtractProgress: 0,
  rescueExtractTarget: null,
  rescueHealth: null,
  rescueVisible: false,
  rescueContested: false,
  unlockKeys: 0,
  unlockKeyTarget: null,
  unlockProgress: 0,
  unlockTarget: null,
  unlockGateVisible: false,
  unlockReady: false,
  unlockContested: false,
  combo: 0,
  comboMultiplier: 1,
  comboVisible: false,
  level: 0,
  choosingUpgrade: false,
  upgradeChoices: 0,
  touchControlsVisible: false,
  combatFeedbackVisible: false,
  impactBeatVisible: false,
  impactBeatCount: 0,
  bossTelegraphVisible: false,
  bossPhase: null,
  bossWindupSeconds: 0,
  arenaHazardVisible: false,
  supportPulseVisible: false,
  guardianShieldVisible: false,
  sentinelLaneVisible: false,
  arenaDecorAnchors: 0,
  ambientMotionFx: 0,
  profilePresentationFx: 0,
  profileDirectorPhase: null,
  profileFramingFx: 0,
  profileFramingMode: null,
  profileAnimationFrame: 0,
  cameraDirectorFx: 0,
  cameraDirectorMode: null,
  cameraDirectorIntensity: 0,
  literalBackdrop: false,
  quietLiteralBackdrop: false,
  visualEvidenceActive: false,
  visualEvidenceMaskCount: 0,
  flightLaneFx: 0,
  flightScrollOffset: 0,
  platformerFx: 0,
  platformerGrounded: false,
  platformerJumpFx: 0,
  puzzleFx: 0,
  puzzleMoves: 0,
  puzzleMoveLimit: null,
  puzzleGems: 0,
  puzzleGemTarget: null,
  puzzleSwitchesLit: 0,
  puzzleSwitchTarget: null,
  puzzleBlocks: 0,
  puzzleExitVisible: false,
  puzzleSolved: false,
  puzzlePlayerCell: null,
  agentDashboardFx: 0,
  agentDashboardApprovals: 0,
  agentDashboardApprovalTarget: null,
  agentDashboardTasksDone: 0,
  agentDashboardTaskTarget: null,
  agentDashboardHealth: null,
  agentDashboardSelectedAgent: null,
  agentDashboardReady: false,
  decisionRoomFx: 0,
  decisionRoomOptions: 0,
  decisionRoomEvidence: 0,
  decisionRoomStakeholders: 0,
  decisionRoomSelectedOption: null,
  decisionRoomRecommendedOption: null,
  decisionRoomConfidence: null,
  decisionRoomReady: false,
  actorAnimationFx: 0,
  playerAnimationState: 'idle',
  enemyAnimationStates: [],
  actorRigFx: 0,
  actorRigFrame: 0,
  bossTransitionFx: 0,
  bossTransitionState: null,
  spriteSheetAssets: 0,
  spriteSheetAnimatedKeys: [],
  spriteSheetAnimationNames: [],
  spriteSheetFrame: 0,
  encounterPlateVisible: false,
  encounterPlateTitle: null,
  encounterPlateObjective: null,
  encounterThreatLevel: 0,
  tacticalRadarVisible: false,
  tacticalRadarEnemyPips: 0,
  tacticalRadarObjectivePips: 0,
  tacticalRadarBossVisible: false,
  directorFeedVisible: false,
  directorFeedEntries: 0,
  directorFeedLatest: null,
  objectivePickupVisible: false,
  objectiveGuideVisible: false,
  objectiveGuideLabel: null,
  objectiveGuideDistance: null,
  objectiveMotionFx: 0,
  objectiveMotionFrame: 0,
  pendingSpawns: 0,
  enemiesAlive: 0,
  eliteEnemies: 0,
  bossHealth: null,
  playerPos: { x: 0, y: 0 },
};

const DEPTH = {
  floor: 0,
  decor: 1,
  orb: 2,
  projectile: 3,
  enemy: 4,
  player: 5,
  foreground: 6,
  fx: 7,
  hud: 20,
  overlay: 30,
} as const;

const TEXT = {
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: '#ffffff',
};

class TitleScene extends Phaser.Scene {
  private def!: GameDefinition;

  constructor() { super('title'); }

  init(data: { def: GameDefinition }) { this.def = data.def; }

  create() {
    this.cameras.main.setBackgroundColor(this.def.palette.background);
    drawBackdrop(this, this.def, this.scale.width, this.scale.height);

    this.add.text(this.scale.width / 2, this.scale.height / 2 - 64, this.def.title, {
      ...TEXT,
      fontSize: '34px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5).setDepth(DEPTH.hud);

    this.add.text(this.scale.width / 2, this.scale.height / 2 + 8, `${this.def.genre} · ${this.def.arena.name}`, {
      ...TEXT,
      fontSize: '15px',
      color: this.def.palette.xp,
      align: 'center',
    }).setOrigin(0.5).setDepth(DEPTH.hud);

    this.add.text(this.scale.width / 2, this.scale.height / 2 + 58, 'Press Enter / Space to start', {
      ...TEXT,
      fontSize: '15px',
      color: '#d8dde8',
      align: 'center',
    }).setOrigin(0.5).setDepth(DEPTH.hud);

    this.input.keyboard?.once('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
  }

  startGame() {
    this.scene.start('forge', { def: this.def });
  }
}

class EndScene extends Phaser.Scene {
  private def!: GameDefinition;
  private score = 0;
  private label = 'You win';
  private color = '#c4e070';

  constructor(key: 'win' | 'lose') { super(key); }

  init(data: { def: GameDefinition; score?: number }) {
    this.def = data.def;
    this.score = data.score ?? 0;
    this.label = this.scene.key === 'win' ? 'You win' : 'You fell';
    this.color = this.scene.key === 'win' ? this.def.palette.xp : this.def.palette.danger;
  }

  create() {
    this.cameras.main.setBackgroundColor(this.def.palette.background);
    drawBackdrop(this, this.def, this.scale.width, this.scale.height);

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.42)
      .setOrigin(0, 0)
      .setDepth(DEPTH.overlay);

    this.add.text(this.scale.width / 2, this.scale.height / 2 - 38, this.label, {
      ...TEXT,
      fontSize: '34px',
      color: this.color,
      align: 'center',
    }).setOrigin(0.5).setDepth(DEPTH.overlay + 1);

    this.add.text(this.scale.width / 2, this.scale.height / 2 + 12, `Score ${this.score}`, {
      ...TEXT,
      fontSize: '18px',
      align: 'center',
    }).setOrigin(0.5).setDepth(DEPTH.overlay + 1);

    this.add.text(this.scale.width / 2, this.scale.height / 2 + 58, 'Press R / Enter to run it back', {
      ...TEXT,
      fontSize: '14px',
      color: '#d8dde8',
      align: 'center',
    }).setOrigin(0.5).setDepth(DEPTH.overlay + 1);

    this.input.keyboard?.once('keydown-R', () => this.restart());
    this.input.keyboard?.once('keydown-ENTER', () => this.restart());
  }

  restart() {
    this.scene.start('forge', { def: this.def });
  }
}

class ForgeScene extends Phaser.Scene {
  private def!: GameDefinition;
  private player!: ArcadeImage;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private orbs!: Phaser.Physics.Arcade.Group;
  private objectivePickups!: Phaser.Physics.Arcade.Group;
  private attackArc!: Phaser.GameObjects.Arc;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hpText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossThreatText!: Phaser.GameObjects.Text;
  private bossThreatMetaText!: Phaser.GameObjects.Text;
  private impactFrame!: Phaser.GameObjects.Graphics;
  private pauseOverlay: Phaser.GameObjects.Container | undefined;
  private upgradeOverlay: Phaser.GameObjects.Container | undefined;
  private upgradeChoices: Upgrade[] = [];
  private choosingUpgrade = false;
  private touchControls: Phaser.GameObjects.Container | undefined;
  private touchStickBase: Phaser.GameObjects.Arc | undefined;
  private touchStickThumb: Phaser.GameObjects.Arc | undefined;
  private touchStickPointerId: number | null = null;
  private touchStickCenter = { x: 0, y: 0 };
  private touchIntent: Intent = { dx: 0, dy: 0, attack: false, dash: false };
  private touchControlsVisible = false;

  private hp = 100;
  private maxHp = 100;
  private score = 0;
  private relics = 0;
  private captureProgress = 0;
  private captureZone: CaptureZone | undefined;
  private captureContested = false;
  private capturePulseAt = -Infinity;
  private escortAlly: ArcadeImage | undefined;
  private escortRoute: EscortRoute | undefined;
  private escortProgress = 0;
  private escortMaxHp = 60;
  private escortHp = 60;
  private escortContested = false;
  private escortPulseAt = -Infinity;
  private defendCore: DefendCore | undefined;
  private defendProgress = 0;
  private defendMaxHp = 80;
  private defendHp = 80;
  private defendContested = false;
  private defendPulseAt = -Infinity;
  private repairNodes: RepairNode[] = [];
  private repairContested = false;
  private repairPulseAt = -Infinity;
  private extractZone: ExtractZone | undefined;
  private extractProgress = 0;
  private extractContested = false;
  private extractPulseAt = -Infinity;
  private rescueObjective: RescueObjective | undefined;
  private rescuePhase: 'recover' | 'extract' | 'complete' = 'recover';
  private rescueProgress = 0;
  private rescueExtractProgress = 0;
  private rescueMaxHp = 62;
  private rescueHp = 62;
  private rescueContested = false;
  private rescuePulseAt = -Infinity;
  private unlockKeys = 0;
  private unlockGate: ExtractZone | undefined;
  private unlockProgress = 0;
  private unlockContested = false;
  private unlockPulseAt = -Infinity;
  private combo = 0;
  private comboExpiresAt = -Infinity;
  private comboVisibleUntil = -Infinity;
  private xp = 0;
  private level = 1;
  private xpToNext = 8;
  private elapsed = 0;
  private fireTimer = 0;
  private projectileDamage = 10;
  private cooldownMs = 360;
  private projectiles = 1;
  private autoFire = true;
  private moveSpeed = 200;
  private meleeDamage = 18;
  private meleeRange = 44;
  private magnetRange = 0;
  private facing: Facing = 'right';
  private lastAttackAt = -Infinity;
  private attackActiveUntil = -Infinity;
  private lastDashAt = -Infinity;
  private dashActiveUntil = -Infinity;
  private lastDamageAt = -Infinity;
  private spawnQueue: { at: number; enemy: Enemy; eliteKind: EliteKind }[] = [];
  private pendingSpawns = 0;
  private suppressSpawnsUntil = -Infinity;
  private bossSpawned = false;
  private boss: ArcadeImage | undefined;
  private bossPatternIndex = 0;
  private bossPatternState: 'idle' | 'telegraph' | 'execute' = 'idle';
  private bossPatternTimer = 0;
  private bossTelegraphUntil = -Infinity;
  private publicDemoBossHoldUntil = -Infinity;
  private arenaHazards: ArenaHazard[] = [];
  private arenaHazardTimer = 0;
  private arenaHazardVisibleUntil = -Infinity;
  private supportPulseUntil = -Infinity;
  private guardianShieldUntil = -Infinity;
  private sentinelLaneUntil = -Infinity;
  private lastHazardDamageAt = -Infinity;
  private arenaDecorAnchors = 0;
  private ambientMotionFx = 0;
  private profilePresentationFx = 0;
  private profileDirectorPhase: string | null = null;
  private profileFrameLayer: ProfileFrameLayer | undefined;
  private profileFramingFx = 0;
  private profileFramingMode: string | null = null;
  private profileAnimationFrame = 0;
  private cameraDirectorLayer: CameraDirectorLayer | undefined;
  private cameraDirectorFx = 0;
  private cameraDirectorMode: string | null = null;
  private cameraDirectorIntensity = 0;
  private visualEvidenceMaskedObjects = new Map<Phaser.GameObjects.GameObject, VisualEvidenceMaskState>();
  private coastalBossEvidenceLayer: Phaser.GameObjects.Graphics | undefined;
  private coastalBossEvidenceForeground: Phaser.GameObjects.Image | undefined;
  private escortEvidenceLayer: Phaser.GameObjects.Graphics | undefined;
  private flightLaneLayer: Phaser.GameObjects.Graphics | undefined;
  private flightEvidenceForeground: Phaser.GameObjects.Image | undefined;
  private shockwaveEvidenceForeground: Phaser.GameObjects.Image | undefined;
  private flightLaneFx = 0;
  private flightScrollOffset = 0;
  private platformerLayer: Phaser.GameObjects.Graphics | undefined;
  private platformerEdgeLayer: Phaser.GameObjects.Graphics | undefined;
  private platformerEvidenceLayer: Phaser.GameObjects.Graphics | undefined;
  private platformerEvidenceForeground: Phaser.GameObjects.Image | undefined;
  private platformSolids: Phaser.GameObjects.Rectangle[] = [];
  private platformerFx = 0;
  private platformerGrounded = false;
  private platformerJumpFx = 0;
  private puzzleLayer: Phaser.GameObjects.Container | undefined;
  private puzzleBoard: PuzzleBoardLayout | undefined;
  private puzzleBlocks: PuzzleBlockRuntime[] = [];
  private puzzleGems: PuzzleGemRuntime[] = [];
  private puzzleSwitches: PuzzleSwitchRuntime[] = [];
  private puzzleExit: PuzzleExitRuntime | undefined;
  private puzzlePlayerCell: { x: number; y: number } | null = null;
  private puzzleMoves = 0;
  private puzzleSolved = false;
  private puzzleFx = 0;
  private puzzleNextMoveAt = 0;
  private agentDashboardLayer: AgentDashboardLayer | undefined;
  private agentDashboardFx = 0;
  private agentDashboardApproved = new Set<string>();
  private agentDashboardSelectedAgentId: string | null = null;
  private agentDashboardLastApproveAt = -Infinity;
  private decisionRoomLayer: DecisionRoomLayer | undefined;
  private decisionRoomFx = 0;
  private decisionRoomSelectedOptionId: string | null = null;
  private decisionRoomLastSelectAt = -Infinity;
  private objectivePickupTimer = 0;
  private objectivePickupVisibleUntil = -Infinity;
  private objectiveGuide: ObjectiveGuide | undefined;
  private objectiveGuideVisible = false;
  private objectiveGuideLabel: string | null = null;
  private objectiveGuideDistance: number | null = null;
  private objectiveMotionFrame = 0;
  private encounterPlate: EncounterPlate | undefined;
  private encounterPlateTitle: string | null = null;
  private encounterPlateObjective: string | null = null;
  private encounterThreatLevel = 0;
  private tacticalRadar: TacticalRadar | undefined;
  private tacticalRadarEnemyPips = 0;
  private tacticalRadarObjectivePips = 0;
  private tacticalRadarBossVisible = false;
  private directorFeed: DirectorFeed | undefined;
  private directorEvents: DirectorEventEntry[] = [];
  private directorEventSerial = 0;
  private visualEvidenceModeUntil = -Infinity;
  private floorTextureKey: string | null = null;
  private backdropTextureKey: string | null = null;
  private generatedFallbackKeys = new Set<string>();
  private playerShadow: Phaser.GameObjects.Ellipse | undefined;
  private playerActorLayer: Phaser.GameObjects.Graphics | undefined;
  private actorAnimationFx = 0;
  private playerAnimationState: PlayerAnimationState = 'idle';
  private enemyAnimationStates: string[] = [];
  private playerRigLayer: Phaser.GameObjects.Graphics | undefined;
  private actorRigFx = 0;
  private actorRigFrame = 0;
  private bossTransitionFx = 0;
  private bossTransitionState: string | null = null;
  private spriteSheetAnimatedKeys = new Set<string>();
  private spriteSheetAnimationNames = new Set<string>();
  private spriteSheetFrame = 0;
  private lastTrailAt = -Infinity;
  private lastFireAt = -Infinity;
  private combatFeedbackUntil = -Infinity;
  private impactBeatUntil = -Infinity;
  private impactBeatCount = 0;
  private impactBeatColor = '#ffffff';
  private impactBeatStrength = 0;
  private over = false;
  private paused = false;
  private externalIntent: Intent = { dx: 0, dy: 0, attack: false, dash: false };
  private externalIntentRemainingMs = 0;

  constructor() { super('forge'); }

  init(data: { def: GameDefinition }) { this.def = data.def; }

  private playStyle(): PlayStyle {
    return this.def.playStyle ?? DEFAULT_PLAY_STYLE;
  }

  private feelProfile(): FeelProfile {
    return this.def.feelProfile ?? DEFAULT_FEEL_PROFILE;
  }

  private runtimeTemplate(): GameDefinition['runtimeTemplate'] {
    return this.def.runtimeTemplate ?? 'arena-action';
  }

  private isFlightShooter() {
    return this.runtimeTemplate() === 'flight-shooter';
  }

  private isPlatformer() {
    return this.runtimeTemplate() === 'platformer';
  }

  private isPuzzleRoom() {
    return this.runtimeTemplate() === 'puzzle-room';
  }

  private isAgentDashboard() {
    return this.runtimeTemplate() === 'agent-dashboard';
  }

  private isDecisionRoom() {
    return this.runtimeTemplate() === 'decision-room';
  }

  private profileTuning() {
    const profile = this.feelProfile();
    if (profile === 'bullet-hell-raid') {
      return {
        pressureCount: 1.08,
        pressureTime: 0.92,
        pressureInterval: 0.88,
        pressureTelegraph: 0.95,
        playerSpeed: 1.02,
        ramp: 1.22,
        cooldown: 0.92,
        damage: 0.96,
        projectiles: 1,
        camera: 1.14,
        readability: 1.08,
        bossTempo: 0.84,
        bossTelegraph: 1,
        bossRecovery: 0.86,
        objectiveProgress: 0.94,
        objectiveContest: 1.12,
        objectivePickupInterval: 1,
      };
    }
    if (profile === 'siege-defense') {
      return {
        pressureCount: 1.06,
        pressureTime: 0.96,
        pressureInterval: 0.92,
        pressureTelegraph: 1.04,
        playerSpeed: 0.98,
        ramp: 1.16,
        cooldown: 0.98,
        damage: 1.04,
        projectiles: 0,
        camera: 1.06,
        readability: 1.1,
        bossTempo: 0.94,
        bossTelegraph: 1.06,
        bossRecovery: 0.94,
        objectiveProgress: 0.9,
        objectiveContest: 1.18,
        objectivePickupInterval: 1.05,
      };
    }
    if (profile === 'cozy-explorer') {
      return {
        pressureCount: 0.9,
        pressureTime: 1.12,
        pressureInterval: 1.12,
        pressureTelegraph: 1.18,
        playerSpeed: 1.02,
        ramp: 0.72,
        cooldown: 1.04,
        damage: 1.06,
        projectiles: 0,
        camera: 0.74,
        readability: 0.9,
        bossTempo: 1.12,
        bossTelegraph: 1.12,
        bossRecovery: 1.06,
        objectiveProgress: 1.12,
        objectiveContest: 0.72,
        objectivePickupInterval: 0.78,
      };
    }
    if (profile === 'score-chaser') {
      return {
        pressureCount: 1.02,
        pressureTime: 0.95,
        pressureInterval: 0.92,
        pressureTelegraph: 0.96,
        playerSpeed: 1.05,
        ramp: 1.08,
        cooldown: 0.94,
        damage: 0.98,
        projectiles: 0,
        camera: 1.04,
        readability: 1.12,
        bossTempo: 0.98,
        bossTelegraph: 0.96,
        bossRecovery: 0.96,
        objectiveProgress: 1,
        objectiveContest: 1,
        objectivePickupInterval: 0.65,
      };
    }
    return {
      pressureCount: 1,
      pressureTime: 1,
      pressureInterval: 1,
      pressureTelegraph: 1,
      playerSpeed: 1,
      ramp: 1,
      cooldown: 1,
      damage: 1,
      projectiles: 0,
      camera: 1,
      readability: 1,
      bossTempo: 1,
      bossTelegraph: 1,
      bossRecovery: 1,
      objectiveProgress: 1,
      objectiveContest: 1,
      objectivePickupInterval: 1,
    };
  }

  private profileAnimationTuning() {
    const profile = this.feelProfile();
    if (profile === 'bullet-hell-raid') {
      return { playerPulse: 0.038, playerRate: 0.008, enemyPulse: 0.048, enemyRate: 0.0065, frameMs: 90 };
    }
    if (profile === 'siege-defense') {
      return { playerPulse: 0.024, playerRate: 0.0048, enemyPulse: 0.03, enemyRate: 0.0042, frameMs: 150 };
    }
    if (profile === 'cozy-explorer') {
      return { playerPulse: 0.018, playerRate: 0.0036, enemyPulse: 0.022, enemyRate: 0.0032, frameMs: 210 };
    }
    if (profile === 'score-chaser') {
      return { playerPulse: 0.034, playerRate: 0.007, enemyPulse: 0.04, enemyRate: 0.0058, frameMs: 105 };
    }
    return { playerPulse: 0.025, playerRate: 0.006, enemyPulse: 0.035, enemyRate: 0.004, frameMs: 130 };
  }

  private profileCameraTuning() {
    const profile = this.feelProfile();
    if (profile === 'bullet-hell-raid') {
      return { mode: 'raid-assault', zoom: 0.026, focus: 1, scan: 1.2 };
    }
    if (profile === 'siege-defense') {
      return { mode: 'siege-lock', zoom: 0.016, focus: 0.86, scan: 0.72 };
    }
    if (profile === 'cozy-explorer') {
      return { mode: 'cozy-wide', zoom: 0.006, focus: 0.54, scan: 0.42 };
    }
    if (profile === 'score-chaser') {
      return { mode: 'score-sprint', zoom: 0.022, focus: 0.92, scan: 1.08 };
    }
    return { mode: 'survivor-balance', zoom: 0.012, focus: 0.68, scan: 0.62 };
  }

  private pressureProfile() {
    const pressure = this.playStyle().pressure;
    const base = pressure === 'relaxed'
      ? { countScale: 0.84, timeScale: 1.08, intervalScale: 1.14, telegraphScale: 1.15, playerSpeedScale: 0.98 }
      : pressure === 'intense'
        ? { countScale: 1.24, timeScale: 0.78, intervalScale: 0.74, telegraphScale: 0.82, playerSpeedScale: 1.04 }
        : pressure === 'siege'
          ? { countScale: 1.12, timeScale: 0.9, intervalScale: 0.9, telegraphScale: 0.96, playerSpeedScale: 0.96 }
          : { countScale: 1, timeScale: 1, intervalScale: 1, telegraphScale: 1, playerSpeedScale: 1 };
    const tuning = this.profileTuning();
    return {
      countScale: base.countScale * tuning.pressureCount,
      timeScale: base.timeScale * tuning.pressureTime,
      intervalScale: base.intervalScale * tuning.pressureInterval,
      telegraphScale: base.telegraphScale * tuning.pressureTelegraph,
      playerSpeedScale: base.playerSpeedScale * tuning.playerSpeed,
    };
  }

  private pressureRampForWave(waveIndex: number) {
    const pressure = this.playStyle().pressure;
    const step = pressure === 'relaxed' ? 0.05 : pressure === 'intense' ? 0.18 : pressure === 'siege' ? 0.14 : 0.1;
    return 1 + Math.max(0, waveIndex) * step * this.profileTuning().ramp;
  }

  private currentPressureRamp() {
    const pressure = this.playStyle().pressure;
    const maxRamp = pressure === 'relaxed' ? 0.22 : pressure === 'intense' ? 0.72 : pressure === 'siege' ? 0.56 : 0.38;
    const horizon = Math.max(45, this.def.arena.durationSeconds || 90);
    const progress = clamp(this.elapsed / horizon, 0, 1);
    return 1 + progress * maxRamp * this.profileTuning().ramp;
  }

  private weaponCadenceProfile() {
    const cadence = this.playStyle().weaponCadence;
    const base = cadence === 'deliberate'
      ? { cooldownScale: 1.22, damageScale: 1.2, extraProjectiles: 0 }
      : cadence === 'rapid'
        ? { cooldownScale: 0.84, damageScale: 0.95, extraProjectiles: 0 }
        : cadence === 'bullet-hell'
          ? { cooldownScale: 0.72, damageScale: 0.88, extraProjectiles: 1 }
          : { cooldownScale: 1, damageScale: 1, extraProjectiles: 0 };
    const tuning = this.profileTuning();
    return {
      cooldownScale: base.cooldownScale * tuning.cooldown,
      damageScale: base.damageScale * tuning.damage,
      extraProjectiles: base.extraProjectiles + tuning.projectiles,
    };
  }

  private cameraShakeScale() {
    const camera = this.playStyle().camera;
    const base = camera === 'steady' ? 0.72 : camera === 'dramatic' ? 1.42 : 1;
    return base * this.profileTuning().camera;
  }

  private readabilityFxScale() {
    const readability = this.playStyle().readability;
    const base = readability === 'clean' ? 0.88 : readability === 'high-contrast' ? 1.16 : 1;
    return base * this.profileTuning().readability;
  }

  private bossTempoScale() {
    const pressure = this.playStyle().pressure;
    const base = pressure === 'relaxed' ? 1.16 : pressure === 'intense' ? 0.76 : pressure === 'siege' ? 0.88 : 1;
    return base * this.profileTuning().bossTempo;
  }

  private hazardIntervalScale() {
    const pressure = this.playStyle().pressure;
    if (pressure === 'relaxed') return 1.3;
    if (pressure === 'intense') return 0.72;
    if (pressure === 'siege') return 0.82;
    return 1;
  }

  private currentBossPhase() {
    if (!this.boss?.active) return null;
    const hp = (this.boss.getData('hp') as number | undefined) ?? 0;
    const maxHp = Math.max(1, (this.boss.getData('maxHp') as number | undefined) ?? hp);
    const ratio = hp / maxHp;
    if (ratio <= 0.34) return 3;
    if (ratio <= 0.67) return 2;
    return 1;
  }

  private currentBossPattern(): BossPattern {
    const patterns: BossPattern[] = this.def.boss?.patterns.length ? [...this.def.boss.patterns] : ['radial-burst'];
    return ((this.boss?.getData('currentPattern') as BossPattern | undefined) ?? patterns[this.bossPatternIndex % patterns.length] ?? 'radial-burst');
  }

  private bossPhaseTempoScale() {
    const phase = this.currentBossPhase() ?? 1;
    if (phase >= 3) return 0.7;
    if (phase === 2) return 0.84;
    return 1;
  }

  private bossTelegraphSeconds(pattern: BossPattern) {
    const base = pattern === 'summon'
      ? 0.72
      : pattern === 'minefield' || pattern === 'vortex' || pattern === 'shockwave' || pattern === 'laser-grid'
        ? 0.82
        : pattern === 'beam' || pattern === 'charge'
          ? 0.9
          : 0.62;
    const pressure = this.playStyle().pressure;
    const pressureScale = pressure === 'intense' ? 0.9 : pressure === 'relaxed' ? 1.08 : 1;
    const cameraScale = this.playStyle().camera === 'dramatic' ? 1.05 : 1;
    return base * pressureScale * cameraScale * this.profileTuning().bossTelegraph;
  }

  private bossRecoverySeconds() {
    const phase = this.currentBossPhase() ?? 1;
    return Math.max(0.22, (0.38 - (phase - 1) * 0.06) * this.profileTuning().bossRecovery);
  }

  private objectiveProgressScale() {
    return this.profileTuning().objectiveProgress;
  }

  private objectiveContestScale() {
    return this.profileTuning().objectiveContest;
  }

  private objectivePickupIntervalScale() {
    return this.profileTuning().objectivePickupInterval;
  }

  preload() {
    this.preloadAssetSources();
    this.ensureGameplayTextures(false);
  }

  create() {
    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, width, height);
    this.physics.world.gravity.set(0, this.isPlatformer() ? 980 : 0);

    this.maxHp = this.def.player.maxHealth;
    this.hp = this.maxHp;
    const w0 = this.def.player.weapons[0]!;
    const cadence = this.weaponCadenceProfile();
    const pressure = this.pressureProfile();
    this.projectileDamage = Math.max(1, Math.round(w0.damage * cadence.damageScale));
    this.cooldownMs = Math.max(110, Math.round(w0.cooldownMs * cadence.cooldownScale));
    this.projectiles = clamp(w0.projectiles + cadence.extraProjectiles, 1, 12);
    this.autoFire = w0.autoFire ?? true;
    this.moveSpeed = Math.round(this.def.player.speed * pressure.playerSpeedScale);
    this.meleeDamage = this.def.player.meleeDamage;
    this.meleeRange = this.def.player.meleeRange;
    this.magnetRange = 0;
    this.score = 0;
    this.relics = 0;
    this.captureProgress = 0;
    this.captureZone = undefined;
    this.captureContested = false;
    this.capturePulseAt = -Infinity;
    this.escortAlly = undefined;
    this.escortRoute = undefined;
    this.escortProgress = 0;
    this.escortMaxHp = Math.max(44, Math.round(this.maxHp * 0.55));
    this.escortHp = this.escortMaxHp;
    this.escortContested = false;
    this.escortPulseAt = -Infinity;
    this.defendCore = undefined;
    this.defendProgress = 0;
    this.defendMaxHp = this.defendMaxHealth();
    this.defendHp = this.defendMaxHp;
    this.defendContested = false;
    this.defendPulseAt = -Infinity;
    this.repairNodes = [];
    this.repairContested = false;
    this.repairPulseAt = -Infinity;
    this.extractZone = undefined;
    this.extractProgress = 0;
    this.extractContested = false;
    this.extractPulseAt = -Infinity;
    this.rescueObjective = undefined;
    this.rescuePhase = 'recover';
    this.rescueProgress = 0;
    this.rescueExtractProgress = 0;
    this.rescueMaxHp = Math.max(46, Math.round(this.maxHp * 0.58));
    this.rescueHp = this.rescueMaxHp;
    this.rescueContested = false;
    this.rescuePulseAt = -Infinity;
    this.unlockKeys = 0;
    this.unlockGate = undefined;
    this.unlockProgress = 0;
    this.unlockContested = false;
    this.unlockPulseAt = -Infinity;
    this.combo = 0;
    this.comboExpiresAt = -Infinity;
    this.comboVisibleUntil = -Infinity;
    this.xp = 0;
    this.level = 1;
    this.xpToNext = 8;
    this.elapsed = 0;
    this.fireTimer = 0;
    this.lastAttackAt = -Infinity;
    this.attackActiveUntil = -Infinity;
    this.lastDashAt = -Infinity;
    this.dashActiveUntil = -Infinity;
    this.lastDamageAt = -Infinity;
    this.pendingSpawns = 0;
    this.suppressSpawnsUntil = -Infinity;
    this.over = false;
    this.paused = false;
    this.choosingUpgrade = false;
    this.upgradeChoices = [];
    this.upgradeOverlay = undefined;
    this.touchControls = undefined;
    this.touchStickBase = undefined;
    this.touchStickThumb = undefined;
    this.touchStickPointerId = null;
    this.touchStickCenter = { x: 0, y: 0 };
    this.touchIntent = { dx: 0, dy: 0, attack: false, dash: false };
    this.touchControlsVisible = false;
    this.bossSpawned = false;
    this.boss = undefined;
    this.bossPatternIndex = 0;
    this.bossPatternState = 'idle';
    this.bossPatternTimer = 0;
    this.bossTelegraphUntil = -Infinity;
    this.publicDemoBossHoldUntil = -Infinity;
    this.arenaHazards = [];
    this.arenaHazardTimer = 0;
    this.arenaHazardVisibleUntil = -Infinity;
    this.supportPulseUntil = -Infinity;
    this.guardianShieldUntil = -Infinity;
    this.sentinelLaneUntil = -Infinity;
    this.lastHazardDamageAt = -Infinity;
    this.arenaDecorAnchors = 0;
    this.ambientMotionFx = 0;
    this.profilePresentationFx = 0;
    this.profileDirectorPhase = null;
    this.profileFrameLayer = undefined;
    this.profileFramingFx = 0;
    this.profileFramingMode = null;
    this.profileAnimationFrame = 0;
    this.cameraDirectorLayer = undefined;
    this.cameraDirectorFx = 0;
    this.cameraDirectorMode = null;
    this.cameraDirectorIntensity = 0;
    this.visualEvidenceMaskedObjects.clear();
    this.coastalBossEvidenceLayer = undefined;
    this.coastalBossEvidenceForeground = undefined;
    this.escortEvidenceLayer = undefined;
    this.flightLaneLayer = undefined;
    this.flightEvidenceForeground = undefined;
    this.shockwaveEvidenceForeground = undefined;
    this.flightLaneFx = 0;
    this.flightScrollOffset = 0;
    this.platformerLayer = undefined;
    this.platformerEdgeLayer = undefined;
    this.platformerEvidenceLayer = undefined;
    this.platformerEvidenceForeground = undefined;
    this.platformSolids = [];
    this.platformerFx = 0;
    this.platformerGrounded = false;
    this.platformerJumpFx = 0;
    this.puzzleLayer = undefined;
    this.puzzleBoard = undefined;
    this.puzzleBlocks = [];
    this.puzzleGems = [];
    this.puzzleSwitches = [];
    this.puzzleExit = undefined;
    this.puzzlePlayerCell = null;
    this.puzzleMoves = 0;
    this.puzzleSolved = false;
    this.puzzleFx = 0;
    this.puzzleNextMoveAt = 0;
    this.objectivePickupTimer = 0;
    this.objectivePickupVisibleUntil = -Infinity;
    this.objectiveGuide = undefined;
    this.objectiveGuideVisible = false;
    this.objectiveGuideLabel = null;
    this.objectiveGuideDistance = null;
    this.objectiveMotionFrame = 0;
    this.encounterPlate = undefined;
    this.encounterPlateTitle = null;
    this.encounterPlateObjective = null;
    this.encounterThreatLevel = 0;
    this.tacticalRadar = undefined;
    this.tacticalRadarEnemyPips = 0;
    this.tacticalRadarObjectivePips = 0;
    this.tacticalRadarBossVisible = false;
    this.directorFeed = undefined;
    this.directorEvents = [];
    this.directorEventSerial = 0;
    this.visualEvidenceModeUntil = -Infinity;
    this.floorTextureKey = null;
    this.backdropTextureKey = null;
    this.playerShadow = undefined;
    this.playerActorLayer = undefined;
    this.actorAnimationFx = 0;
    this.playerAnimationState = 'idle';
    this.enemyAnimationStates = [];
    this.playerRigLayer = undefined;
    this.actorRigFx = 0;
    this.actorRigFrame = 0;
    this.bossTransitionFx = 0;
    this.bossTransitionState = null;
    this.spriteSheetAnimatedKeys = new Set<string>();
    this.spriteSheetAnimationNames = new Set<string>();
    this.spriteSheetFrame = 0;
    this.lastTrailAt = -Infinity;
    this.lastFireAt = -Infinity;
    this.combatFeedbackUntil = -Infinity;
    this.impactBeatUntil = -Infinity;
    this.impactBeatCount = 0;
    this.impactBeatColor = this.def.palette.accent;
    this.impactBeatStrength = 0;
    this.externalIntent = { dx: 0, dy: 0, attack: false, dash: false };
    this.externalIntentRemainingMs = 0;
    this.ensureGameplayTextures(true);

    this.cameras.main.setBackgroundColor(this.def.palette.background);
    drawBackdrop(this, this.def, width, height, this.floorTextureKey, this.backdropTextureKey);
    this.drawArenaDressing(width, height);
    drawForegroundDressing(this, this.def, width, height);
    this.ambientMotionFx = drawAmbientRoomMotion(this, this.def, width, height);
    this.profilePresentationFx = drawFeelProfilePresentation(this, this.def, width, height);
    this.setupProfileFraming(width, height);
    this.setupCameraDirector();
    this.setupFlightTemplateLayer(width, height);
    this.setupPlatformerTemplateLayer(width, height);
    this.setupCaptureZone();
    this.setupDefendObjective();
    this.setupRepairNodes();
    this.setupExtractZone();

    const playerStart = this.playerStartPosition(width, height);
    this.player = this.applyCircleBody(
      this.physics.add.image(playerStart.x, playerStart.y, this.def.player.spriteKey),
      this.def.player.radius,
    );
    this.player.setCollideWorldBounds(true).setDepth(DEPTH.player);
    this.player.setScale(
      this.isPlatformer()
        ? 1.22
        : hasLiteralBackdrop(this.def) && this.def.winCondition === 'defeat-boss'
          ? 1.62
          : this.isPuzzleRoom() || this.def.winCondition === 'collect-relics'
            ? 1.18
            : 1.14,
    );
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.isPlatformer()) {
      playerBody.setDragX(1600);
      playerBody.setDragY(0);
      playerBody.setMaxVelocity(Math.max(320, this.moveSpeed * 2.1), 760);
    } else {
      playerBody.setDrag(1100, 1100);
    }
    this.playerShadow = this.attachShadow(this.player, this.def.player.radius, 0.34);
    this.playerActorLayer = this.add.graphics().setDepth(DEPTH.player + 0.18);
    this.playerRigLayer = this.add.graphics().setDepth(DEPTH.player + 0.24);
    this.actorAnimationFx += 1;
    this.actorRigFx += 1;
    this.setupPuzzleRoomTemplateLayer(width, height);
    this.setupAgentDashboardTemplateLayer(width, height);
    this.setupDecisionRoomTemplateLayer(width, height);

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.orbs = this.physics.add.group();
    this.objectivePickups = this.physics.add.group();
    this.setupEscortObjective();
    this.setupRescueObjective();
    this.setupUnlockGateObjective();
    this.setupPlatformerColliders();

    this.attackArc = this.add.circle(0, 0, this.meleeRange, hex(this.def.palette.accent), 0.18)
      .setStrokeStyle(2, hex(this.def.palette.accent), 0.8)
      .setVisible(false)
      .setDepth(DEPTH.fx);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,SHIFT,K,R,P,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.P?.on('down', () => this.togglePause());
    this.keys.ESC?.on('down', () => this.togglePause());
    this.keys.R?.on('down', () => {
      if (!this.choosingUpgrade) this.scene.restart({ def: this.def });
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.handleUpgradeKey(event));

    this.rebuildSpawnQueue();

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.hitEnemy(b as ArcadeImage, e as ArcadeImage, this.projectileDamage, true));
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.touchPlayer(e as ArcadeImage));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => {
      (b as ArcadeImage).destroy();
      this.damagePlayer(8);
    });
    this.physics.add.overlap(this.player, this.orbs, (_p, o) => this.collectOrb(o as ArcadeImage));
    this.physics.add.overlap(this.player, this.objectivePickups, (_p, pickup) => this.collectObjectivePickup(pickup as ArcadeImage));

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    this.bossBar = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    this.impactFrame = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud + 0.52);
    this.bossThreatText = this.add.text(width / 2, 72, '', {
      ...TEXT,
      fontSize: '14px',
      fontStyle: '800',
      color: '#ffffff',
      stroke: '#05070b',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.hud + 0.08).setVisible(false);
    this.bossThreatMetaText = this.add.text(width / 2, 86, '', {
      ...TEXT,
      fontSize: '10px',
      fontStyle: '800',
      color: '#ffffff',
      stroke: '#05070b',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.hud + 0.08).setVisible(false);
    this.hpText = this.add.text(16, 24, '', {
      ...TEXT,
      fontSize: '11px',
      stroke: '#05070b',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(DEPTH.hud);
    this.comboText = this.add.text(16, 48, '', {
      ...TEXT,
      fontSize: '11px',
      color: this.def.palette.projectile,
      stroke: '#05070b',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(DEPTH.hud);
    this.infoText = this.add.text(width - 16, 14, '', {
      ...TEXT,
      fontSize: '11px',
      stroke: '#05070b',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(DEPTH.hud);
    const meleeOnly = this.def.player.weapons[0]?.autoFire === false;
    const helpCopy = this.isFlightShooter()
      ? 'WASD/arrows fly lanes · Space/J burst · Shift/K boost · P pause'
      : this.isPuzzleRoom()
        ? 'WASD/arrows step · push blocks onto switches · reach the exit · P pause'
        : this.isAgentDashboard()
          ? 'Click approvals · review agents, queues, logs, and deploy health · P pause'
          : this.isDecisionRoom()
            ? 'Click a decision option · review stakeholders, evidence, and audit trail · P pause'
            : this.isPlatformer()
              ? 'A/D move · W/↑ jump · Space/J melee · Shift/K dash · P pause'
              : meleeOnly
                ? 'WASD/arrows move · Space/J swing spatula · Shift/K dash · P pause'
                : 'WASD/arrows move · Space/J melee · Shift/K dash · P pause';
    this.helpText = this.add.text(width / 2, height - 18, helpCopy, {
      ...TEXT,
      fontSize: '10px',
      color: '#d8dde8',
      stroke: '#05070b',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.hud).setAlpha(0.58);
    this.setupEncounterPlate();
    this.setupTacticalRadar();
    this.setupDirectorFeed();
    this.updateProfileDirector(this.time.now, false);
    this.addDirectorEvent(`Objective: ${this.encounterObjectiveText()}`, this.def.palette.xp, 7600);
    this.setupObjectiveGuide();
    this.setupTouchControls();
  }

  getTestState(): ForgeTestState {
    const firstEnemy = this.enemies?.children
      .getArray()
      .find((child) => !(child as ArcadeImage).getData('boss')) as ArcadeImage | undefined;
    const firstEnemyKey = this.def.enemies[0]?.spriteKey ?? null;
    const backgroundAsset = this.def.assets.find((asset) => asset.kind === 'background');
    return {
      scene: this.paused ? 'pause' : 'play',
      runtimeTemplate: this.runtimeTemplate(),
      winCondition: this.def.winCondition,
      feelProfile: this.feelProfile(),
      playStyle: this.playStyle(),
      weaponCooldownMs: this.cooldownMs,
      weaponProjectiles: this.projectiles,
      weaponAutoFire: this.autoFire,
      spawnPressureScale: this.pressureProfile().countScale,
      pressureRamp: this.currentPressureRamp(),
      upgradeChoiceKinds: this.upgradeChoices.map((upgrade) => upgrade.kind),
      enemyRoleSignature: this.def.enemies.map((enemy) => enemy.role),
      waveRoleSignature: this.def.waves.map((wave) => (
        this.def.enemies.find((enemy) => enemy.id === wave.enemyId)?.role ?? this.def.enemies[0]?.role ?? 'chaser'
      )),
      waveCount: this.def.waves.length,
      playerHealth: this.hp,
      score: this.score,
      scoreTarget: this.def.winCondition === 'score-target' ? this.scoreTarget() : null,
      relics: this.relics,
      relicTarget: this.def.winCondition === 'collect-relics' ? this.relicTarget() : null,
      captureProgress: this.captureProgress,
      captureTarget: this.def.winCondition === 'capture-zone' ? this.captureTargetSeconds() : null,
      captureZoneVisible: Boolean(this.captureZone),
      captureContested: this.captureContested,
      escortProgress: this.escortProgress,
      escortTarget: this.def.winCondition === 'escort' ? this.escortTargetDistance() : null,
      escortHealth: this.def.winCondition === 'escort' ? this.escortHp : null,
      escortVisible: Boolean(this.escortAlly?.active),
      escortContested: this.escortContested,
      defendProgress: this.defendProgress,
      defendTarget: this.def.winCondition === 'defend-core' ? this.defendTargetSeconds() : null,
      defendHealth: this.def.winCondition === 'defend-core' ? this.defendHp : null,
      defendVisible: Boolean(this.defendCore?.image.active),
      defendContested: this.defendContested,
      repairProgress: this.def.winCondition === 'repair-nodes' ? this.currentRepairProgress() : 0,
      repairTarget: this.def.winCondition === 'repair-nodes' ? this.repairSecondsPerNode() : null,
      repairNodesFixed: this.def.winCondition === 'repair-nodes' ? this.repairNodesFixed() : 0,
      repairVisible: this.def.winCondition === 'repair-nodes' && this.repairNodes.some((node) => node.ring.active),
      repairContested: this.def.winCondition === 'repair-nodes' && this.repairContested,
      extractProgress: this.def.winCondition === 'extract' ? this.extractProgress : 0,
      extractTarget: this.def.winCondition === 'extract' ? this.extractHoldSeconds() : null,
      extractVisible: this.def.winCondition === 'extract' && Boolean(this.extractZone?.ring.active),
      extractContested: this.def.winCondition === 'extract' && this.extractContested,
      rescuePhase: this.def.winCondition === 'rescue' ? this.rescuePhase : null,
      rescueProgress: this.def.winCondition === 'rescue' ? this.rescueProgress : 0,
      rescueTarget: this.def.winCondition === 'rescue' ? this.rescueHoldSeconds() : null,
      rescueExtractProgress: this.def.winCondition === 'rescue' ? this.rescueExtractProgress : 0,
      rescueExtractTarget: this.def.winCondition === 'rescue' ? this.rescueExtractSeconds() : null,
      rescueHealth: this.def.winCondition === 'rescue' ? this.rescueHp : null,
      rescueVisible: this.def.winCondition === 'rescue' && Boolean(this.rescueObjective?.ally.active),
      rescueContested: this.def.winCondition === 'rescue' && this.rescueContested,
      unlockKeys: this.def.winCondition === 'unlock-gate' ? this.unlockKeys : 0,
      unlockKeyTarget: this.def.winCondition === 'unlock-gate' ? this.unlockKeyTarget() : null,
      unlockProgress: this.def.winCondition === 'unlock-gate' ? this.unlockProgress : 0,
      unlockTarget: this.def.winCondition === 'unlock-gate' ? this.unlockHoldSeconds() : null,
      unlockGateVisible: this.def.winCondition === 'unlock-gate' && Boolean(this.unlockGate?.ring.active),
      unlockReady: this.def.winCondition === 'unlock-gate' && this.unlockKeys >= this.unlockKeyTarget(),
      unlockContested: this.def.winCondition === 'unlock-gate' && this.unlockContested,
      combo: this.combo,
      comboMultiplier: this.comboMultiplier(),
      comboVisible: this.hasVisibleCombo(),
      level: this.level,
      choosingUpgrade: this.choosingUpgrade,
      upgradeChoices: this.upgradeChoices.length,
      touchControlsVisible: this.touchControlsVisible,
      combatFeedbackVisible: this.hasVisibleCombatFeedback(),
      impactBeatVisible: this.time.now < this.impactBeatUntil,
      impactBeatCount: this.impactBeatCount,
      bossTelegraphVisible: this.time.now < this.bossTelegraphUntil && this.time.now >= this.publicDemoBossHoldUntil,
      bossPhase: this.currentBossPhase(),
      bossWindupSeconds: this.def.boss ? this.bossTelegraphSeconds(this.def.boss.patterns[0] ?? 'radial-burst') : 0,
      arenaHazardVisible: this.hasVisibleArenaHazard(),
      supportPulseVisible: this.time.now < this.supportPulseUntil,
      guardianShieldVisible: this.time.now < this.guardianShieldUntil,
      sentinelLaneVisible: this.time.now < this.sentinelLaneUntil,
      arenaDecorAnchors: this.arenaDecorAnchors,
      ambientMotionFx: this.ambientMotionFx,
      profilePresentationFx: this.profilePresentationFx,
      profileDirectorPhase: this.profileDirectorPhase,
      profileFramingFx: this.profileFramingFx,
      profileFramingMode: this.profileFramingMode,
      profileAnimationFrame: this.profileAnimationFrame,
      cameraDirectorFx: this.cameraDirectorFx,
      cameraDirectorMode: this.cameraDirectorMode,
      cameraDirectorIntensity: this.cameraDirectorIntensity,
      literalBackdrop: hasLiteralBackdrop(this.def),
      quietLiteralBackdrop: this.usesQuietLiteralBackdrop(),
      visualEvidenceActive: this.visualEvidenceModeActive(this.time.now),
      visualEvidenceMaskCount: this.visualEvidenceMaskedObjects.size,
      flightLaneFx: this.flightLaneFx,
      flightScrollOffset: Number(this.flightScrollOffset.toFixed(2)),
      platformerFx: this.platformerFx,
      platformerGrounded: this.platformerGrounded,
      platformerJumpFx: this.platformerJumpFx,
      puzzleFx: this.puzzleFx,
      puzzleMoves: this.puzzleMoves,
      puzzleMoveLimit: this.isPuzzleRoom() ? this.puzzleDefinition().moveLimit : null,
      puzzleGems: this.isPuzzleRoom() ? this.puzzleGemsCollected() : 0,
      puzzleGemTarget: this.isPuzzleRoom() ? this.puzzleGems.length : null,
      puzzleSwitchesLit: this.isPuzzleRoom() ? this.puzzleSwitchesLit() : 0,
      puzzleSwitchTarget: this.isPuzzleRoom() ? this.puzzleSwitchTarget() : null,
      puzzleBlocks: this.isPuzzleRoom() ? this.puzzleBlocks.length : 0,
      puzzleExitVisible: this.isPuzzleRoom() && Boolean(this.puzzleExit?.ring.visible),
      puzzleSolved: this.puzzleSolved,
      puzzlePlayerCell: this.puzzlePlayerCell ? { ...this.puzzlePlayerCell } : null,
      agentDashboardFx: this.agentDashboardFx,
      agentDashboardApprovals: this.isAgentDashboard() ? this.agentDashboardApprovalCount() : 0,
      agentDashboardApprovalTarget: this.isAgentDashboard() ? this.agentDashboardApprovalTarget() : null,
      agentDashboardTasksDone: this.isAgentDashboard() ? this.agentDashboardTasksDone() : 0,
      agentDashboardTaskTarget: this.isAgentDashboard() ? this.agentDashboardDefinition().tasks.length : null,
      agentDashboardHealth: this.isAgentDashboard() ? this.agentDashboardHealthPercent() : null,
      agentDashboardSelectedAgent: this.agentDashboardSelectedAgentId,
      agentDashboardReady: this.isAgentDashboard() && this.agentDashboardReady(),
      decisionRoomFx: this.decisionRoomFx,
      decisionRoomOptions: this.isDecisionRoom() ? this.decisionRoomDefinition().options.length : 0,
      decisionRoomEvidence: this.isDecisionRoom() ? this.decisionRoomDefinition().evidence.length : 0,
      decisionRoomStakeholders: this.isDecisionRoom() ? this.decisionRoomDefinition().stakeholders.length : 0,
      decisionRoomSelectedOption: this.decisionRoomSelectedOptionId,
      decisionRoomRecommendedOption: this.isDecisionRoom() ? this.decisionRoomRecommendedOptionId() : null,
      decisionRoomConfidence: this.isDecisionRoom() ? this.decisionRoomConfidence() : null,
      decisionRoomReady: this.isDecisionRoom() && this.decisionRoomReady(),
      actorAnimationFx: this.actorAnimationFx,
      playerAnimationState: this.playerAnimationState,
      enemyAnimationStates: this.enemyAnimationStates,
      actorRigFx: this.actorRigFx,
      actorRigFrame: this.actorRigFrame,
      bossTransitionFx: this.bossTransitionFx,
      bossTransitionState: this.bossTransitionState,
      spriteSheetAssets: this.countSpriteSheetAssets(),
      spriteSheetAnimatedKeys: [...this.spriteSheetAnimatedKeys],
      spriteSheetAnimationNames: [...this.spriteSheetAnimationNames],
      spriteSheetFrame: this.spriteSheetFrame,
      encounterPlateVisible: Boolean(this.encounterPlate?.container.visible && this.encounterPlate.container.alpha > 0.1),
      encounterPlateTitle: this.encounterPlateTitle,
      encounterPlateObjective: this.encounterPlateObjective,
      encounterThreatLevel: this.encounterThreatLevel,
      tacticalRadarVisible: Boolean(this.tacticalRadar?.container.visible && this.tacticalRadar.container.alpha > 0.1),
      tacticalRadarEnemyPips: this.tacticalRadarEnemyPips,
      tacticalRadarObjectivePips: this.tacticalRadarObjectivePips,
      tacticalRadarBossVisible: this.tacticalRadarBossVisible,
      directorFeedVisible: Boolean(this.directorFeed?.container.visible && this.directorFeed.container.alpha > 0.1),
      directorFeedEntries: this.directorEvents.length,
      directorFeedLatest: this.directorEvents[0]?.text ?? null,
      objectivePickupVisible: this.hasVisibleObjectivePickup(),
      objectiveGuideVisible: this.objectiveGuideVisible,
      objectiveGuideLabel: this.objectiveGuideLabel,
      objectiveGuideDistance: this.objectiveGuideDistance,
      objectiveMotionFx: this.countObjectiveMotionFx(),
      objectiveMotionFrame: this.objectiveMotionFrame,
      pendingSpawns: this.pendingSpawns,
      enemiesAlive: this.enemies.children.size,
      eliteEnemies: this.countEliteEnemies(),
      bossHealth: this.boss?.active ? this.boss.getData('hp') as number : null,
      playerPos: { x: this.player.x, y: this.player.y },
      assetKeys: {
        player: this.def.player.spriteKey,
        firstEnemy: this.def.enemies[0]?.spriteKey ?? null,
        boss: this.def.boss?.spriteKey ?? null,
        floor: this.def.arena.tileKey ?? null,
        background: backgroundAsset?.key ?? null,
      },
      textureKeys: {
        player: this.player.texture?.key ?? null,
        firstEnemy: firstEnemyKey && this.textures.exists(firstEnemyKey) ? firstEnemyKey : firstEnemy?.texture?.key ?? null,
        boss: this.boss?.texture?.key ?? null,
        floor: this.floorTextureKey,
        background: this.backdropTextureKey,
      },
      sourceBacked: {
        player: Boolean(this.assetByKey(this.def.player.spriteKey)?.src),
        firstEnemy: Boolean(this.def.enemies[0] && this.assetByKey(this.def.enemies[0].spriteKey)?.src),
        boss: Boolean(this.def.boss && this.assetByKey(this.def.boss.spriteKey)?.src),
        floor: Boolean(this.def.arena.tileKey && this.assetByKey(this.def.arena.tileKey)?.src),
        background: Boolean(backgroundAsset?.src),
      },
      fallbackTextures: {
        player: this.generatedFallbackKeys.has(this.def.player.spriteKey),
        firstEnemy: Boolean(this.def.enemies[0] && this.generatedFallbackKeys.has(this.def.enemies[0].spriteKey)),
        boss: Boolean(this.def.boss && this.generatedFallbackKeys.has(this.def.boss.spriteKey)),
        floor: Boolean(this.def.arena.tileKey && this.generatedFallbackKeys.has(this.def.arena.tileKey)),
        background: Boolean(backgroundAsset && this.generatedFallbackKeys.has(backgroundAsset.key)),
      },
    };
  }

  injectIntent(partial: Partial<Intent>, durationMs: number) {
    this.externalIntent = {
      dx: partial.dx ?? 0,
      dy: partial.dy ?? 0,
      attack: partial.attack ?? false,
      dash: partial.dash ?? false,
    };
    this.externalIntentRemainingMs = Math.max(16, durationMs);
    this.applyInjectedMovementNudge(this.externalIntent, this.externalIntentRemainingMs);
  }

  spawnEnemyForTest(typeIndex: number) {
    const enemy = this.def.enemies[clamp(typeIndex, 0, this.def.enemies.length - 1)] ?? this.def.enemies[0]!;
    this.suppressSpawnsUntil = this.time.now + 4200;
    const point = enemy.role === 'sentinel'
      ? {
          x: clamp(this.player.x + 320, 72, this.scale.width - 72),
          y: clamp(this.player.y - 90, 72, this.scale.height - 72),
        }
      : this.chooseSpawnPoint(false);
    const spawned = this.spawnEnemy(enemy, false, point);
    if (enemy.role === 'sentinel') {
      const hp = Math.max((spawned.getData('hp') as number | undefined) ?? 0, 1800);
      spawned.setData('hp', hp);
      spawned.setData('maxHp', hp);
      spawned.setData('fire', 1.9);
      this.updateEnemyReadout(spawned, hp);
      this.emitSentinelLane(spawned, Phaser.Math.Angle.Between(spawned.x, spawned.y, this.player.x, this.player.y));
    }
  }

  spawnContactEnemyForTest(typeIndex: number) {
    const enemy = this.def.enemies[clamp(typeIndex, 0, this.def.enemies.length - 1)] ?? this.def.enemies[0]!;
    this.suppressSpawnsUntil = this.time.now + 4200;
    const spawned = this.spawnEnemy(enemy, false, {
      x: clamp(this.player.x + Math.max(4, this.def.player.radius * 0.35), 24, this.scale.width - 24),
      y: this.player.y,
    });
    spawned.setData('spawnUntil', this.time.now - 1);
  }

  spawnEliteEnemyForTest(typeIndex: number) {
    const enemy = this.def.enemies[clamp(typeIndex, 0, this.def.enemies.length - 1)] ?? this.def.enemies[0]!;
    this.spawnEnemy(enemy, false, this.chooseSpawnPoint(false), 'armored');
  }

  damagePlayerForTest(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    this.lastDamageAt = -Infinity;
    this.breakCombo();
    if (this.hp <= 0) this.lose();
  }

  damageFirstEnemyForTest(amount: number) {
    const firstEnemy = this.enemies.children
      .getArray()
      .find((child) => !(child as ArcadeImage).getData('boss')) as ArcadeImage | undefined;
    if (firstEnemy?.active) this.hitEnemy(undefined, firstEnemy, amount, false);
  }

  triggerComboRewardForTest() {
    const key = this.def.enemies[0]?.spriteKey ?? this.def.player.spriteKey;
    const marker = this.applyCircleBody(this.physics.add.image(this.player.x + 28, this.player.y - 10, key), 4)
      .setVisible(false)
      .setActive(false);
    marker.setData('score', 18);
    this.awardEnemyScore(marker, false, 'none');
    this.awardEnemyScore(marker, false, 'none');
    marker.destroy();
  }

  stageVisualEvidenceForTest() {
    const width = this.scale.width;
    const height = this.scale.height;
    this.suppressSpawnsUntil = this.time.now + 5600;
    this.visualEvidenceModeUntil = this.time.now + 5200;
    const enemyLimit = Math.min(
      this.isAgentDashboard() || this.isDecisionRoom() ? 1 : this.def.boss ? 2 : 3,
      this.def.enemies.length,
    );
    const offsets = this.isPlatformer()
      ? [{ x: 220, y: -10 }, { x: 318, y: -8 }, { x: 160, y: -72 }]
      : this.isFlightShooter()
        ? [{ x: 226, y: -86 }, { x: 286, y: 78 }, { x: 176, y: 26 }]
        : this.isPuzzleRoom()
          ? [{ x: 116, y: -90 }, { x: 176, y: 84 }, { x: 68, y: 112 }]
          : [{ x: 142, y: -78 }, { x: 212, y: 72 }, { x: 76, y: 116 }];
    for (let i = 0; i < enemyLimit; i++) {
      const enemy = this.def.enemies[i];
      if (!enemy) continue;
      const offset = offsets[i] ?? offsets[0]!;
      const point = this.isPlatformer()
        ? {
            x: clamp(this.player.x + offset.x, 84, width - 84),
            y: clamp(this.player.y + offset.y, 86, height - 74),
          }
        : {
            x: clamp(this.player.x + offset.x, 76, width - 76),
            y: clamp(this.player.y + offset.y, 76, height - 76),
          };
      this.spawnEnemy(enemy, false, point, i === 1 && !this.isAgentDashboard() && !this.isDecisionRoom() ? 'armored' : 'none');
    }
    if (this.def.boss) {
      this.spawnBossForTest();
      if (this.boss?.active && typeof window !== 'undefined' && !window.location.search.includes('selftest')) {
        const showcaseHp = Math.max((this.boss.getData('hp') as number | undefined) ?? 0, 2400);
        this.boss.setData('hp', showcaseHp);
        this.boss.setData('maxHp', showcaseHp);
        this.updateEnemyReadout(this.boss, showcaseHp);
      }
      if (!this.usesQuietLiteralBackdrop()) this.triggerBossTelegraphForTest();
    }
    if (
      this.isPuzzleRoom() ||
      this.def.winCondition === 'collect-relics' ||
      this.def.winCondition === 'survive' ||
      this.def.winCondition === 'score-target'
    ) {
      this.triggerObjectivePickupForTest();
    }
    if (this.def.winCondition === 'escort') this.stageEscortEvidenceForTest();
    if (this.isPlatformer()) {
      this.stagePlatformerEvidenceForTest();
      this.injectIntent({ dx: 1 }, 620);
    }
    this.applyVisualEvidencePresentation(this.time.now);
  }

  stagePublicDemoForTest() {
    const width = this.scale.width;
    const height = this.scale.height;
    const bakery = arenaMood(this.def) === 'bakery';
    this.suppressSpawnsUntil = this.time.now + 7600;
    this.visualEvidenceModeUntil = -Infinity;
    if (bakery) {
      this.player.setPosition(width * 0.68, height * 0.72);
      (this.player.body as Phaser.Physics.Arcade.Body | null)?.reset(this.player.x, this.player.y);
      this.facing = 'left';
    }

    const offsets = bakery
      ? [{ x: -240, y: -150 }, { x: -70, y: -210 }, { x: 145, y: -122 }]
      : [{ x: 142, y: -78 }, { x: 212, y: 72 }, { x: 76, y: 116 }];
    const enemyLimit = Math.min(this.def.enemies.length, bakery ? 3 : 2);
    for (let i = 0; i < enemyLimit; i++) {
      const enemy = this.def.enemies[i];
      if (!enemy) continue;
      const offset = offsets[i] ?? offsets[0]!;
      const point = {
        x: clamp(this.player.x + offset.x, 78, width - 78),
        y: clamp(this.player.y + offset.y, 76, height - 76),
      };
      this.spawnEnemy(enemy, false, point, i === 1 ? 'armored' : 'none');
    }

    if (this.def.boss) {
      this.spawnBossForTest();
      if (this.boss?.active) {
        if (bakery) {
          this.boss.setPosition(width * 0.51, height * 0.45);
          (this.boss.body as Phaser.Physics.Arcade.Body | null)?.reset(this.boss.x, this.boss.y);
        }
        const showcaseHp = Math.max((this.boss.getData('hp') as number | undefined) ?? 0, bakery ? 1900 : 1600);
        this.boss.setData('hp', showcaseHp);
        this.boss.setData('maxHp', showcaseHp);
        this.updateEnemyReadout(this.boss, showcaseHp);
        if (bakery) {
          this.bossPatternState = 'idle';
          this.bossPatternTimer = -30;
          this.bossTelegraphUntil = -Infinity;
          this.publicDemoBossHoldUntil = this.time.now + 22000;
          this.boss.clearTint();
        } else {
          this.triggerBossTelegraphForTest();
        }
      }
    }
  }

  spawnBossForTest() {
    if (!this.def.boss || this.boss?.active) return;
    this.bossSpawned = true;
    const point = this.isFlightShooter()
      ? { x: this.scale.width - 150, y: this.scale.height / 2 }
      : this.isPlatformer()
        ? { x: this.scale.width - 220, y: this.scale.height - 150 }
        : arenaMood(this.def) === 'bakery'
          ? { x: this.scale.width * 0.64, y: this.scale.height * 0.22 }
        : { x: this.scale.width * 0.64, y: this.scale.height * 0.34 };
    this.spawnEnemy(this.def.boss, true, point);
  }

  spawnContactBossForTest() {
    if (!this.def.boss) return;
    if (this.boss?.active) this.boss.destroy();
    this.bossSpawned = true;
    this.suppressSpawnsUntil = this.time.now + 4200;
    const spawned = this.spawnEnemy(this.def.boss, true, {
      x: clamp(this.player.x + Math.max(10, this.def.player.radius * 0.7), 48, this.scale.width - 48),
      y: this.player.y,
    });
    spawned.setData('spawnUntil', this.time.now - 1);
  }

  triggerBossTelegraphForTest() {
    if (!this.def.boss) return;
    if (!this.boss?.active) this.spawnBossForTest();
    if (!this.boss?.active) return;
    const pattern = this.def.boss.patterns[0] ?? 'radial-burst';
    this.showBossPatternTelegraph(pattern);
    this.boss.setTint(hex(this.def.palette.xp));
    this.time.delayedCall(420, () => this.boss?.clearTint());
  }

  triggerArenaHazardForTest() {
    this.spawnArenaHazard(92, 92, 54, false);
  }

  triggerSapperMineForTest() {
    const sapper = this.def.enemies.find((enemy) => enemy.role === 'sapper');
    if (!sapper) return;
    const x = clamp(this.player.x + 84, 72, this.scale.width - 72);
    const y = clamp(this.player.y + 34, 72, this.scale.height - 72);
    this.spawnArenaHazard(x, y, 42, false, this.time.now, this.def.palette.danger);
    this.pulse(x, y, this.def.palette.danger, 20);
    if (!this.enemyAnimationStates.includes('sapper-plant')) this.enemyAnimationStates.push('sapper-plant');
  }

  triggerObjectivePickupForTest() {
    if (this.isPuzzleRoom() || this.isAgentDashboard() || this.isDecisionRoom()) return;
    const x = clamp(this.player.x + 70, 72, this.scale.width - 72);
    const y = clamp(this.player.y - 18, 72, this.scale.height - 72);
    this.spawnObjectivePickup(x, y, this.objectivePickupKind(), false);
  }

  collectObjectivePickupForTest() {
    const pickup = this.objectivePickups.children
      .getArray()
      .find((child) => (child as ArcadeImage).active) as ArcadeImage | undefined;
    if (pickup) this.collectObjectivePickup(pickup);
  }

  collectUnlockKeyForTest() {
    const pickup = this.objectivePickups.children
      .getArray()
      .find((child) => {
        const candidate = child as ArcadeImage;
        return candidate.active && candidate.getData('kind') === 'access-key';
      }) as ArcadeImage | undefined;
    if (pickup) this.collectObjectivePickup(pickup);
  }

  enterCaptureZoneForTest() {
    if (!this.captureZone) return;
    this.player.setPosition(this.captureZone.x, this.captureZone.y);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const offset = 72 + index * 16;
      enemy.setPosition(
        clamp(64 + offset, 40, this.scale.width - 40),
        clamp(this.scale.height - 72 - offset * 0.35, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.suppressSpawnsUntil = this.time.now + 900;
  }

  advanceEscortForTest() {
    if (!this.escortAlly?.active) return;
    this.player.setPosition(
      clamp(this.escortAlly.x - 34, 40, this.scale.width - 40),
      clamp(this.escortAlly.y + 24, 40, this.scale.height - 40),
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      enemy.setPosition(
        clamp(82 + index * 28, 40, this.scale.width - 40),
        clamp(this.scale.height - 86 - index * 12, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.suppressSpawnsUntil = this.time.now + 900;
  }

  private stageEscortEvidenceForTest() {
    const route = this.escortRoute;
    const ally = this.escortAlly;
    if (!route || !ally?.active) return;

    this.escortProgress = this.escortTargetDistance() * 0.48;
    this.escortHp = this.escortMaxHp;
    this.escortContested = false;

    if (this.usesCuratedEscortSprite()) {
      route.startX = this.scale.width * 0.26;
      route.startY = this.scale.height * 0.66;
      route.endX = this.scale.width * 0.72;
      route.endY = this.scale.height * 0.48;
      this.escortProgress = this.escortTargetDistance() * 0.24;
    } else if (this.usesQuietLiteralBackdrop() && arenaMood(this.def) === 'coast') {
      route.startX = this.scale.width - 156;
      route.startY = this.scale.height - 92;
      route.endX = this.scale.width * 0.54;
      route.endY = this.scale.height * 0.56;
      this.escortProgress = this.escortTargetDistance() * 0.08;
    }

    const ratio = clamp(this.escortProgress / this.escortTargetDistance(), 0, 1);
    const allyX = Phaser.Math.Linear(route.startX, route.endX, ratio);
    const allyY = Phaser.Math.Linear(route.startY, route.endY, ratio);
    ally.setPosition(allyX, allyY);
    (ally.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.player.setPosition(
      clamp(allyX - 58, 48, this.scale.width - 48),
      clamp(allyY + 42, 48, this.scale.height - 48),
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    const enemySlots = [
      { x: allyX + 152, y: allyY - 72 },
      { x: allyX + 188, y: allyY + 66 },
      { x: allyX - 142, y: allyY - 88 },
    ];
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const slot = enemySlots[index] ?? enemySlots[enemySlots.length - 1]!;
      enemy.setPosition(
        clamp(slot.x, 56, this.scale.width - 56),
        clamp(slot.y, 56, this.scale.height - 56),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });

    route.label.setVisible(false).setAlpha(0);
    this.redrawEscortRoute(this.time.now, true);
    this.updateObjectiveGuide(this.time.now);
    this.pulse(ally.x, ally.y, this.def.palette.xp, 54);
    this.suppressSpawnsUntil = this.time.now + 5600;
  }

  private stagePlatformerEvidenceForTest() {
    if (!this.isPlatformer()) return;
    const width = this.scale.width;
    const height = this.scale.height;
    this.player.setPosition(width * 0.28, height - 86);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    const slots = [
      { x: width * 0.43, y: height - 188 },
      { x: width * 0.61, y: height - 272 },
      { x: width * 0.77, y: height - 208 },
    ];
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active || enemy.getData('boss') === true) return true;
      const slot = slots[index] ?? slots[slots.length - 1]!;
      enemy.setPosition(slot.x, slot.y);
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });

    if (this.boss?.active) {
      this.boss.setPosition(width * 0.82, height - 246);
      (this.boss.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }
  }

  fortifyDefendCoreForTest() {
    const core = this.defendCore;
    if (!core?.image.active) return;
    this.player.setPosition(
      clamp(core.x - core.radius * 0.45, 40, this.scale.width - 40),
      clamp(core.y + core.radius * 0.36, 40, this.scale.height - 40),
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      enemy.setPosition(
        clamp(80 + index * 34, 40, this.scale.width - 40),
        clamp(this.scale.height - 88 - index * 16, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.defendHp = Math.max(this.defendHp, this.defendMaxHp * 0.82);
    this.suppressSpawnsUntil = this.time.now + 900;
  }

  repairNodeForTest() {
    const node = this.repairNodes.find((candidate) => !candidate.fixed);
    if (!node) return;
    this.player.setPosition(
      clamp(node.x - node.radius * 0.2, 40, this.scale.width - 40),
      clamp(node.y + node.radius * 0.18, 40, this.scale.height - 40),
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      enemy.setPosition(
        clamp(74 + index * 32, 40, this.scale.width - 40),
        clamp(this.scale.height - 78 - index * 18, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.suppressSpawnsUntil = this.time.now + 1200;
  }

  enterExtractZoneForTest() {
    const zone = this.extractZone;
    if (!zone) return;
    const playerX = clamp(zone.x - zone.radius * 0.16, 40, this.scale.width - 40);
    const playerY = clamp(zone.y + zone.radius * 0.12, 40, this.scale.height - 40);
    this.player.setPosition(playerX, playerY);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.reset(playerX, playerY);
    body.setVelocity(0, 0);
    this.externalIntent = { dx: 0, dy: 0, attack: false, dash: false };
    this.externalIntentRemainingMs = 0;
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      enemy.setPosition(
        clamp(78 + index * 34, 40, this.scale.width - 40),
        clamp(this.scale.height - 82 - index * 16, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.suppressSpawnsUntil = this.time.now + 1200;
  }

  enterUnlockGateForTest() {
    const zone = this.unlockGate;
    if (!zone) return;
    this.unlockKeys = this.unlockKeyTarget();
    this.objectivePickups.children.each((child) => {
      const pickup = child as ArcadeImage;
      if (pickup.active && pickup.getData('kind') === 'access-key') pickup.destroy();
      return true;
    });
    this.player.setPosition(
      clamp(zone.x - zone.radius * 0.16, 40, this.scale.width - 40),
      clamp(zone.y + zone.radius * 0.12, 40, this.scale.height - 40),
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      enemy.setPosition(
        clamp(76 + index * 34, 40, this.scale.width - 40),
        clamp(this.scale.height - 80 - index * 16, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.suppressSpawnsUntil = this.time.now + 1200;
    this.redrawUnlockGate(this.time.now, true);
    this.updateUnlockGateObjective(0.22, this.time.now);
  }

  approveAgentDashboardForTest() {
    this.approveNextAgentDashboardGate();
  }

  chooseDecisionRoomOptionForTest() {
    this.chooseDecisionRoomOption();
  }

  rescueSurvivorForTest() {
    const objective = this.rescueObjective;
    if (!objective?.ally.active) return;
    this.player.setPosition(
      clamp(objective.ally.x - objective.radius * 0.12, 40, this.scale.width - 40),
      clamp(objective.ally.y + objective.radius * 0.12, 40, this.scale.height - 40),
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      enemy.setPosition(
        clamp(74 + index * 32, 40, this.scale.width - 40),
        clamp(this.scale.height - 78 - index * 18, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.suppressSpawnsUntil = this.time.now + 1200;
  }

  enterRescueExtractionForTest() {
    const objective = this.rescueObjective;
    if (!objective?.ally.active) return;
    this.rescueProgress = this.rescueHoldSeconds();
    this.rescuePhase = 'extract';
    this.player.setPosition(
      clamp(objective.gateX - objective.gateRadius * 0.18, 40, this.scale.width - 40),
      clamp(objective.gateY + objective.gateRadius * 0.12, 40, this.scale.height - 40),
    );
    objective.ally.setPosition(
      clamp(objective.gateX + objective.gateRadius * 0.12, 40, this.scale.width - 40),
      clamp(objective.gateY - objective.gateRadius * 0.1, 40, this.scale.height - 40),
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    (objective.ally.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      enemy.setPosition(
        clamp(82 + index * 32, 40, this.scale.width - 40),
        clamp(this.scale.height - 88 - index * 18, 40, this.scale.height - 40),
      );
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      index++;
      return true;
    });
    this.suppressSpawnsUntil = this.time.now + 1200;
  }

  levelUpForTest() {
    if (this.over || this.choosingUpgrade) return;
    this.level++;
    this.xp = 0;
    this.xpToNext = Math.round(this.xpToNext * 1.4);
    this.openUpgradeChoice();
  }

  chooseUpgradeForTest(index: number) {
    this.chooseUpgrade(index);
  }

  killAllEnemiesForTest() {
    this.pendingSpawns = 0;
    this.suppressSpawnsUntil = this.time.now + 1200;
    this.enemies.children.each((child) => {
      (child as ArcadeImage).destroy();
      return true;
    });
  }

  triggerWinForTest() { this.win(); }
  triggerLoseForTest() { this.lose(); }

  togglePause() {
    if (this.over || this.choosingUpgrade) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.pause();
      this.showPauseOverlay();
    } else {
      this.physics.resume();
      this.pauseOverlay?.destroy();
      this.pauseOverlay = undefined;
    }
  }

  update(time: number, deltaMs: number) {
    if (this.over || this.paused || this.choosingUpgrade) return;
    const now = this.time.now || time;
    const dt = deltaMs / 1000;
    this.elapsed += dt;

    const intent = this.gatherIntent();
    if (this.isPuzzleRoom()) {
      this.updatePuzzleRoomInput(intent, now);
      this.consumeExternalIntent(deltaMs);
      this.updatePuzzleRoomTemplateLayer(now);
      this.updateProfileDirector(now);
      this.updateObjectiveGuide(now);
      this.updateObjectiveMotionFrame(now);
      this.updateVisualPresentation(now);
      this.updateHud();
      return;
    }
    if (this.isAgentDashboard()) {
      this.consumeExternalIntent(deltaMs);
      this.updateAgentDashboardTemplateLayer(now);
      this.updateProfileDirector(now);
      this.updateObjectiveMotionFrame(now);
      this.updateVisualPresentation(now);
      this.updateHud();
      return;
    }
    if (this.isDecisionRoom()) {
      this.consumeExternalIntent(deltaMs);
      this.updateDecisionRoomTemplateLayer(now);
      this.updateProfileDirector(now);
      this.updateObjectiveGuide(now);
      this.updateObjectiveMotionFrame(now);
      this.updateVisualPresentation(now);
      this.updateHud();
      return;
    }
    this.applyMovement(intent, now);
    this.consumeExternalIntent(deltaMs);
    if (intent.attack) this.tryMelee(now);
    if (intent.dash) this.tryDash(intent, now);
    this.updateAttackArc(now);

    this.releaseDueWaves();
    this.maybeSpawnBoss();
    this.updateBossPattern(dt);
    this.updateAutoFire(deltaMs);
    this.updateEnemies(dt);
    this.updateOrbs(dt);
    this.updateObjectiveDirector(dt, now);
    this.updateObjectivePickups(now);
    this.updateCaptureZone(dt, now);
    this.updateEscortObjective(dt, now);
    this.updateDefendObjective(dt, now);
    this.updateRepairNodes(dt, now);
    this.updateExtractZone(dt, now);
    this.updateRescueObjective(dt, now);
    this.updateUnlockGateObjective(dt, now);
    this.updateArenaDirector(dt, now);
    this.updateArenaHazards(now);
    this.updateProfileDirector(now);
    this.updateFlightTemplateLayer(dt, now);
    this.updatePlatformerTemplateLayer(now);
    this.updateObjectiveGuide(now);
    this.updateObjectiveMotionFrame(now);
    this.updateVisualPresentation(now);
    this.updateHud();

    if (this.def.winCondition === 'survive' && this.elapsed >= this.def.arena.durationSeconds) this.win();
    if (
      this.def.winCondition === 'clear-waves' &&
      this.spawnQueue.length === 0 &&
      this.pendingSpawns === 0 &&
      this.enemies.children.size === 0 &&
      (!this.boss || !this.boss.active)
    ) this.win();
    if (this.def.winCondition === 'score-target' && this.score >= this.scoreTarget()) this.win();
    if (this.def.winCondition === 'collect-relics' && this.relics >= this.relicTarget()) this.win();
    if (this.def.winCondition === 'capture-zone' && this.captureProgress >= this.captureTargetSeconds()) this.win();
    if (this.def.winCondition === 'escort' && this.escortProgress >= this.escortTargetDistance()) this.win();
    if (this.def.winCondition === 'defend-core' && this.defendProgress >= this.defendTargetSeconds()) this.win();
    if (this.def.winCondition === 'repair-nodes' && this.repairNodesFixed() >= this.repairNodeCount()) this.win();
    if (this.def.winCondition === 'extract' && this.extractProgress >= this.extractHoldSeconds()) this.win();
    if (this.def.winCondition === 'rescue' && this.rescuePhase === 'complete') this.win();
    if (this.def.winCondition === 'unlock-gate' && this.unlockProgress >= this.unlockHoldSeconds()) this.win();
  }

  private preloadAssetSources() {
    const seen = new Set<string>();
    for (const asset of this.def.assets) {
      if (!asset.src || seen.has(asset.key)) continue;
      seen.add(asset.key);
      const src = resolveAssetUrl(asset.src);
      if (asset.spriteSheet) {
        this.load.spritesheet(asset.key, src, {
          frameWidth: asset.spriteSheet.frameWidth,
          frameHeight: asset.spriteSheet.frameHeight,
          endFrame: asset.spriteSheet.frames - 1,
        });
      } else {
        this.load.image(asset.key, src);
      }
    }
  }

  private countSpriteSheetAssets() {
    return this.def.assets.filter((asset) => asset.spriteSheet && this.textures.exists(asset.key)).length;
  }

  private ensureGameplayTextures(includeSourceBackstops: boolean) {
    for (const spec of this.textureSpecs()) this.ensureGeneratedTexture(spec, includeSourceBackstops);
    this.ensureTileTexture(includeSourceBackstops);
    this.ensureBackdropTexture();
  }

  private textureSpecs(): TextureSpec[] {
    const p = this.def.palette;
    const specs: TextureSpec[] = [
      { key: this.def.player.spriteKey, color: p.player, radius: this.def.player.radius, stroke: 0xffffff, strokeAlpha: 0.4, variant: 'player' },
      { key: 'bullet', color: p.projectile, radius: 4, stroke: 0xffffff, strokeAlpha: 0.35, variant: 'bullet' },
      { key: 'ebullet', color: p.danger, radius: 5, stroke: 0xffffff, strokeAlpha: 0.3, variant: 'enemy-bullet' },
      { key: 'orb', color: p.xp, radius: 5, stroke: 0xffffff, strokeAlpha: 0.35, variant: 'orb' },
    ];
    if (this.def.winCondition === 'escort') {
      specs.push({
        key: this.escortSpriteKey(),
        color: p.xp,
        radius: 13,
        stroke: 0xffffff,
        strokeAlpha: 0.42,
        variant: 'escort',
      });
    }
    if (this.def.winCondition === 'rescue') {
      specs.push({
        key: this.rescueSpriteKey(),
        color: p.xp,
        radius: 13,
        stroke: 0xffffff,
        strokeAlpha: 0.42,
        variant: 'rescue',
      });
    }
    if (this.def.winCondition === 'defend-core') {
      specs.push({
        key: this.defendSpriteKey(),
        color: p.accent,
        radius: 18,
        stroke: 0xffffff,
        strokeAlpha: 0.44,
        variant: 'defend-core',
      });
    }
    this.def.enemies.forEach((e, i) => {
      specs.push({
        key: e.spriteKey,
        color: [p.danger, p.accent, p.xp, p.projectile][i % 4] ?? p.danger,
        radius: e.radius,
        stroke: 0xffffff,
        strokeAlpha: 0.22,
        variant: e.role,
      });
    });
    if (this.def.boss) {
      specs.push({
        key: this.def.boss.spriteKey,
        color: p.danger,
        radius: this.def.boss.radius,
        stroke: 0xffffff,
        strokeAlpha: 0.28,
        variant: 'boss',
      });
    }
    return dedupeTextureSpecs(specs);
  }

  private ensureGeneratedTexture(spec: TextureSpec, includeSourceBackstops: boolean) {
    if (!spec.key || this.textures.exists(spec.key)) return;
    if (!includeSourceBackstops && this.assetByKey(spec.key)?.src) return;
    this.circleTex(spec.key, spec.color, spec.radius, spec.stroke, spec.strokeAlpha, spec.variant);
    this.generatedFallbackKeys.add(spec.key);
  }

  private ensureTileTexture(includeSourceBackstops: boolean) {
    const key = this.def.arena.tileKey;
    if (!key) return;
    if (this.textures.exists(key)) {
      this.floorTextureKey = key;
      return;
    }
    if (!includeSourceBackstops && this.assetByKey(key)?.src) return;
    this.tileTex(key);
    this.generatedFallbackKeys.add(key);
    this.floorTextureKey = key;
  }

  private ensureBackdropTexture() {
    const asset = this.def.assets.find((candidate) => candidate.kind === 'background' && this.textures.exists(candidate.key));
    this.backdropTextureKey = asset?.key ?? null;
  }

  private assetByKey(key: string): Asset | undefined {
    return this.def.assets.find((asset) => asset.key === key);
  }

  private spriteSheetAssetByKey(key: string): Asset | undefined {
    const asset = this.assetByKey(key);
    return asset?.spriteSheet && this.textures.exists(key) ? asset : undefined;
  }

  private spriteSheetAnimationCandidates(state: string): string[] {
    const normalized = state.toLowerCase();
    const candidates = [normalized];
    if (normalized.startsWith('boss-telegraph')) candidates.push('boss-telegraph');
    if (normalized.startsWith('boss-execute')) candidates.push('boss-execute');
    if (normalized.startsWith('boss-recovery')) candidates.push('boss-idle', 'idle');
    if (normalized.startsWith('boss')) candidates.push('boss-idle', 'idle');
    for (const family of ['telegraph', 'execute', 'contested', 'dash', 'attack', 'fire', 'hurt', 'move', 'idle']) {
      if (normalized.includes(family)) candidates.push(family);
    }
    const suffix = normalized.split('-').at(-1);
    if (suffix) candidates.push(suffix);
    return [...new Set(candidates)];
  }

  private spriteSheetAnimationForState(asset: Asset, state: string): SpriteSheetAnimation | undefined {
    const animations = asset.spriteSheet?.animations ?? [];
    if (!animations.length) return undefined;
    const byName = new Map(animations.map((animation) => [animation.name, animation] as const));
    for (const candidate of this.spriteSheetAnimationCandidates(state)) {
      const animation = byName.get(candidate);
      if (animation) return animation;
    }
    return undefined;
  }

  private spriteSheetFrameForState(asset: Asset, state: string, time: number, phase: number): { frame: number; animationName?: string } {
    const frames = asset.spriteSheet?.frames ?? 1;
    if (frames <= 1) return { frame: 0 };
    const animation = this.spriteSheetAnimationForState(asset, state);
    if (animation) {
      const sequence = animation.frames.filter((frame) => frame >= 0 && frame < frames);
      if (sequence.length) {
        const index = Math.floor(time / (animation.frameMs ?? 120) + phase) % sequence.length;
        return { frame: sequence[index] ?? 0, animationName: animation.name };
      }
    }
    const speed = state.includes('dash') || state.includes('charge') || state.includes('execute')
      ? 72
      : state.includes('attack') || state.includes('fire') || state.includes('telegraph')
        ? 96
        : state.includes('idle') || state.includes('defend')
          ? 220
          : 132;
    const offset = state.includes('attack') || state.includes('telegraph') ? 1 : state.includes('hurt') ? 2 : 0;
    return { frame: (Math.floor(time / speed + phase) + offset) % frames };
  }

  private applySpriteSheetFrame(target: ArcadeImage, key: string, state: string, time: number, phase = 0) {
    const asset = this.spriteSheetAssetByKey(key);
    if (!asset?.spriteSheet || !target.active) return;
    const { frame, animationName } = this.spriteSheetFrameForState(asset, state, time, phase);
    target.setFrame(frame);
    this.spriteSheetFrame = frame;
    this.spriteSheetAnimatedKeys.add(key);
    if (animationName) this.spriteSheetAnimationNames.add(animationName);
  }

  private applyCircleBody(img: ArcadeImage, radius: number): ArcadeImage {
    const width = img.frame?.width ?? radius * 2;
    const height = img.frame?.height ?? radius * 2;
    const offsetX = Math.max(0, (width - radius * 2) / 2);
    const offsetY = Math.max(0, (height - radius * 2) / 2);
    return img.setCircle(radius, offsetX, offsetY);
  }

  private circleTex(key: string, color: string, r: number, stroke: number, strokeAlpha: number, variant: ForgeTextureVariant) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const base = hex(color);
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const projectile = hex(this.def.palette.projectile);
    const center = r;
    const soft = Math.max(1, r * 0.08);
    const mark = Math.max(1, r * 0.18);

    g.fillStyle(0x000000, 0.28);
    g.fillCircle(center, center + soft, r * 0.82);
    g.fillStyle(base, 1);
    g.fillCircle(center, center, r * 0.94);
    g.lineStyle(2, stroke, strokeAlpha);
    g.strokeCircle(center, center, r * 0.88);

    switch (variant) {
      case 'player':
        g.fillStyle(projectile, 0.9);
        g.fillTriangle(center, r * 0.22, r * 1.72, r * 1.42, center, r * 1.12);
        g.fillTriangle(center, r * 0.22, r * 0.28, r * 1.42, center, r * 1.12);
        g.lineStyle(Math.max(1, r * 0.12), 0xffffff, 0.35);
        g.lineBetween(center, r * 0.36, center, r * 1.28);
        g.fillStyle(0xffffff, 0.52);
        g.fillCircle(center, r * 0.7, mark);
        break;
      case 'escort':
      case 'rescue':
        g.fillStyle(accent, 0.82);
        g.fillRoundedRect(r * 0.48, r * 0.42, r * 1.04, r * 1.18, Math.max(3, r * 0.22));
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(center, r * 0.72, mark * 0.92);
        g.lineStyle(Math.max(1, r * 0.1), projectile, 0.78);
        g.lineBetween(center, r * 0.3, center, r * 1.48);
        g.lineBetween(r * 0.66, center, r * 1.34, center);
        if (variant === 'rescue') {
          g.fillStyle(projectile, 0.82);
          g.fillCircle(r * 1.42, r * 0.56, mark * 0.72);
          g.lineStyle(Math.max(1, r * 0.08), 0xffffff, 0.64);
          g.lineBetween(r * 1.42, r * 0.32, r * 1.42, r * 0.8);
          g.lineBetween(r * 1.18, r * 0.56, r * 1.66, r * 0.56);
        }
        break;
      case 'defend-core':
        g.fillStyle(0x000000, 0.18);
        g.fillRoundedRect(r * 0.38, r * 0.38, r * 1.24, r * 1.24, Math.max(4, r * 0.2));
        g.lineStyle(Math.max(2, r * 0.1), projectile, 0.86);
        g.strokeCircle(center, center, r * 0.62);
        g.lineStyle(Math.max(1, r * 0.08), 0xffffff, 0.36);
        g.lineBetween(center, r * 0.36, center, r * 1.64);
        g.lineBetween(r * 0.36, center, r * 1.64, center);
        g.fillStyle(projectile, 0.72);
        g.fillCircle(center, center, mark * 1.15);
        break;
      case 'bullet':
        g.fillStyle(0xffffff, 0.48);
        g.fillCircle(center, center, r * 0.48);
        g.lineStyle(1, projectile, 0.85);
        g.strokeCircle(center, center, r * 0.86);
        break;
      case 'enemy-bullet':
        g.fillStyle(danger, 0.95);
        g.fillTriangle(center, r * 0.2, r * 1.72, center, center, r * 1.82);
        g.fillTriangle(center, r * 0.2, r * 0.28, center, center, r * 1.82);
        g.fillStyle(0xffffff, 0.42);
        g.fillCircle(center, center, Math.max(1, r * 0.24));
        break;
      case 'orb':
        g.fillStyle(xp, 0.95);
        g.fillCircle(center, center, r * 0.58);
        g.lineStyle(1, 0xffffff, 0.45);
        g.strokeCircle(center, center, r * 0.78);
        break;
      case 'chaser':
        g.fillStyle(0xffffff, 0.34);
        g.fillTriangle(center, r * 0.3, r * 1.62, r * 1.48, r * 0.38, r * 1.48);
        g.fillStyle(danger, 0.9);
        g.fillCircle(center, r * 1.08, mark);
        break;
      case 'charger':
        g.fillStyle(accent, 0.78);
        g.fillTriangle(center, r * 0.22, r * 1.68, center, center, r * 1.78);
        g.fillTriangle(center, r * 0.22, r * 0.32, center, center, r * 1.78);
        g.lineStyle(1, 0xffffff, 0.3);
        g.strokeCircle(center, center, r * 0.5);
        break;
      case 'shooter':
        g.fillStyle(projectile, 0.78);
        g.fillRoundedRect(r * 0.48, r * 0.48, r * 1.04, r * 1.04, Math.max(2, r * 0.16));
        g.fillStyle(0xffffff, 0.38);
        g.fillRect(r * 0.86, r * 0.16, r * 0.28, r * 0.78);
        g.fillCircle(center, center, mark);
        break;
      case 'sniper':
        g.fillStyle(projectile, 0.72);
        g.fillRoundedRect(r * 0.54, r * 0.48, r * 0.92, r * 1.08, Math.max(2, r * 0.14));
        g.lineStyle(Math.max(2, r * 0.12), xp, 0.86);
        g.lineBetween(center, r * 0.14, center, r * 1.28);
        g.lineStyle(1, 0xffffff, 0.38);
        g.lineBetween(r * 0.54, center, r * 1.46, center);
        g.fillStyle(0xffffff, 0.44);
        g.fillCircle(center, center, mark * 0.88);
        break;
      case 'sapper':
        g.fillStyle(danger, 0.7);
        g.fillRoundedRect(r * 0.44, r * 0.42, r * 1.12, r * 1.02, Math.max(2, r * 0.18));
        g.lineStyle(Math.max(1, r * 0.1), projectile, 0.72);
        g.strokeCircle(r * 1.32, r * 1.34, r * 0.34);
        g.fillStyle(projectile, 0.78);
        g.fillCircle(r * 1.32, r * 1.34, mark * 0.82);
        g.lineStyle(1, 0xffffff, 0.34);
        g.lineBetween(r * 0.58, r * 0.58, r * 1.24, r * 1.12);
        break;
      case 'support':
        g.lineStyle(Math.max(2, r * 0.11), xp, 0.82);
        g.strokeCircle(center, center, r * 0.62);
        g.fillStyle(projectile, 0.42);
        g.fillRoundedRect(r * 0.76, r * 0.46, r * 0.48, r * 1.08, Math.max(2, r * 0.12));
        g.fillRoundedRect(r * 0.46, r * 0.76, r * 1.08, r * 0.48, Math.max(2, r * 0.12));
        g.fillStyle(0xffffff, 0.36);
        g.fillCircle(r * 1.5, r * 0.55, mark * 0.72);
        g.fillCircle(r * 0.5, r * 1.45, mark * 0.58);
        break;
      case 'guardian':
        g.fillStyle(0x000000, 0.18);
        g.fillCircle(center, center, r * 0.72);
        g.fillStyle(accent, 0.72);
        g.fillTriangle(center, r * 0.22, r * 1.64, r * 0.82, center, r * 1.78);
        g.fillTriangle(center, r * 0.22, r * 0.36, r * 0.82, center, r * 1.78);
        g.lineStyle(Math.max(2, r * 0.1), projectile, 0.72);
        g.strokeCircle(center, center, r * 0.78);
        g.lineStyle(1, 0xffffff, 0.32);
        g.strokeCircle(center, center, r * 0.52);
        break;
      case 'sentinel':
        g.fillStyle(0x000000, 0.2);
        g.fillCircle(center, center, r * 0.7);
        g.fillStyle(projectile, 0.7);
        g.fillTriangle(center, r * 0.24, r * 1.58, center, center, r * 1.76);
        g.fillTriangle(center, r * 0.24, r * 0.42, center, center, r * 1.76);
        g.lineStyle(Math.max(2, r * 0.1), accent, 0.76);
        g.lineBetween(center, r * 0.2, center, r * 1.8);
        g.lineBetween(r * 0.2, center, r * 1.8, center);
        g.lineStyle(1, 0xffffff, 0.34);
        g.strokeCircle(center, center, r * 0.52);
        break;
      case 'brute':
        g.fillStyle(0x000000, 0.2);
        g.fillRoundedRect(r * 0.34, r * 0.42, r * 1.32, r * 1.16, Math.max(3, r * 0.2));
        g.fillStyle(0xffffff, 0.28);
        g.fillRect(r * 0.52, r * 0.76, r * 0.96, r * 0.2);
        break;
      case 'orbiter':
        g.lineStyle(Math.max(1, r * 0.12), xp, 0.8);
        g.strokeCircle(center, center, r * 0.58);
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(r * 1.48, r * 0.62, mark * 0.7);
        g.fillCircle(r * 0.52, r * 1.38, mark * 0.7);
        break;
      case 'wanderer':
        g.fillStyle(0xffffff, 0.24);
        g.fillCircle(r * 0.72, r * 0.82, r * 0.32);
        g.fillCircle(r * 1.24, r * 0.98, r * 0.28);
        g.fillCircle(center, r * 1.28, r * 0.26);
        break;
      case 'boss':
        g.fillStyle(0x000000, 0.18);
        g.fillCircle(center, center, r * 0.62);
        g.lineStyle(Math.max(2, r * 0.08), accent, 0.82);
        g.strokeCircle(center, center, r * 0.72);
        g.lineStyle(Math.max(1, r * 0.06), 0xffffff, 0.3);
        g.strokeCircle(center, center, r * 0.42);
        g.fillStyle(danger, 0.95);
        g.fillTriangle(center, r * 0.18, r * 1.72, r * 1.42, r * 0.28, r * 1.42);
        g.fillStyle(0x000000, 0.34);
        g.fillTriangle(r * 0.54, r * 0.52, r * 0.08, r * 0.12, r * 0.72, r * 0.25);
        g.fillTriangle(r * 1.46, r * 0.52, r * 1.92, r * 0.12, r * 1.28, r * 0.25);
        g.lineStyle(Math.max(1, r * 0.1), xp, 0.58);
        g.lineBetween(r * 0.48, r * 1.25, r * 0.18, r * 1.62);
        g.lineBetween(r * 1.52, r * 1.25, r * 1.82, r * 1.62);
        g.fillStyle(0xffffff, 0.42);
        g.fillCircle(center, center, r * 0.18);
        g.fillStyle(xp, 0.78);
        g.fillCircle(r * 0.72, r * 0.78, Math.max(1, r * 0.1));
        g.fillCircle(r * 1.28, r * 0.78, Math.max(1, r * 0.1));
        break;
    }

    g.lineStyle(1, 0xffffff, 0.22);
    g.strokeCircle(center, center, r * 0.98);
    g.generateTexture(key, r * 2, r * 2);
    g.destroy();
  }

  private tileTex(key: string) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const floor = hex(this.def.palette.floor);
    const bg = hex(this.def.palette.background);
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    g.fillStyle(floor, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(bg, 0.16);
    g.fillRect(0, 0, 64, 2);
    g.fillRect(0, 0, 2, 64);
    g.lineStyle(1, 0xffffff, 0.05);
    g.lineBetween(0, 32, 64, 32);
    g.lineBetween(32, 0, 32, 64);
    g.lineStyle(1, accent, 0.12);
    g.lineBetween(8, 48, 30, 26);
    g.lineBetween(38, 18, 58, 38);
    g.fillStyle(danger, 0.08);
    g.fillRoundedRect(44, 8, 12, 6, 2);
    g.generateTexture(key, 64, 64);
    g.destroy();
  }

  private drawArenaDressing(w: number, h: number) {
    if (hasLiteralBackdrop(this.def) && (this.isPlatformer() || this.isPuzzleRoom() || (arenaMood(this.def) === 'coast' && this.def.winCondition === 'defeat-boss'))) {
      this.arenaDecorAnchors = 12;
      return;
    }
    this.arenaDecorAnchors = drawArenaDressing(this, this.def, w, h);
  }

  private setupProfileFraming(w: number, h: number) {
    this.profileFrameLayer = drawProfileFramingLayer(this, this.def, w, h);
    this.profileFramingFx = this.profileFrameLayer.fx;
    this.profileFramingMode = this.profileFrameLayer.mode;
    this.updateProfileFraming(this.time.now);
  }

  private updateProfileFraming(time: number) {
    const layer = this.profileFrameLayer;
    if (!layer) return;
    const motion = this.profileAnimationTuning();
    const frame = Math.floor(time / motion.frameMs);
    this.profileAnimationFrame = frame;
    const g = layer.pulse;
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const projectile = hex(this.def.palette.projectile);
    const phase = time * 0.001;

    g.clear();
    if (layer.mode === 'raid-lock') {
      const sweep = phase * 1.8;
      g.lineStyle(2, danger, 0.32);
      g.strokeCircle(cx, cy, 118 + Math.sin(phase * 3.2) * 8);
      for (let i = 0; i < 4; i++) {
        const angle = sweep + i * (Math.PI / 2);
        g.lineBetween(cx + Math.cos(angle) * 76, cy + Math.sin(angle) * 76, cx + Math.cos(angle) * 168, cy + Math.sin(angle) * 168);
      }
      return;
    }
    if (layer.mode === 'siege-anchor') {
      const bar = 42 + Math.sin(phase * 2.2) * 8;
      g.lineStyle(3, projectile, 0.28);
      g.strokeRoundedRect(cx - 152, cy - 92, 304, 184, 12);
      g.lineStyle(2, danger, 0.26);
      g.lineBetween(cx - bar, cy - 116, cx + bar, cy - 116);
      g.lineBetween(cx - bar, cy + 116, cx + bar, cy + 116);
      return;
    }
    if (layer.mode === 'cozy-route') {
      g.lineStyle(2, xp, 0.26);
      const y = h - 92;
      for (let i = 0; i < 9; i++) {
        const x = 88 + i * ((w - 176) / 8);
        const offset = Math.sin(phase * 2 + i * 0.7) * 8;
        g.lineBetween(x - 16, y + offset, x + 16, y - offset * 0.6);
      }
      g.lineStyle(1, accent, 0.2);
      g.strokeCircle(cx, cy, 86 + Math.sin(phase * 1.4) * 5);
      return;
    }
    if (layer.mode === 'score-lane') {
      const lane = Math.sin(phase * 3.4) * 18;
      g.lineStyle(2, projectile, 0.32);
      g.lineBetween(88, cy - 126 + lane, w - 88, cy - 126 - lane * 0.25);
      g.lineBetween(88, cy + 126 - lane, w - 88, cy + 126 + lane * 0.25);
      g.lineStyle(1, xp, 0.28);
      for (let i = 0; i < 7; i++) {
        const x = 128 + i * ((w - 256) / 6);
        g.strokeRect(x - 8, cy - 9 + Math.sin(phase * 4 + i) * 5, 16, 18);
      }
      return;
    }

    g.lineStyle(2, accent, 0.24);
    g.strokeCircle(cx, cy, 96 + Math.sin(phase * 2) * 6);
  }

  private setupCameraDirector() {
    const tuning = this.profileCameraTuning();
    const quietTemplate = isQuietLiteralBackdropTemplate(this.def);
    const quietAlpha = hasLiteralBackdrop(this.def) ? 0.1 : 0.34;
    this.cameraDirectorLayer = {
      mode: tuning.mode,
      graphics: this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud - 0.34).setAlpha(quietTemplate ? quietAlpha : 0.88),
    };
    this.cameraDirectorMode = tuning.mode;
    this.cameraDirectorFx = 1;
    this.cameraDirectorIntensity = 0;
    this.cameras.main.setZoom(1);
  }

  private playerStartPosition(width: number, height: number) {
    if (this.isPuzzleRoom()) {
      const puzzle = this.puzzleDefinition();
      const board = this.puzzleBoardLayout(width, height);
      return this.puzzleCellCenter(puzzle.start.x, puzzle.start.y, board);
    }
    if (this.isPlatformer()) {
      return {
        x: clamp(width * 0.16, 92, width - 92),
        y: clamp(height - 142, 92, height - 92),
      };
    }
    if (!this.isFlightShooter()) return { x: width / 2, y: height / 2 };
    return {
      x: clamp(width * 0.18, 104, width - 104),
      y: height / 2,
    };
  }

  private puzzleDefinition(): NonNullable<GameDefinition['puzzleRoom']> {
    return this.def.puzzleRoom ?? {
      name: this.def.arena.name,
      gridWidth: 8,
      gridHeight: 6,
      start: { x: 1, y: 1 },
      exit: { x: 6, y: 4 },
      walls: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 },
        { x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 },
        { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 },
        { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 7, y: 3 }, { x: 7, y: 4 },
      ],
      blocks: [{ id: 'block-mirror', x: 3, y: 2 }],
      switches: [{ x: 4, y: 2 }],
      gems: [{ id: 'gem-prism', x: 2, y: 1, value: 50 }],
      hazards: [{ x: 3, y: 4 }],
      moveLimit: 40,
    };
  }

  private puzzleBoardLayout(width = this.scale.width, height = this.scale.height): PuzzleBoardLayout {
    const puzzle = this.puzzleDefinition();
    const tile = Math.floor(Math.min(68, (width - 144) / puzzle.gridWidth, (height - 160) / puzzle.gridHeight));
    const boardWidth = tile * puzzle.gridWidth;
    const boardHeight = tile * puzzle.gridHeight;
    return {
      ox: Math.floor((width - boardWidth) / 2),
      oy: Math.floor((height - boardHeight) / 2) + 28,
      tile,
      width: boardWidth,
      height: boardHeight,
    };
  }

  private puzzleCellCenter(x: number, y: number, board = this.puzzleBoard ?? this.puzzleBoardLayout()) {
    return {
      x: board.ox + x * board.tile + board.tile / 2,
      y: board.oy + y * board.tile + board.tile / 2,
    };
  }

  private setupPuzzleRoomTemplateLayer(width: number, height: number) {
    if (!this.isPuzzleRoom()) return;
    const puzzle = this.puzzleDefinition();
    const board = this.puzzleBoardLayout(width, height);
    this.puzzleBoard = board;
    this.puzzlePlayerCell = { ...puzzle.start };
    this.puzzleMoves = 0;
    this.puzzleSolved = false;
    this.puzzleBlocks = [];
    this.puzzleGems = [];
    this.puzzleSwitches = [];
    this.puzzleFx = 0;

    const floor = hex(this.def.palette.floor);
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const projectile = hex(this.def.palette.projectile);
    const wallKeys = new Set(puzzle.walls.map((point) => this.puzzleKey(point.x, point.y)));
    const children: Phaser.GameObjects.GameObject[] = [];

    const back = this.add.rectangle(board.ox + board.width / 2, board.oy + board.height / 2, board.width + 56, board.height + 56, 0x05070b, 0.82)
      .setStrokeStyle(4, accent, 0.72);
    const innerGlow = this.add.rectangle(board.ox + board.width / 2, board.oy + board.height / 2, board.width + 24, board.height + 24, 0x0d1a28, 0.56)
      .setStrokeStyle(2, xp, 0.26);
    const leftPillar = this.add.rectangle(board.ox - 34, board.oy + board.height / 2, 18, board.height * 0.8, 0x10243a, 0.72)
      .setStrokeStyle(2, accent, 0.38);
    const rightPillar = this.add.rectangle(board.ox + board.width + 34, board.oy + board.height / 2, 18, board.height * 0.8, 0x10243a, 0.72)
      .setStrokeStyle(2, accent, 0.38);
    children.push(back, innerGlow, leftPillar, rightPillar);
    const crystalAnchors = [
      { x: board.ox - 18, y: board.oy - 18 },
      { x: board.ox + board.width + 18, y: board.oy - 18 },
      { x: board.ox - 18, y: board.oy + board.height + 18 },
      { x: board.ox + board.width + 18, y: board.oy + board.height + 18 },
    ];
    for (const [index, point] of crystalAnchors.entries()) {
      const shard = this.add.rectangle(point.x, point.y, 18, 18, index % 2 ? xp : accent, 0.38)
        .setRotation(Math.PI / 4)
        .setStrokeStyle(2, 0xffffff, 0.34);
      const halo = this.add.circle(point.x, point.y, 24, index % 2 ? xp : accent, 0.05)
        .setStrokeStyle(1, index % 2 ? xp : accent, 0.32);
      children.push(halo, shard);
    }

    for (let y = 0; y < puzzle.gridHeight; y++) {
      for (let x = 0; x < puzzle.gridWidth; x++) {
        const center = this.puzzleCellCenter(x, y, board);
        const isWall = wallKeys.has(this.puzzleKey(x, y));
        const tile = this.add.rectangle(center.x, center.y, board.tile - 2, board.tile - 2, isWall ? 0x102a4d : 0x11243a, isWall ? 1 : 0.9)
          .setStrokeStyle(isWall ? 2 : 1, isWall ? projectile : accent, isWall ? 0.68 : 0.3);
        children.push(tile);
        if (!isWall && (x + y) % 2 === 0) {
          children.push(this.add.rectangle(center.x, center.y, board.tile * 0.24, board.tile * 0.24, accent, 0.16).setRotation(Math.PI / 4));
        }
      }
    }

    for (const switchPoint of puzzle.switches) {
      const center = this.puzzleCellCenter(switchPoint.x, switchPoint.y, board);
      const ring = this.add.circle(center.x, center.y, board.tile * 0.28, accent, 0.1).setStrokeStyle(2, accent, 0.58);
      const core = this.add.rectangle(center.x, center.y, board.tile * 0.34, board.tile * 0.34, projectile, 0.2).setRotation(Math.PI / 4);
      this.puzzleSwitches.push({ x: switchPoint.x, y: switchPoint.y, ring, core });
      children.push(ring, core);
    }

    for (const hazard of puzzle.hazards) {
      const center = this.puzzleCellCenter(hazard.x, hazard.y, board);
      children.push(
        this.add.rectangle(center.x, center.y, board.tile * 0.58, board.tile * 0.58, danger, 0.16).setRotation(Math.PI / 4).setStrokeStyle(2, danger, 0.45),
        this.add.circle(center.x, center.y, board.tile * 0.16, danger, 0.35),
      );
    }

    for (const gem of puzzle.gems) {
      const center = this.puzzleCellCenter(gem.x, gem.y, board);
      const halo = this.add.circle(center.x, center.y, board.tile * 0.24, xp, 0.08)
        .setStrokeStyle(1, xp, 0.42);
      const marker = this.add.rectangle(center.x, center.y, board.tile * 0.28, board.tile * 0.28, xp, 0.88)
        .setRotation(Math.PI / 4)
        .setStrokeStyle(1, 0xffffff, 0.45);
      this.puzzleGems.push({ id: gem.id, x: gem.x, y: gem.y, value: gem.value, taken: false, gem: marker, halo });
      children.push(halo, marker);
    }

    for (const block of puzzle.blocks) {
      const center = this.puzzleCellCenter(block.x, block.y, board);
      const rect = this.add.rectangle(center.x, center.y, board.tile * 0.72, board.tile * 0.72, projectile, 0.72)
        .setStrokeStyle(2, 0xffffff, 0.34);
      const shine = this.add.rectangle(center.x, center.y - board.tile * 0.16, board.tile * 0.46, 4, 0xffffff, 0.28);
      this.puzzleBlocks.push({ id: block.id, x: block.x, y: block.y, rect, shine });
      children.push(rect, shine);
    }

    const exitCenter = this.puzzleCellCenter(puzzle.exit.x, puzzle.exit.y, board);
    const exitRing = this.add.circle(exitCenter.x, exitCenter.y, board.tile * 0.34, xp, 0.08)
      .setStrokeStyle(3, xp, 0.58);
    const exitCore = this.add.rectangle(exitCenter.x, exitCenter.y, board.tile * 0.44, board.tile * 0.44, xp, 0.32)
      .setRotation(Math.PI / 4)
      .setStrokeStyle(1, 0xffffff, 0.36);
    const exitLabel = this.add.circle(exitCenter.x, exitCenter.y + board.tile * 0.46, board.tile * 0.1, xp, 0.42)
      .setStrokeStyle(2, 0xffffff, 0.34);
    this.puzzleExit = { x: puzzle.exit.x, y: puzzle.exit.y, ring: exitRing, core: exitCore, label: exitLabel };
    children.push(exitRing, exitCore, exitLabel);

    this.puzzleLayer = this.add.container(0, 0, children).setDepth(DEPTH.decor + 0.34);
    const playerCenter = this.puzzleCellCenter(puzzle.start.x, puzzle.start.y, board);
    this.player.setPosition(playerCenter.x, playerCenter.y);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.reset(playerCenter.x, playerCenter.y);
    body.setAllowGravity(false);
    body.setVelocity(0, 0);
    body.setImmovable(true);
    this.facing = 'right';
    this.puzzleFx = puzzle.gridWidth * puzzle.gridHeight + puzzle.blocks.length * 2 + puzzle.gems.length * 2 + puzzle.switches.length * 2 + puzzle.hazards.length * 2 + 3;
    this.updatePuzzleSwitchVisuals(this.time.now);
    this.addDirectorEvent(`Puzzle room: ${puzzle.name}`, this.def.palette.xp, 6200);
  }

  private updatePuzzleRoomTemplateLayer(time: number) {
    if (!this.isPuzzleRoom() || !this.puzzleLayer) return;
    const phase = time * 0.001;
    const lit = this.puzzleSwitchesLit();
    const open = this.isPuzzleExitOpen();
    for (const gem of this.puzzleGems) {
      if (gem.taken) continue;
      const pulse = 1 + Math.sin(phase * 3.4 + gem.x) * 0.12;
      gem.gem.setScale(pulse).setRotation(Math.PI / 4 + phase * 0.8);
      gem.halo.setRadius((this.puzzleBoard?.tile ?? 52) * 0.24 * pulse);
    }
    this.updatePuzzleSwitchVisuals(time);
    if (this.puzzleExit) {
      const color = hex(open ? this.def.palette.xp : this.def.palette.accent);
      const alpha = open ? 0.66 + Math.sin(phase * 4) * 0.12 : 0.24;
      this.puzzleExit.ring.setStrokeStyle(open ? 4 : 2, color, alpha).setFillStyle(color, open ? 0.12 : 0.04);
      this.puzzleExit.core.setFillStyle(color, open ? 0.48 : 0.18).setScale(open ? 1 + Math.sin(phase * 5) * 0.08 : 0.86);
      this.puzzleExit.label
        .setAlpha(open ? 0.98 : 0.38 + lit / Math.max(1, this.puzzleSwitchTarget()) * 0.34)
        .setFillStyle(color, open ? 0.62 : 0.3)
        .setScale(open ? 1.25 + Math.sin(phase * 5) * 0.08 : 0.9);
    }
  }

  private updatePuzzleSwitchVisuals(time: number) {
    const board = this.puzzleBoard;
    if (!board) return;
    const phase = time * 0.001;
    for (const [index, switchPoint] of this.puzzleSwitches.entries()) {
      const lit = Boolean(this.puzzleBlockAt(switchPoint.x, switchPoint.y));
      const color = hex(lit ? this.def.palette.xp : this.def.palette.accent);
      const pulse = lit ? 1 + Math.sin(phase * 5 + index) * 0.1 : 0.92;
      switchPoint.ring
        .setRadius(board.tile * 0.28 * pulse)
        .setFillStyle(color, lit ? 0.18 : 0.08)
        .setStrokeStyle(lit ? 3 : 2, color, lit ? 0.72 : 0.42);
      switchPoint.core
        .setFillStyle(color, lit ? 0.52 : 0.2)
        .setScale(lit ? pulse : 0.92);
    }
  }

  private puzzleKey(x: number, y: number) {
    return `${x},${y}`;
  }

  private puzzleWallKeys() {
    return new Set(this.puzzleDefinition().walls.map((point) => this.puzzleKey(point.x, point.y)));
  }

  private puzzleBlockAt(x: number, y: number) {
    return this.puzzleBlocks.find((block) => block.x === x && block.y === y);
  }

  private puzzleInBounds(x: number, y: number) {
    const puzzle = this.puzzleDefinition();
    return x >= 0 && y >= 0 && x < puzzle.gridWidth && y < puzzle.gridHeight;
  }

  private puzzleBlocked(x: number, y: number) {
    return !this.puzzleInBounds(x, y) || this.puzzleWallKeys().has(this.puzzleKey(x, y));
  }

  private puzzleSwitchesLit() {
    return this.puzzleDefinition().switches.filter((point) => Boolean(this.puzzleBlockAt(point.x, point.y))).length;
  }

  private puzzleSwitchTarget() {
    return this.puzzleDefinition().switches.length;
  }

  private puzzleGemsCollected() {
    return this.puzzleGems.filter((gem) => gem.taken).length;
  }

  private isPuzzleExitOpen() {
    return this.puzzleSwitchesLit() >= this.puzzleSwitchTarget();
  }

  private updatePuzzleRoomInput(intent: Intent, time: number) {
    if (!this.isPuzzleRoom() || time < this.puzzleNextMoveAt || this.puzzleSolved) return;
    const horizontal = Math.abs(intent.dx) >= Math.abs(intent.dy);
    const dx = horizontal ? Math.sign(intent.dx) : 0;
    const dy = horizontal ? 0 : Math.sign(intent.dy);
    if (!dx && !dy) return;
    if (this.tryPuzzleMove(dx, dy)) this.puzzleNextMoveAt = time + 180;
  }

  private tryPuzzleMove(dx: number, dy: number) {
    const cell = this.puzzlePlayerCell;
    if (!cell || !this.puzzleBoard || this.puzzleSolved) return false;
    const next = { x: cell.x + dx, y: cell.y + dy };
    if (this.puzzleBlocked(next.x, next.y)) return false;

    const block = this.puzzleBlockAt(next.x, next.y);
    if (block) {
      const pushed = { x: block.x + dx, y: block.y + dy };
      if (this.puzzleBlocked(pushed.x, pushed.y) || this.puzzleBlockAt(pushed.x, pushed.y)) return false;
      block.x = pushed.x;
      block.y = pushed.y;
      const blockCenter = this.puzzleCellCenter(block.x, block.y);
      this.tweens.add({ targets: [block.rect, block.shine], x: blockCenter.x, y: blockCenter.y, duration: 110, ease: 'Sine.Out' });
      this.pulse(blockCenter.x, blockCenter.y, this.def.palette.projectile, this.puzzleBoard.tile * 0.32);
      this.triggerImpactBeat(this.def.palette.projectile, 0.34, 220);
    }

    this.puzzlePlayerCell = next;
    this.puzzleMoves++;
    this.updateFacing(dx, dy);
    const center = this.puzzleCellCenter(next.x, next.y);
    this.tweens.add({
      targets: this.player,
      x: center.x,
      y: center.y,
      duration: 105,
      ease: 'Sine.Out',
      onUpdate: () => {
        const body = this.player.body as Phaser.Physics.Arcade.Body | null;
        body?.reset(this.player.x, this.player.y);
      },
      onComplete: () => {
        const body = this.player.body as Phaser.Physics.Arcade.Body | null;
        body?.reset(center.x, center.y);
      },
    });
    this.collectPuzzleGem(next.x, next.y);
    this.checkPuzzleHazard(next.x, next.y);
    this.updatePuzzleSwitchVisuals(this.time.now);
    this.checkPuzzleExit(next.x, next.y);
    if (!this.over && this.puzzleMoves >= this.puzzleDefinition().moveLimit && !this.puzzleSolved) this.lose();
    return true;
  }

  private collectPuzzleGem(x: number, y: number) {
    const gem = this.puzzleGems.find((candidate) => !candidate.taken && candidate.x === x && candidate.y === y);
    if (!gem) return;
    gem.taken = true;
    this.score += gem.value;
    gem.gem.setVisible(false);
    gem.halo.setVisible(false);
    const center = this.puzzleCellCenter(x, y);
    this.pulse(center.x, center.y, this.def.palette.xp, (this.puzzleBoard?.tile ?? 52) * 0.42);
    this.floatDamage(center.x, center.y - 18, gem.value, this.def.palette.xp);
    this.addDirectorEvent(`Gem secured: ${this.puzzleGemsCollected()}/${this.puzzleGems.length}`, this.def.palette.xp, 3600);
  }

  private checkPuzzleHazard(x: number, y: number) {
    const hazard = this.puzzleDefinition().hazards.some((point) => point.x === x && point.y === y);
    if (!hazard) return;
    this.damagePlayer(16);
    const center = this.puzzleCellCenter(x, y);
    this.pulse(center.x, center.y, this.def.palette.danger, (this.puzzleBoard?.tile ?? 52) * 0.38);
  }

  private checkPuzzleExit(x: number, y: number) {
    const puzzle = this.puzzleDefinition();
    if (x !== puzzle.exit.x || y !== puzzle.exit.y || !this.isPuzzleExitOpen()) return;
    this.puzzleSolved = true;
    this.score += 250;
    this.addDirectorEvent('Puzzle solved: exit open', this.def.palette.xp, 5200);
    this.win();
  }

  private agentDashboardDefinition(): NonNullable<GameDefinition['agentDashboard']> {
    return this.def.agentDashboard ?? {
      mission: `Ship ${this.def.title}`,
      summary: 'Coordinate agents, approvals, QA, and deployment health.',
      operatingMode: 'test',
      confidence: 72,
      agents: [
        { id: 'planner', name: 'Planner', role: 'Scope and sequence', status: 'working', load: 66, focus: 'template-safe plan' },
        { id: 'builder', name: 'Builder', role: 'Runtime implementation', status: 'working', load: 74, focus: 'GameDefinition wiring' },
        { id: 'tester', name: 'Tester', role: 'Browser QA', status: 'idle', load: 48, focus: 'self-test evidence' },
      ],
      tasks: [
        { id: 'task-plan', title: 'Select runtime template', ownerId: 'planner', status: 'done', priority: 'high', eta: 'done' },
        { id: 'task-build', title: 'Generate playable artifact', ownerId: 'builder', status: 'working', priority: 'high', eta: 'active' },
        { id: 'task-qa', title: 'Verify browser smoke', ownerId: 'tester', status: 'todo', priority: 'high', eta: 'next' },
      ],
      approvals: [
        { id: 'approve-ship', title: 'Approve deployment handoff', requesterId: 'tester', status: 'pending', risk: 'medium' },
      ],
      logs: [
        { id: 'log-1', agentId: 'planner', message: 'Contract loaded.', tone: 'success' },
        { id: 'log-2', agentId: 'builder', message: 'Runtime mounted.', tone: 'info' },
        { id: 'log-3', agentId: 'tester', message: 'Awaiting approval.', tone: 'warning' },
      ],
      metrics: [
        { label: 'Confidence', value: '72%', trend: 'flat' },
        { label: 'QA checks', value: '5/8', trend: 'flat' },
        { label: 'Approvals', value: '0/1', trend: 'flat' },
      ],
      deploymentHealth: { checksPassing: 5, checksTotal: 8 },
    };
  }

  private setupAgentDashboardTemplateLayer(width: number, height: number) {
    if (!this.isAgentDashboard()) return;
    const dashboard = this.agentDashboardDefinition();
    this.agentDashboardApproved = new Set(dashboard.approvals.filter((approval) => approval.status === 'approved').map((approval) => approval.id));
    this.agentDashboardSelectedAgentId = dashboard.agents[0]?.id ?? null;
    this.agentDashboardLastApproveAt = -Infinity;
    this.agentDashboardFx = 0;

    const accent = hex(this.def.palette.accent);
    const xp = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);
    const floor = hex(this.def.palette.floor);
    const bg = hex(this.def.palette.background);
    const children: Phaser.GameObjects.GameObject[] = [];
    const panel = this.add.rectangle(width / 2, height / 2, width - 72, height - 108, 0x05070b, 0.5)
      .setStrokeStyle(2, accent, 0.34);
    const sweep = this.add.graphics();
    children.push(panel, sweep);

    const addText = (x: number, y: number, text: string, size: number, color = '#ffffff', w = 220, weight = '600') => {
      const item = this.add.text(x, y, text, {
        ...TEXT,
        fontSize: `${size}px`,
        fontStyle: weight,
        color,
        wordWrap: { width: w, useAdvancedWrap: true },
      }).setOrigin(0, 0);
      children.push(item);
      return item;
    };
    const addPanel = (x: number, y: number, w: number, h: number, label: string, color = accent) => {
      const rect = this.add.rectangle(x, y, w, h, floor, 0.58)
        .setOrigin(0, 0)
        .setStrokeStyle(1, color, 0.24);
      const header = this.add.rectangle(x, y, w, 24, bg, 0.55).setOrigin(0, 0);
      const title = addText(x + 12, y + 6, label, 10, this.def.palette.xp, w - 24, '800');
      children.push(rect, header);
      return { rect, title };
    };

    addText(56, 44, 'AGENT OPS COCKPIT', 11, this.def.palette.xp, 240, '800');
    addText(56, 66, truncateText(dashboard.mission, 48), 17, '#ffffff', 430, '800');
    addText(56, 102, truncateText(dashboard.summary, 132), 10, '#d8dde8', 560, '500');
    const statusText = addText(width - 360, 54, '', 13, '#ffffff', 300, '800');
    const healthText = addText(width - 360, 84, '', 12, this.def.palette.projectile, 300, '700');
    const approvalText = addText(width - 360, 110, '', 12, this.def.palette.xp, 300, '700');

    const metricTexts: Phaser.GameObjects.Text[] = [];
    const metricY = 138;
    dashboard.metrics.slice(0, 4).forEach((metric, index) => {
      const x = 56 + index * 178;
      const card = this.add.rectangle(x, metricY, 158, 58, floor, 0.62)
        .setOrigin(0, 0)
        .setStrokeStyle(1, metric.trend === 'down' ? danger : metric.trend === 'up' ? xp : accent, 0.24);
      const text = addText(x + 12, metricY + 10, `${metric.label}\n${metric.value}`, 13, '#ffffff', 136, '800');
      children.push(card);
      metricTexts.push(text);
    });

    addPanel(56, 220, 250, 272, 'AGENTS', accent);
    const agentTexts = dashboard.agents.slice(0, 5).map((agent, index) => {
      const y = 258 + index * 46;
      const card = this.add.rectangle(72, y - 8, 218, 38, bg, 0.34)
        .setOrigin(0, 0)
        .setStrokeStyle(1, agent.status === 'blocked' ? danger : agent.status === 'done' ? xp : accent, 0.22)
        .setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        this.agentDashboardSelectedAgentId = agent.id;
        this.updateAgentDashboardTemplateLayer(this.time.now);
      });
      children.push(card);
      return addText(84, y, `${agent.name} · ${agent.status}\n${agent.focus}`, 11, '#ffffff', 188, '700');
    });

    addPanel(330, 220, 330, 272, 'QUEUE', accent);
    const taskTexts = dashboard.tasks.slice(0, 5).map((task, index) => {
      const y = 258 + index * 42;
      const owner = dashboard.agents.find((agent) => agent.id === task.ownerId)?.name ?? task.ownerId;
      const color = task.status === 'done' ? this.def.palette.projectile : task.status === 'blocked' ? this.def.palette.danger : '#ffffff';
      return addText(350, y, `${task.priority.toUpperCase()} · ${truncateText(task.title, 38)}\n${owner} · ${task.status}`, 10, color, 282, '700');
    });

    addPanel(686, 220, 290, 272, 'APPROVALS', danger);
    const approvalCards = dashboard.approvals.slice(0, 4).map((approval, index) => {
      const y = 258 + index * 58;
      const card = this.add.rectangle(706, y - 10, 250, 48, bg, 0.42)
        .setOrigin(0, 0)
        .setStrokeStyle(1, danger, 0.26)
        .setInteractive({ useHandCursor: true });
      const text = addText(720, y, approval.title, 11, '#ffffff', 172, '800');
      const status = addText(898, y + 12, '', 10, this.def.palette.xp, 56, '800');
      card.on('pointerdown', () => this.approveNextAgentDashboardGate(approval.id));
      children.push(card);
      return { id: approval.id, card, text, status };
    });

    addPanel(1002, 220, 222, 272, 'LOGS', accent);
    const logTexts = dashboard.logs.slice(0, 5).map((log, index) => {
      const y = 258 + index * 42;
      const agent = dashboard.agents.find((candidate) => candidate.id === log.agentId)?.name ?? log.agentId;
      const color = log.tone === 'success' ? this.def.palette.projectile : log.tone === 'warning' ? this.def.palette.xp : log.tone === 'error' ? this.def.palette.danger : '#d8dde8';
      return addText(1020, y, `${agent}: ${truncateText(log.message, 44)}`, 10, color, 180, '650');
    });

    this.agentDashboardLayer = {
      container: this.add.container(0, 0, children).setDepth(DEPTH.decor + 0.48),
      panel,
      sweep,
      statusText,
      approvalText,
      healthText,
      agentTexts,
      taskTexts,
      approvalCards,
      logTexts,
      metricTexts,
    };
    this.agentDashboardFx = 12 + dashboard.agents.length + dashboard.tasks.length + dashboard.approvals.length * 3 + dashboard.logs.length + dashboard.metrics.length;
    this.addDirectorEvent(`Agent dashboard: ${dashboard.mission}`, this.def.palette.xp, 6200);
    this.updateAgentDashboardTemplateLayer(this.time.now);
  }

  private updateAgentDashboardTemplateLayer(time: number) {
    if (!this.isAgentDashboard() || !this.agentDashboardLayer) return;
    const dashboard = this.agentDashboardDefinition();
    const layer = this.agentDashboardLayer;
    const health = this.agentDashboardHealthPercent();
    const approvals = this.agentDashboardApprovalCount();
    const approvalTarget = this.agentDashboardApprovalTarget();
    const selected = dashboard.agents.find((agent) => agent.id === this.agentDashboardSelectedAgentId) ?? dashboard.agents[0];
    const phase = time * 0.001;
    const sweepX = 56 + ((time * 0.035) % Math.max(1, this.scale.width - 112));
    layer.sweep
      .clear()
      .lineStyle(1, hex(this.def.palette.projectile), 0.12)
      .lineBetween(sweepX, 134, sweepX + 82, 492)
      .lineStyle(1, hex(this.def.palette.accent), 0.08)
      .strokeCircle(1112, 104, 34 + Math.sin(phase * 3) * 3);
    layer.panel.setStrokeStyle(2, hex(this.agentDashboardReady() ? this.def.palette.projectile : this.def.palette.accent), this.agentDashboardReady() ? 0.58 : 0.34);
    layer.statusText.setText(`${dashboard.operatingMode.toUpperCase()} MODE · ${dashboard.confidence}% CONFIDENCE`);
    layer.healthText.setText(`Deploy health ${health}% · checks ${dashboard.deploymentHealth.checksPassing}/${dashboard.deploymentHealth.checksTotal}`);
    layer.approvalText.setText(`Approvals ${approvals}/${approvalTarget}${selected ? ` · focus ${selected.name}` : ''}`);
    for (const card of layer.approvalCards) {
      const approved = this.agentDashboardApproved.has(card.id);
      card.card
        .setFillStyle(hex(approved ? this.def.palette.projectile : this.def.palette.floor), approved ? 0.24 : 0.48)
        .setStrokeStyle(approved ? 2 : 1, hex(approved ? this.def.palette.projectile : this.def.palette.danger), approved ? 0.7 : 0.3);
      card.status
        .setText(approved ? 'OK' : 'WAIT')
        .setColor(approved ? this.def.palette.projectile : this.def.palette.xp)
        .setAlpha(approved ? 1 : 0.72 + Math.sin(phase * 4) * 0.16);
    }
    layer.metricTexts[2]?.setText(`Approvals\n${approvals}/${approvalTarget}`);
    if (time - this.agentDashboardLastApproveAt < 480) {
      layer.approvalText.setAlpha(0.72 + Math.sin(phase * 18) * 0.24);
    } else {
      layer.approvalText.setAlpha(1);
    }
  }

  private agentDashboardApprovalTarget() {
    return this.agentDashboardDefinition().approvals.length;
  }

  private agentDashboardApprovalCount() {
    const approvals = this.agentDashboardDefinition().approvals;
    return approvals.filter((approval) => approval.status === 'approved' || this.agentDashboardApproved.has(approval.id)).length;
  }

  private agentDashboardTasksDone() {
    return this.agentDashboardDefinition().tasks.filter((task) => task.status === 'done').length;
  }

  private agentDashboardHealthPercent() {
    const health = this.agentDashboardDefinition().deploymentHealth;
    return Math.round((health.checksPassing / Math.max(1, health.checksTotal)) * 100);
  }

  private agentDashboardReady() {
    return this.agentDashboardApprovalCount() >= this.agentDashboardApprovalTarget();
  }

  private approveNextAgentDashboardGate(id?: string) {
    if (!this.isAgentDashboard() || this.over) return;
    const dashboard = this.agentDashboardDefinition();
    const approval = id
      ? dashboard.approvals.find((candidate) => candidate.id === id)
      : dashboard.approvals.find((candidate) => candidate.status !== 'approved' && !this.agentDashboardApproved.has(candidate.id));
    if (!approval || approval.status === 'approved' || this.agentDashboardApproved.has(approval.id)) return;
    this.agentDashboardApproved.add(approval.id);
    this.agentDashboardSelectedAgentId = approval.requesterId;
    this.agentDashboardLastApproveAt = this.time.now;
    this.score += 75;
    this.pulse(this.scale.width - 260, 258 + this.agentDashboardApprovalCount() * 42, this.def.palette.projectile, 34);
    this.addDirectorEvent(`Approval cleared: ${approval.title}`, this.def.palette.projectile, 4200);
    this.updateAgentDashboardTemplateLayer(this.time.now);
    if (this.agentDashboardReady()) {
      this.score += 250;
      this.addDirectorEvent('Release gates approved', this.def.palette.xp, 5200);
      this.win();
    }
  }

  private decisionRoomDefinition(): NonNullable<GameDefinition['decisionRoom']> {
    return this.def.decisionRoom ?? {
      brief: `Decide how to advance ${this.def.title}`,
      recommendation: 'Recommend the phased launch option because it balances momentum with verified risk.',
      stakeholders: [
        { id: 'product', name: 'Product Lead', role: 'Customer value', stance: 'support', priority: 'high' },
        { id: 'engineering', name: 'Engineering Lead', role: 'Delivery risk', stance: 'concerned', priority: 'high' },
        { id: 'growth', name: 'Growth Lead', role: 'Launch narrative', stance: 'neutral', priority: 'medium' },
      ],
      evidence: [
        { id: 'evidence-runtime', title: 'Runtime smoke is green', source: 'browser self-test', confidence: 76, impact: 'upside' },
        { id: 'evidence-art', title: 'Reviewed art needs validation', source: 'asset pipeline', confidence: 68, impact: 'risk' },
        { id: 'evidence-deploy', title: 'Deployment token path is pending', source: 'deploy smoke', confidence: 64, impact: 'constraint' },
      ],
      options: [
        { id: 'option-phased-launch', title: 'Phased Launch', summary: 'Ship the core slice first and keep scope locked.', ownerId: 'product', cost: 'medium', upside: 82, risk: 38 },
        { id: 'option-beta-ring', title: 'Private Beta Ring', summary: 'Open to a small review group before broad release.', ownerId: 'engineering', cost: 'low', upside: 72, risk: 28 },
      ],
      auditTrail: [
        { id: 'audit-brief', actorId: 'product', action: 'Framed the decision around a playable slice.', tone: 'info' },
        { id: 'audit-risk', actorId: 'engineering', action: 'Flagged art and deploy validation risk.', tone: 'warning' },
        { id: 'audit-growth', actorId: 'growth', action: 'Compared the launch story against visible polish.', tone: 'support' },
      ],
      decisionGate: { recommendedOptionId: 'option-phased-launch', minimumConfidence: 68 },
    };
  }

  private setupDecisionRoomTemplateLayer(width: number, height: number) {
    if (!this.isDecisionRoom()) return;
    const room = this.decisionRoomDefinition();
    this.decisionRoomSelectedOptionId = null;
    this.decisionRoomLastSelectAt = -Infinity;
    this.decisionRoomFx = 0;

    const accent = hex(this.def.palette.accent);
    const xp = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);
    const floor = hex(this.def.palette.floor);
    const bg = hex(this.def.palette.background);
    const children: Phaser.GameObjects.GameObject[] = [];
    const panel = this.add.rectangle(width / 2, height / 2, width - 72, height - 108, 0x05070b, 0.52)
      .setStrokeStyle(2, accent, 0.34);
    const sweep = this.add.graphics();
    children.push(panel, sweep);

    const addText = (x: number, y: number, text: string, size: number, color = '#ffffff', w = 220, weight = '600') => {
      const item = this.add.text(x, y, text, {
        ...TEXT,
        fontSize: `${size}px`,
        fontStyle: weight,
        color,
        wordWrap: { width: w, useAdvancedWrap: true },
      }).setOrigin(0, 0);
      children.push(item);
      return item;
    };
    const addPanel = (x: number, y: number, w: number, h: number, label: string, color = accent) => {
      const rect = this.add.rectangle(x, y, w, h, floor, 0.6)
        .setOrigin(0, 0)
        .setStrokeStyle(1, color, 0.24);
      const header = this.add.rectangle(x, y, w, 24, bg, 0.58).setOrigin(0, 0);
      const title = addText(x + 12, y + 6, label, 10, this.def.palette.xp, w - 24, '800');
      children.push(rect, header);
      return { rect, title };
    };

    addText(56, 44, 'DECISION ROOM', 11, this.def.palette.xp, 240, '800');
    addText(56, 66, room.brief, 24, '#ffffff', 560, '800');
    const recommendationText = addText(56, 104, room.recommendation, 12, '#d8dde8', 680, '600');
    const statusText = addText(width - 384, 58, '', 13, '#ffffff', 320, '800');

    addPanel(56, 158, 250, 314, 'STAKEHOLDERS', accent);
    const stakeholderTexts = room.stakeholders.slice(0, 5).map((stakeholder, index) => {
      const y = 194 + index * 52;
      const stanceColor = stakeholder.stance === 'blocking' || stakeholder.stance === 'concerned'
        ? this.def.palette.danger
        : stakeholder.stance === 'support'
          ? this.def.palette.projectile
          : '#ffffff';
      const card = this.add.rectangle(72, y - 8, 218, 42, bg, 0.34)
        .setOrigin(0, 0)
        .setStrokeStyle(1, hex(stanceColor), 0.26);
      children.push(card);
      return addText(84, y, `${stakeholder.name} · ${stakeholder.stance}\n${stakeholder.role} · ${stakeholder.priority}`, 11, '#ffffff', 188, '700');
    });

    addPanel(330, 158, 320, 314, 'EVIDENCE', accent);
    const evidenceTexts = room.evidence.slice(0, 5).map((evidence, index) => {
      const y = 194 + index * 52;
      const color = evidence.impact === 'risk'
        ? this.def.palette.danger
        : evidence.impact === 'upside'
          ? this.def.palette.projectile
          : this.def.palette.xp;
      return addText(350, y, `${evidence.confidence}% · ${evidence.title}\n${evidence.source} · ${evidence.impact}`, 10, color, 282, '700');
    });

    addPanel(674, 158, 332, 314, 'OPTIONS', danger);
    const optionCards = room.options.slice(0, 4).map((option, index) => {
      const y = 194 + index * 66;
      const owner = room.stakeholders.find((stakeholder) => stakeholder.id === option.ownerId)?.name ?? option.ownerId;
      const card = this.add.rectangle(694, y - 10, 286, 56, bg, 0.42)
        .setOrigin(0, 0)
        .setStrokeStyle(1, danger, 0.28)
        .setInteractive({ useHandCursor: true });
      const text = addText(710, y, `${option.title} · ${option.cost}\n${truncateText(option.summary, 68)}`, 11, '#ffffff', 206, '800');
      const status = addText(922, y + 8, `${option.upside}/${option.risk}\n${owner.split(' ')[0] ?? owner}`, 10, this.def.palette.xp, 58, '800');
      card.on('pointerdown', () => this.chooseDecisionRoomOption(option.id));
      children.push(card);
      return { id: option.id, card, text, status };
    });

    addPanel(1030, 158, 194, 314, 'AUDIT', accent);
    const auditTexts = room.auditTrail.slice(0, 6).map((audit, index) => {
      const y = 194 + index * 42;
      const actor = room.stakeholders.find((stakeholder) => stakeholder.id === audit.actorId)?.name ?? audit.actorId;
      const color = audit.tone === 'risk' || audit.tone === 'warning'
        ? this.def.palette.danger
        : audit.tone === 'support'
          ? this.def.palette.projectile
          : '#d8dde8';
      return addText(1048, y, `${actor}: ${truncateText(audit.action, 54)}`, 10, color, 154, '650');
    });

    this.decisionRoomLayer = {
      container: this.add.container(0, 0, children).setDepth(DEPTH.decor + 0.5),
      panel,
      sweep,
      statusText,
      recommendationText,
      stakeholderTexts,
      evidenceTexts,
      optionCards,
      auditTexts,
    };
    this.decisionRoomFx = 12 + room.stakeholders.length + room.evidence.length + room.options.length * 3 + room.auditTrail.length;
    this.addDirectorEvent(`Decision room: ${room.brief}`, this.def.palette.xp, 6200);
    this.updateDecisionRoomTemplateLayer(this.time.now);
  }

  private updateDecisionRoomTemplateLayer(time: number) {
    if (!this.isDecisionRoom() || !this.decisionRoomLayer) return;
    const room = this.decisionRoomDefinition();
    const layer = this.decisionRoomLayer;
    const confidence = this.decisionRoomConfidence();
    const recommended = this.decisionRoomRecommendedOptionId();
    const selected = this.decisionRoomSelectedOptionId;
    const phase = time * 0.001;
    const sweepX = 56 + ((time * 0.028) % Math.max(1, this.scale.width - 112));
    layer.sweep
      .clear()
      .lineStyle(1, hex(this.def.palette.projectile), 0.12)
      .lineBetween(sweepX, 150, sweepX + 74, 486)
      .lineStyle(1, hex(this.def.palette.accent), 0.1)
      .strokeCircle(1120, 92, 34 + Math.sin(phase * 2.6) * 3);
    layer.panel.setStrokeStyle(2, hex(this.decisionRoomReady() ? this.def.palette.projectile : this.def.palette.accent), this.decisionRoomReady() ? 0.62 : 0.34);
    layer.statusText.setText(`CONFIDENCE ${confidence}% · GATE ${room.decisionGate.minimumConfidence}%\nOPTIONS ${room.options.length} · EVIDENCE ${room.evidence.length}`);
    layer.recommendationText.setAlpha(time - this.decisionRoomLastSelectAt < 480 ? 0.72 + Math.sin(phase * 18) * 0.24 : 1);
    for (const option of layer.optionCards) {
      const isRecommended = option.id === recommended;
      const isSelected = option.id === selected;
      const chosenWrong = Boolean(selected && selected !== recommended && isSelected);
      option.card
        .setFillStyle(hex(isSelected ? this.def.palette.projectile : this.def.palette.floor), isSelected ? 0.25 : 0.46)
        .setStrokeStyle(isRecommended || isSelected ? 2 : 1, hex(chosenWrong ? this.def.palette.danger : isSelected || isRecommended ? this.def.palette.projectile : this.def.palette.danger), isSelected || isRecommended ? 0.7 : 0.3);
      option.status
        .setText(isSelected ? 'SELECTED' : isRecommended ? 'REC' : 'ALT')
        .setColor(isSelected || isRecommended ? this.def.palette.projectile : this.def.palette.xp)
        .setAlpha(isRecommended && !isSelected ? 0.72 + Math.sin(phase * 4) * 0.16 : 1);
    }
  }

  private decisionRoomRecommendedOptionId() {
    return this.decisionRoomDefinition().decisionGate.recommendedOptionId;
  }

  private decisionRoomConfidence() {
    const evidence = this.decisionRoomDefinition().evidence;
    const total = evidence.reduce((sum, item) => sum + item.confidence, 0);
    return Math.round(total / Math.max(1, evidence.length));
  }

  private decisionRoomReady() {
    const room = this.decisionRoomDefinition();
    return this.decisionRoomSelectedOptionId === room.decisionGate.recommendedOptionId &&
      this.decisionRoomConfidence() >= room.decisionGate.minimumConfidence;
  }

  private chooseDecisionRoomOption(id?: string) {
    if (!this.isDecisionRoom() || this.over) return;
    const room = this.decisionRoomDefinition();
    const option = id
      ? room.options.find((candidate) => candidate.id === id)
      : room.options.find((candidate) => candidate.id === room.decisionGate.recommendedOptionId) ?? room.options[0];
    if (!option) return;
    this.decisionRoomSelectedOptionId = option.id;
    this.decisionRoomLastSelectAt = this.time.now;
    this.score += option.id === room.decisionGate.recommendedOptionId ? 125 : 35;
    this.pulse(this.scale.width - 360, 210 + room.options.findIndex((candidate) => candidate.id === option.id) * 64, option.id === room.decisionGate.recommendedOptionId ? this.def.palette.projectile : this.def.palette.danger, 34);
    this.addDirectorEvent(`Decision selected: ${option.title}`, option.id === room.decisionGate.recommendedOptionId ? this.def.palette.projectile : this.def.palette.danger, 4400);
    this.updateDecisionRoomTemplateLayer(this.time.now);
    if (this.decisionRoomReady()) {
      this.score += 250;
      this.addDirectorEvent('Recommendation accepted', this.def.palette.xp, 5200);
      this.win();
    }
  }

  private setupPlatformerTemplateLayer(width: number, height: number) {
    if (!this.isPlatformer()) return;
    this.platformerLayer = this.add.graphics().setDepth(DEPTH.decor + 0.16);
    this.platformSolids = [];

    const floor = hex(this.def.palette.floor);
    const bg = hex(this.def.palette.background);
    const accent = hex(this.def.palette.accent);
    const xp = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);
    const bright = isBrightPalette(this.def);
    const literalBackdrop = hasLiteralBackdrop(this.def);
    const backdropSupportAlpha = literalBackdrop ? 0.34 : 1;
    const g = this.platformerLayer;
    g.fillStyle(0x071018, (bright ? 0.96 : 0.92) * backdropSupportAlpha);
    g.fillRect(0, 0, width, height);
    g.fillStyle(0x101a1c, 0.94 * backdropSupportAlpha);
    g.fillRect(0, height * 0.12, width, height * 0.3);
    g.fillStyle(0x213321, 0.92 * backdropSupportAlpha);
    g.fillRect(0, height * 0.28, width, height * 0.18);
    g.fillStyle(0x0b0f12, 0.88 * backdropSupportAlpha);
    g.fillRect(0, height * 0.42, width, height * 0.12);
    g.fillStyle(0x425342, 0.86 * backdropSupportAlpha);
    const towerXs = [width * 0.12, width * 0.27, width * 0.43, width * 0.6, width * 0.78, width * 0.9];
    for (const [index, x] of towerXs.entries()) {
      const towerW = 38 + (index % 3) * 12;
      const towerH = 96 + (index % 2) * 34;
      const top = height * 0.2 - (index % 3) * 13;
      g.fillRect(x - towerW / 2, top, towerW, towerH);
      g.fillRect(x - towerW / 2 - 8, top - 16, towerW + 16, 18);
      for (let tooth = 0; tooth < 3; tooth++) {
        g.fillRect(x - towerW / 2 - 3 + tooth * (towerW / 2), top - 28, 12, 16);
      }
      g.lineStyle(2, 0x9bd48f, literalBackdrop ? 0.16 : 0.24);
      g.strokeRect(x - towerW / 2, top, towerW, towerH);
      g.fillStyle(0x05070b, 0.62 * backdropSupportAlpha);
      g.fillRoundedRect(x - 7, top + 34, 14, 34, 4);
      g.fillStyle(0x425342, 0.86 * backdropSupportAlpha);
    }
    g.fillStyle(0x536a4e, literalBackdrop ? 0.22 : 0.48);
    g.fillRect(0, height * 0.31, width, 38);
    g.lineStyle(3, 0xa7d79b, literalBackdrop ? 0.2 : 0.34);
    g.lineBetween(0, height * 0.31, width, height * 0.31);
    g.lineBetween(0, height * 0.31 + 38, width, height * 0.31 + 38);
    g.fillStyle(0x6f8764, literalBackdrop ? 0.2 : 0.42);
    for (let x = 18; x < width; x += 44) {
      g.fillRect(x, height * 0.31 - 18, 24, 18);
    }
    g.fillStyle(0x05070b, literalBackdrop ? 0.22 : 0.54);
    for (let x = 72; x < width; x += 128) {
      g.fillRoundedRect(x, height * 0.31 + 8, 18, 24, 4);
    }
    g.fillStyle(accent, literalBackdrop ? 0.04 : 0.09);
    g.fillRect(0, height * 0.22, width, height * 0.6);
    g.lineStyle(3, xp, bright ? 0.42 : 0.3);
    g.lineBetween(38, height * 0.3, width - 38, height * 0.3);
    g.lineStyle(2, accent, bright ? 0.42 : 0.32);
    for (let i = 0; i < 7; i++) {
      const x = 48 + i * Math.max(84, (width - 96) / 6);
      const top = height * 0.17 + (i % 2) * 16;
      const h = 54 + (i % 3) * 18;
      g.fillStyle(i % 2 ? 0x4e614f : 0x61735d, literalBackdrop ? 0.2 : bright ? 0.52 : 0.42);
      g.fillRect(x, top, 46, h);
      g.fillRect(x - 8, top - 13, 14, 16);
      g.fillRect(x + 15, top - 13, 14, 16);
      g.fillRect(x + 38, top - 13, 14, 16);
      g.strokeRect(x, top, 46, h);
      g.fillStyle(0x081019, literalBackdrop ? 0.18 : 0.42);
      g.fillRoundedRect(x + 17, top + 18, 12, 24, 3);
    }
    g.lineStyle(2, danger, 0.24);
    for (let i = 0; i < 3; i++) {
      const cx = width * (0.32 + i * 0.21);
      const cy = height * (0.32 + (i % 2) * 0.09);
      const r = 24 + i * 5;
      g.strokeCircle(cx, cy, r);
      g.strokeCircle(cx, cy, r * 0.42);
      for (let tooth = 0; tooth < 8; tooth++) {
        const angle = tooth * Math.PI / 4;
        g.lineBetween(cx + Math.cos(angle) * r * 0.58, cy + Math.sin(angle) * r * 0.58, cx + Math.cos(angle) * r * 1.18, cy + Math.sin(angle) * r * 1.18);
      }
    }
    g.lineStyle(3, xp, 0.24);
    g.lineBetween(42, height * 0.68, width - 42, height * 0.58);
    g.lineStyle(2, danger, 0.24);
    for (let i = 0; i < 6; i++) {
      const x = 90 + i * ((width - 180) / 5);
      const y = height - 132 - (i % 3) * 44;
      g.lineBetween(x - 32, y, x + 32, y - 12);
      g.fillStyle(i % 2 === 0 ? xp : accent, 0.14);
      g.fillCircle(x, y - 20, 6 + (i % 3) * 3);
    }

    this.platformerEdgeLayer = this.add.graphics().setDepth(DEPTH.decor + 0.36);
    const edge = this.platformerEdgeLayer;
    const drawBrickEdges = (x: number, y: number, w: number, h: number) => {
      const left = x - w / 2;
      const top = y - h / 2;
      edge.lineStyle(2, 0x000000, bright ? 0.32 : 0.18);
      edge.lineBetween(left, top + 2, left + w, top + 2);
      edge.lineStyle(2, xp, bright ? 0.42 : 0.28);
      edge.lineBetween(left + 4, top + 3, left + w - 4, top + 3);
      edge.lineStyle(1, 0xffffff, bright ? 0.18 : 0.11);
      const brickStep = Math.max(34, Math.min(58, w / 4));
      for (let bx = left + brickStep; bx < left + w - 8; bx += brickStep) {
        edge.lineBetween(bx, top + 6, bx, top + h - 5);
      }
      edge.lineStyle(1, accent, bright ? 0.2 : 0.14);
      edge.lineBetween(left + 8, top + h * 0.55, left + w - 8, top + h * 0.55);
    };

    const addSolid = (x: number, y: number, w: number, h: number, alpha = 0.92) => {
      const rect = this.add.rectangle(x, y, w, h, floor, Math.min(0.98, alpha + 0.04))
        .setStrokeStyle(3, accent, 0.58)
        .setDepth(DEPTH.decor + 0.32);
      this.physics.add.existing(rect, true);
      this.platformSolids.push(rect);
      drawBrickEdges(x, y, w, h);
      return rect;
    };

    addSolid(width / 2, height - 52, width - 80, 46, 0.96);
    addSolid(width * 0.26, height - 168, 220, 26, 0.88);
    addSolid(width * 0.52, height - 252, 240, 26, 0.86);
    addSolid(width * 0.76, height - 188, 210, 26, 0.88);
    addSolid(width * 0.88, height - 326, 130, 24, 0.78);
    this.platformerFx = this.platformSolids.length + 28;
  }

  private setupPlatformerColliders() {
    if (!this.isPlatformer() || this.platformSolids.length === 0) return;
    for (const solid of this.platformSolids) {
      this.physics.add.collider(this.player, solid);
      this.physics.add.collider(this.enemies, solid);
      this.physics.add.collider(this.orbs, solid);
      this.physics.add.collider(this.objectivePickups, solid);
      if (this.escortAlly) this.physics.add.collider(this.escortAlly, solid);
      if (this.rescueObjective?.ally) this.physics.add.collider(this.rescueObjective.ally, solid);
      if (this.defendCore?.image) this.physics.add.collider(this.defendCore.image, solid);
    }
  }

  private setupFlightTemplateLayer(width: number, height: number) {
    if (!this.isFlightShooter()) return;
    this.flightLaneLayer = this.add.graphics().setDepth(DEPTH.decor + 0.18);
    this.flightLaneFx = 10;
    this.drawFlightTemplateLayer(width, height, this.time.now);
  }

  private updateFlightTemplateLayer(dt: number, time: number) {
    if (!this.flightLaneLayer || !this.isFlightShooter()) return;
    this.flightScrollOffset = (this.flightScrollOffset + dt * 128) % 160;
    this.drawFlightTemplateLayer(this.scale.width, this.scale.height, time);
  }

  private updatePlatformerTemplateLayer(time: number) {
    if (!this.platformerLayer || !this.isPlatformer()) return;
    const g = this.platformerLayer;
    const width = this.scale.width;
    const height = this.scale.height;
    const phase = time * 0.001;
    const accent = hex(this.def.palette.accent);
    const xp = hex(this.def.palette.xp);
    g.clear();
    g.fillStyle(accent, 0.045);
    g.fillRect(0, height * 0.22, width, height * 0.6);
    g.lineStyle(2, xp, 0.12 + Math.sin(phase * 1.7) * 0.025);
    g.lineBetween(42, height * 0.68, width - 42, height * 0.58);
    for (let i = 0; i < 7; i++) {
      const x = 70 + ((phase * 26 + i * 157) % Math.max(120, width - 140));
      const y = height - 122 - (i % 4) * 54 + Math.sin(phase * 1.3 + i) * 6;
      g.fillStyle(i % 2 === 0 ? xp : accent, 0.06);
      g.fillCircle(x, y, 6 + (i % 3) * 3);
    }
  }

  private drawFlightTemplateLayer(width: number, height: number, time: number) {
    const g = this.flightLaneLayer;
    if (!g) return;
    const accent = hex(this.def.palette.accent);
    const projectile = hex(this.def.palette.projectile);
    const xp = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);
    const phase = time * 0.001;
    g.clear();

    g.fillStyle(accent, 0.055);
    g.fillRect(0, height * 0.18, width, height * 0.64);
    g.fillStyle(xp, 0.045);
    g.fillRect(0, height * 0.42 + Math.sin(phase * 0.7) * 12, width, 42);

    const lanes = 5;
    for (let i = 1; i <= lanes; i++) {
      const y = (height / (lanes + 1)) * i;
      const laneAlpha = i === 3 ? 0.28 : 0.18;
      g.lineStyle(2, accent, laneAlpha);
      g.lineBetween(42, y, width - 42, y);
      g.lineStyle(1, projectile, 0.18);
      for (let x = width - this.flightScrollOffset; x > -80; x -= 160) {
        g.lineBetween(x, y - 8, x + 46, y - 8);
        g.lineBetween(x + 26, y + 9, x + 74, y + 9);
      }
    }

    for (let i = 0; i < 12; i++) {
      const x = (width - ((this.flightScrollOffset * (0.5 + (i % 3) * 0.16) + i * 126) % (width + 160))) + 80;
      const y = 54 + ((i * 89 + Math.sin(phase + i) * 22) % Math.max(90, height - 108));
      const radius = 10 + (i % 4) * 5;
      g.fillStyle(i % 5 === 0 ? danger : xp, i % 5 === 0 ? 0.09 : 0.075);
      g.fillRoundedRect(x - radius * 1.8, y - radius * 0.48, radius * 3.6, radius * 0.96, radius * 0.46);
      g.fillCircle(x - radius * 0.66, y - radius * 0.42, radius * 0.52);
      g.fillCircle(x + radius * 0.28, y - radius * 0.36, radius * 0.44);
    }

    g.lineStyle(2, xp, 0.2);
    g.strokeRoundedRect(36, 38, width - 72, height - 76, 18);
    g.lineStyle(1, projectile, 0.18);
    g.lineBetween(width * 0.18, 42, width * 0.18, height - 42);
    g.lineBetween(width * 0.78, 42, width * 0.78, height - 42);
  }

  private updateCameraDirector(time: number) {
    const layer = this.cameraDirectorLayer;
    if (!layer) return;
    const tuning = this.profileCameraTuning();
    const cameraStyle = this.playStyle().camera;
    const styleScale = cameraStyle === 'dramatic' ? 1.16 : cameraStyle === 'steady' ? 0.78 : 1;
    const threat = this.currentThreatLevel();
    const enemyPressure = this.enemies?.children.size ?? 0;
    const bossPressure = this.boss?.active ? 1 : 0;
    const pressure = clamp(((threat - 1) / 4) * 0.64 + Math.min(0.24, enemyPressure * 0.045) + bossPressure * 0.1, 0, 1);
    const intensity = clamp((0.18 + pressure * 0.82) * tuning.focus * styleScale, 0.06, 1);
    const targetZoom = 1 + tuning.zoom * styleScale * (0.42 + pressure * 0.8);
    const camera = this.cameras.main;
    camera.setZoom(Phaser.Math.Linear(camera.zoom, targetZoom, 0.045));

    this.cameraDirectorMode = tuning.mode;
    this.cameraDirectorIntensity = Number(intensity.toFixed(3));

    const g = layer.graphics;
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const projectile = hex(this.def.palette.projectile);
    const xp = hex(this.def.palette.xp);
    const phase = time * 0.001;
    const alpha = 0.08 + intensity * 0.18;

    g.clear();
    if (tuning.mode === 'raid-assault') {
      this.cameraDirectorFx = 9;
      const sweep = phase * tuning.scan;
      g.fillStyle(danger, alpha * 0.34);
      g.fillRect(0, 0, w, 14 + intensity * 10);
      g.fillRect(0, h - (14 + intensity * 10), w, 14 + intensity * 10);
      g.lineStyle(2, danger, 0.18 + intensity * 0.16);
      g.strokeCircle(cx, cy, 142 + Math.sin(sweep * 2.2) * 10);
      for (let i = 0; i < 4; i++) {
        const angle = sweep + i * Math.PI / 2;
        g.lineBetween(cx + Math.cos(angle) * 96, cy + Math.sin(angle) * 96, cx + Math.cos(angle) * 224, cy + Math.sin(angle) * 224);
      }
      return;
    }

    if (tuning.mode === 'siege-lock') {
      this.cameraDirectorFx = 8;
      const gate = 38 + Math.sin(phase * 1.8) * 5;
      g.fillStyle(projectile, alpha * 0.26);
      g.fillRect(0, 72, 16 + intensity * 10, h - 144);
      g.fillRect(w - (16 + intensity * 10), 72, 16 + intensity * 10, h - 144);
      g.lineStyle(2, projectile, 0.16 + intensity * 0.14);
      g.strokeRoundedRect(cx - 196, cy - 116, 392, 232, 10);
      g.lineBetween(cx - gate, cy - 144, cx + gate, cy - 144);
      g.lineBetween(cx - gate, cy + 144, cx + gate, cy + 144);
      return;
    }

    if (tuning.mode === 'cozy-wide') {
      this.cameraDirectorFx = 6;
      g.lineStyle(2, xp, 0.1 + intensity * 0.12);
      const horizon = h * 0.72 + Math.sin(phase * 1.4) * 5;
      g.lineBetween(92, horizon, w - 92, horizon);
      g.lineStyle(1, accent, 0.08 + intensity * 0.1);
      for (let i = 0; i < 5; i++) {
        const x = 118 + i * ((w - 236) / 4);
        g.strokeCircle(x, horizon + Math.sin(phase * 1.6 + i) * 12, 9 + intensity * 4);
      }
      g.strokeCircle(cx, cy, 118 + Math.sin(phase) * 4);
      return;
    }

    if (tuning.mode === 'score-sprint') {
      this.cameraDirectorFx = 10;
      const lane = Math.sin(phase * 3.2) * 14;
      g.lineStyle(2, projectile, 0.14 + intensity * 0.18);
      for (let i = 0; i < 4; i++) {
        const y = cy - 150 + i * 100 + lane * (i % 2 ? -0.4 : 0.4);
        g.lineBetween(72, y, w - 72, y + lane * 0.28);
      }
      g.fillStyle(xp, alpha * 0.36);
      for (let i = 0; i < 7; i++) {
        const x = 94 + ((phase * 120 + i * 96) % (w - 188));
        g.fillRect(x, cy - 6, 18, 12);
      }
      return;
    }

    this.cameraDirectorFx = 5;
    g.lineStyle(2, accent, 0.12 + intensity * 0.12);
    g.strokeCircle(cx, cy, 124 + Math.sin(phase * 1.7) * 6);
    g.lineStyle(1, projectile, 0.1 + intensity * 0.1);
    g.lineBetween(cx - 168, cy, cx - 88, cy);
    g.lineBetween(cx + 88, cy, cx + 168, cy);
    g.lineBetween(cx, cy - 128, cx, cy - 72);
    g.lineBetween(cx, cy + 72, cx, cy + 128);
  }

  private rebuildSpawnQueue() {
    this.spawnQueue = [];
    if (this.isPuzzleRoom() || this.isAgentDashboard() || this.isDecisionRoom()) return;
    const pressure = this.pressureProfile();
    for (const [waveIndex, wave] of this.def.waves.entries()) {
      const enemy = this.def.enemies.find((e) => e.id === wave.enemyId) ?? this.def.enemies[0]!;
      const ramp = this.pressureRampForWave(waveIndex);
      const count = Math.max(1, Math.round(wave.count * pressure.countScale * ramp));
      const intervalMs = Math.max(240, wave.everyMs * pressure.intervalScale / Math.sqrt(ramp));
      for (let i = 0; i < count; i++) {
        this.spawnQueue.push({
          at: wave.atSeconds * pressure.timeScale + (i * intervalMs) / 1000,
          enemy,
          eliteKind: this.eliteKindForWave(waveIndex, i, enemy),
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
  }

  private eliteKindForWave(waveIndex: number, spawnIndex: number, enemy: Enemy): EliteKind {
    const pressure = this.playStyle().pressure;
    const firstEliteIndex = pressure === 'intense' ? 2 : pressure === 'relaxed' ? 5 : 3;
    if (spawnIndex < firstEliteIndex || waveIndex === 0) return 'none';
    const rollModulo = pressure === 'intense' ? 9 : pressure === 'siege' ? 10 : pressure === 'relaxed' ? 17 : 13;
    const roll = stableHash(`${this.def.title}:${enemy.id}:${waveIndex}:${spawnIndex}:${pressure}`) % rollModulo;
    if (roll === 0) return 'volatile';
    if (roll === 1 || (spawnIndex + waveIndex) % 11 === 0) return 'armored';
    if (roll === 2 || (spawnIndex + waveIndex) % 9 === 0) return 'swift';
    return 'none';
  }

  private eliteStats(kind: EliteKind) {
    if (kind === 'swift') return { hp: 1.12, speed: 1.38, damage: 1.12, xp: 1.8, score: 1.8, scale: 1.04 };
    if (kind === 'armored') return { hp: 1.78, speed: 0.82, damage: 1.2, xp: 2.2, score: 2.35, scale: 1.12 };
    if (kind === 'volatile') return { hp: 1.25, speed: 1.04, damage: 1.34, xp: 2, score: 2.15, scale: 1.08 };
    return { hp: 1, speed: 1, damage: 1, xp: 1, score: 1, scale: 1 };
  }

  private eliteColor(kind: EliteKind) {
    if (kind === 'swift') return this.def.palette.xp;
    if (kind === 'armored') return this.def.palette.accent;
    if (kind === 'volatile') return this.def.palette.projectile;
    return this.def.palette.accent;
  }

  private countEliteEnemies() {
    return this.enemies.children.getArray().filter((child) => {
      const enemy = child as ArcadeImage;
      return enemy.active && !enemy.getData('boss') && enemy.getData('eliteKind') !== 'none';
    }).length;
  }

  private gatherIntent(): Intent {
    const left = this.keys.A?.isDown || this.keys.LEFT?.isDown;
    const right = this.keys.D?.isDown || this.keys.RIGHT?.isDown;
    const up = this.keys.W?.isDown || this.keys.UP?.isDown;
    const down = this.keys.S?.isDown || this.keys.DOWN?.isDown;
    const keyboardIntent: Intent = {
      dx: (right ? 1 : 0) - (left ? 1 : 0),
      dy: (down ? 1 : 0) - (up ? 1 : 0),
      attack: Boolean(this.keys.SPACE?.isDown || this.keys.J?.isDown),
      dash: Boolean(this.keys.SHIFT?.isDown || this.keys.K?.isDown),
    };
    const touchIntent = this.touchControlsVisible ? this.touchIntent : { dx: 0, dy: 0, attack: false, dash: false };
    const playerIntent: Intent = {
      dx: keyboardIntent.dx || touchIntent.dx,
      dy: keyboardIntent.dy || touchIntent.dy,
      attack: keyboardIntent.attack || touchIntent.attack,
      dash: keyboardIntent.dash || touchIntent.dash,
    };
    if (this.externalIntentRemainingMs <= 0) return playerIntent;
    return {
      dx: playerIntent.dx || this.externalIntent.dx,
      dy: playerIntent.dy || this.externalIntent.dy,
      attack: playerIntent.attack || this.externalIntent.attack,
      dash: playerIntent.dash || this.externalIntent.dash,
    };
  }

  private setupTouchControls() {
    this.touchControlsVisible = shouldShowTouchControls();
    this.touchIntent = { dx: 0, dy: 0, attack: false, dash: false };
    this.touchStickPointerId = null;
    if (!this.touchControlsVisible) return;

    this.game.canvas.style.touchAction = 'none';
    const w = this.scale.width;
    const h = this.scale.height;
    const accent = hex(this.def.palette.accent);
    const xp = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);
    const baseX = 118;
    const baseY = h - 108;
    const baseRadius = 58;
    const attackX = w - 96;
    const attackY = h - 108;
    const dashX = w - 184;
    const dashY = h - 78;
    const children: Phaser.GameObjects.GameObject[] = [];

    this.touchStickBase = this.add.circle(baseX, baseY, baseRadius, 0x000000, 0.18)
      .setStrokeStyle(2, accent, 0.38)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: false });
    this.touchStickThumb = this.add.circle(baseX, baseY, 22, xp, 0.4)
      .setStrokeStyle(2, 0xffffff, 0.38)
      .setScrollFactor(0);
    this.touchStickCenter = { x: baseX, y: baseY };
    this.touchStickBase.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.startTouchStick(pointer));
    this.touchStickBase.on('pointermove', (pointer: Phaser.Input.Pointer) => this.updateTouchStick(pointer));
    const moveTouchStick = (pointer: Phaser.Input.Pointer) => this.updateTouchStick(pointer);
    const releaseTouchStick = (pointer: Phaser.Input.Pointer) => this.releaseTouchStick(pointer);
    this.input.on('pointermove', moveTouchStick);
    this.input.on('pointerup', releaseTouchStick);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointermove', moveTouchStick);
      this.input.off('pointerup', releaseTouchStick);
    });
    children.push(this.touchStickBase, this.touchStickThumb);

    const dash = this.add.circle(dashX, dashY, 34, 0x000000, 0.2)
      .setStrokeStyle(2, xp, 0.48)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: false });
    const dashLabel = this.add.text(dashX, dashY, 'D', {
      ...TEXT,
      fontSize: '16px',
      fontStyle: '700',
      color: this.def.palette.xp,
    }).setOrigin(0.5).setScrollFactor(0);
    const attack = this.add.circle(attackX, attackY, 43, 0x000000, 0.22)
      .setStrokeStyle(2, danger, 0.52)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: false });
    const attackLabel = this.add.text(attackX, attackY, 'A', {
      ...TEXT,
      fontSize: '20px',
      fontStyle: '700',
      color: this.def.palette.danger,
    }).setOrigin(0.5).setScrollFactor(0);

    bindTouchButton(dash, (down) => {
      this.touchIntent.dash = down;
      dash.setFillStyle(down ? xp : 0x000000, down ? 0.34 : 0.2);
    });
    bindTouchButton(attack, (down) => {
      this.touchIntent.attack = down;
      attack.setFillStyle(down ? danger : 0x000000, down ? 0.35 : 0.22);
    });
    children.push(dash, dashLabel, attack, attackLabel);

    this.touchControls = this.add.container(0, 0, children)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 4)
      .setAlpha(0.86);
  }

  private startTouchStick(pointer: Phaser.Input.Pointer) {
    this.touchStickPointerId = pointer.id;
    this.updateTouchStick(pointer);
  }

  private updateTouchStick(pointer: Phaser.Input.Pointer) {
    if (this.touchStickPointerId !== pointer.id || !this.touchStickThumb) return;
    const max = 48;
    const dx = pointer.x - this.touchStickCenter.x;
    const dy = pointer.y - this.touchStickCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      this.touchIntent.dx = 0;
      this.touchIntent.dy = 0;
      this.touchStickThumb.setPosition(this.touchStickCenter.x, this.touchStickCenter.y);
      return;
    }
    const scale = Math.min(1, max / dist);
    const thumbX = this.touchStickCenter.x + dx * scale;
    const thumbY = this.touchStickCenter.y + dy * scale;
    const len = Math.hypot(dx, dy) || 1;
    this.touchIntent.dx = dx / len;
    this.touchIntent.dy = dy / len;
    this.touchStickThumb.setPosition(thumbX, thumbY);
  }

  private releaseTouchStick(pointer: Phaser.Input.Pointer) {
    if (this.touchStickPointerId !== pointer.id) return;
    this.touchStickPointerId = null;
    this.touchIntent.dx = 0;
    this.touchIntent.dy = 0;
    this.touchStickThumb?.setPosition(this.touchStickCenter.x, this.touchStickCenter.y);
  }

  private consumeExternalIntent(deltaMs: number) {
    if (this.externalIntentRemainingMs <= 0) return;
    this.externalIntentRemainingMs = Math.max(0, this.externalIntentRemainingMs - deltaMs);
    if (this.externalIntentRemainingMs === 0) {
      this.externalIntent = { dx: 0, dy: 0, attack: false, dash: false };
    }
  }

  private applyInjectedMovementNudge(intent: Intent, durationMs: number) {
    if (!this.player?.active || (!intent.dx && !intent.dy)) return;
    if (this.isPuzzleRoom()) {
      const horizontal = Math.abs(intent.dx) >= Math.abs(intent.dy);
      const dx = horizontal ? Math.sign(intent.dx) : 0;
      const dy = horizontal ? 0 : Math.sign(intent.dy);
      if (dx || dy) this.tryPuzzleMove(dx, dy);
      this.externalIntentRemainingMs = 0;
      return;
    }
    if (this.isPlatformer()) {
      const body = this.player.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const radius = this.def.player.radius;
      if (intent.dx) {
        const x = clamp(this.player.x + intent.dx * this.moveSpeed * (durationMs / 1000), radius, this.scale.width - radius);
        this.player.setPosition(x, this.player.y);
        body.reset(x, this.player.y);
        body.setVelocityX(intent.dx * this.moveSpeed);
        this.updateFacing(intent.dx, 0);
      }
      if (intent.dy < -0.2 && (this.platformerGrounded || body.blocked.down || body.touching.down)) {
        body.setVelocityY(-Math.max(430, this.moveSpeed * 2.1));
        this.platformerGrounded = false;
        this.platformerJumpFx++;
        this.pulse(this.player.x, this.player.y + radius, this.def.palette.xp, 22);
      }
      return;
    }
    const len = Math.hypot(intent.dx, intent.dy) || 1;
    const distance = this.moveSpeed * (durationMs / 1000);
    const radius = this.def.player.radius;
    const x = clamp(this.player.x + (intent.dx / len) * distance, radius, this.scale.width - radius);
    const y = clamp(this.player.y + (intent.dy / len) * distance, radius, this.scale.height - radius);
    this.player.setPosition(x, y);
    (this.player.body as Phaser.Physics.Arcade.Body | null)?.reset(x, y);
    this.updateFacing(intent.dx, intent.dy);
  }

  private applyMovement(intent: Intent, time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const dashActive = time < this.dashActiveUntil;
    const speed = this.moveSpeed * (dashActive ? 2.8 : 1);
    if (this.isPlatformer()) {
      const grounded = body.blocked.down || body.touching.down;
      this.platformerGrounded = grounded;
      body.setVelocityX(intent.dx ? intent.dx * speed : 0);
      if (intent.dx) this.updateFacing(intent.dx, 0);
      if (grounded && intent.dy < -0.2) {
        body.setVelocityY(-Math.max(430, this.moveSpeed * 2.1));
        this.platformerJumpFx++;
        this.pulse(this.player.x, this.player.y + this.def.player.radius, this.def.palette.xp, 22);
      }
      if (dashActive && time - this.lastTrailAt > 42) {
        this.lastTrailAt = time;
        this.afterimage(this.player, this.def.palette.xp, 0.34, 230);
      }
      return;
    }
    if (this.isFlightShooter()) {
      const len = Math.hypot(intent.dx, intent.dy) || 1;
      const inputX = intent.dx ? (intent.dx / len) * speed * 0.72 : 0;
      const inputY = intent.dy ? (intent.dy / len) * speed : 0;
      const forward = speed * (dashActive ? 0.3 : 0.18);
      body.setVelocity(
        clamp(forward + inputX, -speed * 0.42, speed * 1.15),
        inputY,
      );
      if (intent.dx || intent.dy) this.updateFacing(intent.dx >= 0 ? 1 : -1, intent.dy);
      else this.facing = 'right';
      if (dashActive && time - this.lastTrailAt > 42) {
        this.lastTrailAt = time;
        this.afterimage(this.player, this.def.palette.xp, 0.34, 230);
      }
      return;
    }
    if (intent.dx || intent.dy) {
      const len = Math.hypot(intent.dx, intent.dy) || 1;
      const vx = (intent.dx / len) * speed;
      const vy = (intent.dy / len) * speed;
      body.setVelocity(vx, vy);
      this.updateFacing(intent.dx, intent.dy);
    } else if (!dashActive) {
      body.setVelocity(0, 0);
    }
    if (dashActive && time - this.lastTrailAt > 42) {
      this.lastTrailAt = time;
      this.afterimage(this.player, this.def.palette.xp, 0.34, 230);
    }
  }

  private updateFacing(dx: number, dy: number) {
    if (Math.abs(dx) >= Math.abs(dy)) this.facing = dx >= 0 ? 'right' : 'left';
    else this.facing = dy >= 0 ? 'down' : 'up';
  }

  private tryDash(intent: Intent, time: number) {
    if (time - this.lastDashAt < this.def.player.dashCooldownMs) return;
    this.lastDashAt = time;
    this.dashActiveUntil = time + 170;
    const vec = this.isPlatformer()
      ? { x: intent.dx || (this.facing === 'left' ? -1 : 1), y: 0 }
      : intent.dx || intent.dy ? normalize(intent.dx, intent.dy) : facingVector(this.facing);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vec.x * this.moveSpeed * 3.2, vec.y * this.moveSpeed * 3.2);
    this.player.setAlpha(0.48);
    this.time.delayedCall(170, () => this.player.setAlpha(1));
    this.pulse(this.player.x, this.player.y, this.def.palette.xp, 26);
    this.afterimage(this.player, this.def.palette.xp, 0.5, 280);
  }

  private tryMelee(time: number) {
    if (time - this.lastAttackAt < 260) return;
    this.lastAttackAt = time;
    this.attackActiveUntil = time + 95;
    this.positionAttackArc();
    this.attackArc.setVisible(true).setAlpha(0.8);
    this.tweens.add({ targets: this.attackArc, alpha: 0, scale: 1.25, duration: 120, onComplete: () => this.attackArc.setScale(1).setVisible(false) });
    this.applyMeleeHits();
    this.sparkBurst(
      this.player.x + facingVector(this.facing).x * this.meleeRange * 0.7,
      this.player.y + facingVector(this.facing).y * this.meleeRange * 0.7,
      this.def.palette.accent,
      7,
    );
  }

  private updateAttackArc(time: number) {
    if (time > this.attackActiveUntil) {
      if (this.attackArc.visible) this.attackArc.setVisible(false);
      return;
    }
    this.positionAttackArc();
  }

  private positionAttackArc() {
    const vec = facingVector(this.facing);
    this.attackArc.setPosition(this.player.x + vec.x * this.meleeRange * 0.72, this.player.y + vec.y * this.meleeRange * 0.72);
  }

  private applyMeleeHits() {
    const vec = facingVector(this.facing);
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      const dot = dist <= 0 ? 1 : (dx / dist) * vec.x + (dy / dist) * vec.y;
      if (dist <= this.meleeRange + ((enemy.getData('radius') as number) || 12) && dot > 0.16) {
        this.hitEnemy(undefined, enemy, this.meleeDamage, false);
      }
      return true;
    });
  }

  private releaseDueWaves() {
    while (this.spawnQueue.length && this.spawnQueue[0]!.at <= this.elapsed) {
      const spawn = this.spawnQueue.shift()!;
      this.telegraphSpawn(spawn.enemy, false, spawn.eliteKind);
    }
  }

  private chooseSpawnPoint(isBoss: boolean): SpawnPoint {
    const { width, height } = this.scale;
    if (this.isFlightShooter()) {
      return {
        x: isBoss ? width - 142 : width + (isBoss ? 0 : Phaser.Math.Between(28, 92)),
        y: isBoss ? height / 2 : Phaser.Math.Between(64, Math.max(64, height - 64)),
      };
    }
    if (this.isPlatformer()) {
      return {
        x: isBoss ? width - 156 : width + Phaser.Math.Between(34, 96),
        y: isBoss ? height - 154 : height - 112,
      };
    }
    const edge = Phaser.Math.Between(0, 3);
    const margin = isBoss ? 72 : 20;
    return {
      x: edge === 0 ? margin : edge === 1 ? width - margin : Phaser.Math.Between(margin, width - margin),
      y: edge === 2 ? margin : edge === 3 ? height - margin : Phaser.Math.Between(margin, height - margin),
    };
  }

  private telegraphSpawn(e: Enemy | Boss, isBoss = false, eliteKind: EliteKind = 'none') {
    const point = this.chooseSpawnPoint(isBoss);
    const delay = Math.round((isBoss ? 680 : 460) * this.pressureProfile().telegraphScale);
    const elite = !isBoss && eliteKind !== 'none';
    const radius = Math.max(e.radius * (isBoss ? 1.55 : elite ? 1.7 : 1.4), isBoss ? 72 : elite ? 46 : 32);
    this.pendingSpawns++;
    this.spawnWarning(point.x, point.y, radius, isBoss ? this.def.palette.danger : elite ? this.eliteColor(eliteKind) : this.def.palette.accent, delay, eliteKind);
    this.time.delayedCall(delay, () => {
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      if (this.over || this.time.now < this.suppressSpawnsUntil) return;
      this.spawnEnemy(e, isBoss, point, eliteKind);
    });
  }

  private spawnWarning(x: number, y: number, radius: number, color: string, delay: number, eliteKind: EliteKind = 'none') {
    const base = hex(color);
    const ring = this.add.circle(x, y, radius * 0.42, base, 0.08)
      .setStrokeStyle(2, base, 0.62)
      .setDepth(DEPTH.fx - 0.2);
    const cross = this.add.graphics().setDepth(DEPTH.fx - 0.15);
    cross.lineStyle(2, base, 0.45);
    cross.lineBetween(x - radius * 0.62, y, x + radius * 0.62, y);
    cross.lineBetween(x, y - radius * 0.62, x, y + radius * 0.62);
    if (eliteKind !== 'none') {
      cross.lineStyle(3, base, 0.62);
      cross.strokeCircle(x, y, radius * 0.72);
      cross.lineStyle(1, 0xffffff, 0.4);
      cross.strokeCircle(x, y, radius * 0.36);
    }
    const ringStartRadius = radius * 0.42;
    this.tweens.add({
      targets: ring,
      scale: radius / ringStartRadius,
      alpha: 0.42,
      yoyo: true,
      repeat: 1,
      duration: delay / 2,
      ease: 'Sine.InOut',
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: cross,
      alpha: 0,
      delay: Math.max(0, delay - 180),
      duration: 170,
      onComplete: () => cross.destroy(),
    });
  }

  private spawnEnemy(e: Enemy | Boss, isBoss = false, point = this.chooseSpawnPoint(isBoss), eliteKind: EliteKind = 'none') {
    const { x, y } = point;
    const elite = !isBoss ? this.eliteStats(eliteKind) : this.eliteStats('none');
    const hp = Math.round(e.health * elite.hp);
    const speed = Math.round(e.speed * elite.speed);
    const damage = e.damage * elite.damage;
    const xp = Math.round(e.xp * elite.xp);
    const score = Math.round(e.score * elite.score);
    const img = this.applyCircleBody(this.physics.add.image(x, y, e.spriteKey), e.radius)
      .setDepth(isBoss ? DEPTH.enemy + 1 : DEPTH.enemy);
    img.setData('id', e.id);
    img.setData('hp', hp);
    img.setData('maxHp', hp);
    img.setData('role', e.role);
    img.setData('speed', speed);
    img.setData('damage', damage);
    img.setData('xp', xp);
    img.setData('score', score);
    img.setData('radius', e.radius);
    img.setData('fire', Phaser.Math.FloatBetween(0, 0.8));
    img.setData('boss', isBoss);
    img.setData('eliteKind', isBoss ? 'none' : eliteKind);
    const visualScale = isBoss ? Math.max(1.7, elite.scale * 1.42) : Math.max(1.24, elite.scale * 1.2);
    img.setData('baseScale', visualScale);
    img.setData('wanderAngle', Phaser.Math.FloatBetween(0, Math.PI * 2));
    img.setData('phase', Phaser.Math.FloatBetween(0, Math.PI * 2));
    img.setData('spawnUntil', this.time.now + (isBoss ? 360 : 180));
    img.setCollideWorldBounds(!this.isFlightShooter() || isBoss);
    const body = img.body as Phaser.Physics.Arcade.Body;
    if (this.isPlatformer()) {
      body.setDragX(isBoss ? 420 : 680);
      body.setDragY(0);
      body.setMaxVelocity(Math.max(180, speed * 1.8), 760);
    }
    if (this.isFlightShooter()) img.setRotation(Math.PI);
    if (!isBoss && eliteKind !== 'none') img.setTint(hex(this.eliteColor(eliteKind)));
    this.attachShadow(img, e.radius, isBoss ? 0.42 : 0.26);
    this.attachEnemyReadout(img, e.radius, isBoss);
    this.attachEliteAura(img, e.radius, eliteKind);
    this.attachActorTell(img, e.role, e.radius, isBoss);
    this.attachActorRig(img, e.role, e.radius, isBoss);
    img.setScale(0.64).setAlpha(0.72);
    this.tweens.add({ targets: img, scale: visualScale, alpha: 1, duration: isBoss ? 360 : 180, ease: 'Back.Out' });
    this.enemies.add(img);
    if (isBoss) this.boss = img;
    if (isBoss) this.addDirectorEvent(`Boss contact: ${e.name}`, this.def.palette.danger, 6200);
    else if (eliteKind !== 'none') this.addDirectorEvent(`Elite ${eliteKind}: ${e.name}`, this.eliteColor(eliteKind), 5200);
    this.pulse(img.x, img.y, isBoss ? this.def.palette.danger : eliteKind !== 'none' ? this.eliteColor(eliteKind) : this.def.palette.accent, isBoss ? 44 : eliteKind !== 'none' ? 30 : 18);
    return img;
  }

  private updateAutoFire(deltaMs: number) {
    if (!this.autoFire) return;
    this.fireTimer += deltaMs;
    if (this.fireTimer < this.cooldownMs) return;
    this.fireTimer = 0;
    this.fireAtNearest();
  }

  private fireAtNearest() {
    let nearest: ArcadeImage | null = null;
    let best = Infinity;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (d < best) {
        best = d;
        nearest = enemy;
      }
      return true;
    });
    if (!nearest) return;
    const target = nearest as ArcadeImage;
    const base = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const w0 = this.def.player.weapons[0]!;
    const spread = w0.spread || 0.18;
    this.lastFireAt = this.time.now;
    for (let i = 0; i < this.projectiles; i++) {
      const a = base + (i - (this.projectiles - 1) / 2) * spread;
      this.spawnProjectile(this.player.x, this.player.y, a, w0.projectileSpeed, 'bullet', this.bullets, 1500);
    }
  }

  private spawnProjectile(
    x: number,
    y: number,
    angle: number,
    speed: number,
    key: 'bullet' | 'ebullet',
    group: Phaser.Physics.Arcade.Group,
    lifetimeMs: number,
  ) {
    const b = this.applyCircleBody(this.physics.add.image(x, y, key), key === 'bullet' ? 4 : 5)
      .setDepth(DEPTH.projectile);
    group.add(b);
    const body = b.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.projectileMuzzleFlash(x, y, key === 'bullet' ? this.def.palette.projectile : this.def.palette.danger, angle);
    this.time.delayedCall(lifetimeMs, () => b.destroy());
    return b;
  }

  private hitEnemy(projectile: ArcadeImage | undefined, enemy: ArcadeImage, amount: number, destroyProjectile: boolean) {
    if (destroyProjectile) projectile?.destroy();
    if (!enemy.active) return;
    const shielded = this.isEnemyShielded(enemy);
    const appliedAmount = shielded ? Math.max(1, Math.round(amount * 0.58)) : amount;
    const hp = (enemy.getData('hp') as number) - appliedAmount;
    const wasBoss = enemy.getData('boss') as boolean;
    const eliteKind = (enemy.getData('eliteKind') as EliteKind | undefined) ?? 'none';
    const hitColor = shielded ? this.def.palette.accent : wasBoss ? this.def.palette.danger : eliteKind !== 'none' ? this.eliteColor(eliteKind) : this.def.palette.projectile;
    this.floatDamage(enemy.x, enemy.y - (((enemy.getData('radius') as number) || 12) + 10), appliedAmount, hitColor);
    if (shielded) this.pulse(enemy.x, enemy.y, this.def.palette.projectile, Math.max(18, ((enemy.getData('radius') as number | undefined) ?? 12) * 1.5));
    if (hp <= 0) {
      this.awardEnemyScore(enemy, wasBoss, eliteKind);
      if (!wasBoss) {
        const orb = this.applyCircleBody(this.physics.add.image(enemy.x, enemy.y, 'orb'), 5)
          .setDepth(DEPTH.orb)
          .setTint(hex(this.def.palette.xp))
          .setScale(hasLiteralBackdrop(this.def) ? 1.45 : 1);
        orb.setData('xp', enemy.getData('xp'));
        this.orbs.add(orb);
      }
      if (eliteKind === 'volatile') this.fireVolatileDeathBurst(enemy.x, enemy.y);
      this.pulse(enemy.x, enemy.y, wasBoss ? this.def.palette.danger : eliteKind !== 'none' ? this.eliteColor(eliteKind) : this.def.palette.xp, wasBoss ? 54 : eliteKind !== 'none' ? 38 : 24);
      this.sparkBurst(enemy.x, enemy.y, wasBoss ? this.def.palette.danger : eliteKind !== 'none' ? this.eliteColor(eliteKind) : this.def.palette.xp, wasBoss ? 18 : eliteKind !== 'none' ? 14 : 10);
      this.impactShake(wasBoss ? 0.008 : eliteKind !== 'none' ? 0.005 : 0.003, wasBoss ? 140 : 80);
      this.triggerImpactBeat(wasBoss ? this.def.palette.danger : eliteKind !== 'none' ? this.eliteColor(eliteKind) : this.def.palette.xp, wasBoss ? 1 : eliteKind !== 'none' ? 0.82 : 0.58, wasBoss ? 420 : 300);
      enemy.destroy();
      if (wasBoss && this.def.winCondition === 'defeat-boss') this.win();
    } else {
      enemy.setData('hp', hp);
      this.updateEnemyReadout(enemy, hp);
      this.tweens.add({ targets: enemy, alpha: 0.42, duration: 60, yoyo: true });
      this.sparkBurst(enemy.x, enemy.y, hitColor, 4);
      this.impactShake(wasBoss ? 0.004 : 0.002, 60);
      this.triggerImpactBeat(hitColor, wasBoss ? 0.72 : 0.42, wasBoss ? 260 : 220);
    }
  }

  private awardEnemyScore(enemy: ArcadeImage, wasBoss: boolean, eliteKind: EliteKind) {
    const now = this.time.now;
    const baseScore = enemy.getData('score') as number;
    this.combo = now <= this.comboExpiresAt ? this.combo + 1 : 1;
    this.comboExpiresAt = now + (wasBoss ? 3600 : 2600);
    this.comboVisibleUntil = now + 1300;
    const multiplier = this.comboMultiplier();
    const reward = Math.max(1, Math.round(baseScore * multiplier));
    this.score += reward;
    if (this.combo > 1 || multiplier > 1) {
      const color = wasBoss ? this.def.palette.danger : eliteKind !== 'none' ? this.eliteColor(eliteKind) : this.def.palette.projectile;
      this.floatComboReward(enemy.x, enemy.y, reward, multiplier);
      this.comboPulse(enemy.x, enemy.y, color);
    }
  }

  private comboMultiplier() {
    if (this.combo <= 1 || this.time.now > this.comboExpiresAt) return 1;
    return Math.min(3, 1 + (this.combo - 1) * 0.25);
  }

  private breakCombo() {
    if (this.combo <= 0) return;
    this.combo = 0;
    this.comboExpiresAt = -Infinity;
    this.comboVisibleUntil = this.time.now + 420;
  }

  private hasVisibleCombo() {
    return this.combo > 1 && this.time.now < this.comboVisibleUntil;
  }

  private floatComboReward(x: number, y: number, reward: number, multiplier: number) {
    const label = this.add.text(x, y - 42, `Combo x${this.combo}  +${reward}  ${multiplier.toFixed(2)}x`, {
      ...TEXT,
      fontSize: '12px',
      fontStyle: '800',
      color: this.def.palette.projectile,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 1);
    this.tweens.add({
      targets: label,
      y: y - 72,
      alpha: 0,
      duration: 760,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  private comboPulse(x: number, y: number, color: string) {
    const startRadius = 18;
    const targetRadius = 30 + Math.min(26, this.combo * 3);
    const ring = this.add.circle(x, y, 18, hex(color), 0)
      .setStrokeStyle(3, hex(color), 0.72)
      .setDepth(DEPTH.fx + 0.2);
    this.tweens.add({
      targets: ring,
      scale: targetRadius / startRadius,
      alpha: 0,
      duration: 320,
      ease: 'Sine.Out',
      onComplete: () => ring.destroy(),
    });
  }

  private touchPlayer(enemy: ArcadeImage) {
    const isBoss = enemy.getData('boss') as boolean;
    const bossCharging = isBoss && enemy.getData('charging') === true;
    const baseDamage = enemy.getData('damage') as number;
    const manualMelee = this.autoFire === false;
    const multiplier = manualMelee
      ? isBoss
        ? bossCharging ? 2.4 : 2
        : 0.55
      : bossCharging ? 0.34 : 0.08;
    const floor = manualMelee ? (isBoss ? 24 : 4) : 0;
    const amount = Math.max(floor, baseDamage * multiplier);
    this.damagePlayer(amount);
  }

  private damagePlayer(amount: number) {
    if (this.over) return;
    const now = this.time.now;
    if (now - this.lastDamageAt < 450) return;
    this.lastDamageAt = now;
    this.hp = Math.max(0, this.hp - amount);
    this.player.setAlpha(0.35);
    this.time.delayedCall(90, () => this.player.setAlpha(1));
    this.damageFlash();
    this.sparkBurst(this.player.x, this.player.y, this.def.palette.danger, 6);
    this.floatDamage(this.player.x, this.player.y - this.def.player.radius - 10, amount, this.def.palette.danger);
    this.impactShake(0.006, 120);
    this.triggerImpactBeat(this.def.palette.danger, this.hp / Math.max(1, this.maxHp) < 0.35 ? 0.9 : 0.64, 320);
    this.breakCombo();
    this.addDirectorEvent(
      this.hp / Math.max(1, this.maxHp) < 0.35 ? `Critical HP: ${Math.ceil(this.hp)}` : `Hit: -${Math.ceil(amount)} HP`,
      this.def.palette.danger,
      3600,
    );
    if (this.hp <= 0) this.lose();
  }

  private collectOrb(o: ArcadeImage) {
    this.xp += (o.getData('xp') as number) || 1;
    o.destroy();
    if (this.xp < this.xpToNext) return;
    this.xp -= this.xpToNext;
    this.level++;
    this.xpToNext = Math.round(this.xpToNext * 1.4);
    this.openUpgradeChoice();
  }

  private openUpgradeChoice() {
    const choices = this.pickUpgradeChoices();
    if (choices.length === 0) {
      this.applyUpgrade(undefined);
      return;
    }
    this.choosingUpgrade = true;
    this.upgradeChoices = choices;
    this.physics.pause();
    this.showUpgradeOverlay(choices);
  }

  private pickUpgradeChoices(): Upgrade[] {
    const upgrades = this.def.upgrades;
    if (upgrades.length <= 3) return [...upgrades];
    const start = stableHash(`${this.def.title}:${this.level}:${this.score}`) % upgrades.length;
    const rotated = upgrades
      .map((upgrade, index) => ({ upgrade, index, rotation: (index - start + upgrades.length) % upgrades.length }))
      .sort((a, b) => this.upgradeStylePriority(a.upgrade) - this.upgradeStylePriority(b.upgrade) || a.rotation - b.rotation);
    return rotated.slice(0, 3).map((entry) => entry.upgrade);
  }

  private upgradeStylePriority(upgrade: Upgrade) {
    const style = this.playStyle();
    const byCadence: Partial<Record<PlayStyle['weaponCadence'], Upgrade['kind'][]>> = {
      deliberate: ['damage', 'maxHealth', 'speed', 'cooldown', 'projectiles', 'magnet', 'healing'],
      rapid: ['cooldown', 'damage', 'speed', 'projectiles', 'magnet', 'maxHealth', 'healing'],
      'bullet-hell': ['projectiles', 'cooldown', 'damage', 'magnet', 'speed', 'maxHealth', 'healing'],
      steady: ['damage', 'speed', 'cooldown', 'maxHealth', 'projectiles', 'magnet', 'healing'],
    };
    const byPressure: Partial<Record<PlayStyle['pressure'], Upgrade['kind'][]>> = {
      relaxed: ['magnet', 'speed', 'healing', 'damage', 'cooldown', 'projectiles', 'maxHealth'],
      siege: ['maxHealth', 'healing', 'damage', 'cooldown', 'projectiles', 'speed', 'magnet'],
      intense: ['cooldown', 'projectiles', 'damage', 'speed', 'magnet', 'maxHealth', 'healing'],
      standard: [],
    };
    const byProfile: Record<FeelProfile, Upgrade['kind'][]> = {
      'arcade-survivor': ['damage', 'speed', 'cooldown', 'projectiles', 'magnet', 'maxHealth', 'healing'],
      'bullet-hell-raid': ['projectiles', 'cooldown', 'damage', 'magnet', 'speed', 'maxHealth', 'healing'],
      'siege-defense': ['maxHealth', 'damage', 'cooldown', 'healing', 'projectiles', 'speed', 'magnet'],
      'cozy-explorer': ['magnet', 'speed', 'damage', 'healing', 'cooldown', 'maxHealth', 'projectiles'],
      'score-chaser': ['cooldown', 'damage', 'speed', 'magnet', 'projectiles', 'maxHealth', 'healing'],
    };
    const cadenceRank = byCadence[style.weaponCadence]?.indexOf(upgrade.kind) ?? 99;
    const pressureRank = byPressure[style.pressure]?.indexOf(upgrade.kind) ?? 99;
    const profileRank = byProfile[this.feelProfile()].indexOf(upgrade.kind);
    const profileWeight = this.feelProfile() === 'arcade-survivor' ? 0.3 : 0.42;
    const pressureWeight = style.pressure === 'siege' || style.pressure === 'relaxed' ? 0.4 : 0.28;
    const cadenceWeight = 1 - profileWeight - pressureWeight;
    return (profileRank < 0 ? 99 : profileRank) * profileWeight + pressureRank * pressureWeight + cadenceRank * cadenceWeight;
  }

  private chooseUpgrade(index: number) {
    if (!this.choosingUpgrade) return;
    const upgrade = this.upgradeChoices[index];
    if (!upgrade) return;
    this.upgradeOverlay?.destroy();
    this.upgradeOverlay = undefined;
    this.upgradeChoices = [];
    this.choosingUpgrade = false;
    this.physics.resume();
    this.applyUpgrade(upgrade);
  }

  private applyUpgrade(up: Upgrade | undefined) {
    this.hp = Math.min(this.maxHp, this.hp + 15);
    if (!up) {
      this.flash(`Level ${this.level}`);
      this.addDirectorEvent(`Level ${this.level}`, this.def.palette.xp, 5200);
      return;
    }
    if (up.kind === 'damage') {
      this.projectileDamage += up.amount;
      this.meleeDamage += Math.max(1, up.amount * 0.5);
    } else if (up.kind === 'cooldown') this.cooldownMs = Math.max(110, this.cooldownMs - up.amount);
    else if (up.kind === 'speed') this.moveSpeed += up.amount;
    else if (up.kind === 'projectiles') this.projectiles = clamp(this.projectiles + up.amount, 1, 12);
    else if (up.kind === 'magnet') this.magnetRange = Math.max(0, this.magnetRange + up.amount);
    else if (up.kind === 'maxHealth') {
      this.maxHp += up.amount;
      this.hp += up.amount;
    } else if (up.kind === 'healing') this.hp = Math.min(this.maxHp, this.hp + up.amount);
    this.flash(`Level ${this.level} - ${up.name}`);
    this.addDirectorEvent(`Upgrade: ${up.name}`, this.def.palette.xp, 6200);
  }

  private showUpgradeOverlay(choices: Upgrade[]) {
    this.upgradeOverlay?.destroy();
    const w = this.scale.width;
    const h = this.scale.height;
    const panelW = Math.min(760, w - 80);
    const panelH = 230;
    const cardW = Math.min(210, (panelW - 64) / Math.max(1, choices.length));
    const cardH = 132;
    const startX = w / 2 - ((choices.length * cardW + (choices.length - 1) * 18) / 2) + cardW / 2;
    const y = h / 2 + 22;
    const parts: Phaser.GameObjects.GameObject[] = [];

    parts.push(this.add.rectangle(0, 0, w, h, 0x000000, 0.54).setOrigin(0, 0));
    parts.push(
      this.add.rectangle(w / 2, h / 2, panelW, panelH, hex(this.def.palette.background), 0.9)
        .setStrokeStyle(1, hex(this.def.palette.accent), 0.45),
    );
    parts.push(
      this.add.text(w / 2, h / 2 - 92, `Level ${this.level}`, {
        ...TEXT,
        fontSize: '26px',
        fontStyle: '700',
        align: 'center',
      }).setOrigin(0.5),
    );
    parts.push(
      this.add.text(w / 2, h / 2 - 62, 'Choose an upgrade', {
        ...TEXT,
        fontSize: '13px',
        color: '#d8dde8',
        align: 'center',
      }).setOrigin(0.5),
    );

    choices.forEach((choice, index) => {
      const x = startX + index * (cardW + 18);
      const card = this.add.rectangle(x, y, cardW, cardH, hex(this.def.palette.floor), 0.88)
        .setStrokeStyle(1, hex(index === 0 ? this.def.palette.xp : this.def.palette.accent), 0.46)
        .setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(hex(this.def.palette.accent), 0.28));
      card.on('pointerout', () => card.setFillStyle(hex(this.def.palette.floor), 0.88));
      card.on('pointerdown', () => this.chooseUpgrade(index));
      parts.push(card);
      parts.push(
        this.add.text(x - cardW / 2 + 14, y - cardH / 2 + 12, `${index + 1}`, {
          ...TEXT,
          fontSize: '12px',
          color: this.def.palette.xp,
        }),
      );
      parts.push(
        this.add.text(x - cardW / 2 + 34, y - cardH / 2 + 12, choice.name, {
          ...TEXT,
          fontSize: '15px',
          fontStyle: '700',
          wordWrap: { width: cardW - 48 },
        }),
      );
      parts.push(
        this.add.text(x - cardW / 2 + 14, y - 12, upgradeDescription(choice), {
          ...TEXT,
          fontSize: '12px',
          color: '#d8dde8',
          wordWrap: { width: cardW - 28 },
        }),
      );
    });

    parts.push(
      this.add.text(w / 2, h / 2 + 98, 'Press 1 / 2 / 3 or click a card', {
        ...TEXT,
        fontSize: '12px',
        color: '#d8dde8',
      }).setOrigin(0.5),
    );

    this.upgradeOverlay = this.add.container(0, 0, parts)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay + 2);
  }

  private handleUpgradeKey(event: KeyboardEvent) {
    if (!this.choosingUpgrade) return;
    const index = event.key === '1' ? 0 : event.key === '2' ? 1 : event.key === '3' ? 2 : -1;
    if (index >= 0) {
      event.preventDefault();
      this.chooseUpgrade(index);
    }
  }

  private updateOrbs(dt: number) {
    const range = 70 + this.magnetRange;
    const rangeSq = range * range;
    this.orbs.children.each((child) => {
      const orb = child as ArcadeImage;
      if (!orb.active) return true;
      const body = orb.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return true;

      const dx = this.player.x - orb.x;
      const dy = this.player.y - orb.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq) {
        body.setVelocity(0, 0);
        return true;
      }

      const dist = Math.sqrt(distSq) || 1;
      const pull = Phaser.Math.Clamp((range - dist) / range, 0.18, 1);
      const speed = 160 + pull * 520 + this.magnetRange * 1.2;
      body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
      orb.setAlpha(0.7 + Math.sin(this.time.now * 0.018 + dist * 0.03) * 0.18);
      if (dt > 0) orb.setRotation(orb.rotation + dt * 4);
      return true;
    });
  }

  private setupCaptureZone() {
    if (this.def.winCondition !== 'capture-zone') return;
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:capture-zone`);
    const radius = 76;
    const x = clamp(width * 0.5 + seededRange(seed, 3, 181) - 90, 116, width - 116);
    const y = clamp(height * 0.38 + seededRange(seed, 7, 141) - 70, 116, height - 116);
    const color = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);

    const ring = this.add.circle(x, y, radius, color, 0.08)
      .setStrokeStyle(2, color, 0.58)
      .setDepth(DEPTH.orb - 0.12);
    const core = this.add.circle(x, y, Math.max(18, radius * 0.26), color, 0.18)
      .setStrokeStyle(1, danger, 0.28)
      .setDepth(DEPTH.orb - 0.08);
    const spokes = this.add.graphics().setDepth(DEPTH.orb - 0.07);
    const progress = this.add.graphics().setDepth(DEPTH.orb - 0.05);
    const label = this.add.text(x, y + radius + 16, 'capture zone', {
      ...TEXT,
      fontSize: '11px',
      fontStyle: '700',
      color: this.def.palette.accent,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);
    const pips = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return this.add.rectangle(
        x + Math.cos(angle) * (radius + 14),
        y + Math.sin(angle) * (radius + 14),
        12,
        3,
        color,
        0.5,
      ).setRotation(angle).setDepth(DEPTH.orb - 0.04);
    });

    this.captureZone = { x, y, radius, ring, core, label, spokes, progress, pips };
    this.redrawCaptureZone(this.time.now);
  }

  private updateCaptureZone(dt: number, time: number) {
    const zone = this.captureZone;
    if (!zone || this.def.winCondition !== 'capture-zone') return;
    const playerDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.x, zone.y);
    const playerInZone = playerDistance <= zone.radius + this.def.player.radius * 0.5;
    let enemiesInZone = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, zone.x, zone.y) <= zone.radius + 8) enemiesInZone++;
      return true;
    });
    this.captureContested = enemiesInZone > 0;

    const before = this.captureProgress;
    if (playerInZone) {
      this.captureProgress += dt * (this.captureContested ? 0.28 : 1) * this.objectiveProgressScale();
    } else {
      this.captureProgress -= dt * 0.25;
    }
    this.captureProgress = clamp(this.captureProgress, 0, this.captureTargetSeconds());

    if (this.captureProgress > before && time > this.capturePulseAt + 1100) {
      this.capturePulseAt = time;
      this.pulse(zone.x, zone.y, this.captureContested ? this.def.palette.danger : this.def.palette.accent, zone.radius + 18);
    }
    if (this.captureProgress >= this.captureTargetSeconds() && before < this.captureTargetSeconds()) {
      this.flash('Zone secured');
    }

    this.redrawCaptureZone(time, playerInZone);
  }

  private redrawCaptureZone(time: number, playerInZone = false) {
    const zone = this.captureZone;
    if (!zone) return;
    const target = this.captureTargetSeconds();
    const ratio = clamp(this.captureProgress / target, 0, 1);
    const color = hex(this.captureContested ? this.def.palette.danger : this.def.palette.accent);
    const fillAlpha = playerInZone ? 0.18 : 0.1;
    const pulse = 0.5 + Math.sin(time * 0.005) * 0.22;

    zone.ring
      .setFillStyle(color, fillAlpha + ratio * 0.06)
      .setStrokeStyle(playerInZone ? 3 : 2, color, this.captureContested ? 0.86 : 0.5 + pulse * 0.18);
    zone.core
      .setFillStyle(color, 0.16 + ratio * 0.28)
      .setStrokeStyle(1, color, 0.24 + ratio * 0.5);
    zone.label
      .setText(this.captureContested ? 'zone contested' : playerInZone ? 'capturing' : 'capture zone')
      .setColor(this.captureContested ? this.def.palette.danger : this.def.palette.accent);

    zone.progress.clear();
    zone.spokes.clear();
    zone.spokes.lineStyle(1, color, this.captureContested ? 0.36 : 0.18 + ratio * 0.22);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + time * 0.0016;
      const inner = zone.radius * (0.42 + ratio * 0.1);
      const outer = zone.radius * (0.84 + pulse * 0.06);
      zone.spokes.lineBetween(
        zone.x + Math.cos(angle) * inner,
        zone.y + Math.sin(angle) * inner,
        zone.x + Math.cos(angle) * outer,
        zone.y + Math.sin(angle) * outer,
      );
    }
    zone.progress.lineStyle(6, 0x000000, 0.24);
    zone.progress.beginPath();
    zone.progress.arc(zone.x, zone.y, zone.radius + 9, -Math.PI / 2, Math.PI * 1.5, false);
    zone.progress.strokePath();
    if (ratio > 0) {
      zone.progress.lineStyle(6, color, 0.86);
      zone.progress.beginPath();
      zone.progress.arc(zone.x, zone.y, zone.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      zone.progress.strokePath();
    }

    zone.pips.forEach((pip, index) => {
      const pipActive = index / zone.pips.length <= ratio;
      pip.setAlpha(pipActive ? 0.86 : 0.32 + pulse * 0.2);
      pip.setScale(pipActive ? 1.25 : 1);
      pip.setFillStyle(color);
    });
  }

  private setupEscortObjective() {
    if (this.def.winCondition !== 'escort') return;
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:escort-route`);
    const startX = 104;
    const startY = clamp(height * 0.56 + seededRange(seed, 5, 121) - 60, 124, height - 124);
    const endX = Math.min(width - 108, startX + this.escortTargetDistance());
    const endY = clamp(startY + seededRange(seed, 11, 141) - 70, 108, height - 108);
    const accent = hex(this.def.palette.accent);
    const xp = hex(this.def.palette.xp);
    const routeLine = this.add.graphics().setDepth(DEPTH.orb + 0.04);
    const progressLine = this.add.graphics().setDepth(DEPTH.orb + 0.06);
    const routeAngle = Phaser.Math.Angle.Between(startX, startY, endX, endY);
    const goal = this.add.circle(endX, endY, 28, xp, 0.08)
      .setStrokeStyle(2, xp, 0.7)
      .setDepth(DEPTH.orb + 0.08);
    const label = this.add.text(endX, endY + 40, 'escort gate', {
      ...TEXT,
      fontSize: '10px',
      fontStyle: '700',
      color: this.def.palette.xp,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);

    routeLine.lineStyle(4, 0x000000, 0.24);
    routeLine.lineBetween(startX, startY, endX, endY);
    routeLine.lineStyle(2, accent, 0.34);
    routeLine.lineBetween(startX, startY, endX, endY);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const x = Phaser.Math.Linear(startX, endX, t);
      const y = Phaser.Math.Linear(startY, endY, t);
      routeLine.fillStyle(i === 5 ? xp : accent, i === 5 ? 0.45 : 0.24);
      routeLine.fillCircle(x, y, i === 5 ? 5 : 3);
    }
    const beacons = Array.from({ length: 4 }, () =>
      this.add.rectangle(startX, startY, 18, 4, xp, 0.38)
        .setRotation(routeAngle)
        .setDepth(DEPTH.orb + 0.1),
    );

    this.escortRoute = { startX, startY, endX, endY, line: routeLine, progressLine, goal, label, beacons };
    this.escortMaxHp = Math.max(44, Math.round(this.maxHp * 0.55));
    this.escortHp = this.escortMaxHp;
    this.escortProgress = 0;
    this.escortContested = false;

    const escortRadius = this.escortObjectiveRadius();
    const ally = this.applyCircleBody(this.physics.add.image(startX, startY, this.escortSpriteKey()), escortRadius)
      .setDepth(DEPTH.player - 0.2);
    if (this.usesCuratedEscortSprite()) ally.clearTint();
    else ally.setTint(hex(this.def.palette.xp));
    ally.setData('radius', escortRadius);
    ally.setData('phase', seededRange(seed, 17, 628) / 100);
    ally.setCollideWorldBounds(true);
    this.attachShadow(ally, escortRadius, 0.26);
    this.escortAlly = ally;
    this.tweens.add({ targets: ally, scale: { from: 0.72, to: 1 }, alpha: { from: 0.72, to: 1 }, duration: 260, ease: 'Back.Out' });
    this.redrawEscortRoute(this.time.now, false);
  }

  private updateEscortObjective(dt: number, time: number) {
    const ally = this.escortAlly;
    const route = this.escortRoute;
    if (!ally?.active || !route || this.def.winCondition !== 'escort') return;

    const playerNear = Phaser.Math.Distance.Between(this.player.x, this.player.y, ally.x, ally.y) <= 86;
    let nearbyEnemies = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, ally.x, ally.y) <= 72) nearbyEnemies++;
      return true;
    });
    this.escortContested = nearbyEnemies > 0;

    const before = this.escortProgress;
    if (this.escortContested) {
      this.escortHp = clamp(this.escortHp - nearbyEnemies * dt * 7.5 * this.objectiveContestScale(), 0, this.escortMaxHp);
    } else if (this.escortHp < this.escortMaxHp) {
      this.escortHp = clamp(this.escortHp + dt * (playerNear ? 7 : 2.4), 0, this.escortMaxHp);
    }

    if (playerNear && this.escortHp > 0) {
      this.escortProgress += dt * (this.escortContested ? 22 : 78) * this.objectiveProgressScale();
    }
    this.escortProgress = clamp(this.escortProgress, 0, this.escortTargetDistance());

    const ratio = clamp(this.escortProgress / this.escortTargetDistance(), 0, 1);
    ally.setPosition(
      Phaser.Math.Linear(route.startX, route.endX, ratio),
      Phaser.Math.Linear(route.startY, route.endY, ratio),
    );
    (ally.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    if (this.escortProgress > before && time > this.escortPulseAt + 950) {
      this.escortPulseAt = time;
      this.pulse(ally.x, ally.y, this.escortContested ? this.def.palette.danger : this.def.palette.xp, 34);
    }
    if (this.escortProgress >= this.escortTargetDistance() && before < this.escortTargetDistance()) {
      this.flash('Escort complete');
    }

    this.redrawEscortRoute(time, playerNear);
  }

  private redrawEscortRoute(time: number, playerNear: boolean) {
    const route = this.escortRoute;
    if (!route) return;
    const evidence = this.visualEvidenceModeActive(time) && this.def.winCondition === 'escort';
    const ratio = clamp(this.escortProgress / this.escortTargetDistance(), 0, 1);
    const x = Phaser.Math.Linear(route.startX, route.endX, ratio);
    const y = Phaser.Math.Linear(route.startY, route.endY, ratio);
    const color = hex(this.escortContested ? this.def.palette.danger : this.def.palette.xp);
    const curatedEscortEvidence = evidence && this.usesCuratedEscortSprite();
    const routeColor = curatedEscortEvidence ? 0x7a4d24 : color;
    const routeHighlight = curatedEscortEvidence ? 0xf0d47a : color;
    const pulse = 0.5 + Math.sin(time * 0.006) * 0.22;

    if (curatedEscortEvidence) {
      const dx = route.endX - route.startX;
      const dy = route.endY - route.startY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / distance;
      const ny = dx / distance;
      const trackOffset = 9;
      route.line.clear();
      route.line.lineStyle(22, 0xd8bb7a, 0.2);
      route.line.lineBetween(route.startX, route.startY, route.endX, route.endY);
      route.line.lineStyle(5, 0x6c4b25, 0.52);
      route.line.lineBetween(route.startX + nx * trackOffset, route.startY + ny * trackOffset, route.endX + nx * trackOffset, route.endY + ny * trackOffset);
      route.line.lineBetween(route.startX - nx * trackOffset, route.startY - ny * trackOffset, route.endX - nx * trackOffset, route.endY - ny * trackOffset);
      route.line.lineStyle(2, 0xf6dea4, 0.36);
      route.line.lineBetween(route.startX, route.startY, route.endX, route.endY);
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        const markerX = Phaser.Math.Linear(route.startX, route.endX, t);
        const markerY = Phaser.Math.Linear(route.startY, route.endY, t);
        route.line.fillStyle(0x6c4b25, 0.18);
        route.line.fillCircle(markerX + nx * trackOffset, markerY + ny * trackOffset, 3);
        route.line.fillCircle(markerX - nx * trackOffset, markerY - ny * trackOffset, 3);
      }
      route.progressLine.clear().setAlpha(0);
      route.goal.setPosition(route.endX, route.endY).setAlpha(0);
      route.label.setVisible(false).setAlpha(0);
      route.beacons.forEach((beacon) => beacon.setAlpha(0));
      return;
    }

    route.line.clear();
    route.line.lineStyle(evidence ? curatedEscortEvidence ? 13 : 9 : 4, 0x000000, evidence ? curatedEscortEvidence ? 0.36 : 0.28 : 0.24);
    route.line.lineBetween(route.startX, route.startY, route.endX, route.endY);
    route.line.lineStyle(evidence ? curatedEscortEvidence ? 7 : 5 : 2, routeColor, evidence ? curatedEscortEvidence ? 0.94 : 0.72 : 0.34);
    route.line.lineBetween(route.startX, route.startY, route.endX, route.endY);
    if (curatedEscortEvidence) {
      route.line.lineStyle(2, routeHighlight, 0.86);
      route.line.lineBetween(route.startX, route.startY, route.endX, route.endY);
    }
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const markerX = Phaser.Math.Linear(route.startX, route.endX, t);
      const markerY = Phaser.Math.Linear(route.startY, route.endY, t);
      route.line.fillStyle(i === 5 ? routeHighlight : curatedEscortEvidence ? 0xf7e3a0 : 0xffffff, evidence ? i === 5 ? 0.9 : curatedEscortEvidence ? 0.72 : 0.48 : i === 5 ? 0.45 : 0.24);
      route.line.fillCircle(markerX, markerY, evidence ? i === 5 ? curatedEscortEvidence ? 10 : 8 : curatedEscortEvidence ? 6 : 5 : i === 5 ? 5 : 3);
    }

    route.progressLine.clear();
    if (ratio > 0) {
      route.progressLine.lineStyle(evidence ? curatedEscortEvidence ? 10 : 8 : 5, routeHighlight, evidence ? 0.94 : 0.78);
      route.progressLine.lineBetween(route.startX, route.startY, x, y);
    }
    route.goal
      .setPosition(route.endX, route.endY)
      .setFillStyle(routeHighlight, evidence ? 0.18 + ratio * 0.16 : 0.08 + ratio * 0.12)
      .setStrokeStyle(evidence ? curatedEscortEvidence ? 5 : 4 : playerNear ? 3 : 2, routeColor, evidence ? 0.94 : this.escortContested ? 0.9 : 0.52 + pulse * 0.18)
      .setScale(evidence ? 1.22 : 1);
    route.label
      .setText(this.escortContested ? 'escort contested' : playerNear ? 'escort moving' : 'escort gate')
      .setColor(this.escortContested ? this.def.palette.danger : this.def.palette.xp)
      .setVisible(!evidence)
      .setAlpha(evidence ? 0 : 1);
    const routeAngle = Phaser.Math.Angle.Between(route.startX, route.startY, route.endX, route.endY);
    route.beacons.forEach((beacon, index) => {
      const travel = (time * 0.00016 + index / route.beacons.length) % 1;
      const beaconX = Phaser.Math.Linear(route.startX, route.endX, travel);
      const beaconY = Phaser.Math.Linear(route.startY, route.endY, travel);
      const nearAlly = Math.abs(travel - ratio) < 0.16;
      beacon
        .setPosition(beaconX, beaconY)
        .setRotation(routeAngle)
        .setFillStyle(routeHighlight)
        .setAlpha(evidence ? nearAlly ? 0.96 : curatedEscortEvidence ? 0.62 + pulse * 0.2 : 0.46 + pulse * 0.2 : nearAlly ? 0.72 : 0.24 + pulse * 0.16)
        .setScale(evidence ? nearAlly ? 1.7 : 1.22 : nearAlly ? 1.25 : 1);
    });
  }

  private setupDefendObjective() {
    if (this.def.winCondition !== 'defend-core') return;
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:defend-core`);
    const radius = 74;
    const x = clamp(width * 0.5 + seededRange(seed, 13, 151) - 75, 124, width - 124);
    const y = clamp(height * 0.48 + seededRange(seed, 19, 131) - 65, 126, height - 126);
    const accent = hex(this.def.palette.accent);
    const projectile = hex(this.def.palette.projectile);

    const ring = this.add.circle(x, y, radius, accent, 0.08)
      .setStrokeStyle(2, accent, 0.58)
      .setDepth(DEPTH.orb - 0.12);
    const shield = this.add.graphics().setDepth(DEPTH.orb - 0.06);
    const progress = this.add.graphics().setDepth(DEPTH.orb - 0.05);
    const healthBg = this.add.rectangle(x - 44, y - radius - 18, 88, 7, 0x000000, 0.38)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.orb + 0.1);
    const healthFill = this.add.rectangle(x - 44, y - radius - 18, 88, 7, projectile, 0.9)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.orb + 0.12);
    const label = this.add.text(x, y + radius + 16, 'defend core', {
      ...TEXT,
      fontSize: '11px',
      fontStyle: '700',
      color: this.def.palette.accent,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);
    const pips = Array.from({ length: 10 }, (_, index) => {
      const angle = (index / 10) * Math.PI * 2;
      return this.add.rectangle(
        x + Math.cos(angle) * (radius + 14),
        y + Math.sin(angle) * (radius + 14),
        10,
        3,
        accent,
        0.46,
      ).setRotation(angle).setDepth(DEPTH.orb - 0.04);
    });

    this.defendMaxHp = this.defendMaxHealth();
    this.defendHp = this.defendMaxHp;
    this.defendProgress = 0;
    this.defendContested = false;
    const image = this.applyCircleBody(this.physics.add.image(x, y, this.defendSpriteKey()), 18)
      .setDepth(DEPTH.player - 0.25)
      .setTint(accent);
    image.setData('radius', 18);
    image.setData('phase', seededRange(seed, 23, 628) / 100);
    image.setCollideWorldBounds(true);
    (image.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.attachShadow(image, 18, 0.3);
    this.defendCore = { x, y, radius, image, ring, label, shield, progress, healthBg, healthFill, pips };
    this.tweens.add({ targets: image, scale: { from: 0.72, to: 1 }, alpha: { from: 0.72, to: 1 }, duration: 280, ease: 'Back.Out' });
    this.redrawDefendCore(this.time.now, false);
  }

  private updateDefendObjective(dt: number, time: number) {
    const core = this.defendCore;
    if (!core?.image.active || this.def.winCondition !== 'defend-core') return;

    const playerDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, core.x, core.y);
    const playerNear = playerDistance <= core.radius + this.def.player.radius;
    let nearbyEnemies = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, core.x, core.y) <= core.radius + 24) nearbyEnemies++;
      return true;
    });
    this.defendContested = nearbyEnemies > 0;

    const before = this.defendProgress;
    if (this.defendContested) {
      this.defendHp = clamp(this.defendHp - nearbyEnemies * dt * 5.8 * this.objectiveContestScale(), 0, this.defendMaxHp);
    } else if (playerNear && this.defendHp < this.defendMaxHp) {
      this.defendHp = clamp(this.defendHp + dt * 6.5, 0, this.defendMaxHp);
    }

    if (this.defendHp <= 0) {
      this.flash('Core breached');
      this.lose();
      return;
    }

    this.defendProgress += dt * (playerNear ? (this.defendContested ? 0.36 : 1) : this.defendContested ? 0.08 : 0.42) * this.objectiveProgressScale();
    this.defendProgress = clamp(this.defendProgress, 0, this.defendTargetSeconds());

    if (this.defendProgress > before && time > this.defendPulseAt + 1050) {
      this.defendPulseAt = time;
      this.pulse(core.x, core.y, this.defendContested ? this.def.palette.danger : this.def.palette.projectile, core.radius + 18);
    }
    if (this.defendProgress >= this.defendTargetSeconds() && before < this.defendTargetSeconds()) {
      this.flash('Core secured');
    }

    this.redrawDefendCore(time, playerNear);
  }

  private redrawDefendCore(time: number, playerNear: boolean) {
    const core = this.defendCore;
    if (!core) return;
    const target = this.defendTargetSeconds();
    const ratio = clamp(this.defendProgress / target, 0, 1);
    const healthRatio = clamp(this.defendHp / Math.max(1, this.defendMaxHp), 0, 1);
    const color = hex(this.defendContested ? this.def.palette.danger : this.def.palette.accent);
    const healthColor = hex(healthRatio < 0.34 ? this.def.palette.danger : this.def.palette.projectile);
    const pulse = 0.5 + Math.sin(time * 0.0055) * 0.22;

    core.ring
      .setFillStyle(color, 0.08 + ratio * 0.07)
      .setStrokeStyle(playerNear ? 3 : 2, color, this.defendContested ? 0.9 : 0.5 + pulse * 0.2);
    core.label
      .setText(this.defendContested ? 'core under attack' : playerNear ? 'core fortified' : 'defend core')
      .setColor(this.defendContested ? this.def.palette.danger : this.def.palette.accent);
    core.image
      .setTint(color)
      .setAlpha(this.defendContested ? 0.88 : 1);
    core.healthFill
      .setFillStyle(healthColor, 0.92)
      .setDisplaySize(Math.max(1, 88 * healthRatio), 7);

    core.shield.clear();
    core.shield.lineStyle(2, color, this.defendContested ? 0.42 : 0.2 + ratio * 0.18);
    const shieldRadius = core.radius + 20 + pulse * 5;
    for (let i = 0; i < 4; i++) {
      const start = time * 0.0012 + i * Math.PI * 0.5;
      core.shield.beginPath();
      core.shield.arc(core.x, core.y, shieldRadius, start, start + 0.64, false);
      core.shield.strokePath();
    }
    core.shield.lineStyle(1, healthColor, 0.16 + healthRatio * 0.18);
    core.shield.strokeCircle(core.x, core.y, core.radius * (0.48 + pulse * 0.05));

    core.progress.clear();
    core.progress.lineStyle(6, 0x000000, 0.24);
    core.progress.beginPath();
    core.progress.arc(core.x, core.y, core.radius + 9, -Math.PI / 2, Math.PI * 1.5, false);
    core.progress.strokePath();
    if (ratio > 0) {
      core.progress.lineStyle(6, color, 0.86);
      core.progress.beginPath();
      core.progress.arc(core.x, core.y, core.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      core.progress.strokePath();
    }

    core.pips.forEach((pip, index) => {
      const pipActive = index / core.pips.length <= ratio;
      pip.setAlpha(pipActive ? 0.86 : 0.3 + pulse * 0.22);
      pip.setScale(pipActive ? 1.22 : 1);
      pip.setFillStyle(color);
    });
  }

  private setupRepairNodes() {
    if (this.def.winCondition !== 'repair-nodes') return;
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:repair-nodes`);
    const count = this.repairNodeCount();
    const radius = 44;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const spreadX = Math.min(width * 0.3, 270);
    const spreadY = Math.min(height * 0.24, 170);
    const startAngle = seededRange(seed, 3, 628) / 100;
    const accent = hex(this.def.palette.accent);
    const projectile = hex(this.def.palette.projectile);

    this.repairNodes = Array.from({ length: count }, (_, index) => {
      const angle = startAngle + (index / count) * Math.PI * 2;
      const wobble = seededRange(seed, 17 + index * 13, 43) - 21;
      const x = clamp(centerX + Math.cos(angle) * spreadX + wobble, 96, width - 96);
      const y = clamp(centerY + Math.sin(angle) * spreadY - wobble * 0.4, 104, height - 104);
      const ring = this.add.circle(x, y, radius, accent, 0.06)
        .setStrokeStyle(2, accent, 0.54)
        .setDepth(DEPTH.orb - 0.14);
      const core = this.add.circle(x, y, Math.max(14, radius * 0.32), projectile, 0.16)
        .setStrokeStyle(1, accent, 0.36)
        .setDepth(DEPTH.orb - 0.08);
      const signal = this.add.graphics().setDepth(DEPTH.orb - 0.06);
      const progressArc = this.add.graphics().setDepth(DEPTH.orb - 0.04);
      const label = this.add.text(x, y + radius + 14, `node ${index + 1}`, {
        ...TEXT,
        fontSize: '10px',
        fontStyle: '700',
        color: this.def.palette.accent,
        stroke: '#10131a',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);
      const pips = Array.from({ length: 6 }, (_, pipIndex) => {
        const pipAngle = (pipIndex / 6) * Math.PI * 2;
        return this.add.rectangle(
          x + Math.cos(pipAngle) * (radius + 11),
          y + Math.sin(pipAngle) * (radius + 11),
          8,
          3,
          accent,
          0.42,
        ).setRotation(pipAngle).setDepth(DEPTH.orb - 0.03);
      });

      const node: RepairNode = { x, y, radius, fixed: false, progress: 0, ring, core, label, signal, progressArc, pips };
      this.redrawRepairNode(node, this.time.now, false, false);
      return node;
    });
  }

  private updateRepairNodes(dt: number, time: number) {
    if (this.def.winCondition !== 'repair-nodes' || this.repairNodes.length === 0) return;
    this.repairContested = false;
    const target = this.repairSecondsPerNode();

    for (const node of this.repairNodes) {
      if (node.fixed) {
        this.redrawRepairNode(node, time, false, false);
        continue;
      }

      const playerDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, node.x, node.y);
      const playerNear = playerDistance <= node.radius + this.def.player.radius * 0.8;
      let nearbyEnemies = 0;
      this.enemies.children.each((child) => {
        const enemy = child as ArcadeImage;
        if (!enemy.active) return true;
        if (Phaser.Math.Distance.Between(enemy.x, enemy.y, node.x, node.y) <= node.radius + 22) nearbyEnemies++;
        return true;
      });
      const contested = playerNear && nearbyEnemies > 0;
      this.repairContested = this.repairContested || contested;

      const before = node.progress;
      if (playerNear) {
        node.progress += dt * (contested ? 0.32 : 1) * this.objectiveProgressScale();
      } else {
        node.progress -= dt * 0.16;
      }
      node.progress = clamp(node.progress, 0, target);

      if (node.progress > before && time > this.repairPulseAt + 850) {
        this.repairPulseAt = time;
        this.pulse(node.x, node.y, contested ? this.def.palette.danger : this.def.palette.projectile, node.radius + 16);
      }
      if (node.progress >= target && before < target) {
        node.fixed = true;
        this.score += 35;
        this.xp += 2;
        this.flash(this.repairNodesFixed() >= this.repairNodeCount() ? 'Network restored' : 'Node repaired');
        this.sparkBurst(node.x, node.y, this.def.palette.projectile, 14);
      }

      this.redrawRepairNode(node, time, playerNear, contested);
    }
  }

  private redrawRepairNode(node: RepairNode, time: number, playerNear: boolean, contested: boolean) {
    const target = this.repairSecondsPerNode();
    const ratio = node.fixed ? 1 : clamp(node.progress / target, 0, 1);
    const color = hex(node.fixed ? this.def.palette.xp : contested ? this.def.palette.danger : this.def.palette.accent);
    const coreColor = hex(node.fixed ? this.def.palette.xp : this.def.palette.projectile);
    const pulse = 0.5 + Math.sin(time * 0.006 + node.x * 0.01) * 0.22;

    node.ring
      .setFillStyle(color, node.fixed ? 0.13 : playerNear ? 0.15 : 0.07)
      .setStrokeStyle(playerNear ? 3 : 2, color, node.fixed ? 0.82 : contested ? 0.9 : 0.48 + pulse * 0.18);
    node.core
      .setFillStyle(coreColor, 0.14 + ratio * 0.32)
      .setStrokeStyle(1, color, 0.28 + ratio * 0.46);
    node.label
      .setText(node.fixed ? 'node repaired' : contested ? 'repair contested' : playerNear ? 'repairing node' : 'repair node')
      .setColor(node.fixed ? this.def.palette.xp : contested ? this.def.palette.danger : this.def.palette.accent);

    node.signal.clear();
    node.signal.lineStyle(1, color, node.fixed ? 0.36 : contested ? 0.38 : 0.18 + ratio * 0.22);
    for (let i = 0; i < 3; i++) {
      const angle = time * 0.0018 + node.x * 0.002 + i * Math.PI * 0.66;
      const inner = node.radius * (0.22 + ratio * 0.18);
      const outer = node.radius * (0.82 + pulse * 0.08);
      node.signal.lineBetween(
        node.x + Math.cos(angle) * inner,
        node.y + Math.sin(angle) * inner,
        node.x + Math.cos(angle) * outer,
        node.y + Math.sin(angle) * outer,
      );
    }
    if (node.fixed) {
      node.signal.lineStyle(2, color, 0.38);
      node.signal.lineBetween(node.x - node.radius * 0.42, node.y, node.x - node.radius * 0.12, node.y + node.radius * 0.28);
      node.signal.lineBetween(node.x - node.radius * 0.12, node.y + node.radius * 0.28, node.x + node.radius * 0.46, node.y - node.radius * 0.32);
    }

    node.progressArc.clear();
    node.progressArc.lineStyle(5, 0x000000, 0.24);
    node.progressArc.beginPath();
    node.progressArc.arc(node.x, node.y, node.radius + 8, -Math.PI / 2, Math.PI * 1.5, false);
    node.progressArc.strokePath();
    if (ratio > 0) {
      node.progressArc.lineStyle(5, color, 0.84);
      node.progressArc.beginPath();
      node.progressArc.arc(node.x, node.y, node.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      node.progressArc.strokePath();
    }

    node.pips.forEach((pip, index) => {
      const active = index / node.pips.length <= ratio;
      pip.setAlpha(active ? 0.88 : 0.28 + pulse * 0.2);
      pip.setScale(active ? 1.24 : 1);
      pip.setFillStyle(color);
    });
  }

  private setupExtractZone() {
    if (this.def.winCondition !== 'extract') return;
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:extract-zone`);
    const radius = 64;
    const side = seededRange(seed, 5, 2);
    const x = side === 0 ? width - 126 : 126;
    const y = clamp(height * 0.5 + seededRange(seed, 13, 201) - 100, 116, height - 116);
    const accent = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);

    const ring = this.add.circle(x, y, radius, accent, 0.07)
      .setStrokeStyle(2, accent, 0.62)
      .setDepth(DEPTH.orb - 0.12);
    const core = this.add.circle(x, y, Math.max(18, radius * 0.3), accent, 0.16)
      .setStrokeStyle(1, danger, 0.24)
      .setDepth(DEPTH.orb - 0.08);
    const beam = this.add.graphics().setDepth(DEPTH.orb - 0.06);
    const progress = this.add.graphics().setDepth(DEPTH.orb - 0.04);
    const label = this.add.text(x, y + radius + 15, 'extract gate', {
      ...TEXT,
      fontSize: '11px',
      fontStyle: '700',
      color: this.def.palette.xp,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);
    const pips = Array.from({ length: 9 }, (_, index) => {
      const angle = (index / 9) * Math.PI * 2;
      return this.add.rectangle(
        x + Math.cos(angle) * (radius + 13),
        y + Math.sin(angle) * (radius + 13),
        10,
        3,
        accent,
        0.44,
      ).setRotation(angle).setDepth(DEPTH.orb - 0.03);
    });

    this.extractZone = { x, y, radius, ring, core, label, beam, progress, pips };
    this.extractProgress = 0;
    this.extractContested = false;
    this.redrawExtractZone(this.time.now, false);
  }

  private updateExtractZone(dt: number, time: number) {
    const zone = this.extractZone;
    if (!zone || this.def.winCondition !== 'extract') return;
    const playerDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.x, zone.y);
    const playerInZone = playerDistance <= zone.radius + this.def.player.radius * 0.65;
    let nearbyEnemies = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, zone.x, zone.y) <= zone.radius + 28) nearbyEnemies++;
      return true;
    });
    this.extractContested = nearbyEnemies > 0;

    const before = this.extractProgress;
    if (playerInZone) {
      this.extractProgress += dt * (this.extractContested ? 0.24 : 1) * this.objectiveProgressScale();
    } else {
      this.extractProgress -= dt * 0.2;
    }
    this.extractProgress = clamp(this.extractProgress, 0, this.extractHoldSeconds());

    if (this.extractProgress > before && time > this.extractPulseAt + 850) {
      this.extractPulseAt = time;
      this.pulse(zone.x, zone.y, this.extractContested ? this.def.palette.danger : this.def.palette.xp, zone.radius + 18);
    }
    if (this.extractProgress >= this.extractHoldSeconds() && before < this.extractHoldSeconds()) {
      this.flash('Extraction locked');
      this.sparkBurst(zone.x, zone.y, this.def.palette.xp, 18);
    }

    this.redrawExtractZone(time, playerInZone);
  }

  private redrawExtractZone(time: number, playerInZone: boolean) {
    const zone = this.extractZone;
    if (!zone) return;
    const target = this.extractHoldSeconds();
    const ratio = clamp(this.extractProgress / target, 0, 1);
    const color = hex(this.extractContested ? this.def.palette.danger : this.def.palette.xp);
    const pulse = 0.5 + Math.sin(time * 0.0062) * 0.22;

    zone.ring
      .setFillStyle(color, playerInZone ? 0.16 + ratio * 0.06 : 0.07 + ratio * 0.04)
      .setStrokeStyle(playerInZone ? 3 : 2, color, this.extractContested ? 0.9 : 0.54 + pulse * 0.18);
    zone.core
      .setFillStyle(color, 0.16 + ratio * 0.32)
      .setStrokeStyle(1, color, 0.26 + ratio * 0.5);
    zone.label
      .setText(this.extractContested ? 'extraction contested' : playerInZone ? 'extracting' : 'extract gate')
      .setColor(this.extractContested ? this.def.palette.danger : this.def.palette.xp);

    zone.beam.clear();
    zone.beam.lineStyle(1, color, this.extractContested ? 0.38 : 0.18 + ratio * 0.24);
    for (let i = 0; i < 6; i++) {
      const angle = time * 0.0015 + i * Math.PI / 3;
      const inner = zone.radius * (0.22 + ratio * 0.18);
      const outer = zone.radius * (0.86 + pulse * 0.08);
      zone.beam.lineBetween(
        zone.x + Math.cos(angle) * inner,
        zone.y + Math.sin(angle) * inner,
        zone.x + Math.cos(angle + 0.42) * outer,
        zone.y + Math.sin(angle + 0.42) * outer,
      );
    }
    zone.beam.lineStyle(2, color, 0.14 + ratio * 0.18);
    zone.beam.strokeCircle(zone.x, zone.y, zone.radius * (0.48 + pulse * 0.05));

    zone.progress.clear();
    zone.progress.lineStyle(6, 0x000000, 0.24);
    zone.progress.beginPath();
    zone.progress.arc(zone.x, zone.y, zone.radius + 9, -Math.PI / 2, Math.PI * 1.5, false);
    zone.progress.strokePath();
    if (ratio > 0) {
      zone.progress.lineStyle(6, color, 0.86);
      zone.progress.beginPath();
      zone.progress.arc(zone.x, zone.y, zone.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      zone.progress.strokePath();
    }

    zone.pips.forEach((pip, index) => {
      const active = index / zone.pips.length <= ratio;
      pip.setAlpha(active ? 0.9 : 0.3 + pulse * 0.2);
      pip.setScale(active ? 1.25 : 1);
      pip.setFillStyle(color);
    });
  }

  private setupUnlockGateObjective() {
    if (this.def.winCondition !== 'unlock-gate') return;
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:unlock-gate`);
    const radius = 58;
    const x = width - 128;
    const y = clamp(height * 0.5 + seededRange(seed, 19, 201) - 100, 112, height - 112);
    const accent = hex(this.def.palette.accent);
    const xp = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);

    const ring = this.add.circle(x, y, radius, accent, 0.06)
      .setStrokeStyle(2, accent, 0.48)
      .setDepth(DEPTH.orb - 0.12);
    const core = this.add.circle(x, y, Math.max(17, radius * 0.3), accent, 0.12)
      .setStrokeStyle(1, danger, 0.22)
      .setDepth(DEPTH.orb - 0.08);
    const beam = this.add.graphics().setDepth(DEPTH.orb - 0.06);
    const progress = this.add.graphics().setDepth(DEPTH.orb - 0.04);
    const label = this.add.text(x, y + radius + 14, 'locked gate', {
      ...TEXT,
      fontSize: '11px',
      fontStyle: '700',
      color: this.def.palette.accent,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);
    const pips = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return this.add.rectangle(
        x + Math.cos(angle) * (radius + 12),
        y + Math.sin(angle) * (radius + 12),
        9,
        3,
        accent,
        0.34,
      ).setRotation(angle).setDepth(DEPTH.orb - 0.03);
    });

    this.unlockGate = { x, y, radius, ring, core, label, beam, progress, pips };
    this.unlockKeys = 0;
    this.unlockProgress = 0;
    this.unlockContested = false;

    const target = this.unlockKeyTarget();
    const anchors = [
      { x: width * 0.24, y: height * 0.26 },
      { x: width * 0.34, y: height * 0.72 },
      { x: width * 0.52, y: height * 0.24 },
      { x: width * 0.66, y: height * 0.68 },
      { x: width * 0.43, y: height * 0.52 },
      { x: width * 0.76, y: height * 0.34 },
    ];
    for (let i = 0; i < target; i++) {
      const anchor = anchors[i % anchors.length]!;
      const jitterX = seededRange(seed, 31 + i * 11, 55) - 27;
      const jitterY = seededRange(seed, 47 + i * 13, 55) - 27;
      let keyX = clamp(anchor.x + jitterX, 82, width - 82);
      const keyY = clamp(anchor.y + jitterY, 82, height - 82);
      if (Phaser.Math.Distance.Between(keyX, keyY, x, y) < radius + 96) {
        keyX = clamp(width - keyX, 82, width - 82);
      }
      this.spawnObjectivePickup(keyX, keyY, 'access-key', false);
    }

    this.addDirectorEvent(`Access keys: 0/${target}`, this.def.palette.accent, 6200);
    this.redrawUnlockGate(this.time.now, false);
  }

  private updateUnlockGateObjective(dt: number, time: number) {
    const zone = this.unlockGate;
    if (!zone || this.def.winCondition !== 'unlock-gate') return;
    const ready = this.unlockKeys >= this.unlockKeyTarget();
    const playerDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.x, zone.y);
    const playerInZone = ready && playerDistance <= zone.radius + this.def.player.radius * 0.65;
    let nearbyEnemies = 0;
    if (ready) {
      this.enemies.children.each((child) => {
        const enemy = child as ArcadeImage;
        if (!enemy.active) return true;
        if (Phaser.Math.Distance.Between(enemy.x, enemy.y, zone.x, zone.y) <= zone.radius + 28) nearbyEnemies++;
        return true;
      });
    }
    this.unlockContested = ready && nearbyEnemies > 0;

    const before = this.unlockProgress;
    if (playerInZone) {
      this.unlockProgress += dt * (this.unlockContested ? 0.26 : 1) * this.objectiveProgressScale();
    } else {
      this.unlockProgress -= dt * 0.2;
    }
    this.unlockProgress = clamp(this.unlockProgress, 0, this.unlockHoldSeconds());

    if (this.unlockProgress > before && time > this.unlockPulseAt + 850) {
      this.unlockPulseAt = time;
      this.pulse(zone.x, zone.y, this.unlockContested ? this.def.palette.danger : this.def.palette.xp, zone.radius + 16);
    }
    if (this.unlockProgress >= this.unlockHoldSeconds() && before < this.unlockHoldSeconds()) {
      this.score += 60;
      this.flash('Gate open');
      this.sparkBurst(zone.x, zone.y, this.def.palette.xp, 18);
    }

    this.redrawUnlockGate(time, playerInZone);
  }

  private redrawUnlockGate(time: number, playerInZone: boolean) {
    const zone = this.unlockGate;
    if (!zone) return;
    const keyRatio = clamp(this.unlockKeys / this.unlockKeyTarget(), 0, 1);
    const ratio = clamp(this.unlockProgress / this.unlockHoldSeconds(), 0, 1);
    const ready = this.unlockKeys >= this.unlockKeyTarget();
    const colorString = !ready ? this.def.palette.accent : this.unlockContested ? this.def.palette.danger : this.def.palette.xp;
    const color = hex(colorString);
    const pulse = 0.5 + Math.sin(time * 0.0064) * 0.22;
    const pipRatio = ready ? ratio : keyRatio;

    zone.ring
      .setFillStyle(color, playerInZone ? 0.16 + ratio * 0.06 : 0.06 + pipRatio * 0.05)
      .setStrokeStyle(playerInZone ? 3 : 2, color, this.unlockContested ? 0.9 : 0.48 + pulse * 0.2);
    zone.core
      .setFillStyle(color, ready ? 0.14 + ratio * 0.32 : 0.1 + keyRatio * 0.12)
      .setStrokeStyle(1, color, 0.22 + pipRatio * 0.48);
    zone.label
      .setText(!ready ? `locked ${this.unlockKeys}/${this.unlockKeyTarget()}` : this.unlockContested ? 'exit contested' : playerInZone ? 'opening gate' : 'exit gate')
      .setColor(colorString);

    zone.beam.clear();
    zone.beam.lineStyle(1, color, this.unlockContested ? 0.38 : 0.14 + pipRatio * 0.26);
    for (let i = 0; i < 6; i++) {
      const angle = time * (ready ? 0.0017 : 0.0011) + i * Math.PI / 3;
      const inner = zone.radius * (0.18 + pipRatio * 0.2);
      const outer = zone.radius * (0.82 + pulse * 0.08);
      zone.beam.lineBetween(
        zone.x + Math.cos(angle) * inner,
        zone.y + Math.sin(angle) * inner,
        zone.x + Math.cos(angle + (ready ? 0.48 : 0.22)) * outer,
        zone.y + Math.sin(angle + (ready ? 0.48 : 0.22)) * outer,
      );
    }
    zone.beam.lineStyle(2, color, 0.12 + pipRatio * 0.2);
    zone.beam.strokeCircle(zone.x, zone.y, zone.radius * (0.44 + pulse * 0.05));

    zone.progress.clear();
    zone.progress.lineStyle(5, 0x000000, 0.22);
    zone.progress.beginPath();
    zone.progress.arc(zone.x, zone.y, zone.radius + 8, -Math.PI / 2, Math.PI * 1.5, false);
    zone.progress.strokePath();
    if (pipRatio > 0) {
      zone.progress.lineStyle(5, color, 0.82);
      zone.progress.beginPath();
      zone.progress.arc(zone.x, zone.y, zone.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pipRatio, false);
      zone.progress.strokePath();
    }

    zone.pips.forEach((pip, index) => {
      const active = index / zone.pips.length <= pipRatio;
      pip.setAlpha(active ? 0.9 : 0.26 + pulse * 0.18);
      pip.setScale(active ? 1.22 : 1);
      pip.setFillStyle(color);
    });
  }

  private setupRescueObjective() {
    if (this.def.winCondition !== 'rescue') return;
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:rescue-objective`);
    const radius = 54;
    const x = 118;
    const y = clamp(height * 0.5 + seededRange(seed, 11, 181) - 90, 118, height - 118);
    const gateX = width - 128;
    const gateY = clamp(height * 0.5 + seededRange(seed, 17, 181) - 90, 112, height - 112);
    const gateRadius = 58;
    const accent = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);

    const route = this.add.graphics().setDepth(DEPTH.orb - 0.18);
    const ring = this.add.circle(x, y, radius, accent, 0.07)
      .setStrokeStyle(2, accent, 0.58)
      .setDepth(DEPTH.orb - 0.12);
    const signal = this.add.graphics().setDepth(DEPTH.orb - 0.06);
    const progress = this.add.graphics().setDepth(DEPTH.orb - 0.04);
    const label = this.add.text(x, y + radius + 14, 'rescue survivor', {
      ...TEXT,
      fontSize: '11px',
      fontStyle: '700',
      color: this.def.palette.xp,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);
    const gate = this.add.circle(gateX, gateY, gateRadius, accent, 0.07)
      .setStrokeStyle(2, accent, 0.62)
      .setDepth(DEPTH.orb - 0.12);
    const gateCore = this.add.circle(gateX, gateY, Math.max(16, gateRadius * 0.3), accent, 0.14)
      .setStrokeStyle(1, danger, 0.24)
      .setDepth(DEPTH.orb - 0.08);
    const gateBeam = this.add.graphics().setDepth(DEPTH.orb - 0.06);
    const gateProgress = this.add.graphics().setDepth(DEPTH.orb - 0.04);
    const gateLabel = this.add.text(gateX, gateY + gateRadius + 14, 'rescue extract', {
      ...TEXT,
      fontSize: '11px',
      fontStyle: '700',
      color: this.def.palette.xp,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.2);
    const pips = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return this.add.rectangle(
        gateX + Math.cos(angle) * (gateRadius + 12),
        gateY + Math.sin(angle) * (gateRadius + 12),
        9,
        3,
        accent,
        0.4,
      ).setRotation(angle).setDepth(DEPTH.orb - 0.03);
    });

    this.rescueMaxHp = Math.max(46, Math.round(this.maxHp * 0.58));
    this.rescueHp = this.rescueMaxHp;
    this.rescuePhase = 'recover';
    this.rescueProgress = 0;
    this.rescueExtractProgress = 0;
    this.rescueContested = false;

    const ally = this.applyCircleBody(this.physics.add.image(x, y, this.rescueSpriteKey()), 13)
      .setDepth(DEPTH.player - 0.2)
      .setTint(accent);
    ally.setData('radius', 13);
    ally.setData('phase', seededRange(seed, 23, 628) / 100);
    ally.setCollideWorldBounds(true);
    this.attachShadow(ally, 13, 0.26);
    this.rescueObjective = { x, y, radius, ally, ring, label, signal, progress, gateX, gateY, gateRadius, route, gate, gateCore, gateBeam, gateProgress, gateLabel, pips };
    this.tweens.add({ targets: ally, scale: { from: 0.68, to: 1 }, alpha: { from: 0.72, to: 1 }, duration: 280, ease: 'Back.Out' });
    this.redrawRescueObjective(this.time.now, false, false, false);
  }

  private updateRescueObjective(dt: number, time: number) {
    const objective = this.rescueObjective;
    if (!objective?.ally.active || this.def.winCondition !== 'rescue' || this.rescuePhase === 'complete') return;

    const playerNearAlly = Phaser.Math.Distance.Between(this.player.x, this.player.y, objective.ally.x, objective.ally.y) <= objective.radius + this.def.player.radius;
    const playerInGate = Phaser.Math.Distance.Between(this.player.x, this.player.y, objective.gateX, objective.gateY) <= objective.gateRadius + this.def.player.radius * 0.7;
    const allyInGate = Phaser.Math.Distance.Between(objective.ally.x, objective.ally.y, objective.gateX, objective.gateY) <= objective.gateRadius + 13;
    let nearbyEnemies = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const anchorX = this.rescuePhase === 'recover' ? objective.ally.x : (allyInGate ? objective.gateX : objective.ally.x);
      const anchorY = this.rescuePhase === 'recover' ? objective.ally.y : (allyInGate ? objective.gateY : objective.ally.y);
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, anchorX, anchorY) <= objective.radius + 28) nearbyEnemies++;
      return true;
    });
    this.rescueContested = nearbyEnemies > 0;

    if (this.rescueContested) {
      this.rescueHp = clamp(this.rescueHp - nearbyEnemies * dt * 6.8 * this.objectiveContestScale(), 0, this.rescueMaxHp);
    } else if (playerNearAlly || allyInGate) {
      this.rescueHp = clamp(this.rescueHp + dt * 5.4, 0, this.rescueMaxHp);
    }
    if (this.rescueHp <= 0) {
      this.flash('Survivor lost');
      this.lose();
      return;
    }

    if (this.rescuePhase === 'recover') {
      const before = this.rescueProgress;
      if (playerNearAlly) {
        this.rescueProgress += dt * (this.rescueContested ? 0.28 : 1) * this.objectiveProgressScale();
      } else {
        this.rescueProgress -= dt * 0.18;
      }
      this.rescueProgress = clamp(this.rescueProgress, 0, this.rescueHoldSeconds());
      if (this.rescueProgress > before && time > this.rescuePulseAt + 850) {
        this.rescuePulseAt = time;
        this.pulse(objective.x, objective.y, this.rescueContested ? this.def.palette.danger : this.def.palette.xp, objective.radius + 16);
      }
      if (this.rescueProgress >= this.rescueHoldSeconds() && before < this.rescueHoldSeconds()) {
        this.rescuePhase = 'extract';
        this.score += 35;
        this.xp += 2;
        this.flash('Survivor stabilized');
        this.sparkBurst(objective.ally.x, objective.ally.y, this.def.palette.xp, 14);
      }
    }

    if (this.rescuePhase === 'extract') {
      const playerDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, objective.ally.x, objective.ally.y);
      if (!allyInGate && playerDistance > 30 && playerDistance < 220) {
        const angle = Phaser.Math.Angle.Between(objective.ally.x, objective.ally.y, this.player.x, this.player.y);
        const speed = (this.rescueContested ? 54 : 96) * this.objectiveProgressScale();
        objective.ally.setPosition(
          clamp(objective.ally.x + Math.cos(angle) * speed * dt, 40, this.scale.width - 40),
          clamp(objective.ally.y + Math.sin(angle) * speed * dt, 40, this.scale.height - 40),
        );
        (objective.ally.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }

      const beforeExtract = this.rescueExtractProgress;
      if (playerInGate && allyInGate) {
        this.rescueExtractProgress += dt * (this.rescueContested ? 0.3 : 1) * this.objectiveProgressScale();
      } else {
        this.rescueExtractProgress -= dt * 0.2;
      }
      this.rescueExtractProgress = clamp(this.rescueExtractProgress, 0, this.rescueExtractSeconds());
      if (this.rescueExtractProgress > beforeExtract && time > this.rescuePulseAt + 850) {
        this.rescuePulseAt = time;
        this.pulse(objective.gateX, objective.gateY, this.rescueContested ? this.def.palette.danger : this.def.palette.xp, objective.gateRadius + 16);
      }
      if (this.rescueExtractProgress >= this.rescueExtractSeconds() && beforeExtract < this.rescueExtractSeconds()) {
        this.rescuePhase = 'complete';
        this.score += 60;
        this.flash('Rescue complete');
        this.sparkBurst(objective.gateX, objective.gateY, this.def.palette.xp, 18);
      }
    }

    this.redrawRescueObjective(time, playerNearAlly, playerInGate, allyInGate);
  }

  private redrawRescueObjective(time: number, playerNearAlly: boolean, playerInGate: boolean, allyInGate: boolean) {
    const objective = this.rescueObjective;
    if (!objective) return;
    const recoverRatio = clamp(this.rescueProgress / this.rescueHoldSeconds(), 0, 1);
    const extractRatio = clamp(this.rescueExtractProgress / this.rescueExtractSeconds(), 0, 1);
    const color = hex(this.rescueContested ? this.def.palette.danger : this.def.palette.xp);
    const accent = hex(this.def.palette.accent);
    const pulse = 0.5 + Math.sin(time * 0.006) * 0.22;

    objective.route
      .clear()
      .lineStyle(4, 0x000000, 0.22)
      .lineBetween(objective.x, objective.y, objective.gateX, objective.gateY)
      .lineStyle(2, this.rescuePhase === 'recover' ? accent : color, this.rescuePhase === 'recover' ? 0.18 : 0.42)
      .lineBetween(objective.x, objective.y, objective.gateX, objective.gateY);

    objective.ring
      .setFillStyle(color, playerNearAlly ? 0.15 + recoverRatio * 0.05 : 0.07 + recoverRatio * 0.04)
      .setStrokeStyle(playerNearAlly ? 3 : 2, color, this.rescueContested ? 0.9 : 0.52 + pulse * 0.18);
    objective.label
      .setText(this.rescuePhase === 'recover' ? (this.rescueContested ? 'rescue contested' : playerNearAlly ? 'stabilizing' : 'rescue survivor') : 'survivor mobile')
      .setColor(this.rescueContested ? this.def.palette.danger : this.def.palette.xp);
    objective.progress.clear();
    objective.progress.lineStyle(5, 0x000000, 0.22);
    objective.progress.beginPath();
    objective.progress.arc(objective.x, objective.y, objective.radius + 8, -Math.PI / 2, Math.PI * 1.5, false);
    objective.progress.strokePath();
    if (recoverRatio > 0) {
      objective.progress.lineStyle(5, color, 0.84);
      objective.progress.beginPath();
      objective.progress.arc(objective.x, objective.y, objective.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * recoverRatio, false);
      objective.progress.strokePath();
    }

    objective.signal.clear();
    objective.signal.lineStyle(1, color, this.rescueContested ? 0.36 : 0.18 + recoverRatio * 0.22);
    for (let i = 0; i < 5; i++) {
      const angle = time * 0.0018 + i * Math.PI * 0.4;
      objective.signal.lineBetween(
        objective.x + Math.cos(angle) * objective.radius * 0.22,
        objective.y + Math.sin(angle) * objective.radius * 0.22,
        objective.x + Math.cos(angle + 0.4) * objective.radius * (0.74 + pulse * 0.08),
        objective.y + Math.sin(angle + 0.4) * objective.radius * (0.74 + pulse * 0.08),
      );
    }

    objective.gate
      .setFillStyle(color, (playerInGate && allyInGate) ? 0.16 + extractRatio * 0.06 : 0.07 + extractRatio * 0.04)
      .setStrokeStyle((playerInGate && allyInGate) ? 3 : 2, color, this.rescueContested ? 0.9 : 0.54 + pulse * 0.18);
    objective.gateCore
      .setFillStyle(color, 0.14 + extractRatio * 0.32)
      .setStrokeStyle(1, color, 0.26 + extractRatio * 0.5);
    objective.gateLabel
      .setText(this.rescuePhase === 'recover' ? 'extract locked' : this.rescueContested ? 'rescue contested' : (playerInGate && allyInGate) ? 'extracting survivor' : 'rescue extract')
      .setColor(this.rescueContested ? this.def.palette.danger : this.def.palette.xp);
    objective.gateBeam.clear();
    objective.gateBeam.lineStyle(1, color, this.rescueContested ? 0.34 : 0.16 + extractRatio * 0.24);
    for (let i = 0; i < 5; i++) {
      const angle = time * 0.0014 + i * Math.PI * 0.4;
      objective.gateBeam.lineBetween(
        objective.gateX + Math.cos(angle) * objective.gateRadius * (0.24 + extractRatio * 0.16),
        objective.gateY + Math.sin(angle) * objective.gateRadius * (0.24 + extractRatio * 0.16),
        objective.gateX + Math.cos(angle + 0.46) * objective.gateRadius * (0.84 + pulse * 0.07),
        objective.gateY + Math.sin(angle + 0.46) * objective.gateRadius * (0.84 + pulse * 0.07),
      );
    }
    objective.gateProgress.clear();
    objective.gateProgress.lineStyle(5, 0x000000, 0.22);
    objective.gateProgress.beginPath();
    objective.gateProgress.arc(objective.gateX, objective.gateY, objective.gateRadius + 8, -Math.PI / 2, Math.PI * 1.5, false);
    objective.gateProgress.strokePath();
    if (extractRatio > 0) {
      objective.gateProgress.lineStyle(5, color, 0.86);
      objective.gateProgress.beginPath();
      objective.gateProgress.arc(objective.gateX, objective.gateY, objective.gateRadius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * extractRatio, false);
      objective.gateProgress.strokePath();
    }
    objective.pips.forEach((pip, index) => {
      const active = index / objective.pips.length <= extractRatio;
      pip.setAlpha(active ? 0.9 : 0.3 + pulse * 0.2);
      pip.setScale(active ? 1.24 : 1);
      pip.setFillStyle(color);
    });
  }

  private updateObjectiveDirector(dt: number, time: number) {
    if (this.over || !this.hasObjectivePickupDirector()) return;
    const limit = this.def.winCondition === 'score-target' ? 2 : 1;
    if (this.objectivePickups.children.size >= limit) return;

    const startAt = this.def.winCondition === 'score-target' ? 2.4 : this.def.winCondition === 'collect-relics' ? 3.6 : 7.5;
    if (this.elapsed < startAt) return;

    this.objectivePickupTimer += dt;
    const interval = (this.def.winCondition === 'score-target' ? 6.2 : this.def.winCondition === 'collect-relics' ? 7.4 : 10.5) * this.objectivePickupIntervalScale();
    if (this.objectivePickupTimer < interval) return;
    this.objectivePickupTimer = 0;

    const point = this.nextObjectivePickupPoint();
    this.spawnObjectivePickup(
      point.x,
      point.y,
      this.objectivePickupKind(),
      true,
      time,
    );
  }

  private hasObjectivePickupDirector() {
    return this.def.winCondition === 'score-target' ||
      this.def.winCondition === 'survive' ||
      this.def.winCondition === 'collect-relics';
  }

  private objectivePickupKind(): ObjectivePickupKind {
    if (this.def.winCondition === 'survive') return 'supply';
    if (this.def.winCondition === 'collect-relics') return 'relic';
    return 'score-cache';
  }

  private nextObjectivePickupPoint() {
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:objective:${Math.floor(this.elapsed / 5)}`);
    const margin = 112;
    return {
      x: margin + seededRange(seed, 5, Math.max(1, width - margin * 2)),
      y: margin + seededRange(seed, 9, Math.max(1, height - margin * 2)),
    };
  }

  private spawnObjectivePickup(x: number, y: number, kind: ObjectivePickupKind, announce: boolean, time = this.time.now) {
    const color = hex(this.objectivePickupColor(kind));
    const pickupRadius = kind === 'score-cache' ? 11 : kind === 'relic' ? 14 : kind === 'access-key' ? 12 : 13;
    const pickup = this.applyCircleBody(this.physics.add.image(x, y, 'orb'), pickupRadius)
      .setDepth(DEPTH.orb + 0.45)
      .setTint(color)
      .setScale(kind === 'score-cache' ? 1.18 : kind === 'relic' ? 1.58 : kind === 'access-key' ? 1.3 : 1.32);
    pickup.setData('kind', kind);
    pickup.setData('scoreValue', kind === 'score-cache' ? Math.max(30, Math.round(this.scoreTarget() * 0.16)) : kind === 'relic' ? 18 : kind === 'access-key' ? 16 : 12);
    pickup.setData('healValue', kind === 'supply' ? 18 : 0);
    pickup.setData('relicValue', kind === 'relic' ? 1 : 0);
    pickup.setData('keyValue', kind === 'access-key' ? 1 : 0);
    pickup.setData('phase', seededRange(stableHash(`${this.def.title}:${x}:${y}:${kind}`), 17, 628) / 100);

    const ringRadius = kind === 'score-cache' ? 22 : kind === 'relic' ? 31 : kind === 'access-key' ? 24 : 26;
    const ring = this.add.circle(x, y, ringRadius, color, 0.06)
      .setStrokeStyle(2, color, 0.68)
      .setDepth(DEPTH.orb + 0.36);
    const pip = this.add.rectangle(x, y - (kind === 'relic' ? 35 : 27), kind === 'relic' ? 17 : kind === 'access-key' ? 12 : 10, kind === 'access-key' ? 7 : kind === 'relic' ? 17 : 10, color, 0.86)
      .setRotation(Math.PI / 4)
      .setDepth(DEPTH.orb + 0.5);
    const label = this.add.text(x, y + 30, this.objectivePickupLabel(kind), {
      ...TEXT,
      fontSize: '10px',
      fontStyle: '700',
      color: this.objectivePickupColor(kind),
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.orb + 0.52);

    let aura: Phaser.GameObjects.Graphics | undefined;
    if (kind === 'relic') {
      const relicAlt = hex(this.def.palette.projectile);
      aura = this.add.graphics().setDepth(DEPTH.orb + 0.48);
      aura.fillStyle(0x000000, 0.2);
      aura.fillEllipse(0, 13, 50, 17);
      aura.fillStyle(color, 0.24);
      aura.fillTriangle(0, -32, 26, 0, 0, 33);
      aura.fillTriangle(0, -32, -26, 0, 0, 33);
      aura.fillStyle(relicAlt, 0.22);
      aura.fillTriangle(0, -24, 15, 0, 0, 23);
      aura.fillTriangle(0, -24, -15, 0, 0, 23);
      aura.lineStyle(2, 0xffffff, 0.42);
      aura.lineBetween(0, -30, 0, 30);
      aura.lineBetween(-20, -1, 20, -1);
      aura.lineStyle(2, relicAlt, 0.58);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        aura.lineBetween(Math.cos(angle) * 24, Math.sin(angle) * 24, Math.cos(angle) * 38, Math.sin(angle) * 38);
      }
      aura.setPosition(x, y);
    }

    const extras: ObjectivePickupExtras = { ring, pip, label, aura, kind };
    pickup.setData('objectiveExtras', extras);
    pickup.once('destroy', () => {
      ring.destroy();
      pip.destroy();
      label.destroy();
      aura?.destroy();
    });
    this.objectivePickups.add(pickup);
    this.objectivePickupVisibleUntil = Math.max(this.objectivePickupVisibleUntil, time + 1500);
    if (announce) {
      this.flash(this.objectivePickupFlash(kind));
      this.addDirectorEvent(`Signal: ${this.objectivePickupLabel(kind)}`, this.objectivePickupColor(kind), 5200);
    }
    const pickupRingTargetRadius = kind === 'score-cache' ? 34 : kind === 'relic' ? 36 : kind === 'access-key' ? 35 : 38;
    this.tweens.add({
      targets: ring,
      scale: pickupRingTargetRadius / ringRadius,
      alpha: { from: 0.18, to: 0.42 },
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: 'Sine.InOut',
    });
  }

  private updateObjectivePickups(time: number) {
    this.objectivePickups.children.each((child) => {
      const pickup = child as ArcadeImage;
      if (!pickup.active) return true;
      const extras = pickup.getData('objectiveExtras') as ObjectivePickupExtras | undefined;
      const phase = (pickup.getData('phase') as number | undefined) ?? 0;
      const bob = Math.sin(time * 0.006 + phase) * 4;
      pickup.setRotation(pickup.rotation + 0.018);
      pickup.setAlpha(0.78 + Math.sin(time * 0.008 + phase) * 0.16);
      if (extras) {
        extras.ring.setPosition(pickup.x, pickup.y + bob * 0.2);
        extras.pip.setPosition(pickup.x, pickup.y - (extras.kind === 'relic' ? 35 : 27) + bob);
        extras.pip.setRotation(Math.PI / 4 + time * 0.003);
        extras.label.setPosition(pickup.x, pickup.y + 30 + bob * 0.3);
        if (extras.aura) {
          extras.aura.setPosition(pickup.x, pickup.y + bob * 0.12);
          extras.aura.setRotation(Math.sin(time * 0.0014 + phase) * 0.08);
          extras.aura.setAlpha(0.74 + Math.sin(time * 0.005 + phase) * 0.16);
        }
      }
      return true;
    });
  }

  private collectObjectivePickup(pickup: ArcadeImage) {
    if (!pickup.active) return;
    const kind = (pickup.getData('kind') as ObjectivePickupKind | undefined) ?? 'score-cache';
    const scoreValue = (pickup.getData('scoreValue') as number | undefined) ?? 0;
    const healValue = (pickup.getData('healValue') as number | undefined) ?? 0;
    const relicValue = (pickup.getData('relicValue') as number | undefined) ?? 0;
    const keyValue = (pickup.getData('keyValue') as number | undefined) ?? 0;
    this.score += scoreValue;
    if (healValue > 0) this.hp = Math.min(this.maxHp, this.hp + healValue);
    if (relicValue > 0) this.relics += relicValue;
    if (keyValue > 0) {
      const beforeKeys = this.unlockKeys;
      this.unlockKeys = clamp(this.unlockKeys + keyValue, 0, this.unlockKeyTarget());
      if (this.unlockKeys >= this.unlockKeyTarget() && beforeKeys < this.unlockKeyTarget()) {
        this.flash('Gate unlocked');
        this.addDirectorEvent('Exit gate unlocked', this.def.palette.xp, 6200);
        if (this.unlockGate) {
          this.pulse(this.unlockGate.x, this.unlockGate.y, this.def.palette.xp, this.unlockGate.radius + 18);
          this.sparkBurst(this.unlockGate.x, this.unlockGate.y, this.def.palette.xp, 16);
        }
      }
    }
    this.xp += kind === 'score-cache' ? 2 : kind === 'relic' ? 3 : kind === 'access-key' ? 2 : 1;
    this.objectivePickupVisibleUntil = Math.max(this.objectivePickupVisibleUntil, this.time.now + 520);
    this.floatObjectiveReward(pickup.x, pickup.y, kind, scoreValue, healValue, relicValue, keyValue);
    this.pulse(pickup.x, pickup.y, this.objectivePickupColor(kind), kind === 'score-cache' ? 34 : kind === 'relic' ? 38 : kind === 'access-key' ? 36 : 40);
    this.sparkBurst(pickup.x, pickup.y, this.objectivePickupColor(kind), kind === 'score-cache' ? 10 : kind === 'relic' ? 14 : kind === 'access-key' ? 12 : 12);
    this.addDirectorEvent(`Collected: ${this.objectivePickupLabel(kind)}`, this.objectivePickupColor(kind), 5200);
    pickup.destroy();
    if (this.def.winCondition === 'collect-relics' && this.relics >= this.relicTarget()) this.win();
  }

  private floatObjectiveReward(x: number, y: number, kind: ObjectivePickupKind, scoreValue: number, healValue: number, relicValue: number, keyValue: number) {
    const parts = scoreValue > 0 ? [`+${scoreValue}`] : [];
    if (healValue > 0) parts.push(`+${healValue} HP`);
    if (relicValue > 0) parts.push(`+${relicValue} relic`);
    if (keyValue > 0) parts.push(`+${keyValue} key`);
    if (parts.length === 0) parts.push('+0');
    const label = this.add.text(x, y - 24, parts.join(' · '), {
      ...TEXT,
      fontSize: '13px',
      fontStyle: '700',
      color: this.objectivePickupColor(kind),
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 1);
    this.tweens.add({
      targets: label,
      y: y - 52,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  private objectivePickupColor(kind: ObjectivePickupKind) {
    if (kind === 'supply') return this.def.palette.xp;
    if (kind === 'relic') return this.def.palette.projectile;
    if (kind === 'access-key') return this.def.palette.projectile;
    return this.def.palette.accent;
  }

  private objectivePickupLabel(kind: ObjectivePickupKind) {
    if (kind === 'supply') return 'supply';
    if (kind === 'relic') return 'relic';
    if (kind === 'access-key') return 'access key';
    return 'score';
  }

  private objectivePickupFlash(kind: ObjectivePickupKind) {
    if (kind === 'supply') return 'Supply beacon';
    if (kind === 'relic') return 'Relic shard';
    if (kind === 'access-key') return 'Access key';
    return 'Score cache';
  }

  private hasVisibleObjectivePickup() {
    return this.objectivePickups.children.size > 0 || this.time.now < this.objectivePickupVisibleUntil;
  }

  private updateArenaDirector(dt: number, time: number) {
    if (this.elapsed < 10.5 || this.arenaHazards.length > 0 || this.over) return;
    this.arenaHazardTimer += dt;
    const interval = (this.def.winCondition === 'survive' ? 8.5 : 11.5) * this.hazardIntervalScale();
    if (this.arenaHazardTimer < interval) return;
    this.arenaHazardTimer = 0;
    const point = this.nextArenaHazardPoint();
    this.spawnArenaHazard(point.x, point.y, point.radius, true, time);
  }

  private nextArenaHazardPoint() {
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:hazard:${Math.floor(this.elapsed / 8)}`);
    const margin = 92;
    return {
      x: margin + seededRange(seed, 3, Math.max(1, width - margin * 2)),
      y: margin + seededRange(seed, 7, Math.max(1, height - margin * 2)),
      radius: 56 + seededRange(seed, 11, 26),
    };
  }

  private spawnArenaHazard(x: number, y: number, radius: number, announce: boolean, time = this.time.now, colorOverride?: string) {
    const color = hex(colorOverride ?? this.arenaHazardColor());
    const armAt = time + 680;
    const expireAt = armAt + 1280;
    const ring = this.add.circle(x, y, radius * 0.28, color, 0.05)
      .setStrokeStyle(3, color, 0.74)
      .setDepth(DEPTH.fx - 0.05);
    const core = this.add.circle(x, y, radius * 0.18, color, 0)
      .setStrokeStyle(1, 0xffffff, 0.28)
      .setDepth(DEPTH.fx - 0.04);
    const spokes = this.add.graphics().setDepth(DEPTH.fx - 0.03);
    spokes.lineStyle(2, color, 0.52);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      spokes.lineBetween(
        x + Math.cos(angle) * radius * 0.34,
        y + Math.sin(angle) * radius * 0.34,
        x + Math.cos(angle) * radius * 0.92,
        y + Math.sin(angle) * radius * 0.92,
      );
    }

    this.arenaHazards.push({ x, y, radius, armAt, expireAt, ring, core, spokes });
    this.arenaHazardVisibleUntil = Math.max(this.arenaHazardVisibleUntil, expireAt);
    if (announce) this.flash(this.arenaHazardLabel());
    this.tweens.add({
      targets: ring,
      scale: radius / Math.max(1, radius * 0.28),
      alpha: 0.44,
      duration: 680,
      ease: 'Sine.Out',
    });
    this.tweens.add({
      targets: spokes,
      alpha: 0.22,
      yoyo: true,
      repeat: 1,
      duration: 340,
      ease: 'Sine.InOut',
    });
  }

  private updateArenaHazards(time: number) {
    if (this.arenaHazards.length === 0) return;
    const remaining: ArenaHazard[] = [];
    for (const hazard of this.arenaHazards) {
      if (time > hazard.expireAt) {
        hazard.ring.destroy();
        hazard.core.destroy();
        hazard.spokes.destroy();
        continue;
      }

      const armed = time >= hazard.armAt;
      if (armed) {
        const pulse = 0.78 + Math.sin(time * 0.012) * 0.18;
        hazard.core.setRadius(hazard.radius * pulse);
        hazard.core.setAlpha(0.16 + Math.sin(time * 0.018) * 0.08);
        hazard.ring.setAlpha(0.5);
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, hazard.x, hazard.y) <= hazard.radius) {
          if (time - this.lastHazardDamageAt > 520) {
            this.lastHazardDamageAt = time;
            this.damagePlayer(7);
          }
        }
      } else {
        hazard.core.setRadius(hazard.radius * 0.18);
        hazard.core.setAlpha(0.04);
      }
      remaining.push(hazard);
    }
    this.arenaHazards = remaining;
  }

  private arenaHazardColor() {
    const mood = arenaMood(this.def);
    if (mood === 'sky') return this.def.palette.accent;
    if (mood === 'platform') return this.def.palette.danger;
    if (mood === 'security') return this.def.palette.projectile;
    if (mood === 'space') return this.def.palette.xp;
    if (mood === 'bakery') return this.def.palette.projectile;
    if (mood === 'coast') return this.def.palette.accent;
    return this.def.palette.danger;
  }

  private arenaHazardLabel() {
    const mood = arenaMood(this.def);
    if (mood === 'sky') return 'Storm lane';
    if (mood === 'platform') return 'Crumble line';
    if (mood === 'security') return 'Scanner lane';
    if (mood === 'space') return 'Meteor lane';
    if (mood === 'bakery') return 'Oven flare';
    if (mood === 'coast') return 'Tide surge';
    if (mood === 'haunted') return 'Hex circle';
    return 'Arena surge';
  }

  private hasVisibleArenaHazard() {
    return this.arenaHazards.length > 0 || this.time.now < this.arenaHazardVisibleUntil;
  }

  private updateEnemies(dt: number) {
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const role = enemy.getData('role') as string;
      const speed = enemy.getData('speed') as number;
      const eliteKind = (enemy.getData('eliteKind') as EliteKind | undefined) ?? 'none';
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (enemy.getData('boss')) {
        this.updateBossMovement(enemy, body, angle, speed);
      } else if (this.isFlightShooter()) {
        this.updateFlightEnemy(enemy, body, angle, speed, dist, dt);
      } else if (this.isPlatformer()) {
        this.updatePlatformerEnemy(enemy, body, speed, dist, dt);
      } else if (role === 'shooter') {
        this.updateShooter(enemy, body, angle, speed, dist, dt);
      } else if (role === 'sniper') {
        this.updateSniper(enemy, body, angle, speed, dist, dt);
      } else if (role === 'sapper') {
        this.updateSapper(enemy, body, angle, speed, dist, dt);
      } else if (role === 'support') {
        this.updateSupport(enemy, body, angle, speed, dist, dt);
      } else if (role === 'guardian') {
        this.updateGuardian(enemy, body, angle, speed, dist, dt);
      } else if (role === 'sentinel') {
        this.updateSentinel(enemy, body, angle, speed, dist, dt);
      } else if (role === 'charger') {
        this.updateCharger(enemy, body, angle, speed, dt);
      } else if (role === 'orbiter') {
        const orbit = angle + (dist > 190 ? 0.45 : 1.7);
        body.setVelocity(Math.cos(orbit) * speed, Math.sin(orbit) * speed);
      } else if (role === 'wanderer') {
        this.updateWanderer(enemy, body, speed, dt);
      } else {
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      }
      this.updateEliteBehavior(enemy, eliteKind, angle, dist);
      return true;
    });
  }

  private updateFlightEnemy(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dist: number, dt: number) {
    const role = enemy.getData('role') as Enemy['role'];
    const phase = (enemy.getData('phase') as number | undefined) ?? 0;
    const time = this.time.now;
    const targetY = clamp(this.player.y + Math.sin(time * 0.0016 + phase) * 92, 56, this.scale.height - 56);
    const drift = role === 'charger'
      ? 1.35
      : role === 'sniper'
        ? 0.62
        : role === 'orbiter'
          ? 0.72
          : 0.9;
    const vx = -speed * drift;
    const vy = clamp((targetY - enemy.y) * 1.36, -speed * 0.95, speed * 0.95);

    if (role === 'orbiter') {
      body.setVelocity(vx * 0.68, Math.sin(time * 0.002 + phase) * speed * 0.95);
    } else {
      body.setVelocity(vx, vy);
    }

    if (enemy.x < -90) {
      enemy.destroy();
      return;
    }

    const fire = (enemy.getData('fire') as number) + dt;
    const cadence = role === 'sniper'
      ? 1.75
      : role === 'sentinel'
        ? 1.55
        : role === 'shooter'
          ? 1.25
          : 2.15;

    if ((role === 'shooter' || role === 'sniper' || role === 'sentinel') && fire > cadence) {
      enemy.setData('fire', 0);
      const shotAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      this.spawnProjectile(enemy.x - 16, enemy.y, shotAngle, role === 'sniper' ? 370 : 260, 'ebullet', this.enemyBullets, 4200);
      if (role === 'sentinel') this.emitSentinelLane(enemy, shotAngle);
      else this.pulse(enemy.x, enemy.y, this.def.palette.projectile, 18);
      return;
    }

    if (role === 'charger' && fire > 1.55) {
      enemy.setData('fire', 0);
      body.setVelocity(-speed * 2.4, vy);
      this.pulse(enemy.x, enemy.y, this.def.palette.danger, 18);
      return;
    }

    if ((role === 'sapper' || role === 'guardian') && fire > 1.9 && dist < 420) {
      enemy.setData('fire', 0);
      this.spawnArenaHazard(clamp(enemy.x - 76, 64, this.scale.width - 64), enemy.y, 42, false, time, this.def.palette.danger);
      this.pulse(enemy.x, enemy.y, role === 'guardian' ? this.def.palette.xp : this.def.palette.danger, 18);
      return;
    }

    enemy.setData('fire', fire);
  }

  private updatePlatformerEnemy(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, speed: number, dist: number, dt: number) {
    const role = enemy.getData('role') as Enemy['role'];
    const phase = (enemy.getData('phase') as number | undefined) ?? 0;
    const time = this.time.now;
    const dir = this.player.x >= enemy.x ? 1 : -1;
    const grounded = body.blocked.down || body.touching.down;
    const nearLedge = enemy.x < 44 || enemy.x > this.scale.width - 44;
    const keepDistance = role === 'sniper' || role === 'sentinel' || role === 'shooter';
    const patrol = Math.sin(time * 0.0012 + phase) > 0 ? 1 : -1;
    const desiredDir = keepDistance && dist < 260 ? -dir : keepDistance && dist > 430 ? dir : role === 'wanderer' ? patrol : dir;
    const speedScale = role === 'charger'
      ? 1.24
      : role === 'sniper' || role === 'sentinel'
        ? 0.66
        : role === 'brute' || role === 'guardian'
          ? 0.78
          : 0.92;

    body.setVelocityX(desiredDir * speed * speedScale);
    if (grounded && (body.blocked.left || body.blocked.right || nearLedge) && role !== 'sentinel') {
      body.setVelocityY(-Math.max(280, speed * 2.15));
    }

    if (enemy.y > this.scale.height + 90) {
      const point = this.chooseSpawnPoint(false);
      enemy.setPosition(point.x, point.y);
      body.reset(point.x, point.y);
      body.setVelocityX(-speed);
      return;
    }

    const fire = ((enemy.getData('fire') as number | undefined) ?? 0) + dt;
    const cadence = role === 'sniper'
      ? 2.15
      : role === 'sentinel'
        ? 1.9
        : role === 'shooter'
          ? 1.45
          : role === 'sapper' || role === 'guardian'
            ? 2.1
            : role === 'charger'
              ? 1.75
              : 2.7;

    if ((role === 'shooter' || role === 'sniper' || role === 'sentinel') && fire > cadence) {
      enemy.setData('fire', 0);
      const shotAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y - 6, this.player.x, this.player.y - 6);
      this.spawnProjectile(enemy.x + dir * 12, enemy.y - 6, shotAngle, role === 'sniper' ? 390 : 280, 'ebullet', this.enemyBullets, 4200);
      if (role === 'sentinel') this.emitSentinelLane(enemy, shotAngle);
      else this.pulse(enemy.x, enemy.y, this.def.palette.projectile, 18);
      return;
    }

    if (role === 'charger' && fire > cadence && grounded) {
      enemy.setData('fire', 0);
      body.setVelocityX(dir * speed * 2.4);
      body.setVelocityY(-Math.max(230, speed * 1.45));
      this.pulse(enemy.x, enemy.y, this.def.palette.danger, 18);
      return;
    }

    if ((role === 'sapper' || role === 'guardian') && fire > cadence && dist < 390) {
      enemy.setData('fire', 0);
      this.spawnArenaHazard(clamp(enemy.x + dir * 44, 64, this.scale.width - 64), clamp(enemy.y + 18, 64, this.scale.height - 76), 42, false, time, this.def.palette.danger);
      this.pulse(enemy.x, enemy.y, role === 'guardian' ? this.def.palette.xp : this.def.palette.danger, 18);
      return;
    }

    enemy.setData('fire', fire);
  }

  private updateEliteBehavior(enemy: ArcadeImage, eliteKind: EliteKind, angle: number, dist: number) {
    if (eliteKind === 'none') return;
    const now = this.time.now;
    if (eliteKind === 'swift') {
      const lastTrail = (enemy.getData('eliteTrailAt') as number | undefined) ?? -Infinity;
      if (now - lastTrail > 180) {
        enemy.setData('eliteTrailAt', now);
        this.afterimage(enemy, this.eliteColor(eliteKind), 0.24, 220);
      }
      return;
    }
    if (eliteKind === 'volatile' && dist < 145) {
      const lastPulse = (enemy.getData('volatilePulseAt') as number | undefined) ?? -Infinity;
      if (now - lastPulse > 620) {
        enemy.setData('volatilePulseAt', now);
        this.pulse(enemy.x, enemy.y, this.eliteColor(eliteKind), 22);
        if (dist < 72) {
          this.spawnProjectile(enemy.x, enemy.y, angle, 250, 'ebullet', this.enemyBullets, 900);
        }
      }
    }
  }

  private updateShooter(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dist: number, dt: number) {
    if (dist > 270) body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    else body.setVelocity(Math.cos(angle + 1.45) * speed, Math.sin(angle + 1.45) * speed);
    const fire = (enemy.getData('fire') as number) + dt;
    if (fire > 1.55) {
      enemy.setData('fire', 0);
      this.spawnProjectile(enemy.x, enemy.y, angle, 230, 'ebullet', this.enemyBullets, 3600);
    } else enemy.setData('fire', fire);
  }

  private updateSniper(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dist: number, dt: number) {
    const strafe = Math.sin(this.time.now * 0.0014 + ((enemy.getData('phase') as number | undefined) ?? 0)) > 0 ? 1 : -1;
    if (dist < 260) {
      body.setVelocity(Math.cos(angle + Math.PI) * speed * 1.15, Math.sin(angle + Math.PI) * speed * 1.15);
    } else if (dist > 430) {
      body.setVelocity(Math.cos(angle) * speed * 0.82, Math.sin(angle) * speed * 0.82);
    } else {
      body.setVelocity(Math.cos(angle + strafe * 1.42) * speed * 0.68, Math.sin(angle + strafe * 1.42) * speed * 0.68);
    }

    const fire = (enemy.getData('fire') as number) + dt;
    if (fire > 2.35) {
      enemy.setData('fire', 0);
      this.pulse(enemy.x, enemy.y, this.def.palette.xp, 24);
      this.spawnProjectile(enemy.x, enemy.y, angle, 360, 'ebullet', this.enemyBullets, 4700);
    } else {
      enemy.setData('fire', fire);
    }
  }

  private updateSapper(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dist: number, dt: number) {
    const phase = (enemy.getData('phase') as number | undefined) ?? 0;
    const weave = Math.sin(this.time.now * 0.0018 + phase);
    if (dist < 150) {
      body.setVelocity(Math.cos(angle + Math.PI) * speed * 1.05, Math.sin(angle + Math.PI) * speed * 1.05);
    } else if (dist > 310) {
      body.setVelocity(Math.cos(angle) * speed * 0.92, Math.sin(angle) * speed * 0.92);
    } else {
      const flank = angle + (weave > 0 ? 1.34 : -1.34);
      body.setVelocity(Math.cos(flank) * speed * 0.74, Math.sin(flank) * speed * 0.74);
    }

    const fire = (enemy.getData('fire') as number) + dt;
    if (fire > 1.85) {
      enemy.setData('fire', 0);
      this.spawnArenaHazard(enemy.x, enemy.y, 42, false, this.time.now, this.def.palette.danger);
      this.pulse(enemy.x, enemy.y, this.def.palette.danger, 20);
    } else {
      enemy.setData('fire', fire);
    }
  }

  private updateSupport(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dist: number, dt: number) {
    const target = this.findSupportTarget(enemy, 340);
    const phase = (enemy.getData('phase') as number | undefined) ?? 0;
    const weave = Math.sin(this.time.now * 0.0015 + phase);
    if (target?.active) {
      const allyAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
      const allyDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
      if (allyDist > 120) {
        body.setVelocity(Math.cos(allyAngle) * speed * 0.9, Math.sin(allyAngle) * speed * 0.9);
      } else if (dist < 170) {
        body.setVelocity(Math.cos(angle + Math.PI) * speed * 0.78, Math.sin(angle + Math.PI) * speed * 0.78);
      } else {
        body.setVelocity(Math.cos(allyAngle + (weave > 0 ? 1.36 : -1.36)) * speed * 0.58, Math.sin(allyAngle + (weave > 0 ? 1.36 : -1.36)) * speed * 0.58);
      }
    } else if (dist < 190) {
      body.setVelocity(Math.cos(angle + Math.PI) * speed * 0.78, Math.sin(angle + Math.PI) * speed * 0.78);
    } else {
      const flank = angle + (weave > 0 ? 1.2 : -1.2);
      body.setVelocity(Math.cos(flank) * speed * 0.62, Math.sin(flank) * speed * 0.62);
    }

    const fire = (enemy.getData('fire') as number) + dt;
    if (fire > 1.9) {
      enemy.setData('fire', 0);
      this.emitSupportPulse(enemy, target);
    } else {
      enemy.setData('fire', fire);
    }
  }

  private findSupportTarget(source: ArcadeImage, maxRange: number) {
    let target: ArcadeImage | undefined;
    let bestScore = Infinity;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active || enemy === source || enemy.getData('boss')) return true;
      const distance = Phaser.Math.Distance.Between(source.x, source.y, enemy.x, enemy.y);
      if (distance > maxRange) return true;
      const hp = (enemy.getData('hp') as number | undefined) ?? 0;
      const maxHp = (enemy.getData('maxHp') as number | undefined) ?? hp;
      const wounded = hp < maxHp - 1;
      const score = distance + (wounded ? -220 : 120);
      if (score < bestScore) {
        target = enemy;
        bestScore = score;
      }
      return true;
    });
    return target;
  }

  private emitSupportPulse(source: ArcadeImage, target?: ArcadeImage) {
    const xp = this.def.palette.xp;
    const accent = this.def.palette.accent;
    const radius = ((source.getData('radius') as number | undefined) ?? 12) * 2.4;
    this.supportPulseUntil = Math.max(this.supportPulseUntil, this.time.now + 880);
    if (!this.enemyAnimationStates.includes('support-pulse')) this.enemyAnimationStates.push('support-pulse');
    this.pulse(source.x, source.y, xp, radius);

    const g = this.add.graphics().setDepth(DEPTH.fx + 0.25);
    g.lineStyle(2, hex(xp), 0.52);
    g.strokeCircle(source.x, source.y, radius * 0.72);
    g.lineStyle(1, hex(accent), 0.36);
    g.strokeCircle(source.x, source.y, radius * 1.05);
    if (target?.active) {
      g.lineStyle(2, hex(xp), 0.42);
      g.lineBetween(source.x, source.y, target.x, target.y);
      g.fillStyle(hex(xp), 0.18);
      g.fillCircle(target.x, target.y, radius * 0.36);

      const hp = (target.getData('hp') as number | undefined) ?? 0;
      const maxHp = (target.getData('maxHp') as number | undefined) ?? hp;
      if (hp < maxHp - 1) {
        const healed = Math.min(maxHp - hp, Math.max(3, Math.round(maxHp * 0.18)));
        const nextHp = Math.min(maxHp, hp + healed);
        target.setData('hp', nextHp);
        this.updateEnemyReadout(target, nextHp);
        this.floatHeal(target.x, target.y - (((target.getData('radius') as number) || 12) + 10), healed, xp);
        this.sparkBurst(target.x, target.y, xp, 5);
      }
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 620,
      ease: 'Sine.InOut',
      onComplete: () => g.destroy(),
    });
  }

  private updateGuardian(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dist: number, dt: number) {
    const target = this.findGuardianTarget(enemy, 360);
    const phase = (enemy.getData('phase') as number | undefined) ?? 0;
    const weave = Math.sin(this.time.now * 0.0014 + phase);
    if (target?.active) {
      const allyAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
      const allyDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
      if (allyDist > 145) {
        body.setVelocity(Math.cos(allyAngle) * speed * 0.92, Math.sin(allyAngle) * speed * 0.92);
      } else if (dist < 155) {
        body.setVelocity(Math.cos(angle + Math.PI) * speed * 0.72, Math.sin(angle + Math.PI) * speed * 0.72);
      } else {
        body.setVelocity(Math.cos(allyAngle + (weave > 0 ? 1.18 : -1.18)) * speed * 0.54, Math.sin(allyAngle + (weave > 0 ? 1.18 : -1.18)) * speed * 0.54);
      }
    } else if (dist > 245) {
      body.setVelocity(Math.cos(angle) * speed * 0.76, Math.sin(angle) * speed * 0.76);
    } else {
      const flank = angle + (weave > 0 ? 1.42 : -1.42);
      body.setVelocity(Math.cos(flank) * speed * 0.58, Math.sin(flank) * speed * 0.58);
    }

    const fire = (enemy.getData('fire') as number) + dt;
    if (fire > 1.7) {
      enemy.setData('fire', 0);
      this.emitGuardianShield(enemy);
    } else {
      enemy.setData('fire', fire);
    }
  }

  private findGuardianTarget(source: ArcadeImage, maxRange: number) {
    let target: ArcadeImage | undefined;
    let bestScore = Infinity;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active || enemy === source || enemy.getData('boss')) return true;
      const distance = Phaser.Math.Distance.Between(source.x, source.y, enemy.x, enemy.y);
      if (distance > maxRange) return true;
      const role = enemy.getData('role') as string;
      const priority = role === 'support' ? 160 : role === 'brute' ? 110 : role === 'sniper' || role === 'shooter' ? 80 : 0;
      const score = distance - priority;
      if (score < bestScore) {
        target = enemy;
        bestScore = score;
      }
      return true;
    });
    return target;
  }

  private emitGuardianShield(source: ArcadeImage) {
    const accent = this.def.palette.accent;
    const projectile = this.def.palette.projectile;
    const shieldRange = Math.max(132, (((source.getData('radius') as number | undefined) ?? 14) * 8.4));
    const protectedUntil = this.time.now + 1450;
    let protectedCount = 0;
    this.guardianShieldUntil = Math.max(this.guardianShieldUntil, this.time.now + 980);
    if (!this.enemyAnimationStates.includes('guardian-shield')) this.enemyAnimationStates.push('guardian-shield');
    this.pulse(source.x, source.y, projectile, shieldRange * 0.22);

    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active || enemy === source || enemy.getData('boss')) return true;
      const distance = Phaser.Math.Distance.Between(source.x, source.y, enemy.x, enemy.y);
      if (distance > shieldRange) return true;
      enemy.setData('shieldedUntil', protectedUntil);
      protectedCount += 1;
      return true;
    });

    const g = this.add.graphics().setDepth(DEPTH.fx + 0.22);
    g.lineStyle(3, hex(projectile), 0.38);
    g.strokeCircle(source.x, source.y, shieldRange);
    g.lineStyle(1, hex(accent), 0.28);
    g.strokeCircle(source.x, source.y, shieldRange * 0.72);
    for (let i = 0; i < 4; i++) {
      const start = this.time.now * 0.0012 + i * Math.PI / 2;
      g.beginPath();
      g.arc(source.x, source.y, shieldRange * 0.86, start, start + 0.58, false);
      g.strokePath();
    }
    if (protectedCount > 0) {
      g.fillStyle(hex(projectile), 0.14);
      this.enemies.children.each((child) => {
        const enemy = child as ArcadeImage;
        if (!enemy.active || enemy === source || enemy.getData('boss')) return true;
        if (((enemy.getData('shieldedUntil') as number | undefined) ?? -Infinity) < protectedUntil) return true;
        g.fillCircle(enemy.x, enemy.y, Math.max(10, ((enemy.getData('radius') as number | undefined) ?? 12) * 1.4));
        return true;
      });
      this.sparkBurst(source.x, source.y, projectile, 5);
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 720,
      ease: 'Sine.InOut',
      onComplete: () => g.destroy(),
    });
  }

  private isEnemyShielded(enemy: ArcadeImage) {
    if (enemy.getData('boss')) return false;
    if ((enemy.getData('role') as string | undefined) === 'guardian') return false;
    return this.time.now < (((enemy.getData('shieldedUntil') as number | undefined) ?? -Infinity));
  }

  private updateSentinel(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dist: number, dt: number) {
    const phase = (enemy.getData('phase') as number | undefined) ?? 0;
    const fire = (enemy.getData('fire') as number) + dt;
    const charge = clamp(fire / 2.05, 0, 1);
    const weave = Math.sin(this.time.now * 0.0012 + phase);
    if (dist < 215) {
      body.setVelocity(Math.cos(angle + Math.PI) * speed * (0.82 - charge * 0.28), Math.sin(angle + Math.PI) * speed * (0.82 - charge * 0.28));
    } else if (dist > 430) {
      body.setVelocity(Math.cos(angle) * speed * 0.76, Math.sin(angle) * speed * 0.76);
    } else {
      const lane = angle + (weave > 0 ? 1.18 : -1.18);
      body.setVelocity(Math.cos(lane) * speed * (0.48 - charge * 0.22), Math.sin(lane) * speed * (0.48 - charge * 0.22));
    }

    if (fire > 2.05) {
      enemy.setData('fire', 0);
      this.emitSentinelLane(enemy, angle);
    } else {
      enemy.setData('fire', fire);
    }
  }

  private emitSentinelLane(source: ArcadeImage, baseAngle: number) {
    const projectile = this.def.palette.projectile;
    const danger = this.def.palette.danger;
    const now = this.time.now;
    this.sentinelLaneUntil = Math.max(this.sentinelLaneUntil, now + 820);
    if (!this.enemyAnimationStates.includes('sentinel-burst')) this.enemyAnimationStates.push('sentinel-burst');
    source.setData('sentinelLaneAt', now);
    this.pulse(source.x, source.y, projectile, 24);

    const g = this.add.graphics().setDepth(DEPTH.fx + 0.24);
    const laneLength = Math.max(this.def.arena.width, this.def.arena.height) * 0.82;
    const offsets = [-0.18, 0, 0.18];
    offsets.forEach((offset, index) => {
      const angle = baseAngle + offset;
      const endX = source.x + Math.cos(angle) * laneLength;
      const endY = source.y + Math.sin(angle) * laneLength;
      g.lineStyle(index === 1 ? 3 : 2, hex(index === 1 ? danger : projectile), index === 1 ? 0.42 : 0.26);
      g.lineBetween(source.x, source.y, endX, endY);
      g.fillStyle(hex(projectile), index === 1 ? 0.28 : 0.18);
      g.fillCircle(source.x + Math.cos(angle) * 28, source.y + Math.sin(angle) * 28, 3 + index);
      this.spawnProjectile(source.x, source.y, angle, index === 1 ? 310 : 280, 'ebullet', this.enemyBullets, 3600);
    });
    this.sparkBurst(source.x, source.y, projectile, 4);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 560,
      ease: 'Sine.InOut',
      onComplete: () => g.destroy(),
    });
  }

  private updateCharger(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number, dt: number) {
    const fire = (enemy.getData('fire') as number) + dt;
    if (fire > 2.25) {
      enemy.setData('fire', 0);
      body.setVelocity(Math.cos(angle) * speed * 3.1, Math.sin(angle) * speed * 3.1);
      this.pulse(enemy.x, enemy.y, this.def.palette.danger, 18);
    } else {
      enemy.setData('fire', fire);
      body.velocity.scale(0.96);
      if (body.velocity.length() < speed) body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
  }

  private updateWanderer(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, speed: number, dt: number) {
    const angle = (enemy.getData('wanderAngle') as number) + dt * 0.8;
    enemy.setData('wanderAngle', angle);
    const home = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    body.setVelocity(Math.cos(angle) * speed * 0.65 + Math.cos(home) * speed * 0.35, Math.sin(angle) * speed * 0.65 + Math.sin(home) * speed * 0.35);
  }

  private updateBossMovement(enemy: ArcadeImage, body: Phaser.Physics.Arcade.Body, angle: number, speed: number) {
    if (enemy.getData('charging')) return;
    if (this.isFlightShooter()) {
      const targetX = this.scale.width - 170;
      const targetY = clamp(this.player.y + Math.sin(this.time.now * 0.0012) * 90, 110, this.scale.height - 110);
      body.setVelocity((targetX - enemy.x) * 0.8, (targetY - enemy.y) * 0.62);
      return;
    }
    if (this.isPlatformer()) {
      const targetX = this.scale.width - 170;
      const targetY = this.scale.height - 150;
      body.setVelocity(
        clamp((targetX - enemy.x) * 0.72, -speed * 1.4, speed * 1.4),
        clamp((targetY - enemy.y) * 0.42, -220, 260),
      );
      return;
    }
    body.setVelocity(Math.cos(angle) * speed * 0.58, Math.sin(angle) * speed * 0.58);
  }

  private maybeSpawnBoss() {
    if (!this.def.boss || this.bossSpawned) return;
    const timeReady = this.elapsed >= this.def.boss.spawnAtSeconds * this.pressureProfile().timeScale;
    const waveReady = this.spawnQueue.length === 0 && this.pendingSpawns === 0 && this.enemies.children.size <= 3;
    if (!timeReady && !waveReady) return;
    this.bossSpawned = true;
    this.telegraphSpawn(this.def.boss, true);
    this.flash(`${this.def.boss.name} appears`);
  }

  private updateBossPattern(dt: number) {
    if (!this.def.boss || !this.boss || !this.boss.active) return;
    if (this.time.now < this.publicDemoBossHoldUntil) {
      this.bossPatternState = 'idle';
      this.bossPatternTimer = 0;
      this.bossTelegraphUntil = -Infinity;
      this.boss.clearTint();
      return;
    }
    const patterns: BossPattern[] = this.def.boss.patterns.length ? [...this.def.boss.patterns] : ['radial-burst'];
    this.bossPatternTimer += dt;
    if (this.bossPatternState === 'idle') {
      const hp = this.boss.getData('hp') as number;
      const maxHp = this.boss.getData('maxHp') as number;
      const cooldown = (hp / maxHp < 0.5 ? 1.15 : 1.7) * this.bossTempoScale() * this.bossPhaseTempoScale();
      if (this.bossPatternTimer < cooldown) return;
      this.bossPatternTimer = 0;
      this.bossPatternState = 'telegraph';
      const pattern = patterns[this.bossPatternIndex % patterns.length]!;
      this.boss.setData('patternWindupSeconds', this.bossTelegraphSeconds(pattern));
      this.boss.setData('currentPattern', pattern);
      this.boss.setTint(hex(this.def.palette.xp));
      this.boss.setData('charging', false);
      this.pulse(this.boss.x, this.boss.y, this.def.palette.danger, 64);
      this.showBossPatternTelegraph(pattern);
      return;
    }
    if (this.bossPatternState === 'telegraph') {
      const windupSeconds = (this.boss.getData('patternWindupSeconds') as number | undefined) ?? this.bossTelegraphSeconds(patterns[this.bossPatternIndex % patterns.length]!);
      if (this.bossPatternTimer < windupSeconds) return;
      this.bossPatternTimer = 0;
      this.bossPatternState = 'execute';
      this.boss.clearTint();
      this.executeBossPattern(patterns[this.bossPatternIndex % patterns.length]!);
      this.bossPatternIndex++;
      return;
    }
    if (this.bossPatternTimer > this.bossRecoverySeconds()) {
      this.bossPatternTimer = 0;
      this.bossPatternState = 'idle';
      this.boss.setData('charging', false);
    }
  }

  private showBossPatternTelegraph(pattern: BossPattern) {
    if (!this.boss?.active) return;
    if (this.time.now < this.publicDemoBossHoldUntil) return;

    const x = this.boss.x;
    const y = this.boss.y;
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const accent = hex(this.def.palette.accent);
    const g = this.add.graphics().setDepth(DEPTH.fx + 0.4);
    const telegraphMs = Math.round(this.bossTelegraphSeconds(pattern) * 1000);
    this.boss.setData('currentPattern', pattern);
    this.bossTelegraphUntil = Math.max(this.bossTelegraphUntil, this.time.now + telegraphMs);
    this.bossTransitionState = `boss-telegraph-${pattern}`;
    this.bossTransitionFx = Math.max(this.bossTransitionFx, 1);

    if (pattern === 'laser-grid') {
      const lanes = this.bossLaserGridLanes();
      const width = this.scale.width;
      const height = this.scale.height;
      const laneWidth = 24;
      const vertical = lanes.filter((lane) => lane.axis === 'vertical');
      const horizontal = lanes.filter((lane) => lane.axis === 'horizontal');

      for (const lane of lanes) {
        if (lane.axis === 'vertical') {
          g.fillStyle(danger, 0.07);
          g.fillRect(lane.value - laneWidth / 2, 48, laneWidth, height - 96);
          g.lineStyle(4, danger, 0.62);
          g.lineBetween(lane.value, 48, lane.value, height - 48);
          g.lineStyle(1, xp, 0.74);
          g.lineBetween(lane.value - 7, 64, lane.value - 7, height - 64);
          g.lineBetween(lane.value + 7, 64, lane.value + 7, height - 64);
        } else {
          g.fillStyle(danger, 0.07);
          g.fillRect(48, lane.value - laneWidth / 2, width - 96, laneWidth);
          g.lineStyle(4, danger, 0.62);
          g.lineBetween(48, lane.value, width - 48, lane.value);
          g.lineStyle(1, xp, 0.74);
          g.lineBetween(64, lane.value - 7, width - 64, lane.value - 7);
          g.lineBetween(64, lane.value + 7, width - 64, lane.value + 7);
        }
      }
      g.fillStyle(accent, 0.12);
      g.lineStyle(2, accent, 0.64);
      for (const vx of vertical) {
        for (const hy of horizontal) {
          g.fillCircle(vx.value, hy.value, 14);
          g.strokeCircle(vx.value, hy.value, 18);
        }
      }
      g.lineStyle(2, accent, 0.34);
      g.lineBetween(x, y, this.player.x, this.player.y);
    } else if (pattern === 'minefield') {
      const points = this.bossMinefieldPoints();
      g.lineStyle(2, danger, 0.72);
      for (const point of points) {
        g.fillStyle(danger, 0.08);
        g.fillCircle(point.x, point.y, point.radius);
        g.lineStyle(3, danger, 0.7);
        g.strokeCircle(point.x, point.y, point.radius);
        g.lineStyle(1, xp, 0.44);
        g.strokeCircle(point.x, point.y, point.radius * 0.58);
        for (let i = 0; i < 6; i++) {
          const spoke = (i / 6) * Math.PI * 2;
          g.lineBetween(
            point.x + Math.cos(spoke) * point.radius * 0.26,
            point.y + Math.sin(spoke) * point.radius * 0.26,
            point.x + Math.cos(spoke) * point.radius * 0.92,
            point.y + Math.sin(spoke) * point.radius * 0.92,
          );
        }
      }
      g.lineStyle(2, accent, 0.34);
      g.lineBetween(x, y, this.player.x, this.player.y);
    } else if (pattern === 'vortex') {
      const radius = Math.max(92, (this.def.boss?.radius ?? 28) * 3.3);
      const targetX = clamp((x + this.player.x) / 2, 74, this.scale.width - 74);
      const targetY = clamp((y + this.player.y) / 2, 74, this.scale.height - 74);
      g.fillStyle(xp, 0.08);
      g.fillCircle(targetX, targetY, radius);
      for (let ring = 0; ring < 4; ring++) {
        const ringRadius = radius * (0.35 + ring * 0.2);
        g.lineStyle(2 + (ring === 3 ? 1 : 0), ring % 2 === 0 ? xp : danger, 0.42 + ring * 0.08);
        g.strokeCircle(targetX, targetY, ringRadius);
      }
      g.lineStyle(2, accent, 0.74);
      for (let i = 0; i < 14; i++) {
        const start = (i / 14) * Math.PI * 2;
        const end = start + 0.82;
        const inner = radius * 0.24;
        const outer = radius * 0.95;
        g.lineBetween(
          targetX + Math.cos(start) * inner,
          targetY + Math.sin(start) * inner,
          targetX + Math.cos(end) * outer,
          targetY + Math.sin(end) * outer,
        );
      }
      g.lineStyle(2, danger, 0.38);
      g.lineBetween(x, y, targetX, targetY);
    } else if (pattern === 'shockwave') {
      const radius = Math.max(118, (this.def.boss?.radius ?? 28) * 4.2);
      g.fillStyle(danger, 0.05);
      g.fillCircle(x, y, radius);
      for (let ring = 0; ring < 4; ring++) {
        const ringRadius = radius * (0.32 + ring * 0.22);
        g.lineStyle(2 + ring, ring % 2 === 0 ? danger : xp, 0.42 + ring * 0.08);
        g.strokeCircle(x, y, ringRadius);
      }
      g.lineStyle(2, accent, 0.74);
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        g.lineBetween(
          x + Math.cos(angle) * radius * 0.22,
          y + Math.sin(angle) * radius * 0.22,
          x + Math.cos(angle) * radius * 0.96,
          y + Math.sin(angle) * radius * 0.96,
        );
      }
      g.lineStyle(2, xp, 0.46);
      g.strokeCircle(this.player.x, this.player.y, Math.max(22, (this.def.player.radius ?? 14) * 1.8));
    } else if (pattern === 'beam' || pattern === 'charge') {
      const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
      const len = Math.max(this.scale.width, this.scale.height) * (pattern === 'beam' ? 1.45 : 0.85);
      const endX = x + Math.cos(angle) * len;
      const endY = y + Math.sin(angle) * len;
      const targetDistance = Math.min(len, Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y));
      const markerX = x + Math.cos(angle) * targetDistance;
      const markerY = y + Math.sin(angle) * targetDistance;

      g.lineStyle(pattern === 'beam' ? 12 : 7, danger, 0.2);
      g.lineBetween(x, y, endX, endY);
      g.lineStyle(pattern === 'beam' ? 4 : 3, pattern === 'beam' ? xp : accent, 0.82);
      g.lineBetween(x, y, endX, endY);
      g.fillStyle(danger, 0.1);
      g.fillCircle(markerX, markerY, pattern === 'beam' ? 24 : 18);
      g.lineStyle(2, danger, 0.68);
      g.strokeCircle(markerX, markerY, pattern === 'beam' ? 24 : 18);
    } else if (pattern === 'summon') {
      const radius = Math.max(58, (this.def.boss?.radius ?? 28) * 2.1);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const sx = x + Math.cos(angle) * radius;
        const sy = y + Math.sin(angle) * radius;
        g.fillStyle(accent, 0.12);
        g.fillCircle(sx, sy, 20);
        g.lineStyle(2, accent, 0.72);
        g.strokeCircle(sx, sy, 20);
        g.lineBetween(sx - 12, sy, sx + 12, sy);
        g.lineBetween(sx, sy - 12, sx, sy + 12);
      }
      g.lineStyle(2, danger, 0.38);
      g.strokeCircle(x, y, radius);
    } else {
      const isSpiral = pattern === 'spiral-shot';
      const radius = Math.max(86, (this.def.boss?.radius ?? 28) * (isSpiral ? 3.5 : 3.0));
      const spokes = isSpiral ? 12 : 8;
      g.fillStyle(danger, 0.04);
      g.fillCircle(x, y, radius);
      g.lineStyle(3, danger, 0.52);
      g.strokeCircle(x, y, radius);
      g.lineStyle(2, isSpiral ? xp : accent, 0.74);
      for (let i = 0; i < spokes; i++) {
        const angle = (i / spokes) * Math.PI * 2 + (isSpiral ? 0.34 : 0);
        const inner = this.def.boss?.radius ?? 28;
        g.lineBetween(
          x + Math.cos(angle) * inner,
          y + Math.sin(angle) * inner,
          x + Math.cos(angle) * radius,
          y + Math.sin(angle) * radius,
        );
      }
    }

    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: telegraphMs,
      ease: 'Sine.Out',
      onComplete: () => g.destroy(),
    });
  }

  private bossMinefieldPoints() {
    if (!this.boss) return [];
    const { width, height } = this.scale;
    const angle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
    const side = angle + Math.PI / 2;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:boss-minefield:${this.bossPatternIndex}:${Math.floor(this.elapsed)}`);
    const centerX = clamp((this.boss.x + this.player.x) / 2, 96, width - 96);
    const centerY = clamp((this.boss.y + this.player.y) / 2, 96, height - 96);
    const specs = [
      { forward: 0, lateral: 0, radius: 52 },
      { forward: 92, lateral: -72, radius: 46 },
      { forward: 112, lateral: 76, radius: 46 },
      { forward: -82, lateral: seededRange(seed, 5, 120) - 60, radius: 42 },
      { forward: 32, lateral: seededRange(seed, 9, 150) - 75, radius: 40 },
    ];
    return specs.map((spec, index) => ({
      x: clamp(centerX + Math.cos(angle) * spec.forward + Math.cos(side) * spec.lateral, 72, width - 72),
      y: clamp(centerY + Math.sin(angle) * spec.forward + Math.sin(side) * spec.lateral, 72, height - 72),
      radius: spec.radius + seededRange(seed, 13 + index, 12),
    }));
  }

  private bossLaserGridLanes() {
    if (!this.boss) return [];
    const { width, height } = this.scale;
    const seed = stableHash(`${this.def.title}:${this.def.theme}:boss-laser-grid:${this.bossPatternIndex}:${Math.floor(this.elapsed)}`);
    const playerX = clamp(this.player.x, 96, width - 96);
    const playerY = clamp(this.player.y, 96, height - 96);
    const bossX = clamp(this.boss.x, 96, width - 96);
    const bossY = clamp(this.boss.y, 96, height - 96);
    return [
      { axis: 'vertical' as const, value: playerX },
      { axis: 'vertical' as const, value: clamp(bossX + seededRange(seed, 5, 181) - 90, 96, width - 96) },
      { axis: 'horizontal' as const, value: playerY },
      { axis: 'horizontal' as const, value: clamp(bossY + seededRange(seed, 11, 161) - 80, 96, height - 96) },
    ];
  }

  private executeBossPattern(pattern: Boss['patterns'][number]) {
    if (!this.boss) return;
    this.boss.setData('currentPattern', pattern);
    this.bossTransitionState = `boss-execute-${pattern}`;
    const phase = this.currentBossPhase() ?? 1;
    if (pattern === 'radial-burst') this.fireBossRadial(12 + phase * 2, 180 + phase * 12);
    else if (pattern === 'spiral-shot') this.fireBossRadial(16 + phase * 2, 198 + phase * 14, this.elapsed);
    else if (pattern === 'charge') this.bossCharge();
    else if (pattern === 'summon') this.summonBossAdds();
    else if (pattern === 'beam') this.fireBossBeam();
    else if (pattern === 'minefield') this.deployBossMinefield();
    else if (pattern === 'vortex') this.deployBossVortex();
    else if (pattern === 'shockwave') this.deployBossShockwave();
    else if (pattern === 'laser-grid') this.deployBossLaserGrid();
  }

  private fireBossRadial(count: number, speed: number, offset = 0) {
    if (!this.boss) return;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + offset;
      this.spawnProjectile(this.boss.x, this.boss.y, angle, speed, 'ebullet', this.enemyBullets, 3800);
    }
  }

  private bossCharge() {
    if (!this.boss) return;
    const angle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
    this.boss.setData('charging', true);
    (this.boss.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * 620, Math.sin(angle) * 620);
    this.impactShake(0.004, 120);
    this.time.delayedCall(520, () => this.boss?.setData('charging', false));
  }

  private summonBossAdds() {
    const count = Math.min(3, this.def.enemies.length);
    for (let i = 0; i < count; i++) this.spawnEnemy(this.def.enemies[i]!);
  }

  private fireBossBeam() {
    if (!this.boss) return;
    const angle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
    for (let i = -1; i <= 1; i++) this.spawnProjectile(this.boss.x, this.boss.y, angle + i * 0.08, 320, 'ebullet', this.enemyBullets, 2800);
  }

  private deployBossMinefield() {
    const points = this.bossMinefieldPoints();
    for (const point of points) this.spawnArenaHazard(point.x, point.y, point.radius, false);
    this.flash('Minefield armed');
    this.impactShake(0.0035, 150);
  }

  private deployBossVortex() {
    if (!this.boss) return;
    const phase = this.currentBossPhase() ?? 1;
    const centerX = clamp((this.boss.x + this.player.x) / 2, 74, this.scale.width - 74);
    const centerY = clamp((this.boss.y + this.player.y) / 2, 74, this.scale.height - 74);
    const radius = 104 + phase * 12;
    const pullStrength = 280 + phase * 42;
    const pullToward = (target: ArcadeImage, strength: number) => {
      if (!target.active) return;
      const body = target.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const dist = Phaser.Math.Distance.Between(target.x, target.y, centerX, centerY);
      if (dist > radius * 1.45) return;
      const angle = Phaser.Math.Angle.Between(target.x, target.y, centerX, centerY);
      body.setVelocity(
        body.velocity.x + Math.cos(angle) * strength,
        body.velocity.y + Math.sin(angle) * strength,
      );
    };

    pullToward(this.player, pullStrength);
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (enemy === this.boss) return true;
      pullToward(enemy, pullStrength * 0.68);
      return true;
    });

    const g = this.add.graphics().setDepth(DEPTH.fx + 0.35);
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    g.fillStyle(xp, 0.1).fillCircle(centerX, centerY, radius);
    g.lineStyle(3, xp, 0.72).strokeCircle(centerX, centerY, radius);
    g.lineStyle(2, danger, 0.5).strokeCircle(centerX, centerY, radius * 0.58);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration: 620,
      ease: 'Sine.In',
      onComplete: () => g.destroy(),
    });

    const count = 10 + phase * 2;
    for (let i = 0; i < count; i++) {
      const delay = i * 34;
      this.time.delayedCall(delay, () => {
        const angle = (i / count) * Math.PI * 2 + this.elapsed * 0.42;
        this.spawnProjectile(centerX, centerY, angle, 205 + phase * 16, 'ebullet', this.enemyBullets, 2400);
      });
    }
    this.flash('Vortex pull');
    this.impactShake(0.0045, 180);
  }

  private deployBossShockwave() {
    if (!this.boss) return;
    const phase = this.currentBossPhase() ?? 1;
    const x = this.boss.x;
    const y = this.boss.y;
    const radius = 132 + phase * 18;
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const accent = hex(this.def.palette.accent);

    const pushAway = (target: ArcadeImage, strength: number) => {
      if (!target.active) return;
      const body = target.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const dist = Math.max(1, Phaser.Math.Distance.Between(target.x, target.y, x, y));
      if (dist > radius * 1.55) return;
      const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y);
      const falloff = Phaser.Math.Clamp(1 - dist / (radius * 1.55), 0.18, 1);
      body.setVelocity(
        body.velocity.x + Math.cos(angle) * strength * falloff,
        body.velocity.y + Math.sin(angle) * strength * falloff,
      );
    };

    pushAway(this.player, 460 + phase * 35);
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (enemy === this.boss) return true;
      pushAway(enemy, 230 + phase * 24);
      return true;
    });

    const g = this.add.graphics().setDepth(DEPTH.fx + 0.36);
    g.fillStyle(danger, 0.08).fillCircle(x, y, radius);
    g.lineStyle(4, danger, 0.72).strokeCircle(x, y, radius * 0.42);
    g.lineStyle(3, xp, 0.62).strokeCircle(x, y, radius * 0.72);
    g.lineStyle(2, accent, 0.5).strokeCircle(x, y, radius);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 700,
      ease: 'Sine.Out',
      onComplete: () => g.destroy(),
    });

    const waves = 2 + Math.min(2, phase);
    const count = 10 + phase * 3;
    for (let wave = 0; wave < waves; wave++) {
      this.time.delayedCall(wave * 120, () => {
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + wave * 0.13;
          this.spawnProjectile(x, y, angle, 176 + phase * 18 + wave * 18, 'ebullet', this.enemyBullets, 2100);
        }
      });
    }
    this.flash('Shockwave blast');
    this.impactShake(0.006, 220);
  }

  private deployBossLaserGrid() {
    if (!this.boss) return;
    const phase = this.currentBossPhase() ?? 1;
    const lanes = this.bossLaserGridLanes();
    const { width, height } = this.scale;
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);

    const g = this.add.graphics().setDepth(DEPTH.fx + 0.38);
    for (const lane of lanes) {
      if (lane.axis === 'vertical') {
        g.lineStyle(10, danger, 0.24);
        g.lineBetween(lane.value, 36, lane.value, height - 36);
        g.lineStyle(3, xp, 0.76);
        g.lineBetween(lane.value, 52, lane.value, height - 52);
      } else {
        g.lineStyle(10, danger, 0.24);
        g.lineBetween(36, lane.value, width - 36, lane.value);
        g.lineStyle(3, xp, 0.76);
        g.lineBetween(52, lane.value, width - 52, lane.value);
      }
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 520,
      ease: 'Sine.In',
      onComplete: () => g.destroy(),
    });

    const offsets = [-16, 0, 16];
    const speed = 240 + phase * 28;
    lanes.forEach((lane, laneIndex) => {
      offsets.forEach((offset, offsetIndex) => {
        const delay = laneIndex * 48 + offsetIndex * 24;
        this.time.delayedCall(delay, () => {
          if (lane.axis === 'vertical') {
            const x = clamp(lane.value + offset, 34, width - 34);
            this.spawnProjectile(x, 36, Math.PI / 2, speed, 'ebullet', this.enemyBullets, 2900);
            this.spawnProjectile(x, height - 36, -Math.PI / 2, speed, 'ebullet', this.enemyBullets, 2900);
          } else {
            const y = clamp(lane.value + offset, 34, height - 34);
            this.spawnProjectile(36, y, 0, speed, 'ebullet', this.enemyBullets, 2900);
            this.spawnProjectile(width - 36, y, Math.PI, speed, 'ebullet', this.enemyBullets, 2900);
          }
        });
      });
    });

    const burstCount = 8 + phase * 2;
    this.time.delayedCall(180, () => {
      if (!this.boss?.active) return;
      for (let i = 0; i < burstCount; i++) {
        const angle = (i / burstCount) * Math.PI * 2 + 0.18;
        this.spawnProjectile(this.boss.x, this.boss.y, angle, 180 + phase * 14, 'ebullet', this.enemyBullets, 2100);
      }
    });
    this.flash('Laser grid online');
    this.impactShake(0.0052, 190);
  }

  private fireVolatileDeathBurst(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.spawnProjectile(x, y, angle, 190, 'ebullet', this.enemyBullets, 1100);
    }
  }

  private visualEvidenceModeActive(time = this.time.now) {
    return time < this.visualEvidenceModeUntil;
  }

  private quietOverlayAlpha(base: number) {
    const quietTemplate = isQuietLiteralBackdropTemplate(this.def);
    return quietTemplate ? base * (hasLiteralBackdrop(this.def) ? 0.12 : 0.45) : base;
  }

  private usesQuietLiteralBackdrop() {
    const quietTemplate = isQuietLiteralBackdropTemplate(this.def);
    return quietTemplate && (hasLiteralBackdrop(this.def) || Boolean(this.backdropTextureKey));
  }

  private applyVisualEvidenceLayerMask(active: boolean) {
    const shouldMask = active && this.usesQuietLiteralBackdrop() && !this.isPuzzleRoom();
    if (!shouldMask) {
      for (const [object, state] of this.visualEvidenceMaskedObjects) {
        const target = object as Phaser.GameObjects.GameObject & {
          setAlpha?: (alpha: number) => unknown;
          setVisible?: (visible: boolean) => unknown;
        };
        if (state.alpha !== undefined) target.setAlpha?.(state.alpha);
        if (state.visible !== undefined) target.setVisible?.(state.visible);
      }
      this.visualEvidenceMaskedObjects.clear();
      return;
    }

    for (const object of this.children.list) {
      const target = object as Phaser.GameObjects.GameObject & {
        alpha?: number;
        depth?: number;
        visible?: boolean;
        setAlpha?: (alpha: number) => unknown;
        setVisible?: (visible: boolean) => unknown;
      };
      const depth = typeof target.depth === 'number' ? target.depth : null;
      if (depth === null) continue;
      const isDecorLayer = depth >= DEPTH.decor && depth < DEPTH.orb;
      const isForegroundLayer = depth >= DEPTH.foreground && depth < DEPTH.fx;
      if (!isDecorLayer && !isForegroundLayer) continue;
      if (!this.visualEvidenceMaskedObjects.has(object)) {
        this.visualEvidenceMaskedObjects.set(object, {
          alpha: typeof target.alpha === 'number' ? target.alpha : undefined,
          visible: typeof target.visible === 'boolean' ? target.visible : undefined,
        });
      }
      target.setAlpha?.(0);
      target.setVisible?.(false);
    }
  }

  private applyVisualEvidencePresentation(time: number) {
    const active = this.visualEvidenceModeActive(time);
    const literalEvidence = active && hasLiteralBackdrop(this.def);
    const coastalBossEvidence = literalEvidence && arenaMood(this.def) === 'coast' && this.def.winCondition === 'defeat-boss';
    const platformerEvidence = literalEvidence && this.isPlatformer();
    const flightEvidence = literalEvidence && this.isFlightShooter();
    const shockwaveEvidence = literalEvidence && arenaMood(this.def) === 'seismic' && this.def.winCondition === 'defeat-boss';
    const bossEvidence = active && this.def.winCondition === 'defeat-boss' && Boolean(this.boss?.active);
    this.applyVisualEvidenceLayerMask(active);
    this.playerActorLayer?.setAlpha(coastalBossEvidence || platformerEvidence || flightEvidence || shockwaveEvidence ? 0 : 1);
    this.playerRigLayer?.setAlpha(coastalBossEvidence || platformerEvidence || flightEvidence || shockwaveEvidence ? 0 : 1);
    this.hpBar?.setAlpha(coastalBossEvidence ? 0.86 : active ? 0 : 1);
    this.bossBar?.setAlpha(coastalBossEvidence || bossEvidence ? 1 : active ? 0 : 1);
    this.bossThreatText?.setAlpha(bossEvidence || !active ? 1 : 0);
    this.bossThreatMetaText?.setAlpha(bossEvidence || !active ? 1 : 0);
    this.impactFrame?.setAlpha(active ? 0 : 1);
    this.hpText?.setAlpha(active ? 0 : 1);
    this.comboText?.setAlpha(active ? 0 : this.comboText.text ? this.comboText.alpha : 1);
    this.infoText?.setAlpha(active ? 0 : 1);
    this.helpText?.setAlpha(active ? 0 : 0.58);
    this.encounterPlate?.container.setVisible(!active).setAlpha(active ? 0 : 1);
    this.tacticalRadar?.container.setVisible(!active).setAlpha(active ? 0 : 0.48);
    if (this.directorFeed) {
      const showFeed = !active && this.directorEvents.length > 0;
      this.directorFeed.container.setVisible(showFeed).setAlpha(showFeed ? 0.54 : 0);
    }
    this.cameraDirectorLayer?.graphics.setAlpha(active ? 0 : this.quietOverlayAlpha(0.88));
    this.profileFrameLayer?.pulse.setAlpha(active ? 0 : this.quietOverlayAlpha(0.85));
    this.profileFrameLayer?.accents.forEach((accent) => {
      const target = accent as Phaser.GameObjects.GameObject & { setAlpha?: (alpha: number) => unknown };
      target.setAlpha?.(active ? 0 : this.quietOverlayAlpha(0.82));
    });
    this.platformerLayer?.setAlpha(platformerEvidence ? 0.82 : literalEvidence ? 0 : 1);
    this.platformerEdgeLayer?.setAlpha(platformerEvidence ? 1 : literalEvidence ? 0 : 1);
    this.platformSolids.forEach((solid) => {
      solid.setAlpha(platformerEvidence ? 0.95 : literalEvidence ? 0 : 1);
    });
    if (active && (coastalBossEvidence || (this.def.winCondition === 'escort' && this.usesCuratedEscortSprite()))) {
      this.hideObjectiveGuide();
    }
    if (active) {
      this.applyVisualEvidenceActorEmphasis();
    } else {
      this.coastalBossEvidenceLayer?.clear().setVisible(false);
      this.coastalBossEvidenceForeground?.setVisible(false);
      this.escortEvidenceLayer?.clear().setVisible(false);
      this.platformerEvidenceLayer?.clear().setVisible(false);
      this.platformerEvidenceForeground?.setVisible(false);
      this.flightEvidenceForeground?.setVisible(false);
      this.shockwaveEvidenceForeground?.setVisible(false);
    }
  }

  private applyVisualEvidenceActorEmphasis() {
    const literalEvidence = hasLiteralBackdrop(this.def);
    const coastalBossEvidence = literalEvidence && arenaMood(this.def) === 'coast' && this.def.winCondition === 'defeat-boss';
    const platformerEvidence = literalEvidence && this.isPlatformer();
    const flightEvidence = literalEvidence && this.isFlightShooter();
    const shockwaveEvidence = literalEvidence && arenaMood(this.def) === 'seismic' && this.def.winCondition === 'defeat-boss';
    const escortEvidence = literalEvidence && this.def.winCondition === 'escort' && Boolean(this.escortAlly?.active);
    const curatedEscort = this.usesCuratedEscortSprite();
    const playerScale = this.isPlatformer() ? (literalEvidence ? 2.48 : 1.95) : this.isPuzzleRoom() ? 1.76 : 1.72;
    this.player
      ?.setAlpha(coastalBossEvidence || platformerEvidence || flightEvidence || shockwaveEvidence ? 0 : escortEvidence ? curatedEscort ? 0 : 0.18 : 1)
      .setDepth(DEPTH.player + 0.8)
      .setScale(coastalBossEvidence ? 2.05 : playerScale)
      .setTint(hex(coastalBossEvidence ? this.def.palette.projectile : this.def.palette.player));
    const playerShadow = this.player?.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
    playerShadow?.setAlpha(coastalBossEvidence || platformerEvidence || flightEvidence || shockwaveEvidence ? 0 : escortEvidence ? curatedEscort ? 0 : 0.1 : 0.34);
    if (coastalBossEvidence || flightEvidence || shockwaveEvidence) {
      this.bullets.children.each((child) => {
        (child as Phaser.GameObjects.GameObject & { setAlpha?: (alpha: number) => unknown }).setAlpha?.(0);
        return true;
      });
      this.enemyBullets.children.each((child) => {
        (child as Phaser.GameObjects.GameObject & { setAlpha?: (alpha: number) => unknown }).setAlpha?.(0);
        return true;
      });
      this.orbs.children.each((child) => {
        (child as Phaser.GameObjects.GameObject & { setAlpha?: (alpha: number) => unknown }).setAlpha?.(0);
        return true;
      });
      if (coastalBossEvidence) this.drawCoastalBossEvidenceLayer();
      else {
        this.coastalBossEvidenceLayer?.clear().setVisible(false);
        this.coastalBossEvidenceForeground?.setVisible(false);
      }
      if (flightEvidence) this.drawFlightEvidenceLayer();
      else this.flightEvidenceForeground?.setVisible(false);
      if (shockwaveEvidence) this.drawShockwaveEvidenceLayer();
      else this.shockwaveEvidenceForeground?.setVisible(false);
    } else {
      this.coastalBossEvidenceLayer?.clear().setVisible(false);
      this.coastalBossEvidenceForeground?.setVisible(false);
      this.flightEvidenceForeground?.setVisible(false);
      this.shockwaveEvidenceForeground?.setVisible(false);
    }
    if (platformerEvidence) this.drawPlatformerEvidenceLayer();
    else {
      this.platformerEvidenceLayer?.clear().setVisible(false);
      this.platformerEvidenceForeground?.setVisible(false);
    }
    if (this.escortAlly?.active) {
      const escortShadow = this.escortAlly.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
      this.escortAlly
        .setAlpha(literalEvidence ? curatedEscort ? 1 : 0.16 : 1)
        .setDepth(DEPTH.player + 0.75)
        .setScale(curatedEscort ? literalEvidence ? 1.24 : 1.08 : literalEvidence ? 2.55 : 1.9);
      if (curatedEscort) this.escortAlly.clearTint();
      else this.escortAlly.setTint(hex(this.def.palette.xp));
      escortShadow?.setAlpha(literalEvidence ? curatedEscort ? 0.24 : 0.08 : 0.36).setScale(curatedEscort ? 2.2 : 1.9, curatedEscort ? 1.22 : 1.28);
      if (this.escortRoute) {
        this.escortRoute.line.setAlpha(1);
        this.escortRoute.progressLine.setAlpha(1);
        this.escortRoute.goal.setAlpha(curatedEscort ? 0 : 1).setScale(1.22);
        this.escortRoute.label.setVisible(false).setAlpha(0);
        this.escortRoute.beacons.forEach((beacon) => beacon.setAlpha(curatedEscort ? 0 : Math.max(beacon.alpha, 0.54)));
      }
      if (escortEvidence) this.drawEscortEvidenceLayer();
    }
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const isBoss = enemy.getData('boss') === true;
      const shadow = enemy.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
      const aura = enemy.getData('eliteAura') as EliteAura | undefined;
      if (escortEvidence && curatedEscort) {
        enemy.setAlpha(0).setDepth(DEPTH.enemy);
        shadow?.setAlpha(0);
        aura?.ring.setAlpha(0);
        aura?.pip.setAlpha(0);
        return true;
      }
      if (coastalBossEvidence || flightEvidence || shockwaveEvidence) {
        enemy.setAlpha(0).setDepth(DEPTH.enemy);
        shadow?.setAlpha(0);
        aura?.ring.setAlpha(0);
        aura?.pip.setAlpha(0);
        return true;
      }
      const bossScale = literalEvidence
        ? (this.isPlatformer() ? 2.18 : 1.12)
        : (this.isPlatformer() ? 2.65 : 2.45);
      enemy
        .setAlpha(platformerEvidence ? 0 : isBoss && literalEvidence ? 0.36 : 1)
        .setDepth(isBoss ? DEPTH.player + 0.7 : DEPTH.player + 0.45)
        .setScale(isBoss ? bossScale : this.isPlatformer() && literalEvidence ? 2.08 : 1.72);
      shadow?.setAlpha(isBoss && literalEvidence ? this.isPlatformer() ? 0.28 : 0.12 : isBoss ? 0.42 : 0.26);
      aura?.ring.setAlpha(1);
      aura?.pip.setAlpha(1);
      if (isBoss) enemy.clearTint();
      else enemy.setTint(hex(this.def.palette.xp));
      return true;
    });
  }

  private drawCoastalBossEvidenceLayer() {
    const foregroundKey = 'coastal-charge-foreground';
    if (this.textures.exists(foregroundKey)) {
      this.coastalBossEvidenceLayer?.clear().setVisible(false);
      const foreground = this.coastalBossEvidenceForeground ?? this.add.image(this.scale.width / 2, this.scale.height / 2, foregroundKey).setOrigin(0.5).setDepth(DEPTH.player + 0.99);
      this.coastalBossEvidenceForeground = foreground;
      foreground
        .setVisible(true)
        .setAlpha(0.9)
        .setPosition(this.scale.width / 2, this.scale.height / 2)
        .setDisplaySize(this.scale.width, this.scale.height);
      return;
    }
    this.coastalBossEvidenceForeground?.setVisible(false);

    const g = this.coastalBossEvidenceLayer ?? this.add.graphics().setDepth(DEPTH.player + 0.95);
    this.coastalBossEvidenceLayer = g;
    g.clear().setVisible(true);

    const w = this.scale.width;
    const h = this.scale.height;
    const xp = hex(this.def.palette.xp);
    const projectile = hex(this.def.palette.projectile);
    const phase = this.time.now * 0.001;
    const bossHeadX = w * 0.62;
    const bossHeadY = h * 0.31;
    const bossBodyX = w * 0.77;
    const bossBodyY = h * 0.27;

    g.lineStyle(3, projectile, 0.28);
    g.strokeEllipse(bossHeadX + 8, bossHeadY + 4, 188, 118);
    g.lineStyle(2, 0xffffff, 0.16);
    g.strokeEllipse(bossBodyX, bossBodyY + 6, 288, 154);
    g.lineStyle(2, xp, 0.26);
    g.lineBetween(bossHeadX - 72, bossHeadY - 34, bossHeadX + 38, bossHeadY - 78);
    g.lineBetween(bossHeadX - 54, bossHeadY + 48, bossHeadX + 72, bossHeadY + 86);
    g.fillStyle(projectile, 0.62 + Math.sin(phase * 5) * 0.12);
    g.fillCircle(bossHeadX - 18, bossHeadY - 2, 6);
  }

  private drawPlatformerEvidenceLayer() {
    const g = this.platformerEvidenceLayer ?? this.add.graphics().setDepth(DEPTH.player + 0.98);
    this.platformerEvidenceLayer = g;
    g.clear().setVisible(true);

    const foregroundKey = 'platformer-foreground';
    if (this.textures.exists(foregroundKey)) {
      const foreground = this.platformerEvidenceForeground ?? this.add.image(this.scale.width / 2, this.scale.height / 2, foregroundKey).setOrigin(0.5).setDepth(DEPTH.player + 0.99);
      this.platformerEvidenceForeground = foreground;
      foreground
        .setVisible(true)
        .setAlpha(1)
        .setPosition(this.scale.width / 2, this.scale.height / 2)
        .setDisplaySize(this.scale.width, this.scale.height);
      return;
    }
    this.platformerEvidenceForeground?.setVisible(false);

    const accent = hex(this.def.palette.accent);
    const player = hex(this.def.palette.player);
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const projectile = hex(this.def.palette.projectile);
    const phase = this.time.now * 0.001;

    const drawHero = (x: number, y: number) => {
      g.fillStyle(0x000000, 0.34).fillEllipse(x, y + 34, 74, 18);
      g.lineStyle(5, 0xffffff, 0.68).strokeCircle(x, y - 30, 22).strokeRoundedRect(x - 22, y - 12, 44, 58, 13);
      g.fillStyle(player, 0.98).fillCircle(x, y - 30, 20).fillRoundedRect(x - 20, y - 10, 40, 54, 12);
      g.lineStyle(6, projectile, 0.78);
      g.lineBetween(x - 20, y + 22, x - 44, y + 52);
      g.lineBetween(x + 20, y + 22, x + 44, y + 52);
      g.lineStyle(4, xp, 0.82);
      g.lineBetween(x - 18, y + 4, x - 48, y + 12);
      g.lineBetween(x + 18, y + 4, x + 46, y - 2);
      g.fillStyle(0xffffff, 0.86).fillCircle(x + 8, y - 36, 5);
    };

    const drawMonster = (x: number, y: number, index: number) => {
      const bob = Math.sin(phase * 4 + index) * 3;
      g.fillStyle(0x000000, 0.3).fillEllipse(x, y + 28, 66, 18);
      g.lineStyle(4, 0xffffff, 0.5).strokeRoundedRect(x - 30, y - 28 + bob, 60, 58, 16);
      g.fillStyle(index % 2 === 0 ? danger : accent, 0.96).fillRoundedRect(x - 28, y - 26 + bob, 56, 54, 15);
      g.fillStyle(0x14100d, 0.92).fillTriangle(x - 24, y - 20 + bob, x - 44, y - 48 + bob, x - 10, y - 30 + bob);
      g.fillTriangle(x + 24, y - 20 + bob, x + 44, y - 48 + bob, x + 10, y - 30 + bob);
      g.fillStyle(0xffffff, 0.88).fillCircle(x - 10, y - 4 + bob, 5).fillCircle(x + 12, y - 4 + bob, 5);
      g.lineStyle(5, xp, 0.72);
      g.lineBetween(x - 18, y + 24 + bob, x - 36, y + 46 + bob);
      g.lineBetween(x + 18, y + 24 + bob, x + 36, y + 46 + bob);
    };

    const drawBoss = (x: number, y: number) => {
      const pulse = Math.sin(phase * 5) * 0.04;
      g.fillStyle(0x000000, 0.36).fillEllipse(x, y + 58, 174, 34);
      g.lineStyle(7, 0xffffff, 0.54).strokeRoundedRect(x - 66, y - 86, 132, 138, 24);
      g.fillStyle(danger, 0.94).fillRoundedRect(x - 62, y - 82, 124, 132, 22);
      g.fillStyle(0x27191a, 0.9).fillRoundedRect(x - 40, y - 48, 80, 58, 14);
      g.lineStyle(5, projectile, 0.74).strokeCircle(x - 32, y - 8, 20 + pulse * 40).strokeCircle(x + 34, y - 8, 24 - pulse * 35);
      g.lineStyle(7, xp, 0.78);
      g.lineBetween(x - 54, y + 30, x - 92, y + 78);
      g.lineBetween(x + 54, y + 30, x + 92, y + 78);
      g.lineStyle(6, 0xffffff, 0.5);
      g.lineBetween(x - 50, y - 56, x - 92, y - 100);
      g.lineBetween(x + 50, y - 56, x + 92, y - 100);
      g.fillStyle(0xffffff, 0.9).fillCircle(x + 24, y - 58, 8);
    };

    if (this.player?.active) drawHero(this.player.x, this.player.y - 14);
    let index = 0;
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active || enemy.getData('boss') === true || index >= 2) return true;
      drawMonster(enemy.x, enemy.y - 8, index);
      index++;
      return true;
    });
    if (this.boss?.active) drawBoss(this.boss.x, this.boss.y - 4);
  }

  private drawFlightEvidenceLayer() {
    const foregroundKey = 'flight-foreground';
    if (!this.textures.exists(foregroundKey)) {
      this.flightEvidenceForeground?.setVisible(false);
      return;
    }
    const foreground = this.flightEvidenceForeground ?? this.add.image(this.scale.width / 2, this.scale.height / 2, foregroundKey).setOrigin(0.5).setDepth(DEPTH.player + 0.99);
    this.flightEvidenceForeground = foreground;
    foreground
      .setVisible(true)
      .setAlpha(0.94)
      .setPosition(this.scale.width / 2, this.scale.height / 2)
      .setDisplaySize(this.scale.width, this.scale.height);
  }

  private drawShockwaveEvidenceLayer() {
    const foregroundKey = 'shockwave-foreground';
    if (!this.textures.exists(foregroundKey)) {
      this.shockwaveEvidenceForeground?.setVisible(false);
      return;
    }
    const foreground = this.shockwaveEvidenceForeground ?? this.add.image(this.scale.width / 2, this.scale.height / 2, foregroundKey).setOrigin(0.5).setDepth(DEPTH.player + 0.99);
    this.shockwaveEvidenceForeground = foreground;
    foreground
      .setVisible(true)
      .setAlpha(0.86)
      .setPosition(this.scale.width / 2, this.scale.height / 2)
      .setDisplaySize(this.scale.width, this.scale.height);
  }

  private drawEscortEvidenceLayer() {
    const ally = this.escortAlly;
    if (!ally?.active) {
      this.escortEvidenceLayer?.clear().setVisible(false);
      return;
    }
    const g = this.escortEvidenceLayer ?? this.add.graphics().setDepth(DEPTH.player + 0.95);
    this.escortEvidenceLayer = g;
    g.clear().setVisible(true);

    const xp = hex(this.def.palette.xp);
    const accent = hex(this.def.palette.accent);
    const player = hex(this.def.palette.player);
    const x = ally.x;
    const y = ally.y;
    const backdropCaravan = this.usesQuietLiteralBackdrop() && arenaMood(this.def) === 'coast';
    if (this.usesCuratedEscortSprite()) {
      g.clear().setVisible(false);
      return;
    }
    if (!backdropCaravan) {
      g.fillStyle(0x000000, 0.24).fillEllipse(x, y + 23, 112, 30);
      g.fillStyle(0x1f252f, 0.98).fillRoundedRect(x - 48, y - 20, 96, 44, 10);
      g.lineStyle(4, 0xffffff, 0.34).strokeRoundedRect(x - 48, y - 20, 96, 44, 10);
      g.fillStyle(xp, 0.86).fillRoundedRect(x - 36, y - 32, 72, 20, 8);
      g.lineStyle(2, 0xffffff, 0.34).strokeRoundedRect(x - 36, y - 32, 72, 20, 8);
      g.fillStyle(0x10141c, 1).fillCircle(x - 32, y + 27, 11).fillCircle(x + 32, y + 27, 11);
      g.fillStyle(0xffffff, 0.85).fillCircle(x - 32, y + 27, 4).fillCircle(x + 32, y + 27, 4);
      g.fillStyle(0xffffff, 0.9).fillCircle(x, y - 1, 10);
      g.fillStyle(accent, 0.92).fillRoundedRect(x - 9, y + 9, 18, 16, 5);
      g.lineStyle(3, 0xffffff, 0.38).lineBetween(x - 44, y + 2, x + 44, y + 2);
    }

    const guardX = this.player?.x ?? x - 58;
    const guardY = this.player?.y ?? y + 42;
    g.fillStyle(0x000000, backdropCaravan ? 0.12 : 0.2).fillEllipse(guardX, guardY + 22, 46, 14);
    g.fillStyle(player, backdropCaravan ? 0.82 : 0.96).fillCircle(guardX, guardY - 10, 10);
    g.fillStyle(player, backdropCaravan ? 0.82 : 0.96).fillRoundedRect(guardX - 13, guardY, 26, 31, 8);
    g.lineStyle(4, 0xffffff, backdropCaravan ? 0.24 : 0.36).strokeCircle(guardX, guardY - 10, 11).strokeRoundedRect(guardX - 13, guardY, 26, 31, 8);
    if (!backdropCaravan) g.lineStyle(4, xp, 0.88).lineBetween(guardX + 14, guardY + 10, x - 42, y + 8);
  }

  private updateHud() {
    if (this.combo > 0 && this.time.now > this.comboExpiresAt) this.combo = 0;
    const hpRatio = Math.max(0, this.hp / this.maxHp);
    const dashReady = this.time.now - this.lastDashAt >= this.def.player.dashCooldownMs;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.28).fillRect(16, 12, 158, 6);
    this.hpBar.fillStyle(hex(this.def.palette.danger), 0.92).fillRect(16, 12, 158 * hpRatio, 6);
    this.hpText.setText(`${Math.ceil(this.hp)} HP · Lv ${this.level} · ${dashReady ? 'Dash ready' : 'Dash cooling'}`);
    if (this.combo > 1) {
      const remaining = Math.max(0, (this.comboExpiresAt - this.time.now) / 1000);
      this.comboText.setText(`Combo x${this.combo} · ${this.comboMultiplier().toFixed(2)}x · ${remaining.toFixed(1)}s`);
      this.comboText.setAlpha(0.72 + Math.sin(this.time.now * 0.014) * 0.2);
    } else {
      this.comboText.setText('');
    }

    this.infoText.setText(this.objectiveHudText());
    this.updateEncounterPlate(this.time.now);
    this.updateTacticalRadar(this.time.now);
    this.updateDirectorFeed(this.time.now);
    this.updateImpactBeat(this.time.now);

    this.bossBar.clear();
    if (this.boss?.active) {
      const hp = this.boss.getData('hp') as number;
      const maxHp = this.boss.getData('maxHp') as number;
      const pattern = this.currentBossPattern();
      const phase = this.currentBossPhase() ?? 1;
      const bossName = this.def.boss?.name ?? 'Boss';
      const w = Math.min(440, this.scale.width - 40);
      const h = 52;
      const x = this.scale.width / 2 - w / 2;
      const y = 38;
      const hpRatio = Math.max(0, hp / maxHp);
      const pulse = 0.55 + Math.sin(this.time.now * 0.006) * 0.1;
      const compact = w < 390;
      this.bossBar
        .fillStyle(0x05070b, 0.72)
        .fillRoundedRect(x, y, w, h, 7)
        .lineStyle(2, hex(this.def.palette.danger), 0.5 + pulse * 0.2)
        .strokeRoundedRect(x, y, w, h, 7)
        .fillStyle(hex(this.def.palette.danger), 0.16)
        .fillRoundedRect(x + 8, y + 7, 88, 18, 5)
        .fillStyle(hex(this.def.palette.accent), 0.1)
        .fillRoundedRect(x + w - 96, y + 7, 88, 18, 5)
        .fillStyle(0x000000, 0.34)
        .fillRoundedRect(x + 14, y + h - 11, w - 28, 6, 2)
        .fillStyle(hex(this.def.palette.danger), 0.95)
        .fillRoundedRect(x + 14, y + h - 11, (w - 28) * hpRatio, 6, 2)
        .fillStyle(0xffffff, 0.18)
        .fillRect(x + 14, y + h - 11, 2, 6)
        .fillRect(x + w - 16, y + h - 11, 2, 6);
      this.bossThreatText
        .setFontSize(compact ? 12 : 14)
        .setText(`RAID BOSS | ${truncateText(bossName.toUpperCase(), compact ? 12 : 16)}`)
        .setPosition(this.scale.width / 2, y + 14)
        .setColor('#ffffff')
        .setVisible(true)
        .setAlpha(1);
      this.bossThreatMetaText
        .setFontSize(compact ? 10 : 11)
        .setText(`${bossPatternLabel(pattern)} PRESSURE | PHASE ${phase} | HP ${Math.ceil(hp)}`)
        .setPosition(this.scale.width / 2, y + 30)
        .setColor(phase >= 3 ? this.def.palette.danger : this.def.palette.xp)
        .setVisible(true)
        .setAlpha(1);
    } else {
      this.bossThreatText?.setVisible(false).setAlpha(0);
      this.bossThreatMetaText?.setVisible(false).setAlpha(0);
    }
    this.applyVisualEvidencePresentation(this.time.now);
  }

  private showPauseOverlay() {
    if (this.pauseOverlay) return;
    const dim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.52).setOrigin(0, 0);
    const label = this.add.text(this.scale.width / 2, this.scale.height / 2 - 16, 'Paused', {
      ...TEXT,
      fontSize: '38px',
      align: 'center',
    }).setOrigin(0.5);
    const hint = this.add.text(this.scale.width / 2, this.scale.height / 2 + 34, 'P / Esc resumes · R restarts', {
      ...TEXT,
      fontSize: '14px',
      color: '#d8dde8',
      align: 'center',
    }).setOrigin(0.5);
    this.pauseOverlay = this.add.container(0, 0, [dim, label, hint]).setScrollFactor(0).setDepth(DEPTH.overlay);
  }

  private flash(msg: string) {
    const t = this.add.text(this.scale.width / 2, 82, msg, {
      ...TEXT,
      fontSize: '16px',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this.tweens.add({ targets: t, y: 60, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  private setupDirectorFeed() {
    const width = 196;
    const height = 54;
    const panel = this.add.rectangle(0, 0, width, height, 0x05070b, 0.28)
      .setOrigin(0, 0)
      .setStrokeStyle(1, hex(this.def.palette.accent), 0.18);
    const title = this.add.text(10, 8, 'DIRECTOR', {
      ...TEXT,
      fontSize: '9px',
      fontStyle: '800',
      color: this.def.palette.xp,
    }).setOrigin(0, 0.5);
    const lines = Array.from({ length: 2 }, (_value, index) =>
      this.add.text(20, 25 + index * 16, '', {
        ...TEXT,
        fontSize: '10px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#05070b',
        strokeThickness: 2,
      }).setOrigin(0, 0.5),
    );
    const bars = Array.from({ length: 2 }, (_value, index) =>
      this.add.rectangle(10, 25 + index * 16, 4, 10, hex(this.def.palette.accent), 0.66)
        .setOrigin(0, 0.5),
    );
    const container = this.add.container(16, 52, [panel, title, ...bars, ...lines])
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 0.28)
      .setVisible(false)
      .setAlpha(0);
    this.directorFeed = { container, panel, title, lines, bars };
  }

  private addDirectorEvent(text: string, color: string, ttlMs = 4800) {
    const now = this.time.now;
    this.directorEventSerial += 1;
    this.directorEvents.unshift({
      id: this.directorEventSerial,
      text: truncateText(text, 34),
      color,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
    this.directorEvents = this.directorEvents.slice(0, 4);
    this.updateDirectorFeed(now);
  }

  private profilePhaseForElapsed() {
    const horizon = Math.max(45, this.def.arena.durationSeconds || 90);
    const progress = clamp(this.elapsed / horizon, 0, 1);
    const profile = this.feelProfile();
    if (profile === 'bullet-hell-raid') {
      if (progress < 0.25) return 'raid-open';
      if (progress < 0.62) return 'crossfire';
      return 'boss-lock';
    }
    if (profile === 'siege-defense') {
      if (progress < 0.28) return 'fortify';
      if (progress < 0.68) return 'breach-risk';
      return 'last-stand';
    }
    if (profile === 'cozy-explorer') {
      if (progress < 0.34) return 'forage';
      if (progress < 0.72) return 'route-open';
      return 'home-stretch';
    }
    if (profile === 'score-chaser') {
      if (progress < 0.3) return 'warm-combo';
      if (progress < 0.7) return 'bonus-lane';
      return 'overtime';
    }
    if (progress < 0.34) return 'opening-wave';
    if (progress < 0.72) return 'arena-surge';
    return 'final-push';
  }

  private profileDirectorCopy(phase: string) {
    const copy: Record<string, string> = {
      'raid-open': 'Raid vectors online',
      crossfire: 'Crossfire lanes active',
      'boss-lock': 'Boss pressure rising',
      fortify: 'Fortify the pocket',
      'breach-risk': 'Breach risk climbing',
      'last-stand': 'Hold the line',
      forage: 'Supply route opening',
      'route-open': 'Safe route marked',
      'home-stretch': 'Home stretch',
      'warm-combo': 'Combo lane warming',
      'bonus-lane': 'Bonus lane hot',
      overtime: 'Overtime scoring',
      'opening-wave': 'Opening wave',
      'arena-surge': 'Arena surge',
      'final-push': 'Final push',
    };
    return copy[phase] ?? 'Profile shift';
  }

  private updateProfileDirector(time: number, emitOnChange = true) {
    const phase = this.profilePhaseForElapsed();
    if (phase === this.profileDirectorPhase) return;
    this.profileDirectorPhase = phase;
    if (emitOnChange && this.elapsed > 1.2) {
      const color = this.feelProfile() === 'siege-defense' ? this.def.palette.danger : this.def.palette.xp;
      this.addDirectorEvent(this.profileDirectorCopy(phase), color, 5200);
      this.pulse(this.scale.width / 2, this.scale.height / 2, color, 96);
      if (this.feelProfile() === 'bullet-hell-raid' || this.feelProfile() === 'score-chaser') {
        this.cameras.main.shake(Math.round(70 * this.cameraShakeScale()), 0.0018);
      }
    }
    this.updateDirectorFeed(time);
  }

  private updateDirectorFeed(time: number) {
    const feed = this.directorFeed;
    if (!feed) return;
    this.directorEvents = this.directorEvents.filter((entry) => time <= entry.expiresAt);
    const visible = this.directorEvents.length > 0;
    feed.container.setVisible(visible).setAlpha(visible ? 0.54 : 0);
    if (!visible) return;

    const latestColor = hex(this.directorEvents[0]?.color ?? this.def.palette.accent);
    feed.panel.setStrokeStyle(1, latestColor, 0.28 + Math.sin(time * 0.006) * 0.08);
    feed.lines.forEach((line, index) => {
      const entry = this.directorEvents[index];
      if (!entry) {
        line.setText('').setAlpha(0);
        feed.bars[index]?.setAlpha(0);
        return;
      }
      const age = time - entry.createdAt;
      const alpha = clamp(1 - Math.max(0, age - 3200) / 1600, 0.22, 1);
      line
        .setText(entry.text)
        .setColor(entry.color)
        .setAlpha(alpha);
      feed.bars[index]
        ?.setFillStyle(hex(entry.color), index === 0 ? 0.86 : 0.5)
        .setAlpha(alpha);
    });
  }

  private triggerImpactBeat(color: string, strength = 0.5, durationMs = 260) {
    this.impactBeatCount += 1;
    this.impactBeatColor = color;
    this.impactBeatStrength = clamp(strength * this.readabilityFxScale(), 0.18, 1);
    this.impactBeatUntil = Math.max(this.impactBeatUntil, this.time.now + durationMs);
    this.updateImpactBeat(this.time.now);
  }

  private updateImpactBeat(time: number) {
    this.impactFrame.clear();
    if (time >= this.impactBeatUntil) return;
    const remaining = clamp((this.impactBeatUntil - time) / 360, 0, 1);
    const alpha = remaining * (0.1 + this.impactBeatStrength * 0.22);
    const color = hex(this.impactBeatColor);
    const inset = 8 + (1 - remaining) * 16;
    const width = this.scale.width;
    const height = this.scale.height;
    const corner = 58 + this.impactBeatStrength * 34;

    this.impactFrame.lineStyle(3, color, alpha);
    this.impactFrame.lineBetween(inset, inset, inset + corner, inset);
    this.impactFrame.lineBetween(inset, inset, inset, inset + corner);
    this.impactFrame.lineBetween(width - inset, inset, width - inset - corner, inset);
    this.impactFrame.lineBetween(width - inset, inset, width - inset, inset + corner);
    this.impactFrame.lineBetween(inset, height - inset, inset + corner, height - inset);
    this.impactFrame.lineBetween(inset, height - inset, inset, height - inset - corner);
    this.impactFrame.lineBetween(width - inset, height - inset, width - inset - corner, height - inset);
    this.impactFrame.lineBetween(width - inset, height - inset, width - inset, height - inset - corner);
    this.impactFrame.fillStyle(color, alpha * 0.08);
    this.impactFrame.fillRect(0, 0, width, 22 + this.impactBeatStrength * 12);
    this.impactFrame.fillRect(0, height - (22 + this.impactBeatStrength * 12), width, 22 + this.impactBeatStrength * 12);
  }

  private setupEncounterPlate() {
    const width = clamp(Math.round(this.scale.width * 0.32), 248, 330);
    const height = 42;
    const x = this.scale.width / 2;
    const y = 34;
    const panel = this.add.rectangle(0, 0, width, height, 0x05070b, 0.34)
      .setStrokeStyle(1, hex(this.def.palette.accent), 0.22);
    const accent = this.add.rectangle(-width / 2, height / 2 - 4, width, 2, hex(this.def.palette.accent), 0.5)
      .setOrigin(0, 0.5);
    const title = this.add.text(-width / 2 + 14, -16, '', {
      ...TEXT,
      fontSize: '8px',
      fontStyle: '800',
      color: this.def.palette.xp,
    }).setOrigin(0, 0.5);
    const objective = this.add.text(-width / 2 + 14, 4, '', {
      ...TEXT,
      fontSize: '12px',
      fontStyle: '800',
      color: '#ffffff',
      stroke: '#05070b',
      strokeThickness: 2,
    }).setOrigin(0, 0.5);
    const threat = this.add.text(width / 2 - 14, -16, '', {
      ...TEXT,
      fontSize: '8px',
      fontStyle: '800',
      color: this.def.palette.danger,
      align: 'right',
    }).setOrigin(1, 0.5);
    const pips = Array.from({ length: 5 }, (_value, index) =>
      this.add.rectangle(width / 2 - 54 + index * 8, 8, 6, 6, hex(this.def.palette.danger), 0.16)
        .setRotation(Math.PI / 4),
    );
    const container = this.add.container(x, y, [panel, accent, title, objective, threat, ...pips])
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 0.35)
      .setAlpha(0);

    this.encounterPlate = { container, panel, accent, title, objective, threat, pips };
    this.updateEncounterPlate(this.time.now);
    this.tweens.add({ targets: container, alpha: 1, duration: 420, ease: 'Sine.Out' });
  }

  private updateEncounterPlate(time: number) {
    const plate = this.encounterPlate;
    if (!plate) return;
    const title = truncateText(this.def.arena.name.toUpperCase(), 34);
    const objective = truncateText(this.encounterObjectiveText(), 36);
    const threat = this.currentThreatLevel();
    const pulse = 0.55 + Math.sin(time * 0.006) * 0.12;

    this.encounterPlateTitle = title;
    this.encounterPlateObjective = objective;
    this.encounterThreatLevel = threat;

    plate.title.setText(title);
    plate.objective.setText(objective);
    plate.threat.setText(`THREAT ${threat}`);
    plate.panel.setStrokeStyle(1, hex(threat >= 4 ? this.def.palette.danger : this.def.palette.accent), threat >= 4 ? 0.56 : 0.34);
    plate.accent.setFillStyle(hex(threat >= 4 ? this.def.palette.danger : this.def.palette.accent), threat >= 4 ? pulse : 0.62);
    plate.pips.forEach((pip, index) => {
      const active = index < threat;
      pip
        .setFillStyle(hex(active ? this.def.palette.danger : this.def.palette.accent), active ? 0.58 + index * 0.035 : 0.13)
        .setScale(active ? 1 + Math.sin(time * 0.008 + index) * 0.08 : 0.82);
    });
  }

  private encounterObjectiveText() {
    if (this.def.winCondition === 'solve-puzzle') {
      return this.isPuzzleExitOpen()
        ? `EXIT OPEN ${this.puzzleMoves}/${this.puzzleDefinition().moveLimit}`
        : `SWITCHES ${this.puzzleSwitchesLit()}/${this.puzzleSwitchTarget()}`;
    }
    if (this.def.winCondition === 'approve-deploy') {
      return `APPROVE GATES ${this.agentDashboardApprovalCount()}/${this.agentDashboardApprovalTarget()}`;
    }
    if (this.def.winCondition === 'select-decision') {
      return this.decisionRoomSelectedOptionId
        ? `DECISION ${this.decisionRoomReady() ? 'ACCEPTED' : 'REVIEW'}`
        : `SELECT RECOMMENDATION`;
    }
    if (this.def.winCondition === 'survive') {
      return `SURVIVE ${Math.max(0, Math.ceil(this.def.arena.durationSeconds - this.elapsed))}S`;
    }
    if (this.def.winCondition === 'score-target') {
      return `SCORE ${this.score}/${this.scoreTarget()}`;
    }
    if (this.def.winCondition === 'collect-relics') {
      return `COLLECT RELICS ${this.relics}/${this.relicTarget()}`;
    }
    if (this.def.winCondition === 'capture-zone') {
      return `HOLD ZONE ${Math.floor(this.captureProgress)}/${this.captureTargetSeconds()}S`;
    }
    if (this.def.winCondition === 'escort') {
      return `ESCORT ${Math.floor(this.escortProgress)}/${this.escortTargetDistance()}PX`;
    }
    if (this.def.winCondition === 'defend-core') {
      return `DEFEND CORE ${Math.floor(this.defendProgress)}/${this.defendTargetSeconds()}S`;
    }
    if (this.def.winCondition === 'repair-nodes') {
      return `REPAIR NODES ${this.repairNodesFixed()}/${this.repairNodeCount()}`;
    }
    if (this.def.winCondition === 'extract') {
      return `EXTRACT ${Math.floor(this.extractProgress)}/${this.extractHoldSeconds()}S`;
    }
    if (this.def.winCondition === 'rescue') {
      return this.rescuePhase === 'recover'
        ? `RESCUE ${Math.floor(this.rescueProgress)}/${this.rescueHoldSeconds()}S`
        : `EXTRACT ALLY ${Math.floor(this.rescueExtractProgress)}/${this.rescueExtractSeconds()}S`;
    }
    if (this.def.winCondition === 'unlock-gate') {
      return this.unlockKeys < this.unlockKeyTarget()
        ? `KEYS ${this.unlockKeys}/${this.unlockKeyTarget()}`
        : `UNLOCK EXIT ${Math.floor(this.unlockProgress)}/${this.unlockHoldSeconds()}S`;
    }
    if (this.def.winCondition === 'defeat-boss') {
      return this.boss?.active ? `BOSS HP ${Math.ceil((this.boss.getData('hp') as number) || 0)}` : `HUNT ${this.def.boss?.name ?? 'BOSS'}`;
    }
    return `CLEAR WAVES ${this.spawnQueue.length + this.pendingSpawns + this.enemies.children.size}`;
  }

  private currentThreatLevel() {
    if (this.isPuzzleRoom()) {
      const movePressure = this.puzzleMoves / Math.max(1, this.puzzleDefinition().moveLimit);
      const hazardPressure = this.puzzleDefinition().hazards.some((point) => this.puzzlePlayerCell?.x === point.x && this.puzzlePlayerCell?.y === point.y) ? 1 : 0;
      return clamp(1 + Math.ceil(movePressure * 3 + hazardPressure), 1, 5);
    }
    if (this.isAgentDashboard()) {
      const pendingApprovals = this.agentDashboardApprovalTarget() - this.agentDashboardApprovalCount();
      const healthPressure = 1 - this.agentDashboardHealthPercent() / 100;
      return clamp(1 + pendingApprovals + Math.ceil(healthPressure * 2), 1, 5);
    }
    if (this.isDecisionRoom()) {
      const room = this.decisionRoomDefinition();
      const concerns = room.stakeholders.filter((stakeholder) => stakeholder.stance === 'concerned' || stakeholder.stance === 'blocking').length;
      const risk = Math.max(...room.options.map((option) => option.risk), 0) / 100;
      return clamp(1 + concerns + Math.ceil(risk * 2), 1, 5);
    }
    const enemyPressure = this.enemies.children.size + this.pendingSpawns * 0.5 + this.countEliteEnemies() * 0.75;
    const bossPressure = this.boss?.active ? 2 : 0;
    const hazardPressure = this.hasVisibleArenaHazard() ? 1 : 0;
    const lowHealthPressure = this.hp / Math.max(1, this.maxHp) < 0.35 ? 1 : 0;
    return clamp(Math.ceil((enemyPressure + bossPressure + hazardPressure + lowHealthPressure) / 2), 1, 5);
  }

  private setupTacticalRadar() {
    const width = 116;
    const height = 74;
    const x = this.scale.width - width / 2 - 18;
    const y = 74;
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const panel = this.add.rectangle(0, 0, width, height, 0x05070b, 0.3)
      .setStrokeStyle(1, accent, 0.2);
    const grid = this.add.graphics();
    drawRadarGrid(grid, width, height, accent);
    const label = this.add.text(-width / 2 + 8, -height / 2 + 7, 'AREA', {
      ...TEXT,
      fontSize: '9px',
      fontStyle: '800',
      color: this.def.palette.xp,
    }).setOrigin(0, 0.5);
    const sweep = this.add.graphics();
    const player = this.add.triangle(0, 0, 0, -7, 8, 7, -8, 7, xp, 0.94)
      .setStrokeStyle(1, 0xffffff, 0.35);
    const enemyPips = Array.from({ length: 10 }, () =>
      this.add.circle(0, 0, 3.2, danger, 0.86).setVisible(false),
    );
    const objectivePips = Array.from({ length: 6 }, () =>
      this.add.rectangle(0, 0, 6, 6, accent, 0.8).setRotation(Math.PI / 4).setVisible(false),
    );
    const bossPip = this.add.rectangle(0, 0, 10, 10, danger, 0.9)
      .setStrokeStyle(1, 0xffffff, 0.32)
      .setRotation(Math.PI / 4)
      .setVisible(false);
    const container = this.add.container(x, y, [
      panel,
      grid,
      label,
      sweep,
      ...objectivePips,
      ...enemyPips,
      bossPip,
      player,
    ])
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 0.3)
      .setAlpha(0.48);

    this.tacticalRadar = { container, grid, sweep, player, enemyPips, objectivePips, bossPip, width, height };
    this.updateTacticalRadar(this.time.now);
  }

  private updateTacticalRadar(time: number) {
    const radar = this.tacticalRadar;
    if (!radar || !this.player?.active) return;
    const enemyPips = this.enemies.children
      .getArray()
      .filter((child) => {
        const enemy = child as ArcadeImage;
        return enemy.active && !enemy.getData('boss');
      })
      .slice(0, radar.enemyPips.length) as ArcadeImage[];
    const objectiveTargets = this.radarObjectiveTargets().slice(0, radar.objectivePips.length);
    const mapPoint = (x: number, y: number) => ({
      x: -radar.width / 2 + 10 + clamp(x / this.scale.width, 0, 1) * (radar.width - 20),
      y: -radar.height / 2 + 14 + clamp(y / this.scale.height, 0, 1) * (radar.height - 24),
    });

    const playerPoint = mapPoint(this.player.x, this.player.y);
    radar.player
      .setPosition(playerPoint.x, playerPoint.y)
      .setRotation(facingAngle(this.facing) + Math.PI / 2);

    radar.enemyPips.forEach((pip, index) => {
      const enemy = enemyPips[index];
      if (!enemy) {
        pip.setVisible(false);
        return;
      }
      const point = mapPoint(enemy.x, enemy.y);
      const eliteKind = (enemy.getData('eliteKind') as EliteKind | undefined) ?? 'none';
      pip
        .setVisible(true)
        .setPosition(point.x, point.y)
        .setFillStyle(hex(eliteKind === 'none' ? this.def.palette.danger : this.eliteColor(eliteKind)), 0.88)
        .setRadius(eliteKind === 'none' ? 3.2 : 4.2);
    });

    radar.objectivePips.forEach((pip, index) => {
      const target = objectiveTargets[index];
      if (!target) {
        pip.setVisible(false);
        return;
      }
      const point = mapPoint(target.x, target.y);
      const pulse = 0.8 + Math.sin(time * 0.007 + index) * 0.16;
      pip
        .setVisible(true)
        .setPosition(point.x, point.y)
        .setFillStyle(hex(target.color), 0.82)
        .setScale(pulse);
    });

    this.tacticalRadarBossVisible = Boolean(this.boss?.active);
    if (this.boss?.active) {
      const bossPoint = mapPoint(this.boss.x, this.boss.y);
      radar.bossPip
        .setVisible(true)
        .setPosition(bossPoint.x, bossPoint.y)
        .setScale(1 + Math.sin(time * 0.008) * 0.12);
    } else {
      radar.bossPip.setVisible(false);
    }

    const sweepAngle = time * 0.0012;
    const sweepRadius = Math.min(radar.width, radar.height) * 0.38;
    radar.sweep
      .clear()
      .lineStyle(1, hex(this.def.palette.projectile), 0.24)
      .lineBetween(0, 0, Math.cos(sweepAngle) * sweepRadius, Math.sin(sweepAngle) * sweepRadius);
    this.tacticalRadarEnemyPips = enemyPips.length;
    this.tacticalRadarObjectivePips = objectiveTargets.length;
  }

  private radarObjectiveTargets(): ObjectiveGuideTarget[] {
    const targets: ObjectiveGuideTarget[] = [];
    this.objectivePickups?.children.each((child) => {
      const pickup = child as ArcadeImage;
      if (!pickup.active || targets.length >= 6) return true;
      const kind = (pickup.getData('kind') as ObjectivePickupKind | undefined) ?? 'score-cache';
      targets.push({
        x: pickup.x,
        y: pickup.y,
        label: this.objectivePickupLabel(kind),
        color: this.objectivePickupColor(kind),
      });
      return true;
    });

    if (this.def.winCondition === 'solve-puzzle' && this.puzzleExit) {
      const target = this.currentPuzzleGuideTarget();
      if (target) targets.push(target);
    } else if (this.def.winCondition === 'approve-deploy' && this.agentDashboardLayer) {
      targets.push({ x: this.scale.width - 266, y: 302, label: 'approval gate', color: this.def.palette.xp });
    } else if (this.def.winCondition === 'select-decision' && this.decisionRoomLayer) {
      targets.push({ x: this.scale.width - 360, y: 250, label: 'recommendation', color: this.def.palette.xp });
    } else if (this.def.winCondition === 'capture-zone' && this.captureZone) {
      targets.push({ x: this.captureZone.x, y: this.captureZone.y, label: 'capture zone', color: this.def.palette.accent });
    } else if (this.def.winCondition === 'escort' && this.escortAlly?.active) {
      targets.push({ x: this.escortAlly.x, y: this.escortAlly.y, label: 'escort ally', color: this.def.palette.xp });
    } else if (this.def.winCondition === 'defend-core' && this.defendCore?.image.active) {
      targets.push({ x: this.defendCore.x, y: this.defendCore.y, label: 'defend core', color: this.def.palette.accent });
    } else if (this.def.winCondition === 'repair-nodes') {
      for (const node of this.repairNodes) {
        if (!node.fixed) targets.push({ x: node.x, y: node.y, label: 'repair node', color: this.def.palette.projectile });
      }
    } else if (this.def.winCondition === 'extract' && this.extractZone) {
      targets.push({ x: this.extractZone.x, y: this.extractZone.y, label: 'extract gate', color: this.def.palette.xp });
    } else if (this.def.winCondition === 'rescue' && this.rescueObjective) {
      targets.push(
        this.rescuePhase === 'recover'
          ? { x: this.rescueObjective.x, y: this.rescueObjective.y, label: 'rescue survivor', color: this.def.palette.xp }
          : { x: this.rescueObjective.gateX, y: this.rescueObjective.gateY, label: 'rescue extract', color: this.def.palette.xp },
      );
    } else if (this.def.winCondition === 'unlock-gate' && this.unlockGate) {
      targets.push({
        x: this.unlockGate.x,
        y: this.unlockGate.y,
        label: this.unlockKeys >= this.unlockKeyTarget() ? 'exit gate' : 'locked gate',
        color: this.unlockKeys >= this.unlockKeyTarget() ? this.def.palette.xp : this.def.palette.accent,
      });
    }
    return targets;
  }

  private pulse(x: number, y: number, color: string, radius: number) {
    const startRadius = radius * 0.45;
    const ring = this.add.circle(x, y, startRadius, hex(color), 0)
      .setStrokeStyle(2, hex(color), 0.7)
      .setDepth(DEPTH.fx);
    this.tweens.add({ targets: ring, scale: radius / startRadius, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }

  private setupObjectiveGuide() {
    const line = this.add.graphics().setDepth(DEPTH.fx - 0.25);
    const beacon = this.add.circle(0, 0, 24, hex(this.def.palette.accent), 0.05)
      .setStrokeStyle(2, hex(this.def.palette.accent), 0.5)
      .setDepth(DEPTH.fx - 0.18);
    const arrow = this.add.triangle(0, 0, 0, -11, 18, 0, 0, 11, hex(this.def.palette.accent), 0.74)
      .setDepth(DEPTH.fx + 0.08);
    const label = this.add.text(0, 0, '', {
      ...TEXT,
      fontSize: '10px',
      fontStyle: '700',
      color: this.def.palette.accent,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 0.1).setVisible(false).setAlpha(0);
    this.objectiveGuide = { line, beacon, arrow, label };
    this.hideObjectiveGuide();
  }

  private updateObjectiveGuide(time: number) {
    const guide = this.objectiveGuide;
    if (!guide || !this.player?.active) return;
    const target = this.currentObjectiveGuideTarget();
    if (!target) {
      this.hideObjectiveGuide();
      return;
    }

    const color = hex(target.color);
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const arrowDistance = clamp(distance * 0.42, 42, 112);
    const arrowX = this.player.x + Math.cos(angle) * arrowDistance;
    const arrowY = this.player.y + Math.sin(angle) * arrowDistance;
    const beaconPulse = 1 + Math.sin(time * 0.006) * 0.08;

    guide.line
      .setVisible(true)
      .clear()
      .lineStyle(2, color, distance > 46 ? 0.22 : 0.08)
      .lineBetween(this.player.x, this.player.y, target.x, target.y);
    guide.beacon
      .setVisible(true)
      .setPosition(target.x, target.y)
      .setRadius((distance > 46 ? 24 : 18) * beaconPulse)
      .setFillStyle(color, distance > 46 ? 0.05 : 0.1)
      .setStrokeStyle(distance > 46 ? 2 : 1, color, 0.44 + Math.sin(time * 0.008) * 0.12);
    guide.arrow
      .setVisible(distance > 46)
      .setPosition(arrowX, arrowY)
      .setRotation(angle)
      .setFillStyle(color, 0.78);
    guide.label
      .setVisible(false)
      .setAlpha(0)
      .setPosition(target.x, clamp(target.y - 48, 24, this.scale.height - 24))
      .setText(target.label)
      .setColor(target.color);

    this.objectiveGuideVisible = true;
    this.objectiveGuideLabel = target.label;
    this.objectiveGuideDistance = Math.round(distance);
  }

  private hideObjectiveGuide() {
    this.objectiveGuide?.line.clear().setVisible(false);
    this.objectiveGuide?.beacon.setVisible(false);
    this.objectiveGuide?.arrow.setVisible(false);
    this.objectiveGuide?.label.setVisible(false);
    this.objectiveGuideVisible = false;
    this.objectiveGuideLabel = null;
    this.objectiveGuideDistance = null;
  }

  private updateObjectiveMotionFrame(time: number) {
    if (this.countObjectiveMotionFx() <= 0) return;
    this.objectiveMotionFrame = Math.floor(time / 80);
  }

  private countObjectiveMotionFx() {
    let count = 0;
    if (this.isPuzzleRoom()) count += 1 + this.puzzleSwitches.length + this.puzzleGems.filter((gem) => !gem.taken).length + (this.puzzleExit ? 1 : 0);
    if (this.isAgentDashboard()) count += 1 + this.agentDashboardApprovalTarget() + this.agentDashboardDefinition().metrics.length;
    if (this.isDecisionRoom()) count += 1 + this.decisionRoomDefinition().options.length + this.decisionRoomDefinition().evidence.length;
    if (this.captureZone) count += 1 + this.captureZone.pips.length;
    if (this.escortRoute) count += 1 + this.escortRoute.beacons.length;
    if (this.defendCore) count += 1 + this.defendCore.pips.length;
    for (const node of this.repairNodes) {
      if (node.ring.active) count += 1 + node.pips.length;
    }
    if (this.extractZone) count += 1 + this.extractZone.pips.length;
    if (this.rescueObjective) count += 2 + this.rescueObjective.pips.length;
    if (this.unlockGate) count += 1 + this.unlockGate.pips.length;
    return count;
  }

  private currentObjectiveGuideTarget(): ObjectiveGuideTarget | undefined {
    const pickup = this.objectivePickups?.children
      .getArray()
      .find((child) => (child as ArcadeImage).active) as ArcadeImage | undefined;
    if (pickup?.active) {
      const kind = (pickup.getData('kind') as ObjectivePickupKind | undefined) ?? 'score-cache';
      return {
        x: pickup.x,
        y: pickup.y,
        label: this.objectivePickupLabel(kind),
        color: this.objectivePickupColor(kind),
      };
    }

    if (this.def.winCondition === 'solve-puzzle') {
      return this.currentPuzzleGuideTarget();
    }
    if (this.def.winCondition === 'approve-deploy' && this.agentDashboardLayer) {
      return { x: this.scale.width - 266, y: 302, label: 'approval gate', color: this.def.palette.xp };
    }
    if (this.def.winCondition === 'select-decision' && this.decisionRoomLayer) {
      return { x: this.scale.width - 360, y: 250, label: 'recommendation', color: this.def.palette.xp };
    }
    if (this.def.winCondition === 'capture-zone' && this.captureZone) {
      return { x: this.captureZone.x, y: this.captureZone.y, label: 'capture zone', color: this.def.palette.accent };
    }
    if (this.def.winCondition === 'escort' && this.escortAlly?.active) {
      return { x: this.escortAlly.x, y: this.escortAlly.y, label: 'escort ally', color: this.def.palette.xp };
    }
    if (this.def.winCondition === 'defend-core' && this.defendCore?.image.active) {
      return { x: this.defendCore.x, y: this.defendCore.y, label: 'defend core', color: this.def.palette.accent };
    }
    if (this.def.winCondition === 'repair-nodes') {
      const node = this.repairNodes.find((candidate) => !candidate.fixed);
      if (node) return { x: node.x, y: node.y, label: 'repair node', color: this.def.palette.projectile };
    }
    if (this.def.winCondition === 'extract' && this.extractZone) {
      return { x: this.extractZone.x, y: this.extractZone.y, label: 'extract gate', color: this.def.palette.xp };
    }
    if (this.def.winCondition === 'rescue' && this.rescueObjective) {
      return this.rescuePhase === 'recover'
        ? { x: this.rescueObjective.x, y: this.rescueObjective.y, label: 'rescue survivor', color: this.def.palette.xp }
        : { x: this.rescueObjective.gateX, y: this.rescueObjective.gateY, label: 'rescue extract', color: this.def.palette.xp };
    }
    if (this.def.winCondition === 'unlock-gate' && this.unlockGate) {
      return {
        x: this.unlockGate.x,
        y: this.unlockGate.y,
        label: this.unlockKeys >= this.unlockKeyTarget() ? 'exit gate' : 'locked gate',
        color: this.unlockKeys >= this.unlockKeyTarget() ? this.def.palette.xp : this.def.palette.accent,
      };
    }
    if (this.def.winCondition === 'defeat-boss' && this.boss?.active) {
      return { x: this.boss.x, y: this.boss.y, label: 'boss', color: this.def.palette.danger };
    }
    return undefined;
  }

  private currentPuzzleGuideTarget(): ObjectiveGuideTarget | undefined {
    if (!this.isPuzzleRoom() || !this.puzzleBoard) return undefined;
    const puzzle = this.puzzleDefinition();
    if (!this.isPuzzleExitOpen()) {
      const unlit = puzzle.switches.find((point) => !this.puzzleBlockAt(point.x, point.y)) ?? puzzle.switches[0];
      if (unlit) {
        const center = this.puzzleCellCenter(unlit.x, unlit.y);
        return { x: center.x, y: center.y, label: 'switch', color: this.def.palette.accent };
      }
    }
    const center = this.puzzleCellCenter(puzzle.exit.x, puzzle.exit.y);
    return { x: center.x, y: center.y, label: this.isPuzzleExitOpen() ? 'open exit' : 'locked exit', color: this.isPuzzleExitOpen() ? this.def.palette.xp : this.def.palette.accent };
  }

  private objectiveHudText() {
    if (this.def.winCondition === 'solve-puzzle') {
      return this.isPuzzleExitOpen()
        ? `Exit open · Moves ${this.puzzleMoves}/${this.puzzleDefinition().moveLimit} · Gems ${this.puzzleGemsCollected()}/${this.puzzleGems.length}`
        : `Switches ${this.puzzleSwitchesLit()}/${this.puzzleSwitchTarget()} · Moves ${this.puzzleMoves}/${this.puzzleDefinition().moveLimit} · Gems ${this.puzzleGemsCollected()}/${this.puzzleGems.length}`;
    }
    if (this.def.winCondition === 'approve-deploy') {
      return `Approvals ${this.agentDashboardApprovalCount()}/${this.agentDashboardApprovalTarget()} · Health ${this.agentDashboardHealthPercent()}% · Score ${this.score}`;
    }
    if (this.def.winCondition === 'select-decision') {
      return `Decision ${this.decisionRoomSelectedOptionId ? 'selected' : 'pending'} · Confidence ${this.decisionRoomConfidence()}% · Score ${this.score}`;
    }
    if (this.def.winCondition === 'survive') {
      return `Survive ${Math.max(0, Math.ceil(this.def.arena.durationSeconds - this.elapsed))}s · Score ${this.score}`;
    }
    if (this.def.winCondition === 'score-target') {
      return `Score ${this.score}/${this.scoreTarget()}`;
    }
    if (this.def.winCondition === 'collect-relics') {
      return `Relics ${this.relics}/${this.relicTarget()} · Score ${this.score}`;
    }
    if (this.def.winCondition === 'capture-zone') {
      return `Capture ${Math.floor(this.captureProgress)}/${this.captureTargetSeconds()}s · Score ${this.score}`;
    }
    if (this.def.winCondition === 'escort') {
      return `Escort ${Math.floor(this.escortProgress)}/${this.escortTargetDistance()}px · Ally ${Math.ceil(this.escortHp)}/${this.escortMaxHp}`;
    }
    if (this.def.winCondition === 'defend-core') {
      return `Core ${Math.floor(this.defendProgress)}/${this.defendTargetSeconds()}s · HP ${Math.ceil(this.defendHp)}/${this.defendMaxHp}`;
    }
    if (this.def.winCondition === 'repair-nodes') {
      return `Repair ${this.repairNodesFixed()}/${this.repairNodeCount()} nodes · ${Math.floor(this.currentRepairProgress())}/${this.repairSecondsPerNode()}s`;
    }
    if (this.def.winCondition === 'extract') {
      return `Extract ${Math.floor(this.extractProgress)}/${this.extractHoldSeconds()}s${this.extractContested ? ' · Contested' : ''}`;
    }
    if (this.def.winCondition === 'rescue') {
      return this.rescuePhase === 'recover'
        ? `Rescue ${Math.floor(this.rescueProgress)}/${this.rescueHoldSeconds()}s · HP ${Math.ceil(this.rescueHp)}/${this.rescueMaxHp}`
        : `Extract ally ${Math.floor(this.rescueExtractProgress)}/${this.rescueExtractSeconds()}s${this.rescueContested ? ' · Contested' : ''}`;
    }
    if (this.def.winCondition === 'unlock-gate') {
      return this.unlockKeys < this.unlockKeyTarget()
        ? `Keys ${this.unlockKeys}/${this.unlockKeyTarget()} · Score ${this.score}`
        : `Exit ${Math.floor(this.unlockProgress)}/${this.unlockHoldSeconds()}s${this.unlockContested ? ' · Contested' : ''}`;
    }
    if (this.def.winCondition === 'clear-waves') {
      return `Score ${this.score} · Waves ${this.spawnQueue.length + this.pendingSpawns + this.enemies.children.size}`;
    }
    return `Score ${this.score}`;
  }

  private scoreTarget() {
    if (this.def.scoreTarget) return this.def.scoreTarget;
    const enemyById = new Map(this.def.enemies.map((enemy) => [enemy.id, enemy]));
    const waveScore = this.def.waves.reduce((sum, wave) => {
      const enemy = enemyById.get(wave.enemyId);
      return sum + wave.count * (enemy?.score ?? 0);
    }, 0);
    return Math.max(100, Math.round((waveScore + (this.def.boss?.score ?? 0)) * 0.55));
  }

  private relicTarget() {
    return this.def.relicTarget ?? 4;
  }

  private captureTargetSeconds() {
    return this.def.captureTargetSeconds ?? 24;
  }

  private escortSpriteKey() {
    return this.def.escortSpriteKey ?? 'escort';
  }

  private escortSpriteAsset() {
    const key = this.escortSpriteKey();
    return this.def.assets.find((asset) => asset.key === key);
  }

  private usesCuratedEscortSprite() {
    const src = this.escortSpriteAsset()?.src;
    return typeof src === 'string' && src.includes('coastal-caravan-escort-sheet.png');
  }

  private escortObjectiveRadius() {
    return this.usesCuratedEscortSprite() ? 28 : 13;
  }

  private escortTargetDistance() {
    return this.def.escortTargetDistance ?? 560;
  }

  private defendSpriteKey() {
    return this.def.defendSpriteKey ?? 'defend-core';
  }

  private defendTargetSeconds() {
    return this.def.defendTargetSeconds ?? 32;
  }

  private defendMaxHealth() {
    return this.def.defendMaxHealth ?? 84;
  }

  private repairNodeCount() {
    return clamp(this.def.repairNodeCount ?? 3, 2, 5);
  }

  private repairSecondsPerNode() {
    return clamp(this.def.repairSecondsPerNode ?? 5, 3, 10);
  }

  private extractHoldSeconds() {
    return clamp(this.def.extractHoldSeconds ?? 8, 4, 14);
  }

  private rescueSpriteKey() {
    return this.def.rescueSpriteKey ?? 'rescue-survivor';
  }

  private rescueHoldSeconds() {
    return clamp(this.def.rescueHoldSeconds ?? 5, 3, 10);
  }

  private rescueExtractSeconds() {
    return clamp(this.def.rescueExtractSeconds ?? 6, 4, 12);
  }

  private unlockKeyTarget() {
    return clamp(this.def.unlockKeyTarget ?? 3, 1, 6);
  }

  private unlockHoldSeconds() {
    return clamp(this.def.unlockHoldSeconds ?? 6, 3, 12);
  }

  private repairNodesFixed() {
    return this.repairNodes.filter((node) => node.fixed).length;
  }

  private currentRepairProgress() {
    const active = this.repairNodes.find((node) => !node.fixed && node.progress > 0) ?? this.repairNodes.find((node) => !node.fixed);
    return active?.progress ?? this.repairSecondsPerNode();
  }

  private attachShadow(target: ArcadeImage, radius: number, alpha: number) {
    const shadow = this.add.ellipse(target.x, target.y + radius * 0.55, radius * 1.75, radius * 0.58, 0x000000, alpha)
      .setDepth(target.depth - 0.35);
    target.setData('shadow', shadow);
    target.once('destroy', () => shadow.destroy());
    return shadow;
  }

  private syncShadow(target: ArcadeImage, radius: number) {
    const shadow = target.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
    if (!shadow || !target.active) return;
    shadow.setPosition(target.x, target.y + radius * 0.62);
    shadow.setScale(Math.max(0.7, target.scaleX), Math.max(0.75, target.scaleY));
  }

  private attachEliteAura(target: ArcadeImage, radius: number, eliteKind: EliteKind) {
    if (eliteKind === 'none') return;
    const color = hex(this.eliteColor(eliteKind));
    const ring = this.add.circle(target.x, target.y, radius * 1.28, color, 0.06)
      .setStrokeStyle(2, color, 0.72)
      .setDepth(DEPTH.fx + 0.05);
    const pip = this.add.rectangle(target.x, target.y - radius * 1.45, 9, 9, color, 0.92)
      .setRotation(Math.PI / 4)
      .setDepth(DEPTH.fx + 0.25);
    target.setData('eliteAura', { ring, pip, kind: eliteKind } satisfies EliteAura);
    target.once('destroy', () => {
      ring.destroy();
      pip.destroy();
    });
  }

  private syncEliteAura(target: ArcadeImage, radius: number, time: number) {
    const aura = target.getData('eliteAura') as EliteAura | undefined;
    if (!aura || !target.active) return;
    const pulse = 1 + Math.sin(time * 0.007 + target.x * 0.01) * 0.08;
    aura.ring.setPosition(target.x, target.y);
    aura.ring.setRadius(radius * 1.28 * pulse);
    aura.ring.setAlpha(0.42 + Math.sin(time * 0.005) * 0.12);
    aura.pip.setPosition(target.x, target.y - radius * 1.55 * pulse);
    aura.pip.setRotation(Math.PI / 4 + time * 0.0025);
  }

  private attachEnemyReadout(target: ArcadeImage, radius: number, isBoss: boolean) {
    if (isBoss) return;
    const width = Math.max(28, radius * 2.25);
    const height = 4;
    const eliteKind = (target.getData('eliteKind') as EliteKind | undefined) ?? 'none';
    const fillColor = eliteKind !== 'none' ? this.eliteColor(eliteKind) : this.def.palette.xp;
    const bg = this.add.rectangle(target.x - width / 2, target.y - radius - 13, width, height, 0x000000, 0.38)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.fx + 0.15)
      .setAlpha(0);
    const fill = this.add.rectangle(target.x - width / 2, target.y - radius - 13, width, height, hex(fillColor), 0.9)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.fx + 0.2)
      .setAlpha(0);
    target.setData('readout', { bg, fill, width, height } satisfies EnemyReadout);
    target.once('destroy', () => {
      bg.destroy();
      fill.destroy();
    });
  }

  private updateEnemyReadout(target: ArcadeImage, hp: number) {
    const readout = target.getData('readout') as EnemyReadout | undefined;
    if (!readout) return;
    const maxHp = (target.getData('maxHp') as number) || hp;
    const ratio = Phaser.Math.Clamp(hp / Math.max(1, maxHp), 0, 1);
    readout.fill.setSize(Math.max(1, readout.width * ratio), readout.height);
    readout.bg.setAlpha(0.72);
    readout.fill.setAlpha(0.94);
    this.combatFeedbackUntil = Math.max(this.combatFeedbackUntil, this.time.now + 900);
    this.tweens.add({
      targets: [readout.bg, readout.fill],
      alpha: 0.18,
      delay: 900,
      duration: 420,
      ease: 'Sine.InOut',
    });
  }

  private syncEnemyReadout(target: ArcadeImage, radius: number) {
    const readout = target.getData('readout') as EnemyReadout | undefined;
    if (!readout || !target.active) return;
    const x = target.x - readout.width / 2;
    const y = target.y - radius - 13;
    readout.bg.setPosition(x, y);
    readout.fill.setPosition(x, y);
  }

  private hasVisibleCombatFeedback() {
    if (this.time.now < this.combatFeedbackUntil) return true;
    return this.enemies.children.getArray().some((child) => {
      const readout = (child as ArcadeImage).getData('readout') as EnemyReadout | undefined;
      return Boolean(readout && (readout.bg.alpha > 0.2 || readout.fill.alpha > 0.2));
    });
  }

  private updateVisualPresentation(time: number) {
    this.updateProfileFraming(time);
    this.updateCameraDirector(time);
    const profileMotion = this.profileAnimationTuning();
    const bakerySpriteMode = arenaMood(this.def) === 'bakery';
    this.actorRigFrame = Math.floor(time / 110) % 8;
    this.spriteSheetAnimatedKeys.clear();
    this.spriteSheetAnimationNames.clear();
    this.spriteSheetFrame = 0;
    this.bossTransitionFx = 0;
    this.bossTransitionState = this.currentBossTransitionState();
    this.updatePlayerActorLayer(time);
    this.updatePlayerRigLayer(time);
    this.applySpriteSheetFrame(this.player, this.def.player.spriteKey, this.playerAnimationState, time);
    const playerPresentationScale = hasLiteralBackdrop(this.def) && this.def.winCondition === 'defeat-boss' ? 1.74 : 1.46;
    const playerPulse = (1 + Math.sin(time * profileMotion.playerRate) * profileMotion.playerPulse) * playerPresentationScale;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | null;
    const playerRotation = bakerySpriteMode
      ? 0
      : this.isFlightShooter()
      ? clamp((playerBody?.velocity.y ?? 0) / Math.max(1, this.moveSpeed), -1, 1) * 0.32
      : this.isPlatformer()
        ? clamp((playerBody?.velocity.x ?? 0) / Math.max(1, this.moveSpeed), -1, 1) * 0.08
        : facingAngle(this.facing) + Math.PI / 2;
    this.player
      .setScale(playerPulse)
      .setRotation(playerRotation)
      .setFlipX((bakerySpriteMode || this.isPlatformer()) && this.facing === 'left');
    this.syncShadow(this.player, this.def.player.radius);
    if (this.escortAlly?.active) {
      const phase = (this.escortAlly.getData('phase') as number | undefined) ?? 0;
      const route = this.escortRoute;
      const angle = route ? Phaser.Math.Angle.Between(route.startX, route.startY, route.endX, route.endY) : 0;
      const curatedEscort = this.usesCuratedEscortSprite();
      this.escortAlly
        .setScale(1 + Math.sin(time * 0.005 + phase) * 0.035)
        .setRotation(curatedEscort ? -0.03 : angle + Math.PI / 2)
        .setAlpha(this.escortHp <= 0 ? 0.48 : this.escortContested ? 0.82 : 1);
      this.applySpriteSheetFrame(this.escortAlly, this.escortSpriteKey(), this.escortContested ? 'escort-contested' : 'escort-move', time, phase);
      this.syncShadow(this.escortAlly, this.escortObjectiveRadius());
    }
    if (this.rescueObjective?.ally.active) {
      const ally = this.rescueObjective.ally;
      const phase = (ally.getData('phase') as number | undefined) ?? 0;
      const targetX = this.rescuePhase === 'recover' ? this.rescueObjective.x : this.rescueObjective.gateX;
      const targetY = this.rescuePhase === 'recover' ? this.rescueObjective.y : this.rescueObjective.gateY;
      const angle = Phaser.Math.Angle.Between(ally.x, ally.y, targetX, targetY);
      ally
        .setScale(1 + Math.sin(time * 0.005 + phase) * 0.034)
        .setRotation(angle + Math.PI / 2)
        .setAlpha(this.rescueHp <= 0 ? 0.48 : this.rescueContested ? 0.82 : 1);
      const state = this.rescueContested ? 'escort-contested' : this.rescuePhase === 'recover' ? 'hurt' : 'escort-move';
      this.applySpriteSheetFrame(ally, this.rescueSpriteKey(), state, time, phase);
      this.syncShadow(ally, 13);
    }
    if (this.defendCore?.image.active) {
      const phase = (this.defendCore.image.getData('phase') as number | undefined) ?? 0;
      this.defendCore.image
        .setScale(1 + Math.sin(time * 0.006 + phase) * 0.032)
        .setRotation(Math.sin(time * 0.0025 + phase) * 0.08);
      this.applySpriteSheetFrame(this.defendCore.image, this.defendSpriteKey(), this.defendContested ? 'defend-contested' : 'defend-idle', time, phase);
      this.syncShadow(this.defendCore.image, 18);
    }

    this.enemyAnimationStates = [];
    this.enemies.children.each((child) => {
      const enemy = child as ArcadeImage;
      if (!enemy.active) return true;
      const radius = (enemy.getData('radius') as number) || 12;
      const spawnUntil = (enemy.getData('spawnUntil') as number) || 0;
      const phase = (enemy.getData('phase') as number) || 0;
      const baseScale = (enemy.getData('baseScale') as number) || 1;
      const body = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (time > spawnUntil) enemy.setScale(baseScale * (1 + Math.sin(time * profileMotion.enemyRate + phase) * profileMotion.enemyPulse));
      if (bakerySpriteMode) {
        enemy.setRotation(0).setFlipX(!enemy.getData('boss') && (body?.velocity.x ?? 0) < -4);
      } else if (this.isPlatformer()) {
        enemy.setRotation(0).setFlipX((body?.velocity.x ?? 0) < -4);
      } else if (body && body.velocity.lengthSq() > 4 && !enemy.getData('boss')) {
        enemy.setRotation(this.isFlightShooter() ? body.velocity.angle() : body.velocity.angle() + Math.PI / 2);
      }
      this.syncShadow(enemy, radius);
      this.syncEnemyReadout(enemy, radius);
      this.syncEliteAura(enemy, radius, time);
      this.syncActorTell(enemy, radius, time);
      this.syncActorRig(enemy, radius, time);
      this.applySpriteSheetFrame(enemy, enemy.texture.key, enemy.getData('boss') ? this.bossTransitionState ?? 'boss-idle' : `${enemy.getData('role') ?? 'enemy'}-${body && body.velocity.lengthSq() > 4 ? 'move' : 'idle'}`, time, phase);
      return true;
    });
  }

  private currentPlayerAnimationState(time: number): PlayerAnimationState {
    if (time - this.lastDamageAt < 260) return 'hurt';
    if (this.isPuzzleRoom() && time < this.puzzleNextMoveAt) return 'move';
    if (time < this.dashActiveUntil) return 'dash';
    if (time < this.attackActiveUntil) return 'attack';
    if (time - this.lastFireAt < 180) return 'fire';
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    return body && body.velocity.lengthSq() > 12 ? 'move' : 'idle';
  }

  private updatePlayerActorLayer(time: number) {
    const layer = this.playerActorLayer;
    if (!layer || !this.player?.active) return;
    const state = this.currentPlayerAnimationState(time);
    this.playerAnimationState = state;
    const x = this.player.x;
    const y = this.player.y;
    const r = this.def.player.radius;
    const angle = facingAngle(this.facing);
    const fxColor = hex(this.def.palette.projectile);
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const xp = hex(this.def.palette.xp);
    const phase = time * 0.001;
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const nx = -vy;
    const ny = vx;
    const literalBackdrop = hasLiteralBackdrop(this.def);
    const bakeryLiteralBackdrop = literalBackdrop && arenaMood(this.def) === 'bakery';
    const brightPalette = isBrightPalette(this.def);
    const beaconColor = bakeryLiteralBackdrop ? fxColor : literalBackdrop ? 0x26e6ff : fxColor;
    const silhouetteAlpha = bakeryLiteralBackdrop ? 0 : literalBackdrop ? 0.76 : brightPalette ? 0.52 : 0.22;
    const rimAlpha = bakeryLiteralBackdrop ? 0.18 : literalBackdrop ? 0.9 : brightPalette ? 0.46 : 0.22;
    const rimWidth = bakeryLiteralBackdrop ? 2 : literalBackdrop ? 5 : brightPalette ? 3 : 2;

    layer.clear();
    if (silhouetteAlpha > 0) {
      layer.fillStyle(0x000000, silhouetteAlpha);
      layer.fillCircle(x, y, literalBackdrop ? r * 1.48 : r * 1.38);
    }
    layer.lineStyle(rimWidth, 0xffffff, rimAlpha);
    layer.strokeCircle(x, y, bakeryLiteralBackdrop ? r * 1.1 : literalBackdrop ? r * 1.32 : r * 1.24);
    if (bakeryLiteralBackdrop) {
      layer.lineStyle(2, beaconColor, 0.18);
      layer.strokeCircle(x, y + r * 0.18, r * (1.12 + Math.sin(phase * 4.2) * 0.03));
    } else if (literalBackdrop) {
      layer.lineStyle(5, 0x05070b, 0.54);
      layer.strokeCircle(x, y, r * 1.72);
      layer.lineStyle(3, beaconColor, 0.72);
      layer.strokeCircle(x, y, r * (1.7 + Math.sin(phase * 4.2) * 0.05));
      layer.fillStyle(0x05070b, 0.5);
      layer.fillTriangle(
        x,
        y - r * 2.1,
        x - r * 0.5,
        y - r * 1.34,
        x + r * 0.5,
        y - r * 1.34,
      );
      layer.fillStyle(beaconColor, 0.78);
      layer.fillTriangle(
        x,
        y - r * 2,
        x - r * 0.36,
        y - r * 1.44,
        x + r * 0.36,
        y - r * 1.44,
      );
      layer.lineStyle(2, 0xffffff, 0.78);
      layer.lineBetween(x - r * 0.5, y - r * 1.32, x + r * 0.5, y - r * 1.32);
    }
    if (state === 'dash') {
      layer.lineStyle(3, xp, 0.54);
      for (let i = -1; i <= 1; i++) {
        const offset = i * r * 0.34;
        layer.lineBetween(
          x - vx * r * 0.3 + nx * offset,
          y - vy * r * 0.3 + ny * offset,
          x - vx * r * (2.2 + Math.abs(i) * 0.22) + nx * offset,
          y - vy * r * (2.2 + Math.abs(i) * 0.22) + ny * offset,
        );
      }
      layer.lineStyle(1, fxColor, 0.38);
      layer.strokeCircle(x, y, r * (1.35 + Math.sin(phase * 12) * 0.08));
      return;
    }

    if (state === 'attack') {
      layer.lineStyle(4, accent, 0.62);
      layer.lineBetween(x + vx * r * 0.7 - nx * r * 0.7, y + vy * r * 0.7 - ny * r * 0.7, x + vx * r * 1.75, y + vy * r * 1.75);
      layer.lineBetween(x + vx * r * 1.75, y + vy * r * 1.75, x + vx * r * 0.7 + nx * r * 0.7, y + vy * r * 0.7 + ny * r * 0.7);
      layer.lineStyle(1, fxColor, 0.32);
      layer.strokeCircle(x + vx * r * 0.92, y + vy * r * 0.92, r * 0.92);
      return;
    }

    if (state === 'hurt') {
      layer.lineStyle(3, danger, 0.58);
      const corner = r * 0.96;
      layer.lineBetween(x - corner, y - corner, x - corner * 0.28, y - corner * 0.28);
      layer.lineBetween(x + corner, y - corner, x + corner * 0.28, y - corner * 0.28);
      layer.lineBetween(x - corner, y + corner, x - corner * 0.28, y + corner * 0.28);
      layer.lineBetween(x + corner, y + corner, x + corner * 0.28, y + corner * 0.28);
      layer.lineStyle(1, danger, 0.26);
      layer.strokeCircle(x, y, r * 1.35);
      return;
    }

    if (state === 'fire') {
      layer.lineStyle(2, fxColor, 0.52);
      layer.strokeCircle(x, y, r * (1.12 + Math.sin(phase * 14) * 0.05));
      layer.lineBetween(x + vx * r * 0.85, y + vy * r * 0.85, x + vx * r * 1.9, y + vy * r * 1.9);
      layer.fillStyle(fxColor, 0.46);
      layer.fillCircle(x + vx * r * 1.9, y + vy * r * 1.9, Math.max(2, r * 0.12));
      return;
    }

    if (state === 'move') {
      layer.lineStyle(2, xp, 0.32);
      for (let i = -1; i <= 1; i += 2) {
        const step = Math.sin(phase * 10 + i) * r * 0.2;
        layer.lineBetween(
          x - vx * r * 0.78 + nx * i * r * 0.42,
          y - vy * r * 0.78 + ny * i * r * 0.42,
          x - vx * r * (1.28 + step * 0.04) + nx * i * r * 0.62,
          y - vy * r * (1.28 + step * 0.04) + ny * i * r * 0.62,
        );
      }
      layer.lineStyle(1, fxColor, 0.2);
      layer.strokeCircle(x, y, r * 1.05);
      return;
    }

    layer.lineStyle(1, fxColor, 0.18);
    layer.strokeCircle(x, y, r * (1.08 + Math.sin(phase * 3.4) * 0.05));
    layer.lineStyle(1, accent, 0.16);
    layer.lineBetween(x + vx * r * 0.5, y + vy * r * 0.5, x + vx * r * 1.18, y + vy * r * 1.18);
  }

  private currentBossTransitionState() {
    if (!this.boss?.active) return null;
    const patterns: BossPattern[] = this.def.boss?.patterns.length ? [...this.def.boss.patterns] : ['radial-burst'];
    const pattern = ((this.boss.getData('currentPattern') as BossPattern | undefined) ?? patterns[this.bossPatternIndex % patterns.length])!;
    if (this.time.now < this.bossTelegraphUntil || this.bossPatternState === 'telegraph') return `boss-telegraph-${pattern}`;
    if (this.bossPatternState === 'execute' || this.boss.getData('charging') === true) return `boss-execute-${pattern}`;
    return `boss-phase-${this.currentBossPhase() ?? 1}-idle`;
  }

  private updatePlayerRigLayer(time: number) {
    const layer = this.playerRigLayer;
    if (!layer || !this.player?.active) return;
    const state = this.currentPlayerAnimationState(time);
    const x = this.player.x;
    const y = this.player.y;
    const r = this.def.player.radius;
    const angle = facingAngle(this.facing);
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const nx = -vy;
    const ny = vx;
    const phase = time * 0.001;
    const stride = state === 'move' || state === 'dash' ? Math.sin(phase * (state === 'dash' ? 18 : 11)) : Math.sin(phase * 3.4) * 0.25;
    const reach = state === 'attack' ? 1.9 : state === 'fire' ? 1.55 : state === 'dash' ? 1.32 : 1.05;
    const alpha = state === 'hurt' ? 0.62 : state === 'dash' ? 0.68 : 0.48;
    const accent = hex(this.def.palette.accent);
    const projectile = hex(this.def.palette.projectile);
    const xp = hex(this.def.palette.xp);
    const danger = hex(this.def.palette.danger);
    const main = state === 'hurt' ? danger : state === 'dash' ? xp : state === 'fire' ? projectile : accent;
    const hipX = x - vx * r * 0.22;
    const hipY = y - vy * r * 0.22;
    const shoulderX = x + vx * r * 0.18;
    const shoulderY = y + vy * r * 0.18;

    layer.clear();
    if (hasLiteralBackdrop(this.def) && arenaMood(this.def) === 'bakery' && (state === 'idle' || state === 'move')) {
      layer.lineStyle(1, projectile, 0.18);
      layer.lineBetween(x + vx * r * 0.42, y + vy * r * 0.42, x + vx * r * 1.1, y + vy * r * 1.1);
      return;
    }
    layer.lineStyle(2, main, alpha);
    layer.lineBetween(x - vx * r * 0.66, y - vy * r * 0.66, x + vx * r * 0.84, y + vy * r * 0.84);
    layer.lineBetween(shoulderX - nx * r * 0.5, shoulderY - ny * r * 0.5, shoulderX + nx * r * 0.5, shoulderY + ny * r * 0.5);

    layer.lineStyle(2, xp, state === 'dash' ? 0.54 : 0.32);
    for (let i = -1; i <= 1; i += 2) {
      const leg = stride * i * r * 0.22;
      layer.lineBetween(
        hipX + nx * i * r * 0.28,
        hipY + ny * i * r * 0.28,
        hipX - vx * r * (0.92 + Math.abs(stride) * 0.16) + nx * i * r * 0.42 + vx * leg,
        hipY - vy * r * (0.92 + Math.abs(stride) * 0.16) + ny * i * r * 0.42 + vy * leg,
      );
    }

    layer.lineStyle(state === 'attack' ? 4 : 2, state === 'attack' ? accent : projectile, state === 'attack' ? 0.74 : 0.44);
    layer.lineBetween(
      shoulderX - nx * r * 0.44,
      shoulderY - ny * r * 0.44,
      x + vx * r * reach - nx * r * (0.1 + stride * 0.08),
      y + vy * r * reach - ny * r * (0.1 + stride * 0.08),
    );
    layer.lineStyle(2, main, 0.36);
    layer.lineBetween(
      shoulderX + nx * r * 0.44,
      shoulderY + ny * r * 0.44,
      x + vx * r * (0.78 + Math.abs(stride) * 0.18) + nx * r * (0.52 + stride * 0.08),
      y + vy * r * (0.78 + Math.abs(stride) * 0.18) + ny * r * (0.52 + stride * 0.08),
    );

    if (state === 'fire') {
      layer.fillStyle(projectile, 0.72);
      layer.fillCircle(x + vx * r * 1.7, y + vy * r * 1.7, Math.max(2, r * 0.12));
    } else if (state === 'dash') {
      layer.lineStyle(1, xp, 0.34);
      layer.lineBetween(x - vx * r * 0.9 - nx * r * 0.55, y - vy * r * 0.9 - ny * r * 0.55, x - vx * r * 2.2 - nx * r * 0.55, y - vy * r * 2.2 - ny * r * 0.55);
      layer.lineBetween(x - vx * r * 0.9 + nx * r * 0.55, y - vy * r * 0.9 + ny * r * 0.55, x - vx * r * 2.2 + nx * r * 0.55, y - vy * r * 2.2 + ny * r * 0.55);
    } else if (state === 'hurt') {
      layer.lineStyle(2, danger, 0.46);
      layer.strokeCircle(x, y, r * 1.18);
    }
  }

  private attachActorRig(target: ArcadeImage, role: string, radius: number, boss: boolean) {
    const graphics = this.add.graphics()
      .setDepth((boss ? DEPTH.enemy + 1 : DEPTH.enemy) + 0.24)
      .setAlpha(boss ? 0.92 : 0.78);
    const rig: ActorRig = {
      graphics,
      role,
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      radius,
      boss,
    };
    target.setData('actorRig', rig);
    target.once('destroy', () => graphics.destroy());
    this.actorRigFx += boss ? 3 : 1;
  }

  private syncActorRig(enemy: ArcadeImage, radius: number, time: number) {
    const rig = enemy.getData('actorRig') as ActorRig | undefined;
    if (!rig || !rig.graphics.active) return;
    const g = rig.graphics;
    const role = rig.boss ? 'boss' : rig.role;
    const x = enemy.x;
    const y = enemy.y;
    const phase = time * 0.001 + rig.phase;
    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    const moving = Boolean(body && body.velocity.lengthSq() > 10);
    const moveAngle = body && body.velocity.lengthSq() > 4 ? body.velocity.angle() : enemy.rotation - Math.PI / 2;
    const playerAngle = this.player?.active ? Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y) : moveAngle;
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const projectile = hex(this.def.palette.projectile);
    const xp = hex(this.def.palette.xp);
    const vx = Math.cos(moveAngle);
    const vy = Math.sin(moveAngle);
    const nx = -vy;
    const ny = vx;

    g.clear();
    g.setDepth(enemy.depth + 0.24);
    if (this.visualEvidenceModeActive(time) && hasLiteralBackdrop(this.def)) {
      g.setAlpha(0);
      return;
    }
    g.setAlpha(rig.boss ? 0.92 : 0.78);

    if (role === 'boss') {
      const transition = this.currentBossTransitionState() ?? 'boss-phase-1-idle';
      const bossPhase = this.currentBossPhase() ?? 1;
      const telegraph = transition.includes('telegraph');
      const execute = transition.includes('execute');
      const pulse = telegraph ? 0.16 + Math.sin(phase * 10) * 0.06 : execute ? 0.1 + Math.sin(phase * 14) * 0.04 : Math.sin(phase * 2.8) * 0.03;
      const halo = radius * (1.36 + bossPhase * 0.08 + pulse);
      this.bossTransitionState = transition;
      this.bossTransitionFx = Math.max(this.bossTransitionFx, 7 + bossPhase * 2 + (telegraph ? 3 : execute ? 4 : 0));
      if (!this.enemyAnimationStates.includes(transition)) this.enemyAnimationStates.push(transition);
      if (!this.enemyAnimationStates.includes('boss-transition-rig')) this.enemyAnimationStates.push('boss-transition-rig');

      const faceX = Math.cos(playerAngle);
      const faceY = Math.sin(playerAngle);
      const sideX = -faceY;
      const sideY = faceX;
      g.fillStyle(0x050607, 0.46);
      g.fillEllipse(x - faceX * radius * 0.1, y - faceY * radius * 0.1, radius * 2.28, radius * 1.58);
      g.fillTriangle(
        x + faceX * radius * 0.56 + sideX * radius * 0.5,
        y + faceY * radius * 0.56 + sideY * radius * 0.5,
        x + faceX * radius * 1.58,
        y + faceY * radius * 1.58,
        x + faceX * radius * 0.56 - sideX * radius * 0.5,
        y + faceY * radius * 0.56 - sideY * radius * 0.5,
      );
      g.fillStyle(0x000000, 0.64);
      g.fillTriangle(
        x + faceX * radius * 0.18 + sideX * radius * 0.56,
        y + faceY * radius * 0.18 + sideY * radius * 0.56,
        x + faceX * radius * 0.72 + sideX * radius * 1.12,
        y + faceY * radius * 0.72 + sideY * radius * 1.12,
        x + faceX * radius * 0.78 + sideX * radius * 0.34,
        y + faceY * radius * 0.78 + sideY * radius * 0.34,
      );
      g.fillTriangle(
        x + faceX * radius * 0.18 - sideX * radius * 0.56,
        y + faceY * radius * 0.18 - sideY * radius * 0.56,
        x + faceX * radius * 0.72 - sideX * radius * 1.12,
        y + faceY * radius * 0.72 - sideY * radius * 1.12,
        x + faceX * radius * 0.78 - sideX * radius * 0.34,
        y + faceY * radius * 0.78 - sideY * radius * 0.34,
      );
      g.lineStyle(5, 0x050607, 0.56);
      for (let claw = -1; claw <= 1; claw += 2) {
        g.lineBetween(
          x - faceX * radius * 0.18 + sideX * radius * 0.72 * claw,
          y - faceY * radius * 0.18 + sideY * radius * 0.72 * claw,
          x - faceX * radius * 0.58 + sideX * radius * 1.34 * claw,
          y - faceY * radius * 0.58 + sideY * radius * 1.34 * claw,
        );
      }

      g.lineStyle(4, telegraph ? xp : execute ? danger : accent, telegraph ? 0.52 : execute ? 0.62 : 0.34);
      g.strokeCircle(x, y, halo);
      g.lineStyle(2, projectile, telegraph ? 0.42 : 0.24);
      g.strokeCircle(x, y, radius * (0.94 + bossPhase * 0.04));
      for (let i = 0; i < 6; i++) {
        const angle = phase * (telegraph ? 1.45 : 0.75) + i * Math.PI / 3;
        const inner = radius * (0.72 + (i % 2) * 0.16);
        const outer = halo * (0.9 + (execute ? 0.14 : 0));
        g.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      }
      g.fillStyle(0x000000, 0.34);
      g.fillTriangle(
        x + faceX * radius * 0.68 + sideX * radius * 0.52,
        y + faceY * radius * 0.68 + sideY * radius * 0.52,
        x + faceX * radius * 1.42 + sideX * radius * 0.98,
        y + faceY * radius * 1.42 + sideY * radius * 0.98,
        x + faceX * radius * 0.92 + sideX * radius * 0.08,
        y + faceY * radius * 0.92 + sideY * radius * 0.08,
      );
      g.fillTriangle(
        x + faceX * radius * 0.68 - sideX * radius * 0.52,
        y + faceY * radius * 0.68 - sideY * radius * 0.52,
        x + faceX * radius * 1.42 - sideX * radius * 0.98,
        y + faceY * radius * 1.42 - sideY * radius * 0.98,
        x + faceX * radius * 0.92 - sideX * radius * 0.08,
        y + faceY * radius * 0.92 - sideY * radius * 0.08,
      );
      g.fillStyle(telegraph ? xp : danger, telegraph ? 0.58 : 0.46);
      g.fillCircle(x + faceX * radius * 0.48 + sideX * radius * 0.24, y + faceY * radius * 0.48 + sideY * radius * 0.24, Math.max(3, radius * 0.11));
      g.fillCircle(x + faceX * radius * 0.48 - sideX * radius * 0.24, y + faceY * radius * 0.48 - sideY * radius * 0.24, Math.max(3, radius * 0.11));
      g.lineStyle(4, 0x000000, 0.3);
      g.lineBetween(x - sideX * radius * 0.92, y - sideY * radius * 0.92, x - sideX * radius * 1.34 - faceX * radius * 0.22, y - sideY * radius * 1.34 - faceY * radius * 0.22);
      g.lineBetween(x + sideX * radius * 0.92, y + sideY * radius * 0.92, x + sideX * radius * 1.34 - faceX * radius * 0.22, y + sideY * radius * 1.34 - faceY * radius * 0.22);
      if (telegraph || execute) {
        g.fillStyle(execute ? danger : xp, execute ? 0.28 : 0.2);
        for (let i = 0; i < 3; i++) {
          const angle = playerAngle + (i - 1) * 0.42;
          g.fillCircle(x + Math.cos(angle) * halo * 0.72, y + Math.sin(angle) * halo * 0.72, Math.max(3, radius * 0.13));
        }
      }
      return;
    }

    const fire = (enemy.getData('fire') as number | undefined) ?? 0;
    const chargeMax = role === 'charger' ? 2.25 : role === 'sniper' ? 2.35 : role === 'sentinel' ? 2.05 : role === 'support' ? 1.9 : role === 'guardian' ? 1.7 : role === 'sapper' ? 1.85 : role === 'shooter' ? 1.55 : 1;
    const charge = clamp(fire / chargeMax, 0, 1);
    const stride = Math.sin(phase * (moving ? 8.4 : 2.8));
    const hipX = x - vx * radius * 0.12;
    const hipY = y - vy * radius * 0.12;
    const shoulderX = x + vx * radius * 0.2;
    const shoulderY = y + vy * radius * 0.2;
    const rigState = (() => {
      if (role === 'shooter') return `shooter-rig-${charge > 0.72 ? 'ready' : 'aim'}`;
      if (role === 'sniper') return `sniper-rig-${charge > 0.76 ? 'lock' : 'aim'}`;
      if (role === 'sapper') return `sapper-rig-${charge > 0.72 ? 'plant' : 'arm'}`;
      if (role === 'support') return `support-rig-${charge > 0.72 ? 'channel' : 'ready'}`;
      if (role === 'guardian') return `guardian-rig-${charge > 0.68 ? 'shield' : 'brace'}`;
      if (role === 'sentinel') return `sentinel-rig-${charge > 0.72 ? 'burst' : 'lock'}`;
      if (role === 'charger') return `charger-rig-${charge > 0.68 ? 'coil' : 'track'}`;
      if (role === 'brute') return 'brute-rig-guard';
      if (role === 'orbiter') return 'orbiter-rig-loop';
      if (role === 'wanderer') return 'wanderer-rig-drift';
      return 'chaser-rig-stride';
    })();
    if (!this.enemyAnimationStates.includes(rigState)) this.enemyAnimationStates.push(rigState);

    g.lineStyle(2, role === 'charger' || role === 'sapper' ? danger : role === 'support' ? xp : role === 'guardian' || role === 'sentinel' ? projectile : role === 'shooter' || role === 'sniper' ? projectile : accent, 0.34);
    g.lineBetween(x - vx * radius * 0.68, y - vy * radius * 0.68, x + vx * radius * 0.78, y + vy * radius * 0.78);
    g.lineBetween(shoulderX - nx * radius * 0.48, shoulderY - ny * radius * 0.48, shoulderX + nx * radius * 0.48, shoulderY + ny * radius * 0.48);
    g.lineStyle(2, xp, 0.24);
    for (let i = -1; i <= 1; i += 2) {
      g.lineBetween(
        hipX + nx * i * radius * 0.32,
        hipY + ny * i * radius * 0.32,
        hipX - vx * radius * (0.86 + Math.abs(stride) * 0.12) + nx * i * radius * (0.48 + stride * 0.08),
        hipY - vy * radius * (0.86 + Math.abs(stride) * 0.12) + ny * i * radius * (0.48 + stride * 0.08),
      );
    }

    if (role === 'shooter') {
      const aimX = Math.cos(playerAngle);
      const aimY = Math.sin(playerAngle);
      const sideX = -aimY;
      const sideY = aimX;
      g.lineStyle(3, projectile, 0.38 + charge * 0.32);
      g.lineBetween(x + sideX * radius * 0.18, y + sideY * radius * 0.18, x + aimX * radius * (1.35 + charge * 0.62), y + aimY * radius * (1.35 + charge * 0.62));
      g.fillStyle(projectile, 0.28 + charge * 0.32);
      g.fillCircle(x + aimX * radius * (1.45 + charge * 0.7), y + aimY * radius * (1.45 + charge * 0.7), Math.max(2, radius * 0.1));
      return;
    }

    if (role === 'sniper') {
      const aimX = Math.cos(playerAngle);
      const aimY = Math.sin(playerAngle);
      const sideX = -aimY;
      const sideY = aimX;
      g.lineStyle(3, xp, 0.34 + charge * 0.42);
      g.lineBetween(x + sideX * radius * 0.12, y + sideY * radius * 0.12, x + aimX * radius * (1.7 + charge * 1.15), y + aimY * radius * (1.7 + charge * 1.15));
      g.lineStyle(1, projectile, 0.24 + charge * 0.36);
      g.strokeCircle(x + aimX * radius * (1.62 + charge * 0.95), y + aimY * radius * (1.62 + charge * 0.95), Math.max(3, radius * (0.13 + charge * 0.08)));
      g.fillStyle(xp, 0.26 + charge * 0.34);
      g.fillCircle(x + aimX * radius * (1.86 + charge * 1.08), y + aimY * radius * (1.86 + charge * 1.08), Math.max(2, radius * 0.1));
      return;
    }

    if (role === 'sapper') {
      const aimX = Math.cos(playerAngle);
      const aimY = Math.sin(playerAngle);
      const sideX = -aimY;
      const sideY = aimX;
      const dropX = x - aimX * radius * (0.68 + charge * 0.28);
      const dropY = y - aimY * radius * (0.68 + charge * 0.28);
      g.lineStyle(2, danger, 0.28 + charge * 0.34);
      g.lineBetween(x - sideX * radius * 0.34, y - sideY * radius * 0.34, dropX, dropY);
      g.lineBetween(x + sideX * radius * 0.34, y + sideY * radius * 0.34, dropX, dropY);
      g.lineStyle(2, projectile, 0.2 + charge * 0.34);
      g.strokeCircle(dropX, dropY, radius * (0.36 + charge * 0.22));
      g.fillStyle(danger, 0.22 + charge * 0.28);
      g.fillCircle(dropX, dropY, radius * (0.18 + charge * 0.12));
      return;
    }

    if (role === 'support') {
      g.lineStyle(2, xp, 0.28 + charge * 0.34);
      g.strokeCircle(x, y, radius * (0.88 + charge * 0.42));
      g.lineStyle(2, accent, 0.22 + charge * 0.28);
      g.strokeCircle(x, y, radius * (1.18 + charge * 0.55));
      g.fillStyle(xp, 0.3 + charge * 0.26);
      for (let i = 0; i < 3; i++) {
        const angle = phase * 1.8 + i * Math.PI * 2 / 3;
        g.fillCircle(x + Math.cos(angle) * radius * (1.12 + charge * 0.28), y + Math.sin(angle) * radius * (1.12 + charge * 0.28), Math.max(2, radius * 0.1));
      }
      return;
    }

    if (role === 'guardian') {
      g.lineStyle(3, projectile, 0.3 + charge * 0.34);
      g.strokeCircle(x, y, radius * (1.02 + charge * 0.42));
      g.lineStyle(2, accent, 0.22 + charge * 0.3);
      g.beginPath();
      g.arc(x, y, radius * (1.34 + charge * 0.7), playerAngle - 1.05, playerAngle + 1.05, false);
      g.strokePath();
      g.lineStyle(3, projectile, 0.28 + charge * 0.32);
      g.lineBetween(x - nx * radius * 0.72, y - ny * radius * 0.72, x - nx * radius * 0.72 + vx * radius * 0.82, y - ny * radius * 0.72 + vy * radius * 0.82);
      g.lineBetween(x + nx * radius * 0.72, y + ny * radius * 0.72, x + nx * radius * 0.72 + vx * radius * 0.82, y + ny * radius * 0.72 + vy * radius * 0.82);
      return;
    }

    if (role === 'sentinel') {
      const aimX = Math.cos(playerAngle);
      const aimY = Math.sin(playerAngle);
      const sideX = -aimY;
      const sideY = aimX;
      g.lineStyle(2, projectile, 0.3 + charge * 0.34);
      g.strokeCircle(x, y, radius * (0.9 + charge * 0.24));
      g.lineStyle(3, danger, 0.24 + charge * 0.4);
      g.lineBetween(x, y, x + aimX * radius * (1.45 + charge * 1.1), y + aimY * radius * (1.45 + charge * 1.1));
      g.lineStyle(2, projectile, 0.18 + charge * 0.32);
      g.lineBetween(x + sideX * radius * 0.36, y + sideY * radius * 0.36, x + aimX * radius * (1.18 + charge * 0.78) + sideX * radius * 0.36, y + aimY * radius * (1.18 + charge * 0.78) + sideY * radius * 0.36);
      g.lineBetween(x - sideX * radius * 0.36, y - sideY * radius * 0.36, x + aimX * radius * (1.18 + charge * 0.78) - sideX * radius * 0.36, y + aimY * radius * (1.18 + charge * 0.78) - sideY * radius * 0.36);
      g.fillStyle(projectile, 0.24 + charge * 0.28);
      g.fillCircle(x, y, Math.max(3, radius * (0.14 + charge * 0.08)));
      return;
    }

    if (role === 'charger') {
      const aimX = Math.cos(playerAngle);
      const aimY = Math.sin(playerAngle);
      const sideX = -aimY;
      const sideY = aimX;
      g.lineStyle(3, danger, 0.32 + charge * 0.32);
      g.lineBetween(x + sideX * radius * 0.52, y + sideY * radius * 0.52, x + aimX * radius * (1.12 + charge * 0.6), y + aimY * radius * (1.12 + charge * 0.6));
      g.lineBetween(x - sideX * radius * 0.52, y - sideY * radius * 0.52, x + aimX * radius * (1.12 + charge * 0.6), y + aimY * radius * (1.12 + charge * 0.6));
      return;
    }

    if (role === 'brute') {
      g.lineStyle(4, accent, 0.34);
      g.lineBetween(x - nx * radius * 0.86, y - ny * radius * 0.86, x - nx * radius * 0.86 + vx * radius * 0.46, y - ny * radius * 0.86 + vy * radius * 0.46);
      g.lineBetween(x + nx * radius * 0.86, y + ny * radius * 0.86, x + nx * radius * 0.86 + vx * radius * 0.46, y + ny * radius * 0.86 + vy * radius * 0.46);
      return;
    }

    if (role === 'orbiter' || role === 'wanderer') {
      const dots = role === 'orbiter' ? 2 : 3;
      g.fillStyle(xp, 0.52);
      for (let i = 0; i < dots; i++) {
        const angle = phase * (role === 'orbiter' ? 2.3 : 1.1) + i * (Math.PI * 2 / dots);
        g.fillCircle(x + Math.cos(angle) * radius * 1.14, y + Math.sin(angle) * radius * 1.14, Math.max(2, radius * 0.11));
      }
    }
  }

  private attachActorTell(target: ArcadeImage, role: string, radius: number, boss: boolean) {
    const graphics = this.add.graphics()
      .setDepth((boss ? DEPTH.enemy + 1 : DEPTH.enemy) + 0.16)
      .setAlpha(boss ? 0.9 : 0.82);
    const tell: ActorTell = {
      graphics,
      role,
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      radius,
      boss,
    };
    target.setData('actorTell', tell);
    target.once('destroy', () => graphics.destroy());
    this.actorAnimationFx += 1;
  }

  private syncActorTell(enemy: ArcadeImage, radius: number, time: number) {
    const tell = enemy.getData('actorTell') as ActorTell | undefined;
    if (!tell || !tell.graphics.active) return;
    const role = tell.boss ? 'boss' : tell.role;
    const g = tell.graphics;
    const x = enemy.x;
    const y = enemy.y;
    const phase = time * 0.001 + tell.phase;
    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    const velocityAngle = body && body.velocity.lengthSq() > 4 ? body.velocity.angle() : enemy.rotation - Math.PI / 2;
    const playerAngle = this.player?.active ? Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y) : velocityAngle;
    const accent = hex(this.def.palette.accent);
    const danger = hex(this.def.palette.danger);
    const projectile = hex(this.def.palette.projectile);
    const xp = hex(this.def.palette.xp);
    const fire = (enemy.getData('fire') as number | undefined) ?? 0;
    const chargeMax = role === 'charger' ? 2.25 : role === 'sniper' ? 2.35 : role === 'sentinel' ? 2.05 : role === 'support' ? 1.9 : role === 'guardian' ? 1.7 : role === 'sapper' ? 1.85 : role === 'shooter' ? 1.55 : 1;
    const charge = clamp(fire / chargeMax, 0, 1);
    const color = role === 'boss'
      ? danger
      : role === 'shooter'
        ? projectile
        : role === 'sniper'
          ? xp
        : role === 'support'
          ? xp
        : role === 'guardian'
          ? projectile
        : role === 'sentinel'
          ? projectile
        : role === 'sapper'
          ? danger
        : role === 'charger'
          ? danger
          : role === 'orbiter' || role === 'wanderer'
            ? xp
            : accent;
    const state = role === 'boss'
      ? 'boss-phase'
      : role === 'shooter'
        ? (charge > 0.72 ? 'shooter-ready' : 'shooter-aim')
        : role === 'sniper'
        ? (charge > 0.76 ? 'sniper-lock' : 'sniper-aim')
        : role === 'support'
          ? (charge > 0.72 ? 'support-channel' : 'support-ready')
          : role === 'guardian'
            ? (charge > 0.68 ? 'guardian-shield' : 'guardian-brace')
          : role === 'sentinel'
            ? (charge > 0.72 ? 'sentinel-burst' : 'sentinel-lock')
          : role === 'sapper'
            ? (charge > 0.72 ? 'sapper-plant' : 'sapper-arm')
            : role === 'charger'
              ? (charge > 0.68 ? 'charger-windup' : 'charger-track')
              : role === 'orbiter'
                ? 'orbiter-loop'
                : role === 'wanderer'
                  ? 'wanderer-drift'
                  : role === 'brute'
                    ? 'brute-guard'
                    : 'chaser-lean';
    if (!this.enemyAnimationStates.includes(state)) this.enemyAnimationStates.push(state);

    g.clear();
    if (this.visualEvidenceModeActive(time) && hasLiteralBackdrop(this.def)) {
      g.setAlpha(0);
      return;
    }
    g.setAlpha(tell.boss ? 0.9 : 0.82);
    g.lineStyle(role === 'boss' ? 7 : 4, 0x000000, isBrightPalette(this.def) ? 0.6 : 0.28);
    g.strokeCircle(x, y, radius * (role === 'boss' ? 1.5 : 1.2));
    g.lineStyle(role === 'boss' ? 3 : 2, 0xffffff, isBrightPalette(this.def) ? 0.48 : 0.2);
    g.strokeCircle(x, y, radius * (role === 'boss' ? 1.22 : 1.04));
    if (role === 'boss') {
      const bossPhase = this.currentBossPhase() ?? 1;
      g.lineStyle(3, danger, 0.34);
      g.strokeCircle(x, y, radius * (1.18 + bossPhase * 0.04 + Math.sin(phase * 2.4) * 0.03));
      g.lineStyle(1, projectile, 0.24);
      for (let i = 0; i < 4; i++) {
        const angle = phase * 0.9 + i * Math.PI / 2;
        g.lineBetween(x + Math.cos(angle) * radius * 0.82, y + Math.sin(angle) * radius * 0.82, x + Math.cos(angle) * radius * 1.34, y + Math.sin(angle) * radius * 1.34);
      }
      const faceX = Math.cos(playerAngle);
      const faceY = Math.sin(playerAngle);
      const sideX = -faceY;
      const sideY = faceX;
      g.fillStyle(0x000000, isBrightPalette(this.def) ? 0.5 : 0.32);
      g.fillTriangle(
        x + faceX * radius * 0.68 + sideX * radius * 0.48,
        y + faceY * radius * 0.68 + sideY * radius * 0.48,
        x + faceX * radius * 1.34 + sideX * radius * 0.9,
        y + faceY * radius * 1.34 + sideY * radius * 0.9,
        x + faceX * radius * 0.92 + sideX * radius * 0.06,
        y + faceY * radius * 0.92 + sideY * radius * 0.06,
      );
      g.fillTriangle(
        x + faceX * radius * 0.68 - sideX * radius * 0.48,
        y + faceY * radius * 0.68 - sideY * radius * 0.48,
        x + faceX * radius * 1.34 - sideX * radius * 0.9,
        y + faceY * radius * 1.34 - sideY * radius * 0.9,
        x + faceX * radius * 0.92 - sideX * radius * 0.06,
        y + faceY * radius * 0.92 - sideY * radius * 0.06,
      );
      g.fillStyle(xp, 0.58);
      g.fillCircle(x + faceX * radius * 0.46 + sideX * radius * 0.23, y + faceY * radius * 0.46 + sideY * radius * 0.23, Math.max(3, radius * 0.1));
      g.fillCircle(x + faceX * radius * 0.46 - sideX * radius * 0.23, y + faceY * radius * 0.46 - sideY * radius * 0.23, Math.max(3, radius * 0.1));
      return;
    }

    if (role === 'shooter') {
      const reach = radius * (1.05 + charge * 0.82);
      g.lineStyle(2, projectile, 0.24 + charge * 0.26);
      g.lineBetween(x, y, x + Math.cos(playerAngle) * reach, y + Math.sin(playerAngle) * reach);
      g.strokeCircle(x, y, radius * (0.86 + charge * 0.12));
      g.fillStyle(projectile, 0.36 + charge * 0.22);
      g.fillCircle(x + Math.cos(playerAngle) * reach, y + Math.sin(playerAngle) * reach, Math.max(2, radius * 0.12));
      return;
    }

    if (role === 'sniper') {
      const reach = radius * (1.42 + charge * 1.48);
      const focusX = x + Math.cos(playerAngle) * reach;
      const focusY = y + Math.sin(playerAngle) * reach;
      g.lineStyle(2, xp, 0.22 + charge * 0.36);
      g.lineBetween(x, y, focusX, focusY);
      g.lineStyle(1, projectile, 0.18 + charge * 0.28);
      g.strokeCircle(focusX, focusY, radius * (0.16 + charge * 0.16));
      g.strokeCircle(x, y, radius * (0.78 + charge * 0.2));
      g.fillStyle(xp, 0.28 + charge * 0.28);
      g.fillCircle(focusX, focusY, Math.max(2, radius * 0.1));
      return;
    }

    if (role === 'sapper') {
      const vx = Math.cos(playerAngle);
      const vy = Math.sin(playerAngle);
      const dropX = x - vx * radius * (0.72 + charge * 0.32);
      const dropY = y - vy * radius * (0.72 + charge * 0.32);
      g.lineStyle(2, danger, 0.22 + charge * 0.34);
      g.strokeCircle(dropX, dropY, radius * (0.42 + charge * 0.26));
      g.lineStyle(1, projectile, 0.18 + charge * 0.28);
      g.strokeCircle(x, y, radius * (0.82 + charge * 0.12));
      g.fillStyle(danger, 0.28 + charge * 0.28);
      g.fillCircle(dropX, dropY, Math.max(2, radius * (0.12 + charge * 0.08)));
      return;
    }

    if (role === 'support') {
      g.lineStyle(2, xp, 0.24 + charge * 0.34);
      g.strokeCircle(x, y, radius * (0.8 + charge * 0.42));
      g.lineStyle(1, accent, 0.22 + charge * 0.28);
      g.strokeCircle(x, y, radius * (1.12 + charge * 0.6));
      g.fillStyle(xp, 0.48 + charge * 0.24);
      for (let i = 0; i < 3; i++) {
        const orbit = phase * 1.9 + i * Math.PI * 2 / 3;
        g.fillCircle(x + Math.cos(orbit) * radius * (1 + charge * 0.24), y + Math.sin(orbit) * radius * (1 + charge * 0.24), Math.max(2, radius * 0.11));
      }
      return;
    }

    if (role === 'guardian') {
      g.lineStyle(2, projectile, 0.24 + charge * 0.34);
      g.strokeCircle(x, y, radius * (0.86 + charge * 0.38));
      g.lineStyle(2, accent, 0.2 + charge * 0.32);
      g.beginPath();
      g.arc(x, y, radius * (1.24 + charge * 0.68), playerAngle - 1.08, playerAngle + 1.08, false);
      g.strokePath();
      g.fillStyle(projectile, 0.24 + charge * 0.26);
      g.fillCircle(x + Math.cos(playerAngle) * radius * 0.72, y + Math.sin(playerAngle) * radius * 0.72, Math.max(3, radius * (0.13 + charge * 0.08)));
      return;
    }

    if (role === 'sentinel') {
      const reach = radius * (1.28 + charge * 1.2);
      const side = radius * (0.28 + charge * 0.16);
      const aimX = Math.cos(playerAngle);
      const aimY = Math.sin(playerAngle);
      const sideX = -aimY;
      const sideY = aimX;
      g.lineStyle(2, projectile, 0.22 + charge * 0.34);
      g.strokeCircle(x, y, radius * (0.8 + charge * 0.2));
      g.lineStyle(2, danger, 0.2 + charge * 0.38);
      g.lineBetween(x, y, x + aimX * reach, y + aimY * reach);
      g.lineStyle(1, projectile, 0.18 + charge * 0.28);
      g.lineBetween(x + sideX * side, y + sideY * side, x + aimX * reach + sideX * side, y + aimY * reach + sideY * side);
      g.lineBetween(x - sideX * side, y - sideY * side, x + aimX * reach - sideX * side, y + aimY * reach - sideY * side);
      g.fillStyle(projectile, 0.28 + charge * 0.28);
      g.fillCircle(x, y, Math.max(3, radius * (0.12 + charge * 0.08)));
      return;
    }

    if (role === 'charger') {
      const vx = Math.cos(playerAngle);
      const vy = Math.sin(playerAngle);
      const nx = -vy;
      const ny = vx;
      const reach = radius * (1.35 + charge * 0.9);
      g.lineStyle(2, danger, 0.2 + charge * 0.35);
      g.lineBetween(x + nx * radius * 0.55, y + ny * radius * 0.55, x + vx * reach, y + vy * reach);
      g.lineBetween(x - nx * radius * 0.55, y - ny * radius * 0.55, x + vx * reach, y + vy * reach);
      g.strokeCircle(x, y, radius * (0.92 + charge * 0.18));
      return;
    }

    if (role === 'orbiter') {
      g.lineStyle(1, xp, 0.24);
      g.strokeCircle(x, y, radius * 1.22);
      g.fillStyle(xp, 0.58);
      for (let i = 0; i < 2; i++) {
        const angle = phase * 2.4 + i * Math.PI;
        g.fillCircle(x + Math.cos(angle) * radius * 1.22, y + Math.sin(angle) * radius * 1.22, Math.max(2, radius * 0.13));
      }
      return;
    }

    if (role === 'wanderer') {
      g.lineStyle(2, xp, 0.2);
      for (let i = 0; i < 3; i++) {
        const angle = phase + i * 2.1;
        g.lineBetween(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7, x + Math.cos(angle + 0.45) * radius * 1.16, y + Math.sin(angle + 0.45) * radius * 1.16);
      }
      return;
    }

    if (role === 'brute') {
      const sway = Math.sin(phase * 1.8) * radius * 0.08;
      g.lineStyle(3, accent, 0.32);
      g.lineBetween(x - radius * 0.86, y - radius * 0.48 + sway, x - radius * 0.86, y + radius * 0.48 + sway);
      g.lineBetween(x + radius * 0.86, y - radius * 0.48 - sway, x + radius * 0.86, y + radius * 0.48 - sway);
      g.lineStyle(1, projectile, 0.18);
      g.strokeCircle(x, y, radius * 1.03);
      return;
    }

    const lean = radius * (0.9 + Math.sin(phase * 3.2) * 0.08);
    g.lineStyle(2, color, 0.3);
    g.lineBetween(x + Math.cos(velocityAngle - 0.48) * radius * 0.54, y + Math.sin(velocityAngle - 0.48) * radius * 0.54, x + Math.cos(velocityAngle) * lean, y + Math.sin(velocityAngle) * lean);
    g.lineBetween(x + Math.cos(velocityAngle + 0.48) * radius * 0.54, y + Math.sin(velocityAngle + 0.48) * radius * 0.54, x + Math.cos(velocityAngle) * lean, y + Math.sin(velocityAngle) * lean);
  }

  private afterimage(target: ArcadeImage, color: string, alpha: number, duration: number) {
    if (!target.active) return;
    const ghost = this.add.image(target.x, target.y, target.texture.key)
      .setDepth(target.depth - 0.12)
      .setRotation(target.rotation)
      .setScale(target.scaleX, target.scaleY)
      .setTint(hex(color))
      .setAlpha(alpha);
    ghost.setFrame(target.frame.name);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: target.scaleX * 1.18,
      scaleY: target.scaleY * 1.18,
      duration,
      ease: 'Sine.Out',
      onComplete: () => ghost.destroy(),
    });
  }

  private projectileMuzzleFlash(x: number, y: number, color: string, angle: number) {
    const flash = this.add.circle(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8, 5, hex(color), 0.45)
      .setDepth(DEPTH.fx);
    this.tweens.add({
      targets: flash,
      x: x + Math.cos(angle) * 22,
      y: y + Math.sin(angle) * 22,
      scale: 0.2,
      alpha: 0,
      duration: 180,
      ease: 'Sine.Out',
      onComplete: () => flash.destroy(),
    });
  }

  private floatDamage(x: number, y: number, amount: number, color: string) {
    this.combatFeedbackUntil = Math.max(this.combatFeedbackUntil, this.time.now + 620);
    const label = this.add.text(x, y, `-${Math.max(1, Math.ceil(amount))}`, {
      ...TEXT,
      fontSize: '13px',
      fontStyle: '700',
      color,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 1);
    this.tweens.add({
      targets: label,
      y: y - 28,
      alpha: 0,
      scale: 1.18,
      duration: 620,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  private floatHeal(x: number, y: number, amount: number, color: string) {
    this.combatFeedbackUntil = Math.max(this.combatFeedbackUntil, this.time.now + 760);
    const label = this.add.text(x, y, `+${Math.max(1, Math.ceil(amount))}`, {
      ...TEXT,
      fontSize: '13px',
      fontStyle: '800',
      color,
      stroke: '#10131a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 1);
    this.tweens.add({
      targets: label,
      y: y - 30,
      alpha: 0,
      scale: 1.22,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  private sparkBurst(x: number, y: number, color: string, count: number) {
    const base = hex(color);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.18, 0.18);
      const distance = Phaser.Math.Between(12, 34);
      const spark = this.add.circle(x, y, Phaser.Math.FloatBetween(1.5, 3.4), base, 0.72)
        .setDepth(DEPTH.fx + 0.2);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.18,
        duration: Phaser.Math.Between(160, 310),
        ease: 'Quad.Out',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private damageFlash() {
    const flash = this.add.rectangle(0, 0, this.scale.width, this.scale.height, hex(this.def.palette.danger), 0.16)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay - 1);
    this.tweens.add({ targets: flash, alpha: 0, duration: 160, onComplete: () => flash.destroy() });
  }

  private impactShake(intensity: number, durationMs: number) {
    this.cameras.main.shake(durationMs, intensity * this.cameraShakeScale(), true);
  }

  private win() { this.end('win'); }
  private lose() { this.end('lose'); }

  private end(scene: 'win' | 'lose') {
    if (this.over) return;
    this.over = true;
    this.physics.pause();
    this.scene.stop('forge');
    this.scene.start(scene, { def: this.def, score: this.score });
  }
}

function drawArenaDressing(scene: Phaser.Scene, def: GameDefinition, w: number, h: number) {
  const accent = hex(def.palette.accent);
  const danger = hex(def.palette.danger);
  const floor = hex(def.palette.floor);
  const bg = hex(def.palette.background);
  const xp = hex(def.palette.xp);
  const seed = stableHash(`${def.title}:${def.theme}:${def.arena.name}`);
  const mood = arenaMood(def);
  const quietTemplate = isQuietLiteralBackdropTemplate(def);
  const literalBackdrop = hasLiteralBackdrop(def);
  const quietAlpha = literalBackdrop ? 0.015 : 0.38;
  const g = scene.add.graphics()
    .setDepth(DEPTH.decor)
    .setAlpha(quietTemplate ? quietAlpha : mood === 'coast' ? 0.58 : 1);
  const inset = Math.min(68, Math.max(34, Math.min(w, h) * 0.085));
  const cx = w / 2;
  const cy = h / 2;

  drawLaneGlow(g, w, h, inset, accent, danger);
  drawCornerRooms(g, w, h, inset, bg, floor, accent, danger, mood);
  drawCentralLandmark(g, cx, cy, Math.min(w, h), floor, accent, danger, xp, mood);
  drawThemeProps(g, def, w, h, inset, seed, mood);
  const anchorCount = drawCombatPocketAnchors(g, w, h, inset, seed, mood, { bg, floor, accent, danger, xp });
  drawReadableCombatPocket(g, cx, cy, Math.min(w, h), accent, bg);

  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? inset + 26 : w - inset - 26;
    const y = i % 2 === 0 ? inset + 26 : h - inset - 26;
    const plate = scene.add.rectangle(x, y, 38, 18, bg, literalBackdrop ? 0.025 : 0.18)
      .setDepth(DEPTH.decor + 0.02)
      .setRotation((i % 2 ? -1 : 1) * 0.35);
    scene.tweens.add({
      targets: plate,
      alpha: literalBackdrop ? { from: 0.01, to: 0.04 } : { from: 0.12, to: 0.34 },
      duration: 1400 + i * 170,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  return anchorCount + 4;
}

function drawForegroundDressing(scene: Phaser.Scene, def: GameDefinition, w: number, h: number) {
  const accent = hex(def.palette.accent);
  const danger = hex(def.palette.danger);
  const floor = hex(def.palette.floor);
  const bg = hex(def.palette.background);
  const xp = hex(def.palette.xp);
  const mood = arenaMood(def);
  const quietTemplate = isQuietLiteralBackdropTemplate(def);
  if (quietTemplate && hasLiteralBackdrop(def)) return;
  const quietAlpha = hasLiteralBackdrop(def) ? 0.012 : 0.36;
  const g = scene.add.graphics()
    .setDepth(DEPTH.foreground)
    .setAlpha(quietTemplate ? quietAlpha : mood === 'coast' ? 0.52 : 1);
  const seed = stableHash(`${def.title}:${def.theme}:${def.arena.name}:foreground`);
  const inset = Math.min(68, Math.max(34, Math.min(w, h) * 0.085));

  drawForegroundFrame(g, w, h, inset, bg, floor, accent, danger, mood);
  drawMoodEdgeFixtures(g, w, h, inset, seed, mood, { bg, floor, accent, danger, xp });
  if (!hasLiteralBackdrop(def)) drawForegroundLights(scene, w, h, inset, seed, mood, { accent, danger, xp });
}

function drawForegroundFrame(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  inset: number,
  bg: number,
  floor: number,
  accent: number,
  danger: number,
  mood: ArenaMood,
) {
  const band = Math.max(12, inset * 0.34);
  const alpha = mood === 'space' || mood === 'security' ? 0.28 : 0.34;
  g.fillStyle(0x000000, 0.18);
  g.fillRect(0, 0, w, band * 0.68);
  g.fillRect(0, h - band * 0.68, w, band * 0.68);
  g.fillRect(0, 0, band * 0.54, h);
  g.fillRect(w - band * 0.54, 0, band * 0.54, h);

  g.fillStyle(bg, alpha);
  g.fillRoundedRect(inset - 12, inset - 18, Math.min(240, w * 0.25), band, 8);
  g.fillRoundedRect(w - inset - Math.min(240, w * 0.25) + 12, inset - 18, Math.min(240, w * 0.25), band, 8);
  g.fillRoundedRect(inset - 12, h - inset - band + 18, Math.min(240, w * 0.25), band, 8);
  g.fillRoundedRect(w - inset - Math.min(240, w * 0.25) + 12, h - inset - band + 18, Math.min(240, w * 0.25), band, 8);

  g.fillStyle(floor, 0.22);
  g.fillRoundedRect(inset + 12, inset - 9, Math.min(146, w * 0.15), 8, 4);
  g.fillRoundedRect(w - inset - Math.min(146, w * 0.15) - 12, h - inset + 1, Math.min(146, w * 0.15), 8, 4);

  g.lineStyle(2, accent, 0.28);
  g.lineBetween(inset, inset - 18, inset + Math.min(240, w * 0.25), inset - 18);
  g.lineBetween(w - inset - Math.min(240, w * 0.25), h - inset + 18, w - inset, h - inset + 18);
  g.lineStyle(1, danger, 0.2);
  g.lineBetween(inset - 18, inset, inset - 18, inset + Math.min(126, h * 0.16));
  g.lineBetween(w - inset + 18, h - inset - Math.min(126, h * 0.16), w - inset + 18, h - inset);
}

function drawMoodEdgeFixtures(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  inset: number,
  seed: number,
  mood: ArenaMood,
  colors: { bg: number; floor: number; accent: number; danger: number; xp: number },
) {
  const size = Math.min(58, Math.max(34, Math.min(w, h) * 0.062));
  const positions = [
    { x: w * 0.2, y: inset * 0.72, horizontal: true },
    { x: w * 0.5, y: inset * 0.66, horizontal: true },
    { x: w * 0.8, y: inset * 0.72, horizontal: true },
    { x: w * 0.22, y: h - inset * 0.72, horizontal: true },
    { x: w * 0.58, y: h - inset * 0.66, horizontal: true },
    { x: w * 0.84, y: h - inset * 0.72, horizontal: true },
    { x: inset * 0.72, y: h * 0.32, horizontal: false },
    { x: w - inset * 0.72, y: h * 0.68, horizontal: false },
  ];

  for (const [index, base] of positions.entries()) {
    const jitterX = seededRange(seed, index * 5 + 1, 19) - 9;
    const jitterY = seededRange(seed, index * 5 + 2, 15) - 7;
    drawMoodFixture(g, base.x + jitterX, base.y + jitterY, size, base.horizontal, mood, colors, index);
  }
}

function drawMoodFixture(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  horizontal: boolean,
  mood: ArenaMood,
  colors: { bg: number; floor: number; accent: number; danger: number; xp: number },
  index: number,
) {
  const w = horizontal ? size * 1.9 : size * 0.78;
  const h = horizontal ? size * 0.78 : size * 1.9;
  const left = x - w / 2;
  const top = y - h / 2;

  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(x, y + h * 0.34, w * 1.08, Math.max(10, h * 0.28));

  if (mood === 'bakery') {
    g.fillStyle(colors.bg, 0.72);
    g.fillRoundedRect(left, top, w, h, 8);
    g.fillStyle(colors.floor, 0.34);
    g.fillRoundedRect(left + 7, top + 7, Math.max(4, w - 14), Math.max(4, h - 14), 6);
    g.fillStyle(index % 2 ? colors.danger : colors.xp, 0.34);
    g.fillRoundedRect(left + w * 0.18, top + h * 0.28, w * 0.64, h * 0.2, 5);
    g.lineStyle(1, colors.accent, 0.46);
    g.strokeRoundedRect(left, top, w, h, 8);
    return;
  }

  if (mood === 'security') {
    g.fillStyle(colors.bg, 0.66);
    g.fillRoundedRect(left, top, w, h, 4);
    g.lineStyle(1, colors.xp, 0.42);
    g.strokeRoundedRect(left, top, w, h, 4);
    g.lineStyle(2, colors.danger, 0.32);
    if (horizontal) {
      g.lineBetween(left + w * 0.12, y, left + w * 0.88, y);
      g.lineBetween(left + w * 0.24, top + h * 0.22, left + w * 0.24, top + h * 0.78);
      g.lineBetween(left + w * 0.52, top + h * 0.18, left + w * 0.52, top + h * 0.82);
      g.lineBetween(left + w * 0.76, top + h * 0.22, left + w * 0.76, top + h * 0.78);
    } else {
      g.lineBetween(x, top + h * 0.12, x, top + h * 0.88);
      g.lineBetween(left + w * 0.22, top + h * 0.24, left + w * 0.78, top + h * 0.24);
      g.lineBetween(left + w * 0.18, top + h * 0.52, left + w * 0.82, top + h * 0.52);
      g.lineBetween(left + w * 0.22, top + h * 0.76, left + w * 0.78, top + h * 0.76);
    }
    g.fillStyle(colors.xp, 0.34);
    g.fillCircle(left + w * 0.82, top + h * 0.28, Math.max(3, size * 0.08));
    return;
  }

  if (mood === 'space') {
    g.fillStyle(colors.bg, 0.62);
    g.fillRoundedRect(left, top, w, h, 6);
    g.lineStyle(1, colors.accent, 0.4);
    g.strokeRoundedRect(left, top, w, h, 6);
    g.fillStyle(colors.xp, 0.45);
    g.fillRect(left + w * 0.18, top + h * 0.25, w * 0.5, Math.max(3, h * 0.08));
    g.fillStyle(colors.danger, 0.32);
    g.fillCircle(left + w * 0.78, top + h * 0.62, Math.max(3, size * 0.09));
    g.lineStyle(1, colors.xp, 0.24);
    g.lineBetween(left + w * 0.18, top + h * 0.68, left + w * 0.72, top + h * 0.36);
    return;
  }

  if (mood === 'haunted') {
    g.fillStyle(colors.bg, 0.66);
    g.fillRoundedRect(left, top, w, h, 4);
    g.lineStyle(1, colors.danger, 0.38);
    g.strokeRoundedRect(left, top, w, h, 4);
    g.lineStyle(2, colors.accent, 0.2);
    if (horizontal) {
      g.lineBetween(left + w * 0.18, y, left + w * 0.82, y);
      g.lineBetween(x, top + h * 0.18, x, top + h * 0.82);
    } else {
      g.lineBetween(x, top + h * 0.18, x, top + h * 0.82);
      g.lineBetween(left + w * 0.18, y, left + w * 0.82, y);
    }
    g.fillStyle(colors.xp, 0.22);
    g.fillCircle(x, y, Math.max(4, size * 0.11));
    return;
  }

  if (mood === 'coast') {
    g.fillStyle(colors.bg, 0.58);
    g.fillRoundedRect(left, top, w, h, 6);
    g.lineStyle(2, colors.accent, 0.44);
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * (horizontal ? h * 0.2 : w * 0.2);
      if (horizontal) g.lineBetween(left + 8, y + offset, left + w - 8, y + offset + h * 0.08);
      else g.lineBetween(x + offset, top + 8, x + offset + w * 0.08, top + h - 8);
    }
    g.fillStyle(colors.xp, 0.28);
    g.fillCircle(left + w * 0.76, top + h * 0.36, Math.max(4, size * 0.1));
    g.fillStyle(colors.danger, 0.26);
    g.fillRoundedRect(left + w * 0.18, top + h * 0.58, w * 0.36, h * 0.18, 4);
    return;
  }

  if (mood === 'platform') {
    g.fillStyle(colors.bg, 0.66);
    g.fillRoundedRect(left, top, w, h, 5);
    g.lineStyle(2, colors.accent, 0.42);
    g.strokeRoundedRect(left, top, w, h, 5);
    g.lineStyle(1, colors.xp, 0.28);
    if (horizontal) {
      g.lineBetween(left + w * 0.12, y, left + w * 0.88, y);
      g.lineBetween(left + w * 0.28, top + h * 0.22, left + w * 0.28, top + h * 0.78);
      g.lineBetween(left + w * 0.58, top + h * 0.22, left + w * 0.58, top + h * 0.78);
    } else {
      g.lineBetween(x, top + h * 0.12, x, top + h * 0.88);
      g.lineBetween(left + w * 0.22, top + h * 0.36, left + w * 0.78, top + h * 0.36);
      g.lineBetween(left + w * 0.22, top + h * 0.64, left + w * 0.78, top + h * 0.64);
    }
    g.lineStyle(2, colors.danger, 0.32);
    g.strokeCircle(x, y, Math.min(w, h) * 0.22);
    return;
  }

  g.fillStyle(colors.bg, 0.58);
  g.fillRoundedRect(left, top, w, h, 6);
  g.lineStyle(1, colors.accent, 0.34);
  g.strokeRoundedRect(left, top, w, h, 6);
  g.fillStyle(index % 2 ? colors.danger : colors.xp, 0.22);
  g.fillRoundedRect(left + w * 0.18, top + h * 0.32, w * 0.64, h * 0.26, 4);
}

function drawForegroundLights(
  scene: Phaser.Scene,
  w: number,
  h: number,
  inset: number,
  seed: number,
  mood: ArenaMood,
  colors: { accent: number; danger: number; xp: number },
) {
  const lightColor = mood === 'haunted' ? colors.danger : mood === 'space' || mood === 'security' ? colors.xp : colors.accent;
  const points = [
    { x: inset + 28, y: inset + 24 },
    { x: w - inset - 28, y: inset + 24 },
    { x: inset + 28, y: h - inset - 24 },
    { x: w - inset - 28, y: h - inset - 24 },
  ];

  for (const [index, point] of points.entries()) {
    const glow = scene.add.circle(point.x, point.y, 8 + seededRange(seed, index + 13, 6), lightColor, 0.16)
      .setDepth(DEPTH.foreground + 0.08);
    const core = scene.add.circle(point.x, point.y, 2.5, lightColor, 0.72)
      .setDepth(DEPTH.foreground + 0.1);
    scene.tweens.add({
      targets: [glow, core],
      alpha: { from: index % 2 ? 0.12 : 0.2, to: index % 2 ? 0.34 : 0.42 },
      duration: 1400 + seededRange(seed, index + 21, 900),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }
}

function drawAmbientRoomMotion(scene: Phaser.Scene, def: GameDefinition, w: number, h: number) {
  const mood = arenaMood(def);
  if (hasLiteralBackdrop(def)) return 12;
  const seed = stableHash(`${def.title}:${def.theme}:${def.arena.name}:ambient-motion`);
  const inset = Math.min(68, Math.max(34, Math.min(w, h) * 0.085));
  const colors = {
    accent: hex(def.palette.accent),
    danger: hex(def.palette.danger),
    xp: hex(def.palette.xp),
    projectile: hex(def.palette.projectile),
    floor: hex(def.palette.floor),
  };
  const moodColor =
    mood === 'haunted' ? colors.danger :
    mood === 'security' ? colors.danger :
    mood === 'space' ? colors.xp :
    mood === 'bakery' ? colors.projectile :
    mood === 'coast' ? colors.accent :
    colors.xp;
  const altColor = mood === 'space' || mood === 'security' || mood === 'coast' ? colors.projectile : colors.accent;
  const moteCount = Math.min(18, Math.max(10, Math.round(Math.min(w, h) / 46)));
  let count = drawAmbientHeartbeat(scene, w, h, seed, moodColor, altColor);

  for (let i = 0; i < moteCount; i++) {
    const x = inset + seededRange(seed, 101 + i * 7, Math.max(1, w - inset * 2));
    const y = inset + seededRange(seed, 103 + i * 7, Math.max(1, h - inset * 2));
    const radius = 1.4 + seededRange(seed, 107 + i * 7, 18) / 10;
    const color = i % 3 === 0 ? moodColor : i % 3 === 1 ? altColor : colors.xp;
    const driftX = seededRange(seed, 109 + i * 7, 31) - 15;
    const driftY = seededRange(seed, 113 + i * 7, 27) - 13;
    const duration = 1800 + seededRange(seed, 117 + i * 7, 1600);
    const mote = scene.add.circle(x, y, radius, color, 0.18 + (i % 4) * 0.025)
      .setDepth(DEPTH.decor + 0.18 + (i % 2) * 0.04);
    const glint = scene.add.circle(x, y, Math.max(0.8, radius * 0.45), 0xffffff, 0.1)
      .setDepth(DEPTH.decor + 0.2 + (i % 2) * 0.04);
    scene.tweens.add({
      targets: [mote, glint],
      x: x + driftX,
      y: y + driftY,
      alpha: {
        from: i % 2 ? 0.08 : 0.16,
        to: i % 2 ? 0.28 : 0.36,
      },
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
      delay: seededRange(seed, 121 + i * 7, 900),
    });
    count += 2;
  }

  const sweepCount = 4;
  for (let i = 0; i < sweepCount; i++) {
    const horizontal = i < 2;
    const lane = horizontal ? h * (i === 0 ? 0.36 : 0.64) : w * (i === 2 ? 0.36 : 0.64);
    const sweep = scene.add.rectangle(
      horizontal ? w / 2 : lane,
      horizontal ? lane : h / 2,
      horizontal ? Math.max(180, w - inset * 3.2) : 10,
      horizontal ? 10 : Math.max(120, h - inset * 3.2),
      i % 2 ? altColor : moodColor,
      mood === 'haunted' ? 0.05 : mood === 'security' ? 0.1 : 0.07,
    )
      .setDepth(DEPTH.decor + 0.12)
      .setRotation(horizontal ? (i % 2 ? -0.08 : 0.08) : Math.PI / 2 + (i % 2 ? 0.06 : -0.06));
    scene.tweens.add({
      targets: sweep,
      alpha: { from: 0.025, to: mood === 'space' || mood === 'security' ? 0.15 : 0.11 },
      scaleX: { from: 0.9, to: 1.06 },
      duration: 2400 + seededRange(seed, 151 + i * 11, 1300),
      delay: seededRange(seed, 157 + i * 11, 1200),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    count++;
  }

  if (mood === 'coast') {
    count += drawCoastAmbientWaves(scene, w, h, inset, seed, moodColor);
  } else if (mood === 'haunted') {
    count += drawHauntedAmbientSigils(scene, w, h, inset, seed, moodColor);
  } else if (mood === 'security' && def.runtimeTemplate !== 'puzzle-room') {
    count += drawSecurityAmbientGrid(scene, w, h, inset, seed, moodColor, altColor);
  } else if (mood === 'space') {
    count += drawSpaceAmbientOrbits(scene, w, h, seed, moodColor, altColor);
  }

  return count;
}

function drawFeelProfilePresentation(scene: Phaser.Scene, def: GameDefinition, w: number, h: number) {
  const profile = def.feelProfile ?? DEFAULT_FEEL_PROFILE;
  const mood = arenaMood(def);
  const quietTemplate = isQuietLiteralBackdropTemplate(def);
  if (quietTemplate && hasLiteralBackdrop(def)) {
    if (profile === 'cozy-explorer') return 15;
    if (profile === 'bullet-hell-raid') return 13;
    if (profile === 'siege-defense') return 12;
    if (profile === 'score-chaser') return 12;
    return 10;
  }
  const presentationAlphaScale = quietTemplate ? (hasLiteralBackdrop(def) ? 0.015 : 0.32) : 1;
  const seed = stableHash(`${def.title}:${def.theme}:${def.arena.name}:feel-profile:${profile}`);
  const accent = hex(def.palette.accent);
  const danger = hex(def.palette.danger);
  const xp = hex(def.palette.xp);
  const projectile = hex(def.palette.projectile);
  const bg = hex(def.palette.background);
  const floor = hex(def.palette.floor);
  const cx = w / 2;
  const cy = h / 2;
  const inset = Math.min(74, Math.max(38, Math.min(w, h) * 0.09));
  let count = 0;

  const addPulse = (target: Phaser.GameObjects.GameObject, from: number, to: number, duration: number, delay = 0) => {
    scene.tweens.add({
      targets: target,
      alpha: { from: from * presentationAlphaScale, to: to * presentationAlphaScale },
      duration,
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  };

  if (profile === 'bullet-hell-raid') {
    const ringColor = danger;
    for (let i = 0; i < 3; i++) {
      const ring = scene.add.circle(cx, cy, 94 + i * 46, ringColor, 0.018)
        .setStrokeStyle(2, i % 2 ? xp : ringColor, 0.16 + i * 0.035)
        .setDepth(DEPTH.decor + 0.24 + i * 0.01);
      addPulse(ring, 0.08, 0.28, 820 + i * 160, i * 120);
      count++;
    }
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + seededRange(seed, i + 3, 12) / 100;
      const radius = Math.min(w, h) * (0.27 + (i % 2) * 0.055);
      const marker = scene.add.rectangle(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        30,
        5,
        i % 2 ? projectile : danger,
        0.18,
      )
        .setRotation(angle)
        .setDepth(DEPTH.decor + 0.3);
      addPulse(marker, 0.1, 0.34, 620 + seededRange(seed, i + 17, 240), i * 55);
      count++;
    }
    return count;
  }

  if (profile === 'siege-defense') {
    const barricades = [
      { x: cx - 172, y: cy - 96, rot: -0.12 },
      { x: cx + 172, y: cy - 96, rot: 0.12 },
      { x: cx - 184, y: cy + 96, rot: 0.12 },
      { x: cx + 184, y: cy + 96, rot: -0.12 },
      { x: cx, y: inset + 78, rot: 0 },
      { x: cx, y: h - inset - 78, rot: 0 },
    ];
    for (const [index, point] of barricades.entries()) {
      const base = scene.add.rectangle(point.x, point.y, 74, 16, bg, 0.34)
        .setStrokeStyle(1, index % 2 ? danger : accent, 0.34)
        .setRotation(point.rot)
        .setDepth(DEPTH.decor + 0.24);
      const cap = scene.add.rectangle(point.x, point.y, 52, 4, index % 2 ? danger : projectile, 0.22)
        .setRotation(point.rot)
        .setDepth(DEPTH.decor + 0.25);
      addPulse(cap, 0.12, 0.38, 1050 + index * 80);
      count += 2;
    }
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * (Math.PI / 2);
      const shield = scene.add.rectangle(cx + Math.cos(angle) * 118, cy + Math.sin(angle) * 118, 44, 7, accent, 0.16)
        .setRotation(angle + Math.PI / 2)
        .setDepth(DEPTH.decor + 0.27);
      addPulse(shield, 0.1, 0.3, 900 + i * 120);
      count++;
    }
    return count;
  }

  if (profile === 'cozy-explorer') {
    const pathColor = xp;
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const wobble = seededRange(seed, 41 + i, 29) - 14;
      const dot = scene.add.circle(
        Phaser.Math.Linear(inset + 70, w - inset - 84, t),
        Phaser.Math.Linear(h - inset - 88, inset + 112, t) + wobble,
        4 + (i % 3),
        i % 2 ? pathColor : accent,
        0.18,
      ).setDepth(DEPTH.decor + 0.25);
      addPulse(dot, 0.08, 0.32, 1200 + i * 45, i * 70);
      count++;
    }
    const beacons = [
      { x: inset + 92, y: h - inset - 92 },
      { x: cx + seededRange(seed, 61, 90) - 45, y: cy + seededRange(seed, 67, 72) - 36 },
      { x: w - inset - 96, y: inset + 102 },
    ];
    for (const [index, point] of beacons.entries()) {
      const beacon = scene.add.circle(point.x, point.y, 20 + index * 4, accent, 0.045)
        .setStrokeStyle(1, pathColor, 0.18)
        .setDepth(DEPTH.decor + 0.24);
      addPulse(beacon, 0.05, 0.18, 1500 + index * 260);
      count++;
    }
    return count;
  }

  if (profile === 'score-chaser') {
    for (let i = 0; i < 8; i++) {
      const lane = i % 2 === 0;
      const x = lane ? inset + 96 + (i / 2) * ((w - inset * 2 - 192) / 3) : cx + (i % 4 - 1.5) * 104;
      const y = lane ? cy + (i % 4 < 2 ? -122 : 122) : inset + 96 + (i / 2) * ((h - inset * 2 - 192) / 3);
      const gate = scene.add.rectangle(x, y, lane ? 64 : 18, lane ? 18 : 64, i % 3 ? xp : projectile, 0.16)
        .setStrokeStyle(1, accent, 0.28)
        .setRotation(lane ? 0 : Math.PI / 2)
        .setDepth(DEPTH.decor + 0.25);
      addPulse(gate, 0.1, 0.34, 760 + seededRange(seed, i + 83, 340), i * 70);
      count++;
    }
    for (let i = 0; i < 4; i++) {
      const diamond = scene.add.rectangle(cx + (i - 1.5) * 72, cy, 16, 16, danger, 0.12)
        .setRotation(Math.PI / 4)
        .setDepth(DEPTH.decor + 0.28);
      addPulse(diamond, 0.08, 0.28, 620 + i * 90);
      count++;
    }
    return count;
  }

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const radius = Math.min(w, h) * 0.28;
    const anchor = scene.add.rectangle(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      24,
      8,
      i % 2 ? floor : accent,
      0.16,
    )
      .setRotation(angle)
      .setStrokeStyle(1, i % 2 ? accent : xp, 0.18)
      .setDepth(DEPTH.decor + 0.24);
    addPulse(anchor, 0.08, 0.24, 980 + i * 60);
    count++;
  }
  return count;
}

function drawProfileFramingLayer(scene: Phaser.Scene, def: GameDefinition, w: number, h: number): ProfileFrameLayer {
  const profile = def.feelProfile ?? DEFAULT_FEEL_PROFILE;
  const mood = arenaMood(def);
  const quietTemplate = isQuietLiteralBackdropTemplate(def);
  const mode = profile === 'bullet-hell-raid'
    ? 'raid-lock'
    : profile === 'siege-defense'
      ? 'siege-anchor'
      : profile === 'cozy-explorer'
        ? 'cozy-route'
        : profile === 'score-chaser'
          ? 'score-lane'
          : 'survivor-focus';
  const accent = hex(def.palette.accent);
  const danger = hex(def.palette.danger);
  const xp = hex(def.palette.xp);
  const projectile = hex(def.palette.projectile);
  const depth = DEPTH.hud - 0.42;
  const literalBackdrop = hasLiteralBackdrop(def);
  if (quietTemplate && literalBackdrop) {
    const pulse = scene.add.graphics().setScrollFactor(0).setDepth(depth + 0.05).setAlpha(0);
    return { mode, fx: profile === 'cozy-explorer' ? 11 : 10, pulse, accents: [] };
  }
  const quietScale = literalBackdrop ? 0.02 : 0.42;
  const frameScale = literalBackdrop ? 0.015 : 0.36;
  const pulse = scene.add.graphics().setScrollFactor(0).setDepth(depth + 0.05).setAlpha(quietTemplate ? quietScale : 0.85);
  const accents: Phaser.GameObjects.GameObject[] = [];
  let fx = 1;

  const addBar = (x: number, y: number, width: number, height: number, color: number, alpha: number, rotation = 0) => {
    const bar = scene.add.rectangle(x, y, width, height, color, quietTemplate ? alpha * quietScale : alpha)
      .setScrollFactor(0)
      .setDepth(depth)
      .setRotation(rotation);
    accents.push(bar);
    fx++;
    return bar;
  };

  const addFrame = (draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(depth).setAlpha(quietTemplate ? frameScale : 0.82);
    draw(g);
    accents.push(g);
    fx++;
    return g;
  };

  const inset = 18;
  if (mode === 'raid-lock') {
    addFrame((g) => {
      g.lineStyle(2, danger, 0.34);
      g.lineBetween(inset, inset + 52, inset + 78, inset + 14);
      g.lineBetween(w - inset, inset + 52, w - inset - 78, inset + 14);
      g.lineBetween(inset, h - inset - 52, inset + 78, h - inset - 14);
      g.lineBetween(w - inset, h - inset - 52, w - inset - 78, h - inset - 14);
      g.lineStyle(1, projectile, 0.24);
      g.strokeCircle(w / 2, h / 2, 146);
    });
    for (let i = 0; i < 8; i++) {
      const side = i % 4;
      const offset = 82 + Math.floor(i / 4) * 34;
      if (side === 0) addBar(offset, 24, 38, 4, i % 2 ? projectile : danger, 0.28);
      if (side === 1) addBar(w - 24, offset, 4, 38, i % 2 ? projectile : danger, 0.28);
      if (side === 2) addBar(w - offset, h - 24, 38, 4, i % 2 ? projectile : danger, 0.28);
      if (side === 3) addBar(24, h - offset, 4, 38, i % 2 ? projectile : danger, 0.28);
    }
  } else if (mode === 'siege-anchor') {
    addFrame((g) => {
      g.lineStyle(2, accent, 0.3);
      g.strokeRoundedRect(34, 34, w - 68, h - 68, 8);
      g.lineStyle(3, danger, 0.24);
      g.lineBetween(54, 92, 54, h - 92);
      g.lineBetween(w - 54, 92, w - 54, h - 92);
    });
    for (let i = 0; i < 10; i++) {
      const top = i < 5;
      const x = 120 + (i % 5) * ((w - 240) / 4);
      addBar(x, top ? 46 : h - 46, 52, 8, top ? projectile : danger, 0.22);
    }
  } else if (mode === 'cozy-route') {
    addFrame((g) => {
      g.lineStyle(2, xp, 0.22);
      g.lineBetween(72, h - 104, w * 0.32, h - 126);
      g.lineBetween(w * 0.32, h - 126, w * 0.62, h - 98);
      g.lineBetween(w * 0.62, h - 98, w - 72, h - 116);
      g.lineStyle(1, accent, 0.18);
      g.strokeCircle(w / 2, h / 2, 118);
    });
    for (let i = 0; i < 9; i++) {
      const x = 86 + i * ((w - 172) / 8);
      const y = h - 98 + Math.sin(i * 0.9) * 14;
      addBar(x, y, 22, 5, i % 2 ? accent : xp, 0.22, Math.sin(i) * 0.35);
    }
  } else if (mode === 'score-lane') {
    addFrame((g) => {
      g.lineStyle(2, projectile, 0.26);
      g.lineBetween(64, 74, w - 64, 74);
      g.lineBetween(64, h - 74, w - 64, h - 74);
      g.lineStyle(1, xp, 0.2);
      g.strokeRoundedRect(82, 54, w - 164, h - 108, 10);
    });
    for (let i = 0; i < 12; i++) {
      const top = i % 2 === 0;
      const x = 98 + Math.floor(i / 2) * ((w - 196) / 5);
      addBar(x, top ? 74 : h - 74, 18, 18, i % 3 ? projectile : xp, 0.2, Math.PI / 4);
    }
  } else {
    addFrame((g) => {
      g.lineStyle(2, accent, 0.24);
      g.lineBetween(28, 42, 86, 42);
      g.lineBetween(42, 28, 42, 86);
      g.lineBetween(w - 28, 42, w - 86, 42);
      g.lineBetween(w - 42, 28, w - 42, 86);
      g.lineBetween(28, h - 42, 86, h - 42);
      g.lineBetween(42, h - 28, 42, h - 86);
      g.lineBetween(w - 28, h - 42, w - 86, h - 42);
      g.lineBetween(w - 42, h - 28, w - 42, h - 86);
    });
    for (let i = 0; i < 6; i++) {
      addBar(w / 2 - 84 + i * 34, h - 42, 18, 4, i % 2 ? accent : xp, 0.18);
    }
  }

  if (accents.length > 0) {
    scene.tweens.add({
      targets: accents,
      alpha: quietTemplate
        ? literalBackdrop
          ? { from: 0, to: 0.01 }
          : { from: 0.18, to: 0.42 }
        : { from: 0.54, to: 0.88 },
      duration: mode === 'cozy-route' ? 1600 : mode === 'raid-lock' ? 680 : 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  return { mode, fx, pulse, accents };
}

function drawAmbientHeartbeat(scene: Phaser.Scene, w: number, h: number, seed: number, color: number, altColor: number) {
  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(138, Math.max(78, Math.min(w, h) * 0.16));
  const halo = scene.add.circle(cx, cy, baseRadius, color, 0.035)
    .setStrokeStyle(2, color, 0.18)
    .setDepth(DEPTH.decor + 0.21);
  const inner = scene.add.circle(cx, cy, baseRadius * 0.58, altColor, 0.026)
    .setStrokeStyle(1, altColor, 0.16)
    .setDepth(DEPTH.decor + 0.22);
  scene.tweens.add({
    targets: halo,
    alpha: { from: 0.025, to: 0.16 },
    scale: { from: 0.96, to: 1.1 },
    duration: 620 + seededRange(seed, 89, 180),
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  });
  scene.tweens.add({
    targets: inner,
    alpha: { from: 0.018, to: 0.12 },
    scale: { from: 1.08, to: 0.92 },
    duration: 760 + seededRange(seed, 97, 220),
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  });
  return 2;
}

function drawCoastAmbientWaves(scene: Phaser.Scene, w: number, h: number, inset: number, seed: number, color: number) {
  let count = 0;
  for (let i = 0; i < 3; i++) {
    const y = inset + h * (0.28 + i * 0.18) + seededRange(seed, 181 + i * 5, 15) - 7;
    const wave = scene.add.graphics().setDepth(DEPTH.decor + 0.16).setAlpha(0.2);
    wave.lineStyle(3, color, 0.68);
    const startX = inset + 28;
    const endX = w - inset - 28;
    const step = Math.max(34, (endX - startX) / 12);
    for (let x = startX; x < endX; x += step) {
      wave.lineBetween(x, y, x + step * 0.36, y + 7);
      wave.lineBetween(x + step * 0.36, y + 7, x + step * 0.72, y - 4);
      wave.lineBetween(x + step * 0.72, y - 4, x + step, y + 3);
    }
    scene.tweens.add({
      targets: wave,
      x: 14,
      alpha: { from: 0.14, to: 0.32 },
      duration: 2200 + i * 360,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    count++;
  }
  return count;
}

function drawHauntedAmbientSigils(scene: Phaser.Scene, w: number, h: number, inset: number, seed: number, color: number) {
  let count = 0;
  const points = [
    { x: inset + w * 0.22, y: h * 0.42 },
    { x: w - inset - w * 0.22, y: h * 0.58 },
  ];
  for (const [index, point] of points.entries()) {
    const sigil = scene.add.graphics().setDepth(DEPTH.decor + 0.17).setAlpha(0.12);
    const radius = 18 + seededRange(seed, 211 + index * 5, 10);
    sigil.lineStyle(1, color, 0.55);
    sigil.strokeCircle(point.x, point.y, radius);
    sigil.lineBetween(point.x - radius * 0.7, point.y, point.x + radius * 0.7, point.y);
    sigil.lineBetween(point.x, point.y - radius * 0.7, point.x, point.y + radius * 0.7);
    scene.tweens.add({
      targets: sigil,
      rotation: index % 2 ? -Math.PI * 2 : Math.PI * 2,
      alpha: { from: 0.06, to: 0.18 },
      duration: 5200 + index * 900,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    count++;
  }
  return count;
}

function drawSecurityAmbientGrid(scene: Phaser.Scene, w: number, h: number, inset: number, seed: number, color: number, altColor: number) {
  let count = 0;
  for (let i = 0; i < 5; i++) {
    const vertical = i % 2 === 0;
    const lane = vertical
      ? inset + 72 + seededRange(seed, 231 + i * 13, Math.max(1, w - inset * 2 - 144))
      : inset + 64 + seededRange(seed, 239 + i * 13, Math.max(1, h - inset * 2 - 128));
    const scan = scene.add.rectangle(
      vertical ? lane : w / 2,
      vertical ? h / 2 : lane,
      vertical ? 5 : Math.max(180, w - inset * 2.4),
      vertical ? Math.max(140, h - inset * 2.4) : 5,
      i % 2 ? altColor : color,
      0.12,
    )
      .setDepth(DEPTH.decor + 0.18)
      .setRotation(vertical ? 0 : (seededRange(seed, 251 + i * 7, 18) - 9) / 100);
    scene.tweens.add({
      targets: scan,
      alpha: { from: 0.04, to: 0.22 },
      scaleX: { from: vertical ? 1 : 0.92, to: vertical ? 1 : 1.08 },
      scaleY: { from: vertical ? 0.92 : 1, to: vertical ? 1.08 : 1 },
      duration: 1400 + seededRange(seed, 257 + i * 11, 900),
      delay: seededRange(seed, 263 + i * 11, 700),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    count++;
  }
  return count;
}

function drawSpaceAmbientOrbits(scene: Phaser.Scene, w: number, h: number, seed: number, color: number, altColor: number) {
  let count = 0;
  const cx = w / 2;
  const cy = h / 2;
  for (let i = 0; i < 3; i++) {
    const orbit = scene.add.ellipse(cx, cy, 210 + i * 72, 62 + i * 26)
      .setStrokeStyle(1, i % 2 ? altColor : color, 0.12)
      .setDepth(DEPTH.decor + 0.14)
      .setRotation((seededRange(seed, 241 + i * 5, 80) - 40) / 100);
    scene.tweens.add({
      targets: orbit,
      rotation: orbit.rotation + (i % 2 ? -0.5 : 0.5),
      alpha: { from: 0.06, to: 0.2 },
      duration: 4400 + i * 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    count++;
  }
  return count;
}

function drawLaneGlow(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  inset: number,
  accent: number,
  danger: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  g.lineStyle(16, accent, 0.035);
  g.lineBetween(inset + 8, cy, w - inset - 8, cy);
  g.lineBetween(cx, inset + 8, cx, h - inset - 8);
  g.lineStyle(3, accent, 0.12);
  g.lineBetween(inset + 24, cy, w - inset - 24, cy);
  g.lineBetween(cx, inset + 24, cx, h - inset - 24);
  g.lineStyle(1, danger, 0.13);
  g.lineBetween(inset + 36, inset + 44, w - inset - 36, h - inset - 44);
  g.lineBetween(w - inset - 36, inset + 44, inset + 36, h - inset - 44);
}

function drawCornerRooms(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  inset: number,
  bg: number,
  floor: number,
  accent: number,
  danger: number,
  mood: ArenaMood,
) {
  const roomW = Math.min(184, Math.max(94, w * 0.17));
  const roomH = Math.min(104, Math.max(58, h * 0.14));
  const rooms = [
    { x: inset, y: inset, sx: 1, sy: 1 },
    { x: w - inset - roomW, y: inset, sx: -1, sy: 1 },
    { x: inset, y: h - inset - roomH, sx: 1, sy: -1 },
    { x: w - inset - roomW, y: h - inset - roomH, sx: -1, sy: -1 },
  ];

  for (const [index, room] of rooms.entries()) {
    g.fillStyle(bg, mood === 'coast' ? 0.18 : 0.28);
    g.fillRoundedRect(room.x, room.y, roomW, roomH, 8);
    g.fillStyle(floor, 0.2);
    g.fillRoundedRect(room.x + 10, room.y + 10, roomW - 20, roomH - 20, 6);
    g.lineStyle(1, index % 2 ? accent : danger, 0.2);
    g.strokeRoundedRect(room.x, room.y, roomW, roomH, 8);
    g.lineStyle(2, accent, 0.12);
    g.lineBetween(room.x + roomW * 0.5, room.y + roomH * 0.5, room.x + roomW * 0.5 + room.sx * 42, room.y + roomH * 0.5);
    g.lineBetween(room.x + roomW * 0.5, room.y + roomH * 0.5, room.x + roomW * 0.5, room.y + roomH * 0.5 + room.sy * 30);
  }
}

function drawCentralLandmark(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  floor: number,
  accent: number,
  danger: number,
  xp: number,
  mood: ArenaMood,
) {
  const r = Math.min(108, Math.max(58, size * 0.12));
  g.fillStyle(0x000000, 0.12);
  g.fillEllipse(cx, cy + r * 0.18, r * 2.35, r * 0.82);
  g.fillStyle(floor, 0.4);
  g.fillCircle(cx, cy, r);
  g.lineStyle(2, accent, 0.22);
  g.strokeCircle(cx, cy, r);
  g.lineStyle(1, danger, 0.18);
  g.strokeCircle(cx, cy, r * 0.62);

  if (mood === 'security') {
    g.fillStyle(danger, 0.08);
    g.fillRoundedRect(cx - r * 0.58, cy - r * 0.58, r * 1.16, r * 1.16, 8);
    g.lineStyle(2, xp, 0.28);
    g.strokeRoundedRect(cx - r * 0.58, cy - r * 0.58, r * 1.16, r * 1.16, 8);
    g.lineStyle(1, accent, 0.24);
    for (let i = -1; i <= 1; i++) {
      g.lineBetween(cx - r * 0.58, cy + i * r * 0.29, cx + r * 0.58, cy + i * r * 0.29);
      g.lineBetween(cx + i * r * 0.29, cy - r * 0.58, cx + i * r * 0.29, cy + r * 0.58);
    }
  } else if (mood === 'space') {
    g.lineStyle(2, xp, 0.2);
    g.strokeEllipse(cx, cy, r * 1.7, r * 0.46);
    g.strokeEllipse(cx, cy, r * 0.62, r * 1.5);
  } else if (mood === 'haunted') {
    g.lineStyle(2, danger, 0.2);
    g.lineBetween(cx - r * 0.52, cy - r * 0.36, cx + r * 0.52, cy + r * 0.36);
    g.lineBetween(cx + r * 0.52, cy - r * 0.36, cx - r * 0.52, cy + r * 0.36);
  } else if (mood === 'bakery') {
    g.lineStyle(2, accent, 0.2);
    g.strokeRoundedRect(cx - r * 0.62, cy - r * 0.42, r * 1.24, r * 0.84, 10);
    g.fillStyle(xp, 0.12);
    g.fillRoundedRect(cx - r * 0.38, cy - r * 0.22, r * 0.76, r * 0.44, 8);
  } else if (mood === 'coast') {
    g.fillStyle(accent, 0.1);
    g.fillEllipse(cx, cy, r * 1.55, r * 0.92);
    g.lineStyle(3, xp, 0.34);
    for (let i = 0; i < 3; i++) {
      const y = cy - r * 0.3 + i * r * 0.3;
      g.lineBetween(cx - r * 0.52, y, cx - r * 0.16, y + r * 0.12);
      g.lineBetween(cx - r * 0.16, y + r * 0.12, cx + r * 0.24, y - r * 0.1);
      g.lineBetween(cx + r * 0.24, y - r * 0.1, cx + r * 0.52, y + r * 0.05);
    }
    g.fillStyle(danger, 0.18);
    g.fillRoundedRect(cx - r * 0.28, cy + r * 0.22, r * 0.56, r * 0.2, 4);
  } else if (mood === 'platform') {
    g.fillStyle(floor, 0.28);
    g.fillRoundedRect(cx - r * 0.5, cy - r * 0.55, r, r * 1.1, 4);
    g.lineStyle(2, xp, 0.28);
    g.strokeRoundedRect(cx - r * 0.5, cy - r * 0.55, r, r * 1.1, 4);
    g.lineStyle(2, danger, 0.32);
    g.strokeCircle(cx, cy, r * 0.48);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      g.lineBetween(cx + Math.cos(angle) * r * 0.28, cy + Math.sin(angle) * r * 0.28, cx + Math.cos(angle) * r * 0.62, cy + Math.sin(angle) * r * 0.62);
    }
  } else {
    g.lineStyle(2, xp, 0.18);
    g.strokeRoundedRect(cx - r * 0.5, cy - r * 0.5, r, r, 8);
  }
}

function drawThemeProps(
  g: Phaser.GameObjects.Graphics,
  def: GameDefinition,
  w: number,
  h: number,
  inset: number,
  seed: number,
  mood: ArenaMood,
) {
  const accent = hex(def.palette.accent);
  const danger = hex(def.palette.danger);
  const bg = hex(def.palette.background);
  const floor = hex(def.palette.floor);
  const xp = hex(def.palette.xp);
  const coastal = mood === 'coast' || hasTheme(def, /(coast|tide|ocean|sea|wave|harbor|beach|reef|shore)/);
  const relicTheme = hasTheme(def, /(relic|crystal|gem|artifact|temple|moon|archive|sanctum)/);
  const castleTheme = mood === 'platform' || hasTheme(def, /(castle|clockwork|gear|tower|colossus|battlement|fortress|ruin)/);

  if (coastal) {
    const shoreY = h - inset - Math.max(112, h * 0.18);
    const shoreW = Math.max(120, w - inset * 2 - 40);
    g.fillStyle(0x2f8fb5, 0.24);
    g.fillRoundedRect(inset + 20, shoreY, shoreW, 88, 18);
    g.fillStyle(0xd6b36a, 0.2);
    g.fillRoundedRect(inset + 34, shoreY + 48, Math.max(80, shoreW - 68), 28, 12);
    g.lineStyle(4, 0xe8f7ff, 0.36);
    for (let row = 0; row < 4; row++) {
      const y = shoreY + 15 + row * 15;
      for (let x = inset + 42; x < w - inset - 58; x += 72) {
        g.lineBetween(x, y, x + 22, y + 7);
        g.lineBetween(x + 22, y + 7, x + 48, y - 4);
        g.lineBetween(x + 48, y - 4, x + 66, y + 3);
      }
    }
    const crates = [
      { x: inset + 62, y: h - inset - 76 },
      { x: w - inset - 122, y: h - inset - 84 },
      { x: w * 0.72, y: inset + 82 },
    ];
    for (const [index, crate] of crates.entries()) {
      g.fillStyle(bg, 0.48);
      g.fillRoundedRect(crate.x, crate.y, 56, 38, 5);
      g.lineStyle(2, index % 2 ? danger : xp, 0.38);
      g.strokeRoundedRect(crate.x, crate.y, 56, 38, 5);
      g.lineBetween(crate.x + 10, crate.y + 19, crate.x + 46, crate.y + 19);
      g.lineBetween(crate.x + 28, crate.y + 7, crate.x + 28, crate.y + 31);
    }
  }

  if (castleTheme) {
    const baseY = inset + Math.max(62, h * 0.14);
    g.fillStyle(bg, 0.3);
    for (let i = 0; i < 4; i++) {
      const x = inset + 24 + i * Math.max(86, (w - inset * 2 - 64) / 3);
      const towerH = 46 + (i % 2) * 24;
      g.fillRoundedRect(x, baseY - towerH, 58, towerH, 4);
      for (let tooth = 0; tooth < 3; tooth++) {
        g.fillRect(x + tooth * 20, baseY - towerH - 10, 12, 13);
      }
      g.lineStyle(1, accent, 0.24);
      g.strokeRoundedRect(x, baseY - towerH, 58, towerH, 4);
    }
    g.lineStyle(2, danger, 0.3);
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.28 + i * 0.22);
      const cy = h * (0.34 + (i % 2) * 0.12);
      const r = 18 + i * 4;
      g.strokeCircle(cx, cy, r);
      g.strokeCircle(cx, cy, r * 0.42);
      for (let tooth = 0; tooth < 8; tooth++) {
        const angle = tooth * Math.PI / 4;
        g.lineBetween(cx + Math.cos(angle) * r * 0.62, cy + Math.sin(angle) * r * 0.62, cx + Math.cos(angle) * r * 1.18, cy + Math.sin(angle) * r * 1.18);
      }
    }
  }

  if (relicTheme) {
    const shrines = [
      { x: inset + 118, y: h * 0.5 },
      { x: w - inset - 118, y: h * 0.48 },
      { x: w * 0.5, y: inset + 118 },
    ];
    for (const [index, shrine] of shrines.entries()) {
      const s = 28 + index * 4;
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(shrine.x, shrine.y + s * 1.1, s * 2.4, s * 0.8);
      g.fillStyle(index % 2 ? 0xe878ff : 0x67e8f9, 0.34);
      g.fillTriangle(shrine.x, shrine.y - s, shrine.x + s, shrine.y, shrine.x, shrine.y + s * 1.18);
      g.fillTriangle(shrine.x, shrine.y - s, shrine.x - s, shrine.y, shrine.x, shrine.y + s * 1.18);
      g.lineStyle(3, index % 2 ? 0xff80c8 : 0xa5f3fc, 0.58);
      g.lineBetween(shrine.x, shrine.y - s * 1.15, shrine.x, shrine.y + s * 1.2);
      g.lineBetween(shrine.x - s * 0.72, shrine.y, shrine.x + s * 0.72, shrine.y);
      g.lineStyle(2, 0xffffff, 0.26);
      g.strokeCircle(shrine.x, shrine.y, s * 1.08);
    }
  }

  const count = mood === 'neutral' ? 20 : 26;
  for (let i = 0; i < count; i++) {
    const x = inset + 32 + seededRange(seed, i * 3 + 1, Math.max(1, w - inset * 2 - 64));
    const y = inset + 34 + seededRange(seed, i * 3 + 2, Math.max(1, h - inset * 2 - 68));
    const size = 9 + seededRange(seed, i * 5 + 4, 24);
    const rot = seededRange(seed, i * 7 + 8, 628) / 100 - Math.PI;

    if (mood === 'haunted') {
      g.fillStyle(bg, 0.2);
      g.fillRoundedRect(x, y, size * 1.25, size * 0.58, 3);
      g.lineStyle(1, danger, 0.16);
      g.lineBetween(x + size * 0.18, y, x + size * 0.62, y - size * 0.44);
      g.lineBetween(x + size * 0.62, y - size * 0.44, x + size * 1.05, y);
    } else if (mood === 'security') {
      g.fillStyle(i % 3 === 0 ? danger : bg, 0.18);
      g.fillRoundedRect(x, y, size * 1.55, size * 0.52, 3);
      g.lineStyle(1, i % 2 ? xp : accent, 0.24);
      g.strokeRoundedRect(x, y, size * 1.55, size * 0.52, 3);
      g.lineBetween(x + size * 0.2, y + size * 0.16, x + size * 1.34, y + size * 0.16);
      g.lineBetween(x + size * 0.2, y + size * 0.36, x + size * 1.34, y + size * 0.36);
      g.lineBetween(x + size * 0.5, y, x + size * 0.5, y + size * 0.52);
      g.lineBetween(x + size * 1.0, y, x + size * 1.0, y + size * 0.52);
    } else if (mood === 'space') {
      g.fillStyle(i % 4 === 0 ? danger : accent, 0.12);
      g.fillRoundedRect(x, y, size * 1.8, size * 0.48, 4);
      g.lineStyle(1, xp, 0.14);
      g.lineBetween(x + size * 0.16, y + size * 0.24, x + size * 1.62, y + size * 0.24);
    } else if (mood === 'bakery') {
      g.fillStyle(i % 3 === 0 ? danger : floor, 0.22);
      g.fillRoundedRect(x, y, size * 1.5, size * 0.82, 6);
      g.lineStyle(1, accent, 0.16);
      g.strokeRoundedRect(x + 2, y + 2, size * 1.5 - 4, size * 0.82 - 4, 5);
    } else if (mood === 'coast') {
      if (i % 3 === 0) {
        g.fillStyle(bg, 0.32);
        g.fillEllipse(x, y, size * 1.5, size * 0.78);
        g.lineStyle(2, xp, 0.34);
        g.strokeEllipse(x, y, size * 1.5, size * 0.78);
      } else if (i % 3 === 1) {
        g.lineStyle(2, i % 2 ? xp : accent, 0.3);
        g.lineBetween(x, y, x + Math.cos(rot) * size * 1.9, y + Math.sin(rot) * size * 0.82);
        g.lineBetween(x + 6, y + 8, x + 6 + Math.cos(rot) * size * 1.38, y + 8 + Math.sin(rot) * size * 0.72);
      } else {
        g.lineStyle(2, danger, 0.22);
        for (let arm = 0; arm < 5; arm++) {
          const angle = rot + arm * Math.PI * 0.4;
          g.lineBetween(x, y, x + Math.cos(angle) * size * 0.9, y + Math.sin(angle) * size * 0.9);
        }
      }
    } else if (mood === 'platform') {
      g.fillStyle(bg, 0.34);
      g.fillRoundedRect(x, y, size * 1.5, size * 0.86, 3);
      g.lineStyle(1, i % 2 ? xp : accent, 0.3);
      g.strokeRoundedRect(x, y, size * 1.5, size * 0.86, 3);
      g.lineBetween(x + size * 0.2, y + size * 0.32, x + size * 1.28, y + size * 0.32);
      if (i % 4 === 0) {
        g.strokeCircle(x + size * 0.76, y + size * 0.42, size * 0.36);
      }
    } else {
      g.fillStyle(i % 5 === 0 ? danger : accent, i % 5 === 0 ? 0.13 : 0.08);
      g.fillRoundedRect(x, y, size * 2, size, 4);
    }
  }
}

function drawCombatPocketAnchors(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  inset: number,
  seed: number,
  mood: ArenaMood,
  colors: { bg: number; floor: number; accent: number; danger: number; xp: number },
) {
  const cx = w / 2;
  const cy = h / 2;
  const radiusX = Math.min(w * 0.28, Math.max(178, w * 0.2));
  const radiusY = Math.min(h * 0.28, Math.max(118, h * 0.19));
  const anchorW = Math.min(130, Math.max(74, w * 0.09));
  const anchorH = Math.min(74, Math.max(42, h * 0.075));
  const spots = [
    { x: cx - radiusX, y: cy - radiusY * 0.52, wide: true },
    { x: cx + radiusX, y: cy - radiusY * 0.52, wide: true },
    { x: cx - radiusX, y: cy + radiusY * 0.52, wide: true },
    { x: cx + radiusX, y: cy + radiusY * 0.52, wide: true },
    { x: cx - radiusX * 0.42, y: cy - radiusY, wide: false },
    { x: cx + radiusX * 0.42, y: cy - radiusY, wide: false },
    { x: cx - radiusX * 0.42, y: cy + radiusY, wide: false },
    { x: cx + radiusX * 0.42, y: cy + radiusY, wide: false },
  ];

  let count = 0;
  for (const [index, spot] of spots.entries()) {
    const width = spot.wide ? anchorW : anchorH;
    const height = spot.wide ? anchorH : anchorW * 0.72;
    const jitterX = seededRange(seed, 61 + index * 9, 19) - 9;
    const jitterY = seededRange(seed, 67 + index * 9, 17) - 8;
    const x = clamp(spot.x + jitterX, inset + width * 0.6, w - inset - width * 0.6);
    const y = clamp(spot.y + jitterY, inset + height * 0.6, h - inset - height * 0.6);
    drawCombatPocketAnchor(g, x, y, width, height, mood, colors, index);
    g.lineStyle(1, index % 2 ? colors.danger : colors.accent, 0.08);
    g.lineBetween(x, y, cx + (x < cx ? -1 : 1) * Math.min(84, radiusX * 0.32), cy + (y < cy ? -1 : 1) * Math.min(44, radiusY * 0.22));
    count++;
  }
  return count;
}

function drawCombatPocketAnchor(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  mood: ArenaMood,
  colors: { bg: number; floor: number; accent: number; danger: number; xp: number },
  index: number,
) {
  const left = x - w / 2;
  const top = y - h / 2;
  const primary = index % 3 === 0 ? colors.xp : index % 2 === 0 ? colors.accent : colors.danger;

  g.fillStyle(0x000000, 0.16);
  g.fillEllipse(x, y + h * 0.42, w * 1.18, Math.max(10, h * 0.34));
  g.fillStyle(colors.bg, 0.32);
  g.fillRoundedRect(left, top, w, h, 8);
  g.fillStyle(colors.floor, 0.22);
  g.fillRoundedRect(left + 7, top + 7, Math.max(4, w - 14), Math.max(4, h - 14), 6);
  g.lineStyle(1, primary, 0.34);
  g.strokeRoundedRect(left, top, w, h, 8);

  if (mood === 'security') {
    g.fillStyle(primary, 0.16);
    g.fillRoundedRect(left + w * 0.16, top + h * 0.18, w * 0.68, h * 0.18, 4);
    g.fillRoundedRect(left + w * 0.16, top + h * 0.62, w * 0.68, h * 0.18, 4);
    g.lineStyle(1, colors.xp, 0.28);
    g.lineBetween(left + w * 0.18, top + h * 0.5, left + w * 0.82, top + h * 0.5);
    g.lineBetween(left + w * 0.34, top + h * 0.22, left + w * 0.34, top + h * 0.78);
    g.lineBetween(left + w * 0.66, top + h * 0.22, left + w * 0.66, top + h * 0.78);
    g.fillStyle(colors.danger, 0.2);
    g.fillCircle(x, y, Math.min(w, h) * 0.14);
    return;
  }

  if (mood === 'space') {
    g.fillStyle(primary, 0.2);
    g.fillRoundedRect(left + w * 0.15, top + h * 0.22, w * 0.7, h * 0.18, 4);
    g.fillStyle(colors.xp, 0.3);
    g.fillCircle(left + w * 0.28, top + h * 0.66, Math.max(3, h * 0.09));
    g.fillCircle(left + w * 0.72, top + h * 0.66, Math.max(3, h * 0.09));
    g.lineStyle(1, colors.accent, 0.2);
    g.lineBetween(left + w * 0.18, top + h * 0.76, left + w * 0.82, top + h * 0.48);
    return;
  }

  if (mood === 'haunted') {
    g.fillStyle(colors.danger, 0.13);
    g.fillCircle(x, y, Math.min(w, h) * 0.28);
    g.lineStyle(2, colors.danger, 0.22);
    g.lineBetween(left + w * 0.22, top + h * 0.28, left + w * 0.78, top + h * 0.72);
    g.lineBetween(left + w * 0.78, top + h * 0.28, left + w * 0.22, top + h * 0.72);
    g.lineStyle(1, colors.xp, 0.18);
    g.strokeCircle(x, y, Math.min(w, h) * 0.22);
    return;
  }

  if (mood === 'bakery') {
    g.fillStyle(colors.xp, 0.18);
    g.fillRoundedRect(left + w * 0.18, top + h * 0.24, w * 0.64, h * 0.24, 8);
    g.fillStyle(colors.danger, 0.2);
    g.fillRoundedRect(left + w * 0.22, top + h * 0.56, w * 0.18, h * 0.18, 5);
    g.fillRoundedRect(left + w * 0.58, top + h * 0.56, w * 0.18, h * 0.18, 5);
    g.lineStyle(1, colors.accent, 0.24);
    g.lineBetween(left + w * 0.16, top + h * 0.5, left + w * 0.84, top + h * 0.5);
    return;
  }

  if (mood === 'coast') {
    g.fillStyle(colors.accent, 0.2);
    g.fillEllipse(x, y, w * 0.64, h * 0.5);
    g.lineStyle(2, colors.xp, 0.34);
    for (let i = 0; i < 3; i++) {
      const yy = top + h * (0.34 + i * 0.14);
      g.lineBetween(left + w * 0.18, yy, left + w * 0.38, yy + h * 0.08);
      g.lineBetween(left + w * 0.38, yy + h * 0.08, left + w * 0.64, yy - h * 0.06);
      g.lineBetween(left + w * 0.64, yy - h * 0.06, left + w * 0.82, yy + h * 0.04);
    }
    g.fillStyle(colors.danger, 0.26);
    g.fillRoundedRect(left + w * 0.34, top + h * 0.58, w * 0.32, h * 0.16, 4);
    return;
  }

  if (mood === 'platform') {
    g.fillStyle(colors.bg, 0.38);
    g.fillRoundedRect(left + w * 0.12, top + h * 0.14, w * 0.76, h * 0.72, 4);
    g.lineStyle(2, colors.accent, 0.34);
    g.strokeRoundedRect(left + w * 0.12, top + h * 0.14, w * 0.76, h * 0.72, 4);
    g.lineStyle(1, colors.xp, 0.24);
    g.lineBetween(left + w * 0.22, top + h * 0.38, left + w * 0.78, top + h * 0.38);
    g.lineBetween(left + w * 0.22, top + h * 0.62, left + w * 0.78, top + h * 0.62);
    g.lineStyle(2, colors.danger, 0.32);
    g.strokeCircle(x, y, Math.min(w, h) * 0.22);
    return;
  }

  g.fillStyle(primary, 0.14);
  g.fillRoundedRect(left + w * 0.18, top + h * 0.26, w * 0.64, h * 0.46, 6);
  g.lineStyle(1, colors.xp, 0.2);
  g.strokeRoundedRect(left + w * 0.26, top + h * 0.34, w * 0.48, h * 0.28, 5);
}

function drawReadableCombatPocket(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  accent: number,
  bg: number,
) {
  const r = Math.min(168, Math.max(96, size * 0.19));
  g.fillStyle(bg, 0.08);
  g.fillCircle(cx, cy, r);
  g.lineStyle(1, accent, 0.12);
  g.strokeCircle(cx, cy, r);
  g.lineStyle(1, 0xffffff, 0.04);
  g.strokeCircle(cx, cy, r * 0.62);
}

function drawRadarGrid(g: Phaser.GameObjects.Graphics, width: number, height: number, accent: number) {
  const left = -width / 2;
  const top = -height / 2;
  const right = width / 2;
  const bottom = height / 2;
  g.clear();
  g.lineStyle(1, accent, 0.12);
  g.strokeRect(left + 8, top + 12, width - 16, height - 22);
  g.lineStyle(1, accent, 0.08);
  for (let i = 1; i < 4; i++) {
    const x = left + 8 + ((width - 16) * i) / 4;
    g.lineBetween(x, top + 12, x, bottom - 10);
  }
  for (let i = 1; i < 3; i++) {
    const y = top + 12 + ((height - 22) * i) / 3;
    g.lineBetween(left + 8, y, right - 8, y);
  }
  g.lineStyle(1, accent, 0.1);
  g.strokeCircle(0, 4, Math.min(width, height) * 0.24);
}

function drawBackdrop(scene: Phaser.Scene, def: GameDefinition, w: number, h: number, floorTextureKey: string | null = null, backdropTextureKey: string | null = null) {
  const g = scene.add.graphics().setDepth(DEPTH.floor + 0.01);
  const accent = hex(def.palette.accent);
  const danger = hex(def.palette.danger);
  const bg = hex(def.palette.background);
  const floor = hex(def.palette.floor);
  const bright = isBrightPalette(def);
  const mood = arenaMood(def);
  const quietTemplate = isQuietLiteralBackdropTemplate(def);
  const inset = Math.min(58, Math.max(28, Math.min(w, h) * 0.08));
  const innerW = Math.max(40, w - inset * 2);
  const innerH = Math.max(40, h - inset * 2);

  if (backdropTextureKey && scene.textures.exists(backdropTextureKey)) {
    const source = scene.textures.get(backdropTextureKey).getSourceImage() as { width?: number; height?: number };
    const sourceW = Math.max(1, Number(source.width) || w);
    const sourceH = Math.max(1, Number(source.height) || h);
    scene.add.image(w / 2, h / 2, backdropTextureKey)
      .setScale(Math.max(w / sourceW, h / sourceH))
      .setAlpha(bright ? 0.9 : 0.97)
      .setDepth(DEPTH.floor);
    g.fillStyle(0x000000, bright ? 0.14 : 0.08).fillRect(0, 0, w, h);
    g.lineStyle(2, bright ? 0x000000 : accent, bright ? 0.18 : 0.24);
    g.strokeRoundedRect(24, 24, Math.max(10, w - 48), Math.max(10, h - 48), 10);
    g.lineStyle(1, danger, bright ? 0.12 : 0.16);
    g.strokeRoundedRect(inset, inset, innerW, innerH, 8);
    g.fillStyle(0x000000, 0.12);
    g.fillCircle(0, 0, Math.min(w, h) * 0.28);
    g.fillCircle(w, 0, Math.min(w, h) * 0.28);
    g.fillCircle(0, h, Math.min(w, h) * 0.28);
    g.fillCircle(w, h, Math.min(w, h) * 0.28);
    return;
  }

  if (floorTextureKey && scene.textures.exists(floorTextureKey)) {
    scene.add.tileSprite(w / 2, h / 2, w, h, floorTextureKey)
      .setAlpha(quietTemplate ? 0.34 : bright ? 0.48 : 0.92)
      .setDepth(DEPTH.floor);
  } else {
    g.fillStyle(floor, 1).fillRect(0, 0, w, h);
  }

  if (bright) {
    g.fillStyle(0x061019, quietTemplate ? 0.52 : 0.42).fillRect(0, 0, w, h);
    g.fillStyle(0x000000, 0.24).fillRoundedRect(inset + 24, inset + 24, Math.max(10, innerW - 48), Math.max(10, innerH - 48), 12);
  }

  g.fillStyle(bg, bright ? 0.46 : 0.26);
  g.fillRect(0, 0, w, inset * 0.82);
  g.fillRect(0, h - inset * 0.82, w, inset * 0.82);
  g.fillRect(0, 0, inset * 0.82, h);
  g.fillRect(w - inset * 0.82, 0, inset * 0.82, h);

  g.fillStyle(floor, bright ? 0.16 : 0.44);
  g.fillRoundedRect(inset, inset, innerW, innerH, 12);
  g.fillStyle(bright ? 0x000000 : bg, bright ? 0.28 : 0.16);
  g.fillRoundedRect(inset + 18, inset + 18, Math.max(10, innerW - 36), Math.max(10, innerH - 36), 10);

  if (mood === 'coast') {
    const waterY = inset + innerH * 0.56;
    g.fillStyle(0x2d8fb7, bright ? 0.2 : 0.16);
    g.fillRoundedRect(inset + 20, waterY, Math.max(10, innerW - 40), Math.max(52, innerH * 0.2), 16);
    g.fillStyle(0xd8b56b, bright ? 0.16 : 0.12);
    g.fillRoundedRect(inset + 28, waterY + Math.max(36, innerH * 0.13), Math.max(10, innerW - 56), 36, 12);
  }

  g.lineStyle(1, bright ? 0x000000 : 0xffffff, quietTemplate ? 0.018 : bright ? 0.07 : 0.04);
  for (let x = 0; x < w; x += 64) g.lineBetween(x, 0, x, h);
  for (let y = 0; y < h; y += 64) g.lineBetween(0, y, w, y);

  g.lineStyle(1, accent, quietTemplate ? 0.026 : 0.1);
  for (let x = 32; x < w; x += 128) {
    g.lineBetween(x, inset, x + 48, inset + 48);
    g.lineBetween(x, h - inset, x + 48, h - inset - 48);
  }

  g.lineStyle(2, accent, quietTemplate ? 0.11 : 0.22);
  g.strokeRoundedRect(28, 28, Math.max(10, w - 56), Math.max(10, h - 56), 10);
  g.lineStyle(1, danger, quietTemplate ? 0.07 : 0.15);
  g.strokeRoundedRect(inset, inset, innerW, innerH, 8);

  g.fillStyle(accent, quietTemplate ? 0.07 : 0.14);
  g.fillRect(w / 2 - 44, inset - 3, 88, 6);
  g.fillRect(w / 2 - 44, h - inset - 3, 88, 6);
  g.fillRect(inset - 3, h / 2 - 44, 6, 88);
  g.fillRect(w - inset - 3, h / 2 - 44, 6, 88);

  g.fillStyle(0x000000, 0.14);
  g.fillCircle(0, 0, Math.min(w, h) * 0.32);
  g.fillCircle(w, 0, Math.min(w, h) * 0.32);
  g.fillCircle(0, h, Math.min(w, h) * 0.32);
  g.fillCircle(w, h, Math.min(w, h) * 0.32);
}

function installGameTestHooks(game: Phaser.Game, def: GameDefinition) {
  const flushScenes = (): void => {
    try {
      game.scene.processQueue();
    } catch {
      // Phaser may already be processing its scene queue; the next step will flush it.
    }
  };
  const activeKey = (): ForgeSceneKey | null => {
    for (const key of ['win', 'lose', 'forge', 'title'] as const) {
      if (game.scene.isActive(key)) return key;
    }
    return null;
  };
  const activePlay = (): ForgeScene | null => {
    try {
      if (!game.scene.isActive('forge')) return null;
      return game.scene.getScene('forge') as ForgeScene;
    } catch {
      return null;
    }
  };

  window.__GAME_TEST__ = {
    getState() {
      try {
        const key = activeKey();
        if (key === 'forge') return activePlay()?.getTestState() ?? { ...SAFE_STATE, scene: 'play' };
        if (key === 'win') return { ...SAFE_STATE, scene: 'win' };
        if (key === 'lose') return { ...SAFE_STATE, scene: 'lose' };
        return { ...SAFE_STATE, scene: 'title' };
      } catch {
        return { ...SAFE_STATE };
      }
    },
    press(action, ms = 120) {
      try {
        if (action === 'start') {
          if (game.scene.isActive('title')) game.scene.stop('title');
          game.scene.start('forge', { def });
          flushScenes();
          return;
        }
        if (action === 'restart') {
          for (const key of ['win', 'lose', 'forge', 'title'] as const) {
            if (game.scene.isActive(key)) game.scene.stop(key);
          }
          game.scene.start('forge', { def });
          flushScenes();
          return;
        }
        if (action === 'pause') {
          activePlay()?.togglePause();
          return;
        }
        const play = activePlay();
        if (!play) return;
        const dir: Record<string, Partial<Intent>> = {
          up: { dx: 0, dy: -1 },
          down: { dx: 0, dy: 1 },
          left: { dx: -1, dy: 0 },
          right: { dx: 1, dy: 0 },
          attack: { attack: true },
          dash: { dash: true },
        };
        play.injectIntent(dir[action] ?? {}, action === 'attack' || action === 'dash' ? Math.min(ms, 90) : ms);
      } catch {
        // Automation hooks must never crash the page.
      }
    },
    spawnEnemy(typeIndex) {
      try { activePlay()?.spawnEnemyForTest(typeIndex); } catch {}
    },
    spawnContactEnemy(typeIndex) {
      try { activePlay()?.spawnContactEnemyForTest(typeIndex); } catch {}
    },
    spawnEliteEnemy(typeIndex) {
      try { activePlay()?.spawnEliteEnemyForTest(typeIndex); } catch {}
    },
    damagePlayer(amount) {
      try { activePlay()?.damagePlayerForTest(amount); } catch {}
    },
    damageFirstEnemy(amount) {
      try { activePlay()?.damageFirstEnemyForTest(amount); } catch {}
    },
    triggerComboReward() {
      try { activePlay()?.triggerComboRewardForTest(); } catch {}
    },
    stageVisualEvidence() {
      try { activePlay()?.stageVisualEvidenceForTest(); } catch {}
    },
    stagePublicDemo() {
      try { activePlay()?.stagePublicDemoForTest(); } catch {}
    },
    spawnBoss() {
      try { activePlay()?.spawnBossForTest(); } catch {}
    },
    spawnContactBoss() {
      try { activePlay()?.spawnContactBossForTest(); } catch {}
    },
    triggerBossTelegraph() {
      try { activePlay()?.triggerBossTelegraphForTest(); } catch {}
    },
    triggerArenaHazard() {
      try { activePlay()?.triggerArenaHazardForTest(); } catch {}
    },
    triggerSapperMine() {
      try { activePlay()?.triggerSapperMineForTest(); } catch {}
    },
    triggerObjectivePickup() {
      try { activePlay()?.triggerObjectivePickupForTest(); } catch {}
    },
    collectObjectivePickup() {
      try { activePlay()?.collectObjectivePickupForTest(); } catch {}
    },
    enterCaptureZone() {
      try { activePlay()?.enterCaptureZoneForTest(); } catch {}
    },
    advanceEscort() {
      try { activePlay()?.advanceEscortForTest(); } catch {}
    },
    fortifyDefendCore() {
      try { activePlay()?.fortifyDefendCoreForTest(); } catch {}
    },
    repairNode() {
      try { activePlay()?.repairNodeForTest(); } catch {}
    },
    enterExtractZone() {
      try { activePlay()?.enterExtractZoneForTest(); } catch {}
    },
    rescueSurvivor() {
      try { activePlay()?.rescueSurvivorForTest(); } catch {}
    },
    enterRescueExtraction() {
      try { activePlay()?.enterRescueExtractionForTest(); } catch {}
    },
    collectUnlockKey() {
      try { activePlay()?.collectUnlockKeyForTest(); } catch {}
    },
    enterUnlockGate() {
      try { activePlay()?.enterUnlockGateForTest(); } catch {}
    },
    approveAgentDashboard() {
      try { activePlay()?.approveAgentDashboardForTest(); } catch {}
    },
    chooseDecisionRoomOption() {
      try { activePlay()?.chooseDecisionRoomOptionForTest(); } catch {}
    },
    levelUp() {
      try { activePlay()?.levelUpForTest(); } catch {}
    },
    chooseUpgrade(index) {
      try { activePlay()?.chooseUpgradeForTest(index); } catch {}
    },
    killAllEnemies() {
      try { activePlay()?.killAllEnemiesForTest(); } catch {}
    },
    triggerWin() {
      try {
        const score = activePlay()?.getTestState().score ?? 0;
        activePlay()?.triggerWinForTest();
        flushScenes();
        if (!game.scene.isActive('win')) {
          if (game.scene.isActive('forge')) game.scene.stop('forge');
          game.scene.start('win', { def, score });
          flushScenes();
        }
      } catch {}
    },
    triggerLose() {
      try {
        const score = activePlay()?.getTestState().score ?? 0;
        activePlay()?.triggerLoseForTest();
        flushScenes();
        if (!game.scene.isActive('lose')) {
          if (game.scene.isActive('forge')) game.scene.stop('forge');
          game.scene.start('lose', { def, score });
          flushScenes();
        }
      } catch {}
    },
  };
}

function runSelfTestIfRequested() {
  if (!window.location.search.includes('selftest')) return;
  void (async () => {
    const checks: { name: string; pass: boolean; detail?: string }[] = [];
    const errors: string[] = [];
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const check = (name: string, pass: boolean, detail?: string) => {
      checks.push(detail === undefined ? { name, pass } : { name, pass, detail });
    };
    const publish = () => {
      const verdict = { pass: checks.length > 0 && checks.every((c) => c.pass) && errors.length === 0, checks, errors };
      const json = JSON.stringify(verdict);
      document.title = `SELFTEST_RESULT:${json}`;
      let pre = document.getElementById('selftest-result');
      if (!pre) {
        pre = document.createElement('pre');
        pre.id = 'selftest-result';
        document.body.appendChild(pre);
      }
      pre.textContent = json;
    };

    try {
      const api = await waitForGameTest();
      await sleep(300);
      const initial = api.getState();
      check('initial scene is title', initial.scene === 'title', `got ${initial.scene}`);
      api.press('start');
      await sleep(800);
      const afterStart = api.getState();
      check('scene transitions to play', afterStart.scene === 'play', `got ${afterStart.scene}`);
      check(
        'arena dressing anchors are present',
        afterStart.arenaDecorAnchors >= 8,
        `anchors ${afterStart.arenaDecorAnchors}`,
      );
      check(
        'ambient room motion is present',
        afterStart.ambientMotionFx >= 12,
        `fx ${afterStart.ambientMotionFx}`,
      );
      check(
        'feel profile presentation is authored',
        afterStart.profilePresentationFx > 0 && Boolean(afterStart.profileDirectorPhase),
        `profile ${afterStart.feelProfile}, fx ${afterStart.profilePresentationFx}, phase ${afterStart.profileDirectorPhase}`,
      );
      check(
        'feel profile framing is authored',
        afterStart.profileFramingFx > 0 && Boolean(afterStart.profileFramingMode) && afterStart.profileAnimationFrame >= 0,
        `profile ${afterStart.feelProfile}, mode ${afterStart.profileFramingMode}, fx ${afterStart.profileFramingFx}, frame ${afterStart.profileAnimationFrame}`,
      );
      check(
        'profile camera director is authored',
        afterStart.cameraDirectorFx > 0 && Boolean(afterStart.cameraDirectorMode) && afterStart.cameraDirectorIntensity >= 0,
        `profile ${afterStart.feelProfile}, mode ${afterStart.cameraDirectorMode}, fx ${afterStart.cameraDirectorFx}, intensity ${afterStart.cameraDirectorIntensity}`,
      );
      check(
        'actor animation layer is authored',
        afterStart.actorAnimationFx > 0 && Boolean(afterStart.playerAnimationState),
        `fx ${afterStart.actorAnimationFx}, player ${afterStart.playerAnimationState}`,
      );
      check(
        'actor rig animation is authored',
        afterStart.actorRigFx > 0 && afterStart.actorRigFrame >= 0,
        `rigFx ${afterStart.actorRigFx}, frame ${afterStart.actorRigFrame}, player ${afterStart.playerAnimationState}`,
      );
      check(
        'sprite-sheet actor animation is active',
        afterStart.spriteSheetAssets > 0 &&
          afterStart.spriteSheetAnimatedKeys.includes(afterStart.assetKeys?.player ?? '') &&
          afterStart.spriteSheetAnimationNames.length > 0 &&
          afterStart.spriteSheetFrame >= 0,
        `assets ${afterStart.spriteSheetAssets}, keys ${afterStart.spriteSheetAnimatedKeys.join(',')}, clips ${afterStart.spriteSheetAnimationNames.join(',')}, frame ${afterStart.spriteSheetFrame}`,
      );
      check(
        'encounter plate presents objective',
        afterStart.encounterPlateVisible === true &&
          Boolean(afterStart.encounterPlateTitle) &&
          Boolean(afterStart.encounterPlateObjective) &&
          afterStart.encounterThreatLevel >= 1,
        `visible ${afterStart.encounterPlateVisible}, title ${afterStart.encounterPlateTitle}, objective ${afterStart.encounterPlateObjective}, threat ${afterStart.encounterThreatLevel}`,
      );
      check(
        'tactical radar is visible',
        afterStart.tacticalRadarVisible === true,
        `visible ${afterStart.tacticalRadarVisible}, enemies ${afterStart.tacticalRadarEnemyPips}, objectives ${afterStart.tacticalRadarObjectivePips}, boss ${afterStart.tacticalRadarBossVisible}`,
      );
      check(
        'director feed announces objective',
        afterStart.directorFeedVisible === true &&
          afterStart.directorFeedEntries > 0 &&
          Boolean(afterStart.directorFeedLatest?.includes('Objective')),
        `visible ${afterStart.directorFeedVisible}, entries ${afterStart.directorFeedEntries}, latest ${afterStart.directorFeedLatest}`,
      );
      check(
        'playstyle profile reaches runtime',
        Boolean(afterStart.feelProfile) &&
          Boolean(afterStart.playStyle?.pressure) &&
          Boolean(afterStart.playStyle?.weaponCadence) &&
          afterStart.weaponCooldownMs >= 110 &&
          afterStart.weaponProjectiles >= 1 &&
          afterStart.spawnPressureScale > 0 &&
          afterStart.pressureRamp >= 1,
        `profile ${afterStart.feelProfile}, pressure ${afterStart.playStyle?.pressure}, cadence ${afterStart.playStyle?.weaponCadence}, cooldown ${afterStart.weaponCooldownMs}, projectiles ${afterStart.weaponProjectiles}, spawnScale ${afterStart.spawnPressureScale}, ramp ${afterStart.pressureRamp.toFixed(2)}`,
      );
      check(
        'runtime template reaches runtime',
        afterStart.runtimeTemplate === 'arena-action' || afterStart.runtimeTemplate === 'flight-shooter' || afterStart.runtimeTemplate === 'platformer' || afterStart.runtimeTemplate === 'puzzle-room' || afterStart.runtimeTemplate === 'agent-dashboard' || afterStart.runtimeTemplate === 'decision-room',
        `template ${afterStart.runtimeTemplate}`,
      );
      if (afterStart.runtimeTemplate === 'flight-shooter') {
        check(
          'flight shooter lane presentation is authored',
          afterStart.flightLaneFx >= 6 && afterStart.flightScrollOffset >= 0,
          `fx ${afterStart.flightLaneFx}, scroll ${afterStart.flightScrollOffset}`,
        );
      }
      if (afterStart.runtimeTemplate === 'platformer') {
        check(
          'platformer ledge presentation is authored',
          afterStart.platformerFx >= 8,
          `fx ${afterStart.platformerFx}, grounded ${afterStart.platformerGrounded}`,
        );
        const beforeJump = api.getState();
        api.press('up', 220);
        await sleep(360);
        const afterJump = api.getState();
        check(
          'platformer jump behavior is authored',
          afterJump.platformerJumpFx > beforeJump.platformerJumpFx || afterJump.playerPos.y < beforeJump.playerPos.y - 6,
          `before y ${beforeJump.playerPos.y.toFixed(1)}, after y ${afterJump.playerPos.y.toFixed(1)}, jumps ${beforeJump.platformerJumpFx}->${afterJump.platformerJumpFx}`,
        );
      }
      if (afterStart.runtimeTemplate === 'puzzle-room') {
        check(
          'puzzle room grid presentation is authored',
          afterStart.puzzleFx >= 30 &&
            afterStart.puzzleBlocks > 0 &&
            afterStart.puzzleExitVisible === true &&
            afterStart.puzzleMoveLimit !== null &&
            afterStart.puzzlePlayerCell !== null,
          `fx ${afterStart.puzzleFx}, blocks ${afterStart.puzzleBlocks}, exit ${afterStart.puzzleExitVisible}, moves ${afterStart.puzzleMoves}/${afterStart.puzzleMoveLimit}, cell ${JSON.stringify(afterStart.puzzlePlayerCell)}`,
        );
        check(
          'puzzle room objective guide is visible',
          afterStart.objectiveGuideVisible === true && Boolean(afterStart.objectiveGuideLabel),
          `visible ${afterStart.objectiveGuideVisible}, label ${afterStart.objectiveGuideLabel}, distance ${afterStart.objectiveGuideDistance}`,
        );
        const canvasQuality = sampleCanvasQuality();
        check('canvas renders nonblank play scene', canvasQuality.pass, canvasQuality.detail);
        const sourceBacked =
          afterStart.sourceBacked?.player === true &&
          afterStart.sourceBacked?.firstEnemy === true &&
          afterStart.sourceBacked?.floor === true;
        check(
          'definition carries source-backed assets',
          sourceBacked,
          `player ${afterStart.sourceBacked?.player}, enemy ${afterStart.sourceBacked?.firstEnemy}, floor ${afterStart.sourceBacked?.floor}`,
        );

        const moveBefore = api.getState();
        api.press('right', 100);
        await sleep(240);
        const afterGem = api.getState();
        check(
          'puzzle step moves player and collects gem',
          (afterGem.puzzleMoves > moveBefore.puzzleMoves) &&
            ((afterGem.puzzlePlayerCell?.x ?? 0) > (moveBefore.puzzlePlayerCell?.x ?? -1)) &&
            afterGem.puzzleGems > moveBefore.puzzleGems,
          `moves ${moveBefore.puzzleMoves}->${afterGem.puzzleMoves}, gems ${moveBefore.puzzleGems}->${afterGem.puzzleGems}, cell ${JSON.stringify(moveBefore.puzzlePlayerCell)}->${JSON.stringify(afterGem.puzzlePlayerCell)}`,
        );
        api.press('down', 100);
        await sleep(240);
        const switchesBefore = api.getState();
        api.press('right', 100);
        await sleep(260);
        const afterPush = api.getState();
        check(
          'puzzle block push lights switch',
          afterPush.puzzleMoves > switchesBefore.puzzleMoves &&
            afterPush.puzzleSwitchesLit > switchesBefore.puzzleSwitchesLit &&
            afterPush.puzzleSwitchTarget !== null,
          `moves ${switchesBefore.puzzleMoves}->${afterPush.puzzleMoves}, switches ${switchesBefore.puzzleSwitchesLit}->${afterPush.puzzleSwitchesLit}/${afterPush.puzzleSwitchTarget}`,
        );
        for (const action of ['down', 'right', 'right', 'down', 'right', 'right', 'down'] as const) {
          if (api.getState().scene !== 'play') break;
          api.press(action, 100);
          await sleep(230);
        }
        const solved = api.getState();
        check(
          'puzzle exit can be solved',
          solved.scene === 'win' || solved.puzzleSolved === true,
          `scene ${solved.scene}, solved ${solved.puzzleSolved}, cell ${JSON.stringify(solved.puzzlePlayerCell)}, switches ${solved.puzzleSwitchesLit}/${solved.puzzleSwitchTarget}`,
        );
        api.press('restart');
        await sleep(700);
        check('restart transitions to play', api.getState().scene === 'play' && api.getState().playerHealth > 0, `got ${api.getState().scene}`);
        const hp = api.getState().playerHealth;
        api.damagePlayer(1);
        await sleep(200);
        check('damagePlayer reduces hp', api.getState().playerHealth < hp, `before ${hp}, after ${api.getState().playerHealth}`);
        api.triggerLose();
        await sleep(450);
        check('triggerLose transitions to lose', api.getState().scene === 'lose', `got ${api.getState().scene}`);
        api.press('restart');
        await sleep(700);
        api.triggerWin();
        await sleep(450);
        check('triggerWin transitions to win', api.getState().scene === 'win', `got ${api.getState().scene}`);
        return;
      }
      if (afterStart.runtimeTemplate === 'agent-dashboard') {
        check(
          'agent dashboard cockpit presentation is authored',
          afterStart.agentDashboardFx >= 24 &&
            afterStart.agentDashboardApprovalTarget !== null &&
            afterStart.agentDashboardTaskTarget !== null &&
            afterStart.agentDashboardHealth !== null,
          `fx ${afterStart.agentDashboardFx}, approvals ${afterStart.agentDashboardApprovals}/${afterStart.agentDashboardApprovalTarget}, tasks ${afterStart.agentDashboardTasksDone}/${afterStart.agentDashboardTaskTarget}, health ${afterStart.agentDashboardHealth}, selected ${afterStart.agentDashboardSelectedAgent}`,
        );
        check(
          'agent dashboard objective is visible',
          afterStart.encounterPlateObjective?.includes('APPROVE') === true &&
            afterStart.directorFeedLatest?.includes('Objective') === true,
          `objective ${afterStart.encounterPlateObjective}, feed ${afterStart.directorFeedLatest}`,
        );
        const canvasQuality = sampleCanvasQuality();
        check('canvas renders nonblank play scene', canvasQuality.pass, canvasQuality.detail);
        const sourceBacked =
          afterStart.sourceBacked?.player === true &&
          afterStart.sourceBacked?.firstEnemy === true &&
          afterStart.sourceBacked?.floor === true;
        check(
          'definition carries source-backed assets',
          sourceBacked,
          `player ${afterStart.sourceBacked?.player}, enemy ${afterStart.sourceBacked?.firstEnemy}, floor ${afterStart.sourceBacked?.floor}`,
        );
        const approvalsBefore = api.getState().agentDashboardApprovals;
        api.approveAgentDashboard();
        await sleep(220);
        const firstApproval = api.getState();
        check(
          'agent dashboard approval advances gate',
          firstApproval.agentDashboardApprovals > approvalsBefore,
          `approvals ${approvalsBefore}->${firstApproval.agentDashboardApprovals}/${firstApproval.agentDashboardApprovalTarget}, ready ${firstApproval.agentDashboardReady}`,
        );
        const deadline = Date.now() + 1600;
        while (api.getState().scene === 'play' && Date.now() < deadline) {
          api.approveAgentDashboard();
          await sleep(220);
        }
        const approved = api.getState();
        check(
          'agent dashboard approvals can complete run',
          approved.scene === 'win' || approved.agentDashboardReady === true,
          `scene ${approved.scene}, approvals ${approved.agentDashboardApprovals}/${approved.agentDashboardApprovalTarget}, ready ${approved.agentDashboardReady}`,
        );
        api.press('restart');
        await sleep(700);
        check('restart transitions to play', api.getState().scene === 'play' && api.getState().playerHealth > 0, `got ${api.getState().scene}`);
        const hp = api.getState().playerHealth;
        api.damagePlayer(1);
        await sleep(200);
        check('damagePlayer reduces hp', api.getState().playerHealth < hp, `before ${hp}, after ${api.getState().playerHealth}`);
        api.triggerLose();
        await sleep(450);
        check('triggerLose transitions to lose', api.getState().scene === 'lose', `got ${api.getState().scene}`);
        api.press('restart');
        await sleep(700);
        api.triggerWin();
        await sleep(450);
        check('triggerWin transitions to win', api.getState().scene === 'win', `got ${api.getState().scene}`);
        return;
      }
      if (afterStart.runtimeTemplate === 'decision-room') {
        check(
          'decision room boardroom presentation is authored',
          afterStart.decisionRoomFx >= 24 &&
            afterStart.decisionRoomOptions >= 2 &&
            afterStart.decisionRoomEvidence >= 3 &&
            afterStart.decisionRoomStakeholders >= 3 &&
            afterStart.decisionRoomRecommendedOption !== null &&
            afterStart.decisionRoomConfidence !== null,
          `fx ${afterStart.decisionRoomFx}, options ${afterStart.decisionRoomOptions}, evidence ${afterStart.decisionRoomEvidence}, stakeholders ${afterStart.decisionRoomStakeholders}, recommended ${afterStart.decisionRoomRecommendedOption}, confidence ${afterStart.decisionRoomConfidence}`,
        );
        check(
          'decision room objective is visible',
          afterStart.encounterPlateObjective?.includes('SELECT') === true &&
            afterStart.directorFeedLatest?.includes('Objective') === true,
          `objective ${afterStart.encounterPlateObjective}, feed ${afterStart.directorFeedLatest}`,
        );
        const canvasQuality = sampleCanvasQuality();
        check('canvas renders nonblank play scene', canvasQuality.pass, canvasQuality.detail);
        const sourceBacked =
          afterStart.sourceBacked?.player === true &&
          afterStart.sourceBacked?.firstEnemy === true &&
          afterStart.sourceBacked?.floor === true;
        check(
          'definition carries source-backed assets',
          sourceBacked,
          `player ${afterStart.sourceBacked?.player}, enemy ${afterStart.sourceBacked?.firstEnemy}, floor ${afterStart.sourceBacked?.floor}`,
        );
        const beforeDecision = api.getState();
        api.chooseDecisionRoomOption();
        await sleep(260);
        const selected = api.getState();
        check(
          'decision room selects recommendation and completes run',
          selected.scene === 'win' || (selected.decisionRoomSelectedOption === beforeDecision.decisionRoomRecommendedOption && selected.decisionRoomReady === true),
          `scene ${selected.scene}, selected ${selected.decisionRoomSelectedOption}, recommended ${beforeDecision.decisionRoomRecommendedOption}, ready ${selected.decisionRoomReady}`,
        );
        api.press('restart');
        await sleep(700);
        check('restart transitions to play', api.getState().scene === 'play' && api.getState().playerHealth > 0, `got ${api.getState().scene}`);
        const hp = api.getState().playerHealth;
        api.damagePlayer(1);
        await sleep(200);
        check('damagePlayer reduces hp', api.getState().playerHealth < hp, `before ${hp}, after ${api.getState().playerHealth}`);
        api.triggerLose();
        await sleep(450);
        check('triggerLose transitions to lose', api.getState().scene === 'lose', `got ${api.getState().scene}`);
        api.press('restart');
        await sleep(700);
        api.triggerWin();
        await sleep(450);
        check('triggerWin transitions to win', api.getState().scene === 'win', `got ${api.getState().scene}`);
        return;
      }
      const roles = afterStart.enemyRoleSignature;
      const waveRoles = afterStart.waveRoleSignature;
      const hasRoles = (...needles: Enemy['role'][]) => needles.every((role) => roles.includes(role));
      if (afterStart.weaponAutoFire === false) {
        check(
          'manual weapon disables auto-fire',
          afterStart.weaponAutoFire === false,
          `runtime ${afterStart.weaponAutoFire}`,
        );
      }
      let profileCompositionOk = roles.length >= 3 && waveRoles.length === afterStart.waveCount && afterStart.waveCount >= 4;
      if (afterStart.feelProfile === 'arcade-survivor' && afterStart.weaponAutoFire === false) {
        profileCompositionOk = profileCompositionOk && hasRoles('chaser', 'charger', 'brute') && waveRoles.includes('charger') && waveRoles.includes('brute');
      } else if (afterStart.feelProfile === 'arcade-survivor') {
        profileCompositionOk = profileCompositionOk && hasRoles('chaser', 'sapper', 'shooter') && waveRoles.includes('sapper');
      } else if (afterStart.feelProfile === 'bullet-hell-raid') {
        profileCompositionOk = profileCompositionOk && hasRoles('shooter', 'orbiter', 'sniper') && waveRoles.includes('orbiter') && waveRoles.includes('sniper') && afterStart.waveCount >= 5;
      } else if (afterStart.feelProfile === 'siege-defense') {
        profileCompositionOk = profileCompositionOk && hasRoles('brute', 'guardian', 'support') && waveRoles.includes('brute') && waveRoles.includes('guardian') && waveRoles.includes('support') && afterStart.waveCount >= 5;
      } else if (afterStart.feelProfile === 'cozy-explorer') {
        profileCompositionOk = profileCompositionOk && hasRoles('wanderer', 'chaser', 'orbiter');
      } else if (afterStart.feelProfile === 'score-chaser') {
        profileCompositionOk = profileCompositionOk && hasRoles('charger', 'sentinel', 'sniper') && waveRoles.includes('sentinel') && waveRoles.includes('sniper') && afterStart.waveCount >= 5;
      }
      check(
        'feel profile enemy mix reaches runtime',
        profileCompositionOk,
        `profile ${afterStart.feelProfile}, roles ${roles.join(',')}, waves ${waveRoles.join(',')}, count ${afterStart.waveCount}`,
      );
      const touchRequired = shouldShowTouchControls();
      check(
        'touch controls appear when viewport needs them',
        !touchRequired || afterStart.touchControlsVisible === true,
        `required ${touchRequired}, visible ${afterStart.touchControlsVisible}`,
      );
      const expectsObjectiveGuide = afterStart.winCondition === 'capture-zone' ||
        afterStart.winCondition === 'escort' ||
        afterStart.winCondition === 'defend-core' ||
        afterStart.winCondition === 'repair-nodes' ||
        afterStart.winCondition === 'extract' ||
        afterStart.winCondition === 'rescue' ||
        afterStart.winCondition === 'unlock-gate';
      check(
        'static objectives show guidance marker',
        !expectsObjectiveGuide || afterStart.objectiveGuideVisible === true,
        `expected ${expectsObjectiveGuide}, visible ${afterStart.objectiveGuideVisible}, label ${afterStart.objectiveGuideLabel}, distance ${afterStart.objectiveGuideDistance}`,
      );
      if (expectsObjectiveGuide) {
        const motionFrameBefore = afterStart.objectiveMotionFrame;
        await sleep(220);
        const objectiveMotion = api.getState();
        check(
          'static objectives show animated objective layer',
          objectiveMotion.objectiveMotionFx > 0 && objectiveMotion.objectiveMotionFrame !== motionFrameBefore,
          `fx ${objectiveMotion.objectiveMotionFx}, frame ${motionFrameBefore}->${objectiveMotion.objectiveMotionFrame}`,
        );
      }
      let maxPendingSpawns = api.getState().pendingSpawns;
      const spawnWarningDeadline = Date.now() + 1600;
      while (maxPendingSpawns <= 0 && Date.now() < spawnWarningDeadline) {
        await sleep(60);
        maxPendingSpawns = Math.max(maxPendingSpawns, api.getState().pendingSpawns);
      }
      check('scheduled waves show spawn warning', maxPendingSpawns > 0, `pending ${api.getState().pendingSpawns}, max ${maxPendingSpawns}`);
      const before = api.getState().playerPos;
      api.press('right', 500);
      await sleep(700);
      const afterMove = api.getState().playerPos;
      check('right input moves player', afterMove.x > before.x, `before ${before.x}, after ${afterMove.x}`);
      api.spawnEnemy(0);
      await sleep(300);
      check('spawnEnemy creates enemies', api.getState().enemiesAlive > 0, `alive ${api.getState().enemiesAlive}`);
      check(
        'enemy actor animation states are authored',
        api.getState().actorAnimationFx > 1 && api.getState().enemyAnimationStates.length > 0,
        `fx ${api.getState().actorAnimationFx}, states ${api.getState().enemyAnimationStates.join(',')}`,
      );
      check(
        'enemy rig animation states are authored',
        api.getState().actorRigFx > 1 && api.getState().enemyAnimationStates.some((state) => state.includes('-rig')),
        `rigFx ${api.getState().actorRigFx}, states ${api.getState().enemyAnimationStates.join(',')}`,
      );
      check(
        'enemy sprite-sheet animation is active',
        api.getState().spriteSheetAnimatedKeys.length >= 2 && api.getState().spriteSheetAnimationNames.length >= 1,
        `keys ${api.getState().spriteSheetAnimatedKeys.join(',')}, clips ${api.getState().spriteSheetAnimationNames.join(',')}, frame ${api.getState().spriteSheetFrame}`,
      );
      const sniperIndex = roles.indexOf('sniper');
      if (sniperIndex >= 0) {
        api.spawnEnemy(sniperIndex);
        await sleep(420);
        const sniperStates = api.getState().enemyAnimationStates;
        check(
          'sniper enemy behavior states are authored',
          sniperStates.some((state) => state.startsWith('sniper-')),
          `states ${sniperStates.join(',')}`,
        );
      }
      const sentinelIndex = roles.indexOf('sentinel');
      if (sentinelIndex >= 0) {
        api.killAllEnemies();
        await sleep(80);
        api.spawnEnemy(sentinelIndex);
        let sentinelState = api.getState();
        const sentinelDeadline = Date.now() + 3400;
        while (!sentinelState.sentinelLaneVisible && Date.now() < sentinelDeadline) {
          await sleep(80);
          sentinelState = api.getState();
        }
        check(
          'sentinel enemy behavior states are authored',
          sentinelState.enemyAnimationStates.some((state) => state.startsWith('sentinel-')),
          `states ${sentinelState.enemyAnimationStates.join(',')}`,
        );
        check(
          'sentinel lane burst is visible',
          sentinelState.sentinelLaneVisible === true,
          `visible ${sentinelState.sentinelLaneVisible}`,
        );
      }
      const sapperIndex = roles.indexOf('sapper');
      if (sapperIndex >= 0) {
        api.spawnEnemy(sapperIndex);
        await sleep(420);
        const sapperBehaviorState = api.getState();
        check(
          'sapper enemy behavior states are authored',
          sapperBehaviorState.enemyAnimationStates.some((state) => state.startsWith('sapper-')),
          `states ${sapperBehaviorState.enemyAnimationStates.join(',')}`,
        );
        api.triggerSapperMine();
        await sleep(80);
        let sapperState = api.getState();
        const sapperDeadline = Date.now() + 3200;
        while (!sapperState.arenaHazardVisible && Date.now() < sapperDeadline) {
          await sleep(80);
          sapperState = api.getState();
        }
        check(
          'sapper mine telegraph is visible',
          sapperState.arenaHazardVisible === true,
          `visible ${sapperState.arenaHazardVisible}`,
        );
      }
      const supportIndex = roles.indexOf('support');
      if (supportIndex >= 0) {
        api.killAllEnemies();
        await sleep(80);
        api.spawnEnemy(supportIndex);
        let supportState = api.getState();
        const supportDeadline = Date.now() + 3200;
        while (!supportState.supportPulseVisible && Date.now() < supportDeadline) {
          await sleep(80);
          supportState = api.getState();
        }
        check(
          'support enemy behavior states are authored',
          supportState.enemyAnimationStates.some((state) => state.startsWith('support-')),
          `states ${supportState.enemyAnimationStates.join(',')}`,
        );
        check(
          'support pulse is visible',
          supportState.supportPulseVisible === true,
          `visible ${supportState.supportPulseVisible}`,
        );
      }
      const guardianIndex = roles.indexOf('guardian');
      if (guardianIndex >= 0) {
        api.killAllEnemies();
        await sleep(80);
        api.spawnEnemy(guardianIndex);
        let guardianState = api.getState();
        const guardianDeadline = Date.now() + 3000;
        while (!guardianState.guardianShieldVisible && Date.now() < guardianDeadline) {
          await sleep(80);
          guardianState = api.getState();
        }
        check(
          'guardian enemy behavior states are authored',
          guardianState.enemyAnimationStates.some((state) => state.startsWith('guardian-')),
          `states ${guardianState.enemyAnimationStates.join(',')}`,
        );
        check(
          'guardian shield is visible',
          guardianState.guardianShieldVisible === true,
          `visible ${guardianState.guardianShieldVisible}`,
        );
      }
      let radarTrackState = api.getState();
      const radarTrackDeadline = Date.now() + 700;
      while (radarTrackState.tacticalRadarEnemyPips <= 0 && radarTrackState.enemiesAlive > 0 && Date.now() < radarTrackDeadline) {
        await sleep(80);
        radarTrackState = api.getState();
      }
      check(
        'tactical radar tracks spawned enemies',
        radarTrackState.tacticalRadarEnemyPips > 0,
        `enemy pips ${radarTrackState.tacticalRadarEnemyPips}, alive ${radarTrackState.enemiesAlive}`,
      );
      api.spawnEliteEnemy(0);
      await sleep(180);
      check('elite spawn creates marked enemy', api.getState().eliteEnemies > 0, `elite ${api.getState().eliteEnemies}`);
      check(
        'director feed reports elite contact',
        Boolean(api.getState().directorFeedLatest?.includes('Elite')),
        `latest ${api.getState().directorFeedLatest}, entries ${api.getState().directorFeedEntries}`,
      );
      api.triggerArenaHazard();
      await sleep(140);
      check('arena hazard telegraph is visible', api.getState().arenaHazardVisible === true, `visible ${api.getState().arenaHazardVisible}`);
      api.damageFirstEnemy(1);
      await sleep(120);
      check('enemy damage shows combat feedback', api.getState().combatFeedbackVisible === true, `visible ${api.getState().combatFeedbackVisible}`);
      check(
        'enemy damage shows impact beat',
        api.getState().impactBeatVisible === true && api.getState().impactBeatCount > 0,
        `visible ${api.getState().impactBeatVisible}, count ${api.getState().impactBeatCount}`,
      );
      api.killAllEnemies();
      await sleep(80);
      const comboScoreBefore = api.getState().score;
      api.triggerComboReward();
      await sleep(120);
      const comboState = api.getState();
      check(
        'quick kills build combo reward',
        comboState.combo >= 2 &&
          comboState.comboVisible === true &&
          comboState.comboMultiplier > 1 &&
          comboState.score > comboScoreBefore,
        `combo ${comboState.combo}, visible ${comboState.comboVisible}, multiplier ${comboState.comboMultiplier}, score ${comboScoreBefore}->${comboState.score}`,
      );
      if (api.getState().winCondition === 'score-target') {
        const scoreBeforePickup = api.getState().score;
        api.triggerObjectivePickup();
        await sleep(140);
        check(
          'score objective pickup is visible',
          api.getState().objectivePickupVisible === true,
          `visible ${api.getState().objectivePickupVisible}`,
        );
        api.collectObjectivePickup();
        await sleep(160);
        check(
          'score objective pickup increases score',
          api.getState().score > scoreBeforePickup,
          `score ${scoreBeforePickup}->${api.getState().score}, target ${api.getState().scoreTarget}`,
        );
      }
      if (api.getState().winCondition === 'survive') {
        const healthBeforeSupplyDamage = api.getState().playerHealth;
        api.damagePlayer(18);
        await sleep(80);
        const damagedHealth = api.getState().playerHealth;
        api.triggerObjectivePickup();
        await sleep(140);
        check(
          'survive supply beacon is visible',
          api.getState().objectivePickupVisible === true,
          `visible ${api.getState().objectivePickupVisible}`,
        );
        api.collectObjectivePickup();
        await sleep(160);
        check(
          'survive supply beacon heals player',
          damagedHealth < healthBeforeSupplyDamage && api.getState().playerHealth > damagedHealth,
          `hp ${healthBeforeSupplyDamage}->${damagedHealth}->${api.getState().playerHealth}`,
        );
      }
      if (api.getState().winCondition === 'collect-relics') {
        const relicsBeforePickup = api.getState().relics;
        api.triggerObjectivePickup();
        await sleep(140);
        check(
          'collect relic pickup is visible',
          api.getState().objectivePickupVisible === true,
          `visible ${api.getState().objectivePickupVisible}`,
        );
        api.collectObjectivePickup();
        await sleep(160);
        check(
          'collect relic pickup increases relic progress',
          api.getState().relics > relicsBeforePickup,
          `relics ${relicsBeforePickup}->${api.getState().relics}, target ${api.getState().relicTarget}`,
        );
      }
      if (api.getState().winCondition === 'capture-zone') {
        const captureBefore = api.getState().captureProgress;
        check(
          'capture zone is visible',
          api.getState().captureZoneVisible === true,
          `visible ${api.getState().captureZoneVisible}`,
        );
        api.enterCaptureZone();
        await sleep(900);
        check(
          'capture zone progresses while held',
          api.getState().captureProgress > captureBefore && api.getState().captureTarget !== null,
          `capture ${captureBefore.toFixed(2)}->${api.getState().captureProgress.toFixed(2)}, target ${api.getState().captureTarget}, contested ${api.getState().captureContested}`,
        );
      }
      if (api.getState().winCondition === 'escort') {
        const escortBefore = api.getState().escortProgress;
        check(
          'escort ally is visible',
          api.getState().escortVisible === true,
          `visible ${api.getState().escortVisible}, hp ${api.getState().escortHealth}`,
        );
        api.advanceEscort();
        await sleep(900);
        check(
          'escort ally advances while protected',
          api.getState().escortProgress > escortBefore && api.getState().escortTarget !== null,
          `escort ${escortBefore.toFixed(2)}->${api.getState().escortProgress.toFixed(2)}, target ${api.getState().escortTarget}, hp ${api.getState().escortHealth}, contested ${api.getState().escortContested}`,
        );
      }
      if (api.getState().winCondition === 'defend-core') {
        const defendBefore = api.getState().defendProgress;
        check(
          'defend core is visible',
          api.getState().defendVisible === true,
          `visible ${api.getState().defendVisible}, hp ${api.getState().defendHealth}`,
        );
        api.fortifyDefendCore();
        await sleep(900);
        check(
          'defend core progresses while protected',
          api.getState().defendProgress > defendBefore && api.getState().defendTarget !== null && (api.getState().defendHealth ?? 0) > 0,
          `defend ${defendBefore.toFixed(2)}->${api.getState().defendProgress.toFixed(2)}, target ${api.getState().defendTarget}, hp ${api.getState().defendHealth}, contested ${api.getState().defendContested}`,
        );
      }
      if (api.getState().winCondition === 'repair-nodes') {
        const repairBefore = api.getState().repairProgress;
        check(
          'repair nodes are visible',
          api.getState().repairVisible === true,
          `visible ${api.getState().repairVisible}, fixed ${api.getState().repairNodesFixed}`,
        );
        api.repairNode();
        await sleep(900);
        check(
          'repair node progresses while held',
          api.getState().repairProgress > repairBefore && api.getState().repairTarget !== null,
          `repair ${repairBefore.toFixed(2)}->${api.getState().repairProgress.toFixed(2)}, target ${api.getState().repairTarget}, fixed ${api.getState().repairNodesFixed}, contested ${api.getState().repairContested}`,
        );
      }
      if (api.getState().winCondition === 'extract') {
        const extractBefore = api.getState().extractProgress;
        check(
          'extract gate is visible',
          api.getState().extractVisible === true,
          `visible ${api.getState().extractVisible}, target ${api.getState().extractTarget}`,
        );
        api.enterExtractZone();
        await sleep(900);
        check(
          'extract gate progresses while held',
          api.getState().extractProgress > extractBefore && api.getState().extractTarget !== null,
          `extract ${extractBefore.toFixed(2)}->${api.getState().extractProgress.toFixed(2)}, target ${api.getState().extractTarget}, contested ${api.getState().extractContested}`,
        );
      }
      if (api.getState().winCondition === 'unlock-gate') {
        const keysBefore = api.getState().unlockKeys;
        check(
          'unlock access keys and gate are visible',
          api.getState().objectivePickupVisible === true && api.getState().unlockGateVisible === true && api.getState().unlockKeyTarget !== null,
          `pickup ${api.getState().objectivePickupVisible}, gate ${api.getState().unlockGateVisible}, keys ${api.getState().unlockKeys}/${api.getState().unlockKeyTarget}`,
        );
        api.collectUnlockKey();
        await sleep(160);
        check(
          'unlock access key increases key progress',
          api.getState().unlockKeys > keysBefore,
          `keys ${keysBefore}->${api.getState().unlockKeys}, target ${api.getState().unlockKeyTarget}`,
        );
        const unlockBefore = api.getState().unlockProgress;
        api.enterUnlockGate();
        await sleep(900);
        check(
          'unlock gate progresses after keys are collected',
          api.getState().unlockReady === true && api.getState().unlockProgress > unlockBefore && api.getState().unlockTarget !== null,
          `unlock ${unlockBefore.toFixed(2)}->${api.getState().unlockProgress.toFixed(2)}, target ${api.getState().unlockTarget}, ready ${api.getState().unlockReady}, contested ${api.getState().unlockContested}`,
        );
      }
      if (api.getState().winCondition === 'rescue') {
        const rescueBefore = api.getState().rescueProgress;
        check(
          'rescue survivor is visible',
          api.getState().rescueVisible === true,
          `visible ${api.getState().rescueVisible}, phase ${api.getState().rescuePhase}, hp ${api.getState().rescueHealth}`,
        );
        api.rescueSurvivor();
        await sleep(900);
        check(
          'rescue survivor stabilizes while held',
          api.getState().rescueProgress > rescueBefore && api.getState().rescueTarget !== null,
          `rescue ${rescueBefore.toFixed(2)}->${api.getState().rescueProgress.toFixed(2)}, target ${api.getState().rescueTarget}, phase ${api.getState().rescuePhase}, contested ${api.getState().rescueContested}`,
        );
        const rescueExtractBefore = api.getState().rescueExtractProgress;
        api.enterRescueExtraction();
        await sleep(900);
        check(
          'rescue extraction progresses with survivor at gate',
          api.getState().rescueExtractProgress > rescueExtractBefore && api.getState().rescueExtractTarget !== null,
          `extract ${rescueExtractBefore.toFixed(2)}->${api.getState().rescueExtractProgress.toFixed(2)}, target ${api.getState().rescueExtractTarget}, phase ${api.getState().rescuePhase}, contested ${api.getState().rescueContested}`,
        );
      }
      if (api.getState().assetKeys?.boss) {
        api.spawnBoss();
        await sleep(160);
        api.triggerBossTelegraph();
        await sleep(120);
        const bossTelegraph = api.getState().bossTelegraphVisible;
        check('boss pattern telegraph is visible', bossTelegraph === true, `visible ${bossTelegraph}`);
        const bossPacing = api.getState();
        check(
          'boss phase pacing is exposed',
          bossPacing.bossPhase !== null && bossPacing.bossPhase >= 1 && bossPacing.bossWindupSeconds >= 0.5,
          `phase ${bossPacing.bossPhase}, windup ${bossPacing.bossWindupSeconds.toFixed(2)}`,
        );
        check(
          'boss transition rig is exposed',
          bossPacing.bossTransitionFx > 0 && Boolean(bossPacing.bossTransitionState?.includes('boss-telegraph')),
          `fx ${bossPacing.bossTransitionFx}, transition ${bossPacing.bossTransitionState}`,
        );
        check(
          'boss sprite-sheet animation is active',
          bossPacing.spriteSheetAnimatedKeys.includes(bossPacing.assetKeys?.boss ?? '') &&
            bossPacing.spriteSheetAnimationNames.some((name) => name.startsWith('boss-telegraph')),
          `keys ${bossPacing.spriteSheetAnimatedKeys.join(',')}, clips ${bossPacing.spriteSheetAnimationNames.join(',')}, boss ${bossPacing.assetKeys?.boss}, frame ${bossPacing.spriteSheetFrame}`,
        );
      }
      const afterSpawn = api.getState();
      const spriteKeysBound =
        afterSpawn.textureKeys?.player === afterSpawn.assetKeys?.player &&
        afterSpawn.textureKeys?.firstEnemy === afterSpawn.assetKeys?.firstEnemy;
      check(
        'sprite keys are bound from definition',
        spriteKeysBound,
        `player ${afterSpawn.textureKeys?.player}/${afterSpawn.assetKeys?.player}, enemy ${afterSpawn.textureKeys?.firstEnemy}/${afterSpawn.assetKeys?.firstEnemy}`,
      );
      check(
        'floor asset key is bound',
        afterSpawn.textureKeys?.floor === afterSpawn.assetKeys?.floor,
        `floor ${afterSpawn.textureKeys?.floor}/${afterSpawn.assetKeys?.floor}`,
      );
      const sourceBacked =
        afterSpawn.sourceBacked?.player === true &&
        afterSpawn.sourceBacked?.firstEnemy === true &&
        afterSpawn.sourceBacked?.floor === true;
      check(
        'definition carries source-backed assets',
        sourceBacked,
        `player ${afterSpawn.sourceBacked?.player}, enemy ${afterSpawn.sourceBacked?.firstEnemy}, floor ${afterSpawn.sourceBacked?.floor}`,
      );
      const noSourceFallback =
        afterSpawn.fallbackTextures?.player === false &&
        afterSpawn.fallbackTextures?.firstEnemy === false &&
        afterSpawn.fallbackTextures?.floor === false;
      check(
        'source-backed assets loaded without procedural fallback',
        noSourceFallback,
        `player ${afterSpawn.fallbackTextures?.player}, enemy ${afterSpawn.fallbackTextures?.firstEnemy}, floor ${afterSpawn.fallbackTextures?.floor}`,
      );
      const canvasQuality = sampleCanvasQuality();
      check(
        'canvas renders nonblank play scene',
        canvasQuality.pass,
        canvasQuality.detail,
      );
      api.press('attack');
      await sleep(180);
      api.killAllEnemies();
      await sleep(300);
      check('killAllEnemies clears enemies', api.getState().enemiesAlive === 0, `alive ${api.getState().enemiesAlive}`);
      const levelBefore = api.getState().level;
      api.levelUp();
      await sleep(250);
      const choosing = api.getState();
      check(
        'level-up opens upgrade choice',
        choosing.choosingUpgrade === true &&
          choosing.upgradeChoices > 0 &&
          choosing.upgradeChoiceKinds.length === choosing.upgradeChoices,
        `choosing ${choosing.choosingUpgrade}, choices ${choosing.upgradeChoices}, kinds ${choosing.upgradeChoiceKinds.join(',')}`,
      );
      api.chooseUpgrade(0);
      await sleep(250);
      const afterUpgrade = api.getState();
      check(
        'choosing upgrade resumes play',
        afterUpgrade.choosingUpgrade === false && afterUpgrade.level > levelBefore,
        `level ${levelBefore}->${afterUpgrade.level}, choosing ${afterUpgrade.choosingUpgrade}`,
      );
      if (api.getState().weaponAutoFire === false) {
        api.killAllEnemies();
        await sleep(120);
        const contactHp = api.getState().playerHealth;
        api.spawnContactEnemy(0);
        await sleep(700);
        const afterContact = api.getState();
        check(
          'manual-melee contact enemy damages player',
          afterContact.scene === 'play' && afterContact.playerHealth < contactHp,
          `hp ${contactHp}->${afterContact.playerHealth}, scene ${afterContact.scene}`,
        );
        api.killAllEnemies();
        await sleep(120);
        api.spawnContactBoss();
        let bossContactState = api.getState();
        const bossContactDeadline = Date.now() + 7000;
        while (bossContactState.scene === 'play' && Date.now() < bossContactDeadline) {
          await sleep(220);
          bossContactState = api.getState();
        }
        check(
          'manual-melee boss contact can defeat player',
          bossContactState.scene === 'lose',
          `scene ${bossContactState.scene}, hp ${bossContactState.playerHealth}`,
        );
        api.press('restart');
        await sleep(700);
      }
      const hp = api.getState().playerHealth;
      api.damagePlayer(1);
      await sleep(200);
      check('damagePlayer reduces hp', api.getState().playerHealth < hp, `before ${hp}, after ${api.getState().playerHealth}`);
      api.triggerLose();
      await sleep(450);
      check('triggerLose transitions to lose', api.getState().scene === 'lose', `got ${api.getState().scene}`);
      api.press('restart');
      await sleep(700);
      check('restart transitions to play', api.getState().scene === 'play' && api.getState().playerHealth > 0, `got ${api.getState().scene}`);
      api.triggerWin();
      await sleep(450);
      check('triggerWin transitions to win', api.getState().scene === 'win', `got ${api.getState().scene}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    } finally {
      publish();
    }
  })();
}

function waitForGameTest(timeoutMs = 10_000): Promise<ForgeTestApi> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window.__GAME_TEST__) {
        resolve(window.__GAME_TEST__);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('window.__GAME_TEST__ not ready within timeout'));
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

function sampleCanvasQuality(): { pass: boolean; detail: string } {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) return { pass: false, detail: 'no canvas' };
  const rect = canvas.getBoundingClientRect();
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0 || rect.width < 160 || rect.height < 90) {
    return { pass: false, detail: `bad size ${width}x${height} displayed ${Math.round(rect.width)}x${Math.round(rect.height)}` };
  }

  try {
    const quality = sampleCanvasPixels(canvas, width, height);
    const pass =
      quality.samples >= 128 &&
      quality.nonBlankRatio > 0.12 &&
      quality.uniqueBuckets >= 5 &&
      quality.lumaRange >= 8;
    return {
      pass,
      detail:
        `${width}x${height}, displayed ${Math.round(rect.width)}x${Math.round(rect.height)}, ` +
        `nonblank ${quality.nonBlankRatio.toFixed(2)}, colors ${quality.uniqueBuckets}, luma ${quality.lumaRange}`,
    };
  } catch (error) {
    return { pass: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function sampleCanvasPixels(canvas: HTMLCanvasElement, width: number, height: number) {
  const pixels = readCanvasPixels(canvas, width, height);
  const stride = Math.max(4, Math.floor((width * height) / 2400) * 4);
  let samples = 0;
  let nonBlank = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const buckets = new Set<string>();
  const sampledPixels: { r: number; g: number; b: number; a: number }[] = [];

  for (let i = 0; i < pixels.length; i += stride) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    samples++;
    if (a > 8 && r + g + b > 12) nonBlank++;
    const luma = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}:${a >> 6}`);
    sampledPixels.push({ r, g, b, a });
  }

  return {
    samples,
    nonBlankRatio: samples > 0 ? nonBlank / samples : 0,
    uniqueBuckets: buckets.size,
    lumaRange: maxLuma - minLuma,
    sampledPixels,
  };
}

function readCanvasPixels(canvas: HTMLCanvasElement, width: number, height: number): Uint8Array | Uint8ClampedArray {
  const gl =
    canvas.getContext('webgl2') ??
    canvas.getContext('webgl') ??
    canvas.getContext('experimental-webgl');
  let pixels: Uint8Array | Uint8ClampedArray;

  if (gl) {
    const webgl = gl as WebGLRenderingContext | WebGL2RenderingContext;
    pixels = new Uint8Array(width * height * 4);
    webgl.readPixels(0, 0, width, height, webgl.RGBA, webgl.UNSIGNED_BYTE, pixels);
  } else {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas has no readable 2D/WebGL context');
    pixels = ctx.getImageData(0, 0, width, height).data;
  }

  return pixels;
}

function dedupeTextureSpecs(specs: TextureSpec[]): TextureSpec[] {
  const seen = new Set<string>();
  const deduped: TextureSpec[] = [];
  for (const spec of specs) {
    if (seen.has(spec.key)) continue;
    seen.add(spec.key);
    deduped.push(spec);
  }
  return deduped;
}

function stableHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRange(seed: number, salt: number, maxExclusive: number) {
  const mixed = Math.imul(seed ^ Math.imul(salt + 1, 374761393), 668265263) >>> 0;
  return mixed % Math.max(1, maxExclusive);
}

function gameThemeText(def: GameDefinition) {
  return [
    def.title,
    def.theme,
    def.arena.name,
    def.runtimeTemplate,
    def.winCondition,
    def.boss?.name,
    def.boss?.patterns.join(' '),
    ...def.enemies.map((enemy) => `${enemy.name} ${enemy.role}`),
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasTheme(def: GameDefinition, pattern: RegExp) {
  return pattern.test(gameThemeText(def));
}

function hasLiteralBackdrop(def: GameDefinition) {
  return def.assets.some((asset) => {
    if (asset.kind !== 'background' || !asset.src) return false;
    if (asset.src.startsWith('runtime:')) return true;
    if (/^https?:\/\//.test(asset.src)) return true;
    return /^data:image\/(?:png|jpe?g|webp);/i.test(asset.src);
  });
}

function usesQuietLiteralBackdrop(def: GameDefinition) {
  return hasLiteralBackdrop(def) && isQuietLiteralBackdropTemplate(def);
}

function isQuietLiteralBackdropTemplate(def: GameDefinition) {
  const mood = arenaMood(def);
  return def.runtimeTemplate === 'flight-shooter'
    || def.runtimeTemplate === 'platformer'
    || def.runtimeTemplate === 'puzzle-room'
    || (def.winCondition === 'defeat-boss' && (mood === 'coast' || mood === 'haunted' || mood === 'bakery' || mood === 'seismic'))
    || ((def.winCondition === 'survive' || def.winCondition === 'escort') && mood === 'coast');
}

function arenaMood(def: GameDefinition): ArenaMood {
  const text = gameThemeText(def);
  if (def.runtimeTemplate === 'flight-shooter') return 'sky';
  if (def.runtimeTemplate === 'platformer') return 'platform';
  if (def.runtimeTemplate === 'decision-room' || def.runtimeTemplate === 'agent-dashboard' || def.runtimeTemplate === 'puzzle-room') return 'security';
  if (/(bakery|pizza|kitchen|chef|food|pastr|cake|sugar|bread|oven|pantry|baker|cozy)/.test(text)) return 'bakery';
  if (/(ghost|haunt|grave|vampire|witch|crypt|spirit|bone|spooky|horror)/.test(text)) return 'haunted';
  if (/(shockwave|shock|seismic|quake|earthquake|tremor|sonic|stomp|slam|basalt|fault)/.test(text)) return 'seismic';
  if (/(laser-grid|grid|lattice|scanner|security|crossfire|tripwire|firewall|lockdown)/.test(text)) return 'security';
  if (/(^|\s)(coast(?:al)?|tide|ocean|sea|waves?|harbor|beach|forest|meadow|reef|shore)(\s|$)/.test(text)) return 'coast';
  if (/(space|alien|star|moon|planet|orbital|comet|void|cosmic|neon|cyber|drone)/.test(text)) return 'space';
  if (/(air|airplane|plane|jet|flight|sky|cloud|storm|zeppelin|dogfight|pilot|fighter)/.test(text)) return 'sky';
  if (/(platform|platformer|jump|jumper|ledge|castle|cave|ruin|temple|sideview|sidescroller)/.test(text)) return 'platform';
  return 'neutral';
}

function upgradeDescription(upgrade: Upgrade) {
  const amount = Math.abs(upgrade.amount);
  if (upgrade.kind === 'damage') return `+${amount} projectile damage. Melee scales too.`;
  if (upgrade.kind === 'cooldown') return `Fire cooldown -${amount}ms.`;
  if (upgrade.kind === 'speed') return `Move speed +${amount}.`;
  if (upgrade.kind === 'projectiles') return `Projectiles +${amount}.`;
  if (upgrade.kind === 'maxHealth') return `Max HP +${amount}.`;
  if (upgrade.kind === 'magnet') return `XP pickup reach +${amount}.`;
  if (upgrade.kind === 'healing') return `Heal ${amount} HP now.`;
  return `Power +${amount}.`;
}

function shouldShowTouchControls() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const override = params.get('touchcontrols');
  if (override === '1' || override === 'true') return true;
  if (override === '0' || override === 'false') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarsePointer || window.innerWidth <= 700 || window.innerHeight <= 520;
}

function bindTouchButton(button: Phaser.GameObjects.Arc, setDown: (down: boolean) => void) {
  button.on('pointerdown', () => setDown(true));
  button.on('pointerup', () => setDown(false));
  button.on('pointerout', () => setDown(false));
  button.on('pointerupoutside', () => setDown(false));
}

function normalize(dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function facingVector(facing: Facing) {
  if (facing === 'left') return { x: -1, y: 0 };
  if (facing === 'up') return { x: 0, y: -1 };
  if (facing === 'down') return { x: 0, y: 1 };
  return { x: 1, y: 0 };
}

function facingAngle(facing: Facing) {
  const vec = facingVector(facing);
  return Math.atan2(vec.y, vec.x);
}

function truncateText(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function bossPatternLabel(pattern: BossPattern) {
  const labels: Record<BossPattern, string> = {
    'radial-burst': 'BURST',
    'spiral-shot': 'SPIRAL',
    charge: 'CHARGE',
    summon: 'SUMMON',
    beam: 'BEAM',
    minefield: 'MINES',
    vortex: 'VORTEX',
    shockwave: 'SHOCK',
    'laser-grid': 'GRID',
  };
  return labels[pattern] ?? pattern.toUpperCase();
}

export function createForgeGame(parent: HTMLElement, definition: GameDefinition): ForgeHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: definition.arena.width,
    height: definition.arena.height,
    backgroundColor: definition.palette.background,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [TitleScene, ForgeScene, new EndScene('win'), new EndScene('lose')],
  });
  installGameTestHooks(game, definition);
  game.scene.start('title', { def: definition });
  runSelfTestIfRequested();
  return {
    destroy: () => {
      if (window.__GAME_TEST__) delete window.__GAME_TEST__;
      game.destroy(true);
    },
  };
}
