/**
 * Headless playtest runner — spawned via `npx tsx engine/testing/playtest-runner.ts <gameRoot>`.
 *
 * Loads the generated game's headless session bridge (tests/headless-session.ts, which the coder
 * is instructed to write: `export function createHeadlessSession(): GameSession`), drives it with
 * the deterministic playtest harness (engine/ai/agents/playtester.ts runPlaytest), and prints the
 * PlaytestReport as JSON on stdout. Exit code 0 = playable, 1 = not playable, 2 = bridge missing
 * or load error. Spawned as a subprocess so the TS bridge loads under tsx (the Next route's Node
 * runtime cannot import raw .ts files at runtime).
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPlaytest, type GameSession } from '../ai/agents/playtester';

const LOG_PREFIX = '[engine/testing/playtest-runner]';

async function main(): Promise<void> {
  const gameRoot = process.argv[2];
  if (!gameRoot) {
    console.error(`${LOG_PREFIX} usage: tsx playtest-runner.ts <absolute-game-root>`);
    process.exit(2);
  }

  const bridgePath = path.join(gameRoot, 'tests', 'headless-session.ts');
  let createSession: (() => GameSession) | undefined;
  try {
    const mod = (await import(pathToFileURL(bridgePath).href)) as { createHeadlessSession?: () => GameSession };
    createSession = mod.createHeadlessSession;
  } catch (error) {
    console.error(`${LOG_PREFIX} bridge load failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  if (typeof createSession !== 'function') {
    console.error(`${LOG_PREFIX} ${bridgePath} does not export createHeadlessSession()`);
    process.exit(2);
  }

  try {
    const report = runPlaytest(createSession());
    process.stdout.write(JSON.stringify(report));
    process.exit(report.playable ? 0 : 1);
  } catch (error) {
    console.error(`${LOG_PREFIX} playtest crashed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

void main();
