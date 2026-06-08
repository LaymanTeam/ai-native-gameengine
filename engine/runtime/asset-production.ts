import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AssetsDeps, ProducedAsset } from '../ai/pipelines/assets';
import type { EmitEvent } from '../ai/events';
import { StyleBibleSchema, styleBibleToPromptPreamble, type StyleBible } from '../tools/visualizers/visual-direction';
import {
  attachReviewedAssetSources,
  buildAssetPlanFromGameDefinition,
  type RuntimeAssetPlan,
  type RuntimeAssetPlanImage,
} from './asset-plan';
import type { GameDefinition } from './game-definition';

const ASSET_PRODUCTION_LOG_PREFIX = '[engine/runtime/asset-production]';
const STYLE_BIBLE_FILENAME = 'style-bible.json';
const DEFAULT_RETENTION_KEEP_LATEST = 12;
const DEFAULT_RETENTION_MAX_AGE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function slugifyBatchPart(raw: string): string {
  const slug = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'forge-game';
}

export interface RuntimeAssetProductionDeps extends AssetsDeps {}

export interface RuntimeAssetReviewItem {
  variable: string;
  note: string;
  sourcePath: string;
  reviewPath: string;
  reviewUrl: string;
}

export interface RuntimeAssetBatchManifest {
  batchId: string;
  createdAt: string;
  ok: boolean;
  requestedImages: number;
  approvedImages: number;
  publicRuntimePrefix: string;
  styleBible: StyleBible;
  assetPlanImages: RuntimeAssetPlanImage[];
  produced: ProducedAsset[];
  failures: string[];
  reviewItems: RuntimeAssetReviewItem[];
}

export interface AcceptRuntimeAssetReviewOptions {
  batchId: string;
  variable: string;
  publicRuntimeDir?: string;
}

export interface AcceptedRuntimeAssetReview {
  ok: boolean;
  batchId: string;
  variable: string;
  runtimeRef: string;
  batchManifestUrl: string;
  approvedImages: number;
  requestedImages: number;
  failures: string[];
  reviewItems: RuntimeAssetReviewItem[];
}

export interface RetryRuntimeAssetReviewOptions {
  batchId: string;
  variable: string;
  feedback?: string;
  workspaceDir?: string;
  publicRuntimeDir?: string;
  emit?: EmitEvent;
  deps?: RuntimeAssetProductionDeps;
}

export interface RetriedRuntimeAssetReview {
  ok: boolean;
  batchId: string;
  variable: string;
  runtimeRef: string | null;
  batchManifestUrl: string;
  approvedImages: number;
  requestedImages: number;
  failures: string[];
  reviewItems: RuntimeAssetReviewItem[];
}

export interface RuntimeAssetRetentionOptions {
  keepLatest?: number;
  maxAgeDays?: number;
  dryRun?: boolean;
  now?: Date;
}

export interface RuntimeAssetPrunedBatch {
  batchId: string;
  createdAt: string;
  publicPath: string;
  reason: 'age' | 'excess';
}

export interface RuntimeAssetPruneResult {
  ok: boolean;
  totalBatches: number;
  keptBatches: number;
  keepLatest: number;
  maxAgeDays: number | null;
  dryRun: boolean;
  prunedBatches: RuntimeAssetPrunedBatch[];
  skippedBatches: string[];
}

export interface ProduceRuntimeAssetsOptions {
  definition: GameDefinition;
  prompt: string;
  plan?: RuntimeAssetPlan;
  batchId?: string;
  workspaceDir?: string;
  publicRuntimeDir?: string;
  emit?: EmitEvent;
  deps?: RuntimeAssetProductionDeps;
  retention?: RuntimeAssetRetentionOptions | false;
}

export interface RuntimeAssetProductionResult {
  ok: boolean;
  definition: GameDefinition;
  assetPlan: RuntimeAssetPlan;
  batchId: string;
  publicRuntimePrefix: string;
  produced: ProducedAsset[];
  reviewItems: RuntimeAssetReviewItem[];
  batchManifestUrl: string;
  requestedImages: number;
  approvedImages: number;
  failures: string[];
}

function uniqueBatchId(definition: GameDefinition): string {
  const title = slugifyBatchPart(definition.title).slice(0, 48) || 'forge-game';
  return `${title}-${Date.now().toString(36)}`;
}

function cleanBatchId(value: string | undefined, definition: GameDefinition): string {
  const candidate = value ? slugifyBatchPart(value).slice(0, 80) : uniqueBatchId(definition);
  return candidate || uniqueBatchId(definition);
}

function cleanExistingBatchId(value: string): string {
  const candidate = slugifyBatchPart(value).slice(0, 80);
  if (!candidate || candidate !== value) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} invalid batch id`);
  }
  return candidate;
}

function assertVariable(value: string): string {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} invalid asset variable`);
  }
  return value;
}

function resolveInside(root: string, relative: string): string {
  const abs = path.resolve(/* turbopackIgnore: true */ root, relative);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} path escapes asset workspace: ${relative}`);
  }
  return abs;
}

function envPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function defaultRetentionOptions(): RuntimeAssetRetentionOptions | false {
  const disabled = process.env['FORGE_ASSET_RETENTION_DISABLED']?.toLowerCase();
  if (disabled === '1' || disabled === 'true' || disabled === 'yes') return false;
  return {
    keepLatest: envPositiveInteger('FORGE_ASSET_RETENTION_KEEP_LATEST', DEFAULT_RETENTION_KEEP_LATEST),
    maxAgeDays: envPositiveInteger('FORGE_ASSET_RETENTION_MAX_AGE_DAYS', DEFAULT_RETENTION_MAX_AGE_DAYS),
  };
}

function normalizeRetentionOptions(options: RuntimeAssetRetentionOptions | undefined): {
  keepLatest: number;
  maxAgeDays: number | null;
  dryRun: boolean;
  now: Date;
} {
  return {
    keepLatest: normalizedPositiveInteger(options?.keepLatest, DEFAULT_RETENTION_KEEP_LATEST),
    maxAgeDays:
      options?.maxAgeDays === undefined
        ? DEFAULT_RETENTION_MAX_AGE_DAYS
        : normalizedPositiveInteger(options.maxAgeDays, DEFAULT_RETENTION_MAX_AGE_DAYS),
    dryRun: options?.dryRun === true,
    now: options?.now ?? new Date(),
  };
}

function uniqueMoodWords(definition: GameDefinition, prompt: string): string[] {
  const words = `${definition.theme} ${definition.genre} ${prompt}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !['with', 'game', 'play', 'from'].includes(word));
  const unique = Array.from(new Set(words));
  return unique.slice(0, 5).length > 0 ? unique.slice(0, 5) : ['arcade', 'readable'];
}

function runtimeArtDirection(definition: GameDefinition): {
  summaryPerspective: string;
  artStyle: string;
  perspective: StyleBible['perspective'];
  tileRule: string;
} {
  if (definition.runtimeTemplate === 'flight-shooter') {
    return {
      summaryPerspective: 'side-view flight shooter',
      artStyle: 'polished side-scroller arcade flight sprites with clean silhouettes',
      perspective: 'side-scroller',
      tileRule: 'Background and tile assets should suit horizontal side-view flight scrolling and avoid unique landmarks, borders, or UI marks.',
    };
  }
  if (definition.runtimeTemplate === 'platformer') {
    return {
      summaryPerspective: 'side-view platformer',
      artStyle: 'polished side-scroller platformer sprites with clean silhouettes',
      perspective: 'side-scroller',
      tileRule: 'Background and tile assets should support side-view ledges/platforms and avoid unique center landmarks, borders, vignettes, or UI marks.',
    };
  }
  if (definition.runtimeTemplate === 'puzzle-room') {
    return {
      summaryPerspective: 'top-down grid puzzle',
      artStyle: 'polished top-down puzzle-room sprites with clean silhouettes and readable tile symbols',
      perspective: 'top-down',
      tileRule: 'Floor tiles should support a readable top-down puzzle grid and avoid unique center landmarks, borders, vignettes, wall perspective, or UI marks.',
    };
  }
  if (definition.runtimeTemplate === 'agent-dashboard') {
    return {
      summaryPerspective: 'agent operations dashboard',
      artStyle: 'polished operations-cockpit sprites and panel materials with clean silhouettes',
      perspective: 'three-quarter',
      tileRule: 'Panel textures should support a dense operations dashboard, stay low-contrast behind text/cards, and avoid baked labels, logos, borders, or unique center landmarks.',
    };
  }
  if (definition.runtimeTemplate === 'decision-room') {
    return {
      summaryPerspective: 'decision boardroom',
      artStyle: 'polished boardroom decision-app sprites and evidence panel materials with clean silhouettes',
      perspective: 'three-quarter',
      tileRule: 'Panel textures should support a boardroom decision app, stay low-contrast behind text/cards, and avoid baked labels, logos, borders, or unique center landmarks.',
    };
  }
  return {
    summaryPerspective: 'top-down action',
    artStyle: 'polished top-down arcade game sprites with clean silhouettes',
    perspective: 'top-down',
    tileRule: 'Floor tiles should avoid unique center landmarks, borders, vignettes, or perspective walls because they repeat under the arena.',
  };
}

export function buildForgeStyleBible(definition: GameDefinition, prompt: string): StyleBible {
  const art = runtimeArtDirection(definition);
  return StyleBibleSchema.parse({
    title: `${definition.title} Runtime Style`,
    summary: `${definition.theme} ${art.summaryPerspective} art for a readable Phaser runtime game.`,
    artStyle: art.artStyle,
    palette: Array.from(new Set(Object.values(definition.palette))),
    spriteResolution: Math.max(16, Math.min(128, Math.round(definition.player.radius * 2))),
    perspective: art.perspective,
    outline: {
      enabled: true,
      color: definition.palette.background,
      notes: 'Use a selective outer outline so actors remain readable over the arena floor.',
    },
    shading: 'soft cel shading with restrained highlights',
    mood: uniqueMoodWords(definition, prompt),
    rules: [
      'Sprites must read clearly at small sizes during fast action.',
      'Keep actor sprites on transparent backgrounds.',
      'Do not bake actor shadows into transparent sprites; the Phaser runtime adds shadows, flashes, and motion effects.',
      'For sprite sheets, preserve exact equal-width cells, a single horizontal row, consistent actor scale/facing/center point, and no gutters, grid lines, labels, or alternate characters.',
      'Background and tile assets may be seamless, but must not obscure combat silhouettes.',
      art.tileRule,
      'Avoid text, UI chrome, watermarks, logos, or decorative borders inside asset images.',
    ],
  });
}

async function seedPipelineWorkspace(gameRoot: string, styleBible: StyleBible): Promise<void> {
  await Promise.all([
    fs.mkdir(path.join(gameRoot, 'config'), { recursive: true }),
    fs.mkdir(path.join(gameRoot, 'reports'), { recursive: true }),
    fs.mkdir(path.join(gameRoot, 'assets'), { recursive: true }),
  ]);
  await fs.writeFile(
    path.join(gameRoot, 'config', STYLE_BIBLE_FILENAME),
    `${JSON.stringify(styleBible, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(gameRoot, 'reports', 'style.md'),
    `# Style Bible - ${styleBible.title}\n\n${styleBibleToPromptPreamble(styleBible)}\n`,
    'utf8',
  );
}

function publishedRelativePath(producedPath: string): string {
  const normalized = producedPath.replace(/^assets\//, '').replace(/^\/+/, '');
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0 || parts.includes('..')) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} invalid produced path: ${producedPath}`);
  }
  return parts.join('/');
}

async function publishProducedAssets(args: {
  gameRoot: string;
  publicRuntimeDir: string;
  batchId: string;
  produced: readonly ProducedAsset[];
}): Promise<RuntimeAssetReviewItem[]> {
  const publicBatchRoot = path.join(args.publicRuntimeDir, 'forge', args.batchId);
  const reviewItems: RuntimeAssetReviewItem[] = [];
  await fs.mkdir(publicBatchRoot, { recursive: true });
  for (const asset of args.produced) {
    const runtimeRel = publishedRelativePath(asset.path);
    const source = resolveInside(args.gameRoot, asset.path);
    const targetRel = asset.approved ? runtimeRel : path.posix.join('review', runtimeRel);
    const target = path.join(publicBatchRoot, ...targetRel.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    if (!asset.approved) {
      reviewItems.push({
        variable: asset.variable,
        note: asset.note,
        sourcePath: asset.path,
        reviewPath: targetRel,
        reviewUrl: `/runtime/forge/${args.batchId}/${targetRel}`,
      });
    }
  }
  return reviewItems;
}

async function writeBatchManifest(args: {
  publicRuntimeDir: string;
  batchId: string;
  manifest: RuntimeAssetBatchManifest;
}): Promise<string> {
  const publicBatchRoot = path.join(args.publicRuntimeDir, 'forge', args.batchId);
  await fs.mkdir(publicBatchRoot, { recursive: true });
  await fs.writeFile(
    path.join(publicBatchRoot, 'asset-production.json'),
    `${JSON.stringify(args.manifest, null, 2)}\n`,
    'utf8',
  );
  return `/runtime/forge/${args.batchId}/asset-production.json`;
}

async function readBatchManifest(args: {
  publicRuntimeDir: string;
  batchId: string;
}): Promise<RuntimeAssetBatchManifest> {
  const manifestPath = path.join(args.publicRuntimeDir, 'forge', args.batchId, 'asset-production.json');
  const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as RuntimeAssetBatchManifest;
  if (raw.batchId !== args.batchId || !Array.isArray(raw.produced) || !Array.isArray(raw.reviewItems)) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} invalid batch manifest`);
  }
  return raw;
}

export async function pruneRuntimeAssetBatches(
  options: RuntimeAssetRetentionOptions & { publicRuntimeDir?: string } = {},
): Promise<RuntimeAssetPruneResult> {
  const publicRuntimeDir = options.publicRuntimeDir ?? path.resolve(process.cwd(), 'public', 'runtime');
  const retention = normalizeRetentionOptions(options);
  const forgeRoot = path.join(publicRuntimeDir, 'forge');

  let entries: { isDirectory(): boolean; name: string }[];
  try {
    entries = await fs.readdir(forgeRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        ok: true,
        totalBatches: 0,
        keptBatches: 0,
        keepLatest: retention.keepLatest,
        maxAgeDays: retention.maxAgeDays,
        dryRun: retention.dryRun,
        prunedBatches: [],
        skippedBatches: [],
      };
    }
    throw error;
  }

  const skippedBatches: string[] = [];
  const batches: { batchId: string; createdAt: string; createdTime: number; batchRoot: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const batchId = entry.name;
    const batchRoot = path.join(forgeRoot, batchId);
    try {
      cleanExistingBatchId(batchId);
      const manifest = await readBatchManifest({ publicRuntimeDir, batchId });
      const createdTime = Date.parse(manifest.createdAt);
      if (!Number.isFinite(createdTime)) throw new Error('invalid createdAt');
      batches.push({ batchId, createdAt: manifest.createdAt, createdTime, batchRoot });
    } catch (error) {
      skippedBatches.push(`${batchId}: ${error instanceof Error ? error.message : 'invalid batch'}`);
    }
  }

  batches.sort((a, b) => b.createdTime - a.createdTime || b.batchId.localeCompare(a.batchId));

  const cutoffTime = retention.maxAgeDays === null ? null : retention.now.getTime() - retention.maxAgeDays * DAY_MS;
  const prunedBatches: RuntimeAssetPrunedBatch[] = [];
  for (const [index, batch] of batches.entries()) {
    if (index < retention.keepLatest) continue;
    const reason = cutoffTime !== null && batch.createdTime < cutoffTime ? 'age' : 'excess';
    prunedBatches.push({
      batchId: batch.batchId,
      createdAt: batch.createdAt,
      publicPath: `/runtime/forge/${batch.batchId}`,
      reason,
    });
    if (!retention.dryRun) {
      await fs.rm(batch.batchRoot, { recursive: true, force: true });
    }
  }

  return {
    ok: skippedBatches.length === 0,
    totalBatches: batches.length,
    keptBatches: batches.length - prunedBatches.length,
    keepLatest: retention.keepLatest,
    maxAgeDays: retention.maxAgeDays,
    dryRun: retention.dryRun,
    prunedBatches,
    skippedBatches,
  };
}

function recomputeManifestStatus(manifest: RuntimeAssetBatchManifest): RuntimeAssetBatchManifest {
  const approvedImages = manifest.produced.filter((asset) => asset.approved).length;
  const reviewVariables = new Set(manifest.reviewItems.map((item) => item.variable));
  const failures = manifest.failures.filter((failure) => {
    const variable = failure.split(':', 1)[0] ?? '';
    return variable.length === 0 || reviewVariables.has(variable) || !manifest.produced.some((asset) => asset.variable === variable);
  });
  return {
    ...manifest,
    ok: failures.length === 0 && approvedImages === manifest.requestedImages,
    approvedImages,
    failures,
  };
}

function withoutVariableFailures(failures: readonly string[], variable: string): string[] {
  return failures.filter((failure) => (failure.split(':', 1)[0] ?? '') !== variable);
}

function replaceProduced(produced: readonly ProducedAsset[], next: ProducedAsset): ProducedAsset[] {
  const replaced = produced.map((asset) => (asset.variable === next.variable ? next : asset));
  return produced.some((asset) => asset.variable === next.variable) ? replaced : [...replaced, next];
}

function replaceReviewItem(
  reviewItems: readonly RuntimeAssetReviewItem[],
  next: RuntimeAssetReviewItem | null,
  variable: string,
): RuntimeAssetReviewItem[] {
  const kept = reviewItems.filter((item) => item.variable !== variable);
  return next ? [...kept, next] : kept;
}

export async function produceRuntimeAssetsForDefinition(
  options: ProduceRuntimeAssetsOptions,
): Promise<RuntimeAssetProductionResult> {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} prompt must be non-empty`);

  const assetPlan = options.plan ?? buildAssetPlanFromGameDefinition(options.definition);
  const batchId = cleanBatchId(options.batchId, options.definition);
  const workspaceDir = options.workspaceDir ?? path.join(os.tmpdir(), 'hackathon-multimodal-forge-assets');
  const publicRuntimeDir = options.publicRuntimeDir ?? path.resolve(process.cwd(), 'public', 'runtime');
  const gameRoot = path.join(workspaceDir, batchId);
  const emit = options.emit ?? (() => undefined);
  const publicRuntimePrefix = `runtime:forge/${batchId}/`;
  const styleBible = buildForgeStyleBible(options.definition, prompt);

  console.log(
    `${ASSET_PRODUCTION_LOG_PREFIX} start batch=${batchId} images=${assetPlan.images.length} publicRuntime=${publicRuntimeDir}`,
  );

  await fs.rm(gameRoot, { recursive: true, force: true });
  await seedPipelineWorkspace(gameRoot, styleBible);

  const { runAssetsPipeline } = await import('../ai/pipelines/assets');
  const result = await runAssetsPipeline(
    { game: batchId, gameRoot, plan: assetPlan, emit },
    options.deps,
  );

  const reviewedFailures = result.produced
    .filter((asset) => !asset.approved)
    .map((asset) => `${asset.variable}: ${asset.note}`);
  const approvedImages = result.produced.filter((asset) => asset.approved).length;
  const failures = [...result.failures, ...reviewedFailures];
  const definition = attachReviewedAssetSources(options.definition, assetPlan, result.produced, {
    runtimePrefix: publicRuntimePrefix,
  });
  const ok = result.ok && failures.length === 0 && approvedImages === assetPlan.images.length;
  const reviewItems = await publishProducedAssets({ gameRoot, publicRuntimeDir, batchId, produced: result.produced });
  const batchManifest: RuntimeAssetBatchManifest = {
    batchId,
    createdAt: new Date().toISOString(),
    ok,
    requestedImages: assetPlan.images.length,
    approvedImages,
    publicRuntimePrefix,
    styleBible,
    assetPlanImages: assetPlan.images,
    produced: result.produced,
    failures,
    reviewItems,
  };
  const batchManifestUrl = await writeBatchManifest({ publicRuntimeDir, batchId, manifest: batchManifest });
  const retention = options.retention === undefined ? defaultRetentionOptions() : options.retention;
  if (retention !== false) {
    try {
      const pruned = await pruneRuntimeAssetBatches({ ...retention, publicRuntimeDir });
      if (pruned.prunedBatches.length > 0 || pruned.skippedBatches.length > 0) {
        console.log(
          `${ASSET_PRODUCTION_LOG_PREFIX} retention kept=${pruned.keptBatches}/${pruned.totalBatches} pruned=${pruned.prunedBatches.length} skipped=${pruned.skippedBatches.length}`,
        );
      }
    } catch (error) {
      console.warn(
        `${ASSET_PRODUCTION_LOG_PREFIX} retention skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `${ASSET_PRODUCTION_LOG_PREFIX} done batch=${batchId} ok=${ok} approved=${approvedImages}/${assetPlan.images.length}`,
  );

  return {
    ok,
    definition,
    assetPlan,
    batchId,
    publicRuntimePrefix,
    produced: result.produced,
    reviewItems,
    batchManifestUrl,
    requestedImages: assetPlan.images.length,
    approvedImages,
    failures,
  };
}

export async function acceptRuntimeAssetReview(
  options: AcceptRuntimeAssetReviewOptions,
): Promise<AcceptedRuntimeAssetReview> {
  const batchId = cleanExistingBatchId(options.batchId);
  const variable = assertVariable(options.variable);
  const publicRuntimeDir = options.publicRuntimeDir ?? path.resolve(process.cwd(), 'public', 'runtime');
  const publicBatchRoot = path.join(publicRuntimeDir, 'forge', batchId);
  const manifest = await readBatchManifest({ publicRuntimeDir, batchId });
  const reviewItem = manifest.reviewItems.find((item) => item.variable === variable);
  const produced = manifest.produced.find((asset) => asset.variable === variable);
  if (!reviewItem || !produced) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} review item not found`);
  }

  const runtimeRel = publishedRelativePath(produced.path);
  const reviewSource = path.join(publicBatchRoot, ...reviewItem.reviewPath.split('/'));
  const approvedTarget = path.join(publicBatchRoot, ...runtimeRel.split('/'));
  await fs.mkdir(path.dirname(approvedTarget), { recursive: true });
  await fs.copyFile(reviewSource, approvedTarget);

  const updated: RuntimeAssetBatchManifest = recomputeManifestStatus({
    ...manifest,
    produced: manifest.produced.map((asset) =>
      asset.variable === variable
        ? { ...asset, approved: true, note: `human accepted: ${asset.note}` }
        : asset,
    ),
    reviewItems: manifest.reviewItems.filter((item) => item.variable !== variable),
  });
  const batchManifestUrl = await writeBatchManifest({ publicRuntimeDir, batchId, manifest: updated });
  const runtimeRef = `${updated.publicRuntimePrefix}${runtimeRel}`;

  console.log(`${ASSET_PRODUCTION_LOG_PREFIX} accepted batch=${batchId} variable=${variable} ref=${runtimeRef}`);

  return {
    ok: updated.ok,
    batchId,
    variable,
    runtimeRef,
    batchManifestUrl,
    approvedImages: updated.approvedImages,
    requestedImages: updated.requestedImages,
    failures: updated.failures,
    reviewItems: updated.reviewItems,
  };
}

export async function retryRuntimeAssetReview(
  options: RetryRuntimeAssetReviewOptions,
): Promise<RetriedRuntimeAssetReview> {
  const batchId = cleanExistingBatchId(options.batchId);
  const variable = assertVariable(options.variable);
  const publicRuntimeDir = options.publicRuntimeDir ?? path.resolve(process.cwd(), 'public', 'runtime');
  if (!options.deps?.generate && !process.env['GOOGLE_API_KEY']) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} retry requires GOOGLE_API_KEY`);
  }

  const manifest = await readBatchManifest({ publicRuntimeDir, batchId });
  const existingReviewItem = manifest.reviewItems.find((item) => item.variable === variable);
  const imagePlan = manifest.assetPlanImages?.find((image) => image.variable === variable);
  if (!existingReviewItem || !imagePlan || !manifest.styleBible) {
    throw new Error(`${ASSET_PRODUCTION_LOG_PREFIX} review item not retryable`);
  }

  const feedback = options.feedback?.trim() || existingReviewItem.note;
  const retryPlan: RuntimeAssetPlan = {
    images: [
      {
        ...imagePlan,
        prompt: `${imagePlan.prompt} Retry this asset using review feedback: ${feedback}`,
      },
    ],
    sfx: [],
    music: [],
    fonts: [],
  };
  const workspaceDir = options.workspaceDir ?? path.join(os.tmpdir(), 'hackathon-multimodal-forge-assets-retry');
  const gameRoot = path.join(workspaceDir, `${batchId}-${variable}-${Date.now().toString(36)}`);
  const emit = options.emit ?? (() => undefined);

  await fs.rm(gameRoot, { recursive: true, force: true });
  await seedPipelineWorkspace(gameRoot, manifest.styleBible);
  const { runAssetsPipeline } = await import('../ai/pipelines/assets');
  const result = await runAssetsPipeline({ game: batchId, gameRoot, plan: retryPlan, emit }, options.deps);
  const produced = result.produced.find((asset) => asset.variable === variable);

  let updatedManifest: RuntimeAssetBatchManifest;
  let runtimeRef: string | null = null;
  if (produced) {
    const newReviewItems = await publishProducedAssets({ gameRoot, publicRuntimeDir, batchId, produced: [produced] });
    const nextReviewItem = produced.approved ? null : newReviewItems[0] ?? existingReviewItem;
    runtimeRef = produced.approved ? `${manifest.publicRuntimePrefix}${publishedRelativePath(produced.path)}` : null;
    updatedManifest = recomputeManifestStatus({
      ...manifest,
      produced: replaceProduced(manifest.produced, produced),
      reviewItems: replaceReviewItem(manifest.reviewItems, nextReviewItem, variable),
      failures: [
        ...withoutVariableFailures(manifest.failures, variable),
        ...result.failures,
        ...(produced.approved ? [] : [`${variable}: ${produced.note}`]),
      ],
    });
  } else {
    updatedManifest = recomputeManifestStatus({
      ...manifest,
      failures: [
        ...withoutVariableFailures(manifest.failures, variable),
        ...result.failures,
      ],
    });
  }

  const batchManifestUrl = await writeBatchManifest({ publicRuntimeDir, batchId, manifest: updatedManifest });
  console.log(
    `${ASSET_PRODUCTION_LOG_PREFIX} retried batch=${batchId} variable=${variable} approved=${runtimeRef !== null}`,
  );
  return {
    ok: updatedManifest.ok,
    batchId,
    variable,
    runtimeRef,
    batchManifestUrl,
    approvedImages: updatedManifest.approvedImages,
    requestedImages: updatedManifest.requestedImages,
    failures: updatedManifest.failures,
    reviewItems: updatedManifest.reviewItems,
  };
}
