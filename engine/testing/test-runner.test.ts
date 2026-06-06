/**
 * Offline tests for engine/testing/test-runner — spawns real child processes against temp
 * fixture test files (passing, failing, and missing) and checks the structured results.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFailures, runGameTests, TestRunResultSchema } from './test-runner';

const TEST_LOG_PREFIX = '[engine/testing/test-runner.test]';

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'test-runner-'));
  try {
    // parseFailures: extracts message + stack, resets on blank lines
    const failures = parseFailures(
      [
        'ok - one',
        'FAIL - player can move',
        '    at Object.<anonymous> (/g/tests/tests.ts:10:5)',
        '    at run (/g/tests/tests.ts:20:3)',
        '',
        'AssertionError [ERR_ASSERTION]: boom',
        '    at x (/g/tests/tests.ts:30:1)',
      ].join('\n'),
    );
    assert.equal(failures.length, 2);
    assert.equal(failures[0]?.stack.length, 2);
    assert.match(failures[1]?.message ?? '', /AssertionError/);
    console.log(`${TEST_LOG_PREFIX} ok - parseFailures extracts messages and stacks`);

    // passing fixture (run with plain node to keep the test fast/offline)
    const passing = join(dir, 'pass.cjs');
    await writeFile(passing, "console.log('ok - works'); process.exit(0);\n");
    const passResult = await runGameTests(passing, { command: { cmd: process.execPath, args: [passing] } });
    assert.equal(passResult.passed, true);
    assert.equal(passResult.exitCode, 0);
    assert.equal(passResult.failures.length, 0);
    assert.ok(passResult.stdout.includes('ok - works'));
    TestRunResultSchema.parse(passResult);
    console.log(`${TEST_LOG_PREFIX} ok - passing run reports passed=true`);

    // failing fixture
    const failing = join(dir, 'fail.cjs');
    await writeFile(
      failing,
      "console.error('FAIL - win state unreachable');\nconsole.error('    at check (tests.ts:5:1)');\nprocess.exit(1);\n",
    );
    const failResult = await runGameTests(failing, { command: { cmd: process.execPath, args: [failing] } });
    assert.equal(failResult.passed, false);
    assert.equal(failResult.exitCode, 1);
    assert.equal(failResult.failures.length, 1);
    assert.equal(failResult.failures[0]?.stack.length, 1);
    console.log(`${TEST_LOG_PREFIX} ok - failing run reports structured failures`);

    // timeout fixture
    const hanging = join(dir, 'hang.cjs');
    await writeFile(hanging, 'setInterval(() => {}, 1000);\n');
    const hungResult = await runGameTests(hanging, {
      command: { cmd: process.execPath, args: [hanging] },
      timeoutMs: 500,
    });
    assert.equal(hungResult.passed, false);
    assert.equal(hungResult.timedOut, true);
    console.log(`${TEST_LOG_PREFIX} ok - hung run is killed and reported timedOut`);

    // missing file
    await assert.rejects(() => runGameTests(join(dir, 'nope.ts')), /not found/);
    await assert.rejects(() => runGameTests(''), /non-empty/);
    console.log(`${TEST_LOG_PREFIX} ok - missing/blank paths are rejected`);

    console.log(`${TEST_LOG_PREFIX} all 5 tests passed`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`${TEST_LOG_PREFIX} FAILED`, err);
  process.exit(1);
});
