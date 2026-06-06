/**
 * Playtester agent — catches "compiles but unplayable". Drives the generated game headlessly
 * through engine/input/controller's action API against the bitECS world (no renderer) and
 * asserts invariants: player can move, win state reachable, lose state reachable, no NaN
 * positions, frame budget respected. Also vision-checks composed prototype-still screenshots
 * (via image-reviewer/Gemini vision) to catch integration errors individual asset review misses.
 * Failures route to the debugger agent, not back to full regeneration.
 *
 * ARCHITECTURE: the headless harness (`runPlaytest`) is plain, deterministic, unit-testable
 * TypeScript that drives an INJECTED game session (the controller action API + a bitECS-world
 * probe — both built by sibling modules and passed in, never imported). The LangChain agent
 * (`createPlaytesterAgent`) wraps the harness as a tool and a Gemini-vision check tool so the
 * director can invoke it; the playability verdict itself is produced by code, not the model.
 *
 * Research: research/langchain-agents-chains-gemini.md (createAgent, multimodal vision input),
 * research/bitecs.md (0.4 world/query API the injected probe is built against).
 */
import { createAgent, tool } from 'langchain';
import * as z from 'zod';
import { createTriageModel } from '../providers';

const PLAYTEST_LOG_PREFIX = '[engine/ai/agents/playtester]';

// ---------------------------------------------------------------------------
// Injected game-session contract (controller action API + bitECS world probe).
// Sibling modules (engine/input/controller.ts, engine/ecs/bitecs.ts) provide these
// at runtime; we type them locally so we never import work-in-progress siblings.
// ---------------------------------------------------------------------------

/** A position read from the bitECS world for a single entity. */
export interface EntityPosition {
  eid: number;
  x: number;
  y: number;
}

/**
 * The headless game session the playtester drives. The generated game's main loop is wrapped
 * by the scaffold to expose this surface (no renderer attached).
 */
export interface GameSession {
  /** Reset the world to its initial state. */
  reset(): void;
  /** Dispatch a controller action (e.g. 'move_left', 'jump', 'interact') for one logical input. */
  dispatch(action: string): void;
  /** Advance the simulation by one fixed timestep; returns the wall-clock ms it took. */
  step(deltaMs: number): number;
  /** Current positions of all entities with a Position component. */
  positions(): EntityPosition[];
  /** Whether the win state has been reached this run. */
  isWin(): boolean;
  /** Whether the lose state has been reached this run. */
  isLose(): boolean;
  /** The controller actions this game accepts (for movement probing). */
  availableActions(): string[];
}

// ---------------------------------------------------------------------------
// Invariant report schemas.
// ---------------------------------------------------------------------------

export const InvariantResultSchema = z.object({
  name: z.enum([
    'player_can_move',
    'win_reachable',
    'lose_reachable',
    'no_nan_positions',
    'frame_budget',
  ]),
  passed: z.boolean(),
  detail: z.string(),
});
export type InvariantResult = z.infer<typeof InvariantResultSchema>;

export const PlaytestReportSchema = z.object({
  playable: z.boolean(),
  invariants: z.array(InvariantResultSchema),
  /** Worst observed single-step duration in ms (frame-budget diagnostics). */
  worstStepMs: z.number().nonnegative(),
  stepsRun: z.number().int().nonnegative(),
});
export type PlaytestReport = z.infer<typeof PlaytestReportSchema>;

export interface PlaytestOptions {
  /** Max simulation steps per probe run. */
  maxSteps?: number;
  /** Fixed timestep in ms. */
  deltaMs?: number;
  /** Per-step wall-clock budget in ms; exceeding it fails the frame_budget invariant. */
  frameBudgetMs?: number;
}

const DEFAULT_PLAYTEST_OPTIONS: Required<PlaytestOptions> = {
  maxSteps: 600,
  deltaMs: 1000 / 60,
  frameBudgetMs: 16,
};

/** True iff the position list contains any NaN/Infinite coordinate. */
export function hasNanPosition(positions: EntityPosition[]): boolean {
  for (const p of positions) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return true;
  }
  return false;
}

/** Did any entity's position change between two snapshots? */
export function positionsChanged(before: EntityPosition[], after: EntityPosition[]): boolean {
  const beforeById = new Map(before.map((p) => [p.eid, p]));
  for (const a of after) {
    const b = beforeById.get(a.eid);
    if (b === undefined) return true;
    if (b.x !== a.x || b.y !== a.y) return true;
  }
  return false;
}

/**
 * Deterministic headless playtest. Drives the injected session through every available action,
 * checks invariants, and returns a structured report. No model involvement — fully unit-testable
 * with a fake GameSession.
 */
export function runPlaytest(session: GameSession, options: PlaytestOptions = {}): PlaytestReport {
  const opts = { ...DEFAULT_PLAYTEST_OPTIONS, ...options };
  const invariants: InvariantResult[] = [];
  let worstStepMs = 0;
  let stepsRun = 0;
  let sawNan = false;

  // --- player_can_move: dispatch each available action and watch for any movement. ---
  session.reset();
  const actions = session.availableActions();
  let moved = false;
  const initial = session.positions();
  if (hasNanPosition(initial)) sawNan = true;
  for (const action of actions) {
    const before = session.positions();
    session.dispatch(action);
    const ms = session.step(opts.deltaMs);
    stepsRun++;
    worstStepMs = Math.max(worstStepMs, ms);
    const after = session.positions();
    if (hasNanPosition(after)) sawNan = true;
    if (positionsChanged(before, after)) moved = true;
  }
  invariants.push({
    name: 'player_can_move',
    passed: moved,
    detail: moved
      ? `movement observed across ${actions.length} action(s)`
      : `no entity moved for any of [${actions.join(', ')}] — controller may be unwired`,
  });

  // --- win_reachable & lose_reachable: free-run, trying actions round-robin. ---
  let winReached = session.isWin();
  let loseReached = session.isLose();
  session.reset();
  for (let i = 0; i < opts.maxSteps && !(winReached && loseReached); i++) {
    if (actions.length > 0) {
      const action = actions[i % actions.length];
      if (action !== undefined) session.dispatch(action);
    }
    const ms = session.step(opts.deltaMs);
    stepsRun++;
    worstStepMs = Math.max(worstStepMs, ms);
    if (hasNanPosition(session.positions())) sawNan = true;
    if (session.isWin()) winReached = true;
    if (session.isLose()) loseReached = true;
  }
  invariants.push({
    name: 'win_reachable',
    passed: winReached,
    detail: winReached ? 'win state reached during probe' : `win not reached within ${opts.maxSteps} steps`,
  });
  invariants.push({
    name: 'lose_reachable',
    passed: loseReached,
    detail: loseReached
      ? 'lose state reached during probe'
      : `lose not reached within ${opts.maxSteps} steps`,
  });

  invariants.push({
    name: 'no_nan_positions',
    passed: !sawNan,
    detail: sawNan ? 'a NaN/Infinite entity position was observed' : 'all positions finite',
  });

  const frameOk = worstStepMs <= opts.frameBudgetMs;
  invariants.push({
    name: 'frame_budget',
    passed: frameOk,
    detail: frameOk
      ? `worst step ${worstStepMs.toFixed(2)}ms within ${opts.frameBudgetMs}ms budget`
      : `worst step ${worstStepMs.toFixed(2)}ms exceeds ${opts.frameBudgetMs}ms budget`,
  });

  return {
    playable: invariants.every((i) => i.passed),
    invariants,
    worstStepMs,
    stepsRun,
  };
}

// ---------------------------------------------------------------------------
// The LangChain agent.
// ---------------------------------------------------------------------------

/** Injected vision check over a prototype-still screenshot (Gemini vision via sibling visualizer). */
export interface PrototypeVisionCheck {
  /** Inspect a composed-scene screenshot; resolves with a pass/fail + notes. */
  inspect(args: { dataUrl: string; styleBible: string }): Promise<{ ok: boolean; notes: string }>;
}

export interface PlaytesterDeps {
  /** Factory producing a fresh headless session for the current game build. */
  createSession: () => GameSession;
  /** Optional prototype-still vision check (composed scene). */
  visionCheck?: PrototypeVisionCheck;
  /** Style bible passed to the vision check. */
  styleBible?: string;
  options?: PlaytestOptions;
}

const SYSTEM_PROMPT =
  'You are the playtester. Call run_invariants to drive the freshly built game headlessly and get a ' +
  'deterministic playability report (player can move, win/lose reachable, no NaN positions, frame ' +
  'budget). If a prototype-still screenshot is available, call vision_check_scene. Summarize failing ' +
  'invariants as structured problems for the debugger; never attempt to fix code yourself.';

/**
 * Factory: build the playtester agent. The invariant proof is deterministic code; the model only
 * decides when to run it and how to summarize failures for the debugger.
 */
export function createPlaytesterAgent(deps: PlaytesterDeps) {
  if (!deps || typeof deps.createSession !== 'function') {
    throw new Error(`${PLAYTEST_LOG_PREFIX} deps.createSession factory is required`);
  }
  console.log(`${PLAYTEST_LOG_PREFIX} create`);

  const invariantTool = tool(
    async () => {
      console.log(`${PLAYTEST_LOG_PREFIX} run_invariants start`);
      let report: PlaytestReport;
      try {
        const session = deps.createSession();
        report = runPlaytest(session, deps.options ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${PLAYTEST_LOG_PREFIX} run_invariants threw`, error);
        report = {
          playable: false,
          invariants: [{ name: 'player_can_move', passed: false, detail: `harness error: ${message}` }],
          worstStepMs: 0,
          stepsRun: 0,
        };
      }
      console.log(
        `${PLAYTEST_LOG_PREFIX} run_invariants done playable=${report.playable} steps=${report.stepsRun}`,
      );
      return JSON.stringify(report);
    },
    {
      name: 'run_invariants',
      description:
        'Drive the current game build headlessly through the controller action API and return a ' +
        'deterministic playability report (invariants + frame timing).',
      schema: z.object({}),
    },
  );

  const visionTool = tool(
    async (input: { dataUrl: string }) => {
      if (!deps.visionCheck) {
        return 'No prototype-still vision check is configured for this build.';
      }
      console.log(`${PLAYTEST_LOG_PREFIX} vision_check_scene`);
      try {
        const result = await deps.visionCheck.inspect({
          dataUrl: input.dataUrl,
          styleBible: deps.styleBible ?? '',
        });
        return JSON.stringify(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${PLAYTEST_LOG_PREFIX} vision_check_scene failed`, error);
        return `Vision check failed: ${message}`;
      }
    },
    {
      name: 'vision_check_scene',
      description:
        'Vision-check a composed prototype-still screenshot against the style bible to catch ' +
        'integration errors single-asset review misses.',
      schema: z.object({
        dataUrl: z.string().describe('data: URL of the composed-scene screenshot'),
      }),
    },
  );

  return createAgent({
    model: createTriageModel(),
    tools: [invariantTool, visionTool],
    systemPrompt: SYSTEM_PROMPT,
  });
}
