/**
 * This module is langchain entity and HTML page for gemini to conduct websearch based on the users prompt to find visual references and record logic
 *
 * Visual-direction tool: uses Gemini's Google Search grounding (createSearchGroundedModel from
 * engine/ai/providers.ts) to research visual references for the user's game prompt and emit the
 * STYLE BIBLE — reports/style.md + config/style.json (palette, sprite resolution, perspective,
 * outline rules) — which is prepended to EVERY image prompt downstream, plus grounded reference
 * notes written into the game's research/ and references/ folders.
 *
 * Per research/architecture.md: the style bible MUST exist before any image generation. This is a
 * phase 0/1 output of the pipeline. Grounding is a Gemini specialty tool (googleSearch), not a
 * LangChain function tool — see research/langchain-agents-chains-gemini.md and providers.ts.
 */
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import { createSearchGroundedModel } from '../../ai/providers';

const LOG_PREFIX = '[engine/tools/visualizers/visual-direction]';

/**
 * The STYLE BIBLE schema (config/style.json). Every field is required so Gemini's structured
 * output emits a complete object (Gemini requires all object fields to be defined explicitly).
 */
export const StyleBibleSchema = z.object({
  /** Short human title for the visual direction, e.g. "Cozy 16-bit fishing village". */
  title: z.string().min(1),
  /** One-line summary of the overall aesthetic. */
  summary: z.string().min(1),
  /** Named art era / genre, e.g. "16-bit SNES JRPG", "GameBoy 4-shade", "modern flat pixel". */
  artStyle: z.string().min(1),
  /** Ordered palette as hex strings (#RRGGBB). At least one colour. */
  palette: z.array(z.string().regex(/^#?[0-9a-fA-F]{6}$/u, 'expected #RRGGBB hex')).min(1),
  /** Square sprite tile resolution in px (e.g. 16, 32, 64). */
  spriteResolution: z.number().int().positive(),
  /** Camera/projection perspective. */
  perspective: z.enum(['top-down', 'side-scroller', 'isometric', 'three-quarter', 'first-person']),
  /** Outline rule for sprites. */
  outline: z.object({
    enabled: z.boolean(),
    color: z.string().regex(/^#?[0-9a-fA-F]{6}$/u, 'expected #RRGGBB hex').optional(),
    /** e.g. "1px black selective outline on outer silhouette only". */
    notes: z.string(),
  }),
  /** Shading approach, e.g. "flat", "dithered", "soft cel". */
  shading: z.string().min(1),
  /** Mood/atmosphere keywords driving every prompt. */
  mood: z.array(z.string().min(1)).min(1),
  /** Free-form additional rules the image model must obey. */
  rules: z.array(z.string().min(1)),
});

export type StyleBible = z.infer<typeof StyleBibleSchema>;

/** A single grounded visual reference discovered via web search. */
export const VisualReferenceSchema = z.object({
  title: z.string().min(1),
  /** Why this reference is relevant to the requested game. */
  reason: z.string().min(1),
  /** Source URL when grounding surfaced one. */
  url: z.string().optional(),
});

export type VisualReference = z.infer<typeof VisualReferenceSchema>;

/** Combined structured output produced by the grounded model. */
export const VisualDirectionResultSchema = z.object({
  style: StyleBibleSchema,
  references: z.array(VisualReferenceSchema),
  /** Markdown notes body for reports/style.md (everything below the front-matter). */
  notes: z.string().min(1),
});

export type VisualDirectionResult = z.infer<typeof VisualDirectionResultSchema>;

/** Minimal structural type of a LangChain chat model response we rely on. */
interface ModelResponseLike {
  content: unknown;
  response_metadata?: Record<string, unknown> | undefined;
}

/** Minimal model interface — injectable for testing (mirrors createSearchGroundedModel()). */
export interface GroundedModelLike {
  invoke(input: unknown): Promise<ModelResponseLike>;
}

export interface VisualDirectionDeps {
  /** Grounded model; defaults to createSearchGroundedModel(). */
  model?: GroundedModelLike;
  /** fs writer; injectable. Defaults to node:fs/promises. */
  writeFile?: (file: string, data: string) => Promise<void>;
  mkdir?: (dir: string, opts: { recursive: boolean }) => Promise<unknown>;
}

export interface VisualDirectionOptions {
  /** The user's raw game prompt. */
  prompt: string;
  /** Absolute path to the generated game's root folder (generations/<game>/). */
  gameRoot: string;
}

export interface VisualDirectionOutput {
  result: VisualDirectionResult;
  /** Absolute paths written. */
  files: { styleJson: string; styleMd: string; referencesJson: string; researchNotes: string };
}

/**
 * Coerce a LangChain message `content` (string OR content-block array) into plain text.
 * Guards against the multimodal block shape per research/vercel-langchain-gemini.md.
 */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block);
    } else if (block && typeof block === 'object') {
      const b = block as Record<string, unknown>;
      if (b['type'] === 'text' && typeof b['text'] === 'string') parts.push(b['text']);
    }
  }
  return parts.join('\n');
}

/**
 * Pull the first JSON object out of a (possibly markdown-fenced) model text response and
 * validate it against VisualDirectionResultSchema. Throws (retryable) on parse/validation failure.
 */
export function parseVisualDirection(text: string): VisualDirectionResult {
  if (!text || text.trim().length === 0) {
    throw new Error(`${LOG_PREFIX} parseVisualDirection: empty model response (retryable)`);
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${LOG_PREFIX} parseVisualDirection: no JSON object found (retryable)`);
  }
  const slice = candidate.slice(start, end + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(slice);
  } catch (err) {
    throw new Error(`${LOG_PREFIX} parseVisualDirection: invalid JSON: ${(err as Error).message} (retryable)`);
  }
  return VisualDirectionResultSchema.parse(raw);
}

/** Normalize a hex colour to leading-# form for emitted artifacts. */
function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

/**
 * Render the style bible to the reports/style.md markdown body. This file (plus config/style.json)
 * is the human-readable half of the STYLE BIBLE prepended to every image prompt.
 */
export function renderStyleMarkdown(result: VisualDirectionResult): string {
  const { style, references, notes } = result;
  const palette = style.palette.map(normalizeHex).join(', ');
  const refLines = references.length
    ? references
        .map((r) => `- **${r.title}** — ${r.reason}${r.url ? ` ([source](${r.url}))` : ''}`)
        .join('\n')
    : '_No grounded references recorded._';
  return [
    `# Style Bible — ${style.title}`,
    '',
    `> ${style.summary}`,
    '',
    '## Visual Rules (prepended to every image prompt)',
    '',
    `- **Art style:** ${style.artStyle}`,
    `- **Perspective:** ${style.perspective}`,
    `- **Sprite resolution:** ${style.spriteResolution}px`,
    `- **Shading:** ${style.shading}`,
    `- **Outline:** ${style.outline.enabled ? 'yes' : 'no'}${
      style.outline.color ? ` (${normalizeHex(style.outline.color)})` : ''
    } — ${style.outline.notes}`,
    `- **Palette:** ${palette}`,
    `- **Mood:** ${style.mood.join(', ')}`,
    '',
    '### Additional rules',
    '',
    ...(style.rules.length ? style.rules.map((r) => `- ${r}`) : ['- _none_']),
    '',
    '## Visual References',
    '',
    refLines,
    '',
    '## Research Notes',
    '',
    notes,
    '',
  ].join('\n');
}

/**
 * Build the compact text block that downstream image prompts prepend. Deterministic — pure fn.
 */
export function styleBibleToPromptPreamble(style: StyleBible): string {
  const palette = style.palette.map(normalizeHex).join(', ');
  const outline = style.outline.enabled
    ? `outlined${style.outline.color ? ` in ${normalizeHex(style.outline.color)}` : ''} (${style.outline.notes})`
    : 'no outline';
  return [
    `STYLE BIBLE — obey strictly:`,
    `Art style: ${style.artStyle}. Perspective: ${style.perspective}. Shading: ${style.shading}.`,
    `Sprite resolution: ${style.spriteResolution}px. Outline: ${outline}.`,
    `Palette (use only these): ${palette}.`,
    `Mood: ${style.mood.join(', ')}.`,
    ...(style.rules.length ? [`Rules: ${style.rules.join('; ')}.`] : []),
  ].join('\n');
}

const SYSTEM_INSTRUCTION = [
  'You are the visual-direction researcher for an AI game engine.',
  'Use Google Search to find real visual references (games, art styles, palettes) matching the',
  "user's game prompt, then synthesize a STYLE BIBLE the image generator will obey.",
  'Respond with ONE JSON object ONLY (optionally fenced in ```json) matching exactly this shape:',
  '{',
  '  "style": { "title", "summary", "artStyle", "palette": ["#RRGGBB"...], "spriteResolution":int,',
  '             "perspective": "top-down|side-scroller|isometric|three-quarter|first-person",',
  '             "outline": { "enabled":bool, "color":"#RRGGBB"?, "notes":string },',
  '             "shading", "mood": [string...], "rules": [string...] },',
  '  "references": [ { "title", "reason", "url"? } ... ],',
  '  "notes": "markdown research notes"',
  '}',
  'Palette entries MUST be #RRGGBB hex. Do not include any prose outside the JSON object.',
].join('\n');

/**
 * Run visual-direction research and write the style bible + reference artifacts into the game tree.
 * Returns the parsed result and the absolute paths written.
 */
export async function runVisualDirection(
  options: VisualDirectionOptions,
  deps: VisualDirectionDeps = {},
): Promise<VisualDirectionOutput> {
  const prompt = options?.prompt?.trim();
  const gameRoot = options?.gameRoot?.trim();
  if (!prompt) throw new Error(`${LOG_PREFIX} runVisualDirection: prompt must be a non-empty string`);
  if (!gameRoot) throw new Error(`${LOG_PREFIX} runVisualDirection: gameRoot must be a non-empty string`);

  const model: GroundedModelLike = deps.model ?? (createSearchGroundedModel() as unknown as GroundedModelLike);
  const writeFile = deps.writeFile ?? ((f: string, d: string) => fsPromises.writeFile(f, d, 'utf8'));
  const mkdir = deps.mkdir ?? ((d: string, o: { recursive: boolean }) => fsPromises.mkdir(d, o));

  const started = Date.now();
  console.log(`${LOG_PREFIX} runVisualDirection start gameRoot=${gameRoot} promptChars=${prompt.length}`);

  let response: ModelResponseLike;
  try {
    response = await model.invoke([
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: `Game prompt:\n${prompt}` },
    ]);
  } catch (err) {
    console.error(`${LOG_PREFIX} runVisualDirection model-error: ${(err as Error).message}`);
    throw err;
  }

  const groundingChunks = response.response_metadata?.['groundingMetadata'];
  const text = extractText(response.content);
  const result = parseVisualDirection(text);

  const configDir = path.join(gameRoot, 'config');
  const reportsDir = path.join(gameRoot, 'reports');
  const referencesDir = path.join(gameRoot, 'references');
  const researchDir = path.join(gameRoot, 'research');

  await Promise.all([
    mkdir(configDir, { recursive: true }),
    mkdir(reportsDir, { recursive: true }),
    mkdir(referencesDir, { recursive: true }),
    mkdir(researchDir, { recursive: true }),
  ]);

  // Normalize palette/outline hex on write for consistency.
  const normalizedStyle: StyleBible = {
    ...result.style,
    palette: result.style.palette.map(normalizeHex),
    outline: {
      ...result.style.outline,
      ...(result.style.outline.color ? { color: normalizeHex(result.style.outline.color) } : {}),
    },
  };
  const normalizedResult: VisualDirectionResult = { ...result, style: normalizedStyle };

  const styleJson = path.join(configDir, 'style.json');
  const styleMd = path.join(reportsDir, 'style.md');
  const referencesJson = path.join(referencesDir, 'references.json');
  const researchNotes = path.join(researchDir, 'visual-direction.md');

  await Promise.all([
    writeFile(styleJson, `${JSON.stringify(normalizedStyle, null, 2)}\n`),
    writeFile(styleMd, renderStyleMarkdown(normalizedResult)),
    writeFile(
      referencesJson,
      `${JSON.stringify(
        { references: normalizedResult.references, grounding: groundingChunks ?? null },
        null,
        2,
      )}\n`,
    ),
    writeFile(researchNotes, `# Visual Direction Research\n\n${normalizedResult.notes}\n`),
  ]);

  console.log(
    `${LOG_PREFIX} runVisualDirection done durationMs=${Date.now() - started} ` +
      `refs=${normalizedResult.references.length} palette=${normalizedStyle.palette.length}`,
  );

  return { result: normalizedResult, files: { styleJson, styleMd, referencesJson, researchNotes } };
}
