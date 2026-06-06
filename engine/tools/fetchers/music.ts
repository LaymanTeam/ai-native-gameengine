/**
 * LangChain tool: trawl open-source music libraries for tracks matching a mood/genre brief,
 * download into the game's assets/music/, and record license provenance. Called by the
 * search-and-get agent per generations/info.md.
 *
 * Primary sources (per generations/info.md):
 * - OpenGameArt: https://opengameart.org/art-search-advanced?keys=QUERY (filter art type =
 *   "music"; rejects NC/ND clauses — cleared for commercial reuse/remix)
 * - Kenney: https://kenney.nl/assets (mostly CC0)
 *
 * The engine is GPL-3.0; this fetcher REJECTS NonCommercial (NC), NoDerivatives (ND), and
 * GPL-incompatible licenses, recording `assets/music/LICENSE.json` provenance for keeps.
 *
 * License/search/download primitives are shared with the SFX fetcher (same OpenGameArt
 * machinery, different art-type filter). Exposes plain async functions; the LangChain tool()
 * wrappers live in engine/ai/tool-definitions.ts.
 */
import {
  AssetCandidateSchema,
  type AssetCandidate,
  type FetchLike,
  type FetchResult,
  buildOpenGameArtSearchUrl,
  parseOpenGameArtSearchResults,
  parseOpenGameArtDetail,
  downloadCandidates,
} from './sfx';

const MUSIC_LOG_PREFIX = '[engine/tools/fetchers/music]';

/** OpenGameArt art-type id for music (used as `field_art_type_tid` filter value). */
const OGA_MUSIC_TID = '12';

export interface FetchMusicOptions {
  /** Max number of detail pages to inspect from the OpenGameArt result list. */
  limit?: number;
  /** Injected fetch for testing. */
  fetchImpl?: FetchLike;
}

/**
 * Search OpenGameArt for music matching `query`, parse license-cleared candidates,
 * download them into `destDir`, and write LICENSE.json provenance.
 */
export async function fetchMusic(query: string, destDir: string, opts: FetchMusicOptions = {}): Promise<FetchResult> {
  if (!query || query.trim().length === 0) {
    throw new Error(`${MUSIC_LOG_PREFIX} fetchMusic: query must be a non-empty string`);
  }
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new Error(`${MUSIC_LOG_PREFIX} fetchMusic: no fetch implementation available`);
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 25));
  const searchUrl = buildOpenGameArtSearchUrl(query, OGA_MUSIC_TID);
  console.log(`${MUSIC_LOG_PREFIX} fetchMusic start query="${query}" limit=${limit} url=${searchUrl}`);

  const candidates: AssetCandidate[] = [];
  try {
    const searchRes = await fetchImpl(searchUrl);
    if (!searchRes.ok) throw new Error(`search HTTP ${searchRes.status}`);
    const searchHtml = await searchRes.text();
    const detailUrls = parseOpenGameArtSearchResults(searchHtml).slice(0, limit);
    console.log(`${MUSIC_LOG_PREFIX} found ${detailUrls.length} detail pages`);

    for (const detailUrl of detailUrls) {
      try {
        const detailRes = await fetchImpl(detailUrl);
        if (!detailRes.ok) continue;
        const detailHtml = await detailRes.text();
        const partial = parseOpenGameArtDetail(detailHtml, detailUrl);
        if (partial) {
          const candidate: AssetCandidate = AssetCandidateSchema.parse({ ...partial, source: 'opengameart' });
          candidates.push(candidate);
        }
      } catch (error) {
        console.error(`${MUSIC_LOG_PREFIX} detail fetch failed url=${detailUrl}`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${MUSIC_LOG_PREFIX} fetchMusic search failed`, message);
    throw new Error(`${MUSIC_LOG_PREFIX} fetchMusic: ${message}`);
  }

  // Music files are typically longer-form; default extension reflects common OGA uploads.
  const result = await downloadCandidates(candidates, destDir, { fetchImpl, fallbackExt: '.ogg' });
  console.log(`${MUSIC_LOG_PREFIX} fetchMusic done saved=${result.saved.length} rejected=${result.rejected.length}`);
  return result;
}
