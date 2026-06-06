/**
 * LangChain tool: download fonts from the Google Fonts CDN into the game's assets/fonts/
 * (per generations/info.md "fonts/ -> download from google cdn provide route").
 *
 * Flow: hit the Google Fonts CSS API (https://fonts.googleapis.com/css2?family=...) with a
 * woff2-capable User-Agent, parse the returned @font-face blocks for woff2 URLs, download the
 * font files, and write a LICENSE.json. Google Fonts are released under OFL/Apache-2.0 — both
 * GPL-3.0 compatible — so the manifest records that provenance.
 *
 * Exposes plain async functions; the LangChain tool() wrapper lives in
 * engine/ai/tool-definitions.ts. A fetch implementation is injectable for offline testing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { FetchLike } from './sfx';

const FONTS_LOG_PREFIX = '[engine/tools/fetchers/fonts]';

/** woff2-advertising UA so the CSS API returns modern woff2 (not ttf) sources. */
const WOFF2_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export const FontFaceSchema = z.object({
  /** CSS font-family name. */
  family: z.string(),
  /** normal | italic etc. */
  style: z.string(),
  /** Numeric/keyword weight (e.g. 400, 700). */
  weight: z.string(),
  /** Unicode-range subset label when present (e.g. latin). */
  subset: z.string().optional(),
  /** Direct woff2 URL on the Google Fonts static CDN. */
  url: z.string().url(),
});
export type FontFace = z.infer<typeof FontFaceSchema>;

export const FontLicenseRecordSchema = z.object({
  file: z.string(),
  family: z.string(),
  style: z.string(),
  weight: z.string(),
  subset: z.string().optional(),
  url: z.string().url(),
  source: z.literal('google-fonts'),
  license: z.string(),
  fetchedAt: z.string(),
});
export type FontLicenseRecord = z.infer<typeof FontLicenseRecordSchema>;

export const FontFetchResultSchema = z.object({
  saved: z.array(FontLicenseRecordSchema),
  cssUrl: z.string().url(),
  licenseFile: z.string().optional(),
});
export type FontFetchResult = z.infer<typeof FontFetchResultSchema>;

/**
 * Build a Google Fonts CSS2 API URL for a family and weight set.
 * e.g. buildGoogleFontsCssUrl('Press Start 2P', [400]) →
 *   https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap
 */
export function buildGoogleFontsCssUrl(family: string, weights: number[] = [400]): string {
  if (!family || family.trim().length === 0) {
    throw new Error(`${FONTS_LOG_PREFIX} buildGoogleFontsCssUrl: family must be a non-empty string`);
  }
  const familyParam = family.trim().replace(/\s+/g, '+');
  const uniqueWeights = [...new Set(weights.filter((w) => Number.isFinite(w)))].sort((a, b) => a - b);
  const spec = uniqueWeights.length > 0 ? `${familyParam}:wght@${uniqueWeights.join(';')}` : familyParam;
  const params = new URLSearchParams();
  params.set('family', spec);
  params.set('display', 'swap');
  // URLSearchParams encodes ':' and '@'/'+' which the API rejects; restore them.
  const qs = params.toString().replace(/%3A/gi, ':').replace(/%40/gi, '@').replace(/%2B/gi, '+').replace(/%3B/gi, ';');
  return `https://fonts.googleapis.com/css2?${qs}`;
}

/**
 * Parse Google Fonts CSS (@font-face blocks) into FontFace records.
 * Each block carries a font-family, style, weight, optional /* subset *​/ comment, and a
 * woff2 url(...) src.
 */
export function parseGoogleFontsCss(css: string): FontFace[] {
  if (typeof css !== 'string' || css.length === 0) return [];
  const faces: FontFace[] = [];
  const blockRe = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    const subset = m[1]?.trim();
    const body = m[2] ?? '';
    const family = body.match(/font-family:\s*['"]?([^'";]+)['"]?\s*;/i)?.[1]?.trim();
    const style = body.match(/font-style:\s*([^;]+);/i)?.[1]?.trim() ?? 'normal';
    const weight = body.match(/font-weight:\s*([^;]+);/i)?.[1]?.trim() ?? '400';
    const url = body.match(/url\((https:\/\/[^)]+\.woff2)\)/i)?.[1]?.trim();
    if (!family || !url) continue;
    const face: FontFace = {
      family,
      style,
      weight,
      url,
      ...(subset ? { subset } : {}),
    };
    faces.push(face);
  }
  return faces;
}

/** Derive a deterministic filename for a font face. */
export function fontFileName(face: FontFace): string {
  const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const parts = [slug(face.family), face.weight, face.style];
  if (face.subset) parts.push(slug(face.subset));
  return `${parts.filter(Boolean).join('-')}.woff2`;
}

export interface FetchFontOptions {
  /** Weights to request (default [400]). */
  weights?: number[];
  /** Recorded license (Google Fonts are OFL-1.1 or Apache-2.0; default OFL-1.1). */
  license?: string;
  /** Injected fetch for testing. */
  fetchImpl?: FetchLike;
}

/**
 * Download a Google Font family into `destDir` and write LICENSE.json provenance.
 * Returns the parsed/saved faces. Throws when the CSS API request fails.
 */
export async function fetchFont(family: string, destDir: string, opts: FetchFontOptions = {}): Promise<FontFetchResult> {
  if (!family || family.trim().length === 0) {
    throw new Error(`${FONTS_LOG_PREFIX} fetchFont: family must be a non-empty string`);
  }
  if (!destDir || typeof destDir !== 'string') {
    throw new Error(`${FONTS_LOG_PREFIX} fetchFont: destDir must be a non-empty string`);
  }
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new Error(`${FONTS_LOG_PREFIX} fetchFont: no fetch implementation available`);
  }
  const license = opts.license ?? 'OFL-1.1';
  const cssUrl = buildGoogleFontsCssUrl(family, opts.weights ?? [400]);
  console.log(`${FONTS_LOG_PREFIX} fetchFont start family="${family}" url=${cssUrl}`);

  let css: string;
  try {
    const cssRes = await fetchImpl(cssUrl, { headers: { 'User-Agent': WOFF2_UA } });
    if (!cssRes.ok) throw new Error(`CSS HTTP ${cssRes.status}`);
    css = await cssRes.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${FONTS_LOG_PREFIX} fetchFont css failed family="${family}"`, message);
    throw new Error(`${FONTS_LOG_PREFIX} fetchFont: ${message}`);
  }

  const faces = parseGoogleFontsCss(css);
  if (faces.length === 0) {
    console.error(`${FONTS_LOG_PREFIX} fetchFont no @font-face parsed family="${family}"`);
    return { saved: [], cssUrl };
  }

  await mkdir(destDir, { recursive: true });
  const saved: FontLicenseRecord[] = [];
  const usedNames = new Set<string>();

  for (const face of faces) {
    let name = fontFileName(face);
    while (usedNames.has(name)) name = name.replace(/\.woff2$/, `-${usedNames.size}.woff2`);
    usedNames.add(name);
    const filePath = join(destDir, name);
    try {
      const res = await fetchImpl(face.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(filePath, buf);
      const record: FontLicenseRecord = {
        file: name,
        family: face.family,
        style: face.style,
        weight: face.weight,
        url: face.url,
        source: 'google-fonts',
        license,
        fetchedAt: new Date().toISOString(),
        ...(face.subset ? { subset: face.subset } : {}),
      };
      saved.push(record);
      console.log(`${FONTS_LOG_PREFIX} saved file=${name} bytes=${buf.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${FONTS_LOG_PREFIX} font download failed face=${name}`, message);
    }
  }

  let licenseFile: string | undefined;
  if (saved.length > 0) {
    licenseFile = join(destDir, 'LICENSE.json');
    await writeFile(licenseFile, JSON.stringify(saved, null, 2));
    console.log(`${FONTS_LOG_PREFIX} wrote provenance file=${licenseFile} entries=${saved.length}`);
  }

  console.log(`${FONTS_LOG_PREFIX} fetchFont done saved=${saved.length}`);
  return { saved, cssUrl, ...(licenseFile ? { licenseFile } : {}) };
}
