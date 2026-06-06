/**
 * Asset-review surface: presents a generated/fetched asset together with the STYLE BIBLE and a
 * numeric rubric for judgment — either by the AI image-reviewer agent (a triage model scoring the
 * asset against the style bible) or by a human (the escalation gate after the bounded retry loop).
 * Returns a structured verdict (score, per-criterion breakdown, issues, accept/retry/escalate).
 *
 * Per research/architecture.md: the image-reviewer scores assets against the style bible with a
 * numeric rubric, runs a bounded loop (≤3 retries) then escalates to the human via this surface
 * (humanInTheLoopMiddleware). This module provides BOTH the AI scoring entry point and the pure
 * verdict-shaping logic the human gate reuses.
 */
import * as z from 'zod';
import { createTriageModel } from '../../ai/providers';
import { styleBibleToPromptPreamble, type StyleBible } from './visual-direction';

const LOG_PREFIX = '[engine/tools/visualizers/asset-review]';

/** Default acceptance threshold (0–100) for an asset to pass review. */
export const DEFAULT_ACCEPT_THRESHOLD = 75;
/** Default max generation retries before escalating to a human. */
export const DEFAULT_MAX_RETRIES = 3;

/** The rubric criteria an asset is scored on, each 0–100. */
export const RUBRIC_CRITERIA = [
  'paletteAdherence',
  'styleConsistency',
  'resolutionFidelity',
  'subjectAccuracy',
  'outlineCompliance',
] as const;

export type RubricCriterion = (typeof RUBRIC_CRITERIA)[number];

const RubricScoresSchema = z.object({
  paletteAdherence: z.number().min(0).max(100),
  styleConsistency: z.number().min(0).max(100),
  resolutionFidelity: z.number().min(0).max(100),
  subjectAccuracy: z.number().min(0).max(100),
  outlineCompliance: z.number().min(0).max(100),
});

export type RubricScores = z.infer<typeof RubricScoresSchema>;

/** The structured verdict returned to the image-reviewer / director. */
export const AssetVerdictSchema = z.object({
  /** Weighted overall score 0–100. */
  score: z.number().min(0).max(100),
  /** Per-criterion scores. */
  rubric: RubricScoresSchema,
  /** Concrete, actionable issues to feed back into the next generation prompt. */
  issues: z.array(z.string()),
  /** Terminal decision. */
  decision: z.enum(['accept', 'retry', 'escalate']),
  /** Whether a human (not the AI) produced this verdict. */
  human: z.boolean(),
  /** Short rationale. */
  rationale: z.string(),
});

export type AssetVerdict = z.infer<typeof AssetVerdictSchema>;

/** Raw model judgment (before the deterministic decision is applied). */
const ModelJudgmentSchema = z.object({
  rubric: RubricScoresSchema,
  issues: z.array(z.string()),
  rationale: z.string(),
});

export interface AssetUnderReview {
  /** A label for logging, e.g. "sprites/player_idle". */
  name: string;
  /** data: URL (base64 PNG) of the asset — as produced by providers.generateImage. */
  dataUrl: string;
  /** What the asset is supposed to depict (drives subjectAccuracy). */
  intent: string;
}

export interface ReviewConfig {
  acceptThreshold?: number;
  maxRetries?: number;
  /** Current retry attempt (0-based). When attempt >= maxRetries, a sub-threshold asset escalates. */
  attempt?: number;
}

/** Minimal model response we read. */
interface ModelResponseLike {
  content: unknown;
}

export interface ReviewModelLike {
  invoke(input: unknown): Promise<ModelResponseLike>;
}

export interface AssetReviewDeps {
  model?: ReviewModelLike;
}

/** Equal-weight mean of the rubric criteria, rounded to an integer. */
export function computeScore(rubric: RubricScores): number {
  const values = RUBRIC_CRITERIA.map((c) => rubric[c]);
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

/**
 * Deterministically turn a numeric score + retry state into a terminal decision.
 * - score >= threshold → accept
 * - below threshold but retries remain → retry
 * - below threshold and out of retries → escalate to human
 */
export function decideFromScore(
  score: number,
  config: Required<Pick<ReviewConfig, 'acceptThreshold' | 'maxRetries' | 'attempt'>>,
): AssetVerdict['decision'] {
  if (score >= config.acceptThreshold) return 'accept';
  if (config.attempt < config.maxRetries) return 'retry';
  return 'escalate';
}

/** Coerce a LangChain content (string | block[]) to text. */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'string') parts.push(block);
    else if (block && typeof block === 'object') {
      const b = block as Record<string, unknown>;
      if (b['type'] === 'text' && typeof b['text'] === 'string') parts.push(b['text']);
    }
  }
  return parts.join('\n');
}

/** Parse the model's rubric judgment from (possibly fenced) JSON text. Throws on failure. */
export function parseModelJudgment(text: string): z.infer<typeof ModelJudgmentSchema> {
  if (!text || text.trim().length === 0) {
    throw new Error(`${LOG_PREFIX} parseModelJudgment: empty response`);
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${LOG_PREFIX} parseModelJudgment: no JSON object found`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new Error(`${LOG_PREFIX} parseModelJudgment: invalid JSON: ${(err as Error).message}`);
  }
  return ModelJudgmentSchema.parse(raw);
}

const SYSTEM_INSTRUCTION = [
  'You are the image-reviewer for an AI game engine. Score the supplied asset image against the',
  'STYLE BIBLE and the asset intent using a 0–100 rubric. Be a strict, consistent grader.',
  'Respond with ONE JSON object ONLY matching:',
  '{ "rubric": { "paletteAdherence":0-100, "styleConsistency":0-100, "resolutionFidelity":0-100,',
  '  "subjectAccuracy":0-100, "outlineCompliance":0-100 },',
  '  "issues": [ "actionable fix..." ], "rationale": "one or two sentences" }',
  'Issues must be concrete enough to feed back into the next image-generation prompt.',
].join('\n');

/** Build a human-readable rubric prompt — also used to render the human-review surface. */
export function buildReviewPrompt(asset: AssetUnderReview, style: StyleBible): string {
  return [
    styleBibleToPromptPreamble(style),
    '',
    `Asset under review: ${asset.name}`,
    `Intended subject: ${asset.intent}`,
    '',
    'Score this asset against the style bible on each rubric criterion (0–100).',
  ].join('\n');
}

/**
 * AI-side review: scores an asset with the triage model and applies the deterministic decision.
 * The director/image-reviewer agent invokes this inside its bounded retry loop.
 */
export async function reviewAsset(
  asset: AssetUnderReview,
  style: StyleBible,
  config: ReviewConfig = {},
  deps: AssetReviewDeps = {},
): Promise<AssetVerdict> {
  if (!asset?.dataUrl || asset.dataUrl.trim().length === 0) {
    throw new Error(`${LOG_PREFIX} reviewAsset: asset.dataUrl must be a non-empty data URL`);
  }
  const resolved = {
    acceptThreshold: config.acceptThreshold ?? DEFAULT_ACCEPT_THRESHOLD,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    attempt: config.attempt ?? 0,
  };
  const model: ReviewModelLike = deps.model ?? (createTriageModel() as unknown as ReviewModelLike);

  const started = Date.now();
  console.log(
    `${LOG_PREFIX} reviewAsset start name=${asset.name} attempt=${resolved.attempt} ` +
      `threshold=${resolved.acceptThreshold}`,
  );

  let response: ModelResponseLike;
  try {
    response = await model.invoke([
      { role: 'system', content: SYSTEM_INSTRUCTION },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildReviewPrompt(asset, style) },
          { type: 'image_url', image_url: { url: asset.dataUrl } },
        ],
      },
    ]);
  } catch (err) {
    console.error(`${LOG_PREFIX} reviewAsset model-error name=${asset.name}: ${(err as Error).message}`);
    throw err;
  }

  const judgment = parseModelJudgment(extractText(response.content));
  const score = computeScore(judgment.rubric);
  const decision = decideFromScore(score, resolved);
  const verdict: AssetVerdict = {
    score,
    rubric: judgment.rubric,
    issues: judgment.issues,
    decision,
    human: false,
    rationale: judgment.rationale,
  };

  console.log(
    `${LOG_PREFIX} reviewAsset done name=${asset.name} score=${score} decision=${decision} ` +
      `durationMs=${Date.now() - started} issues=${judgment.issues.length}`,
  );
  return AssetVerdictSchema.parse(verdict);
}

/**
 * Shape a raw human decision into a structured verdict — the escalation gate's return path.
 * Defensive: clamps the score, defaults rubric to the overall score, marks human=true.
 */
export function buildHumanVerdict(input: {
  accept: boolean;
  score?: number;
  issues?: string[];
  rationale?: string;
}): AssetVerdict {
  const score = Math.max(0, Math.min(100, Math.round(input?.score ?? (input?.accept ? 100 : 0))));
  const uniform: RubricScores = {
    paletteAdherence: score,
    styleConsistency: score,
    resolutionFidelity: score,
    subjectAccuracy: score,
    outlineCompliance: score,
  };
  const verdict: AssetVerdict = {
    score,
    rubric: uniform,
    issues: Array.isArray(input?.issues) ? input.issues : [],
    decision: input?.accept ? 'accept' : 'retry',
    human: true,
    rationale: input?.rationale ?? (input?.accept ? 'Human accepted.' : 'Human requested changes.'),
  };
  console.log(`${LOG_PREFIX} buildHumanVerdict accept=${input?.accept} score=${score}`);
  return AssetVerdictSchema.parse(verdict);
}
