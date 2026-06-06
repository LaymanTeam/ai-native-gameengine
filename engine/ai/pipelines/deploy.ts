/**
 * Deploy pipeline (phase 5): verification-GATED ship chain.
 * Refuses without a green reports/verification.json, then wraps the game as a Vite 8
 * project and deploys via the Vercel REST API.
 */
import path from 'node:path';
import { createViteProject } from '../../compiler/vite-creator';
import { deployToVercel } from '../../compiler/vercel-deploy';
import type { EmitEvent } from '../events';
import { PIPELINES_LOG_PREFIX, VERIFICATION_FILENAME, readJsonIfExists } from './shared';
import type { VerificationReport } from './verify';

export interface DeployPipelineResult {
  ok: boolean;
  refused: string | null;
  url: string;
}

export interface DeployDeps {
  /** Vite wrap step. Injected in tests. */
  createProject?: typeof createViteProject;
  /** Vercel deploy step. Injected in tests. */
  deploy?: typeof deployToVercel;
}

/** Run the deploy chain for one game. The verification gate is code-enforced here. */
export async function runDeployPipeline(
  args: { game: string; gameRoot: string; emit: EmitEvent },
  deps: DeployDeps = {},
): Promise<DeployPipelineResult> {
  const createProject = deps.createProject ?? createViteProject;
  const deploy = deps.deploy ?? deployToVercel;
  const { game, gameRoot, emit } = args;

  const report = await readJsonIfExists<VerificationReport>(path.join(gameRoot, 'reports', VERIFICATION_FILENAME));
  if (!report?.ok) {
    const reason = report
      ? `verification gate is RED (verified ${report.verifiedAt}) — fix failures and re-run verify_game`
      : 'no verification report — run verify_game first';
    console.error(`${PIPELINES_LOG_PREFIX} deploy refused game=${game}: ${reason}`);
    return { ok: false, refused: reason, url: '' };
  }

  emit({ type: 'tool_start', name: 'vite-wrap', detail: game });
  await createProject({ gameDir: gameRoot, name: game });
  emit({ type: 'tool_end', name: 'vite-wrap', ok: true, detail: 'project written' });

  emit({ type: 'tool_start', name: 'vercel-deploy', detail: game });
  const deployed = await deploy({ gameDir: gameRoot, name: game });
  emit({ type: 'tool_end', name: 'vercel-deploy', ok: true, detail: deployed.httpsUrl });
  emit({
    type: 'artifact',
    kind: 'deploy',
    title: `${game} is live`,
    markdown: `Deployed (verified ${report.verifiedAt}):\n\n${deployed.httpsUrl}`,
  });
  console.log(`${PIPELINES_LOG_PREFIX} deployed game=${game} url=${deployed.httpsUrl}`);
  return { ok: true, refused: null, url: deployed.httpsUrl };
}
