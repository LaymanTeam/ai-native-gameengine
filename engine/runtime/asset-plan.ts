import type { ProducedAsset } from '../ai/pipelines/assets';
import type { Asset, GameDefinition } from './game-definition';

export interface RuntimeAssetPlanImage {
  variable: string;
  prompt: string;
  fileName: string;
  category: 'sprites' | 'background' | 'images' | 'scenes';
}

export interface RuntimeAssetPlan {
  images: RuntimeAssetPlanImage[];
  sfx: string[];
  music: string[];
  fonts: { family: string; weights: number[] }[];
}

export interface ReviewedAssetSourceOptions {
  /** Prefix for public runtime assets. Default maps assets/sprites/hero.png -> runtime:sprites/hero.png. */
  runtimePrefix?: string;
}

function camelAssetKey(key: string): string {
  const parts = key.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const first = parts.shift() ?? 'asset';
  const rest = parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`);
  const candidate = `${first}${rest.join('')}`.replace(/^[^A-Za-z_$]+/, '');
  return /^[A-Za-z_$]/.test(candidate) ? candidate : `asset${candidate}`;
}

function assetVariable(asset: Asset): string {
  const base = camelAssetKey(asset.key);
  if (asset.kind === 'tile' || asset.kind === 'background') return `${base}Background`;
  if (asset.kind === 'fx') return `${base}Fx`;
  if (asset.kind === 'icon') return `${base}Icon`;
  return `${base}Sprite`;
}

function assetCategory(asset: Asset): RuntimeAssetPlanImage['category'] {
  if (asset.kind === 'tile' || asset.kind === 'background') return 'background';
  return 'sprites';
}

function assetFileName(asset: Asset): string {
  return `${asset.key.replace(/[^a-z0-9-]+/gi, '_')}.png`;
}

function runtimePerspective(definition: GameDefinition): 'top-down' | 'side-view flight' | 'side-view platformer' | 'top-down grid puzzle' | 'decision boardroom' | 'agent ops dashboard' {
  if (definition.runtimeTemplate === 'flight-shooter') return 'side-view flight';
  if (definition.runtimeTemplate === 'platformer') return 'side-view platformer';
  if (definition.runtimeTemplate === 'puzzle-room') return 'top-down grid puzzle';
  if (definition.runtimeTemplate === 'decision-room') return 'decision boardroom';
  if (definition.runtimeTemplate === 'agent-dashboard') return 'agent ops dashboard';
  return 'top-down';
}

function assetOutputDirection(definition: GameDefinition, asset: Asset): string {
  const perspective = runtimePerspective(definition);
  if (asset.kind === 'tile') {
    return [
      `Create one seamless ${perspective} runtime floor/platform tile at ${asset.width}x${asset.height}px.`,
      'The tile must loop cleanly on all edges, stay low-contrast behind actors, and avoid borders, text, logos, UI marks, or unique set pieces.',
      'Do not include a unique center landmark, vignette, camera shadow, or frame; this tile repeats under a live runtime scene.',
    ].join(' ');
  }
  if (asset.kind === 'background') {
    return [
      `Create one ${perspective} runtime background asset at ${asset.width}x${asset.height}px.`,
      'Keep it readable under combat silhouettes, with no UI chrome, text, labels, watermarks, or decorative frame.',
    ].join(' ');
  }
  if (asset.kind === 'fx') {
    return [
      `Create one transparent PNG gameplay effect at ${asset.width}x${asset.height}px.`,
      'Center the effect, leave transparent padding, make it readable at runtime scale, and avoid backgrounds, UI, text, or multiple variants.',
    ].join(' ');
  }
  if (asset.kind === 'icon') {
    return [
      `Create one transparent PNG icon at ${asset.width}x${asset.height}px.`,
      'Use a single centered shape with clear silhouette and no text, UI frame, background, or alternate variants.',
    ].join(' ');
  }
  if (asset.spriteSheet) {
    const clipText = asset.spriteSheet.animations?.length
      ? `Named animation clips to support: ${asset.spriteSheet.animations.map((animation) => `${animation.name}=[${animation.frames.join(',')}]`).join('; ')}.`
      : 'Use readable pose progression for idle, move, attack, and hurt states.';
    const clipSemantics =
      'Pose semantics: idle/boss-idle are calm readable silhouettes; move/escort-move lean into travel; attack/fire show an active weapon or muzzle pose; dash shows a fast lunge; hurt/contested/defend-contested show pressure or damage; telegraph/boss-telegraph show windup; execute/boss-execute show release.';
    return [
      `Create one transparent PNG ${perspective} actor sprite sheet at ${asset.width}x${asset.height}px.`,
      `It must contain exactly ${asset.spriteSheet.frames} equal frames in one horizontal row, each ${asset.spriteSheet.frameWidth}x${asset.spriteSheet.frameHeight}px.`,
      clipText,
      clipSemantics,
      'Use one readable actor with pose changes that match those state clips.',
      'All frames must keep the same actor scale, facing direction, center point, and collision footprint so Phaser frame stepping does not jitter.',
      'The sheet must be a pure contact sheet: no gutters, grid lines, frame outlines, labels, numbers, alternate characters, background, cast shadow, UI, logos, or watermark.',
      'Keep 10-15% transparent padding inside each frame; transparent pixels are fine, but the frame cells must align exactly at fixed horizontal offsets.',
    ].join(' ');
  }
  return [
    `Create one transparent PNG ${perspective} actor sprite at ${asset.width}x${asset.height}px.`,
    'Use a single centered full-body silhouette with 10-15% transparent padding; no sprite sheet, alternate poses, background, cast shadow, text, UI, logos, or watermark.',
    `Keep the actor centered with a readable ${perspective} footprint; runtime systems add shadows, outlines, hit flashes, and motion effects.`,
  ].join(' ');
}

function planPrompt(definition: GameDefinition, asset: Asset): string {
  return [
    asset.prompt,
    `Game: ${definition.title}. Theme: ${definition.theme}.`,
    `Palette anchors: player ${definition.palette.player}, danger ${definition.palette.danger}, accent ${definition.palette.accent}, floor ${definition.palette.background}.`,
    `Runtime asset key: ${asset.key}. Kind: ${asset.kind}.`,
    assetOutputDirection(definition, asset),
    'Use the game style bible exactly; prioritize strong silhouette, clean value separation, and instant gameplay readability over illustration detail.',
  ].join(' ');
}

export function buildAssetPlanFromGameDefinition(definition: GameDefinition): RuntimeAssetPlan {
  return {
    images: definition.assets.map((asset) => ({
      variable: assetVariable(asset),
      prompt: planPrompt(definition, asset),
      fileName: assetFileName(asset),
      category: assetCategory(asset),
    })),
    sfx: [],
    music: [],
    fonts: [],
  };
}

function runtimeRefFromProducedPath(path: string, options: ReviewedAssetSourceOptions = {}): string {
  const prefix = options.runtimePrefix ?? 'runtime:';
  const normalized = path.replace(/^assets\//, '').replace(/^\/+/, '');
  return `${prefix}${normalized}`;
}

export function attachReviewedAssetSources(
  definition: GameDefinition,
  plan: RuntimeAssetPlan,
  produced: readonly ProducedAsset[],
  options: ReviewedAssetSourceOptions = {},
): GameDefinition {
  const variableToPath = new Map(
    produced
      .filter((asset) => asset.approved)
      .map((asset) => [asset.variable, asset.path] as const),
  );
  const keyToVariable = new Map(
    definition.assets.map((asset, index) => [asset.key, plan.images[index]?.variable] as const),
  );
  return {
    ...definition,
    assets: definition.assets.map((asset) => {
      const variable = keyToVariable.get(asset.key);
      const producedPath = variable ? variableToPath.get(variable) : undefined;
      return producedPath ? { ...asset, src: runtimeRefFromProducedPath(producedPath, options) } : asset;
    }),
  };
}
