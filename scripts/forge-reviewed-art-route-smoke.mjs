#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';

const port = Number(process.env.PORT ?? process.env.REVIEWED_ART_SMOKE_PORT ?? '3027');
const baseUrl = process.env.REVIEWED_ART_SMOKE_BASE_URL ?? `http://localhost:${port}`;
const prompt = process.env.REVIEWED_ART_SMOKE_PROMPT ?? 'neon arcade score attack';
const timeoutMs = Number(process.env.REVIEWED_ART_SMOKE_TIMEOUT_MS ?? '120000');
const attemptProduction = /^(1|true|yes)$/i.test(process.env.REVIEWED_ART_SMOKE_PRODUCE ?? '');
const cwd = process.cwd();
const logPrefix = '[forge-reviewed-art-route-smoke]';

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

async function jsonRequest(pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(async () => ({
    error: await response.text().catch(() => 'non-JSON response'),
  }));
  return { response, payload };
}

async function postJson(pathname, body) {
  return jsonRequest(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function parseSseEvents(text) {
  return text
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk) => chunk
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice('data: '.length))));
}

async function runStreamSmoke(produceAssets) {
  const response = await fetch(`${baseUrl}/api/forge/definition/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      forceLocal: true,
      produceAssets,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  assert(response.ok, `definition stream HTTP ${response.status}: ${text.slice(0, 500)}`);
  assert(
    response.headers.get('content-type')?.includes('text/event-stream'),
    `definition stream returned wrong content-type: ${response.headers.get('content-type')}`,
  );
  const events = parseSseEvents(text);
  assert(events.some((event) => event.type === 'tool_start' && event.name === 'generate_definition'), 'stream missing generate_definition start');
  assert(events.some((event) => event.type === 'tool_end' && event.name === 'generate_definition' && event.ok === true), 'stream missing successful generate_definition end');
  assert(events.some((event) => event.type === 'artifact' && event.kind === 'forge-definition-result'), 'stream missing forge-definition-result artifact');
  assert(events.some((event) => event.type === 'done'), 'stream missing done event');
  const artifact = events.find((event) => event.type === 'artifact' && event.kind === 'forge-definition-result');
  const result = JSON.parse(artifact.markdown);
  assert(result.definition?.schemaVersion === 1, 'stream artifact missing GameDefinition');
  assert(Array.isArray(result.assetPlan?.images), 'stream artifact missing asset plan');
  if (produceAssets) {
    assert(result.assetProduction, 'produceAssets stream missing assetProduction summary');
  }
  log(`stream PASS produceAssets=${produceAssets} events=${events.length} title="${result.definition.title}"`);
  return result;
}

async function runCapabilitySmoke() {
  const { response, payload } = await jsonRequest('/api/forge/assets/capability');
  assert(response.ok, `capability HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(typeof payload.reviewedAssetsAvailable === 'boolean', 'capability missing reviewedAssetsAvailable boolean');
  assert(typeof payload.defaultReviewedAssets === 'boolean', 'capability missing defaultReviewedAssets boolean');
  assert(!('GOOGLE_API_KEY' in payload), 'capability response leaked secret key name');
  log(`capability PASS available=${payload.reviewedAssetsAvailable} default=${payload.defaultReviewedAssets}`);
  return payload;
}

async function runValidationSmoke() {
  const accept = await postJson('/api/forge/assets/accept', {});
  assert(accept.response.status === 400, `accept validation expected HTTP 400, got ${accept.response.status}`);
  assert(/batchId/.test(String(accept.payload.error)), `accept validation wrong error: ${JSON.stringify(accept.payload)}`);

  const retry = await postJson('/api/forge/assets/retry', { batchId: 'missing' });
  assert(retry.response.status === 400, `retry validation expected HTTP 400, got ${retry.response.status}`);
  assert(/variable/.test(String(retry.payload.error)), `retry validation wrong error: ${JSON.stringify(retry.payload)}`);

  const cleanup = await postJson('/api/forge/assets/cleanup', {
    dryRun: true,
    keepLatest: 1,
    maxAgeDays: 1,
  });
  assert(cleanup.response.ok, `cleanup dry-run HTTP ${cleanup.response.status}: ${JSON.stringify(cleanup.payload).slice(0, 500)}`);
  assert(cleanup.payload.ok === true, 'cleanup dry-run did not return ok=true');
  assert(cleanup.payload.dryRun === true, 'cleanup dry-run response did not preserve dryRun=true');
  assert(Array.isArray(cleanup.payload.prunedBatches), 'cleanup dry-run missing prunedBatches array');
  assert(Array.isArray(cleanup.payload.skippedBatches), 'cleanup dry-run missing skippedBatches array');

  log(`validation PASS cleanupDryRun total=${cleanup.payload.totalBatches}`);
}

let devServer;

try {
  if (!(await serverIsUp(`${baseUrl}/forge`))) {
    log(`starting dev server on port ${port}`);
    devServer = spawnDevServer();
    const ready = await waitForServer(`${baseUrl}/forge`, timeoutMs);
    if (!ready) throw new Error(`dev server did not become ready at ${baseUrl}`);
  } else {
    log(`using existing dev server at ${baseUrl}`);
  }

  const capability = await runCapabilitySmoke();
  await runStreamSmoke(false);
  await runValidationSmoke();

  if (attemptProduction) {
    if (!capability.reviewedAssetsAvailable) {
      throw new Error('REVIEWED_ART_SMOKE_PRODUCE=1 requires reviewedAssetsAvailable=true');
    }
    await runStreamSmoke(true);
  } else {
    log('production stream skipped; set REVIEWED_ART_SMOKE_PRODUCE=1 to exercise real reviewed-art generation');
  }

  log('PASS');
} catch (error) {
  console.error(`${logPrefix} ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (devServer) {
    devServer.kill('SIGTERM');
  }
}
