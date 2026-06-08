'use client';

/**
 * Forge (Path A runtime preview) — describe a game, get a real playable game generated from a
 * GameDefinition and played in-app. Keyless: uses the local generator. This is the runtime SDK
 * driven by the GameDefinition; the agent pipeline will produce richer definitions.
 */
import { useEffect, useState } from 'react';
import { Anchor, Box, Button, Group, Paper, Stack, Switch, Text, Textarea, ThemeIcon } from '@mantine/core';
import { buildLocalGameDefinition } from '@/engine/runtime/local-generator';
import { attachLocalAssetSources } from '@/engine/runtime/local-asset-sources';
import { buildAssetPlanFromGameDefinition } from '@/engine/runtime/asset-plan';
import { FIRST_GAME_VERTICAL_SLICE } from '@/engine/runtime/first-game';
import type { GameDefinition } from '@/engine/runtime/game-definition';
import { PhaserGame } from '@/engine/frontend/components/PhaserGame';
import type { EngineEvent } from '@/engine/frontend/integration/contracts';

const SAMPLES = [
  FIRST_GAME_VERTICAL_SLICE.prompt,
  'a chaotic haunted bakery roguelite',
  'a neon space arena shooter with drone swarms',
  'a cozy coastal survivor gathering light',
  'a fast airplane shooter with storm clouds, enemy fighters, and a zeppelin boss',
  'a castle platformer jump quest with ledge monsters and a clockwork boss',
  'a crystal temple puzzle where an archivist pushes mirrors onto switches and opens a moon gate',
  'a boardroom decision app for a product launch with stakeholders evidence options recommendation and audit trail',
  'an agent operations dashboard for shipping a Vercel game app with queues approvals logs and deployment health',
  'a neon reactor core defense run',
  'a neon uplink repair node network run',
];
interface AssetProductionSummary {
  ok: boolean;
  batchId?: string | null;
  batchManifestUrl?: string | null;
  requestedImages: number;
  approvedImages: number;
  failures?: string[];
  reviewItems?: {
    variable: string;
    note: string;
    reviewUrl: string;
  }[];
}

interface GeneratedDefinitionResponse {
  source?: 'local' | 'model';
  definition?: GameDefinition;
  assetPlan?: { images?: unknown[] };
  assetProduction?: AssetProductionSummary;
  error?: string;
}

interface AcceptReviewResponse {
  ok: boolean;
  batchId: string;
  variable: string;
  runtimeRef: string;
  batchManifestUrl: string;
  approvedImages: number;
  requestedImages: number;
  failures: string[];
  reviewItems: NonNullable<AssetProductionSummary['reviewItems']>;
  error?: string;
}

interface RetryReviewResponse {
  ok: boolean;
  batchId: string;
  variable: string;
  runtimeRef: string | null;
  batchManifestUrl: string;
  approvedImages: number;
  requestedImages: number;
  failures: string[];
  reviewItems: NonNullable<AssetProductionSummary['reviewItems']>;
  error?: string;
}

interface CleanupBatchesResponse {
  ok: boolean;
  totalBatches: number;
  keptBatches: number;
  prunedBatches: { batchId: string }[];
  skippedBatches: string[];
  error?: string;
}

interface ReviewedArtCapability {
  reviewedAssetsAvailable: boolean;
  defaultReviewedAssets: boolean;
}

interface PublishForgeResponse {
  ok: boolean;
  slug: string;
  gameDir: string;
  runtimeFilesCopied: number;
  runtimeAssetsCopied: number;
  deploymentRequested: boolean;
  deployment?: {
    httpsUrl: string;
  };
  deploymentSkippedReason?: string;
  error?: string;
}

interface ForgeProgressStep {
  id: string;
  name: string;
  detail: string;
  status: 'running' | 'done' | 'failed';
}

interface ForgeProgressImage {
  id: string;
  dataUrl: string;
  caption: string;
}

interface Build {
  key: number;
  def: GameDefinition;
  source: 'local' | 'model' | 'client-fallback';
  assetPlanImages: number;
  assetProduction?: AssetProductionSummary;
}

interface StreamForgeDefinitionOptions {
  prompt: string;
  forceLocal: boolean;
  produceAssets: boolean;
  onEvent: (event: EngineEvent) => void;
}

interface DemoForgeTestApi {
  getState(): { scene?: string; enemiesAlive?: number; bossHealth?: number | null };
  press(action: 'start' | 'restart', ms?: number): void;
  stageVisualEvidence(): void;
  stagePublicDemo(): void;
  triggerBossTelegraph(): void;
  chooseUpgrade(index: number): void;
}

function enemySummary(def: GameDefinition) {
  return `${def.enemies.length}${def.boss ? ' + boss' : ''}`;
}

function objectiveSummary(def: GameDefinition) {
  if (def.winCondition === 'survive') return `survive ${def.arena.durationSeconds}s`;
  if (def.winCondition === 'score-target') return `score ${def.scoreTarget ?? 'target'}`;
  if (def.winCondition === 'collect-relics') return `collect ${def.relicTarget ?? 'relics'} relics`;
  if (def.winCondition === 'capture-zone') return `hold zone ${def.captureTargetSeconds ?? 'target'}s`;
  if (def.winCondition === 'escort') return `escort ${def.escortTargetDistance ?? 'target'}px`;
  if (def.winCondition === 'defend-core') return `defend core ${def.defendTargetSeconds ?? 'target'}s`;
  if (def.winCondition === 'repair-nodes') return `repair ${def.repairNodeCount ?? 'nodes'} nodes`;
  if (def.winCondition === 'extract') return `extract ${def.extractHoldSeconds ?? 'target'}s`;
  if (def.winCondition === 'rescue') return `rescue ${def.rescueHoldSeconds ?? 'target'}s + extract ${def.rescueExtractSeconds ?? 'target'}s`;
  if (def.winCondition === 'unlock-gate') return `unlock ${def.unlockKeyTarget ?? 'keys'} keys + exit ${def.unlockHoldSeconds ?? 'target'}s`;
  if (def.winCondition === 'solve-puzzle') return `solve puzzle in ${def.puzzleRoom?.moveLimit ?? 'target'} moves`;
  if (def.winCondition === 'approve-deploy') return `approve ${def.agentDashboard?.approvals.length ?? 'release'} gates`;
  if (def.winCondition === 'select-decision') return `choose recommendation from ${def.decisionRoom?.options.length ?? 'decision'} options`;
  if (def.winCondition === 'clear-waves') return 'clear waves';
  return 'defeat boss';
}

function isLocalForgeMode(search: string) {
  const params = new URLSearchParams(search);
  const modelMode = params.has('gemini') || params.has('model') || params.get('source') === 'model';
  return params.has('selftest') || params.has('local') || !modelMode;
}

function shouldStageForgeDemo(search: string) {
  const params = new URLSearchParams(search);
  return params.has('play') && !params.has('selftest') && !params.has('nostage');
}

async function streamForgeDefinition({
  prompt,
  forceLocal,
  produceAssets,
  onEvent,
}: StreamForgeDefinitionOptions): Promise<void> {
  const response = await fetch('/api/forge/definition/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, forceLocal, produceAssets }),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Definition stream failed with ${response.status}: ${detail.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as EngineEvent);
    }
  }
}

export default function ForgePage() {
  const [prompt, setPrompt] = useState(SAMPLES[0] ?? '');
  const [build, setBuild] = useState<Build | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [produceReviewedAssets, setProduceReviewedAssets] = useState(false);
  const [reviewedArtAvailable, setReviewedArtAvailable] = useState<boolean | null>(null);
  const [acceptingReview, setAcceptingReview] = useState<string | null>(null);
  const [retryingReview, setRetryingReview] = useState<string | null>(null);
  const [cleaningBatches, setCleaningBatches] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [publishingGame, setPublishingGame] = useState<'export' | 'deploy' | null>(null);
  const [publishResult, setPublishResult] = useState<PublishForgeResponse | null>(null);
  const [progressSteps, setProgressSteps] = useState<ForgeProgressStep[]>([]);
  const [progressImages, setProgressImages] = useState<ForgeProgressImage[]>([]);
  const [urlMode, setUrlMode] = useState({ localMode: true, publicDemoMode: false });
  const localMode = urlMode.localMode;
  const publicDemoMode = urlMode.publicDemoMode;

  useEffect(() => {
    const search = window.location.search;
    setUrlMode({
      localMode: isLocalForgeMode(search),
      publicDemoMode: shouldStageForgeDemo(search),
    });
  }, []);

  useEffect(() => {
    if (localMode) {
      setReviewedArtAvailable(false);
      setProduceReviewedAssets(false);
      return;
    }
    let alive = true;
    void fetch('/api/forge/assets/capability')
      .then(async (response) => {
        if (!response.ok) throw new Error(`capability failed with ${response.status}`);
        return (await response.json()) as ReviewedArtCapability;
      })
      .then((capability) => {
        if (!alive) return;
        setReviewedArtAvailable(capability.reviewedAssetsAvailable);
        setProduceReviewedAssets(capability.defaultReviewedAssets);
      })
      .catch(() => {
        if (!alive) return;
        setReviewedArtAvailable(false);
        setProduceReviewedAssets(false);
      });
    return () => {
      alive = false;
    };
  }, [localMode]);

  function installGeneratedBuild(payload: GeneratedDefinitionResponse) {
    if (!payload.definition) throw new Error(payload.error || 'Definition generation returned no GameDefinition.');
    const nextBuild: Build = {
      key: Date.now(),
      def: payload.definition,
      source: payload.source ?? 'model',
      assetPlanImages: payload.assetPlan?.images?.length ?? buildAssetPlanFromGameDefinition(payload.definition).images.length,
    };
    if (payload.assetProduction) nextBuild.assetProduction = payload.assetProduction;
    setBuild(nextBuild);
    setPublishResult(null);
    if (payload.assetProduction && !payload.assetProduction.ok) {
      const reviewCount = payload.assetProduction.reviewItems?.length ?? 0;
      setError(
        reviewCount > 0
          ? `Reviewed art incomplete: ${reviewCount} image${reviewCount === 1 ? '' : 's'} need review.`
          : `Reviewed art incomplete: ${payload.assetProduction.failures?.[0] ?? 'some assets were not approved.'}`,
      );
    }
  }

  function buildClientLocalPayload(text: string): GeneratedDefinitionResponse {
    const definition = attachLocalAssetSources(buildLocalGameDefinition(text));
    return {
      source: 'local',
      definition,
      assetPlan: {
        images: buildAssetPlanFromGameDefinition(definition).images,
      },
    };
  }

  function applyProgressEvent(event: EngineEvent) {
    switch (event.type) {
      case 'tool_start':
        setProgressSteps((steps) => [
          ...steps.slice(-7),
          {
            id: `${event.name}-${Date.now()}-${steps.length}`,
            name: event.name.replace(/_/g, ' '),
            detail: event.detail,
            status: 'running',
          },
        ]);
        break;
      case 'tool_end':
        setProgressSteps((steps) => {
          const index = [...steps].reverse().findIndex((step) => step.name === event.name.replace(/_/g, ' ') && step.status === 'running');
          if (index === -1) {
            return [
              ...steps.slice(-7),
              {
                id: `${event.name}-${Date.now()}-${steps.length}`,
                name: event.name.replace(/_/g, ' '),
                detail: event.detail,
                status: event.ok ? 'done' : 'failed',
              },
            ];
          }
          const realIndex = steps.length - 1 - index;
          return steps.map((step, stepIndex) =>
            stepIndex === realIndex ? { ...step, detail: event.detail, status: event.ok ? 'done' : 'failed' } : step,
          );
        });
        break;
      case 'image':
        setProgressImages((images) => [
          { id: `${event.id}-${Date.now()}`, dataUrl: event.dataUrl, caption: event.caption },
          ...images,
        ].slice(0, 4));
        break;
      case 'error':
        setError(event.message);
        break;
      default:
        break;
    }
  }

  async function create(promptOverride?: string) {
    const text = (promptOverride ?? prompt).trim() || SAMPLES[0]!;
    const forceLocal = typeof window === 'undefined' ? localMode : isLocalForgeMode(window.location.search);
    setCreating(true);
    setError(null);
    setCleanupMessage(null);
    setPublishResult(null);
    setProgressSteps([]);
    setProgressImages([]);
    try {
      const produceAssets = produceReviewedAssets && !forceLocal && reviewedArtAvailable === true;
      if (forceLocal) {
        installGeneratedBuild(buildClientLocalPayload(text));
        return;
      }
      if (produceAssets) {
        let streamedPayload: GeneratedDefinitionResponse | null = null;
        await streamForgeDefinition({
          prompt: text,
          forceLocal,
          produceAssets,
          onEvent: (event) => {
            applyProgressEvent(event);
            if (event.type === 'artifact' && event.kind === 'forge-definition-result') {
              streamedPayload = JSON.parse(event.markdown) as GeneratedDefinitionResponse;
            }
          },
        });
        if (!streamedPayload) throw new Error('Definition stream ended without a generated game.');
        installGeneratedBuild(streamedPayload);
      } else {
        const response = await fetch('/api/forge/definition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, forceLocal, produceAssets }),
        });
        const payload = (await response.json()) as GeneratedDefinitionResponse;
        if (!response.ok || !payload.definition) throw new Error(payload.error || `Definition generation failed with ${response.status}`);
        installGeneratedBuild(payload);
      }
    } catch (err) {
      const def = attachLocalAssetSources(buildLocalGameDefinition(text));
      setBuild({ key: Date.now(), def, source: 'client-fallback', assetPlanImages: buildAssetPlanFromGameDefinition(def).images.length });
      setError(err instanceof Error ? err.message : 'Definition generation failed; used local fallback.');
    } finally {
      setCreating(false);
    }
  }

  function applyReviewAction(payload: Pick<RetryReviewResponse, 'ok' | 'variable' | 'runtimeRef' | 'batchManifestUrl' | 'approvedImages' | 'requestedImages' | 'failures' | 'reviewItems'>) {
    setPublishResult(null);
    setBuild((current) => {
      if (!current) return current;
      const plan = buildAssetPlanFromGameDefinition(current.def);
      const assetIndex = plan.images.findIndex((entry) => entry.variable === payload.variable);
      const runtimeRef = payload.runtimeRef;
      const nextAssets =
        assetIndex >= 0 && runtimeRef
          ? current.def.assets.map((asset, index) =>
              index === assetIndex ? { ...asset, src: runtimeRef } : asset,
            )
          : current.def.assets;
      const nextBuild: Build = {
        ...current,
        key: Date.now(),
        def: { ...current.def, assets: nextAssets },
      };
      if (current.assetProduction) {
        nextBuild.assetProduction = {
          ...current.assetProduction,
          ok: payload.ok,
          batchManifestUrl: payload.batchManifestUrl,
          approvedImages: payload.approvedImages,
          requestedImages: payload.requestedImages,
          failures: payload.failures,
          reviewItems: payload.reviewItems,
        };
      }
      return nextBuild;
    });

    if (!payload.ok && payload.reviewItems.length > 0) {
      setError(`Reviewed art incomplete: ${payload.reviewItems.length} image${payload.reviewItems.length === 1 ? '' : 's'} need review.`);
    }
  }

  async function acceptReviewItem(variable: string) {
    const batchId = build?.assetProduction?.batchId;
    if (!batchId) return;
    setAcceptingReview(variable);
    setError(null);
    try {
      const response = await fetch('/api/forge/assets/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, variable }),
      });
      const payload = (await response.json()) as AcceptReviewResponse;
      if (!response.ok) throw new Error(payload.error || `Review accept failed with ${response.status}`);
      applyReviewAction(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review asset accept failed.');
    } finally {
      setAcceptingReview(null);
    }
  }

  async function retryReviewItem(item: NonNullable<AssetProductionSummary['reviewItems']>[number]) {
    const batchId = build?.assetProduction?.batchId;
    if (!batchId) return;
    setRetryingReview(item.variable);
    setError(null);
    try {
      const response = await fetch('/api/forge/assets/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, variable: item.variable, feedback: item.note }),
      });
      const payload = (await response.json()) as RetryReviewResponse;
      if (!response.ok) throw new Error(payload.error || `Review retry failed with ${response.status}`);
      applyReviewAction(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review asset retry failed.');
    } finally {
      setRetryingReview(null);
    }
  }

  async function publishStandalone(deploy = false) {
    if (!build) return;
    setPublishingGame(deploy ? 'deploy' : 'export');
    setError(null);
    try {
      const response = await fetch('/api/forge/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, definition: build.def, deploy }),
      });
      const payload = (await response.json()) as PublishForgeResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || `Forge export failed with ${response.status}`);
      setPublishResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forge export failed.');
    } finally {
      setPublishingGame(null);
    }
  }

  async function cleanupOldBatches() {
    setCleaningBatches(true);
    setError(null);
    try {
      const response = await fetch('/api/forge/assets/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as CleanupBatchesResponse;
      if (!response.ok) throw new Error(payload.error || `Reviewed-art cleanup failed with ${response.status}`);
      const skipped = payload.skippedBatches.length > 0 ? `, ${payload.skippedBatches.length} skipped` : '';
      setCleanupMessage(
        `Cleaned ${payload.prunedBatches.length} old batch${payload.prunedBatches.length === 1 ? '' : 'es'}; kept ${payload.keptBatches}/${payload.totalBatches}${skipped}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reviewed-art cleanup failed.');
    } finally {
      setCleaningBatches(false);
    }
  }

  // auto-start for demos/screenshots: /forge?play
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('play')) return undefined;
      const promptParam = params.get('prompt') ?? undefined;
      if (promptParam) setPrompt(promptParam);
      const id = window.setTimeout(() => { void create(promptParam); }, 300);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!build || typeof window === 'undefined' || !shouldStageForgeDemo(window.location.search)) {
      return undefined;
    }

    let cancelled = false;
    const windowWithTestApi = window as Window & { __GAME_TEST__?: DemoForgeTestApi };
    const timers: number[] = [];
    const schedule = (callback: () => void, ms: number) => {
      const id = window.setTimeout(callback, ms);
      timers.push(id);
    };

    const stageWhenReady = (attempt = 0) => {
      if (cancelled) return;
      const api = windowWithTestApi.__GAME_TEST__;
      if (!api) {
        if (attempt < 40) schedule(() => stageWhenReady(attempt + 1), 120);
        return;
      }

      const state = api.getState();
      if (state.scene !== 'play') api.press('start');
      schedule(() => {
        if (cancelled) return;
        api.stagePublicDemo?.();
      }, 450);
      [1500, 2400, 3600].forEach((ms) => {
        schedule(() => {
          if (cancelled) return;
          api.chooseUpgrade(0);
        }, ms);
      });
    };

    schedule(() => stageWhenReady(), 240);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [build]);

  function buildFirstGameSlice() {
    setPrompt(FIRST_GAME_VERTICAL_SLICE.prompt);
    void create(FIRST_GAME_VERTICAL_SLICE.prompt);
  }

  return (
    <Box className={`forge-runtime-page${publicDemoMode ? ' forge-runtime-page-demo' : ''}`}>
      <Stack gap={publicDemoMode ? 'sm' : 'lg'} className="forge-runtime-sidebar">
        {publicDemoMode ? (
          <>
            <Paper withBorder radius="md" p="md" className="forge-demo-brief">
              <Text size="xs" tt="uppercase" fw={700} c="sage" lts="0.08em">Playable build</Text>
              <Text fw={650} fz="lg" mt={4}>Bakery portal raid</Text>
              <Text size="sm" c="dimmed" mt={4}>
                A compact top-down arcade raid.
              </Text>
            </Paper>

            <Paper withBorder radius="md" p="sm" bg="var(--forge-bone-2)">
              <Text size="xs" fw={700} tt="uppercase" c="sage" lts="0.08em">Play</Text>
              <Text size="xs" c="dimmed" mt={4}>WASD / arrows move</Text>
              <Text size="xs" c="dimmed">Space / J attack</Text>
              <Text size="xs" c="dimmed">Shift / K dash</Text>
            </Paper>
          </>
        ) : (
          <>
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size={28} radius="xl" color="sage" variant="filled">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2l2.2 6.6H21l-5.4 4 2 6.6L12 15l-5.6 4.2 2-6.6L3 8.6h6.8z" /></svg>
              </ThemeIcon>
              <Box>
                <Text fw={500}>Forge builder</Text>
                <Text size="sm" c="dimmed">Generate a GameDefinition for the richer runtime.</Text>
              </Box>
            </Group>

            <Paper withBorder radius="md" p="md" className="forge-golden-slice">
              <Group justify="space-between" gap="sm" align="center">
                <Box miw={0}>
                  <Text size="xs" tt="uppercase" fw={700} c="sage" lts="0.08em">First game</Text>
                  <Text fw={600}>{FIRST_GAME_VERTICAL_SLICE.label}</Text>
                  <Text size="xs" c="dimmed">Boss-backed bakery arena slice</Text>
                </Box>
                <Button
                  color="dark"
                  radius="md"
                  size="xs"
                  loading={creating && prompt === FIRST_GAME_VERTICAL_SLICE.prompt}
                  onClick={buildFirstGameSlice}
                >
                  Build
                </Button>
              </Group>
            </Paper>

            <Paper withBorder radius="md" p="sm" bg="var(--forge-bone-2)">
              <Text size="xs" fw={700} tt="uppercase" c="sage" lts="0.08em">Generated output</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Create a playable GameDefinition, then export or deploy it.
              </Text>
            </Paper>

            <Paper withBorder radius="lg" p="sm" bg="var(--forge-bone-2)">
              <Textarea value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} autosize minRows={3} maxRows={8} variant="unstyled" placeholder="Describe the game…" />
              <Group justify="space-between" mt="xs" gap="sm">
                <Switch
                  size="sm"
                  label="Reviewed art"
                  checked={produceReviewedAssets && !localMode && reviewedArtAvailable === true}
                  disabled={creating || localMode || reviewedArtAvailable !== true}
                  onChange={(event) => setProduceReviewedAssets(event.currentTarget.checked)}
                />
                <Button color="dark" radius="md" loading={creating} onClick={() => { void create(); }}>Generate &amp; play</Button>
              </Group>
            </Paper>

            <Group gap="xs" className="forge-sample-pills">
              {SAMPLES.map((s) => (
                <Button key={s} variant="default" size="xs" radius="xl" onClick={() => setPrompt(s)}>{s.split(' ').slice(0, 4).join(' ')}…</Button>
              ))}
            </Group>
          </>
        )}

        {(progressSteps.length > 0 || progressImages.length > 0) && (
          <Stack gap={8} className="forge-progress-trace">
            {progressSteps.map((step) => (
              <Group key={step.id} gap="xs" wrap="nowrap" align="flex-start" className="forge-progress-row">
                <Box className={`forge-progress-dot forge-progress-dot-${step.status}`} />
                <Box miw={0}>
                  <Text size="xs" fw={600} className="forge-progress-name">{step.name}</Text>
                  <Text size="xs" c="dimmed" truncate="end">{step.detail}</Text>
                </Box>
              </Group>
            ))}
            {progressImages.length > 0 && (
              <Group gap={6} wrap="nowrap" className="forge-progress-images">
                {progressImages.map((image) => (
                  <Box key={image.id} className="forge-progress-thumb">
                    <img src={image.dataUrl} alt={image.caption} />
                  </Box>
                ))}
              </Group>
            )}
          </Stack>
        )}

        {build && !publicDemoMode && (
          <Paper withBorder radius="md" p="md">
            <Text fw={500} mb={6}>{build.def.title}</Text>
            <Stack gap={4}>
              <Group justify="space-between" className="forge-runtime-summary-row"><Text size="sm" c="dimmed">Enemies</Text><Text size="sm">{enemySummary(build.def)}</Text></Group>
              <Group justify="space-between" className="forge-runtime-summary-row"><Text size="sm" c="dimmed">Waves</Text><Text size="sm">{build.def.waves.length}</Text></Group>
              <Group justify="space-between" className="forge-runtime-summary-row"><Text size="sm" c="dimmed">Win</Text><Text size="sm">{objectiveSummary(build.def)}</Text></Group>
              <Group justify="space-between" className="forge-runtime-summary-row"><Text size="sm" c="dimmed">Template</Text><Text size="sm">{build.def.runtimeTemplate}</Text></Group>
              <Group justify="space-between" className="forge-runtime-summary-row"><Text size="sm" c="dimmed">Feel</Text><Text size="sm">{build.def.feelProfile}</Text></Group>
              <Group justify="space-between" className="forge-runtime-summary-row"><Text size="sm" c="dimmed">Assets</Text><Text size="sm">{build.assetPlanImages} planned</Text></Group>
              <Group justify="space-between" className="forge-runtime-summary-row">
                <Text size="sm" c="dimmed">Art</Text>
                <Text size="sm">
                  {build.assetProduction
                    ? `${build.assetProduction.approvedImages}/${build.assetProduction.requestedImages} reviewed`
                    : 'source-backed'}
                </Text>
              </Group>
              {build.assetProduction?.batchId && (
                <Group justify="space-between" className="forge-runtime-summary-row">
                  <Text size="sm" c="dimmed">Batch</Text>
                  <Text size="sm" className="forge-runtime-summary-value">{build.assetProduction.batchId}</Text>
                </Group>
              )}
              {build.assetProduction?.batchManifestUrl && (
                <Group justify="space-between" className="forge-runtime-summary-row">
                  <Text size="sm" c="dimmed">Manifest</Text>
                  <Anchor size="sm" href={build.assetProduction.batchManifestUrl} target="_blank" rel="noreferrer">Open</Anchor>
                </Group>
              )}
              {build.assetProduction && (
                <Group justify="space-between" className="forge-runtime-summary-row">
                  <Text size="sm" c="dimmed">Retention</Text>
                  <Button
                    size="compact-xs"
                    variant="default"
                    loading={cleaningBatches}
                    onClick={() => { void cleanupOldBatches(); }}
                  >
                    Clean old
                  </Button>
                </Group>
              )}
              {cleanupMessage && <Text size="xs" c="dimmed">{cleanupMessage}</Text>}
              <Group justify="space-between" className="forge-runtime-summary-row"><Text size="sm" c="dimmed">Source</Text><Text size="sm">{build.source}</Text></Group>
              <Group justify="space-between" className="forge-runtime-summary-row">
                <Text size="sm" c="dimmed">Standalone</Text>
                <Group gap={6} wrap="nowrap">
                  <Button
                    size="compact-xs"
                    variant="default"
                    loading={publishingGame === 'export'}
                    disabled={publishingGame === 'deploy'}
                    onClick={() => { void publishStandalone(false); }}
                  >
                    Export
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="light"
                    loading={publishingGame === 'deploy'}
                    disabled={publishingGame === 'export'}
                    onClick={() => { void publishStandalone(true); }}
                  >
                    Deploy
                  </Button>
                </Group>
              </Group>
              {publishResult && (
                <Stack gap={3} mt={6} className="forge-publish-result">
                  <Group justify="space-between" className="forge-runtime-summary-row">
                    <Text size="xs" c="dimmed">Slug</Text>
                    <Text size="xs" className="forge-runtime-summary-value">{publishResult.slug}</Text>
                  </Group>
                  <Text size="xs" c="dimmed" className="forge-publish-path">{publishResult.gameDir}</Text>
                  <Text size="xs" c="dimmed">
                    {publishResult.runtimeFilesCopied} runtime files · {publishResult.runtimeAssetsCopied} runtime assets
                  </Text>
                  {publishResult.deployment?.httpsUrl && (
                    <Anchor size="xs" href={publishResult.deployment.httpsUrl} target="_blank" rel="noreferrer">Open deployment</Anchor>
                  )}
                  {publishResult.deploymentSkippedReason && <Text size="xs" c="dimmed">{publishResult.deploymentSkippedReason}</Text>}
                </Stack>
              )}
              {build.assetProduction?.reviewItems && build.assetProduction.reviewItems.length > 0 && (
                <Stack gap={3} mt={6} className="forge-review-queue">
                  <Text size="xs" c="red" fw={600}>Review queue</Text>
                  {build.assetProduction.reviewItems.slice(0, 4).map((item) => (
                    <Group key={`${item.variable}-${item.reviewUrl}`} justify="space-between" gap="xs" wrap="nowrap">
                      <Text size="xs" c="dimmed" truncate="end">{item.variable}</Text>
                      <Group gap={6} wrap="nowrap">
                        <Anchor size="xs" href={item.reviewUrl} target="_blank" rel="noreferrer">Image</Anchor>
                        <Button
                          size="compact-xs"
                          variant="default"
                          loading={acceptingReview === item.variable}
                          disabled={(acceptingReview !== null && acceptingReview !== item.variable) || retryingReview !== null}
                          onClick={() => { void acceptReviewItem(item.variable); }}
                        >
                          Accept
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          loading={retryingReview === item.variable}
                          disabled={(retryingReview !== null && retryingReview !== item.variable) || acceptingReview !== null}
                          onClick={() => { void retryReviewItem(item); }}
                        >
                          Retry
                        </Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        )}
        {error && <Text size="xs" c="red">{error}</Text>}
      </Stack>

      <Stack gap="xs" mih={0} className="forge-runtime-stage">
        <Group justify="space-between" gap="sm" className="forge-stage-heading">
          <Text size="xs" tt="uppercase" fw={600} c="sage" lts="0.1em">{publicDemoMode ? 'Bakery raid' : 'Live build · Forge'}</Text>
        </Group>
        <Paper withBorder radius="lg" className="forge-runtime-frame">
          {build
            ? <PhaserGame key={build.key} definition={build.def} />
            : <Stack h="100%" align="center" justify="center" p="xl"><Text fw={500} c="dimmed">Press Generate &amp; play</Text><Text size="sm" c="dimmed" ta="center" maw={420}>A real playable game is generated from the GameDefinition. Move, dash, swing, survive waves, repair nodes, defend cores, escort allies, hold capture zones, collect relics, chase score, or beat the boss.</Text></Stack>}
        </Paper>
        {build && <Text size="xs" c="dimmed" ta="center">Click the game · WASD / arrows move · Space/J attack · Shift/K dash · P pause</Text>}
      </Stack>
    </Box>
  );
}
