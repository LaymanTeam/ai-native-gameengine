/**
 * Prompt -> GameDefinition boundary for the Forge runtime.
 *
 * Keyless mode keeps using the deterministic local generator. With a model, this asks for a
 * structured GameDefinition and validates both Zod shape and cross-field asset references before
 * the browser receives it.
 */
import * as z from 'zod';
import {
  gameDefinitionSchema,
  parseGameDefinition,
  validateGameDefinitionReferences,
  type GameDefinition,
} from './game-definition';
import { buildAssetPlanFromGameDefinition, type RuntimeAssetPlan } from './asset-plan';
import {
  type ProduceRuntimeAssetsOptions,
  type RuntimeAssetReviewItem,
  type RuntimeAssetProductionResult,
} from './asset-production';
import { attachLocalAssetSources } from './local-asset-sources';
import { buildLocalGameDefinition } from './local-generator';
import { createCoderModel } from '../ai/providers';

const DEFINITION_GENERATOR_LOG_PREFIX = '[engine/runtime/definition-generator]';

interface StructuredGameDefinitionModel {
  withStructuredOutput(schema: unknown, config?: { name?: string; method?: 'functionCalling' | 'jsonSchema' }): {
    invoke(input: string): Promise<unknown>;
  };
}

export interface GenerateGameDefinitionOptions {
  prompt: string;
  model?: StructuredGameDefinitionModel;
  forceLocal?: boolean;
  produceAssets?: boolean;
  assetProduction?: Omit<ProduceRuntimeAssetsOptions, 'definition' | 'prompt' | 'plan'>;
}

export interface GeneratedAssetProduction {
  ok: boolean;
  batchId: string | null;
  publicRuntimePrefix: string | null;
  batchManifestUrl: string | null;
  requestedImages: number;
  approvedImages: number;
  failures: string[];
  reviewItems: RuntimeAssetReviewItem[];
  produced: Array<{
    variable: string;
    path: string;
    reviewed: boolean;
    approved: boolean;
    note: string;
  }>;
}

export interface GeneratedGameDefinition {
  source: 'local' | 'model';
  definition: GameDefinition;
  assetPlan: RuntimeAssetPlan;
  assetProduction?: GeneratedAssetProduction;
}

const SYSTEM_FRAMING =
  'You produce one playable GameDefinition for the existing Forge runtime SDK. Return structured data only. ' +
  'Set runtimeTemplate to arena-action for the default top-down arena game, flight-shooter for airplane, jet, sky, dogfight, pilot, or side-scrolling shooter prompts, platformer for platform, jump, ledge, castle, cave, ruin, temple, or side-view action prompts, puzzle-room for puzzle, maze, switch, block, prism, mirror, crystal, or Sokoban-style prompts, decision-room for boardroom, decision, strategy, stakeholder, evidence, recommendation, audit, option, launch, or roadmap prompts, or agent-dashboard for agent, ops, queue, approval, deploy, Vercel, MCP, CLI, or operations cockpit prompts. ' +
  'Keep the game bounded but mechanically readable: a player with one ' +
  'auto-fire weapon, 3-5 enemy types with roles, timed waves, optional boss, upgrades, and a clear ' +
  'win condition. Every player/enemy/boss spriteKey and arena tileKey must have a matching entry in ' +
  'assets[]. Include feelProfile as one of arcade-survivor, bullet-hell-raid, siege-defense, ' +
  'cozy-explorer, or score-chaser. Use bullet-hell-raid for boss/raid/swarm prompts, siege-defense ' +
  'for defend/repair/base/rescue/extract prompts, cozy-explorer for gentle gather/escort/relic prompts, and ' +
  'score-chaser for arcade/combo/score/unlock prompts. Match enemies and timed waves to that profile: ' +
  'arcade-survivor should include chaser/sapper/shooter pressure, ' +
  'bullet-hell-raid should favor shooter/orbiter/sniper crossfire pressure, siege-defense should include sturdier brute/guardian/support breach pressure, ' +
  'cozy-explorer should use gentler wanderer/chaser pressure, and score-chaser should use charger/sentinel/sniper scoring lanes. Include playStyle to tune feel: pressure relaxed/standard/intense/siege, weaponCadence ' +
  'deliberate/steady/rapid/bullet-hell, camera steady/responsive/dramatic, and readability clean/arcade/high-contrast. ' +
  'For puzzle-room, set winCondition to solve-puzzle, include puzzleRoom with gridWidth/gridHeight, start, exit, walls, blocks, switches, gems, hazards, and moveLimit; keep enemies/waves minimal because the puzzle runtime owns interaction. ' +
  'For decision-room, set winCondition to select-decision, include decisionRoom with brief, recommendation, stakeholders, evidence, options, auditTrail, and decisionGate.recommendedOptionId; keep enemies/waves minimal because the decision runtime owns interaction. ' +
  'For agent-dashboard, set winCondition to approve-deploy, include agentDashboard with mission, summary, operatingMode, confidence, agents, tasks, approvals, logs, metrics, and deploymentHealth; keep enemies/waves minimal because the dashboard runtime owns interaction. ' +
  'If winCondition is defeat-boss, include a boss. If winCondition is score-target, include ' +
  'scoreTarget. If winCondition is collect-relics, include relicTarget. If winCondition is capture-zone, include captureTargetSeconds. If winCondition is escort, include escortSpriteKey and escortTargetDistance. If winCondition is defend-core, include defendSpriteKey, defendTargetSeconds, and defendMaxHealth. If winCondition is repair-nodes, include repairNodeCount and repairSecondsPerNode. If winCondition is extract, include extractHoldSeconds. If winCondition is rescue, include rescueSpriteKey, rescueHoldSeconds, and rescueExtractSeconds. If winCondition is unlock-gate, include unlockKeyTarget and unlockHoldSeconds. If winCondition is approve-deploy, include agentDashboard. If winCondition is select-decision, include decisionRoom. Asset keys must be kebab-case. For actor sprite assets, prefer an eight-frame horizontal spriteSheet with width=frameWidth*8, height=frameHeight, and spriteSheet={frameWidth,frameHeight,frames:8,animations:[named clips such as idle, move, attack, fire, dash, hurt, boss-telegraph, boss-execute]}; for assets, include prompt/width/height; omit src unless ' +
  'you already have a loadable data URL or runtime:<file> reference. Boss patterns must use the supported ' +
  'values spiral-shot, radial-burst, charge, summon, beam, minefield, vortex, shockwave, and laser-grid; choose 2-4 patterns that fit the prompt. Use minefield for trap, bomb, meteor, or area-denial bosses. Use vortex for gravity, singularity, rift, maelstrom, or pull-field bosses. Use shockwave for quake, seismic, pulse, sonic, stomp, slam, or ring-pressure bosses. Use laser-grid for laser lattice, scanner, security grid, crossfire, or tripwire bosses.';

type JsonObject = Record<string, unknown>;

const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  '$schema',
  '$defs',
  '$ref',
  'additionalProperties',
  'const',
  'default',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
]);

function withDescription(schema: JsonObject, text: string): void {
  const existing = typeof schema['description'] === 'string' ? schema['description'] : '';
  schema['description'] = existing ? `${existing} ${text}` : text;
}

function sanitizeGeminiSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeGeminiSchemaValue(item));
  if (!value || typeof value !== 'object') return value;

  const source = value as JsonObject;
  const sanitized: JsonObject = {};

  if (Object.prototype.hasOwnProperty.call(source, 'const')) {
    const constValue = source['const'];
    if (typeof constValue === 'string') {
      sanitized['enum'] = [constValue];
    } else if (typeof constValue === 'number') {
      sanitized['minimum'] = constValue;
      sanitized['maximum'] = constValue;
      withDescription(sanitized, `Must be ${constValue}.`);
    } else if (typeof constValue === 'boolean') {
      withDescription(sanitized, `Must be ${constValue}.`);
    }
  }

  if (typeof source['exclusiveMinimum'] === 'number' && typeof sanitized['minimum'] !== 'number') {
    sanitized['minimum'] = source['exclusiveMinimum'];
  }
  if (typeof source['exclusiveMaximum'] === 'number' && typeof sanitized['maximum'] !== 'number') {
    sanitized['maximum'] = source['exclusiveMaximum'];
  }

  for (const [key, child] of Object.entries(source)) {
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    if (key === 'properties' && child && typeof child === 'object' && !Array.isArray(child)) {
      sanitized['properties'] = Object.fromEntries(
        Object.entries(child as JsonObject).map(([propertyKey, propertySchema]) => [
          propertyKey,
          sanitizeGeminiSchemaValue(propertySchema),
        ]),
      );
      continue;
    }
    sanitized[key] = sanitizeGeminiSchemaValue(child);
  }

  return sanitized;
}

export function buildGeminiGameDefinitionFunctionDeclaration() {
  const jsonSchema = z.toJSONSchema(gameDefinitionSchema, { io: 'output' });
  const parameters = sanitizeGeminiSchemaValue(jsonSchema) as JsonObject;
  return {
    name: 'build_game_definition',
    description: 'Build one complete GameDefinition for the Forge runtime.',
    parameters,
  };
}

function ensureDefinitionIntegrity(definition: GameDefinition): GameDefinition {
  const referenceErrors = validateGameDefinitionReferences(definition);
  if (referenceErrors.length > 0) {
    throw new Error(`${DEFINITION_GENERATOR_LOG_PREFIX} invalid GameDefinition references: ${referenceErrors.join('; ')}`);
  }
  return attachLocalAssetSources(definition);
}

function summarizeAssetProduction(result: RuntimeAssetProductionResult): GeneratedAssetProduction {
  return {
    ok: result.ok,
    batchId: result.batchId,
    publicRuntimePrefix: result.publicRuntimePrefix,
    batchManifestUrl: result.batchManifestUrl,
    requestedImages: result.requestedImages,
    approvedImages: result.approvedImages,
    failures: result.failures,
    reviewItems: result.reviewItems,
    produced: result.produced.map((asset) => ({
      variable: asset.variable,
      path: asset.path,
      reviewed: asset.reviewed,
      approved: asset.approved,
      note: asset.note,
    })),
  };
}

async function finalizeGeneratedDefinition(args: {
  source: GeneratedGameDefinition['source'];
  prompt: string;
  definition: GameDefinition;
  options: GenerateGameDefinitionOptions;
}): Promise<GeneratedGameDefinition> {
  const assetPlan = buildAssetPlanFromGameDefinition(args.definition);
  if (!args.options.produceAssets) {
    return { source: args.source, definition: args.definition, assetPlan };
  }
  if (!args.options.assetProduction?.deps?.generate && !process.env['GOOGLE_API_KEY']) {
    const message = `${DEFINITION_GENERATOR_LOG_PREFIX} reviewed asset production requires GOOGLE_API_KEY`;
    return {
      source: args.source,
      definition: args.definition,
      assetPlan,
      assetProduction: {
        ok: false,
        batchId: args.options.assetProduction?.batchId ?? null,
        publicRuntimePrefix: null,
        batchManifestUrl: null,
        requestedImages: assetPlan.images.length,
        approvedImages: 0,
        failures: [message],
        reviewItems: [],
        produced: [],
      },
    };
  }

  try {
    const { produceRuntimeAssetsForDefinition } = await import('./asset-production');
    const production = await produceRuntimeAssetsForDefinition({
      ...args.options.assetProduction,
      definition: args.definition,
      prompt: args.prompt,
      plan: assetPlan,
    });
    return {
      source: args.source,
      definition: production.definition,
      assetPlan: production.assetPlan,
      assetProduction: summarizeAssetProduction(production),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${DEFINITION_GENERATOR_LOG_PREFIX} asset production failed error=${message}`);
    return {
      source: args.source,
      definition: args.definition,
      assetPlan,
      assetProduction: {
        ok: false,
        batchId: args.options.assetProduction?.batchId ?? null,
        publicRuntimePrefix: null,
        batchManifestUrl: null,
        requestedImages: assetPlan.images.length,
        approvedImages: 0,
        failures: [message],
        reviewItems: [],
        produced: [],
      },
    };
  }
}

export async function generateGameDefinition(
  options: GenerateGameDefinitionOptions,
): Promise<GeneratedGameDefinition> {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error(`${DEFINITION_GENERATOR_LOG_PREFIX} prompt must be non-empty`);

  if (options.forceLocal || (!options.model && !process.env['GOOGLE_API_KEY'])) {
    console.log(`${DEFINITION_GENERATOR_LOG_PREFIX} local promptChars=${prompt.length}`);
    const definition = ensureDefinitionIntegrity(buildLocalGameDefinition(prompt));
    return finalizeGeneratedDefinition({ source: 'local', prompt, definition, options });
  }

  const model = options.model ?? (createCoderModel() as unknown as StructuredGameDefinitionModel);
  const input = `${SYSTEM_FRAMING}\n\nUser prompt:\n${prompt}`;
  const started = Date.now();
  console.log(`${DEFINITION_GENERATOR_LOG_PREFIX} model start promptChars=${prompt.length}`);
  try {
    const structured = model.withStructuredOutput(buildGeminiGameDefinitionFunctionDeclaration(), {
      method: 'functionCalling',
    });
    const raw = await structured.invoke(input);
    const parsed = parseGameDefinition(raw);
    if (!parsed.ok) {
      throw new Error(parsed.errors.join('; '));
    }
    const definition = ensureDefinitionIntegrity(parsed.definition);
    console.log(`${DEFINITION_GENERATOR_LOG_PREFIX} model done durationMs=${Date.now() - started} title="${definition.title}"`);
    return finalizeGeneratedDefinition({ source: 'model', prompt, definition, options });
  } catch (error) {
    console.error(
      `${DEFINITION_GENERATOR_LOG_PREFIX} model failed durationMs=${Date.now() - started} error=${error instanceof Error ? error.message : String(error)}`,
    );
    if (!options.model) {
      console.warn(`${DEFINITION_GENERATOR_LOG_PREFIX} falling back to local generator after model failure`);
      const definition = ensureDefinitionIntegrity(buildLocalGameDefinition(prompt));
      return finalizeGeneratedDefinition({ source: 'local', prompt, definition, options });
    }
    throw error;
  }
}
