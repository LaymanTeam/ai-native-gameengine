#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const port = Number(process.env.PORT ?? '3027');
const baseUrl = process.env.SELFTEST_BASE_URL ?? `http://localhost:${port}`;
const selftestUrl = process.env.SELFTEST_URL ?? `${baseUrl}/forge?play&selftest=1`;
const timeoutMs = Number(process.env.SELFTEST_TIMEOUT_MS ?? '45000');
const viewportSpec = process.env.SELFTEST_VIEWPORTS ?? 'desktop:1440x900,tablet:900x900,mobile:390x844';
const screenshotDir = process.env.SELFTEST_SCREENSHOT_DIR ?? path.join(tmpdir(), 'hackathon-multimodal-forge-selftest');
const captureScreenshots = !/^(0|false|no)$/i.test(process.env.SELFTEST_SCREENSHOTS ?? '1');
const marker = 'SELFTEST_RESULT:';

function log(message) {
  console.log(`[forge-selftest] ${message}`);
}

function parseViewports(spec) {
  const viewports = spec
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = /^(?:(?<name>[a-zA-Z0-9_-]+):)?(?<width>\d+)x(?<height>\d+)$/.exec(entry);
      if (!match?.groups) throw new Error(`invalid SELFTEST_VIEWPORTS entry "${entry}"`);
      const width = Number(match.groups.width);
      const height = Number(match.groups.height);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320) {
        throw new Error(`invalid viewport size "${entry}"`);
      }
      return {
        name: match.groups.name ?? `${width}x${height}`,
        width,
        height,
      };
    });
  if (viewports.length === 0) throw new Error('SELFTEST_VIEWPORTS must include at least one viewport');
  return viewports;
}

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'viewport';
}

function formatRect(rect) {
  if (!rect) return 'none';
  return `${Math.round(rect.width)}x${Math.round(rect.height)} @ ${Math.round(rect.x)},${Math.round(rect.y)}`;
}

async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default;
  } catch (error) {
    throw new Error(`sharp not available for screenshot analysis: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function analyzeRgbaPixels(data, width, height) {
  const sampleStride = Math.max(1, Math.floor((width * height) / 6000));
  let samples = 0;
  let nonBone = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const buckets = new Set();

  for (let px = 0; px < width * height; px += sampleStride) {
    const i = px * 4;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;
    if (a <= 8) continue;
    samples++;
    const luma = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
    const nearPageBone = Math.abs(r - 244) < 18 && Math.abs(g - 242) < 18 && Math.abs(b - 236) < 18;
    if (!nearPageBone) nonBone++;
  }

  const edgeStepX = Math.max(2, Math.floor(width / 96));
  const edgeStepY = Math.max(2, Math.floor(height / 96));
  let edgeSamples = 0;
  let edges = 0;
  for (let y = edgeStepY; y < height - edgeStepY; y += edgeStepY) {
    for (let x = edgeStepX; x < width - edgeStepX; x += edgeStepX) {
      const i = (y * width + x) * 4;
      const left = (y * width + x - edgeStepX) * 4;
      const up = ((y - edgeStepY) * width + x) * 4;
      const luma = (data[i] ?? 0) * 0.2126 + (data[i + 1] ?? 0) * 0.7152 + (data[i + 2] ?? 0) * 0.0722;
      const leftLuma = (data[left] ?? 0) * 0.2126 + (data[left + 1] ?? 0) * 0.7152 + (data[left + 2] ?? 0) * 0.0722;
      const upLuma = (data[up] ?? 0) * 0.2126 + (data[up + 1] ?? 0) * 0.7152 + (data[up + 2] ?? 0) * 0.0722;
      edgeSamples++;
      if (Math.abs(luma - leftLuma) + Math.abs(luma - upLuma) > 32) edges++;
    }
  }

  return {
    samples,
    nonBoneRatio: samples > 0 ? nonBone / samples : 0,
    colorBuckets: buckets.size,
    lumaRange: maxLuma - minLuma,
    edgeDensity: edgeSamples > 0 ? edges / edgeSamples : 0,
  };
}

async function analyzeScreenshotPng(buffer, viewport, layout) {
  const sharp = await loadSharp();
  const image = sharp(buffer, { failOn: 'none' }).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const raw = await image.raw().toBuffer();
  const metrics = analyzeRgbaPixels(raw, width, height);
  const expectedMinWidth = Math.max(320, Math.floor(layout.viewportWidth * 0.9));
  const expectedMinHeight = Math.max(320, Math.floor(Math.min(layout.scrollHeight, 1200) * 0.65));
  const pass =
    width >= expectedMinWidth &&
    height >= expectedMinHeight &&
    metrics.samples >= 512 &&
    metrics.nonBoneRatio > 0.22 &&
    metrics.colorBuckets >= 18 &&
    metrics.lumaRange >= 120 &&
    metrics.edgeDensity > 0.015;

  return {
    pass,
    detail:
      `${width}x${height}, non-bg ${metrics.nonBoneRatio.toFixed(2)}, ` +
      `colors ${metrics.colorBuckets}, luma ${metrics.lumaRange}, edges ${metrics.edgeDensity.toFixed(3)}`,
  };
}

async function analyzeCanvasRegionPng(buffer, layout) {
  let crop;
  try {
    crop = await extractCanvasRegionRgba(buffer, layout);
  } catch (error) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const metrics = analyzeRgbaPixels(crop.raw, crop.width, crop.height);
  const pass =
    crop.width >= 160 &&
    crop.height >= 90 &&
    metrics.samples >= 512 &&
    metrics.nonBoneRatio > 0.9 &&
    metrics.colorBuckets >= 24 &&
    metrics.lumaRange >= 120 &&
    metrics.edgeDensity > 0.009;

  return {
    pass,
    detail:
      `${crop.width}x${crop.height} crop @ ${crop.left},${crop.top}, non-bg ${metrics.nonBoneRatio.toFixed(2)}, ` +
      `colors ${metrics.colorBuckets}, luma ${metrics.lumaRange}, edges ${metrics.edgeDensity.toFixed(3)}`,
  };
}

async function analyzeCanvasMotionPng(beforeBuffer, afterBuffer, layout) {
  let before;
  let after;
  try {
    before = await extractCanvasRegionRgba(beforeBuffer, layout);
    after = await extractCanvasRegionRgba(afterBuffer, layout);
  } catch (error) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const width = Math.min(before.width, after.width);
  const height = Math.min(before.height, after.height);
  const pixelCount = width * height;
  const pixelStride = Math.max(1, Math.floor(pixelCount / 36000));
  let samples = 0;
  let changed = 0;
  let totalDelta = 0;
  for (let px = 0; px < pixelCount; px += pixelStride) {
    const i = px * 4;
    const delta =
      Math.abs((before.raw[i] ?? 0) - (after.raw[i] ?? 0)) +
      Math.abs((before.raw[i + 1] ?? 0) - (after.raw[i + 1] ?? 0)) +
      Math.abs((before.raw[i + 2] ?? 0) - (after.raw[i + 2] ?? 0)) +
      Math.abs((before.raw[i + 3] ?? 0) - (after.raw[i + 3] ?? 0));
    if (delta > 8) changed++;
    totalDelta += delta;
    samples++;
  }
  const changeRatio = samples > 0 ? changed / samples : 0;
  const meanDelta = samples > 0 ? totalDelta / samples : 0;
  const pass =
    width >= 160 &&
    height >= 90 &&
    samples >= 512 &&
    changeRatio >= 0.004 &&
    meanDelta >= 0.35;
  return {
    pass,
    detail: `${width}x${height} crop, samples ${samples}, changed ${changeRatio.toFixed(3)}, meanDelta ${meanDelta.toFixed(2)}`,
  };
}

async function extractCanvasRegionRgba(buffer, layout) {
  const sharp = await loadSharp();
  const image = sharp(buffer, { failOn: 'none' }).ensureAlpha();
  const metadata = await image.metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;
  const rect = layout.canvasRect;
  if (!rect || imageWidth < 1 || imageHeight < 1) {
    throw new Error(`missing canvas crop data (image ${imageWidth}x${imageHeight}, canvas ${formatRect(rect)})`);
  }

  const scaleX = imageWidth / Math.max(1, layout.scrollWidth ?? layout.viewportWidth ?? imageWidth);
  const scaleY = imageHeight / Math.max(1, layout.scrollHeight ?? layout.viewportHeight ?? imageHeight);
  const left = Math.max(0, Math.min(imageWidth - 1, Math.round((rect.x + (layout.scrollX ?? 0)) * scaleX)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round((rect.y + (layout.scrollY ?? 0)) * scaleY)));
  const right = Math.max(left + 1, Math.min(imageWidth, Math.round((rect.right + (layout.scrollX ?? 0)) * scaleX)));
  const bottom = Math.max(top + 1, Math.min(imageHeight, Math.round((rect.bottom + (layout.scrollY ?? 0)) * scaleY)));
  const width = right - left;
  const height = bottom - top;
  const raw = await image
    .extract({ left, top, width, height })
    .raw()
    .toBuffer();
  return { raw, width, height, left, top };
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
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome not found. Set CHROME_BIN to a headless-capable Chrome/Chromium executable.');
  }
  return found;
}

async function serverIsUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('could not allocate a debugging port'));
      });
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function waitForPageWebSocket(debugPort, url, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const pages = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find((entry) => entry.type === 'page' && entry.url?.startsWith(url));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome's debugging endpoint is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome DevTools endpoint did not expose ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('timed out opening CDP WebSocket'));
      }, 5000);
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.removeEventListener('open', onOpen);
        this.socket.removeEventListener('error', onError);
        this.socket.removeEventListener('message', onMessage);
      };
      const onOpen = () => {
        cleanup();
        this.socket.addEventListener('message', (event) => this.handleMessage(event));
        resolve();
      };
      const onError = (event) => {
        cleanup();
        reject(new Error(`CDP WebSocket error: ${event.message ?? 'unknown'}`));
      };
      const onMessage = (event) => this.handleMessage(event);
      this.socket.addEventListener('open', onOpen);
      this.socket.addEventListener('error', onError);
      this.socket.addEventListener('message', onMessage);
    });
  }

  handleMessage(event) {
    let payload;
    try {
      payload = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!payload.id) return;
    const callbacks = this.pending.get(payload.id);
    if (!callbacks) return;
    this.pending.delete(payload.id);
    if (payload.error) callbacks.reject(new Error(payload.error.message ?? 'CDP command failed'));
    else callbacks.resolve(payload.result);
  }

  send(method, params = {}, timeoutMsForCommand = 5000) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for CDP command ${method}`));
      }, timeoutMsForCommand);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  close() {
    this.socket.close();
  }
}

async function ensureGameStarted(client, deadlineMs) {
  const expression = `(() => {
    if (window.__GAME_TEST__ || document.querySelector('canvas')) return 'started';
    const button = Array.from(document.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Generate'));
    if (button) {
      button.click();
      return 'clicked';
    }
    return 'waiting';
  })()`;
  const deadline = Date.now() + deadlineMs;
  let clicked = false;
  while (Date.now() < deadline) {
    const result = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });
    const value = result?.result?.value;
    if (value === 'started') return;
    if (value === 'clicked') clicked = true;
    await new Promise((resolve) => setTimeout(resolve, clicked ? 1000 : 500));
  }
  throw new Error('game did not mount after clicking Generate & play');
}

async function waitForSelftestResult(client, deadlineMs) {
  const expression = `(() => {
    const fromPre = document.getElementById('selftest-result')?.textContent;
    if (fromPre) return fromPre;
    if (document.title.startsWith('${marker}')) return document.title.slice(${marker.length});
    return null;
  })()`;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const result = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });
    const value = result?.result?.value;
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      return JSON.parse(value);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out after ${deadlineMs}ms waiting for ${marker}`);
}

async function waitForPlayLayoutSample(client, deadlineMs) {
  const expression = `(() => {
    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    const html = document.documentElement;
    const body = document.body;
    const canvas = document.querySelector('canvas');
    const canvasRect = rectOf(canvas);
    const frameRect = rectOf(document.querySelector('.forge-runtime-frame'));
    const pageRect = rectOf(document.querySelector('.forge-runtime-page'));
    const stageRect = rectOf(document.querySelector('.forge-runtime-stage'));
    const state = window.__GAME_TEST__?.getState?.() ?? null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollWidth = Math.max(html.scrollWidth, body?.scrollWidth ?? 0);
    const scrollHeight = Math.max(html.scrollHeight, body?.scrollHeight ?? 0);
    const hasHorizontalOverflow = scrollWidth > viewportWidth + 2;
    const canvasVisible =
      !!canvasRect &&
      canvasRect.width >= 160 &&
      canvasRect.height >= 90 &&
      canvasRect.right > 0 &&
      canvasRect.bottom > 0 &&
      canvasRect.x < viewportWidth &&
      canvasRect.y < viewportHeight;
    return {
      ready: state?.scene === 'play' && canvasVisible,
      scene: state?.scene ?? null,
      enemiesAlive: state?.enemiesAlive ?? 0,
      viewportWidth,
      viewportHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollWidth,
      scrollHeight,
      hasHorizontalOverflow,
      canvasVisible,
      canvasRect,
      frameRect,
      pageRect,
      stageRect,
    };
  })()`;
  const deadline = Date.now() + deadlineMs;
  let latest = null;
  while (Date.now() < deadline) {
    const result = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });
    const value = result?.result?.value;
    if (value && typeof value === 'object') {
      latest = value;
      if (value.ready) return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`play scene was not ready for visual capture; latest=${JSON.stringify(latest)}`);
}

async function ensurePlaySceneForVisualCapture(client) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const api = window.__GAME_TEST__;
        if (!api?.getState) return { ok: false, scene: null };
        const scene = api.getState().scene;
        if (scene !== 'play') api.press?.('restart');
        document.querySelector('canvas')?.scrollIntoView?.({ block: 'center', inline: 'center' });
        return { ok: true, scene };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });
    const value = result?.result?.value;
    if (value?.ok) {
      try {
        await waitForPlayLayoutSample(client, 500);
        return;
      } catch {
        // Keep nudging restart until the play scene is visible.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await waitForPlayLayoutSample(client, 1_000);
}

async function captureVisualEvidence(client, viewport) {
  if (!captureScreenshots) return [];
  await ensurePlaySceneForVisualCapture(client);
  const staged = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const api = window.__GAME_TEST__;
      const state = api?.getState?.();
      if (api?.stageVisualEvidence) {
        api.stageVisualEvidence();
      } else if (state?.assetKeys?.boss) {
        api.spawnBoss?.();
        api.triggerBossTelegraph?.();
        if (state?.runtimeTemplate === 'platformer') api.press?.('right', 520);
      } else {
        api?.spawnEnemy?.(0);
        if (state?.winCondition === 'collect-relics' || state?.winCondition === 'survive' || state?.winCondition === 'score-target') {
          api?.triggerObjectivePickup?.();
        }
      }
      return api?.getState?.() ?? state ?? null;
    })()`,
    returnByValue: true,
    awaitPromise: false,
  });
  if (/^(1|true|yes)$/i.test(process.env.SELFTEST_DEBUG_STATE ?? '')) {
    log(`visual evidence state ${JSON.stringify(staged?.result?.value ?? null)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 560));
  const layout = await waitForPlayLayoutSample(client, 3_000);
  mkdirSync(screenshotDir, { recursive: true });
  const fileName = `forge-${safeFilePart(viewport.name)}-${viewport.width}x${viewport.height}.png`;
  const screenshotPath = path.join(screenshotDir, fileName);
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
  }, 10_000);
  if (!screenshot?.data) throw new Error(`Chrome did not return screenshot data for ${viewport.name}`);
  const screenshotBuffer = Buffer.from(screenshot.data, 'base64');
  writeFileSync(screenshotPath, screenshotBuffer);
  const screenshotAnalysis = await analyzeScreenshotPng(screenshotBuffer, viewport, layout);
  const canvasAnalysis = await analyzeCanvasRegionPng(screenshotBuffer, layout);
  await client.send('Runtime.evaluate', {
    expression: `(() => { window.__GAME_TEST__?.triggerArenaHazard?.(); return true; })()`,
    returnByValue: true,
    awaitPromise: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 420));
  const motionScreenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
  }, 10_000);
  if (!motionScreenshot?.data) throw new Error(`Chrome did not return motion screenshot data for ${viewport.name}`);
  const motionScreenshotBuffer = Buffer.from(motionScreenshot.data, 'base64');
  const canvasMotionAnalysis = await analyzeCanvasMotionPng(screenshotBuffer, motionScreenshotBuffer, layout);

  const layoutPass =
    layout.scene === 'play' &&
    layout.canvasVisible === true &&
    layout.enemiesAlive > 0 &&
    layout.hasHorizontalOverflow === false &&
    layout.canvasRect?.width >= 160 &&
    layout.canvasRect?.height >= 90;
  const layoutDetail =
    `viewport ${layout.viewportWidth}x${layout.viewportHeight}, ` +
    `scroll ${layout.scrollWidth}x${layout.scrollHeight}, ` +
    `canvas ${formatRect(layout.canvasRect)}, frame ${formatRect(layout.frameRect)}, ` +
    `enemies ${layout.enemiesAlive}, overflowX ${layout.hasHorizontalOverflow}`;

  return [
    {
      name: 'play screenshot captured',
      pass: true,
      detail: screenshotPath,
    },
    {
      name: 'play screenshot has visual detail',
      pass: screenshotAnalysis.pass,
      detail: screenshotAnalysis.detail,
    },
    {
      name: 'play canvas crop has visual detail',
      pass: canvasAnalysis.pass,
      detail: canvasAnalysis.detail,
    },
    {
      name: 'play canvas crop changes after live effect',
      pass: canvasMotionAnalysis.pass,
      detail: canvasMotionAnalysis.detail,
    },
    {
      name: 'responsive play layout fits viewport',
      pass: layoutPass,
      detail: layoutDetail,
    },
  ];
}

async function runChrome(url, viewport) {
  const debugPort = await freePort();
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'hackathon-multimodal-chrome-selftest-'));
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-cache',
    '--no-first-run',
    `--window-size=${viewport.width},${viewport.height}`,
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    url,
  ];
  const child = spawn(chromePath(), args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const cleanup = () => {
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Chrome may still be releasing profile files; temp cleanup is best-effort.
    }
  };
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk).slice(0, 1000);
  });

  let client = null;
  try {
    const pageWs = await waitForPageWebSocket(debugPort, url, timeoutMs);
    client = new CdpClient(pageWs);
    await client.open();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await ensureGameStarted(client, 15_000);
    const result = await waitForSelftestResult(client, timeoutMs);
    const visualChecks = await captureVisualEvidence(client, viewport);
    const checks = [...(Array.isArray(result.checks) ? result.checks : []), ...visualChecks];
    return {
      ...result,
      checks,
      pass: result.pass === true && checks.every((check) => check.pass),
    };
  } catch (error) {
    if (stderr.trim()) console.error(stderr.trim().slice(0, 1200));
    throw error;
  } finally {
    try {
      await client?.send('Browser.close');
    } catch {
      child.kill('SIGTERM');
    }
    client?.close();
    if (!child.killed) child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 250));
    cleanup();
  }
}

function summarizeChecks(checks, viewport) {
  if (!Array.isArray(checks)) return `[${viewport.name}] (no checks reported)`;
  return checks
    .map((check) => {
      const status = check.pass ? 'PASS' : 'FAIL';
      const detail = check.detail ? ` (${check.detail})` : '';
      return `[${viewport.name}] ${status} ${check.name}${detail}`;
    })
    .join('\n');
}

let devServer = null;
try {
  const viewports = parseViewports(viewportSpec);
  if (!(await serverIsUp(`${baseUrl}/forge`))) {
    log(`starting dev server on port ${port}`);
    devServer = spawnDevServer();
    const ready = await waitForServer(`${baseUrl}/forge`, 30_000);
    if (!ready) throw new Error(`dev server did not become ready at ${baseUrl}`);
  } else {
    log(`using existing dev server at ${baseUrl}`);
  }

  const results = [];
  for (const viewport of viewports) {
    log(`running ${selftestUrl} at ${viewport.name} ${viewport.width}x${viewport.height}`);
    const result = await runChrome(selftestUrl, viewport);
    results.push({ viewport, result });
    console.log(summarizeChecks(result.checks, viewport));
  }

  const failures = results.filter(({ result }) => !result.pass);
  if (failures.length > 0) {
    const summary = failures.map(({ viewport, result }) => ({
      viewport: `${viewport.name}:${viewport.width}x${viewport.height}`,
      result,
    }));
    console.error(`[forge-selftest] FAILED ${JSON.stringify(summary)}`);
    process.exitCode = 1;
  } else {
    log(`PASS ${viewports.map((viewport) => `${viewport.name}:${viewport.width}x${viewport.height}`).join(', ')}`);
  }
} catch (error) {
  console.error(`[forge-selftest] ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (devServer) {
    devServer.kill('SIGTERM');
  }
}
