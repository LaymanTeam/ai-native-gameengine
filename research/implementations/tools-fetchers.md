# Implementation: `engine/tools/fetchers/*`

Asset fetcher tools for the **search-and-get** agent. They trawl open-source asset libraries,
filter licenses for GPL-3.0 compatibility, download files into a generated game's `assets/`
subfolders, and write `LICENSE.json` provenance per `generations/info.md`.

All functions are plain async (the LangChain `tool()` wrappers live in
`engine/ai/tool-definitions.ts`, which this unit does not edit). Every network call goes
through an **injectable fetch** (`fetchImpl`) so the agents can run them live and the test
suite can run fully offline.

## Files

- `sfx.ts` — OpenGameArt sound-effect trawl + the shared license/download/parse primitives.
- `music.ts` — OpenGameArt music trawl (reuses `sfx.ts` primitives; different art-type tid).
- `fonts.ts` — Google Fonts CDN downloader (CSS2 API → woff2).
- `fetchers.test.ts` — offline `node:assert` suite (`npx tsx engine/tools/fetchers/fetchers.test.ts`).

## License policy (GPL-3.0)

`normalizeLicense(raw)` canonicalizes a label found on a page (e.g. `"CC-BY 4.0"` → `CC-BY-4.0`,
`"Public Domain"` → `CC0-1.0`). `isLicenseAcceptable(license)` returns
`{ ok, reason, attributionRequired }`:

- **Rejects** any NonCommercial (NC) or NoDerivatives (ND) clause, GPL-2.0-only, UNKNOWN, and
  **CC-BY-SA 1.0–3.0** (only CC-BY-SA-**4.0** is one-way GPLv3-compatible per Creative Commons).
- **Accepts** CC0, CC-BY (any version), CC-BY-SA-4.0, GPL-3.0, LGPL, MIT, BSD, OFL-1.1.
- `attributionRequired` is true for CC-BY*, MIT, BSD, OFL.

## Exports — `sfx.ts`

| Signature | Purpose |
|---|---|
| `type FetchLike = (input: string, init?: RequestInit) => Promise<Response>` | Injectable fetch. |
| `AssetCandidateSchema` / `type AssetCandidate` | Zod schema for a discovered, license-tagged audio candidate. |
| `LicenseRecordSchema` / `type LicenseRecord` | Zod schema for one `LICENSE.json` entry. |
| `FetchResultSchema` / `type FetchResult` | `{ saved, rejected, licenseFile? }`. |
| `normalizeLicense(raw: string): string` | Canonical license token. |
| `isLicenseAcceptable(license: string): { ok; reason; attributionRequired }` | GPL-3.0 policy gate. |
| `buildOpenGameArtSearchUrl(query, artTypeTid): string` | Advanced-search URL. |
| `parseOpenGameArtSearchResults(html): string[]` | Result HTML → `/content/*` detail URLs. |
| `parseOpenGameArtDetail(html, sourceUrl): Omit<AssetCandidate,'source'> \| undefined` | Detail page → candidate. |
| `fileNameFromUrl(url, fallbackExt?): string` | Safe filename derivation. |
| `downloadCandidates(candidates, destDir, { fetchImpl?, fallbackExt? }): Promise<FetchResult>` | Filters by license, downloads accepted, writes `LICENSE.json`. |
| `fetchSfx(query, destDir, { limit?, fetchImpl? }): Promise<FetchResult>` | Full search→detail→download for SFX (art-type tid 13). |

## Exports — `music.ts`

| Signature | Purpose |
|---|---|
| `fetchMusic(query, destDir, { limit?, fetchImpl? }): Promise<FetchResult>` | Full trawl for music (OpenGameArt art-type tid 12); reuses `sfx.ts` primitives. |

## Exports — `fonts.ts`

| Signature | Purpose |
|---|---|
| `FontFaceSchema` / `type FontFace` | Parsed `@font-face` (family/style/weight/subset/url). |
| `FontLicenseRecordSchema` / `type FontLicenseRecord` | One font `LICENSE.json` entry. |
| `FontFetchResultSchema` / `type FontFetchResult` | `{ saved, cssUrl, licenseFile? }`. |
| `buildGoogleFontsCssUrl(family, weights?): string` | CSS2 API URL (preserves `: @ + ;`). |
| `parseGoogleFontsCss(css): FontFace[]` | `@font-face` blocks → woff2 faces. |
| `fontFileName(face): string` | Deterministic slugged filename. |
| `fetchFont(family, destDir, { weights?, license?, fetchImpl? }): Promise<FontFetchResult>` | Download woff2 faces + write `LICENSE.json` (default OFL-1.1). |

## Dependencies

- `node:fs/promises` (`mkdir`, `writeFile`), `node:path`, `zod` (already in `package.json`).
- A `User-Agent` advertising woff2 is sent to the Google Fonts CSS API so it returns woff2.
- No new runtime dependencies added.

## Usage

```ts
import { fetchSfx } from '@/engine/tools/fetchers/sfx';
import { fetchMusic } from '@/engine/tools/fetchers/music';
import { fetchFont } from '@/engine/tools/fetchers/fonts';

// search-and-get agent, per generated game folder:
const game = 'generations/space-blaster';
await fetchSfx('laser explosion 8-bit', `${game}/assets/sfx`, { limit: 5 });
await fetchMusic('chiptune battle theme', `${game}/assets/music`, { limit: 3 });
await fetchFont('Press Start 2P', `${game}/assets/fonts`, { weights: [400] });
// Each writes assets/<kind>/LICENSE.json with full provenance + attribution flags.
```

## Testing

`npx tsx engine/tools/fetchers/fetchers.test.ts` — 16 offline tests covering license
normalization/policy (NC/ND rejection), OpenGameArt search + detail parsing, `LICENSE.json`
shape, temp-dir downloads, and Google Fonts CSS parsing. All use a routed `mockFetch`.
