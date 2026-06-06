/**
 * Programmatic deploy of a generated game to Vercel via the REST API.
 *
 * Flow (per research/vercel-deploy-api.md, verified 2026-06-06):
 *   1. Walk the wrapped game directory (vite-creator.ts output) into a flat
 *      file list, base64-inlining each file as a `{ file, data, encoding }`
 *      entry for `POST /v13/deployments`.
 *   2. Create the deployment with `projectSettings.framework = 'vite'` (required
 *      on a project's first deployment; persisted afterward).
 *   3. Poll `GET /v13/deployments/{id}` until `readyState === 'READY'`
 *      (or ERROR / CANCELED / timeout).
 *   4. Return the live deployment URL.
 *
 * Auth: Vercel Access Token via `VERCEL_TOKEN` env (Authorization: Bearer <token>).
 * The token is NEVER logged — log lines emit `token=REDACTED`.
 *
 * `fetch` is injectable so tests run fully offline.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const DEPLOY_LOG_PREFIX = '[engine/compiler/vercel-deploy]';

const VERCEL_API_BASE = 'https://api.vercel.com';

/** Minimal fetch signature so the deployer can be tested with a mock. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export const DeployOptionsSchema = z
  .object({
    /** Absolute path to the wrapped game directory to deploy. */
    gameDir: z.string().min(1),
    /** Vercel project / deployment name (the game slug). */
    name: z.string().min(1),
    /** Vercel access token. Falls back to process.env.VERCEL_TOKEN. */
    token: z.string().min(1).optional(),
    /** Deploy target. Default: 'production'. */
    target: z.enum(['production', 'staging', 'preview']).optional(),
    /** Act on behalf of a team. */
    teamId: z.string().min(1).optional(),
    /** Poll interval in ms while waiting for READY. Default: 2000. */
    pollIntervalMs: z.number().int().positive().optional(),
    /** Max ms to wait for READY before giving up. Default: 240000 (< Vercel 300s wall). */
    pollTimeoutMs: z.number().int().positive().optional(),
    /** File/dir names to exclude from the upload. Default: node_modules, .git, dist. */
    exclude: z.array(z.string()).optional(),
    /** Injected fetch implementation (tests). Default: global fetch. */
    fetchImpl: z.custom<FetchLike>((v) => typeof v === 'function').optional(),
  })
  .strict();

export type DeployOptions = z.input<typeof DeployOptionsSchema>;

export interface DeployResult {
  /** Vercel deployment id. */
  id: string;
  /** Live deployment URL (host without scheme, as Vercel returns it). */
  url: string;
  /** Fully-qualified https URL convenience form. */
  httpsUrl: string;
  /** Final readyState — always 'READY' on success. */
  readyState: string;
}

/** Vercel deployment-create response (subset we rely on). */
const DeploymentResponseSchema = z.object({
  id: z.string(),
  url: z.string().optional(),
  readyState: z.string().optional(),
});

/** Vercel deployment-status (GET) response (subset). */
const DeploymentStatusSchema = z.object({
  id: z.string().optional(),
  url: z.string().optional(),
  readyState: z.string().optional(),
});

const DEFAULT_EXCLUDE: Readonly<string[]> = Object.freeze(['node_modules', '.git', 'dist', '.vercel']);

interface InlineFile {
  file: string;
  data: string;
  encoding: 'base64';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Recursively collect every file under `dir` as POSIX-relative paths, skipping
 * excluded directory/file names. Returns absolute+relative pairs.
 */
async function collectFiles(
  rootDir: string,
  excludeSet: Set<string>,
): Promise<Array<{ abs: string; rel: string }>> {
  const out: Array<{ abs: string; rel: string }> = [];

  async function walk(currentAbs: string, currentRel: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentAbs, { withFileTypes: true });
    } catch (err) {
      console.error(`${DEPLOY_LOG_PREFIX} readdir failed dir=${currentAbs} err=${String(err)}`);
      throw err;
    }
    for (const entry of entries) {
      if (excludeSet.has(entry.name)) continue;
      const childAbs = path.join(currentAbs, entry.name);
      const childRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (entry.isFile()) {
        out.push({ abs: childAbs, rel: childRel });
      }
      // symlinks and other types are intentionally skipped.
    }
  }

  await walk(rootDir, '');
  return out;
}

async function buildInlineFiles(
  rootDir: string,
  excludeSet: Set<string>,
): Promise<InlineFile[]> {
  const collected = await collectFiles(rootDir, excludeSet);
  if (collected.length === 0) {
    throw new Error(`${DEPLOY_LOG_PREFIX} no files found to deploy under ${rootDir}`);
  }
  const files: InlineFile[] = [];
  for (const { abs, rel } of collected) {
    const buf = await readFile(abs);
    files.push({ file: rel, data: buf.toString('base64'), encoding: 'base64' });
  }
  return files;
}

function buildAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function withTeam(url: string, teamId: string | undefined): string {
  if (!teamId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}teamId=${encodeURIComponent(teamId)}`;
}

/**
 * Deploy a wrapped generated game to Vercel and wait until it is live.
 *
 * @throws if options/env invalid, the create call fails, the build errors,
 *         or polling times out.
 */
export async function deployToVercel(options: DeployOptions): Promise<DeployResult> {
  const parsed = DeployOptionsSchema.safeParse(options);
  if (!parsed.success) {
    console.error(`${DEPLOY_LOG_PREFIX} invalid options issues=${JSON.stringify(parsed.error.issues)}`);
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: invalid options: ${parsed.error.message}`);
  }

  const { gameDir, name } = parsed.data;
  const target = parsed.data.target ?? 'production';
  const teamId = parsed.data.teamId;
  const pollIntervalMs = parsed.data.pollIntervalMs ?? 2000;
  const pollTimeoutMs = parsed.data.pollTimeoutMs ?? 240_000;
  const exclude = parsed.data.exclude ?? [...DEFAULT_EXCLUDE];
  const fetchImpl: FetchLike = parsed.data.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const token = parsed.data.token ?? process.env['VERCEL_TOKEN'];

  if (typeof fetchImpl !== 'function') {
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: no fetch implementation available`);
  }
  if (!token || token.trim().length === 0) {
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: missing VERCEL_TOKEN`);
  }

  const absGameDir = path.resolve(gameDir);
  // Guard: ensure the directory exists and is a directory.
  let dirStat;
  try {
    dirStat = await stat(absGameDir);
  } catch {
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: gameDir does not exist: ${absGameDir}`);
  }
  if (!dirStat.isDirectory()) {
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: gameDir is not a directory: ${absGameDir}`);
  }

  console.log(
    `${DEPLOY_LOG_PREFIX} deploy start name=${name} target=${target} teamId=${teamId ?? 'none'} token=REDACTED gameDir=${absGameDir}`,
  );

  const excludeSet = new Set(exclude);
  const files = await buildInlineFiles(absGameDir, excludeSet);
  console.log(`${DEPLOY_LOG_PREFIX} prepared files count=${files.length}`);

  const createUrl = withTeam(
    `${VERCEL_API_BASE}/v13/deployments?skipAutoDetectionConfirmation=1`,
    teamId,
  );
  const createBody = {
    name,
    target,
    files,
    projectSettings: {
      framework: 'vite',
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
      devCommand: null,
    },
  };

  const createRes = await fetchImpl(createUrl, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '<unreadable>');
    console.error(`${DEPLOY_LOG_PREFIX} create failed status=${createRes.status} body=${errText}`);
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: create deployment failed (status ${createRes.status})`);
  }

  const createdRaw = await createRes.json();
  const created = DeploymentResponseSchema.safeParse(createdRaw);
  if (!created.success) {
    console.error(`${DEPLOY_LOG_PREFIX} create response invalid issues=${JSON.stringify(created.error.issues)}`);
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: unexpected create-deployment response shape`);
  }

  const deploymentId = created.data.id;
  console.log(
    `${DEPLOY_LOG_PREFIX} created id=${deploymentId} readyState=${created.data.readyState ?? 'unknown'} url=${created.data.url ?? 'pending'}`,
  );

  const final = await pollUntilReady({
    fetchImpl,
    token,
    teamId,
    deploymentId,
    pollIntervalMs,
    pollTimeoutMs,
  });

  const url = final.url ?? created.data.url;
  if (!url) {
    throw new Error(`${DEPLOY_LOG_PREFIX} deployToVercel: deployment READY but no URL returned`);
  }

  const httpsUrl = url.startsWith('http') ? url : `https://${url}`;
  console.log(`${DEPLOY_LOG_PREFIX} deploy done id=${deploymentId} url=${httpsUrl}`);
  return { id: deploymentId, url, httpsUrl, readyState: 'READY' };
}

interface PollArgs {
  fetchImpl: FetchLike;
  token: string;
  teamId: string | undefined;
  deploymentId: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

async function pollUntilReady(args: PollArgs): Promise<{ url?: string | undefined }> {
  const { fetchImpl, token, teamId, deploymentId, pollIntervalMs, pollTimeoutMs } = args;
  const statusUrl = withTeam(
    `${VERCEL_API_BASE}/v13/deployments/${encodeURIComponent(deploymentId)}`,
    teamId,
  );
  const deadline = Date.now() + pollTimeoutMs;

  // The headers for GET do not need Content-Type but Authorization is required.
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  for (;;) {
    const res = await fetchImpl(statusUrl, { method: 'GET', headers });
    if (!res.ok) {
      const errText = await res.text().catch(() => '<unreadable>');
      console.error(`${DEPLOY_LOG_PREFIX} poll failed status=${res.status} body=${errText}`);
      throw new Error(`${DEPLOY_LOG_PREFIX} pollUntilReady: status fetch failed (status ${res.status})`);
    }
    const raw = await res.json();
    const parsed = DeploymentStatusSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`${DEPLOY_LOG_PREFIX} poll response invalid issues=${JSON.stringify(parsed.error.issues)}`);
      throw new Error(`${DEPLOY_LOG_PREFIX} pollUntilReady: unexpected status response shape`);
    }
    const state = parsed.data.readyState ?? 'UNKNOWN';
    console.log(`${DEPLOY_LOG_PREFIX} poll id=${deploymentId} readyState=${state}`);

    if (state === 'READY') {
      return { url: parsed.data.url };
    }
    if (state === 'ERROR' || state === 'CANCELED') {
      throw new Error(`${DEPLOY_LOG_PREFIX} pollUntilReady: deployment ${deploymentId} ended in ${state}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${DEPLOY_LOG_PREFIX} pollUntilReady: timed out after ${pollTimeoutMs}ms (last state ${state})`,
      );
    }
    await sleep(pollIntervalMs);
  }
}
