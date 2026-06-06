/**
 * The director's tool layer — THIN Zod-schemaed wrappers over the phase pipelines
 * (engine/ai/pipelines/*). Architecture: agent → tools → (chains → subagents).
 *
 * The director converses with the user, compiles intent into ONE declarative phase-tool call
 * per turn, and the pipeline CHAIN deterministically sequences the inner steps — invoking the
 * coder/tester/debugger/image-reviewer/logic-evaluator/researcher subagents where judgment is
 * needed. The director never routes inside a phase (no "custom state machine by prompt").
 *
 * Tools are constructed per-request so they can emit SSE events without round-tripping
 * megabytes of base64 through the model context. Phase state lives ON DISK in the game folder
 * (gdd.json, style-bible.json, manifest, verification.json) — stateless across invocations.
 */
import { tool } from 'langchain';
import * as z from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generateImage } from './providers';
import { buildLocalGdd, gddSchema, renderGddMarkdown } from './agents/designer';
import type { GameDesignDocument } from './agents/designer';
import { StyleBibleSchema, styleBibleToPromptPreamble, type StyleBible } from '../tools/visualizers/visual-direction';
import type { EmitEvent, EngineEvent } from './events';
import { runDesignPipeline } from './pipelines/design';
import { AssetPlanSchema, runAssetsPipeline, type AssetPlan } from './pipelines/assets';
import { runBuildPipeline } from './pipelines/build';
import { runVerifyPipeline } from './pipelines/verify';
import { runDeployPipeline } from './pipelines/deploy';
import { STYLE_BIBLE_FILENAME, resolveGameRoot } from './pipelines/shared';

// Back-compat re-export: the route and frontend import these from here.
export type { EmitEvent, EngineEvent };

const TOOLS_LOG_PREFIX = '[engine/ai/tool-definitions]';

/**
 * Keyless design turn — runs the design phase without the Gemini director (no GOOGLE_API_KEY).
 * Builds a bounded GDD locally, persists it, emits it as an artifact, and returns a chat summary.
 */
export async function localDesignTurn(emit: EmitEvent, prompt: string): Promise<string> {
  emit({ type: 'tool_start', name: 'design_game', detail: 'designing (local)' });
  const gdd = buildLocalGdd(prompt);
  const { game } = await runDesignPipeline({ gdd, researchTopics: [], emit });
  emit({ type: 'artifact', kind: 'gdd', title: gdd.title, markdown: renderGddMarkdown(gdd) });
  emit({ type: 'tool_end', name: 'design_game', ok: true, detail: game });
  return (
    `I drafted a bounded design for “${gdd.title}” — a ${gdd.genre} with one core mechanic and ` +
    `${gdd.scenes.length} scene. Review the GDD above, then tell me what to change or say “go” to ` +
    `move to the asset phase. (Running keyless — set GOOGLE_API_KEY for the full Gemini director.)`
  );
}

/** Director toolset: exactly one tool per phase + one exploration helper. */
export function makeDirectorTools(emit: EmitEvent) {
  let exploreCounter = 0;

  const designTool = tool(
    async ({ gdd, researchTopics }: { gdd: GameDesignDocument; researchTopics: string[] }) => {
      console.log(`${TOOLS_LOG_PREFIX} design_game title=${gdd.title} topics=${researchTopics.length}`);
      emit({ type: 'tool_start', name: 'design_game', detail: gdd.title });
      try {
        const result = await runDesignPipeline({ gdd, researchTopics, emit });
        emit({ type: 'artifact', kind: 'gdd', title: gdd.title, markdown: renderGddMarkdown(gdd) });
        emit({ type: 'tool_end', name: 'design_game', ok: true, detail: result.game });
        return (
          `GDD saved; game slug is "${result.game}" (full info.md tree scaffolded). ` +
          `${result.researchNotes.length} research note(s) written. Use slug "${result.game}" in every ` +
          `later phase tool. Summarize the GDD and ask the user to approve before set_visual_direction.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} design_game failed`, error);
        emit({ type: 'tool_end', name: 'design_game', ok: false, detail: message.slice(0, 160) });
        return `Design phase failed: ${message}`;
      }
    },
    {
      name: 'design_game',
      description:
        'Phase 1 (design). Persist the bounded GDD (ONE core mechanic, 1-3 scenes, explicit win/lose ' +
        'and non-goals), scaffold the game tree, and optionally run the researcher subagent on up to ' +
        '3 topics. Call once concept and scope are agreed with the user.',
      schema: z.object({
        gdd: gddSchema,
        researchTopics: z
          .array(z.string().min(1))
          .max(3)
          .describe('0-3 topics for the researcher subagent (e.g. "match-3 scoring conventions"); [] to skip'),
      }),
    },
  );

  const styleTool = tool(
    async ({ game, styleBible }: { game: string; styleBible: StyleBible }) => {
      console.log(`${TOOLS_LOG_PREFIX} set_visual_direction game=${game} title=${styleBible.title}`);
      emit({ type: 'tool_start', name: 'set_visual_direction', detail: styleBible.title });
      try {
        const gameRoot = resolveGameRoot(game);
        const preamble = styleBibleToPromptPreamble(styleBible);
        await fs.mkdir(path.join(gameRoot, 'config'), { recursive: true });
        await fs.mkdir(path.join(gameRoot, 'reports'), { recursive: true });
        await fs.writeFile(path.join(gameRoot, 'config', STYLE_BIBLE_FILENAME), JSON.stringify(styleBible, null, 2), 'utf8');
        await fs.writeFile(path.join(gameRoot, 'reports', 'style.md'), `# Style Bible — ${styleBible.title}\n\n${preamble}\n`, 'utf8');
        emit({ type: 'artifact', kind: 'style', title: styleBible.title, markdown: preamble });
        emit({ type: 'tool_end', name: 'set_visual_direction', ok: true, detail: game });
        return `Style bible saved for ${game}; produce_assets will prepend it to every image prompt. Ask the user to approve the direction.`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} set_visual_direction failed`, error);
        emit({ type: 'tool_end', name: 'set_visual_direction', ok: false, detail: message.slice(0, 160) });
        return `Visual direction failed: ${message}`;
      }
    },
    {
      name: 'set_visual_direction',
      description:
        'Phase 2a (visual direction). Persist the style bible (config/style-bible.json + reports/style.md). ' +
        'REQUIRED before produce_assets — every production image prompt prepends it.',
      schema: z.object({ game: z.string().describe('game slug from design_game'), styleBible: StyleBibleSchema }),
    },
  );

  const exploreTool = tool(
    async ({ prompt }: { prompt: string }) => {
      const id = `explore-${++exploreCounter}`;
      console.log(`${TOOLS_LOG_PREFIX} explore_image ${id}`);
      emit({ type: 'tool_start', name: 'explore_image', detail: prompt.slice(0, 140) });
      try {
        const image = await generateImage(prompt, {});
        emit({ type: 'image', id, dataUrl: image.dataUrl, caption: image.text || prompt.slice(0, 140) });
        emit({ type: 'tool_end', name: 'explore_image', ok: true, detail: id });
        return `Concept image ${id} shown to the user (NOT saved — production assets go through produce_assets). Notes: ${image.text || '(none)'}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} explore_image failed`, error);
        emit({ type: 'tool_end', name: 'explore_image', ok: false, detail: message.slice(0, 160) });
        return `Exploration image failed: ${message}`;
      }
    },
    {
      name: 'explore_image',
      description:
        'Throwaway concept image for chat-time visual exploration (before/while agreeing the style). ' +
        'NOT saved to the game — production assets must go through produce_assets.',
      schema: z.object({ prompt: z.string().describe('full visual prompt incl. style, palette, composition') }),
    },
  );

  const assetsTool = tool(
    async ({ game, plan }: { game: string; plan: AssetPlan }) => {
      console.log(`${TOOLS_LOG_PREFIX} produce_assets game=${game} images=${plan.images.length}`);
      emit({ type: 'tool_start', name: 'produce_assets', detail: `${plan.images.length} images, ${plan.sfx.length + plan.music.length} audio, ${plan.fonts.length} fonts` });
      try {
        const result = await runAssetsPipeline({ game, gameRoot: resolveGameRoot(game), plan, emit });
        emit({ type: 'tool_end', name: 'produce_assets', ok: result.ok, detail: `${result.produced.length} images, ${result.audioSaved} audio, ${result.fontFaces} fonts` });
        const reviews = result.produced
          .map((p) => `${p.variable}: ${p.approved ? '✓' : '⚠'} ${p.note}`)
          .join('\n');
        return (
          `Asset phase ${result.ok ? 'complete' : 'finished with failures'}. ` +
          `Images (reviewed by the image-reviewer subagent):\n${reviews || '(none)'}\n` +
          `Audio: ${result.audioSaved} saved, ${result.audioRejected} license-rejected. Fonts: ${result.fontFaces} faces.\n` +
          (result.failures.length > 0 ? `Failures: ${result.failures.join('; ')}\n` : '') +
          `Everything saved is registered in the asset manifest. Unapproved assets are queued for human review — ` +
          `surface that to the user before build_game.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} produce_assets failed`, error);
        emit({ type: 'tool_end', name: 'produce_assets', ok: false, detail: message.slice(0, 160) });
        return `Asset phase failed: ${message}`;
      }
    },
    {
      name: 'produce_assets',
      description:
        'Phase 2b (assets). Run the asset chain over a declarative plan: generate each image with the ' +
        'style bible prepended, review it with the image-reviewer subagent (auto-regen, human-review ' +
        'queue), fetch license-cleared audio from OpenGameArt and fonts from Google Fonts, and register ' +
        'EVERYTHING in the asset manifest. Compile the full plan from the conversation in one call.',
      schema: z.object({ game: z.string(), plan: AssetPlanSchema }),
    },
  );

  const buildTool = tool(
    async ({ game, instructions }: { game: string; instructions: string }) => {
      console.log(`${TOOLS_LOG_PREFIX} build_game game=${game}`);
      emit({ type: 'tool_start', name: 'build_game', detail: game });
      try {
        const result = await runBuildPipeline({ game, gameRoot: resolveGameRoot(game), instructions, emit });
        emit({ type: 'tool_end', name: 'build_game', ok: result.ok, detail: result.refused ?? (result.ok ? 'green' : 'issues') });
        if (result.refused) return `REFUSED: ${result.refused}`;
        return (
          `Build phase ${result.ok ? 'PASSED' : 'FAILED'}. ` +
          `Manifest bidirectional: ${result.manifestOk ? 'ok' : result.manifestIssues}. ` +
          `Tests: ${result.testsPassed ? 'green' : `${result.testFailures} failing after ${result.fixCycles} debugger cycle(s)`}. ` +
          (result.ok ? 'Proceed to verify_game.' : 'Re-run build_game with instructions addressing the failures, or surface them to the user.') +
          `\n\nCoder summary: ${result.coderSummary}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} build_game failed`, error);
        emit({ type: 'tool_end', name: 'build_game', ok: false, detail: message.slice(0, 160) });
        return `Build phase failed: ${message}`;
      }
    },
    {
      name: 'build_game',
      description:
        'Phase 3 (build). Run the quality-loop chain: manifest pre-gate → coder subagent (writes ' +
        'systems/, ui/, main.ts, the headless playtest bridge; typecheck self-verify) → manifest ' +
        'post-gate → tester subagent authors+runs tests → debugger subagent fixes failures (bounded). ' +
        'All routing is automatic.',
      schema: z.object({
        game: z.string(),
        instructions: z.string().describe('extra direction for the coder; empty string if none'),
      }),
    },
  );

  const verifyTool = tool(
    async ({ game }: { game: string }) => {
      console.log(`${TOOLS_LOG_PREFIX} verify_game game=${game}`);
      emit({ type: 'tool_start', name: 'verify_game', detail: game });
      try {
        const report = await runVerifyPipeline({ game, gameRoot: resolveGameRoot(game), emit });
        emit({ type: 'tool_end', name: 'verify_game', ok: report.ok, detail: report.ok ? 'all gates green' : 'gates failed' });
        return report.ok
          ? `Verification PASSED — typecheck ✓, manifest ✓, tests ✓, logic ✓ (${report.logic.detail}), playtest ✓ (${report.playtest.detail}). deploy_game is unlocked.`
          : `Verification FAILED — typecheck:${report.typecheck.ok} manifest:${report.manifest.ok} tests:${report.tests.passed} ` +
            `logic:${report.logic.ok} (${report.logic.detail}) playtest:${report.playtest.ok} (${report.playtest.detail}). ` +
            `Fix via build_game, then re-run verify_game.`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} verify_game failed`, error);
        emit({ type: 'tool_end', name: 'verify_game', ok: false, detail: message.slice(0, 160) });
        return `Verification errored: ${message}`;
      }
    },
    {
      name: 'verify_game',
      description:
        'Phase 4 (verify). Run ALL deploy gates: typecheck, bidirectional manifest validation, game ' +
        'tests, the logic-evaluator subagent (rule coherence via truth tables), and the headless ' +
        'playtest. Writes reports/verification.json — deploy_game refuses without it green.',
      schema: z.object({ game: z.string() }),
    },
  );

  const deployTool = tool(
    async ({ game }: { game: string }) => {
      console.log(`${TOOLS_LOG_PREFIX} deploy_game game=${game}`);
      emit({ type: 'tool_start', name: 'deploy_game', detail: game });
      try {
        const result = await runDeployPipeline({ game, gameRoot: resolveGameRoot(game), emit });
        emit({ type: 'tool_end', name: 'deploy_game', ok: result.ok, detail: result.refused ?? result.url });
        if (result.refused) return `REFUSED: ${result.refused}`;
        return `Deployed ${game} to ${result.url}. Share the link with the user.`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${TOOLS_LOG_PREFIX} deploy_game failed`, error);
        emit({ type: 'tool_end', name: 'deploy_game', ok: false, detail: message.slice(0, 160) });
        return `Deploy failed: ${message}`;
      }
    },
    {
      name: 'deploy_game',
      description:
        'Phase 5 (deploy). Wrap as a Vite project and deploy to Vercel. GATED: refuses unless ' +
        'verify_game passed. Requires VERCEL_TOKEN.',
      schema: z.object({ game: z.string() }),
    },
  );

  return [designTool, styleTool, exploreTool, assetsTool, buildTool, verifyTool, deployTool];
}
