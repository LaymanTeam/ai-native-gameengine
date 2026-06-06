'use client';

/**
 * Studio front door — describe a game, get a playable build.
 *
 * Presents the working "Prompt Roguelite Forge" generate→save→play pipeline through the cleaned
 * Forge design system (Nordic theme, Forge avatar, build trace, calm composer, game frame).
 * All transport lives in the integration seam (integration/forge.ts); this is pure UI.
 */
import { useMemo, useState } from 'react';
import {
  ActionIcon, Box, Button, Code, Container, Group, Loader, Paper,
  Stack, Text, Textarea, ThemeIcon,
} from '@mantine/core';
import { createPlayableBuild, type ForgeBuild, type ForgeStep } from '@/engine/frontend/integration/forge';

const SAMPLES = [
  'A chaotic top-down roguelite in a haunted bakery where I fight enchanted pastries with kitchen magic',
  'A fast airplane shooter with storm clouds, enemy fighters, and a zeppelin boss',
  'A neon moon temple where a space wizard clears rooms of asteroid spirits',
];

const STEPS: { key: ForgeStep; label: string }[] = [
  { key: 'spec', label: 'spec' },
  { key: 'save', label: 'save' },
  { key: 'ready', label: 'ready' },
];

type Stage = 'idle' | ForgeStep | 'error';

function ForgeAvatar() {
  return (
    <ThemeIcon size={28} radius="xl" color="sage" variant="filled">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M12 2l2.2 6.6H21l-5.4 4 2 6.6L12 15l-5.6 4.2 2-6.6L3 8.6h6.8z" />
      </svg>
    </ThemeIcon>
  );
}

function Trace({ stage }: { stage: Stage }) {
  const order: ForgeStep[] = ['spec', 'save', 'ready'];
  const activeIdx = stage === 'idle' || stage === 'error' ? -1 : order.indexOf(stage);
  return (
    <Group gap="md" wrap="wrap">
      {STEPS.map((step, i) => {
        const done = activeIdx > i || stage === 'ready';
        const active = activeIdx === i && stage !== 'ready';
        return (
          <Group key={step.key} gap={6} wrap="nowrap">
            {active ? (
              <Loader size={14} color="sage" />
            ) : (
              <ThemeIcon size={16} radius="xl" variant="light" color={done ? 'sage' : 'gray'}>
                <Text size="10px" fw={700}>{done ? '✓' : '·'}</Text>
              </ThemeIcon>
            )}
            <Text size="xs" c={active ? 'var(--forge-ink)' : 'dimmed'}>{step.label}</Text>
          </Group>
        );
      })}
    </Group>
  );
}

export function PlayableForgeStudio() {
  const [prompt, setPrompt] = useState(SAMPLES[0] ?? '');
  const [stage, setStage] = useState<Stage>('idle');
  const [build, setBuild] = useState<ForgeBuild | null>(null);
  const [error, setError] = useState('');

  const busy = stage === 'spec' || stage === 'save';

  const meta = useMemo(() => {
    if (!build) return [] as [string, string][];
    const s = build.generation.spec;
    return [
      ['Source', build.generation.model || build.generation.source],
      ['Template', s.template === 'flight-shooter' ? 'Flight shooter' : 'Room action roguelite'],
      ['Arena', s.arena?.name || 'Generated arena'],
      ['Player', s.player?.name || 'Generated hero'],
    ];
  }, [build]);

  async function create() {
    const clean = prompt.trim();
    if (!clean || busy) return;
    setError('');
    setBuild(null);
    setStage('spec');
    try {
      const result = await createPlayableBuild(clean, (step) => setStage(step));
      setBuild(result);
      setStage('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown generation error');
      setStage('error');
    }
  }

  return (
    <Container fluid p={0} style={{ flex: 1, minHeight: 0 }}>
      <Box
        p="xl"
        style={{
          minHeight: 'calc(100dvh - 64px)',
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 420px) minmax(0, 1fr)',
          gap: 28,
        }}
      >
        {/* composer / conversation */}
        <Stack gap="lg">
          <Group gap="sm" wrap="nowrap">
            <ForgeAvatar />
            <Box>
              <Text fw={500}>Studio</Text>
              <Text size="sm" c="dimmed">Describe a game — I’ll generate a playable build.</Text>
            </Box>
          </Group>

          <Paper withBorder radius="lg" p="sm" bg="var(--forge-bone-2)">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void create();
                }
              }}
              placeholder="Describe the game you want…"
              aria-label="Game prompt"
              autosize
              minRows={4}
              maxRows={12}
              variant="unstyled"
              disabled={busy}
            />
            <Group gap={4} mt="xs" wrap="nowrap">
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Add reference image" title="Add reference image">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M3 17l5-4 4 3 3-2 6 5" /></svg>
              </ActionIcon>
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Voice input" title="Voice input">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>
              </ActionIcon>
              <Box flex={1} />
              <Button color="dark" radius="md" loading={busy} onClick={() => void create()}>
                Create build
              </Button>
            </Group>
          </Paper>

          <Group gap="xs">
            {SAMPLES.map((s) => (
              <Button key={s} variant="default" size="xs" radius="xl" onClick={() => setPrompt(s)} disabled={busy}>
                {s.split(' ').slice(0, 4).join(' ')}…
              </Button>
            ))}
          </Group>

          {stage !== 'idle' && (
            <Paper withBorder radius="md" p="md" className="forge-rise">
              <Stack gap="sm">
                {stage !== 'error' && <Trace stage={stage} />}
                {meta.map(([label, value]) => (
                  <Group key={label} justify="space-between" gap="sm">
                    <Text size="sm" c="dimmed">{label}</Text>
                    <Text size="sm" fw={500} ta="right">{value}</Text>
                  </Group>
                ))}
                {build && (
                  <Group justify="space-between" gap="sm" mt={4}>
                    <Group gap={8}>
                      <ThemeIcon size={18} radius="xl" color="sage"><Text size="10px" fw={700}>✓</Text></ThemeIcon>
                      <Text size="sm">Playable build ready</Text>
                    </Group>
                    <Button component="a" href={build.playerUrl} target="_blank" rel="noreferrer" size="xs" color="dark" radius="md">
                      Open build ↗
                    </Button>
                  </Group>
                )}
                {error && <Text size="sm" c="red">{error}</Text>}
              </Stack>
            </Paper>
          )}
        </Stack>

        {/* live player */}
        <Stack gap="md" mih={0}>
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="xs" tt="uppercase" fw={600} c="sage" lts="0.1em">Live build</Text>
              <Text fw={500} size="lg">{build?.generation.spec.title ?? 'Generate a game to preview it here'}</Text>
            </Box>
            {build && (
              <Code fz="xs" maw={360} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {build.playerUrl}
              </Code>
            )}
          </Group>

          <Paper
            withBorder
            radius="lg"
            bg="var(--forge-canvas)"
            style={{ flex: 1, minHeight: 520, overflow: 'hidden', position: 'relative' }}
          >
            {build ? (
              <iframe
                src={build.playerUrl}
                title="Playable generated game"
                style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#0d0d0d' }}
                allow="autoplay; fullscreen; gamepad"
              />
            ) : (
              <Stack h="100%" align="center" justify="center" gap="xs" p="xl">
                <Text fw={500}>No build loaded yet</Text>
                <Text c="dimmed" maw={440} ta="center" size="sm">
                  Describe a game and press <b>Create build</b>. The engine generates a GameSpec,
                  saves it, and embeds the live playable URL here.
                </Text>
              </Stack>
            )}
          </Paper>
        </Stack>
      </Box>
    </Container>
  );
}
