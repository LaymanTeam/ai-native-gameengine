/**
 * Offline tests for vercel-deploy using an injected fetch mock.
 * Run: npx tsx engine/compiler/vercel-deploy.test.ts
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deployToVercel, type FetchLike } from './vercel-deploy.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function jsonResponse(status: number, payload: unknown, ok?: boolean) {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

async function makeGameDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vercel-deploy-'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>g</title>', 'utf8');
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  await writeFile(path.join(dir, 'assets', 'sprite.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  // excluded dir should NOT be uploaded
  await mkdir(path.join(dir, 'node_modules'), { recursive: true });
  await writeFile(path.join(dir, 'node_modules', 'junk.js'), 'noop', 'utf8');
  return dir;
}

async function testHappyPathPayloadAndPolling(): Promise<void> {
  const gameDir = await makeGameDir();
  const calls: Call[] = [];
  let pollCount = 0;

  const fetchMock: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });
    if (init?.method === 'POST') {
      return jsonResponse(200, { id: 'dpl_123', url: 'game-abc.vercel.app', readyState: 'QUEUED' });
    }
    // GET poll: BUILDING then READY
    pollCount += 1;
    const state = pollCount < 2 ? 'BUILDING' : 'READY';
    return jsonResponse(200, { id: 'dpl_123', url: 'game-abc.vercel.app', readyState: state });
  };

  try {
    const result = await deployToVercel({
      gameDir,
      name: 'my-game',
      token: 'secret-token',
      fetchImpl: fetchMock,
      pollIntervalMs: 1,
    });

    assert.equal(result.id, 'dpl_123');
    assert.equal(result.url, 'game-abc.vercel.app');
    assert.equal(result.httpsUrl, 'https://game-abc.vercel.app');
    assert.equal(result.readyState, 'READY');

    // First call = POST to v13/deployments
    const post = calls[0];
    assert.ok(post);
    assert.equal(post.method, 'POST');
    assert.match(post.url, /\/v13\/deployments/);
    assert.match(post.url, /skipAutoDetectionConfirmation=1/);
    assert.equal(post.headers['Authorization'], 'Bearer secret-token');
    assert.equal(post.headers['Content-Type'], 'application/json');

    const body = JSON.parse(post.body ?? '{}');
    assert.equal(body.name, 'my-game');
    assert.equal(body.target, 'production');
    assert.equal(body.projectSettings.framework, 'vite');
    assert.ok(Array.isArray(body.files));
    // index.html + assets/sprite.png = 2; node_modules excluded
    const fileNames = body.files.map((f: { file: string }) => f.file).sort();
    assert.deepEqual(fileNames, ['assets/sprite.png', 'index.html']);
    for (const f of body.files) {
      assert.equal(f.encoding, 'base64');
      assert.equal(typeof f.data, 'string');
    }

    // Subsequent calls = GET polls with Authorization
    const get = calls[1];
    assert.ok(get);
    assert.equal(get.method, 'GET');
    assert.match(get.url, /\/v13\/deployments\/dpl_123/);
    assert.equal(get.headers['Authorization'], 'Bearer secret-token');

    assert.ok(pollCount >= 2, 'should poll until READY');
    console.log('ok: happy path payload + polling');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testTeamIdAddedToUrls(): Promise<void> {
  const gameDir = await makeGameDir();
  const calls: Call[] = [];
  const fetchMock: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {} });
    if (init?.method === 'POST') return jsonResponse(200, { id: 'd1', url: 'x.vercel.app', readyState: 'QUEUED' });
    return jsonResponse(200, { id: 'd1', url: 'x.vercel.app', readyState: 'READY' });
  };
  try {
    await deployToVercel({ gameDir, name: 'g', token: 't', teamId: 'team_9', fetchImpl: fetchMock, pollIntervalMs: 1 });
    assert.ok(calls.every((c) => c.url.includes('teamId=team_9')));
    console.log('ok: teamId appended to all URLs');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testCreateFailureThrows(): Promise<void> {
  const gameDir = await makeGameDir();
  const fetchMock: FetchLike = async () => jsonResponse(403, { error: 'forbidden' }, false);
  try {
    await assert.rejects(
      () => deployToVercel({ gameDir, name: 'g', token: 't', fetchImpl: fetchMock, pollIntervalMs: 1 }),
      /create deployment failed \(status 403\)/,
    );
    console.log('ok: create failure throws');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testDeploymentErrorStateThrows(): Promise<void> {
  const gameDir = await makeGameDir();
  const fetchMock: FetchLike = async (_url, init) => {
    if (init?.method === 'POST') return jsonResponse(200, { id: 'd2', url: 'y.vercel.app', readyState: 'QUEUED' });
    return jsonResponse(200, { id: 'd2', url: 'y.vercel.app', readyState: 'ERROR' });
  };
  try {
    await assert.rejects(
      () => deployToVercel({ gameDir, name: 'g', token: 't', fetchImpl: fetchMock, pollIntervalMs: 1 }),
      /ended in ERROR/,
    );
    console.log('ok: ERROR readyState throws');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testPollTimeoutThrows(): Promise<void> {
  const gameDir = await makeGameDir();
  const fetchMock: FetchLike = async (_url, init) => {
    if (init?.method === 'POST') return jsonResponse(200, { id: 'd3', url: 'z.vercel.app', readyState: 'QUEUED' });
    return jsonResponse(200, { id: 'd3', url: 'z.vercel.app', readyState: 'BUILDING' }); // never ready
  };
  try {
    await assert.rejects(
      () => deployToVercel({ gameDir, name: 'g', token: 't', fetchImpl: fetchMock, pollIntervalMs: 1, pollTimeoutMs: 5 }),
      /timed out/,
    );
    console.log('ok: poll timeout throws');
  } finally {
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testMissingTokenThrows(): Promise<void> {
  const gameDir = await makeGameDir();
  const prev = process.env['VERCEL_TOKEN'];
  delete process.env['VERCEL_TOKEN'];
  const fetchMock: FetchLike = async () => jsonResponse(200, { id: 'x', readyState: 'READY' });
  try {
    await assert.rejects(
      () => deployToVercel({ gameDir, name: 'g', fetchImpl: fetchMock }),
      /missing VERCEL_TOKEN/,
    );
    console.log('ok: missing token throws');
  } finally {
    if (prev !== undefined) process.env['VERCEL_TOKEN'] = prev;
    await rm(gameDir, { recursive: true, force: true });
  }
}

async function testMissingGameDirThrows(): Promise<void> {
  const missing = path.join(tmpdir(), `vercel-deploy-missing-${Date.now()}`);
  const fetchMock: FetchLike = async () => jsonResponse(200, { id: 'x', readyState: 'READY' });
  await assert.rejects(
    () => deployToVercel({ gameDir: missing, name: 'g', token: 't', fetchImpl: fetchMock }),
    /gameDir does not exist/,
  );
  console.log('ok: missing gameDir throws');
}

async function main(): Promise<void> {
  await testHappyPathPayloadAndPolling();
  await testTeamIdAddedToUrls();
  await testCreateFailureThrows();
  await testDeploymentErrorStateThrows();
  await testPollTimeoutThrows();
  await testMissingTokenThrows();
  await testMissingGameDirThrows();
  console.log('\nvercel-deploy: ALL TESTS PASSED');
}

main().catch((err) => {
  console.error('vercel-deploy: TEST FAILURE', err);
  process.exit(1);
});
