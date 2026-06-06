/**
 * Designer/producer agent — phase 0 of the pipeline. Converts the user's prompt into a BOUNDED
 * game design document (reports/gdd.md + machine-readable config/gdd.json): one core mechanic,
 * 1-3 scenes, explicit non-goals/scope cuts. Confirms the GDD with the user in chat BEFORE any
 * generation spends tokens. The GDD is the cross-agent source of truth — every downstream agent
 * (coder, image-reviewer, playtester, logic-evaluator) receives it.
 *
 * Architecture: LangChain v1 `createAgent` (LangGraph loop) — same pattern as director.ts.
 * No custom state machine. Models come from engine/ai/providers.ts; sibling engine tools are
 * INJECTED (built in parallel) — never imported here. Research:
 * research/langchain-agents-chains-gemini.md, research/vercel-langchain-gemini.md.
 */
import { createAgent } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import * as z from 'zod';
import { createConversationModel } from '../providers';

export const DESIGNER_LOG_PREFIX = '[engine/ai/agents/designer]';

/**
 * Machine-readable GDD schema (config/gdd.json). Bounded by design: exactly one core mechanic,
 * 1-3 scenes, explicit non-goals. Gemini tool/structured-output schemas must define every object
 * field explicitly (no loose props) — research/langchain-agents-chains-gemini.md.
 */
export const gddSceneSchema = z.object({
  id: z.string().min(1).describe('Stable kebab-case scene identifier, e.g. "village"'),
  name: z.string().min(1).describe('Human-readable scene name'),
  description: z.string().min(1).describe('What happens in this scene and how it looks'),
});

export const gddSchema = z.object({
  title: z.string().min(1).describe('Game title'),
  pitch: z.string().min(1).describe('One-sentence elevator pitch'),
  genre: z.string().min(1).describe('Primary genre, e.g. "top-down adventure"'),
  coreMechanic: z
    .string()
    .min(1)
    .describe('THE single core mechanic the whole game hangs on (bounded — exactly one)'),
  scenes: z
    .array(gddSceneSchema)
    .min(1)
    .max(3)
    .describe('1-3 scenes only — keeps generation within the Vercel 300s phase budget'),
  winCondition: z.string().min(1).describe('Explicit, checkable condition the player wins by'),
  loseCondition: z.string().min(1).describe('Explicit, checkable condition the player loses by'),
  controls: z
    .array(z.string().min(1))
    .min(1)
    .describe('Player actions, e.g. ["move", "interact", "jump"]'),
  nonGoals: z
    .array(z.string().min(1))
    .min(1)
    .describe('Explicit scope cuts — features deliberately NOT built (bounds the project)'),
});

export type GameDesignDocument = z.infer<typeof gddSchema>;

/** Renders a validated GDD object to the human-facing reports/gdd.md markdown. Pure + testable. */
export function renderGddMarkdown(gdd: GameDesignDocument): string {
  const lines: string[] = [
    `# Game Design Document — ${gdd.title}`,
    '',
    `> ${gdd.pitch}`,
    '',
    `- **Genre:** ${gdd.genre}`,
    `- **Core mechanic:** ${gdd.coreMechanic}`,
    `- **Win condition:** ${gdd.winCondition}`,
    `- **Lose condition:** ${gdd.loseCondition}`,
    `- **Controls:** ${gdd.controls.join(', ')}`,
    '',
    '## Scenes',
    '',
  ];
  for (const scene of gdd.scenes) {
    lines.push(`### ${scene.name} (\`${scene.id}\`)`, '', scene.description, '');
  }
  lines.push('## Non-goals (explicit scope cuts)', '');
  for (const ng of gdd.nonGoals) lines.push(`- ${ng}`);
  lines.push('');
  return lines.join('\n');
}

/** Validates an unknown value as a GDD; returns a discriminated result for safe call sites. */
export function parseGdd(
  value: unknown,
):
  | { ok: true; gdd: GameDesignDocument }
  | { ok: false; errors: string[] } {
  const result = gddSchema.safeParse(value);
  if (result.success) {
    console.log(`${DESIGNER_LOG_PREFIX} parseGdd ok title=${result.data.title}`);
    return { ok: true, gdd: result.data };
  }
  const errors = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(`${DESIGNER_LOG_PREFIX} parseGdd failed`, errors);
  return { ok: false, errors };
}

const SYSTEM_PROMPT =
  'You are the designer/producer of an AI game engine that generates complete, playable 2D games. ' +
  'Turn the user prompt into a BOUNDED game design document: exactly ONE core mechanic, 1-3 scenes, ' +
  'and explicit non-goals (features you deliberately will NOT build). Smaller scope = a game that ' +
  'actually ships within the engine budget. ' +
  'Always confirm the scope with the user in chat BEFORE finalizing — surface the core mechanic, ' +
  'scenes, win/lose conditions, and the non-goals, and ask them to approve or adjust. ' +
  'Only after the user approves, call write_gdd to persist reports/gdd.md and config/gdd.json. ' +
  'The GDD becomes the single source of truth for every downstream agent — be concrete and checkable.';

/** Module-scoped checkpointer so the scope-confirmation conversation persists across warm invocations. */
const checkpointer = new MemorySaver();

export interface DesignerAgentOptions {
  /** Injected tools (e.g. write_gdd persistence, visual-direction). Optional; defaults to none. */
  tools?: StructuredToolInterface[];
}

/**
 * Build the designer agent. Tools that persist the GDD to the game folder are injected by the
 * caller (director/route) — this module never imports sibling engine tools directly.
 */
export function createDesignerAgent(options: DesignerAgentOptions = {}) {
  const tools = options.tools ?? [];
  console.log(`${DESIGNER_LOG_PREFIX} create toolCount=${tools.length}`);
  return createAgent({
    model: createConversationModel(),
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer,
  });
}

/** Config helper: checkpointer keys the scope conversation by thread_id (one per game). */
export function designerThreadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

function titleCaseLocal(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deterministic, model-free GDD — the keyless dev path and offline fallback for the design phase.
 * Lets the design phase run (and be verified) without GOOGLE_API_KEY; the real designer agent
 * produces a richer GDD when a key is present.
 */
export function buildLocalGdd(prompt: string): GameDesignDocument {
  const clean = prompt.trim() || 'a small top-down adventure';
  const words = clean.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const title = titleCaseLocal(words.slice(0, 4).join(' ')) || 'Untitled Run';
  const subject = titleCaseLocal(words.slice(0, 3).join(' ') || 'the world');
  const genre = /shoot|gun|bullet|blast/.test(clean) ? 'top-down shooter'
    : /puzzle|match|solve/.test(clean) ? 'puzzle'
    : /platform|jump/.test(clean) ? 'platformer'
    : /race|drift|car/.test(clean) ? 'arcade racer'
    : 'top-down action';
  const isShooter = genre.includes('shooter') || genre.includes('action');
  const gdd: GameDesignDocument = {
    title,
    pitch: `A bounded ${genre} built from: "${clean}".`,
    genre,
    coreMechanic: genre.includes('puzzle')
      ? 'Rearrange the board to satisfy the goal pattern.'
      : isShooter
        ? 'Move and auto-fire at waves of enemies while dodging.'
        : 'Move through the space, avoid hazards, and reach the goal.',
    scenes: [
      { id: 'arena', name: `${subject} Arena`, description: `The single playable space, themed around "${clean}".` },
    ],
    winCondition: isShooter ? 'Survive all waves (or defeat the boss).' : 'Reach the goal / clear the objective.',
    loseCondition: 'Player health reaches zero.',
    controls: ['move (WASD/arrows)', isShooter ? 'auto-fire' : 'interact'],
    nonGoals: ['no multiplayer', 'no save system', 'one authored scene (no procedural levels)'],
  };
  return gddSchema.parse(gdd);
}
