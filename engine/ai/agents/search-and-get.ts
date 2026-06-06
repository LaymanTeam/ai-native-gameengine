/**
 * Search-and-get agent — trawls open-source asset libraries for sfx, music, and art, then records
 * license provenance. Primary domains per generations/info.md:
 *   - OpenGameArt: https://opengameart.org/art-search-advanced?keys=QUERY (rejects NC/ND clauses)
 *   - Kenney:      https://kenney.nl/assets (mostly CC0)
 * Every fetched asset gets an assets/**\/LICENSE.json provenance record. GPL-incompatible licenses
 * (NC, ND, proprietary, unknown) are filtered out — the engine ships under GPL-3.0.
 *
 * Architecture: LangChain v1 `createAgent` (LangGraph loop) — same pattern as director.ts.
 * No custom state machine. Uses the search-grounded model from engine/ai/providers.ts to discover
 * candidates; actual fetch/download tools (engine/tools/fetchers/*) are INJECTED — never imported
 * here. The license-filter and provenance helpers are pure and live in this module so the agent's
 * GPL-safety guarantee is deterministic, not model-judged. Research:
 * research/langchain-agents-chains-gemini.md, research/vercel-langchain-gemini.md, generations/info.md.
 */
import { createAgent, tool } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import * as z from 'zod';
import { createConversationModel, createSearchGroundedModel } from '../providers';

export const SEARCH_AND_GET_LOG_PREFIX = '[engine/ai/agents/search-and-get]';

/** Curated source domains the agent prefers (no-NC/ND OpenGameArt, CC0 Kenney). */
export const PRIMARY_ASSET_SOURCES = {
  openGameArt: 'https://opengameart.org/art-search-advanced?keys=',
  kenney: 'https://kenney.nl/assets',
} as const;

/** License provenance record written alongside each fetched asset (assets/**\/LICENSE.json). */
export const licenseRecordSchema = z.object({
  asset: z.string().min(1).describe('Relative path of the asset file this record covers'),
  source: z.string().min(1).describe('Origin domain/site, e.g. "opengameart.org"'),
  sourceUrl: z.string().min(1).describe('Direct URL to the asset page'),
  author: z.string().min(1).describe('Original author/creator (or "unknown")'),
  license: z.string().min(1).describe('License identifier, e.g. "CC0-1.0", "CC-BY-4.0", "GPL-3.0"'),
  attributionRequired: z.boolean().describe('Whether the license requires attribution in-game'),
  retrievedAt: z.string().min(1).describe('ISO-8601 timestamp of retrieval'),
});

export type LicenseRecord = z.infer<typeof licenseRecordSchema>;

/**
 * License identifiers known to be GPL-3.0 compatible for bundled game assets. CC0/PD and CC-BY are
 * compatible; GPL itself is. NC (NonCommercial) and ND (NoDerivatives) clauses are NOT — the engine
 * rejects them per generations/info.md. Anything unrecognized is treated as incompatible.
 */
export const GPL_COMPATIBLE_LICENSES = [
  'CC0-1.0',
  'CC0',
  'PUBLIC-DOMAIN',
  'CC-BY-3.0',
  'CC-BY-4.0',
  // CC-BY-SA: ONLY 4.0 is (one-way) GPLv3-compatible; SA 1.0–3.0 are NOT relicensable to GPL-3.0.
  'CC-BY-SA-4.0',
  // GPL-2.0-only is NOT GPL-3.0 compatible; only GPL-3.0 (and LGPL) belong here.
  'GPL-3.0',
  'LGPL-3.0',
  'OFL-1.1',
  'MIT',
  'APACHE-2.0',
] as const;

/** Normalize a license string for matching: uppercase, trim, collapse separators. Pure. */
export function normalizeLicense(license: string): string {
  return (license ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');
}

/**
 * Deterministic GPL-compatibility check. Rejects any license bearing an NC or ND clause, and any
 * identifier not on the allow-list. Pure + testable — this is the agent's safety guarantee.
 */
export function isGplCompatibleLicense(license: string): boolean {
  const norm = normalizeLicense(license);
  if (norm.length === 0) return false;
  // Hard reject NonCommercial / NoDerivatives in any form (e.g. CC-BY-NC, CC-BY-ND, CC-BY-NC-ND).
  if (norm.includes('-NC') || norm.includes('-ND')) return false;
  return (GPL_COMPATIBLE_LICENSES as readonly string[]).includes(norm);
}

/**
 * Filter a batch of license records to the GPL-compatible ones, returning kept + rejected sets so
 * the caller can log/escalate rejections. Pure + testable.
 */
export function filterCompatibleAssets(records: LicenseRecord[]): {
  kept: LicenseRecord[];
  rejected: Array<{ record: LicenseRecord; reason: string }>;
} {
  const kept: LicenseRecord[] = [];
  const rejected: Array<{ record: LicenseRecord; reason: string }> = [];
  for (const record of records ?? []) {
    if (isGplCompatibleLicense(record.license)) {
      kept.push(record);
    } else {
      rejected.push({ record, reason: `License "${record.license}" is not GPL-3.0 compatible` });
    }
  }
  console.log(
    `${SEARCH_AND_GET_LOG_PREFIX} filterCompatibleAssets kept=${kept.length} rejected=${rejected.length}`,
  );
  return { kept, rejected };
}

/** Build the OpenGameArt advanced-search URL for a query. Pure + testable. */
export function openGameArtSearchUrl(query: string): string {
  return `${PRIMARY_ASSET_SOURCES.openGameArt}${encodeURIComponent((query ?? '').trim())}`;
}

/**
 * Local license-check tool — lets the agent validate a candidate's license deterministically before
 * committing to a download (the model never decides GPL-compatibility itself).
 */
export function makeLicenseCheckTool(): StructuredToolInterface {
  return tool(
    ({ license }: { license: string }) => {
      const compatible = isGplCompatibleLicense(license);
      console.log(`${SEARCH_AND_GET_LOG_PREFIX} license_check "${license}" compatible=${compatible}`);
      return compatible
        ? `License "${license}" is GPL-3.0 compatible — safe to fetch.`
        : `License "${license}" is NOT GPL-3.0 compatible (NC/ND/unknown). Do not fetch; find another asset.`;
    },
    {
      name: 'check_license',
      description:
        'Deterministically check whether an asset license is GPL-3.0 compatible BEFORE fetching. ' +
        'Reject anything with NonCommercial (NC) or NoDerivatives (ND) clauses or an unknown license.',
      schema: z.object({
        license: z.string().describe('License identifier, e.g. "CC0-1.0", "CC-BY-NC-4.0"'),
      }),
    },
  ) as unknown as StructuredToolInterface;
}

const SYSTEM_PROMPT =
  'You are the search-and-get agent for an AI game engine. Find open-source sfx, music, and art for ' +
  'the game from OpenGameArt (https://opengameart.org/art-search-advanced?keys=QUERY — it rejects ' +
  'NC/ND, so it is reuse-safe) and Kenney (https://kenney.nl/assets — mostly CC0). ' +
  'For EVERY candidate: call check_license first and only fetch GPL-3.0-compatible assets ' +
  '(reject NonCommercial/NoDerivatives/unknown). When you fetch an asset, record its license ' +
  'provenance (source, author, license, attribution, URL) so a LICENSE.json sits beside it. ' +
  'Prefer CC0 to minimize attribution burden. Be concrete; cite exact source URLs.';

/** Module-scoped checkpointer so a multi-turn asset trawl keeps context across warm invocations. */
const checkpointer = new MemorySaver();

export interface SearchAndGetAgentOptions {
  /** Injected fetch/download tools (engine/tools/fetchers/*). Optional; defaults to none. */
  tools?: StructuredToolInterface[];
}

/**
 * Build the search-and-get agent. The deterministic license-check tool is always present; fetcher
 * tools are injected by the caller.
 */
/**
 * Grounded asset-source research as a function tool: createAgent rejects pre-bound models
 * (MultipleToolsBoundError) and Gemini cannot mix googleSearch with function tools, so the
 * grounded model is invoked inside a tool rather than being the agent model.
 */
export function makeGroundedAssetSearchTool() {
  return tool(
    async ({ query }: { query: string }) => {
      console.log(`${SEARCH_AND_GET_LOG_PREFIX} grounded_asset_search query=${query}`);
      try {
        const response = await createSearchGroundedModel().invoke(query);
        const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        console.log(`${SEARCH_AND_GET_LOG_PREFIX} grounded_asset_search ok chars=${text.length}`);
        return text;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${SEARCH_AND_GET_LOG_PREFIX} grounded_asset_search failed error=${message}`);
        return `Search failed: ${message}`;
      }
    },
    {
      name: 'grounded_asset_search',
      description:
        'Google-Search-grounded Gemini query for open-source game assets (OpenGameArt, Kenney) and their license terms.',
      schema: z.object({ query: z.string().min(1).describe('Asset search question to ground in web results.') }),
    },
  );
}

export function createSearchAndGetAgent(options: SearchAndGetAgentOptions = {}) {
  const injected = options.tools ?? [];
  const tools = [...injected, makeLicenseCheckTool(), makeGroundedAssetSearchTool()];
  console.log(`${SEARCH_AND_GET_LOG_PREFIX} create toolCount=${tools.length}`);
  return createAgent({
    model: createConversationModel(),
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer,
  });
}

/** Config helper: checkpointer keys the trawl by thread_id (one per game). */
export function searchAndGetThreadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}
