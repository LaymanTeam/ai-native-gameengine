'use client';

/**
 * Forge pipeline transport — bridges the UI to the working "Prompt Roguelite Forge"
 * generate→save→playable pipeline via the app's proxy routes (app/api/forge/*).
 *
 * This is the seam for the playable build flow, mirroring chat.ts: the UI calls
 * createPlayableBuild() and never touches fetch/slug/artifact details. When the pipeline moves
 * fully in-app (its own generate route + PixiJS runtime), swap the bodies here only.
 */

export interface ForgeSpec {
  title: string;
  theme: string;
  template?: 'roguelite' | 'flight-shooter';
  arena?: { name: string };
  player?: { name: string };
  weapons?: Array<{ id: string; name: string }>;
  enemies?: Array<{ id: string; name: string }>;
}

export interface ForgeGeneration {
  source: string;
  model?: string;
  message?: string;
  spec: ForgeSpec;
}

export interface ForgeBuild {
  generation: ForgeGeneration;
  playerUrl: string;
  slug: string;
  mode?: string;
}

export type ForgeStep = 'spec' | 'save' | 'ready';

const DEFAULT_INSTRUCTION =
  'Generate a complete playable vertical slice using the existing bounded template system. ' +
  'Prioritize demo clarity, readable controls, and a shareable player URL.';

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'game'
  );
}

export async function generateSpec(prompt: string, instruction = DEFAULT_INSTRUCTION): Promise<ForgeGeneration> {
  const res = await fetch('/api/forge/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, instruction }),
  });
  if (!res.ok) throw new Error(`Generation failed with ${res.status}`);
  return (await res.json()) as ForgeGeneration;
}

export async function saveBuild(prompt: string, generation: ForgeGeneration): Promise<{ playerUrl: string; slug: string; mode?: string }> {
  const slug = slugify(`${generation.spec.title}-${Date.now().toString(36)}`);
  const artifact = {
    schemaVersion: 1,
    slug,
    prompt,
    source: generation.source,
    model: generation.model,
    createdAt: new Date().toISOString(),
    playerPath: `/?play=1&game=${encodeURIComponent(slug)}`,
    spec: generation.spec,
  };
  const res = await fetch('/api/forge/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(artifact),
  });
  if (!res.ok) throw new Error(`Storage failed with ${res.status}`);
  const saved = (await res.json()) as { playerUrl?: string; mode?: string };
  if (!saved.playerUrl) throw new Error('Saved game did not return a player URL.');
  return { playerUrl: saved.playerUrl, slug, ...(saved.mode ? { mode: saved.mode } : {}) };
}

/** Full pipeline with per-step progress for the build trace. */
export async function createPlayableBuild(
  prompt: string,
  onStep?: (step: ForgeStep) => void,
): Promise<ForgeBuild> {
  onStep?.('spec');
  const generation = await generateSpec(prompt);
  onStep?.('save');
  const saved = await saveBuild(prompt, generation);
  onStep?.('ready');
  return { generation, playerUrl: saved.playerUrl, slug: saved.slug, ...(saved.mode ? { mode: saved.mode } : {}) };
}
