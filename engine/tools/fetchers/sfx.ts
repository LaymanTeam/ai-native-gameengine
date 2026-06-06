/**
 * LangChain tool: trawl open-source SFX libraries for sound effects matching a description,
 * download into the game's assets/sfx/, and record license provenance. Called by the
 * search-and-get agent per generations/info.md.
 *
 * Primary sources (per generations/info.md):
 * - OpenGameArt: https://opengameart.org/art-search-advanced?keys=QUERY (filter art type =
 *   "sound effect"; rejects NC/ND so everything is cleared for commercial reuse/remix)
 * - Kenney: https://kenney.nl/assets (mostly CC0 — no attribution needed)
 *
 * The engine is GPL-3.0; this fetcher REJECTS NonCommercial (NC), NoDerivatives (ND), and
 * any GPL-incompatible license before downloading, and records `assets/sfx/LICENSE.json`
 * provenance for everything it keeps.
 *
 * Exposes plain async functions (LangChain tool() wrappers live in
 * engine/ai/tool-definitions.ts). A fetch implementation is injectable for offline testing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import * as z from 'zod';

const SFX_LOG_PREFIX = '[engine/tools/fetchers/sfx]';

/** OpenGameArt art-type id for sound effects (used as `field_art_type_tid` filter value). */
const OGA_SOUND_EFFECT_TID = '13';

/** Injectable fetch — defaults to the global fetch, overridable in tests for offline runs. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A single license-cleared candidate discovered on a source site. */
export const AssetCandidateSchema = z.object({
  /** Human title of the asset entry. */
  title: z.string(),
  /** Direct download URL of the audio file. */
  downloadUrl: z.string().url(),
  /** Page the asset was discovered on (provenance). */
  sourceUrl: z.string().url(),
  /** Source site identifier. */
  source: z.enum(['opengameart', 'kenney']),
  /** Normalized license id (e.g. CC0-1.0, CC-BY-4.0). */
  license: z.string(),
  /** Author/attribution string when known. */
  author: z.string().optional(),
});
export type AssetCandidate = z.infer<typeof AssetCandidateSchema>;

/** Provenance record persisted as assets/sfx/LICENSE.json (array of these). */
export const LicenseRecordSchema = z.object({
  file: z.string(),
  title: z.string(),
  source: z.enum(['opengameart', 'kenney']),
  sourceUrl: z.string().url(),
  downloadUrl: z.string().url(),
  license: z.string(),
  author: z.string().optional(),
  attributionRequired: z.boolean(),
  fetchedAt: z.string(),
});
export type LicenseRecord = z.infer<typeof LicenseRecordSchema>;

export const FetchResultSchema = z.object({
  saved: z.array(LicenseRecordSchema),
  rejected: z.array(z.object({ title: z.string(), license: z.string(), reason: z.string() })),
  licenseFile: z.string().optional(),
});
export type FetchResult = z.infer<typeof FetchResultSchema>;

/* ----------------------------------------------------------------------------------------- *
 * License policy (GPL-3.0 compatible). Shared semantics intentionally duplicated across the
 * audio fetchers so each file stays self-contained per the engine's tool layout.
 * ----------------------------------------------------------------------------------------- */

/** Normalize an arbitrary license label found on a page into a canonical token. */
export function normalizeLicense(raw: string): string {
  const s = (raw ?? '').trim();
  if (s.length === 0) return 'UNKNOWN';
  const u = s.toUpperCase().replace(/\s+/g, ' ');
  if (/(^|\W)CC0(\W|$)|PUBLIC DOMAIN|CC-?0/.test(u)) return 'CC0-1.0';
  // Order matters: detect NC/ND/SA combinations before plain BY.
  const ver = u.match(/(\d\.\d)/)?.[1] ?? '';
  const tag = (suffix: string) => (ver ? `CC-${suffix}-${ver}` : `CC-${suffix}`);
  if (/BY[- ]?NC[- ]?SA/.test(u)) return tag('BY-NC-SA');
  if (/BY[- ]?NC[- ]?ND/.test(u)) return tag('BY-NC-ND');
  if (/BY[- ]?NC/.test(u)) return tag('BY-NC');
  if (/BY[- ]?ND/.test(u)) return tag('BY-ND');
  if (/BY[- ]?SA/.test(u)) return tag('BY-SA');
  if (/CC[- ]?BY/.test(u) || /\bATTRIBUTION\b/.test(u)) return tag('BY');
  if (/GPL[- ]?3/.test(u)) return 'GPL-3.0';
  if (/GPL[- ]?2/.test(u)) return 'GPL-2.0';
  if (/LGPL/.test(u)) return 'LGPL';
  if (/\bMIT\b/.test(u)) return 'MIT';
  if (/\bBSD\b/.test(u)) return 'BSD';
  if (/\bOFL\b|OPEN FONT LICENSE/.test(u)) return 'OFL-1.1';
  return s;
}

/**
 * Decide whether a license is acceptable for a GPL-3.0 work.
 * REJECTS NonCommercial (NC) and NoDerivatives (ND); rejects GPL-2.0-only and UNKNOWN.
 */
export function isLicenseAcceptable(license: string): { ok: boolean; reason: string; attributionRequired: boolean } {
  const norm = normalizeLicense(license);
  const u = norm.toUpperCase();
  if (u.includes('NC')) return { ok: false, reason: 'NonCommercial (NC) clause — incompatible', attributionRequired: false };
  if (u.includes('ND')) return { ok: false, reason: 'NoDerivatives (ND) clause — incompatible', attributionRequired: false };
  if (u === 'UNKNOWN') return { ok: false, reason: 'license could not be determined', attributionRequired: false };
  // GPL-2.0-only is incompatible with GPL-3.0; treat bare GPL-2.0 as rejected.
  if (u === 'GPL-2.0') return { ok: false, reason: 'GPL-2.0-only is incompatible with GPL-3.0', attributionRequired: false };
  // CC-BY-SA: ONLY 4.0 is (one-way) GPLv3-compatible per Creative Commons' compatibility
  // declaration; ShareAlike 1.0–3.0 cannot be relicensed under GPL-3.0.
  if (u.startsWith('CC-BY-SA') && u !== 'CC-BY-SA-4.0') {
    return { ok: false, reason: `${norm}: only CC-BY-SA-4.0 is GPLv3-compatible (one-way)`, attributionRequired: false };
  }
  const attributionRequired = u.startsWith('CC-BY') || u === 'OFL-1.1' || u === 'MIT' || u === 'BSD';
  const accepted = [
    'CC0-1.0',
    'GPL-3.0',
    'LGPL',
    'MIT',
    'BSD',
    'OFL-1.1',
  ];
  if (accepted.includes(u) || u.startsWith('CC-BY')) {
    return { ok: true, reason: 'GPL-3.0 compatible', attributionRequired };
  }
  return { ok: false, reason: `unrecognized/incompatible license: ${norm}`, attributionRequired: false };
}

/* ----------------------------------------------------------------------------------------- *
 * OpenGameArt search parsing.
 * ----------------------------------------------------------------------------------------- */

/** Build the OpenGameArt advanced-search URL for a query and art-type tid. */
export function buildOpenGameArtSearchUrl(query: string, artTypeTid: string): string {
  const params = new URLSearchParams({ keys: query, field_art_type_tid: artTypeTid });
  return `https://opengameart.org/art-search-advanced?${params.toString()}`;
}

/** Resolve a possibly-relative OpenGameArt href against the site origin. */
function absoluteOgaUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `https://opengameart.org${href.startsWith('/') ? '' : '/'}${href}`;
}

/**
 * Parse OpenGameArt search-results HTML into candidate detail-page links.
 * Returns absolute URLs to /content/<slug> pages.
 */
export function parseOpenGameArtSearchResults(html: string): string[] {
  if (typeof html !== 'string' || html.length === 0) return [];
  const links = new Set<string>();
  const re = /href="(\/content\/[^"#?]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (href) links.add(absoluteOgaUrl(href));
  }
  return [...links];
}

/**
 * Parse an OpenGameArt content detail page into a candidate (license + first file link).
 * Returns undefined when no downloadable file or no license can be extracted.
 */
export function parseOpenGameArtDetail(html: string, sourceUrl: string): Omit<AssetCandidate, 'source'> | undefined {
  if (typeof html !== 'string' || html.length === 0) return undefined;

  const title = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ?? html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? sourceUrl;

  // OpenGameArt lists each license in markup like: title="Creative Commons - CC0" or link text.
  const licenseMatch =
    html.match(/license[^>]*>\s*([^<]*(?:CC0|CC[- ]?BY[^<]*|GPL[^<]*|OGA[^<]*))/i)?.[1] ??
    html.match(/(CC0|CC[- ]?BY(?:[- ]?SA|[- ]?NC|[- ]?ND)*(?:\s*\d\.\d)?|GPL\s*\d(?:\.\d)?|Public Domain)/i)?.[1] ??
    '';
  const license = normalizeLicense(licenseMatch);

  // First attached file: links under /sites/default/files/... are the downloadable assets.
  const fileHref = html.match(/href="(https?:\/\/opengameart\.org\/sites\/default\/files\/[^"]+|\/sites\/default\/files\/[^"]+)"/i)?.[1];
  if (!fileHref) return undefined;
  const downloadUrl = absoluteOgaUrl(fileHref);

  const author = html.match(/Author[^>]*>\s*<[^>]*>([^<]+)</i)?.[1]?.trim();

  const candidate: Omit<AssetCandidate, 'source'> = {
    title,
    downloadUrl,
    sourceUrl,
    license,
    ...(author ? { author } : {}),
  };
  return candidate;
}

/* ----------------------------------------------------------------------------------------- *
 * Download + provenance.
 * ----------------------------------------------------------------------------------------- */

/** Derive a safe filename from a URL, defaulting extension when none is present. */
export function fileNameFromUrl(url: string, fallbackExt = '.ogg'): string {
  try {
    const path = new URL(url).pathname;
    let name = basename(decodeURIComponent(path)) || `asset${fallbackExt}`;
    name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!extname(name)) name += fallbackExt;
    return name;
  } catch {
    return `asset${fallbackExt}`;
  }
}

/**
 * Download accepted candidates into `destDir` and write `LICENSE.json` provenance.
 * Skips candidates whose license fails the GPL-3.0 policy. Pure I/O over an injected fetch.
 */
export async function downloadCandidates(
  candidates: AssetCandidate[],
  destDir: string,
  opts: { fetchImpl?: FetchLike; fallbackExt?: string } = {},
): Promise<FetchResult> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new Error(`${SFX_LOG_PREFIX} downloadCandidates: no fetch implementation available`);
  }
  if (!destDir || typeof destDir !== 'string') {
    throw new Error(`${SFX_LOG_PREFIX} downloadCandidates: destDir must be a non-empty string`);
  }

  await mkdir(destDir, { recursive: true });
  const saved: LicenseRecord[] = [];
  const rejected: FetchResult['rejected'] = [];
  const usedNames = new Set<string>();

  for (const candidate of candidates ?? []) {
    const parsed = AssetCandidateSchema.safeParse(candidate);
    if (!parsed.success) {
      console.error(`${SFX_LOG_PREFIX} skip invalid candidate`, parsed.error.issues);
      rejected.push({ title: String((candidate as { title?: string })?.title ?? 'unknown'), license: 'INVALID', reason: 'schema validation failed' });
      continue;
    }
    const c = parsed.data;
    const verdict = isLicenseAcceptable(c.license);
    if (!verdict.ok) {
      console.log(`${SFX_LOG_PREFIX} reject title="${c.title}" license=${c.license} reason="${verdict.reason}"`);
      rejected.push({ title: c.title, license: c.license, reason: verdict.reason });
      continue;
    }

    let name = fileNameFromUrl(c.downloadUrl, opts.fallbackExt ?? '.ogg');
    while (usedNames.has(name)) {
      const ext = extname(name);
      name = `${basename(name, ext)}_${usedNames.size}${ext}`;
    }
    usedNames.add(name);
    const filePath = join(destDir, name);

    try {
      const res = await fetchImpl(c.downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(filePath, buf);
      const record: LicenseRecord = {
        file: name,
        title: c.title,
        source: c.source,
        sourceUrl: c.sourceUrl,
        downloadUrl: c.downloadUrl,
        license: c.license,
        ...(c.author ? { author: c.author } : {}),
        attributionRequired: verdict.attributionRequired,
        fetchedAt: new Date().toISOString(),
      };
      saved.push(record);
      console.log(`${SFX_LOG_PREFIX} saved file=${name} bytes=${buf.length} license=${c.license}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${SFX_LOG_PREFIX} download failed title="${c.title}" url=${c.downloadUrl}`, message);
      rejected.push({ title: c.title, license: c.license, reason: `download failed: ${message}` });
    }
  }

  let licenseFile: string | undefined;
  if (saved.length > 0) {
    licenseFile = join(destDir, 'LICENSE.json');
    await writeFile(licenseFile, JSON.stringify(saved, null, 2));
    console.log(`${SFX_LOG_PREFIX} wrote provenance file=${licenseFile} entries=${saved.length}`);
  }

  return { saved, rejected, ...(licenseFile ? { licenseFile } : {}) };
}

/* ----------------------------------------------------------------------------------------- *
 * Top-level orchestration.
 * ----------------------------------------------------------------------------------------- */

export interface FetchSfxOptions {
  /** Max number of detail pages to inspect from the OpenGameArt result list. */
  limit?: number;
  /** Injected fetch for testing. */
  fetchImpl?: FetchLike;
}

/**
 * Search OpenGameArt for sound effects matching `query`, parse license-cleared candidates,
 * download them into `destDir`, and write LICENSE.json provenance.
 */
export async function fetchSfx(query: string, destDir: string, opts: FetchSfxOptions = {}): Promise<FetchResult> {
  if (!query || query.trim().length === 0) {
    throw new Error(`${SFX_LOG_PREFIX} fetchSfx: query must be a non-empty string`);
  }
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new Error(`${SFX_LOG_PREFIX} fetchSfx: no fetch implementation available`);
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 25));
  const searchUrl = buildOpenGameArtSearchUrl(query, OGA_SOUND_EFFECT_TID);
  console.log(`${SFX_LOG_PREFIX} fetchSfx start query="${query}" limit=${limit} url=${searchUrl}`);

  const candidates: AssetCandidate[] = [];
  try {
    const searchRes = await fetchImpl(searchUrl);
    if (!searchRes.ok) throw new Error(`search HTTP ${searchRes.status}`);
    const searchHtml = await searchRes.text();
    const detailUrls = parseOpenGameArtSearchResults(searchHtml).slice(0, limit);
    console.log(`${SFX_LOG_PREFIX} found ${detailUrls.length} detail pages`);

    for (const detailUrl of detailUrls) {
      try {
        const detailRes = await fetchImpl(detailUrl);
        if (!detailRes.ok) continue;
        const detailHtml = await detailRes.text();
        const partial = parseOpenGameArtDetail(detailHtml, detailUrl);
        if (partial) candidates.push({ ...partial, source: 'opengameart' });
      } catch (error) {
        console.error(`${SFX_LOG_PREFIX} detail fetch failed url=${detailUrl}`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${SFX_LOG_PREFIX} fetchSfx search failed`, message);
    throw new Error(`${SFX_LOG_PREFIX} fetchSfx: ${message}`);
  }

  const result = await downloadCandidates(candidates, destDir, { fetchImpl, fallbackExt: '.ogg' });
  console.log(`${SFX_LOG_PREFIX} fetchSfx done saved=${result.saved.length} rejected=${result.rejected.length}`);
  return result;
}
