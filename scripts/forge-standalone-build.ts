import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createStandaloneForgeProject } from '../engine/runtime/standalone-publisher';
import { attachLocalAssetSources } from '../engine/runtime/local-asset-sources';
import { buildLocalGameDefinition } from '../engine/runtime/local-generator';

const repoRoot = process.cwd();
const keepOutput = process.env['STANDALONE_BUILD_KEEP_OUTPUT'] === '1';
const prompt = process.env['STANDALONE_BUILD_PROMPT'] ?? 'neon arcade score attack';
const tempRoot = await mkdtemp(path.join(repoRoot, '.forge-standalone-build-'));
const logPrefix = '[forge-standalone-build]';

function viteBin(): string {
  const binName = process.platform === 'win32' ? 'vite.cmd' : 'vite';
  return path.join(repoRoot, 'node_modules', '.bin', binName);
}

try {
  const definition = attachLocalAssetSources(buildLocalGameDefinition(prompt));
  const exported = await createStandaloneForgeProject({
    definition,
    prompt,
    slug: `standalone-build-${Date.now().toString(36)}`,
    projectsDir: path.join(tempRoot, 'projects'),
    publicRuntimeDir: path.join(tempRoot, 'public-runtime'),
    repoRoot,
  });

  const vite = viteBin();
  if (!existsSync(vite)) {
    throw new Error(`Vite binary not found at ${vite}; run npm install first.`);
  }

  console.log(`${logPrefix} building ${exported.gameDir}`);
  const result = spawnSync(vite, ['build'], {
    cwd: exported.gameDir,
    env: {
      ...process.env,
      npm_config_update_notifier: 'false',
    },
    encoding: 'utf8',
    maxBuffer: 24 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`standalone Vite build failed with exit ${result.status ?? 'unknown'}`);
  }

  const distDir = path.join(exported.gameDir, 'dist');
  const distFiles = await readdir(distDir, { recursive: true });
  const hasIndex = distFiles.some((file) => file === 'index.html');
  const hasBundle = distFiles.some((file) => typeof file === 'string' && file.endsWith('.js'));
  if (!hasIndex || !hasBundle) {
    throw new Error(`standalone build output incomplete (index=${hasIndex}, js=${hasBundle})`);
  }

  console.log(`${logPrefix} PASS slug=${exported.slug} files=${distFiles.length}`);
} catch (error) {
  console.error(`${logPrefix} ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (keepOutput) {
    console.log(`${logPrefix} kept output at ${tempRoot}`);
  } else {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
