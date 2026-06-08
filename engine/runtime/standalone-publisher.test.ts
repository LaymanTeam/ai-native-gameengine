import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStandaloneForgeProject } from './standalone-publisher';
import { attachLocalAssetSources } from './local-asset-sources';
import { buildLocalGameDefinition } from './local-generator';

const repoRoot = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-standalone-publisher-'));
const projectsDir = path.join(tempRoot, 'projects');
const publicRuntimeDir = path.join(tempRoot, 'public-runtime');
const definition = attachLocalAssetSources(buildLocalGameDefinition('neon arcade score attack'));

const exported = await createStandaloneForgeProject({
  definition,
  prompt: 'neon arcade score attack',
  slug: 'neon-arcade-export',
  projectsDir,
  publicRuntimeDir,
  repoRoot,
  now: new Date('2026-06-07T12:00:00.000Z'),
});

assert.equal(exported.ok, true);
assert.equal(exported.slug, 'neon-arcade-export');
assert.equal(exported.runtimeFilesCopied, 3);
assert.equal(exported.runtimeAssetsCopied, 0);
await fs.stat(path.join(exported.gameDir, 'engine', 'runtime', 'phaser', 'forge-game.ts'));
await fs.stat(path.join(exported.gameDir, 'engine', 'runtime', 'game-definition.ts'));
await fs.stat(path.join(exported.gameDir, 'engine', 'storage', 'asset-url.ts'));
await fs.stat(path.join(exported.gameDir, 'vite.config.ts'));
await fs.stat(path.join(exported.gameDir, 'style.css'));

const main = await fs.readFile(path.join(exported.gameDir, 'main.ts'), 'utf8');
assert.match(main, /createForgeGame/);
assert.match(main, /satisfies GameDefinition/);
assert.match(main, new RegExp(JSON.stringify(definition.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const pkg = JSON.parse(await fs.readFile(path.join(exported.gameDir, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
assert.equal(pkg.dependencies?.phaser, '^3.90.0');
assert.equal(pkg.dependencies?.zod, '^4.4.3');

const manifest = JSON.parse(await fs.readFile(exported.manifestPath, 'utf8')) as {
  kind?: string;
  slug?: string;
  prompt?: string;
  definition?: { title?: string };
};
assert.equal(manifest.kind, 'forge-runtime-standalone');
assert.equal(manifest.slug, 'neon-arcade-export');
assert.equal(manifest.prompt, 'neon arcade score attack');
assert.equal(manifest.definition?.title, definition.title);

const runtimeBackedDefinition = {
  ...definition,
  assets: definition.assets.map((asset, index) =>
    index === 0 ? { ...asset, src: 'runtime:forge/test-batch/sprites/hero.png' } : asset,
  ),
};
await fs.mkdir(path.join(publicRuntimeDir, 'forge', 'test-batch', 'sprites'), { recursive: true });
await fs.writeFile(path.join(publicRuntimeDir, 'forge', 'test-batch', 'sprites', 'hero.png'), 'png', 'utf8');
const copied = await createStandaloneForgeProject({
  definition: runtimeBackedDefinition,
  slug: 'runtime-backed-export',
  projectsDir,
  publicRuntimeDir,
  repoRoot,
  now: new Date('2026-06-07T12:01:00.000Z'),
});
assert.equal(copied.runtimeAssetsCopied, 1);
assert.equal(
  await fs.readFile(path.join(copied.gameDir, 'public', 'runtime', 'forge', 'test-batch', 'sprites', 'hero.png'), 'utf8'),
  'png',
);

await assert.rejects(
  () =>
    createStandaloneForgeProject({
      definition: {
        ...definition,
        assets: definition.assets.map((asset, index) =>
          index === 0 ? { ...asset, src: 'runtime:forge/missing/sprites/hero.png' } : asset,
        ),
      },
      slug: 'missing-runtime-export',
      projectsDir,
      publicRuntimeDir,
      repoRoot,
    }),
  /missing runtime assets: forge\/missing\/sprites\/hero\.png/,
);

const deployed = await createStandaloneForgeProject({
  definition,
  slug: 'deployed-export',
  projectsDir,
  publicRuntimeDir,
  repoRoot,
  deploy: true,
  vercelToken: 'test-token',
  deployer: async (options) => {
    assert.equal(options.name, 'deployed-export');
    assert.equal(options.gameDir.includes(path.join(projectsDir, 'deployed-export')), true);
    assert.equal(options.token, 'test-token');
    return {
      id: 'dpl_test',
      url: 'deployed-export.vercel.app',
      httpsUrl: 'https://deployed-export.vercel.app',
      readyState: 'READY',
    };
  },
});
assert.equal(deployed.deploymentRequested, true);
assert.equal(deployed.deployment?.httpsUrl, 'https://deployed-export.vercel.app');

const skippedDeploy = await createStandaloneForgeProject({
  definition,
  slug: 'skipped-deploy-export',
  projectsDir,
  publicRuntimeDir,
  repoRoot,
  deploy: true,
  vercelToken: '',
});
assert.equal(skippedDeploy.deploymentRequested, true);
assert.equal(skippedDeploy.deploymentSkippedReason, 'VERCEL_TOKEN is not configured.');

console.log('standalone-publisher.test.ts — all assertions passed');
