import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deployToVercel, type DeployResult, type DeployOptions } from '../compiler/vercel-deploy';
import { scaffoldGame } from '../compiler/game-scaffold';
import {
  parseGameDefinition,
  validateGameDefinitionReferences,
  type GameDefinition,
} from './game-definition';

const PUBLISH_LOG_PREFIX = '[engine/runtime/standalone-publisher]';

interface DeployToVercelLike {
  (options: DeployOptions): Promise<DeployResult>;
}

export interface StandaloneForgeProjectOptions {
  definition: unknown;
  prompt?: string | undefined;
  slug?: string | undefined;
  projectsDir?: string | undefined;
  repoRoot?: string | undefined;
  publicRuntimeDir?: string | undefined;
  deploy?: boolean | undefined;
  vercelToken?: string | undefined;
  teamId?: string | undefined;
  target?: 'production' | 'staging' | 'preview' | undefined;
  now?: Date | undefined;
  deployer?: DeployToVercelLike | undefined;
}

export interface StandaloneForgeProjectResult {
  ok: true;
  slug: string;
  gameDir: string;
  mainPath: string;
  manifestPath: string;
  runtimeFilesCopied: number;
  runtimeAssetsCopied: number;
  deploymentRequested: boolean;
  deployment?: DeployResult | undefined;
  deploymentSkippedReason?: string | undefined;
}

function defaultProjectsDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), 'generations', 'forge-runtime');
}

function defaultPublicRuntimeDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), 'public', 'runtime');
}

function runtimeSourcePaths(repoRoot: string | undefined): Array<{ source: string; target: string }> {
  const sourceRoot = repoRoot ? path.resolve(repoRoot) : undefined;
  return [
    {
      source: sourceRoot
        ? path.join(sourceRoot, 'engine', 'runtime', 'phaser', 'forge-game.ts')
        : path.resolve(
            /* turbopackIgnore: true */ process.cwd(),
            'engine',
            'runtime',
            'phaser',
            'forge-game.ts',
          ),
      target: 'engine/runtime/phaser/forge-game.ts',
    },
    {
      source: sourceRoot
        ? path.join(sourceRoot, 'engine', 'runtime', 'game-definition.ts')
        : path.resolve(/* turbopackIgnore: true */ process.cwd(), 'engine', 'runtime', 'game-definition.ts'),
      target: 'engine/runtime/game-definition.ts',
    },
    {
      source: sourceRoot
        ? path.join(sourceRoot, 'engine', 'storage', 'asset-url.ts')
        : path.resolve(/* turbopackIgnore: true */ process.cwd(), 'engine', 'storage', 'asset-url.ts'),
      target: 'engine/storage/asset-url.ts',
    },
  ];
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'forge-game'
  );
}

function safeRelativePath(value: string): string {
  const rel = value.replace(/^\/+/, '');
  const normalized = path.posix.normalize(rel);
  if (normalized === '.' || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    throw new Error(`${PUBLISH_LOG_PREFIX} unsafe runtime asset reference: ${value}`);
  }
  return normalized;
}

function runtimeRefs(definition: GameDefinition): string[] {
  return Array.from(
    new Set(
      definition.assets
        .map((asset) => asset.src)
        .filter((src): src is string => typeof src === 'string' && src.startsWith('runtime:'))
        .map((src) => safeRelativePath(src.slice('runtime:'.length))),
    ),
  );
}

async function copyIntoProject(source: string, gameDir: string, relativeTarget: string): Promise<string> {
  const target = path.join(gameDir, ...relativeTarget.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return target;
}

function standaloneMain(definition: GameDefinition): string {
  return `import './style.css';
import { createForgeGame } from './engine/runtime/phaser/forge-game';
import type { GameDefinition } from './engine/runtime/game-definition';

const definition = ${JSON.stringify(definition, null, 2)} satisfies GameDefinition;

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app mount node.');

createForgeGame(root, definition);
`;
}

function standaloneStyle(): string {
  return `html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
  background: #0d0f14;
}

#app {
  display: grid;
  place-items: stretch;
}

canvas {
  display: block;
}
`;
}

function publishManifest(args: {
  definition: GameDefinition;
  prompt: string | undefined;
  slug: string;
  createdAt: string;
  runtimeAssetsCopied: string[];
}): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'forge-runtime-standalone',
      slug: args.slug,
      title: args.definition.title,
      prompt: args.prompt ?? null,
      createdAt: args.createdAt,
      runtimeAssetsCopied: args.runtimeAssetsCopied,
      definition: args.definition,
    },
    null,
    2,
  )}\n`;
}

export async function createStandaloneForgeProject(
  options: StandaloneForgeProjectOptions,
): Promise<StandaloneForgeProjectResult> {
  const parsed = parseGameDefinition(options.definition);
  if (!parsed.ok) {
    throw new Error(`${PUBLISH_LOG_PREFIX} invalid GameDefinition: ${parsed.errors.join('; ')}`);
  }
  const definition = parsed.definition;
  const referenceErrors = validateGameDefinitionReferences(definition);
  if (referenceErrors.length > 0) {
    throw new Error(`${PUBLISH_LOG_PREFIX} invalid GameDefinition references: ${referenceErrors.join('; ')}`);
  }

  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : undefined;
  const projectsDir = options.projectsDir ? path.resolve(options.projectsDir) : defaultProjectsDir();
  const publicRuntimeDir = options.publicRuntimeDir
    ? path.resolve(options.publicRuntimeDir)
    : defaultPublicRuntimeDir();
  const createdAt = (options.now ?? new Date()).toISOString();
  const suffix = (options.now ?? new Date()).getTime().toString(36);
  const slug = slugify(options.slug ?? `${definition.title}-${suffix}`);

  console.log(`${PUBLISH_LOG_PREFIX} publish start slug=${slug} title="${definition.title}"`);
  const scaffold = await scaffoldGame(slug, { generationsDir: projectsDir, allowExisting: false });
  const gameDir = scaffold.gameRoot;

  const { createViteProject } = await import('../compiler/vite-creator');
  await createViteProject({
    gameDir,
    name: slug,
    title: definition.title,
    dependencies: {
      phaser: '^3.90.0',
      zod: '^4.4.3',
    },
  });

  const runtimeSources = runtimeSourcePaths(repoRoot);
  for (const file of runtimeSources) {
    await copyIntoProject(file.source, gameDir, file.target);
  }

  const copiedRuntimeAssets: string[] = [];
  const missingRuntimeAssets: string[] = [];
  for (const ref of runtimeRefs(definition)) {
    const source = path.join(publicRuntimeDir, ...ref.split('/'));
    try {
      await copyIntoProject(source, path.join(gameDir, 'public', 'runtime'), ref);
      copiedRuntimeAssets.push(ref);
    } catch {
      missingRuntimeAssets.push(ref);
    }
  }
  if (missingRuntimeAssets.length > 0) {
    throw new Error(`${PUBLISH_LOG_PREFIX} missing runtime assets: ${missingRuntimeAssets.join(', ')}`);
  }

  const mainPath = path.join(gameDir, 'main.ts');
  await writeFile(mainPath, standaloneMain(definition), 'utf8');
  await writeFile(path.join(gameDir, 'style.css'), standaloneStyle(), 'utf8');
  const manifestPath = path.join(gameDir, 'config', 'forge-runtime-publish.json');
  await writeFile(
    manifestPath,
    publishManifest({
      definition,
      prompt: options.prompt,
      slug,
      createdAt,
      runtimeAssetsCopied: copiedRuntimeAssets,
    }),
    'utf8',
  );

  let deployment: DeployResult | undefined;
  let deploymentSkippedReason: string | undefined;
  if (options.deploy === true) {
    const token = options.vercelToken ?? process.env['VERCEL_TOKEN'];
    if (!token || token.trim().length === 0) {
      deploymentSkippedReason = 'VERCEL_TOKEN is not configured.';
    } else {
      const deployer = options.deployer ?? deployToVercel;
      deployment = await deployer({
        gameDir,
        name: slug,
        token,
        teamId: options.teamId,
        target: options.target ?? 'production',
      });
    }
  }

  console.log(
    `${PUBLISH_LOG_PREFIX} publish done slug=${slug} runtimeFiles=${runtimeSources.length} runtimeAssets=${copiedRuntimeAssets.length}`,
  );
  return {
    ok: true,
    slug,
    gameDir,
    mainPath,
    manifestPath,
    runtimeFilesCopied: runtimeSources.length,
    runtimeAssetsCopied: copiedRuntimeAssets.length,
    deploymentRequested: options.deploy === true,
    deployment,
    deploymentSkippedReason,
  };
}
