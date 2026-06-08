import assert from 'node:assert';
import { attachReviewedAssetSources, buildAssetPlanFromGameDefinition } from './asset-plan';
import { attachLocalAssetSources } from './local-asset-sources';
import { buildLocalGameDefinition } from './local-generator';

const def = buildLocalGameDefinition('a haunted boss raid horror');
const plan = buildAssetPlanFromGameDefinition(def);

assert.equal(plan.images.length, def.assets.length, 'every GameDefinition asset should get a production image plan entry');
assert.equal(plan.sfx.length, 0);
assert.equal(plan.music.length, 0);
assert.equal(plan.fonts.length, 0);

const heroEntry = plan.images.find((entry) => entry.fileName === `${def.player.spriteKey}.png`);
assert.ok(heroEntry, 'player asset should be planned');
assert.equal(heroEntry.category, 'sprites');
assert.match(heroEntry.variable, /^[A-Za-z_$][A-Za-z0-9_$]*$/);
assert.match(heroEntry.prompt, new RegExp(def.title));
assert.match(heroEntry.prompt, /transparent PNG/);
assert.match(heroEntry.prompt, /actor sprite sheet/);
assert.match(heroEntry.prompt, /exactly 8 equal frames/);
assert.match(heroEntry.prompt, /one horizontal row/);
assert.match(heroEntry.prompt, /Named animation clips to support/);
assert.match(heroEntry.prompt, /boss-telegraph=\[5,6,7,6\]/);
assert.match(heroEntry.prompt, /Pose semantics/);
assert.match(heroEntry.prompt, /same actor scale, facing direction, center point, and collision footprint/);
assert.match(heroEntry.prompt, /pure contact sheet/);
assert.match(heroEntry.prompt, /no gutters, grid lines, frame outlines, labels, numbers/);
assert.match(heroEntry.prompt, /frame cells must align exactly at fixed horizontal offsets/);
assert.match(heroEntry.prompt, /Palette anchors/);

const floorEntry = plan.images.find((entry) => entry.fileName === `${def.arena.tileKey}.png`);
assert.ok(floorEntry, 'floor tile should be planned');
assert.equal(floorEntry.category, 'background');
assert.match(floorEntry.prompt, /seamless top-down runtime floor\/platform tile/);
assert.match(floorEntry.prompt, /loop cleanly on all edges/);
assert.match(floorEntry.prompt, /Do not include a unique center landmark/);
assert.doesNotMatch(floorEntry.prompt, /transparent PNG top-down actor sprite/);

const platformDef = buildLocalGameDefinition('a castle platformer jump quest with ledge monsters and a clockwork boss');
const platformPlan = buildAssetPlanFromGameDefinition(platformDef);
const platformHeroEntry = platformPlan.images.find((entry) => entry.fileName === `${platformDef.player.spriteKey}.png`);
assert.ok(platformHeroEntry, 'platformer player asset should be planned');
assert.match(platformHeroEntry.prompt, /side-view platformer actor sprite sheet/, 'platformer actors should request side-view sprite sheets');
const platformFloorEntry = platformPlan.images.find((entry) => entry.fileName === `${platformDef.arena.tileKey}.png`);
assert.ok(platformFloorEntry, 'platformer floor asset should be planned');
assert.match(platformFloorEntry.prompt, /seamless side-view platformer runtime floor\/platform tile/, 'platformer floor should request side-view platform tiles');

const puzzleDef = buildLocalGameDefinition('a crystal temple puzzle where an archivist pushes mirrors onto switches and opens a moon gate');
const puzzlePlan = buildAssetPlanFromGameDefinition(puzzleDef);
const puzzleHeroEntry = puzzlePlan.images.find((entry) => entry.fileName === `${puzzleDef.player.spriteKey}.png`);
assert.ok(puzzleHeroEntry, 'puzzle-room player asset should be planned');
assert.match(puzzleHeroEntry.prompt, /top-down grid puzzle actor sprite sheet/, 'puzzle-room actors should request top-down grid-puzzle sprite sheets');
const puzzleFloorEntry = puzzlePlan.images.find((entry) => entry.fileName === `${puzzleDef.arena.tileKey}.png`);
assert.ok(puzzleFloorEntry, 'puzzle-room floor asset should be planned');
assert.match(puzzleFloorEntry.prompt, /seamless top-down grid puzzle runtime floor\/platform tile/, 'puzzle-room floor should request grid-puzzle tiles');

const decisionRoomDef = buildLocalGameDefinition('a boardroom decision app for a product launch with stakeholders evidence options recommendation and audit trail');
const decisionRoomPlan = buildAssetPlanFromGameDefinition(decisionRoomDef);
const decisionRoomHeroEntry = decisionRoomPlan.images.find((entry) => entry.fileName === `${decisionRoomDef.player.spriteKey}.png`);
assert.ok(decisionRoomHeroEntry, 'decision-room player asset should be planned');
assert.match(decisionRoomHeroEntry.prompt, /decision boardroom actor sprite sheet/, 'decision-room actors should request boardroom decision-app sprite sheets');
const decisionRoomFloorEntry = decisionRoomPlan.images.find((entry) => entry.fileName === `${decisionRoomDef.arena.tileKey}.png`);
assert.ok(decisionRoomFloorEntry, 'decision-room floor asset should be planned');
assert.match(decisionRoomFloorEntry.prompt, /decision boardroom runtime floor\/platform tile/, 'decision-room floor should request boardroom panel tiles');

const agentDashboardDef = buildLocalGameDefinition('an agent operations dashboard for shipping a Vercel game app with queues approvals logs and deployment health');
const agentDashboardPlan = buildAssetPlanFromGameDefinition(agentDashboardDef);
const agentDashboardHeroEntry = agentDashboardPlan.images.find((entry) => entry.fileName === `${agentDashboardDef.player.spriteKey}.png`);
assert.ok(agentDashboardHeroEntry, 'agent-dashboard player asset should be planned');
assert.match(agentDashboardHeroEntry.prompt, /agent ops dashboard actor sprite sheet/, 'agent-dashboard actors should request dashboard-oriented sprite sheets');
const agentDashboardFloorEntry = agentDashboardPlan.images.find((entry) => entry.fileName === `${agentDashboardDef.arena.tileKey}.png`);
assert.ok(agentDashboardFloorEntry, 'agent-dashboard floor asset should be planned');
assert.match(agentDashboardFloorEntry.prompt, /agent ops dashboard runtime floor\/platform tile/, 'agent-dashboard floor should request dashboard panel tiles');

const reviewed = attachReviewedAssetSources(def, plan, [
  { variable: heroEntry.variable, path: 'assets/sprites/hero.png', reviewed: true, approved: true, note: 'passed' },
  { variable: floorEntry.variable, path: 'assets/background/floor.png', reviewed: true, approved: false, note: 'failed' },
]);
assert.equal(
  reviewed.assets.find((asset) => asset.key === def.player.spriteKey)?.src,
  'runtime:sprites/hero.png',
  'approved reviewed sprite should map back to runtime: source',
);
assert.equal(
  reviewed.assets.find((asset) => asset.key === def.arena.tileKey)?.src,
  undefined,
  'unapproved reviewed asset should not replace the current source',
);

const sourceBacked = attachLocalAssetSources(def);
const planFromSourceBacked = buildAssetPlanFromGameDefinition(sourceBacked);
assert.equal(
  planFromSourceBacked.images.length,
  sourceBacked.assets.length,
  'production plan should still cover deterministic placeholder src values',
);

console.log('asset-plan.test.ts - all assertions passed');
