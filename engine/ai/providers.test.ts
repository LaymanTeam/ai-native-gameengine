/**
 * Tests for engine/ai/providers.ts generateImage — the direct AI Studio REST path.
 * Run: npx tsx engine/ai/providers.test.ts
 * Network is an injected fake; no API calls.
 */
process.env.GOOGLE_API_KEY ??= 'offline-test-key';

import assert from 'node:assert/strict';
import { generateImage, type FetchLike } from './providers';

let passed = 0;
async function ok(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const PNG_B64 = Buffer.from('fake-png').toString('base64');

function fakeFetch(body: unknown, status = 200): { impl: FetchLike; calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] } {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  return { impl, calls };
}

async function main(): Promise<void> {
  console.log('generateImage (AI Studio REST):');

  await ok('happy path: inlineData part → data URL, text collected', async () => {
    const { impl, calls } = fakeFetch({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Here is your sprite.' },
              { inlineData: { mimeType: 'image/png', data: PNG_B64 } },
            ],
          },
        },
      ],
    });
    const out = await generateImage('a 32px knight sprite', { fetchImpl: impl });
    assert.equal(out.dataUrl, `data:image/png;base64,${PNG_B64}`);
    assert.equal(out.text, 'Here is your sprite.');
    // Request shape:
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call);
    assert.match(call.url, /gemini-3\.1-flash-image:generateContent$/);
    assert.ok(!call.url.includes('key='), 'API key must not be in the URL');
    assert.equal(call.init.headers['x-goog-api-key'], process.env.GOOGLE_API_KEY);
    const payload = JSON.parse(call.init.body) as { generationConfig: { responseModalities: string[] } };
    assert.deepEqual(payload.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  });

  await ok('pro flag routes to gemini-3-pro-image', async () => {
    const { impl, calls } = fakeFetch({
      candidates: [{ content: { parts: [{ inlineData: { data: PNG_B64 } }] } }],
    });
    const out = await generateImage('hero scene', { pro: true, fetchImpl: impl });
    assert.match(calls[0]?.url ?? '', /gemini-3-pro-image:generateContent$/);
    assert.equal(out.dataUrl, `data:image/png;base64,${PNG_B64}`); // mime defaults to image/png
  });

  await ok('text-only response throws retryable no-image error', async () => {
    const { impl } = fakeFetch({ candidates: [{ content: { parts: [{ text: 'refused' }] } }] });
    await assert.rejects(() => generateImage('x', { fetchImpl: impl }), /no image part \(retryable\)/);
  });

  await ok('HTTP error throws retryable with status', async () => {
    const { impl } = fakeFetch({ error: { message: 'quota' } }, 429);
    await assert.rejects(() => generateImage('x', { fetchImpl: impl }), /HTTP 429.*retryable/);
  });

  await ok('unparseable body throws retryable', async () => {
    const { impl } = fakeFetch('<html>gateway error</html>');
    await assert.rejects(() => generateImage('x', { fetchImpl: impl }), /unparseable.*retryable/);
  });

  await ok('network failure is wrapped retryable', async () => {
    const impl: FetchLike = async () => {
      throw new Error('ECONNRESET');
    };
    await assert.rejects(() => generateImage('x', { fetchImpl: impl }), /network error: ECONNRESET.*retryable/);
  });

  await ok('empty prompt rejected before any network call', async () => {
    const { impl, calls } = fakeFetch({});
    await assert.rejects(() => generateImage('  ', { fetchImpl: impl }), /non-empty/);
    assert.equal(calls.length, 0);
  });

  console.log(`\n${passed} provider tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
