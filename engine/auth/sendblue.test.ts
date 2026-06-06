/**
 * Offline tests for engine/auth/sendblue.ts — run with `npx tsx engine/auth/sendblue.test.ts`.
 * fetch is dependency-injected so no network is touched. Asserts: request shape, header
 * presence/redaction, E.164 validation, response parsing, and error paths.
 */
import assert from 'node:assert/strict';
import {
  createSendblueClient,
  isE164,
  redactPhone,
  resolveSendblueCredentials,
  sendLoginLink,
  sendMultiplayerInvite,
  type FetchLike,
} from './sendblue';

const CREDS = { apiKeyId: 'KID_secret_value', apiSecretKey: 'SK_secret_value', fromNumber: '+15551230000' };

interface Captured {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function stubFetch(
  responder: () => { ok: boolean; status: number; body: string },
): { fetchImpl: FetchLike; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, ...(init ?? {}) });
    const r = responder();
    return { ok: r.ok, status: r.status, text: async () => r.body };
  };
  return { fetchImpl, calls };
}

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main(): Promise<void> {
  await test('isE164 accepts valid, rejects invalid', () => {
    assert.equal(isE164('+19998887777'), true);
    assert.equal(isE164('19998887777'), false);
    assert.equal(isE164('+0123'), false);
    assert.equal(isE164(''), false);
    assert.equal(isE164(undefined), false);
  });

  await test('redactPhone masks the middle, keeps cc + last 2', () => {
    const r = redactPhone('+19998887777');
    assert.ok(r.startsWith('+1'));
    assert.ok(r.endsWith('77'));
    assert.ok(!r.includes('99988'));
  });

  await test('resolveSendblueCredentials returns null without keys', () => {
    const prevId = process.env['SENDBLUE_API_KEY_ID'];
    const prevSec = process.env['SENDBLUE_API_SECRET_KEY'];
    delete process.env['SENDBLUE_API_KEY_ID'];
    delete process.env['SENDBLUE_API_SECRET_KEY'];
    assert.equal(resolveSendblueCredentials(), null);
    if (prevId !== undefined) process.env['SENDBLUE_API_KEY_ID'] = prevId;
    if (prevSec !== undefined) process.env['SENDBLUE_API_SECRET_KEY'] = prevSec;
  });

  await test('createSendblueClient throws without credentials', () => {
    assert.throws(() => createSendblueClient({ credentials: { apiKeyId: '', apiSecretKey: '' } }));
  });

  await test('sendMessage posts correct shape + auth headers', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ status: 'QUEUED', message_handle: 'h1', number: '+19998887777' }),
    }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '+19998887777', content: 'hi', sendStyle: 'confetti' });
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.url, 'https://api.sendblue.co/api/send-message');
    assert.equal(call.method, 'POST');
    assert.equal(call.headers?.['sb-api-key-id'], CREDS.apiKeyId);
    assert.equal(call.headers?.['sb-api-secret-key'], CREDS.apiSecretKey);
    assert.equal(call.headers?.['Content-Type'], 'application/json');
    const sent = JSON.parse(call.body ?? '{}');
    assert.equal(sent.number, '+19998887777');
    assert.equal(sent.from_number, CREDS.fromNumber);
    assert.equal(sent.content, 'hi');
    assert.equal(sent.send_style, 'confetti');
    if (res.ok) assert.equal(res.status, 'QUEUED');
  });

  await test('headers are redacted in logs, never the raw secret', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };
    try {
      const { fetchImpl } = stubFetch(() => ({ ok: true, status: 200, body: JSON.stringify({ status: 'SENT' }) }));
      const client = createSendblueClient({ credentials: CREDS, fetchImpl });
      await client.sendMessage({ number: '+19998887777', content: 'hi' });
    } finally {
      console.log = origLog;
    }
    const blob = logs.join('\n');
    assert.ok(!blob.includes(CREDS.apiSecretKey), 'secret key leaked to logs');
    assert.ok(!blob.includes(CREDS.apiKeyId), 'key id leaked to logs');
    assert.ok(!blob.includes('19998887777'), 'full phone leaked to logs');
  });

  await test('rejects non-E.164 recipient without calling fetch', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true, status: 200, body: '{}' }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '5551234', content: 'hi' });
    assert.equal(res.ok, false);
    assert.equal(calls.length, 0);
  });

  await test('rejects when neither content nor media provided', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true, status: 200, body: '{}' }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '+19998887777' });
    assert.equal(res.ok, false);
    assert.equal(calls.length, 0);
  });

  await test('rejects when no from_number available', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true, status: 200, body: '{}' }));
    const client = createSendblueClient({
      credentials: { apiKeyId: 'k', apiSecretKey: 's' },
      fetchImpl,
    });
    const res = await client.sendMessage({ number: '+19998887777', content: 'hi' });
    assert.equal(res.ok, false);
    assert.equal(calls.length, 0);
  });

  await test('handles HTTP error status', async () => {
    const { fetchImpl } = stubFetch(() => ({ ok: false, status: 401, body: 'unauthorized' }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '+19998887777', content: 'hi' });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.httpStatus, 401);
  });

  await test('handles API ERROR status in body', async () => {
    const { fetchImpl } = stubFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ status: 'ERROR', error_code: 33, error_message: 'bad number' }),
    }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '+19998887777', content: 'hi' });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, 'bad number');
  });

  await test('handles non-JSON success body', async () => {
    const { fetchImpl } = stubFetch(() => ({ ok: true, status: 200, body: '<html>nope</html>' }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '+19998887777', content: 'hi' });
    assert.equal(res.ok, false);
  });

  await test('handles schema mismatch (unknown status)', async () => {
    const { fetchImpl } = stubFetch(() => ({ ok: true, status: 200, body: JSON.stringify({ status: 'WAT' }) }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '+19998887777', content: 'hi' });
    assert.equal(res.ok, false);
  });

  await test('handles network throw', async () => {
    const fetchImpl: FetchLike = async () => { throw new Error('ECONNRESET'); };
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await client.sendMessage({ number: '+19998887777', content: 'hi' });
    assert.equal(res.ok, false);
    if (!res.ok) assert.ok(res.error.includes('ECONNRESET'));
  });

  await test('sendLoginLink composes content and sends', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true, status: 200, body: JSON.stringify({ status: 'SENT' }) }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await sendLoginLink(client, '+19998887777', 'https://x.app/l/abc', { appName: 'Dungeon' });
    assert.equal(res.ok, true);
    const sent = JSON.parse(calls[0]!.body ?? '{}');
    assert.ok(sent.content.includes('Dungeon'));
    assert.ok(sent.content.includes('https://x.app/l/abc'));
  });

  await test('sendMultiplayerInvite uses confetti style', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true, status: 200, body: JSON.stringify({ status: 'SENT' }) }));
    const client = createSendblueClient({ credentials: CREDS, fetchImpl });
    const res = await sendMultiplayerInvite(client, '+19998887777', 'https://x.app/join/1', {
      inviterName: 'Ada',
      gameName: 'Snake',
    });
    assert.equal(res.ok, true);
    const sent = JSON.parse(calls[0]!.body ?? '{}');
    assert.equal(sent.send_style, 'confetti');
    assert.ok(sent.content.includes('Ada'));
    assert.ok(sent.content.includes('Snake'));
  });

  console.log(`\nAll ${passed} sendblue tests passed.`);
}

main().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
