/**
 * Shared plumbing for the phase pipelines (engine/ai/pipelines/*).
 * Pipelines are deterministic CHAINS: plain code that sequences work and invokes
 * subagents only at the steps that need model judgment. Phase state lives on disk
 * in the game folder, keyed by slug — stateless across serverless invocations.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defaultGenerationsDir } from '../../compiler/game-scaffold';
import {
  AssetEntrySchema,
  buildManifest,
  readManifest,
  writeManifest,
  type AssetEntry,
  type AssetManifest,
  type ValidationIssue,
} from '../../compiler/asset-manifest';
import { StyleBibleSchema, type StyleBible } from '../../tools/visualizers/visual-direction';

export const PIPELINES_LOG_PREFIX = '[engine/ai/pipelines]';
export const STYLE_BIBLE_FILENAME = 'style-bible.json';
export const VERIFICATION_FILENAME = 'verification.json';

/** Resolve a game slug to its absolute root; throws on traversal attempts. */
export function resolveGameRoot(game: string, generationsDir?: string): string {
  const slug = game.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`${PIPELINES_LOG_PREFIX} invalid game slug: ${JSON.stringify(game)}`);
  }
  return path.join(generationsDir ?? defaultGenerationsDir(), slug);
}

/** Guarded resolve of a path INSIDE a game root (blocks ../ escapes). */
export function resolveInside(gameRoot: string, relative: string): string {
  const abs = path.resolve(gameRoot, relative);
  if (abs !== gameRoot && !abs.startsWith(gameRoot + path.sep)) {
    throw new Error(`${PIPELINES_LOG_PREFIX} path escapes game root: ${relative}`);
  }
  return abs;
}

export async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Load the game's style bible; null if not set (or invalid on disk — logged). */
export async function loadStyleBible(gameRoot: string): Promise<StyleBible | null> {
  const raw = await readJsonIfExists<unknown>(path.join(gameRoot, 'config', STYLE_BIBLE_FILENAME));
  if (raw === null) return null;
  const parsed = StyleBibleSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`${PIPELINES_LOG_PREFIX} style bible on disk failed validation`, parsed.error.issues);
    return null;
  }
  return parsed.data;
}

/** Read manifest or start an empty one (first asset of the game). */
export async function readOrInitManifest(gameRoot: string, game: string): Promise<AssetManifest> {
  try {
    return await readManifest(gameRoot);
  } catch {
    return buildManifest(game, []);
  }
}

/** Append entries to the on-disk manifest (re-validating the whole set via buildManifest). */
export async function appendManifestEntries(
  gameRoot: string,
  game: string,
  entries: AssetEntry[],
): Promise<AssetManifest> {
  const current = await readOrInitManifest(gameRoot, game);
  const merged = buildManifest(game, [...Object.values(current.assets), ...entries]);
  await writeManifest(gameRoot, merged);
  return merged;
}

/** Derive a valid JS identifier from a file name (for auto-registered fetched assets). */
export function identifierFromFileName(fileName: string, prefix: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_$]/g, '_');
  const id = /^[A-Za-z_$]/.test(base) ? base : `${prefix}_${base}`;
  return id.length > 0 ? id : `${prefix}_asset`;
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.kind}: ${i.detail}`).join('; ');
}

export { AssetEntrySchema };
