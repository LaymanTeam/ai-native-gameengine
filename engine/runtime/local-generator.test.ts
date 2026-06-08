import assert from 'node:assert';
import { parseGameDefinition, validateGameDefinitionReferences, type GameDefinition } from './game-definition';
import { FIRST_GAME_VERTICAL_SLICE } from './first-game';
import { attachLocalAssetSources } from './local-asset-sources';
import { buildLocalGameDefinition } from './local-generator';

function assertReferencedAssetsExist(prompt: string) {
  const def = buildLocalGameDefinition(prompt);
  const assetKeys = new Set(def.assets.map((asset) => asset.key));

  assert.ok(assetKeys.has(def.player.spriteKey), 'player spriteKey must exist in assets[]');
  assert.notEqual(def.player.spriteKey, 'player', 'local generator should exercise non-legacy player keys');

  for (const enemy of def.enemies) {
    assert.ok(assetKeys.has(enemy.spriteKey), `enemy spriteKey must exist in assets[]: ${enemy.spriteKey}`);
    assert.notEqual(enemy.spriteKey, 'enemy-0', 'local generator should exercise non-legacy enemy keys');
  }

  if (def.boss) {
    assert.ok(assetKeys.has(def.boss.spriteKey), 'boss spriteKey must exist in assets[]');
    assert.notEqual(def.boss.spriteKey, 'boss', 'local generator should exercise non-legacy boss keys');
  }

  assert.ok(def.arena.tileKey, 'local generator should emit a tile key');
  assert.ok(assetKeys.has(def.arena.tileKey), 'arena tileKey must exist in assets[]');
  assert.deepEqual(validateGameDefinitionReferences(def), []);
  return def;
}

function decodeSvgDataUrl(src: string | undefined): string {
  if (typeof src !== 'string' || !src.startsWith('data:image/svg+xml;charset=utf-8,')) {
    assert.fail('expected encoded SVG data URL');
  }
  return decodeURIComponent(src.slice(src.indexOf(',') + 1));
}

function enemyRoles(def: GameDefinition) {
  return def.enemies.map((enemy) => enemy.role);
}

function waveRoles(def: GameDefinition) {
  const roleByEnemyId = new Map(def.enemies.map((enemy) => [enemy.id, enemy.role]));
  return def.waves.map((wave) => roleByEnemyId.get(wave.enemyId));
}

const haunted = assertReferencedAssetsExist('a chaotic haunted crypt roguelite');
const space = assertReferencedAssetsExist('a neon space arena shooter with drone swarms');
assertReferencedAssetsExist('a cozy coastal survivor gathering light');

const firstGameSlice = assertReferencedAssetsExist(FIRST_GAME_VERTICAL_SLICE.prompt);
assert.equal(firstGameSlice.runtimeTemplate, FIRST_GAME_VERTICAL_SLICE.expectedRuntimeTemplate, 'first-game slice should stay on the arena runtime');
assert.equal(firstGameSlice.winCondition, FIRST_GAME_VERTICAL_SLICE.expectedWinCondition, 'first-game slice should stay boss-backed');
assert.equal(firstGameSlice.boss?.name, FIRST_GAME_VERTICAL_SLICE.expectedBoss, 'first-game slice should route to the bakery boss');
assert.equal(firstGameSlice.boss?.patterns[0], FIRST_GAME_VERTICAL_SLICE.expectedLeadPattern, 'first-game slice should lead with the pantry boss charge pattern');
assert.equal(firstGameSlice.boss?.spawnAfterWavesCleared, 2, 'first-game slice should gate the boss behind cleared pantry waves');
assert.equal(firstGameSlice.title, 'Baker Pantry Panic', 'first-game slice should use the authored pantry title');
assert.equal(firstGameSlice.feelProfile, 'arcade-survivor', 'first-game slice should use the melee-friendly arcade profile');
assert.equal(firstGameSlice.arena.worldWidth, 1600, 'first-game slice should use the original-template world width');
assert.equal(firstGameSlice.arena.worldHeight, 1200, 'first-game slice should use the original-template world height');
assert.equal(firstGameSlice.arena.cameraFollow, true, 'first-game slice should use camera-follow world framing');
assert.equal(firstGameSlice.player.weapons[0]?.autoFire, false, 'first-game slice should be melee-first instead of auto-fire');
assert.equal(firstGameSlice.player.movementModel, 'accelerated', 'first-game slice should use original-template acceleration/drag movement');
assert.equal(firstGameSlice.player.acceleration, 1600, 'first-game slice should use original-template acceleration');
assert.equal(firstGameSlice.player.drag, 1200, 'first-game slice should use original-template drag');
assert.equal(firstGameSlice.player.dashMultiplier, 2.6, 'first-game slice should use original-template dash impulse');
assert.equal(firstGameSlice.player.meleeDurationMs, 120, 'first-game slice should use original-template melee duration');
assert.equal(firstGameSlice.player.meleeCooldownMs, 240, 'first-game slice should use original-template melee cooldown');
assert.deepEqual(enemyRoles(firstGameSlice), ['chaser', 'charger', 'brute'], 'first-game slice should use pantry brawler enemy roles');
assert.ok(firstGameSlice.assets.some((asset) => asset.key === 'scene-backdrop'), 'first-game slice should include a literal curated backdrop path');

const survive = assertReferencedAssetsExist('a cozy coastal survivor gathering light');
assert.equal(survive.winCondition, 'survive');
assert.equal(survive.boss, undefined, 'survive variant should not require a boss');
assert.equal(survive.enemies[0]?.name, 'Tide Wisp', 'cozy coastal prompts should route to the coastal theme');

const clearWaves = assertReferencedAssetsExist('a dungeon roguelite clear waves run');
assert.equal(clearWaves.winCondition, 'clear-waves');
assert.equal(clearWaves.boss, undefined, 'clear-waves variant should not require a boss');
assert.equal(clearWaves.feelProfile, 'arcade-survivor', 'neutral clear-wave prompts should select the arcade survivor profile');
assert.deepEqual(enemyRoles(clearWaves), ['chaser', 'sapper', 'shooter'], 'arcade survivor should use chaser/sapper/shooter pressure');
assert.ok(waveRoles(clearWaves).includes('sapper'), 'arcade survivor waves should include sapper area denial');

const scoreAttack = assertReferencedAssetsExist('a neon arcade score challenge');
assert.equal(scoreAttack.winCondition, 'score-target');
assert.equal(typeof scoreAttack.scoreTarget, 'number', 'score-target variant should include scoreTarget');

const relicHunt = assertReferencedAssetsExist('a crystal relic hunt collectathon');
assert.equal(relicHunt.winCondition, 'collect-relics');
assert.equal(typeof relicHunt.relicTarget, 'number', 'collect-relics variant should include relicTarget');
assert.equal(relicHunt.boss, undefined, 'collect-relics variant should not require a boss');

const captureZone = assertReferencedAssetsExist('a neon ritual capture zone control run');
assert.equal(captureZone.winCondition, 'capture-zone');
assert.equal(typeof captureZone.captureTargetSeconds, 'number', 'capture-zone variant should include captureTargetSeconds');
assert.equal(captureZone.boss, undefined, 'capture-zone variant should not require a boss');

const escortRun = assertReferencedAssetsExist('a coastal caravan escort protect companion run');
assert.equal(escortRun.winCondition, 'escort');
assert.equal(typeof escortRun.escortTargetDistance, 'number', 'escort variant should include escortTargetDistance');
assert.equal(typeof escortRun.escortSpriteKey, 'string', 'escort variant should include escortSpriteKey');
assert.equal(escortRun.boss, undefined, 'escort variant should not require a boss');

const defendCore = assertReferencedAssetsExist('a neon reactor core defense run');
assert.equal(defendCore.winCondition, 'defend-core');
assert.equal(typeof defendCore.defendTargetSeconds, 'number', 'defend-core variant should include defendTargetSeconds');
assert.equal(typeof defendCore.defendMaxHealth, 'number', 'defend-core variant should include defendMaxHealth');
assert.equal(typeof defendCore.defendSpriteKey, 'string', 'defend-core variant should include defendSpriteKey');
assert.equal(defendCore.boss, undefined, 'defend-core variant should not require a boss');

const repairNodes = assertReferencedAssetsExist('a neon uplink repair node network run');
assert.equal(repairNodes.winCondition, 'repair-nodes');
assert.equal(typeof repairNodes.repairNodeCount, 'number', 'repair-nodes variant should include repairNodeCount');
assert.equal(typeof repairNodes.repairSecondsPerNode, 'number', 'repair-nodes variant should include repairSecondsPerNode');
assert.equal(repairNodes.boss, undefined, 'repair-nodes variant should not require a boss');

const extractRun = assertReferencedAssetsExist('a neon extraction escape portal run');
assert.equal(extractRun.winCondition, 'extract');
assert.equal(typeof extractRun.extractHoldSeconds, 'number', 'extract variant should include extractHoldSeconds');
assert.equal(extractRun.boss, undefined, 'extract variant should not require a boss');
assert.equal(extractRun.feelProfile, 'siege-defense', 'extract prompts should select a pressure-oriented profile');

const rescueRun = assertReferencedAssetsExist('a neon rescue stranded survivor extraction run');
assert.equal(rescueRun.winCondition, 'rescue');
assert.equal(typeof rescueRun.rescueHoldSeconds, 'number', 'rescue variant should include rescueHoldSeconds');
assert.equal(typeof rescueRun.rescueExtractSeconds, 'number', 'rescue variant should include rescueExtractSeconds');
assert.equal(typeof rescueRun.rescueSpriteKey, 'string', 'rescue variant should include rescueSpriteKey');
assert.equal(rescueRun.boss, undefined, 'rescue variant should not require a boss');
assert.equal(rescueRun.feelProfile, 'siege-defense', 'rescue prompts should select a pressure-oriented profile');

const unlockRun = assertReferencedAssetsExist('a neon vault keycard unlock escape run');
assert.equal(unlockRun.winCondition, 'unlock-gate');
assert.equal(typeof unlockRun.unlockKeyTarget, 'number', 'unlock-gate variant should include unlockKeyTarget');
assert.equal(typeof unlockRun.unlockHoldSeconds, 'number', 'unlock-gate variant should include unlockHoldSeconds');
assert.equal(unlockRun.boss, undefined, 'unlock-gate variant should not require a boss');
assert.equal(unlockRun.feelProfile, 'score-chaser', 'unlock-gate prompts should select a route-oriented score-chaser profile');

const bossRaid = assertReferencedAssetsExist('a haunted boss raid horror');
assert.equal(bossRaid.winCondition, 'defeat-boss');
assert.ok(bossRaid.boss, 'defeat-boss variant should include a boss');
assert.equal(bossRaid.feelProfile, 'bullet-hell-raid', 'boss raid prompts should select the raid feel profile');
assert.equal(bossRaid.playStyle.camera, 'dramatic', 'boss raid prompts should select dramatic camera feel');

const beamBoss = assertReferencedAssetsExist('a neon laser beam boss raid');
assert.equal(beamBoss.winCondition, 'defeat-boss');
assert.equal(beamBoss.feelProfile, 'bullet-hell-raid', 'beam boss prompt should select bullet-hell raid profile');
assert.equal(beamBoss.boss?.patterns[0], 'beam', 'beam boss prompt should lead with beam pattern');
assert.ok(beamBoss.boss?.patterns.includes('spiral-shot'), 'beam boss prompt should keep projectile pattern variety');
assert.equal(beamBoss.playStyle.weaponCadence, 'bullet-hell', 'neon beam boss prompt should select high-cadence weapons');
assert.equal(beamBoss.playStyle.readability, 'high-contrast', 'neon beam boss prompt should select high-contrast readability');
assert.deepEqual(enemyRoles(beamBoss), ['shooter', 'orbiter', 'sniper'], 'bullet-hell raid should use a ranged/crossfire enemy kit');
assert.equal(beamBoss.waves.length, 5, 'bullet-hell raid should use a longer pressure wave plan');
assert.ok(waveRoles(beamBoss).includes('orbiter'), 'bullet-hell raid waves should include orbiting crossfire pressure');
assert.ok(waveRoles(beamBoss).includes('sniper'), 'bullet-hell raid waves should include long-range sniper pressure');

const laserGridBoss = assertReferencedAssetsExist('a neon laser grid security boss raid');
assert.equal(laserGridBoss.winCondition, 'defeat-boss');
assert.equal(laserGridBoss.feelProfile, 'bullet-hell-raid', 'laser-grid boss prompt should select bullet-hell raid profile');
assert.equal(laserGridBoss.boss?.name, 'Lattice Overlord', 'laser-grid prompts should route to the security-grid boss theme');
assert.equal(laserGridBoss.boss?.patterns[0], 'laser-grid', 'laser-grid prompt should lead with laser-grid pattern');
assert.ok(laserGridBoss.boss?.patterns.includes('beam'), 'laser-grid prompt should keep beam pattern variety');
assert.equal(laserGridBoss.enemies[0]?.name, 'Grid Drone', 'laser-grid prompts should route to security-grid enemies');
assert.deepEqual(enemyRoles(laserGridBoss), ['shooter', 'orbiter', 'sniper'], 'laser-grid raid should use a ranged/crossfire enemy kit');

const chargeBoss = assertReferencedAssetsExist('a charging bull boss raid');
assert.equal(chargeBoss.winCondition, 'defeat-boss');
assert.equal(chargeBoss.boss?.patterns[0], 'charge', 'charging boss prompt should lead with charge pattern');
assert.ok(chargeBoss.boss?.patterns.includes('radial-burst'), 'charging boss prompt should keep area pattern variety');
const coastalChargeBoss = assertReferencedAssetsExist('a coastal charging beast boss raid');
assert.equal(coastalChargeBoss.winCondition, 'defeat-boss');
assert.equal(coastalChargeBoss.boss?.patterns[0], 'charge', 'coastal charging boss prompt should lead with charge pattern');

const summonBoss = assertReferencedAssetsExist('a portal swarm summoner boss raid');
assert.equal(summonBoss.winCondition, 'defeat-boss');
assert.equal(summonBoss.feelProfile, 'bullet-hell-raid', 'summoner boss prompt should select bullet-hell raid profile');
assert.equal(summonBoss.boss?.patterns[0], 'summon', 'summoner boss prompt should lead with summon pattern');
assert.ok(summonBoss.boss?.patterns.includes('spiral-shot'), 'summoner boss prompt should keep projectile pattern variety');
assert.equal(summonBoss.playStyle.pressure, 'intense', 'swarm raid prompt should select intense pressure');
const bakerySummonBoss = assertReferencedAssetsExist('a bakery portal swarm summoner boss raid');
assert.equal(bakerySummonBoss.winCondition, 'defeat-boss');
assert.equal(bakerySummonBoss.boss?.patterns[0], 'summon', 'bakery summoner boss prompt should lead with summon pattern');

const minefieldBoss = assertReferencedAssetsExist('a neon minefield trap boss raid');
assert.equal(minefieldBoss.winCondition, 'defeat-boss');
assert.equal(minefieldBoss.boss?.patterns[0], 'minefield', 'minefield boss prompt should lead with minefield pattern');
assert.ok(minefieldBoss.boss?.patterns.includes('radial-burst'), 'minefield boss prompt should keep projectile pattern variety');

const vortexBoss = assertReferencedAssetsExist('a gravity vortex singularity boss raid');
assert.equal(vortexBoss.winCondition, 'defeat-boss');
assert.equal(vortexBoss.boss?.patterns[0], 'vortex', 'vortex boss prompt should lead with vortex pattern');
assert.ok(vortexBoss.boss?.patterns.includes('spiral-shot'), 'vortex boss prompt should keep projectile pattern variety');

const shockwaveBoss = assertReferencedAssetsExist('a seismic shockwave stomp boss raid');
assert.equal(shockwaveBoss.winCondition, 'defeat-boss');
assert.equal(shockwaveBoss.boss?.name, 'Fault Titan', 'shockwave prompts should route to the seismic boss theme');
assert.notEqual(shockwaveBoss.boss?.name, 'Harbor Maw', 'shockwave should not match the coastal wave theme by substring');
assert.equal(shockwaveBoss.boss?.patterns[0], 'shockwave', 'shockwave boss prompt should lead with shockwave pattern');
assert.ok(shockwaveBoss.boss?.patterns.includes('radial-burst'), 'shockwave boss prompt should keep projectile pattern variety');

const flightRun = assertReferencedAssetsExist('a fast airplane shooter with storm clouds, enemy fighters, and a zeppelin boss');
assert.equal(flightRun.runtimeTemplate, 'flight-shooter', 'airplane prompts should select the flight-shooter runtime template');
assert.equal(flightRun.genre, 'flight-shooter', 'flight-shooter template should label the generated genre');
assert.equal(flightRun.winCondition, 'defeat-boss', 'flight boss prompts should still produce boss-backed games');
assert.equal(flightRun.feelProfile, 'bullet-hell-raid', 'flight boss prompts should select the raid profile');
assert.ok(flightRun.controls.some((control) => control.includes('flight template')), 'flight template should be visible in generated controls');
assert.deepEqual(enemyRoles(flightRun), ['shooter', 'orbiter', 'sniper'], 'flight boss prompts should use ranged side-scroller pressure roles');

const platformRun = assertReferencedAssetsExist('a castle platformer jump quest with ledge monsters and a clockwork boss');
assert.equal(platformRun.runtimeTemplate, 'platformer', 'platform/jump prompts should select the platformer runtime template');
assert.equal(platformRun.genre, 'platformer', 'platformer template should label the generated genre');
assert.equal(platformRun.winCondition, 'defeat-boss', 'platformer boss prompts should still produce boss-backed games');
assert.ok(platformRun.controls.some((control) => control.includes('platformer template')), 'platformer template should be visible in generated controls');
assert.equal(platformRun.boss?.name, 'Clockwork Colossus', 'platformer prompts should route to the platformer boss theme');

const puzzleRun = assertReferencedAssetsExist('a crystal temple puzzle where an archivist pushes mirrors onto switches and opens a moon gate');
assert.equal(puzzleRun.runtimeTemplate, 'puzzle-room', 'puzzle/switch prompts should select the puzzle-room runtime template');
assert.equal(puzzleRun.genre, 'puzzle-room', 'puzzle-room template should label the generated genre');
assert.equal(puzzleRun.winCondition, 'solve-puzzle', 'puzzle-room prompts should use solve-puzzle win condition');
assert.ok(puzzleRun.puzzleRoom, 'puzzle-room prompts should include bounded puzzleRoom data');
assert.ok(puzzleRun.controls.some((control) => control.includes('puzzle-room template')), 'puzzle-room template should be visible in generated controls');
assert.equal(puzzleRun.boss, undefined, 'puzzle-room variant should not require a boss');
assert.equal(puzzleRun.puzzleRoom?.blocks.length, 1, 'puzzle-room should include a pushable block');
assert.equal(puzzleRun.puzzleRoom?.switches.length, 1, 'puzzle-room should include a switch');
assert.ok((puzzleRun.puzzleRoom?.gems.length ?? 0) >= 1, 'puzzle-room should include collectible gems');
assert.ok((puzzleRun.puzzleRoom?.moveLimit ?? 0) > 0, 'puzzle-room should include a move limit');

const decisionRoomRun = assertReferencedAssetsExist('a boardroom decision app for a product launch with stakeholders evidence options recommendation and audit trail');
assert.equal(decisionRoomRun.runtimeTemplate, 'decision-room', 'boardroom/decision prompts should select the decision-room runtime template');
assert.equal(decisionRoomRun.genre, 'decision-room', 'decision-room template should label the generated genre');
assert.equal(decisionRoomRun.winCondition, 'select-decision', 'decision-room prompts should use select-decision win condition');
assert.ok(decisionRoomRun.decisionRoom, 'decision-room prompts should include bounded decisionRoom data');
assert.ok(decisionRoomRun.controls.some((control) => control.includes('decision-room template')), 'decision-room template should be visible in generated controls');
assert.equal(decisionRoomRun.boss, undefined, 'decision-room variant should not require a boss');
assert.ok((decisionRoomRun.decisionRoom?.stakeholders.length ?? 0) >= 3, 'decision-room should include stakeholders');
assert.ok((decisionRoomRun.decisionRoom?.evidence.length ?? 0) >= 3, 'decision-room should include evidence');
assert.ok((decisionRoomRun.decisionRoom?.options.length ?? 0) >= 2, 'decision-room should include options');
assert.ok(decisionRoomRun.decisionRoom?.decisionGate.recommendedOptionId, 'decision-room should include a recommendation gate');

const agentDashboardRun = assertReferencedAssetsExist('an agent operations dashboard for shipping a Vercel game app with queues approvals logs and deployment health');
assert.equal(agentDashboardRun.runtimeTemplate, 'agent-dashboard', 'agent/ops prompts should select the agent-dashboard runtime template');
assert.equal(agentDashboardRun.genre, 'agent-dashboard', 'agent-dashboard template should label the generated genre');
assert.equal(agentDashboardRun.winCondition, 'approve-deploy', 'agent-dashboard prompts should use approve-deploy win condition');
assert.ok(agentDashboardRun.agentDashboard, 'agent-dashboard prompts should include bounded agentDashboard data');
assert.ok(agentDashboardRun.controls.some((control) => control.includes('agent-dashboard template')), 'agent-dashboard template should be visible in generated controls');
assert.equal(agentDashboardRun.boss, undefined, 'agent-dashboard variant should not require a boss');
assert.ok((agentDashboardRun.agentDashboard?.agents.length ?? 0) >= 3, 'agent-dashboard should include agent roster data');
assert.ok((agentDashboardRun.agentDashboard?.tasks.length ?? 0) >= 3, 'agent-dashboard should include task queue data');
assert.ok((agentDashboardRun.agentDashboard?.approvals.length ?? 0) >= 1, 'agent-dashboard should include approval gates');
assert.ok((agentDashboardRun.agentDashboard?.logs.length ?? 0) >= 3, 'agent-dashboard should include audit logs');

const cozyStyle = assertReferencedAssetsExist('a cozy meadow survivor gathering light');
assert.equal(cozyStyle.feelProfile, 'cozy-explorer', 'cozy prompts should select cozy explorer profile');
assert.equal(cozyStyle.playStyle.pressure, 'relaxed', 'cozy prompts should select relaxed pressure');
assert.equal(cozyStyle.playStyle.camera, 'steady', 'cozy prompts should select steady camera feel');
assert.deepEqual(enemyRoles(cozyStyle), ['wanderer', 'chaser', 'orbiter'], 'cozy explorer should use gentler roaming enemy pressure');
assert.equal(cozyStyle.waves[0]?.atSeconds, 1, 'cozy explorer should still show early room pressure');
assert.ok((cozyStyle.waves[1]?.atSeconds ?? 0) > 20, 'cozy explorer should space out later pressure waves');

assert.equal(defendCore.feelProfile, 'siege-defense', 'defend-core prompts should select siege defense profile');
assert.equal(repairNodes.feelProfile, 'siege-defense', 'repair-node prompts should select siege defense profile');
assert.equal(scoreAttack.feelProfile, 'score-chaser', 'score prompts should select score chaser profile');
assert.deepEqual(enemyRoles(defendCore), ['brute', 'guardian', 'support'], 'siege defense should use shielded support-backed breach pressure');
assert.equal(defendCore.waves.length, 5, 'siege defense should use a sustained wave plan');
assert.ok(waveRoles(defendCore).includes('brute'), 'siege defense waves should include brute breach pressure');
assert.ok(waveRoles(defendCore).includes('guardian'), 'siege defense waves should include guardian shield pressure');
assert.ok(waveRoles(defendCore).includes('support'), 'siege defense waves should include support sustain pressure');
assert.deepEqual(enemyRoles(scoreAttack), ['charger', 'sentinel', 'sniper'], 'score chaser should use fast score-lane enemies with lane-lock pressure');
assert.equal(scoreAttack.waves.length, 5, 'score chaser should use a denser scoring wave plan');
assert.ok(waveRoles(scoreAttack).includes('sentinel'), 'score chaser should include a sentinel lane-lock wave');
assert.ok(waveRoles(scoreAttack).includes('sniper'), 'score chaser should include a ranged denial wave');

const legacyWithoutPlayStyle = { ...haunted } as Record<string, unknown>;
delete legacyWithoutPlayStyle['playStyle'];
delete legacyWithoutPlayStyle['feelProfile'];
delete legacyWithoutPlayStyle['runtimeTemplate'];
const legacyParsed = parseGameDefinition(legacyWithoutPlayStyle);
assert.equal(legacyParsed.ok, true, 'legacy definitions without playStyle/feelProfile/runtimeTemplate should parse with defaults');
if (legacyParsed.ok) {
  assert.equal(legacyParsed.definition.feelProfile, 'arcade-survivor', 'legacy feelProfile should default');
  assert.equal(legacyParsed.definition.runtimeTemplate, 'arena-action', 'legacy runtimeTemplate should default');
  assert.equal(legacyParsed.definition.playStyle.pressure, 'standard', 'legacy playStyle pressure should default');
  assert.equal(legacyParsed.definition.playStyle.weaponCadence, 'steady', 'legacy playStyle cadence should default');
  assert.equal(legacyParsed.definition.player.movementModel, 'direct', 'legacy player movement model should default');
  assert.equal(legacyParsed.definition.arena.cameraFollow, false, 'legacy cameraFollow should default');
}

const withSourceAsset = {
  ...haunted,
  assets: haunted.assets.map((asset, index) => (
    index === 0 ? { ...asset, src: 'runtime:sprites/hero.png' } : asset
  )),
};
const parsed = parseGameDefinition(withSourceAsset);
assert.equal(parsed.ok, true, 'asset src should be accepted for runtime-bound generated images');

const sourced = attachLocalAssetSources(haunted);
assert.equal(sourced.assets.every((asset) => typeof asset.src === 'string' && asset.src.length > 0), true);
assert.equal(
  sourced.assets.find((asset) => asset.key === haunted.player.spriteKey)?.src?.startsWith('data:image/svg+xml'),
  true,
  'player source should be a loadable SVG data URL',
);
assert.equal(
  haunted.assets.find((asset) => asset.key === haunted.player.spriteKey)?.spriteSheet?.frames,
  8,
  'local player source should declare an eight-frame state sprite sheet',
);
assert.equal(
  haunted.assets.find((asset) => asset.key === haunted.player.spriteKey)?.spriteSheet?.animations?.some((animation) => animation.name === 'boss-telegraph'),
  true,
  'local actor sheets should carry named state animation clips',
);
const hauntedPlayerSvg = decodeSvgDataUrl(sourced.assets.find((asset) => asset.key === haunted.player.spriteKey)?.src);
const hauntedPlayerFrameWidth = haunted.assets.find((asset) => asset.key === haunted.player.spriteKey)?.spriteSheet?.frameWidth;
assert.match(hauntedPlayerSvg, /data-local-asset="spritesheet"/, 'player source should be an authored local sprite sheet SVG');
assert.match(hauntedPlayerSvg, /data-mood="haunted"/, 'player source should reflect prompt mood');
assert.match(hauntedPlayerSvg, /data-variant="player"/, 'player source should preserve role variant');
assert.match(hauntedPlayerSvg, /data-frames="8"/, 'player source should expose frame count');
assert.match(hauntedPlayerSvg, new RegExp(`data-frame-width="${hauntedPlayerFrameWidth}"`), 'player source should expose frame width');
assert.match(hauntedPlayerSvg, /data-animations="idle,move,attack,fire,dash,hurt,telegraph,execute,contested,boss-idle,boss-telegraph,boss-execute,escort-move,escort-contested,defend-idle,defend-contested"/, 'player source should expose named animation clips');
assert.match(hauntedPlayerSvg, /data-pose="attack"/, 'player source should include authored attack pose frames');
assert.match(hauntedPlayerSvg, /data-pose="telegraph"/, 'player source should include authored telegraph pose frames');
assert.match(hauntedPlayerSvg, /<defs>/, 'local sprite source should include paint definitions');
assert.match(hauntedPlayerSvg, /radialGradient id="body"/, 'local sprite source should use shaded body gradients');

const spaceSourced = attachLocalAssetSources(space);
const spaceFloorSvg = decodeSvgDataUrl(spaceSourced.assets.find((asset) => asset.key === space.arena.tileKey)?.src);
assert.match(spaceFloorSvg, /data-local-asset="tile"/, 'floor source should be an authored local tile SVG');
assert.match(spaceFloorSvg, /data-mood="space"/, 'floor source should reflect prompt mood');
assert.match(spaceFloorSvg, /linearGradient id="floorShade"/, 'floor source should include shaded tile paint');
assert.match(spaceFloorSvg, /radialGradient id="floorWear"/, 'floor source should include subtle floor wear');

const sniperAsset = beamBoss.assets.find((asset) => beamBoss.enemies.find((enemy) => enemy.role === 'sniper')?.spriteKey === asset.key);
const sniperSourced = attachLocalAssetSources(beamBoss);
const sniperSvg = decodeSvgDataUrl(sniperSourced.assets.find((asset) => asset.key === sniperAsset?.key)?.src);
assert.match(sniperSvg, /data-local-asset="spritesheet"/, 'sniper source should be an authored local sprite sheet SVG');
assert.match(sniperSvg, /data-variant="sniper"/, 'sniper source should preserve role variant');
assert.match(sniperSvg, /data-local-detail="sniper"/, 'sniper source should use a role-specific silhouette');

const sapperAsset = clearWaves.assets.find((asset) => clearWaves.enemies.find((enemy) => enemy.role === 'sapper')?.spriteKey === asset.key);
const sapperSourced = attachLocalAssetSources(clearWaves);
const sapperSvg = decodeSvgDataUrl(sapperSourced.assets.find((asset) => asset.key === sapperAsset?.key)?.src);
assert.match(sapperSvg, /data-local-asset="spritesheet"/, 'sapper source should be an authored local sprite sheet SVG');
assert.match(sapperSvg, /data-variant="sapper"/, 'sapper source should preserve role variant');
assert.match(sapperSvg, /data-local-detail="sapper"/, 'sapper source should use a role-specific silhouette');

const supportAsset = defendCore.assets.find((asset) => defendCore.enemies.find((enemy) => enemy.role === 'support')?.spriteKey === asset.key);
const supportSourced = attachLocalAssetSources(defendCore);
const supportSvg = decodeSvgDataUrl(supportSourced.assets.find((asset) => asset.key === supportAsset?.key)?.src);
assert.match(supportSvg, /data-local-asset="spritesheet"/, 'support source should be an authored local sprite sheet SVG');
assert.match(supportSvg, /data-variant="support"/, 'support source should preserve role variant');
assert.match(supportSvg, /data-local-detail="support"/, 'support source should use a role-specific silhouette');

const guardianAsset = defendCore.assets.find((asset) => defendCore.enemies.find((enemy) => enemy.role === 'guardian')?.spriteKey === asset.key);
const guardianSvg = decodeSvgDataUrl(supportSourced.assets.find((asset) => asset.key === guardianAsset?.key)?.src);
assert.match(guardianSvg, /data-local-asset="spritesheet"/, 'guardian source should be an authored local sprite sheet SVG');
assert.match(guardianSvg, /data-variant="guardian"/, 'guardian source should preserve role variant');
assert.match(guardianSvg, /data-local-detail="guardian"/, 'guardian source should use a role-specific silhouette');

const sentinelAsset = scoreAttack.assets.find((asset) => scoreAttack.enemies.find((enemy) => enemy.role === 'sentinel')?.spriteKey === asset.key);
const scoreSourced = attachLocalAssetSources(scoreAttack);
const sentinelSvg = decodeSvgDataUrl(scoreSourced.assets.find((asset) => asset.key === sentinelAsset?.key)?.src);
assert.match(sentinelSvg, /data-local-asset="spritesheet"/, 'sentinel source should be an authored local sprite sheet SVG');
assert.match(sentinelSvg, /data-variant="sentinel"/, 'sentinel source should preserve role variant');
assert.match(sentinelSvg, /data-local-detail="sentinel"/, 'sentinel source should use a role-specific silhouette');

const flightSourced = attachLocalAssetSources(flightRun);
const flightHeroSvg = decodeSvgDataUrl(flightSourced.assets.find((asset) => asset.key === flightRun.player.spriteKey)?.src);
assert.match(flightHeroSvg, /data-local-asset="spritesheet"/, 'flight player source should be an authored local sprite sheet SVG');
assert.match(flightHeroSvg, /data-mood="sky"/, 'flight player source should reflect sky mood');
assert.match(flightHeroSvg, /data-variant="flight-player"/, 'flight player source should preserve aircraft variant');
assert.match(flightHeroSvg, /data-local-detail="flight-player"/, 'flight player source should use an aircraft silhouette');
const flightEnemyKey = flightRun.enemies[0]?.spriteKey;
const flightEnemySvg = decodeSvgDataUrl(flightSourced.assets.find((asset) => asset.key === flightEnemyKey)?.src);
assert.match(flightEnemySvg, /data-variant="flight-shooter"/, 'flight shooter enemy source should preserve aircraft role variant');
assert.match(flightEnemySvg, /data-local-detail="flight-shooter"/, 'flight shooter enemy source should use an aircraft silhouette');
const flightFloorSvg = decodeSvgDataUrl(flightSourced.assets.find((asset) => asset.key === flightRun.arena.tileKey)?.src);
assert.match(flightFloorSvg, /data-local-asset="tile"/, 'flight floor source should be an authored local tile SVG');
assert.match(flightFloorSvg, /data-mood="sky"/, 'flight floor source should reflect sky mood');
assert.equal(
  flightSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/storm-zeppelin-flight.png',
  'flight shooter backdrop should use the curated storm zeppelin bitmap background',
);
assert.equal(
  flightSourced.assets.find((asset) => asset.key === 'flight-foreground')?.src,
  'runtime:forge/curated/sprite/storm-zeppelin-flight-foreground.png',
  'flight visual proof should include the curated foreground aircraft overlay',
);

const platformSourced = attachLocalAssetSources(platformRun);
const platformHeroSvg = decodeSvgDataUrl(platformSourced.assets.find((asset) => asset.key === platformRun.player.spriteKey)?.src);
assert.match(platformHeroSvg, /data-local-asset="spritesheet"/, 'platformer player source should be an authored local sprite sheet SVG');
assert.match(platformHeroSvg, /data-mood="platform"/, 'platformer player source should reflect platform mood');
assert.match(platformHeroSvg, /data-variant="platform-player"/, 'platformer player source should preserve side-view hero variant');
assert.match(platformHeroSvg, /data-local-detail="platform-player"/, 'platformer player source should use a side-view silhouette');
const platformEnemyKey = platformRun.enemies[0]?.spriteKey;
const platformEnemySvg = decodeSvgDataUrl(platformSourced.assets.find((asset) => asset.key === platformEnemyKey)?.src);
assert.match(platformEnemySvg, /data-variant="platform-[a-z-]+"/, 'platformer enemy source should preserve platform role variant');
assert.match(platformEnemySvg, /data-local-detail="platform-[a-z-]+"/, 'platformer enemy source should use a side-view silhouette');
const platformFloorSvg = decodeSvgDataUrl(platformSourced.assets.find((asset) => asset.key === platformRun.arena.tileKey)?.src);
assert.match(platformFloorSvg, /data-local-asset="tile"/, 'platformer floor source should be an authored local tile SVG');
assert.match(platformFloorSvg, /data-mood="platform"/, 'platformer floor source should reflect platform mood');
assert.equal(
  platformSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/castle-platformer.png',
  'platformer backdrop should use the curated bitmap background',
);
assert.equal(
  platformSourced.assets.find((asset) => asset.key === 'platformer-foreground')?.src,
  'runtime:forge/curated/sprite/castle-platformer-foreground.png',
  'platformer visual proof should include the curated foreground actor overlay',
);

const shockwaveBossSourced = attachLocalAssetSources(shockwaveBoss);
assert.equal(
  shockwaveBossSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/seismic-shockwave-arena.png',
  'shockwave boss backdrop should use the curated seismic bitmap background',
);
assert.equal(
  shockwaveBossSourced.assets.find((asset) => asset.key === 'shockwave-foreground')?.src,
  'runtime:forge/curated/sprite/seismic-shockwave-foreground.png',
  'shockwave visual proof should include the curated shockwave foreground overlay',
);

const coastalChargeBossSourced = attachLocalAssetSources(coastalChargeBoss);
assert.equal(
  coastalChargeBossSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/coastal-beast-arena.png',
  'coastal charging boss backdrop should use the curated bitmap background',
);
assert.equal(
  coastalChargeBossSourced.assets.find((asset) => asset.key === 'coastal-charge-foreground')?.src,
  'runtime:forge/curated/sprite/coastal-beast-charge-foreground.png',
  'coastal charging boss visual proof should include the curated foreground telegraph overlay',
);

const hauntedBossSourced = attachLocalAssetSources(bossRaid);
assert.equal(
  hauntedBossSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/haunted-boss-arena.png',
  'haunted boss backdrop should use the curated bitmap background',
);

const bakerySummonBossSourced = attachLocalAssetSources(bakerySummonBoss);
assert.equal(
  bakerySummonBossSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/bakery-portal-arena.png',
  'bakery portal summoner backdrop should use the curated bitmap background',
);

const puzzleSourced = attachLocalAssetSources(puzzleRun);
const puzzleHeroSvg = decodeSvgDataUrl(puzzleSourced.assets.find((asset) => asset.key === puzzleRun.player.spriteKey)?.src);
assert.match(puzzleHeroSvg, /data-local-asset="spritesheet"/, 'puzzle-room player source should be an authored local sprite sheet SVG');
assert.match(puzzleHeroSvg, /data-mood="security"/, 'puzzle-room player source should use grid/security mood');
assert.match(puzzleHeroSvg, /data-variant="player"/, 'puzzle-room player source should preserve top-down hero variant');
const puzzleFloorSvg = decodeSvgDataUrl(puzzleSourced.assets.find((asset) => asset.key === puzzleRun.arena.tileKey)?.src);
assert.match(puzzleFloorSvg, /data-local-asset="tile"/, 'puzzle-room floor source should be an authored local tile SVG');
assert.match(puzzleFloorSvg, /data-mood="security"/, 'puzzle-room floor source should use grid/security mood');
assert.equal(
  puzzleSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/crystal-temple-puzzle.png',
  'puzzle-room backdrop should use the curated bitmap background',
);

const decisionRoomSourced = attachLocalAssetSources(decisionRoomRun);
const decisionRoomHeroSvg = decodeSvgDataUrl(decisionRoomSourced.assets.find((asset) => asset.key === decisionRoomRun.player.spriteKey)?.src);
assert.match(decisionRoomHeroSvg, /data-local-asset="spritesheet"/, 'decision-room player source should be an authored local sprite sheet SVG');
assert.match(decisionRoomHeroSvg, /data-mood="security"/, 'decision-room player source should use boardroom/security mood');
assert.match(decisionRoomHeroSvg, /data-variant="support"/, 'decision-room player source should preserve facilitator avatar variant');
const decisionRoomFloorSvg = decodeSvgDataUrl(decisionRoomSourced.assets.find((asset) => asset.key === decisionRoomRun.arena.tileKey)?.src);
assert.match(decisionRoomFloorSvg, /data-local-asset="tile"/, 'decision-room floor source should be an authored local tile SVG');
assert.match(decisionRoomFloorSvg, /data-mood="security"/, 'decision-room floor source should use boardroom/security mood');

const agentDashboardSourced = attachLocalAssetSources(agentDashboardRun);
const agentDashboardHeroSvg = decodeSvgDataUrl(agentDashboardSourced.assets.find((asset) => asset.key === agentDashboardRun.player.spriteKey)?.src);
assert.match(agentDashboardHeroSvg, /data-local-asset="spritesheet"/, 'agent-dashboard player source should be an authored local sprite sheet SVG');
assert.match(agentDashboardHeroSvg, /data-mood="security"/, 'agent-dashboard player source should use operations/security mood');
assert.match(agentDashboardHeroSvg, /data-variant="support"/, 'agent-dashboard player source should preserve operations avatar variant');
const agentDashboardFloorSvg = decodeSvgDataUrl(agentDashboardSourced.assets.find((asset) => asset.key === agentDashboardRun.arena.tileKey)?.src);
assert.match(agentDashboardFloorSvg, /data-local-asset="tile"/, 'agent-dashboard floor source should be an authored local tile SVG');
assert.match(agentDashboardFloorSvg, /data-mood="security"/, 'agent-dashboard floor source should use operations/security mood');

const escortSourced = attachLocalAssetSources(escortRun);
const surviveSourced = attachLocalAssetSources(survive);
assert.equal(
  surviveSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/coastal-survivor-escort.png',
  'coastal survivor backdrop should use the curated bitmap background',
);
assert.equal(
  escortSourced.assets.find((asset) => asset.kind === 'background')?.src,
  'runtime:forge/curated/background/coastal-survivor-escort.png',
  'coastal escort backdrop should use the curated bitmap background',
);
assert.equal(
  escortSourced.assets.find((asset) => asset.key === escortRun.escortSpriteKey)?.src,
  'runtime:forge/curated/sprite/coastal-caravan-escort-sheet.png',
  'coastal escort companion should use the curated bitmap sprite sheet',
);

const rescueSourced = attachLocalAssetSources(rescueRun);
const rescueSvg = decodeSvgDataUrl(rescueSourced.assets.find((asset) => asset.key === rescueRun.rescueSpriteKey)?.src);
assert.match(rescueSvg, /data-local-asset="spritesheet"/, 'rescue survivor source should be an authored local sprite sheet SVG');
assert.match(rescueSvg, /data-variant="rescue"/, 'rescue survivor source should preserve objective variant');
assert.match(rescueSvg, /data-local-detail="rescue"/, 'rescue survivor source should use an objective-specific silhouette');

const defendSourced = attachLocalAssetSources(defendCore);
const defendCoreSvg = decodeSvgDataUrl(defendSourced.assets.find((asset) => asset.key === defendCore.defendSpriteKey)?.src);
assert.match(defendCoreSvg, /data-local-asset="spritesheet"/, 'defend core source should be an authored local sprite sheet SVG');
assert.match(defendCoreSvg, /data-variant="defend-core"/, 'defend core source should preserve objective variant');
assert.match(defendCoreSvg, /data-local-detail="defend-core"/, 'defend core source should use an objective-specific silhouette');

const preserved = attachLocalAssetSources(parsed.ok ? parsed.definition : haunted);
assert.equal(
  preserved.assets.find((asset) => asset.key === haunted.assets[0]?.key)?.src,
  'runtime:sprites/hero.png',
  'existing runtime src should be preserved',
);

console.log('local-generator.test.ts - all assertions passed');
