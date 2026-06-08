/**
 * Writes the game's config/ JSON: one manifest entry per asset file binding it to the variable
 * name used in code, plus the styling JSON (per generations/info.md "config/ json files for each
 * asset tied to the variable used in code"). The review loop and coder agent both read this.
 *
 * Also provides the manifest-first contract's plain-code (non-agent) bidirectional validation:
 * every manifest key (code variable) must be referenced in the game's code, and every asset file
 * a manifest entry points to must exist on disk.
 */
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const MANIFEST_LOG_PREFIX = '[engine/compiler/asset-manifest]';

/** Output filenames inside the game's config/ directory. */
export const MANIFEST_FILENAME = 'assets.manifest.json';
export const STYLE_FILENAME = 'style.json';

/** Asset categories — mirror the assets/ subfolders defined in generations/info.md. */
export const ASSET_CATEGORIES = [
  'sprites',
  'background',
  'images',
  'sfx',
  'music',
  'scenes',
  'fonts',
  'text',
] as const;

export const AssetCategorySchema = z.enum(ASSET_CATEGORIES);
export type AssetCategory = z.infer<typeof AssetCategorySchema>;

/**
 * One asset binding: the code variable name -> the asset file on disk plus metadata.
 * `path` is relative to the game root (POSIX separators), e.g. "assets/sprites/hero.png".
 */
export const AssetEntrySchema = z
  .object({
    /** The variable/identifier the generated code uses to reference this asset. */
    variable: z
      .string()
      .min(1)
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, 'variable must be a valid JS identifier'),
    /** Asset file path relative to the game root, POSIX separators. */
    path: z.string().min(1),
    /** Asset category (assets/ subfolder). */
    category: AssetCategorySchema,
    /** Optional human-readable description for the coder/review agents. */
    description: z.string().optional(),
    /** Optional license provenance file path (relative to game root) — set by search-and-get. */
    license: z.string().optional(),
  })
  .strict();
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

/** The full manifest written to config/assets.manifest.json. */
export const AssetManifestSchema = z
  .object({
    game: z.string().min(1),
    generatedAt: z.string().min(1),
    /** Keyed by variable name for O(1) lookup + guaranteed key uniqueness. */
    assets: z.record(z.string(), AssetEntrySchema),
  })
  .strict();
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

/** Style bible JSON (config/style.json) — prepended to every image prompt per the pipeline contract. */
export const StyleManifestSchema = z
  .object({
    palette: z.array(z.string()).default([]),
    spriteResolution: z.string().optional(),
    perspective: z.string().optional(),
    outline: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type StyleManifest = z.infer<typeof StyleManifestSchema>;

/** A single validation problem. */
export interface ValidationIssue {
  kind: 'missing-asset' | 'unreferenced-key' | 'duplicate-path';
  variable: string;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(/* turbopackIgnore: true */ target);
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return false;
    }
    throw err;
  }
}

/**
 * Build a manifest object from a list of asset entries. Validates each entry through Zod, rejects
 * duplicate variable names, and stamps generatedAt. Does not touch disk.
 */
export function buildManifest(game: string, entries: readonly AssetEntry[]): AssetManifest {
  if (typeof game !== 'string' || game.length === 0) {
    const msg = `${MANIFEST_LOG_PREFIX} buildManifest requires a non-empty game name`;
    console.error(msg);
    throw new Error(msg);
  }
  if (!Array.isArray(entries)) {
    const msg = `${MANIFEST_LOG_PREFIX} buildManifest requires an array of entries`;
    console.error(msg);
    throw new Error(msg);
  }

  const assets: Record<string, AssetEntry> = {};
  for (const raw of entries) {
    const entry = AssetEntrySchema.parse(raw);
    if (Object.prototype.hasOwnProperty.call(assets, entry.variable)) {
      const msg = `${MANIFEST_LOG_PREFIX} duplicate variable name "${entry.variable}" in manifest`;
      console.error(msg);
      throw new Error(msg);
    }
    assets[entry.variable] = entry;
  }

  const manifest: AssetManifest = {
    game,
    generatedAt: new Date().toISOString(),
    assets,
  };
  const parsed = AssetManifestSchema.parse(manifest);
  console.log(
    `${MANIFEST_LOG_PREFIX} buildManifest game="${game}" entries=${Object.keys(parsed.assets).length}`,
  );
  return parsed;
}

/** Resolve the config/ directory of a game root. */
function configDir(gameRoot: string): string {
  return path.join(/* turbopackIgnore: true */ gameRoot, 'config');
}

/**
 * Write the manifest to <gameRoot>/config/assets.manifest.json. Returns the absolute path written.
 */
export async function writeManifest(gameRoot: string, manifest: AssetManifest): Promise<string> {
  if (typeof gameRoot !== 'string' || gameRoot.length === 0) {
    const msg = `${MANIFEST_LOG_PREFIX} writeManifest received invalid gameRoot`;
    console.error(msg);
    throw new Error(msg);
  }
  const validated = AssetManifestSchema.parse(manifest);
  const target = path.join(configDir(gameRoot), MANIFEST_FILENAME);
  try {
    await writeFile(/* turbopackIgnore: true */ target, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    console.log(`${MANIFEST_LOG_PREFIX} writeManifest success path="${target}"`);
    return target;
  } catch (err) {
    console.error(`${MANIFEST_LOG_PREFIX} writeManifest failed path="${target}":`, err);
    throw err;
  }
}

/** Read + validate the manifest from <gameRoot>/config/assets.manifest.json. */
export async function readManifest(gameRoot: string): Promise<AssetManifest> {
  const target = path.join(configDir(gameRoot), MANIFEST_FILENAME);
  try {
    const raw = await readFile(/* turbopackIgnore: true */ target, 'utf8');
    const parsed = AssetManifestSchema.parse(JSON.parse(raw));
    console.log(
      `${MANIFEST_LOG_PREFIX} readManifest success path="${target}" entries=${Object.keys(parsed.assets).length}`,
    );
    return parsed;
  } catch (err) {
    console.error(`${MANIFEST_LOG_PREFIX} readManifest failed path="${target}":`, err);
    throw err;
  }
}

/** Write the style bible to <gameRoot>/config/style.json. Returns absolute path. */
export async function writeStyle(gameRoot: string, style: StyleManifest): Promise<string> {
  if (typeof gameRoot !== 'string' || gameRoot.length === 0) {
    const msg = `${MANIFEST_LOG_PREFIX} writeStyle received invalid gameRoot`;
    console.error(msg);
    throw new Error(msg);
  }
  const validated = StyleManifestSchema.parse(style);
  const target = path.join(configDir(gameRoot), STYLE_FILENAME);
  try {
    await writeFile(/* turbopackIgnore: true */ target, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    console.log(`${MANIFEST_LOG_PREFIX} writeStyle success path="${target}"`);
    return target;
  } catch (err) {
    console.error(`${MANIFEST_LOG_PREFIX} writeStyle failed path="${target}":`, err);
    throw err;
  }
}

/** Read + validate the style bible from <gameRoot>/config/style.json. */
export async function readStyle(gameRoot: string): Promise<StyleManifest> {
  const target = path.join(configDir(gameRoot), STYLE_FILENAME);
  try {
    const raw = await readFile(/* turbopackIgnore: true */ target, 'utf8');
    const parsed = StyleManifestSchema.parse(JSON.parse(raw));
    console.log(`${MANIFEST_LOG_PREFIX} readStyle success path="${target}"`);
    return parsed;
  } catch (err) {
    console.error(`${MANIFEST_LOG_PREFIX} readStyle failed path="${target}":`, err);
    throw err;
  }
}

/** Recursively collect the text content of every file under a directory (skips dotfiles). */
async function collectCode(dir: string, acc: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(/* turbopackIgnore: true */ dir, { withFileTypes: true });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return;
    }
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(/* turbopackIgnore: true */ dir, entry.name);
    if (entry.isDirectory()) {
      await collectCode(full, acc);
    } else if (entry.isFile()) {
      acc.push(await readFile(/* turbopackIgnore: true */ full, 'utf8'));
    }
  }
}

/**
 * Bidirectional, plain-code validation of the manifest-first contract:
 *  1. missing-asset  — a manifest entry whose `path` does not exist on disk under gameRoot.
 *  2. unreferenced-key — a manifest variable name that appears in NONE of the code under
 *                        systems/, ui/, render/, and main.ts.
 *  3. duplicate-path — two entries pointing at the same asset file.
 *
 * Returns { ok, issues }. No agent involved.
 */
export async function validateManifest(
  gameRoot: string,
  manifest: AssetManifest,
): Promise<ValidationResult> {
  if (typeof gameRoot !== 'string' || gameRoot.length === 0) {
    const msg = `${MANIFEST_LOG_PREFIX} validateManifest received invalid gameRoot`;
    console.error(msg);
    throw new Error(msg);
  }
  const validated = AssetManifestSchema.parse(manifest);
  const issues: ValidationIssue[] = [];

  // Collect all code that may reference asset variables.
  const codeChunks: string[] = [];
  for (const dir of ['systems', 'ui', 'render']) {
    await collectCode(path.join(/* turbopackIgnore: true */ gameRoot, dir), codeChunks);
  }
  const mainPath = path.join(/* turbopackIgnore: true */ gameRoot, 'main.ts');
  if (await pathExists(mainPath)) {
    codeChunks.push(await readFile(/* turbopackIgnore: true */ mainPath, 'utf8'));
  }
  const code = codeChunks.join('\n');

  const seenPaths = new Map<string, string>();

  for (const [variable, entry] of Object.entries(validated.assets)) {
    // 1. asset existence on disk
    const assetAbs = path.join(/* turbopackIgnore: true */ gameRoot, entry.path);
    if (!(await pathExists(assetAbs))) {
      issues.push({
        kind: 'missing-asset',
        variable,
        detail: `asset file not found on disk: ${entry.path}`,
      });
    }

    // 3. duplicate path
    const prior = seenPaths.get(entry.path);
    if (prior !== undefined) {
      issues.push({
        kind: 'duplicate-path',
        variable,
        detail: `path "${entry.path}" already bound to variable "${prior}"`,
      });
    } else {
      seenPaths.set(entry.path, variable);
    }

    // 2. referenced in code — whole-word match on the variable identifier
    const ref = new RegExp(`\\b${escapeRegExp(variable)}\\b`);
    if (!ref.test(code)) {
      issues.push({
        kind: 'unreferenced-key',
        variable,
        detail: `manifest variable "${variable}" is not referenced in systems/, ui/, render/, or main.ts`,
      });
    }
  }

  const ok = issues.length === 0;
  if (ok) {
    console.log(
      `${MANIFEST_LOG_PREFIX} validateManifest OK game="${validated.game}" entries=${Object.keys(validated.assets).length}`,
    );
  } else {
    console.warn(
      `${MANIFEST_LOG_PREFIX} validateManifest FAILED game="${validated.game}" issues=${issues.length}`,
      issues,
    );
  }
  return { ok, issues };
}

/** Escape a string for safe inclusion in a RegExp source. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
