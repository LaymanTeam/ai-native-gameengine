#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const cwd = process.cwd();
const port = Number(process.env.PORT ?? process.env.PUBLIC_DEMO_PORT ?? '3027');
const baseUrl = process.env.PUBLIC_DEMO_BASE_URL ?? `http://localhost:${port}`;
const timeoutMs = Number(process.env.PUBLIC_DEMO_TIMEOUT_MS ?? '45000');
const screenshotDir = process.env.PUBLIC_DEMO_SCREENSHOT_DIR ?? '';
const firstGame = JSON.parse(readFileSync(path.join(cwd, 'engine/runtime/first-game.json'), 'utf8'));
const prompt = process.env.PUBLIC_DEMO_PROMPT ?? firstGame.prompt;
const logPrefix = '[forge-public-demo-smoke]';

function log(message) {
  console.log(`${logPrefix} ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function serverIsUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await serverIsUp(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function spawnDevServer() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npm, ['run', 'dev', '--', '-p', String(port)], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    if (/ready|local:/i.test(text)) process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function chromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function demoUrl(extraParams = {}) {
  const url = new URL('/forge', baseUrl);
  url.searchParams.set('play', '');
  url.searchParams.set('prompt', prompt);
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function publicDemoUrl() {
  return new URL('/demo', baseUrl).toString();
}

async function waitForGameApi(page) {
  await page.waitForSelector('canvas', { timeout: timeoutMs });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__?.getState), null, { timeout: timeoutMs });
}

async function getState(page) {
  return page.evaluate(() => window.__GAME_TEST__?.getState?.() ?? null);
}

function trackForbiddenCalls(page, calls) {
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/forge/definition') || url.pathname.startsWith('/api/forge/generate')) {
      calls.push(url.pathname);
    }
    if (/generativelanguage\.googleapis\.com|openrouter\.ai/i.test(url.hostname)) {
      calls.push(url.hostname);
    }
  });
}

async function main() {
  let devServer = null;
  const rootUrl = new URL('/', baseUrl).toString();
  if (!(await serverIsUp(rootUrl))) {
    log(`starting dev server on ${port}`);
    devServer = spawnDevServer();
    if (!(await waitForServer(rootUrl, timeoutMs))) {
      throw new Error(`dev server did not become ready at ${baseUrl}`);
    }
  } else {
    log(`using existing dev server at ${baseUrl}`);
  }

  const launchOptions = { headless: true };
  const executablePath = chromePath();
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const forbiddenCalls = [];
    trackForbiddenCalls(page, forbiddenCalls);

    log('loading public /demo route');
    await page.goto(publicDemoUrl(), { waitUntil: 'networkidle', timeout: timeoutMs });
    await waitForGameApi(page);
    await page.waitForTimeout(1200);

    const titleState = await getState(page);
    const bodyText = await page.locator('body').innerText();
    assert(new URL(page.url()).pathname === '/forge', `public /demo should redirect to /forge, got ${page.url()}`);
    assert(new URL(page.url()).searchParams.has('play'), `public /demo should preserve play mode, got ${page.url()}`);
    assert(bodyText.includes('Baker Pantry Panic'), 'public demo shell does not name Baker Pantry Panic');
    assert(bodyText.includes('Enter / Space start'), 'public demo shell does not show start instruction');
    assert(!bodyText.includes('Generate & play'), 'public demo should not expose generation controls');
    assert(titleState?.scene === 'title', `public demo should wait on title screen, got ${titleState?.scene}`);
    assert(forbiddenCalls.length === 0, `public demo made model/API calls before start: ${forbiddenCalls.join(', ')}`);

    await page.evaluate(() => window.__GAME_TEST__?.press?.('start'));
    await page.waitForTimeout(2800);
    const playState = await getState(page);
    assert(playState?.scene === 'play', `started demo should be in play scene, got ${playState?.scene}`);
    assert(playState.runtimeTemplate === 'arena-action', `unexpected runtime template ${playState.runtimeTemplate}`);
    assert(playState.winCondition === 'defeat-boss', `unexpected win condition ${playState.winCondition}`);
    assert(playState.weaponAutoFire === false, 'Pantry demo should be manual melee, not auto-fire');
    assert(playState.worldWidth === 1600 && playState.worldHeight === 1200, `Pantry demo should use navigable bakery world, got ${playState.worldWidth}x${playState.worldHeight}`);
    assert(playState.cameraFollow === true, 'Pantry demo should use camera-follow navigation');
    assert(
      playState.playerPos.x < playState.worldWidth * 0.3 && playState.playerPos.y > playState.worldHeight * 0.62,
      `Pantry demo should start away from center, got ${Math.round(playState.playerPos.x)},${Math.round(playState.playerPos.y)}`,
    );
    assert(playState.bossHealth === null, `boss should stay gated on wave one, got ${playState.bossHealth}`);
    assert(playState.bossSpawnAfterWavesCleared === 3, `boss gate should be 3 ingredients, got ${playState.bossSpawnAfterWavesCleared}`);
    assert(playState.pantryObjectiveVisible === true, 'Pantry recipe objective should be visible');
    assert(playState.pantryIngredientTarget === 3, `Pantry recipe should target 3 ingredients, got ${playState.pantryIngredientTarget}`);
    assert(playState.pantryIngredientsSecured === 0, `Pantry ingredients should start at 0, got ${playState.pantryIngredientsSecured}`);
    assert(
      Array.isArray(playState.pantryChecklist) &&
        playState.pantryChecklist.some((item) => item.includes('Flour')) &&
        playState.pantryChecklist.some((item) => item.includes('Sugar')) &&
        playState.pantryChecklist.some((item) => item.includes('Yeast')),
      `Pantry checklist missing expected ingredients: ${playState.pantryChecklist?.join(', ')}`,
    );
    assert(playState.chefSpriteReadable === true, 'Pantry chef should use readable source-backed art');
    assert(playState.activatedWaveCount === 1, `only first wave should be active at start, got ${playState.activatedWaveCount}`);
    assert(playState.wavesCleared === 0, `no waves should be cleared at start, got ${playState.wavesCleared}`);
    assert(playState.enemiesAlive >= 2, `first wave should be visible, got ${playState.enemiesAlive} enemies`);
    assert(playState.playerHealth >= 120, `player should not be hit immediately, hp ${playState.playerHealth}`);
    assert(forbiddenCalls.length === 0, `public demo made model/API calls after start: ${forbiddenCalls.join(', ')}`);

    const directPage = await browser.newPage({ viewport: { width: 1024, height: 760 } });
    trackForbiddenCalls(directPage, forbiddenCalls);
    await directPage.goto(demoUrl(), { waitUntil: 'networkidle', timeout: timeoutMs });
    await waitForGameApi(directPage);
    const directState = await getState(directPage);
    assert(directState?.scene === 'title', `direct /forge?play should also wait on title, got ${directState?.scene}`);
    await directPage.close();
    assert(forbiddenCalls.length === 0, `direct /forge?play made model/API calls: ${forbiddenCalls.join(', ')}`);

    if (screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      const screenshotPath = path.join(screenshotDir, 'forge-public-demo.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`screenshot ${screenshotPath}`);
    }

    log('PASS public Pantry demo is keyless, gated, and playable');
  } finally {
    await browser.close();
    if (devServer) {
      devServer.kill('SIGINT');
      await new Promise((resolve) => devServer.once('exit', resolve));
    }
  }
}

main().catch((error) => {
  console.error(`${logPrefix} FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
