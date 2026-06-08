import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGeminiGameDefinitionFunctionDeclaration, generateGameDefinition } from './definition-generator';
import { buildLocalGameDefinition } from './local-generator';

const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZp7WQAAAABJRU5ErkJggg==';

const fakeModelDefinition = buildLocalGameDefinition('a neon space arena shooter with drone swarms');
let fakeModelInput = '';
let fakeModelSchema: unknown;
let fakeModelConfig: unknown;

const fakeModel = {
  withStructuredOutput: (schema: unknown, config: unknown) => ({
    invoke: async (input: string) => {
      fakeModelSchema = schema;
      fakeModelConfig = config;
      fakeModelInput = input;
      return {
        ...fakeModelDefinition,
        title: 'Model Built Arena',
      };
    },
  }),
};

function collectSchemaKeys(value: unknown, keys = new Set<string>()) {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaKeys(item, keys));
    return keys;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    keys.add(key);
    collectSchemaKeys(child, keys);
  });
  return keys;
}

const invalidReferenceModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      player: { ...fakeModelDefinition.player, spriteKey: 'missing-hero' },
    }),
  }),
};

const invalidScoreTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'score-target',
    }),
  }),
};

const invalidRelicTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'collect-relics',
    }),
  }),
};

const invalidCaptureTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'capture-zone',
    }),
  }),
};

const invalidEscortTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'escort',
      escortSpriteKey: fakeModelDefinition.player.spriteKey,
    }),
  }),
};

const invalidDefendTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'defend-core',
      defendSpriteKey: fakeModelDefinition.player.spriteKey,
    }),
  }),
};

const invalidRepairTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'repair-nodes',
      repairNodeCount: 3,
    }),
  }),
};

const invalidExtractTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'extract',
    }),
  }),
};

const invalidRescueTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'rescue',
      rescueSpriteKey: fakeModelDefinition.player.spriteKey,
      rescueHoldSeconds: 5,
    }),
  }),
};

const invalidUnlockTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      winCondition: 'unlock-gate',
      unlockKeyTarget: 3,
    }),
  }),
};

const invalidPuzzleTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      runtimeTemplate: 'puzzle-room',
      winCondition: 'solve-puzzle',
      puzzleRoom: undefined,
    }),
  }),
};

const invalidAgentDashboardTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      runtimeTemplate: 'agent-dashboard',
      winCondition: 'approve-deploy',
      agentDashboard: undefined,
    }),
  }),
};

const invalidDecisionRoomTargetModel = {
  withStructuredOutput: () => ({
    invoke: async () => ({
      ...fakeModelDefinition,
      runtimeTemplate: 'decision-room',
      winCondition: 'select-decision',
      decisionRoom: undefined,
    }),
  }),
};

const local = await generateGameDefinition({ prompt: 'a chaotic haunted bakery roguelite', forceLocal: true });
assert.equal(local.source, 'local');
assert.equal(local.definition.player.spriteKey, 'hero');
assert.equal(local.definition.assets.every((asset) => asset.src), true);
assert.equal(local.assetPlan.images.length, local.definition.assets.length);

const model = await generateGameDefinition({ prompt: 'a model built arena', model: fakeModel });
assert.equal(model.source, 'model');
assert.equal(model.definition.title, 'Model Built Arena');
assert.equal(model.definition.assets.every((asset) => asset.src), true);
assert.equal(model.assetPlan.images.length, model.definition.assets.length);
assert.equal((fakeModelConfig as { method?: string } | undefined)?.method, 'functionCalling');
assert.equal((fakeModelSchema as { name?: string } | undefined)?.name, 'build_game_definition');
const geminiSchemaKeys = collectSchemaKeys(buildGeminiGameDefinitionFunctionDeclaration());
for (const unsupportedKey of ['const', 'exclusiveMinimum', 'exclusiveMaximum', 'additionalProperties', '$schema', 'default', 'minLength', 'pattern']) {
  assert.equal(geminiSchemaKeys.has(unsupportedKey), false, `Gemini schema should not include unsupported key ${unsupportedKey}`);
}
assert.match(
  fakeModelInput,
  /defend-core.*defendSpriteKey.*defendTargetSeconds.*defendMaxHealth/,
  'model instructions should describe defend-core required fields',
);
assert.match(
  fakeModelInput,
  /repair-nodes.*repairNodeCount.*repairSecondsPerNode/,
  'model instructions should describe repair-nodes required fields',
);
assert.match(
  fakeModelInput,
  /extract.*extractHoldSeconds/,
  'model instructions should describe extract required fields',
);
assert.match(
  fakeModelInput,
  /rescue.*rescueSpriteKey.*rescueHoldSeconds.*rescueExtractSeconds/,
  'model instructions should describe rescue required fields',
);
assert.match(
  fakeModelInput,
  /unlock-gate.*unlockKeyTarget.*unlockHoldSeconds/,
  'model instructions should describe unlock-gate required fields',
);
assert.match(
  fakeModelInput,
  /feelProfile.*arcade-survivor.*bullet-hell-raid.*siege-defense.*cozy-explorer.*score-chaser/,
  'model instructions should describe supported feel profiles',
);
assert.match(
  fakeModelInput,
  /runtimeTemplate.*arena-action.*flight-shooter.*platformer.*puzzle-room.*decision-room.*agent-dashboard/s,
  'model instructions should describe supported runtime templates',
);
assert.match(
  fakeModelInput,
  /puzzle-room.*solve-puzzle.*puzzleRoom.*gridWidth\/gridHeight.*moveLimit/s,
  'model instructions should describe puzzle-room required fields',
);
assert.match(
  fakeModelInput,
  /decision-room.*select-decision.*decisionRoom.*stakeholders.*evidence.*options.*auditTrail.*decisionGate/s,
  'model instructions should describe decision-room required fields',
);
assert.match(
  fakeModelInput,
  /agent-dashboard.*approve-deploy.*agentDashboard.*mission.*approvals.*deploymentHealth/s,
  'model instructions should describe agent-dashboard required fields',
);
assert.match(
  fakeModelInput,
  /Match enemies and timed waves to that profile.*arcade-survivor.*chaser\/sapper\/shooter.*bullet-hell-raid.*shooter\/orbiter.*siege-defense.*brute\/guardian\/support.*cozy-explorer.*wanderer\/chaser.*score-chaser.*charger\/sentinel\/sniper/s,
  'model instructions should describe profile-specific enemy and wave composition',
);
assert.match(
  fakeModelInput,
  /eight-frame horizontal spriteSheet.*frames:8.*boss-telegraph.*boss-execute/s,
  'model instructions should describe state-aware sprite-sheet metadata',
);
assert.match(
  fakeModelInput,
  /spiral-shot, radial-burst, charge, summon, beam, minefield, vortex, shockwave, and laser-grid.*area-denial bosses.*vortex.*gravity.*shockwave.*quake.*laser-grid.*security grid/s,
  'model instructions should describe minefield, vortex, shockwave, and laser-grid boss pattern support',
);

const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'definition-generator-assets-workspace-'));
const publicRuntimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'definition-generator-assets-public-'));
const productionEvents: { type: string; name?: string; id?: string }[] = [];
const produced = await generateGameDefinition({
  prompt: 'a reviewed haunted arena',
  forceLocal: true,
  produceAssets: true,
  assetProduction: {
    batchId: 'definition-generator-test',
    workspaceDir,
    publicRuntimeDir,
    emit: (event) => {
      productionEvents.push(event);
    },
    deps: {
      generate: async () => ({ dataUrl: DATA_URL, text: '' }),
      review: async () => ({ approved: true, note: 'passed' }),
    },
  },
});
assert.ok(produced.assetProduction);
assert.equal(produced.assetProduction.ok, true);
assert.equal(produced.assetProduction.approvedImages, produced.assetPlan.images.length);
assert.equal(produced.assetProduction.reviewItems.length, 0);
assert.equal(produced.assetProduction.batchManifestUrl, '/runtime/forge/definition-generator-test/asset-production.json');
assert.equal(
  produced.definition.assets.every((asset) => asset.src?.startsWith('runtime:forge/definition-generator-test/')),
  true,
);
const publishedHero = produced.definition.assets.find((asset) => asset.key === produced.definition.player.spriteKey)?.src;
assert.ok(publishedHero);
await fs.stat(path.join(publicRuntimeDir, ...publishedHero.replace('runtime:', '').split('/')));
await fs.stat(path.join(publicRuntimeDir, 'forge', 'definition-generator-test', 'asset-production.json'));
assert.equal(productionEvents.some((event) => event.type === 'tool_start' && event.name === 'generate_image'), true);
assert.equal(productionEvents.some((event) => event.type === 'image'), true);
assert.equal(productionEvents.some((event) => event.type === 'tool_end' && event.name === 'review_asset'), true);

const originalGoogleApiKey = process.env['GOOGLE_API_KEY'];
delete process.env['GOOGLE_API_KEY'];
try {
  const missingKeyProduction = await generateGameDefinition({
    prompt: 'a keyless reviewed arena',
    forceLocal: true,
    produceAssets: true,
  });
  assert.equal(missingKeyProduction.assetProduction?.ok, false);
  assert.equal(missingKeyProduction.assetProduction?.batchManifestUrl, null);
  assert.equal(missingKeyProduction.assetProduction?.reviewItems.length, 0);
  assert.match(missingKeyProduction.assetProduction?.failures[0] ?? '', /GOOGLE_API_KEY/);
  assert.equal(
    missingKeyProduction.definition.assets.every((asset) => asset.src?.startsWith('data:')),
    true,
    'missing-key production should keep source-backed fallback art',
  );
} finally {
  if (originalGoogleApiKey === undefined) {
    delete process.env['GOOGLE_API_KEY'];
  } else {
    process.env['GOOGLE_API_KEY'] = originalGoogleApiKey;
  }
}

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad refs', model: invalidReferenceModel }),
  /missing asset key "missing-hero"/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad score target', model: invalidScoreTargetModel }),
  /score-target requires scoreTarget/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad relic target', model: invalidRelicTargetModel }),
  /collect-relics requires relicTarget/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad capture target', model: invalidCaptureTargetModel }),
  /capture-zone requires captureTargetSeconds/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad escort target', model: invalidEscortTargetModel }),
  /escort requires escortTargetDistance/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad defend target', model: invalidDefendTargetModel }),
  /defend-core requires defendTargetSeconds/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad repair target', model: invalidRepairTargetModel }),
  /repair-nodes requires repairSecondsPerNode/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad extract target', model: invalidExtractTargetModel }),
  /extract requires extractHoldSeconds/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad rescue target', model: invalidRescueTargetModel }),
  /rescue requires rescueExtractSeconds/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad unlock target', model: invalidUnlockTargetModel }),
  /unlock-gate requires unlockHoldSeconds/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad puzzle target', model: invalidPuzzleTargetModel }),
  /solve-puzzle requires puzzleRoom/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad agent dashboard target', model: invalidAgentDashboardTargetModel }),
  /approve-deploy requires agentDashboard/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: 'bad decision room target', model: invalidDecisionRoomTargetModel }),
  /select-decision requires decisionRoom/,
);

await assert.rejects(
  () => generateGameDefinition({ prompt: '   ', forceLocal: true }),
  /prompt must be non-empty/,
);

console.log('definition-generator.test.ts - all assertions passed');
