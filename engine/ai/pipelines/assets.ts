/**
 * Asset pipeline (phase 2b): a deterministic CHAIN over the director's declarative asset plan.
 *
 *   for each image → generate (style bible ALWAYS prepended) → IMAGE-REVIEWER subagent
 *     (rubric scoring, code-bounded regen retries, human escalation queue) → save + manifest
 *   for each audio query → OpenGameArt fetch (license-gated) → manifest
 *   for each font → Google Fonts fetch → manifest
 *
 * The reviewer regenerates THROUGH this pipeline's regenerator so the file on disk always
 * matches the last accepted image. Style bible is REQUIRED — the chain refuses without one
 * (CLAUDE.md contract: prepended to EVERY image prompt).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { generateImage } from '../providers';
import { createImageReviewerAgent, type RubricVerdict } from '../agents/image-reviewer';
import { styleBibleToPromptPreamble } from '../../tools/visualizers/visual-direction';
import { fetchSfx, type FetchLike } from '../../tools/fetchers/sfx';
import { fetchMusic } from '../../tools/fetchers/music';
import { fetchFont } from '../../tools/fetchers/fonts';
import type { EmitEvent } from '../events';
import {
  AssetEntrySchema,
  PIPELINES_LOG_PREFIX,
  appendManifestEntries,
  identifierFromFileName,
  loadStyleBible,
  resolveInside,
} from './shared';
export { AssetPlanSchema } from './asset-schema';
export type { AssetPlan } from './asset-schema';
import type { AssetPlan } from './asset-schema';

export interface ProducedAsset {
  variable: string;
  path: string;
  reviewed: boolean;
  approved: boolean;
  note: string;
}

export interface AssetsResult {
  ok: boolean;
  produced: ProducedAsset[];
  audioSaved: number;
  audioRejected: number;
  fontFaces: number;
  failures: string[];
}

/** Review outcome the (injectable) reviewer returns per image. */
export interface ReviewOutcome {
  approved: boolean;
  note: string;
}

export interface AssetsDeps {
  /** Image generation; default Gemini Nano Banana. */
  generate?: (prompt: string, opts: { pro?: boolean }) => Promise<{ dataUrl: string; text: string }>;
  /** Reviews one generated image; default wraps the image-reviewer subagent. Injected in tests. */
  review?: (args: {
    assetId: string;
    prompt: string;
    dataUrl: string;
    stylePreamble: string;
    regenerate: (feedback: string) => Promise<{ dataUrl: string }>;
    queueHumanReview: (verdict: RubricVerdict, dataUrl: string) => Promise<void>;
  }) => Promise<ReviewOutcome>;
  /** Injected fetch for the audio/font fetchers (offline tests). */
  fetchImpl?: FetchLike;
}

/** Default reviewer: the IMAGE-REVIEWER subagent sees the image multimodally and drives the loop. */
async function reviewWithAgent(args: {
  assetId: string;
  prompt: string;
  dataUrl: string;
  stylePreamble: string;
  regenerate: (feedback: string) => Promise<{ dataUrl: string }>;
  queueHumanReview: (verdict: RubricVerdict, dataUrl: string) => Promise<void>;
}): Promise<ReviewOutcome> {
  let lastVerdict: RubricVerdict | null = null;
  let latestDataUrl = args.dataUrl;
  const reviewer = createImageReviewerAgent({
    styleBible: args.stylePreamble,
    regenerator: {
      regenerate: async ({ feedback }) => {
        const out = await args.regenerate(feedback);
        latestDataUrl = out.dataUrl;
        return out;
      },
    },
    reviewSurface: {
      requestHumanReview: async ({ lastVerdict: verdict }) => {
        await args.queueHumanReview(verdict, latestDataUrl);
        // Queued for the asset-review surface; pipeline proceeds without blocking the turn.
        return { approved: false, note: 'queued for human review (asset-review surface)' };
      },
    },
    onVerdict: (v) => {
      lastVerdict = v;
    },
  });
  // Standard multimodal content block (base64) so the reviewer SEES the image.
  const [meta, base64] = args.dataUrl.split(',');
  const mimeType = meta?.match(/^data:([^;]+);/)?.[1] ?? 'image/png';
  const reviewMessage = new HumanMessage({
    content: [
      {
        type: 'text',
        text:
          `Review asset "${args.assetId}". Original subject prompt: ${args.prompt}\n` +
          'Score it against the style bible with score_asset (attempt 0).',
      },
      { type: 'image', source_type: 'base64', mime_type: mimeType, data: base64 ?? '' },
    ],
  });
  // `as never`: the reviewer factory's middleware cast erases createAgent's input generics
  // (documented LangChain typing gap in image-reviewer.ts); runtime shape is correct.
  await reviewer.invoke(
    { messages: [reviewMessage] } as never,
    { configurable: { thread_id: `image-reviewer-${args.assetId}` }, recursionLimit: 30 } as never,
  );
  if (!lastVerdict) return { approved: false, note: 'reviewer produced no verdict' };
  const verdict = lastVerdict as RubricVerdict;
  return {
    approved: verdict.passed,
    note: verdict.passed ? `passed (score ${verdict.weightedScore.toFixed(2)})` : verdict.feedback,
  };
}

/** Run the asset phase chain for one game. */
export async function runAssetsPipeline(
  args: { game: string; gameRoot: string; plan: AssetPlan; emit: EmitEvent },
  deps: AssetsDeps = {},
): Promise<AssetsResult> {
  const generate = deps.generate ?? generateImage;
  const review = deps.review ?? reviewWithAgent;
  const { game, gameRoot, plan, emit } = args;
  const failures: string[] = [];
  const produced: ProducedAsset[] = [];

  // Style-bible contract gate: production images NEVER generate without it.
  const bible = await loadStyleBible(gameRoot);
  if (!bible && plan.images.length > 0) {
    return {
      ok: false,
      produced: [],
      audioSaved: 0,
      audioRejected: 0,
      fontFaces: 0,
      failures: ['no style bible — run set_visual_direction before producing image assets'],
    };
  }
  const stylePreamble = bible ? styleBibleToPromptPreamble(bible) : '';

  /* ---- images: generate → review (subagent) → save → manifest ---- */
  for (const image of plan.images) {
    emit({ type: 'tool_start', name: 'generate_image', detail: image.variable });
    try {
      const fullPrompt = `${stylePreamble}\n\nSubject: ${image.prompt}`;
      let current = await generate(fullPrompt, { pro: image.category === 'scenes' });
      emit({ type: 'image', id: image.variable, dataUrl: current.dataUrl, caption: image.prompt.slice(0, 140) });

      const safeName = image.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const relPath = path.posix.join('assets', image.category, safeName);
      const abs = resolveInside(gameRoot, relPath);
      const save = async (dataUrl: string) => {
        const base64 = dataUrl.split(',')[1];
        if (!base64) throw new Error('image dataUrl had no base64 payload');
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, Buffer.from(base64, 'base64'));
      };
      await save(current.dataUrl);

      emit({ type: 'tool_start', name: 'review_asset', detail: image.variable });
      const outcome = await review({
        assetId: image.variable,
        prompt: image.prompt,
        dataUrl: current.dataUrl,
        stylePreamble,
        regenerate: async (feedback: string) => {
          current = await generate(`${stylePreamble}\n\nSubject: ${image.prompt}\nFix: ${feedback}`, {
            pro: image.category === 'scenes',
          });
          await save(current.dataUrl);
          emit({ type: 'image', id: image.variable, dataUrl: current.dataUrl, caption: `${image.variable} (regenerated)` });
          return { dataUrl: current.dataUrl };
        },
        queueHumanReview: async (verdict, dataUrl) => {
          const queueFile = resolveInside(gameRoot, 'reports/asset-review-queue.json');
          const queue = JSON.parse(await fs.readFile(queueFile, 'utf8').catch(() => '[]')) as unknown[];
          queue.push({ assetId: image.variable, path: relPath, verdict, queuedAt: new Date().toISOString() });
          await fs.writeFile(queueFile, JSON.stringify(queue, null, 2), 'utf8');
          emit({
            type: 'artifact',
            kind: 'review-escalation',
            title: `Needs your review: ${image.variable}`,
            markdown: `Asset \`${relPath}\` failed the rubric after retries.\n\n> ${verdict.feedback}\n\nLatest image length: ${dataUrl.length}`,
          });
        },
      });
      emit({ type: 'tool_end', name: 'review_asset', ok: outcome.approved, detail: outcome.note.slice(0, 120) });

      await appendManifestEntries(gameRoot, game, [
        AssetEntrySchema.parse({
          variable: image.variable,
          path: relPath,
          category: image.category,
          description: image.prompt.slice(0, 200),
        }),
      ]);
      produced.push({ variable: image.variable, path: relPath, reviewed: true, approved: outcome.approved, note: outcome.note });
      emit({ type: 'tool_end', name: 'generate_image', ok: true, detail: relPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${PIPELINES_LOG_PREFIX} image asset failed variable=${image.variable}`, error);
      failures.push(`${image.variable}: ${message}`);
      emit({ type: 'tool_end', name: 'generate_image', ok: false, detail: message.slice(0, 160) });
    }
  }

  /* ---- audio: license-gated OpenGameArt fetch → manifest ---- */
  let audioSaved = 0;
  let audioRejected = 0;
  const audioJobs: Array<{ kind: 'sfx' | 'music'; query: string }> = [
    ...plan.sfx.map((query) => ({ kind: 'sfx' as const, query })),
    ...plan.music.map((query) => ({ kind: 'music' as const, query })),
  ];
  for (const job of audioJobs) {
    emit({ type: 'tool_start', name: 'fetch_audio', detail: `${job.kind}: ${job.query}` });
    try {
      const destDir = path.join(gameRoot, 'assets', job.kind);
      const fetchOpts = { limit: 5, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) };
      const result =
        job.kind === 'sfx' ? await fetchSfx(job.query, destDir, fetchOpts) : await fetchMusic(job.query, destDir, fetchOpts);
      const entries = result.saved.map((record) =>
        AssetEntrySchema.parse({
          variable: identifierFromFileName(record.file, job.kind),
          path: path.posix.join('assets', job.kind, record.file),
          category: job.kind,
          description: record.title,
          license: record.license,
        }),
      );
      if (entries.length > 0) await appendManifestEntries(gameRoot, game, entries);
      audioSaved += entries.length;
      audioRejected += result.rejected.length;
      emit({ type: 'tool_end', name: 'fetch_audio', ok: true, detail: `${entries.length} saved` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${PIPELINES_LOG_PREFIX} audio fetch failed ${job.kind}:${job.query}`, error);
      failures.push(`${job.kind} "${job.query}": ${message}`);
      emit({ type: 'tool_end', name: 'fetch_audio', ok: false, detail: message.slice(0, 160) });
    }
  }

  /* ---- fonts: Google Fonts → manifest ---- */
  let fontFaces = 0;
  for (const font of plan.fonts) {
    emit({ type: 'tool_start', name: 'fetch_font', detail: font.family });
    try {
      const fetchOpts = { weights: font.weights, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) };
      const result = await fetchFont(font.family, path.join(gameRoot, 'assets', 'fonts'), fetchOpts);
      const entries = result.saved.map((record) =>
        AssetEntrySchema.parse({
          variable: identifierFromFileName(record.file, 'font'),
          path: path.posix.join('assets', 'fonts', record.file),
          category: 'fonts',
          description: `${font.family} (${record.style} ${record.weight})`.trim(),
          license: record.license,
        }),
      );
      if (entries.length > 0) await appendManifestEntries(gameRoot, game, entries);
      fontFaces += entries.length;
      emit({ type: 'tool_end', name: 'fetch_font', ok: true, detail: `${entries.length} faces` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${PIPELINES_LOG_PREFIX} font fetch failed ${font.family}`, error);
      failures.push(`font "${font.family}": ${message}`);
      emit({ type: 'tool_end', name: 'fetch_font', ok: false, detail: message.slice(0, 160) });
    }
  }

  return { ok: failures.length === 0, produced, audioSaved, audioRejected, fontFaces, failures };
}
