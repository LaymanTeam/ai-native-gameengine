/**
 * Offline tests for engine/tools/fetchers — run with: npx tsx engine/tools/fetchers/fetchers.test.ts
 * All network access goes through an injected fetch mock; downloads land in an OS temp dir.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  normalizeLicense,
  isLicenseAcceptable,
  buildOpenGameArtSearchUrl,
  parseOpenGameArtSearchResults,
  parseOpenGameArtDetail,
  fileNameFromUrl,
  downloadCandidates,
  fetchSfx,
  type AssetCandidate,
  type FetchLike,
} from './sfx';
import { fetchMusic } from './music';
import {
  buildGoogleFontsCssUrl,
  parseGoogleFontsCss,
  fontFileName,
  fetchFont,
} from './fonts';

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok - ${name}`);
    })
    .catch((err) => {
      console.error(`  FAIL - ${name}`);
      console.error(err);
      process.exitCode = 1;
      throw err;
    });
}

/** Build a fetch mock from a URL→{text|bytes} routing table. */
function mockFetch(routes: Record<string, { text?: string; bytes?: Uint8Array; status?: number }>): FetchLike {
  return async (url: string) => {
    const entry = routes[url];
    if (!entry) {
      return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    }
    const status = entry.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => entry.text ?? '',
      arrayBuffer: async () => (entry.bytes ? entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength) : new ArrayBuffer(0)),
    } as unknown as Response;
  };
}

async function main() {
  // ---- License normalization & policy ----
  await test('normalizeLicense maps CC0 / public domain', () => {
    assert.equal(normalizeLicense('CC0'), 'CC0-1.0');
    assert.equal(normalizeLicense('Public Domain'), 'CC0-1.0');
    assert.equal(normalizeLicense('CC-BY 4.0'), 'CC-BY-4.0');
    assert.equal(normalizeLicense('CC BY-SA 3.0'), 'CC-BY-SA-3.0');
    assert.equal(normalizeLicense('CC BY-NC 3.0'), 'CC-BY-NC-3.0');
  });

  await test('isLicenseAcceptable rejects NC and ND', () => {
    assert.equal(isLicenseAcceptable('CC-BY-NC-3.0').ok, false);
    assert.equal(isLicenseAcceptable('CC BY-ND').ok, false);
    assert.equal(isLicenseAcceptable('CC-BY-NC-SA-4.0').ok, false);
  });

  await test('isLicenseAcceptable accepts GPL-compatible licenses', () => {
    assert.equal(isLicenseAcceptable('CC0').ok, true);
    assert.equal(isLicenseAcceptable('CC-BY 4.0').ok, true);
    // CC-BY-SA: ONLY 4.0 is (one-way) GPLv3-compatible — 1.0–3.0 must be rejected.
    assert.equal(isLicenseAcceptable('CC-BY-SA 4.0').ok, true);
    assert.equal(isLicenseAcceptable('CC-BY-SA 3.0').ok, false);
    assert.equal(isLicenseAcceptable('GPL 3.0').ok, true);
    // attribution flags
    assert.equal(isLicenseAcceptable('CC0').attributionRequired, false);
    assert.equal(isLicenseAcceptable('CC-BY 4.0').attributionRequired, true);
  });

  await test('isLicenseAcceptable rejects GPL-2.0-only and unknown', () => {
    assert.equal(isLicenseAcceptable('GPL 2.0').ok, false);
    assert.equal(isLicenseAcceptable('').ok, false);
  });

  // ---- OpenGameArt parsing ----
  await test('buildOpenGameArtSearchUrl encodes query + art type', () => {
    const url = buildOpenGameArtSearchUrl('laser shot', '13');
    assert.ok(url.includes('keys=laser+shot'));
    assert.ok(url.includes('field_art_type_tid=13'));
  });

  await test('parseOpenGameArtSearchResults extracts content links', () => {
    const html = '<a href="/content/laser-1">x</a> <a href="/content/laser-1">dup</a> <a href="/content/boom-2">y</a> <a href="/about">no</a>';
    const links = parseOpenGameArtSearchResults(html);
    assert.deepEqual(links.sort(), ['https://opengameart.org/content/boom-2', 'https://opengameart.org/content/laser-1']);
  });

  await test('parseOpenGameArtDetail extracts license + file', () => {
    const html =
      '<h1>Laser Shot</h1>' +
      '<div class="license">CC-BY 3.0</div>' +
      '<a href="/sites/default/files/laser.ogg">download</a>';
    const c = parseOpenGameArtDetail(html, 'https://opengameart.org/content/laser-1');
    assert.ok(c);
    assert.equal(c?.license, 'CC-BY-3.0');
    assert.equal(c?.downloadUrl, 'https://opengameart.org/sites/default/files/laser.ogg');
  });

  await test('parseOpenGameArtDetail returns undefined without file', () => {
    assert.equal(parseOpenGameArtDetail('<h1>no files</h1>', 'https://opengameart.org/content/x'), undefined);
  });

  // ---- fileNameFromUrl ----
  await test('fileNameFromUrl sanitizes + defaults extension', () => {
    assert.equal(fileNameFromUrl('https://x.org/sites/default/files/boom.ogg'), 'boom.ogg');
    assert.equal(fileNameFromUrl('https://x.org/path/noext'), 'noext.ogg');
  });

  // ---- downloadCandidates: rejects NC, saves cleared, writes LICENSE.json ----
  await test('downloadCandidates filters NC and writes provenance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fetch-sfx-'));
    try {
      const candidates: AssetCandidate[] = [
        { title: 'Good', downloadUrl: 'https://oga.org/files/good.ogg', sourceUrl: 'https://oga.org/content/g', source: 'opengameart', license: 'CC0-1.0' },
        { title: 'Bad NC', downloadUrl: 'https://oga.org/files/bad.ogg', sourceUrl: 'https://oga.org/content/b', source: 'opengameart', license: 'CC-BY-NC-3.0' },
      ];
      const fetchImpl = mockFetch({ 'https://oga.org/files/good.ogg': { bytes: new Uint8Array([1, 2, 3]) } });
      const result = await downloadCandidates(candidates, dir, { fetchImpl });
      assert.equal(result.saved.length, 1);
      assert.equal(result.rejected.length, 1);
      assert.equal(result.saved[0]?.file, 'good.ogg');
      assert.equal(result.saved[0]?.attributionRequired, false);
      assert.ok(result.licenseFile);
      const written = JSON.parse(await readFile(result.licenseFile!, 'utf8'));
      assert.equal(written.length, 1);
      assert.equal(written[0].license, 'CC0-1.0');
      assert.ok(typeof written[0].fetchedAt === 'string');
      const bytes = await readFile(join(dir, 'good.ogg'));
      assert.equal(bytes.length, 3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // ---- fetchSfx end-to-end (mocked) ----
  await test('fetchSfx walks search → detail → download', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fetch-sfx-e2e-'));
    try {
      const searchUrl = buildOpenGameArtSearchUrl('jump', '13');
      const detailUrl = 'https://opengameart.org/content/jump-1';
      const fileUrl = 'https://opengameart.org/sites/default/files/jump.ogg';
      const fetchImpl = mockFetch({
        [searchUrl]: { text: `<a href="/content/jump-1">jump</a>` },
        [detailUrl]: { text: `<h1>Jump</h1><div class="license">CC0</div><a href="${fileUrl}">dl</a>` },
        [fileUrl]: { bytes: new Uint8Array([9, 9]) },
      });
      const result = await fetchSfx('jump', dir, { fetchImpl });
      assert.equal(result.saved.length, 1);
      assert.equal(result.saved[0]?.license, 'CC0-1.0');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  await test('fetchMusic uses music art-type filter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fetch-music-'));
    try {
      const searchUrl = buildOpenGameArtSearchUrl('battle theme', '12');
      const detailUrl = 'https://opengameart.org/content/theme-1';
      const fileUrl = 'https://opengameart.org/sites/default/files/theme.ogg';
      const fetchImpl = mockFetch({
        [searchUrl]: { text: `<a href="/content/theme-1">t</a>` },
        [detailUrl]: { text: `<h1>Theme</h1><div class="license">CC-BY 4.0</div><a href="${fileUrl}">dl</a>` },
        [fileUrl]: { bytes: new Uint8Array([7]) },
      });
      const result = await fetchMusic('battle theme', dir, { fetchImpl });
      assert.equal(result.saved.length, 1);
      assert.equal(result.saved[0]?.attributionRequired, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // ---- Google Fonts ----
  await test('buildGoogleFontsCssUrl preserves : @ + ; in family spec', () => {
    const url = buildGoogleFontsCssUrl('Press Start 2P', [400, 700]);
    assert.ok(url.includes('family=Press+Start+2P:wght@400;700'), url);
    assert.ok(url.includes('display=swap'));
  });

  await test('parseGoogleFontsCss extracts woff2 faces + subset', () => {
    const css = `
      /* latin */
      @font-face {
        font-family: 'Roboto';
        font-style: normal;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/roboto/v1/abc.woff2) format('woff2');
      }`;
    const faces = parseGoogleFontsCss(css);
    assert.equal(faces.length, 1);
    assert.equal(faces[0]?.family, 'Roboto');
    assert.equal(faces[0]?.subset, 'latin');
    assert.equal(faces[0]?.weight, '400');
    assert.ok(faces[0]?.url.endsWith('.woff2'));
  });

  await test('fontFileName is deterministic + slugged', () => {
    const name = fontFileName({ family: 'Press Start 2P', style: 'normal', weight: '400', subset: 'latin', url: 'https://x/y.woff2' });
    assert.equal(name, 'press-start-2p-400-normal-latin.woff2');
  });

  await test('fetchFont downloads parsed faces + writes LICENSE.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fetch-fonts-'));
    try {
      const cssUrl = buildGoogleFontsCssUrl('Roboto', [400]);
      const fontUrl = 'https://fonts.gstatic.com/s/roboto/v1/abc.woff2';
      const css = `@font-face{font-family:'Roboto';font-style:normal;font-weight:400;src:url(${fontUrl}) format('woff2');}`;
      const fetchImpl = mockFetch({
        [cssUrl]: { text: css },
        [fontUrl]: { bytes: new Uint8Array([1, 2, 3, 4]) },
      });
      const result = await fetchFont('Roboto', dir, { fetchImpl });
      assert.equal(result.saved.length, 1);
      assert.equal(result.saved[0]?.source, 'google-fonts');
      assert.equal(result.saved[0]?.license, 'OFL-1.1');
      assert.ok(result.licenseFile);
      const written = JSON.parse(await readFile(result.licenseFile!, 'utf8'));
      assert.equal(written[0].family, 'Roboto');
      const bytes = await readFile(join(dir, written[0].file));
      assert.equal(bytes.length, 4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  console.log(`\n${passed} tests passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
