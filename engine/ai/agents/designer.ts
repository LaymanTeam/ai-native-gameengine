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
  'actually ships within the engine budget. Ground the core mechanic in established patterns — ' +
  'cite the matching mechanic from gamemechanicsexplorer.com (via the research notes) so the ' +
  'logic-evaluator has a known-coherent rule template to verify against. ' +
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
