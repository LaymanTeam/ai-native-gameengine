/**
 * Image-reviewer agent — scores generated assets against the STYLE BIBLE (config/style.json) with a
 * numeric rubric (palette adherence, sprite resolution, perspective, outline rules, subject match).
 * Runs a bounded loop (3 retries): if an asset scores below the pass threshold the agent requests a
 * regeneration with concrete feedback; after the retry budget is exhausted it escalates to a human
 * via the asset-review surface using LangChain's `humanInTheLoopMiddleware`. This closes the asset
 * quality loop the same way the tester closes the code loop. The deterministic rubric math
 * (`scoreRubric`) lives here as plain, unit-testable TypeScript; the model only assigns the per-
 * criterion 0..1 sub-scores from a vision comparison against the style bible.
 *
 * Research: research/langchain-agents-chains-gemini.md (createAgent, humanInTheLoopMiddleware,
 * multimodal vision input, structured output).
 */
import { createAgent, tool, humanInTheLoopMiddleware } from 'langchain';
import * as z from 'zod';
import { createTriageModel } from '../providers';

const IMG_REVIEW_LOG_PREFIX = '[engine/ai/agents/image-reviewer]';

/** Default pass threshold (weighted score in 0..1). */
export const DEFAULT_PASS_THRESHOLD = 0.75;
/** Default retry budget before human escalation. */
export const DEFAULT_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Rubric schemas.
// ---------------------------------------------------------------------------

/**
 * Per-criterion sub-scores in [0,1], assigned by the vision model when comparing the asset to the
 * style bible. Every field is explicit (Gemini tool schemas forbid loose/unknown properties).
 */
export const RubricScoresSchema = z.object({
  paletteAdherence: z.number().min(0).max(1).describe('how well colors match the style palette'),
  resolutionFit: z.number().min(0).max(1).describe('sprite resolution / pixel-grid correctness'),
  perspective: z.number().min(0).max(1).describe('camera/perspective consistency'),
  outlineRules: z.number().min(0).max(1).describe('outline weight / style-bible outline rules'),
  subjectMatch: z.number().min(0).max(1).describe('depicts the requested subject correctly'),
});
export type RubricScores = z.infer<typeof RubricScoresSchema>;

/** Relative weights for each criterion. Need not sum to 1 — normalized in scoreRubric. */
export interface RubricWeights {
  paletteAdherence: number;
  resolutionFit: number;
  perspective: number;
  outlineRules: number;
  subjectMatch: number;
}

export const DEFAULT_RUBRIC_WEIGHTS: RubricWeights = {
  paletteAdherence: 0.3,
  resolutionFit: 0.2,
  perspective: 0.15,
  outlineRules: 0.15,
  subjectMatch: 0.2,
};

/** The structured verdict for one asset. */
export const RubricVerdictSchema = z.object({
  assetId: z.string(),
  scores: RubricScoresSchema,
  /** Weighted aggregate in [0,1] computed deterministically by scoreRubric. */
  weightedScore: z.number().min(0).max(1),
  passed: z.boolean(),
  /** Concrete, actionable feedback for the next regeneration attempt. */
  feedback: z.string(),
  attempt: z.number().int().nonnegative(),
});
export type RubricVerdict = z.infer<typeof RubricVerdictSchema>;

// ---------------------------------------------------------------------------
// Deterministic rubric math (model-free, unit-testable).
// ---------------------------------------------------------------------------

const RUBRIC_KEYS: (keyof RubricScores)[] = [
  'paletteAdherence',
  'resolutionFit',
  'perspective',
  'outlineRules',
  'subjectMatch',
];

/**
 * Compute the normalized weighted score (0..1) from per-criterion sub-scores.
 * Clamps each sub-score to [0,1]; weights are normalized by their sum (guards divide-by-zero).
 */
export function scoreRubric(
  scores: RubricScores,
  weights: RubricWeights = DEFAULT_RUBRIC_WEIGHTS,
): number {
  let weightSum = 0;
  let acc = 0;
  for (const key of RUBRIC_KEYS) {
    const raw = scores[key];
    const sub = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    const w = Number.isFinite(weights[key]) ? Math.max(0, weights[key]) : 0;
    weightSum += w;
    acc += sub * w;
  }
  if (weightSum <= 0) {
    // Fallback to an unweighted mean so a misconfigured weight set never produces NaN.
    const mean =
      RUBRIC_KEYS.reduce((s, k) => s + Math.min(1, Math.max(0, scores[k])), 0) / RUBRIC_KEYS.length;
    return mean;
  }
  return acc / weightSum;
}

/** Build a full verdict from raw scores + bookkeeping. Pure function. */
export function buildVerdict(args: {
  assetId: string;
  scores: RubricScores;
  feedback: string;
  attempt: number;
  weights?: RubricWeights;
  threshold?: number;
}): RubricVerdict {
  const weightedScore = scoreRubric(args.scores, args.weights ?? DEFAULT_RUBRIC_WEIGHTS);
  const threshold = args.threshold ?? DEFAULT_PASS_THRESHOLD;
  return {
    assetId: args.assetId,
    scores: args.scores,
    weightedScore,
    passed: weightedScore >= threshold,
    feedback: args.feedback,
    attempt: args.attempt,
  };
}

// ---------------------------------------------------------------------------
// Injected dependencies (siblings built in parallel — never import them).
// ---------------------------------------------------------------------------

/** The asset-review human surface (engine/tools/visualizers/asset-review.ts), injected. */
export interface AssetReviewSurface {
  /** Present an escalated asset to the human; resolves with their decision. */
  requestHumanReview(args: {
    assetId: string;
    dataUrl: string;
    styleBible: string;
    lastVerdict: RubricVerdict;
  }): Promise<{ approved: boolean; note: string }>;
}

/** Regeneration callback (image generator / pixel-art tool), injected. */
export interface AssetRegenerator {
  /** Produce a new asset given the original prompt plus rubric feedback. Returns a data URL. */
  regenerate(args: { assetId: string; prompt: string; feedback: string }): Promise<{ dataUrl: string }>;
}

export interface ImageReviewerDeps {
  /** The style bible text (config/style.json serialized + reports/style.md), prepended to prompts. */
  styleBible: string;
  reviewSurface: AssetReviewSurface;
  regenerator: AssetRegenerator;
  weights?: RubricWeights;
  threshold?: number;
  maxRetries?: number;
  /** Observer invoked on every deterministic verdict (pipelines capture the latest one). */
  onVerdict?: (verdict: RubricVerdict) => void;
}

// ---------------------------------------------------------------------------
// The LangChain agent.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You are the image-reviewer. You receive a generated game asset (as an image) and the project ' +
  'STYLE BIBLE. Compare the asset to the bible and call score_asset with honest per-criterion ' +
  'sub-scores in [0,1] (palette adherence, resolution fit, perspective, outline rules, subject ' +
  'match) plus concrete feedback. The tool computes the weighted pass/fail deterministically. ' +
  'If it fails and retries remain, call regenerate_asset with the feedback. After the retry budget ' +
  'is exhausted, escalate to a human via escalate_to_human. Be a strict but constructive critic.';

/**
 * Factory: build the image-reviewer agent. `humanInTheLoopMiddleware` gates the escalate_to_human
 * tool so the asset-review surface always involves a real human before final approval/rejection.
 */
export function createImageReviewerAgent(deps: ImageReviewerDeps) {
  if (!deps || typeof deps.styleBible !== 'string') {
    throw new Error(`${IMG_REVIEW_LOG_PREFIX} deps.styleBible (string) is required`);
  }
  const weights = deps.weights ?? DEFAULT_RUBRIC_WEIGHTS;
  const threshold = deps.threshold ?? DEFAULT_PASS_THRESHOLD;
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  console.log(`${IMG_REVIEW_LOG_PREFIX} create threshold=${threshold} maxRetries=${maxRetries}`);

  const scoreTool = tool(
    async (input: { assetId: string; scores: RubricScores; feedback: string; attempt: number }) => {
      const verdict = buildVerdict({
        assetId: input.assetId,
        scores: input.scores,
        feedback: input.feedback,
        attempt: input.attempt,
        weights,
        threshold,
      });
      console.log(
        `${IMG_REVIEW_LOG_PREFIX} score asset=${verdict.assetId} attempt=${verdict.attempt} ` +
          `score=${verdict.weightedScore.toFixed(3)} passed=${verdict.passed}`,
      );
      deps.onVerdict?.(verdict);
      return JSON.stringify({ ...verdict, retriesRemaining: Math.max(0, maxRetries - input.attempt) });
    },
    {
      name: 'score_asset',
      description:
        'Score an asset against the style bible. Returns a verdict with the deterministic weighted ' +
        'score, pass/fail, and how many retries remain.',
      schema: z.object({
        assetId: z.string(),
        scores: RubricScoresSchema,
        feedback: z.string().describe('actionable critique for the next regeneration'),
        attempt: z.number().int().nonnegative().describe('0-based attempt counter'),
      }),
    },
  );

  // HARD retry bound — code-enforced, not model-enforced. The model is told retries remain
  // via score_asset, but even if it ignores that, this counter refuses attempt maxRetries+1.
  const regenerationAttempts = new Map<string, number>();

  const regenerateTool = tool(
    async (input: { assetId: string; prompt: string; feedback: string }) => {
      const attempts = regenerationAttempts.get(input.assetId) ?? 0;
      if (attempts >= maxRetries) {
        console.error(
          `${IMG_REVIEW_LOG_PREFIX} regenerate REFUSED asset=${input.assetId} attempts=${attempts} max=${maxRetries}`,
        );
        return (
          `REFUSED: retry budget exhausted for ${input.assetId} (${attempts}/${maxRetries}). ` +
          'You MUST call escalate_to_human with the latest verdict now.'
        );
      }
      regenerationAttempts.set(input.assetId, attempts + 1);
      console.log(`${IMG_REVIEW_LOG_PREFIX} regenerate asset=${input.assetId} attempt=${attempts + 1}/${maxRetries}`);
      try {
        const fullPrompt = `${deps.styleBible}\n\nSubject: ${input.prompt}\nFix: ${input.feedback}`;
        const { dataUrl } = await deps.regenerator.regenerate({
          assetId: input.assetId,
          prompt: fullPrompt,
          feedback: input.feedback,
        });
        return `Regenerated asset ${input.assetId}. New image is ready for re-scoring (length=${dataUrl.length}).`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${IMG_REVIEW_LOG_PREFIX} regenerate failed asset=${input.assetId}`, error);
        return `Regeneration failed for ${input.assetId}: ${message}`;
      }
    },
    {
      name: 'regenerate_asset',
      description:
        'Request a new version of a failing asset, prepending the style bible and the rubric feedback ' +
        'to the prompt. Use only while retries remain.',
      schema: z.object({
        assetId: z.string(),
        prompt: z.string().describe('the original subject prompt'),
        feedback: z.string().describe('what to fix, from the latest verdict'),
      }),
    },
  );

  const escalateTool = tool(
    async (input: { assetId: string; dataUrl: string; lastVerdict: RubricVerdict }) => {
      console.log(`${IMG_REVIEW_LOG_PREFIX} escalate asset=${input.assetId} to human`);
      try {
        const decision = await deps.reviewSurface.requestHumanReview({
          assetId: input.assetId,
          dataUrl: input.dataUrl,
          styleBible: deps.styleBible,
          lastVerdict: input.lastVerdict,
        });
        console.log(
          `${IMG_REVIEW_LOG_PREFIX} human decision asset=${input.assetId} approved=${decision.approved}`,
        );
        return JSON.stringify(decision);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${IMG_REVIEW_LOG_PREFIX} escalation failed asset=${input.assetId}`, error);
        return `Human review failed for ${input.assetId}: ${message}`;
      }
    },
    {
      name: 'escalate_to_human',
      description:
        'Escalate an asset to a human reviewer after the retry budget is exhausted. The human ' +
        'approves or rejects via the asset-review surface.',
      schema: z.object({
        assetId: z.string(),
        dataUrl: z.string().describe('data: URL of the latest asset image'),
        lastVerdict: RubricVerdictSchema,
      }),
    },
  );

  return createAgent({
    model: createTriageModel(),
    tools: [scoreTool, regenerateTool, escalateTool],
    systemPrompt: SYSTEM_PROMPT,
    // Human-in-the-loop: pause for human approval whenever the agent decides to escalate an asset.
    // NOTE: the options cast is forced by a langchain typing bug — its middleware option types
    // collapse to `never` under exactOptionalPropertyTypes + zod v4 (internal ZodV3ObjectLike
    // constraint). The runtime shape matches research/langchain-agents-chains-gemini.md.
    middleware: [
      humanInTheLoopMiddleware({
        interruptOn: {
          escalate_to_human: {
            allowedDecisions: ['approve', 'edit', 'reject'] as const,
            description: 'Asset failed automated review after the retry budget. Human decision required.',
          },
        },
      } as never) as never,
    ],
  });
}
