#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const port = Number(process.env.PORT ?? process.env.DEPLOY_SMOKE_PORT ?? '3027');
const baseUrl = process.env.DEPLOY_SMOKE_BASE_URL ?? `http://localhost:${port}`;
const prompt = process.env.DEPLOY_SMOKE_PROMPT ?? 'neon arcade score attack';
const timeoutMs = Number(process.env.DEPLOY_SMOKE_TIMEOUT_MS ?? '120000');
const keepOutput = /^(1|true|yes)$/i.test(process.env.DEPLOY_SMOKE_KEEP_OUTPUT ?? '');
const attemptDeploy = /^(1|true|yes)$/i.test(process.env.DEPLOY_SMOKE_DEPLOY ?? '');
const slugBase = `route-smoke-${Date.now().toString(36)}-${process.pid.toString(36)}`;
const logPrefix = '[forge-deploy-route-smoke]';

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
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    if (/ready|local:/i.test(text)) process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let json;
  try {
    json = await response.json();
  } catch {
    const text = await response.text().catch(() => '');
    throw new Error(`${pathname} returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${response.status}: ${JSON.stringify(json).slice(0, 600)}`);
  }
  return json;
}

function assertSafeGeneratedDir(gameDir, slug) {
  const resolved = path.resolve(gameDir);
  const expectedRoot = path.resolve(cwd, 'generations', 'forge-runtime');
  assert(resolved.startsWith(`${expectedRoot}${path.sep}`), `unsafe gameDir outside generated root: ${gameDir}`);
  assert(path.basename(resolved) === slug, `unexpected gameDir basename for ${slug}: ${gameDir}`);
  return resolved;
}

async function verifyExportResult(result, slug) {
  assert(result?.ok === true, `export response did not return ok=true: ${JSON.stringify(result).slice(0, 600)}`);
  assert(result.slug === slug, `export slug mismatch: expected ${slug}, got ${result.slug}`);
  assert(result.deploymentRequested === false, 'export-only smoke should not request deployment');
  assert(result.runtimeFilesCopied === 3, `expected 3 runtime files copied, got ${result.runtimeFilesCopied}`);
  assert(typeof result.gameDir === 'string' && result.gameDir.length > 0, 'missing gameDir');
  assert(typeof result.mainPath === 'string' && result.mainPath.length > 0, 'missing mainPath');
  assert(typeof result.manifestPath === 'string' && result.manifestPath.length > 0, 'missing manifestPath');

  const gameDir = assertSafeGeneratedDir(result.gameDir, slug);
  assert(existsSync(path.join(gameDir, 'vite.config.ts')), 'export missing vite.config.ts');
  assert(existsSync(path.join(gameDir, 'engine', 'runtime', 'phaser', 'forge-game.ts')), 'export missing Phaser runtime copy');

  const main = await readFile(result.mainPath, 'utf8');
  assert(main.includes('createForgeGame'), 'standalone main.ts does not mount createForgeGame');
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert(manifest.kind === 'forge-runtime-standalone', `unexpected manifest kind: ${manifest.kind}`);
  assert(manifest.slug === slug, `manifest slug mismatch: ${manifest.slug}`);
  assert(manifest.definition?.schemaVersion === 1, 'manifest missing embedded GameDefinition');
  return gameDir;
}

async function cleanupGameDir(gameDir, slug) {
  if (keepOutput) {
    log(`kept output at ${gameDir}`);
    return;
  }
  assertSafeGeneratedDir(gameDir, slug);
  await rm(gameDir, { recursive: true, force: true });
}

async function runDeployProbe(definition) {
  const slug = `${slugBase}-deploy`;
  log(`deploy probe requested slug=${slug}`);
  const result = await postJson('/api/forge/deploy', {
    prompt,
    definition,
    slug,
    deploy: true,
    target: 'preview',
  });
  assert(result?.ok === true, `deploy response did not return ok=true: ${JSON.stringify(result).slice(0, 600)}`);
  assert(result.slug === slug, `deploy slug mismatch: expected ${slug}, got ${result.slug}`);
  assert(result.deploymentRequested === true, 'deploy probe should request deployment');
  assert(
    typeof result.deploymentSkippedReason === 'string' || typeof result.deployment?.httpsUrl === 'string',
    'deploy probe returned neither deployment URL nor skipped reason',
  );
  const gameDir = assertSafeGeneratedDir(result.gameDir, slug);
  await cleanupGameDir(gameDir, slug);
  const detail = result.deployment?.httpsUrl ?? result.deploymentSkippedReason;
  log(`deploy probe PASS ${detail}`);
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

  const generated = await postJson('/api/forge/definition', {
    prompt,
    forceLocal: true,
    produceAssets: false,
  });
  assert(generated?.definition?.schemaVersion === 1, 'definition route did not return a GameDefinition');
  assert(Array.isArray(generated.assetPlan?.images), 'definition route did not return assetPlan images');
  assert(
    generated.definition.assets.every((asset) => typeof asset.src === 'string' && asset.src.length > 0),
    'definition route returned assets without source-backed src values',
  );
  log(`definition PASS source=${generated.source} assets=${generated.definition.assets.length}`);

  const slug = `${slugBase}-export`;
  const exported = await postJson('/api/forge/deploy', {
    prompt,
    definition: generated.definition,
    slug,
    deploy: false,
  });
  const gameDir = await verifyExportResult(exported, slug);
  await cleanupGameDir(gameDir, slug);
  log(`export route PASS slug=${slug}`);

  if (attemptDeploy) {
    await runDeployProbe(generated.definition);
  } else {
    log('deploy probe skipped; set DEPLOY_SMOKE_DEPLOY=1 to exercise deploy:true');
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
