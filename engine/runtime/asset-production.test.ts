import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAssetPlanFromGameDefinition } from './asset-plan';
import {
  acceptRuntimeAssetReview,
  buildForgeStyleBible,
  produceRuntimeAssetsForDefinition,
  pruneRuntimeAssetBatches,
  retryRuntimeAssetReview,
} from './asset-production';
import { attachLocalAssetSources } from './local-asset-sources';
import { buildLocalGameDefinition } from './local-generator';

const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZp7WQAAAABJRU5ErkJggg==';

const definition = attachLocalAssetSources(buildLocalGameDefinition('a haunted boss raid horror'));
const plan = buildAssetPlanFromGameDefinition(definition);
const floorEntry = plan.images.find((entry) => entry.fileName === `${definition.arena.tileKey}.png`);
assert.ok(floorEntry, 'floor asset should be present in runtime plan');

const style = buildForgeStyleBible(definition, 'a haunted boss raid horror');
assert.equal(style.perspective, 'top-down');
assert.ok(style.palette.includes(definition.palette.player));
assert.ok(
  style.rules.some((rule) => /Do not bake actor shadows/.test(rule)),
  'style bible should prevent baked shadows in transparent runtime sprites',
);
assert.ok(
  style.rules.some((rule) => /exact equal-width cells/.test(rule)),
  'style bible should carry sprite-sheet cell-alignment rules',
);
assert.ok(
  style.rules.some((rule) => /unique center landmarks/.test(rule)),
  'style bible should prevent repeated floor tiles from becoming landmarks',
);

const platformDefinition = attachLocalAssetSources(buildLocalGameDefinition('a castle platformer jump quest with ledge monsters and a clockwork boss'));
const platformStyle = buildForgeStyleBible(platformDefinition, 'a castle platformer jump quest with ledge monsters and a clockwork boss');
assert.equal(platformStyle.perspective, 'side-scroller', 'platformer style bible should request side-scroller perspective');
assert.match(platformStyle.summary, /side-view platformer/, 'platformer style bible should describe side-view platformer art');

const puzzleDefinition = attachLocalAssetSources(buildLocalGameDefinition('a crystal temple puzzle where an archivist pushes mirrors onto switches and opens a moon gate'));
const puzzleStyle = buildForgeStyleBible(puzzleDefinition, 'a crystal temple puzzle where an archivist pushes mirrors onto switches and opens a moon gate');
assert.equal(puzzleStyle.perspective, 'top-down', 'puzzle-room style bible should request top-down perspective');
assert.match(puzzleStyle.summary, /top-down grid puzzle/, 'puzzle-room style bible should describe grid-puzzle art');
assert.ok(
  puzzleStyle.rules.some((rule) => /top-down puzzle grid/.test(rule)),
  'puzzle-room style bible should carry grid tile rules',
);

const decisionRoomDefinition = attachLocalAssetSources(buildLocalGameDefinition('a boardroom decision app for a product launch with stakeholders evidence options recommendation and audit trail'));
const decisionRoomStyle = buildForgeStyleBible(decisionRoomDefinition, 'a boardroom decision app for a product launch with stakeholders evidence options recommendation and audit trail');
assert.equal(decisionRoomStyle.perspective, 'three-quarter', 'decision-room style bible should request a boardroom perspective');
assert.match(decisionRoomStyle.summary, /decision boardroom/, 'decision-room style bible should describe boardroom art');
assert.ok(
  decisionRoomStyle.rules.some((rule) => /boardroom decision app/.test(rule)),
  'decision-room style bible should carry boardroom panel rules',
);

const agentDashboardDefinition = attachLocalAssetSources(buildLocalGameDefinition('an agent operations dashboard for shipping a Vercel game app with queues approvals logs and deployment health'));
const agentDashboardStyle = buildForgeStyleBible(agentDashboardDefinition, 'an agent operations dashboard for shipping a Vercel game app with queues approvals logs and deployment health');
assert.equal(agentDashboardStyle.perspective, 'three-quarter', 'agent-dashboard style bible should request an operations-cockpit perspective');
assert.match(agentDashboardStyle.summary, /agent operations dashboard/, 'agent-dashboard style bible should describe operations dashboard art');
assert.ok(
  agentDashboardStyle.rules.some((rule) => /dense operations dashboard/.test(rule)),
  'agent-dashboard style bible should carry dashboard panel rules',
);

const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-runtime-assets-workspace-'));
const publicRuntimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-runtime-assets-public-'));
const generatedPrompts: string[] = [];

const result = await produceRuntimeAssetsForDefinition({
  definition,
  prompt: 'a haunted boss raid horror',
  plan,
  batchId: 'test-batch',
  workspaceDir,
  publicRuntimeDir,
  deps: {
    generate: async (prompt) => {
      generatedPrompts.push(prompt);
      return { dataUrl: DATA_URL, text: '' };
    },
    review: async ({ assetId }) => ({
      approved: assetId !== floorEntry.variable,
      note: assetId === floorEntry.variable ? 'needs cleaner tile rhythm' : 'passed',
    }),
  },
});

assert.equal(result.ok, false, 'one rejected reviewed asset should make production incomplete');
assert.equal(result.requestedImages, plan.images.length);
assert.equal(result.approvedImages, plan.images.length - 1);
assert.equal(result.reviewItems.length, 1, 'one rejected asset should be retained for review');
assert.equal(result.reviewItems[0]?.variable, floorEntry.variable);
assert.match(result.reviewItems[0]?.reviewUrl ?? '', /\/runtime\/forge\/test-batch\/review\/background\/floor\.png/);
assert.equal(result.batchManifestUrl, '/runtime/forge/test-batch/asset-production.json');
assert.match(generatedPrompts[0] ?? '', /STYLE BIBLE/);
assert.match(generatedPrompts[0] ?? '', /Subject:/);
assert.match(generatedPrompts[0] ?? '', /Do not bake actor shadows/);
assert.match(generatedPrompts[0] ?? '', /exact equal-width cells/);
assert.match(result.failures.join('\n'), /needs cleaner tile rhythm/);

const hero = result.definition.assets.find((asset) => asset.key === definition.player.spriteKey);
assert.ok(hero?.src?.startsWith('runtime:forge/test-batch/sprites/'), 'approved hero should use public runtime ref');

const floor = result.definition.assets.find((asset) => asset.key === definition.arena.tileKey);
assert.ok(floor?.src?.startsWith('data:'), 'rejected floor should keep deterministic fallback source');

const heroPublishedPath = hero?.src?.replace('runtime:', '') ?? '';
await fs.stat(path.join(publicRuntimeDir, ...heroPublishedPath.split('/')));

const reviewPublishedPath = result.reviewItems[0]?.reviewUrl.replace('/runtime/', '') ?? '';
await fs.stat(path.join(publicRuntimeDir, ...reviewPublishedPath.split('/')));

const manifest = JSON.parse(
  await fs.readFile(path.join(publicRuntimeDir, 'forge', 'test-batch', 'asset-production.json'), 'utf8'),
) as {
  batchId?: string;
  ok?: boolean;
  approvedImages?: number;
  reviewItems?: unknown[];
  failures?: string[];
};
assert.equal(manifest.batchId, 'test-batch');
assert.equal(manifest.ok, false);
assert.equal(manifest.approvedImages, plan.images.length - 1);
assert.equal(manifest.reviewItems?.length, 1);
assert.match(manifest.failures?.join('\n') ?? '', /needs cleaner tile rhythm/);

const floorPublishedPath = `forge/test-batch/background/${definition.arena.tileKey}.png`;
await assert.rejects(
  () => fs.stat(path.join(publicRuntimeDir, ...floorPublishedPath.split('/'))),
  /ENOENT/,
  'unapproved floor should not be published to public runtime assets',
);

const accepted = await acceptRuntimeAssetReview({
  batchId: 'test-batch',
  variable: floorEntry.variable,
  publicRuntimeDir,
});
assert.equal(accepted.ok, true);
assert.equal(accepted.approvedImages, plan.images.length);
assert.equal(accepted.reviewItems.length, 0);
assert.equal(accepted.failures.length, 0);
assert.equal(accepted.runtimeRef, 'runtime:forge/test-batch/background/floor.png');
await fs.stat(path.join(publicRuntimeDir, ...accepted.runtimeRef.replace('runtime:', '').split('/')));

const acceptedManifest = JSON.parse(
  await fs.readFile(path.join(publicRuntimeDir, 'forge', 'test-batch', 'asset-production.json'), 'utf8'),
) as {
  ok?: boolean;
  approvedImages?: number;
  reviewItems?: unknown[];
  failures?: string[];
};
assert.equal(acceptedManifest.ok, true);
assert.equal(acceptedManifest.approvedImages, plan.images.length);
assert.equal(acceptedManifest.reviewItems?.length, 0);
assert.equal(acceptedManifest.failures?.length, 0);

const retryWorkspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-runtime-assets-retry-workspace-'));
const retryPublicRuntimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-runtime-assets-retry-public-'));
const retryPrompts: string[] = [];
const singleFloorPlan = { images: [floorEntry], sfx: [], music: [], fonts: [] };
const retrySeed = await produceRuntimeAssetsForDefinition({
  definition,
  prompt: 'a haunted boss raid horror',
  plan: singleFloorPlan,
  batchId: 'retry-batch',
  workspaceDir: retryWorkspaceDir,
  publicRuntimeDir: retryPublicRuntimeDir,
  deps: {
    generate: async (prompt) => {
      retryPrompts.push(prompt);
      return { dataUrl: DATA_URL, text: '' };
    },
    review: async () => ({ approved: false, note: 'too flat' }),
  },
});
assert.equal(retrySeed.ok, false);
assert.equal(retrySeed.reviewItems.length, 1);

const retried = await retryRuntimeAssetReview({
  batchId: 'retry-batch',
  variable: floorEntry.variable,
  feedback: 'add a stronger checker pattern',
  workspaceDir: retryWorkspaceDir,
  publicRuntimeDir: retryPublicRuntimeDir,
  deps: {
    generate: async (prompt) => {
      retryPrompts.push(prompt);
      return { dataUrl: DATA_URL, text: '' };
    },
    review: async () => ({ approved: true, note: 'passed retry' }),
  },
});
assert.equal(retried.ok, true);
assert.equal(retried.runtimeRef, 'runtime:forge/retry-batch/background/floor.png');
assert.equal(retried.reviewItems.length, 0);
assert.equal(retried.failures.length, 0);
assert.equal(retried.approvedImages, 1);
assert.match(retryPrompts.at(-1) ?? '', /add a stronger checker pattern/);
assert.ok(retried.runtimeRef);
await fs.stat(path.join(retryPublicRuntimeDir, ...retried.runtimeRef.replace('runtime:', '').split('/')));

const cleanupPublicRuntimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-runtime-assets-cleanup-public-'));
const cleanupStyle = buildForgeStyleBible(definition, 'cleanup test');
async function writeCleanupBatch(batchId: string, createdAt: string) {
  const batchRoot = path.join(cleanupPublicRuntimeDir, 'forge', batchId);
  await fs.mkdir(batchRoot, { recursive: true });
  await fs.writeFile(path.join(batchRoot, 'sentinel.txt'), batchId, 'utf8');
  await fs.writeFile(
    path.join(batchRoot, 'asset-production.json'),
    `${JSON.stringify(
      {
        batchId,
        createdAt,
        ok: true,
        requestedImages: 0,
        approvedImages: 0,
        publicRuntimePrefix: `runtime:forge/${batchId}/`,
        styleBible: cleanupStyle,
        assetPlanImages: [],
        produced: [],
        failures: [],
        reviewItems: [],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

await writeCleanupBatch('old-a', '2026-05-01T00:00:00.000Z');
await writeCleanupBatch('old-b', '2026-05-02T00:00:00.000Z');
await writeCleanupBatch('recent-a', '2026-06-06T00:00:00.000Z');
await writeCleanupBatch('recent-b', '2026-06-07T00:00:00.000Z');

const dryRunPrune = await pruneRuntimeAssetBatches({
  publicRuntimeDir: cleanupPublicRuntimeDir,
  keepLatest: 2,
  maxAgeDays: 14,
  dryRun: true,
  now: new Date('2026-06-07T00:00:00.000Z'),
});
assert.equal(dryRunPrune.prunedBatches.length, 2);
await fs.stat(path.join(cleanupPublicRuntimeDir, 'forge', 'old-a', 'sentinel.txt'));

const pruned = await pruneRuntimeAssetBatches({
  publicRuntimeDir: cleanupPublicRuntimeDir,
  keepLatest: 2,
  maxAgeDays: 14,
  now: new Date('2026-06-07T00:00:00.000Z'),
});
assert.equal(pruned.ok, true);
assert.equal(pruned.totalBatches, 4);
assert.equal(pruned.keptBatches, 2);
assert.deepEqual(
  pruned.prunedBatches.map((batch) => batch.batchId).sort(),
  ['old-a', 'old-b'],
);
await assert.rejects(() => fs.stat(path.join(cleanupPublicRuntimeDir, 'forge', 'old-a')), /ENOENT/);
await assert.rejects(() => fs.stat(path.join(cleanupPublicRuntimeDir, 'forge', 'old-b')), /ENOENT/);
await fs.stat(path.join(cleanupPublicRuntimeDir, 'forge', 'recent-a', 'sentinel.txt'));
await fs.stat(path.join(cleanupPublicRuntimeDir, 'forge', 'recent-b', 'sentinel.txt'));

console.log('asset-production.test.ts - all assertions passed');
