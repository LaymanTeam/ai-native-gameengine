'use client';

/**
 * Core runtime sandbox — describe a game, get a small local playable build in this app.
 *
 * Generates a GameSpec locally (no API key, no network — integration/local-generator) and mounts
 * it with the in-app runtime (integration/runtime → Canvas2D today, PixiJS when the engine ships
 * mountGame). No external embed. Presented in the cleaned Forge design system.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon, Box, Button, Group, Loader, Paper, Stack, Text, Textarea, ThemeIcon,
} from '@mantine/core';
import { generateSpecLocal } from '@/engine/frontend/integration/local-generator';
import { mountGame } from '@/engine/frontend/integration/runtime';
import type { GameRuntime, GameSpec } from '@/engine/frontend/integration/contracts';

const SAMPLES = [
  'A chaotic top-down roguelite in a haunted bakery where I fight enchanted pastries',
  'A neon moon temple where a space wizard clears rooms of asteroid spirits',
  'A calm coastal survivor where you drift past tide swarms and gather light',
];

interface Build { slug: string; spec: GameSpec; }

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'game';
}

function ForgeAvatar() {
  return (
    <ThemeIcon size={28} radius="xl" color="sage" variant="filled">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M12 2l2.2 6.6H21l-5.4 4 2 6.6L12 15l-5.6 4.2 2-6.6L3 8.6h6.8z" />
      </svg>
    </ThemeIcon>
  );
}

export function PlayableForgeStudio() {
  const [prompt, setPrompt] = useState(SAMPLES[0] ?? '');
  const [stage, setStage] = useState<'idle' | 'generating' | 'ready'>('idle');
  const [build, setBuild] = useState<Build | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const busy = stage === 'generating';

  // mount/destroy the in-app game whenever the build changes
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !build) return;
    let runtime: GameRuntime | null = null;
    let disposed = false;
    void mountGame(el, build.spec).then((r) => { if (disposed) r.destroy(); else runtime = r; });
    return () => { disposed = true; runtime?.destroy(); };
  }, [build]);

  // optional auto-start for demos/screenshots: /?demo
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')) {
      const id = window.setTimeout(create, 300);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = useMemo(() => {
    if (!build) return [] as [string, string][];
    const s = build.spec;
    return [
      ['Genre', s.genre],
      ['Player', `${s.player.maxHealth} hp · ${s.player.speed.toFixed(1)}× · ${s.player.projectiles} shots`],
      ['Enemies', `${s.enemies.length} types`],
      ['Waves', String(s.waves ?? '—')],
    ];
  }, [build]);

  function create() {
    const clean = prompt.trim();
    if (!clean || busy) return;
    setStage('generating');
    // local + synchronous; small timeout only so the trace reads as a step
    window.setTimeout(() => {
      const spec = generateSpecLocal(clean);
      const slug = `${slugify(spec.title)}-${Math.abs(Date.now()).toString(36).slice(-4)}`;
      try { localStorage.setItem(`forge:${slug}`, JSON.stringify(spec)); } catch { /* ignore */ }
      setBuild({ slug, spec });
      setStage('ready');
    }, 220);
  }

  return (
    <Box
      p="xl"
      style={{
        flex: 1, minHeight: 0,
        display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) minmax(0, 1fr)', gap: 28,
      }}
    >
      {/* composer */}
      <Stack gap="lg">
        <Group gap="sm" wrap="nowrap">
          <ForgeAvatar />
          <Box>
            <Text fw={500}>Core runtime sandbox</Text>
            <Text size="sm" c="dimmed">Instant local GameSpec → playable loop.</Text>
          </Box>
        </Group>

        <Paper withBorder radius="lg" p="sm" bg="var(--forge-bone-2)">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); create(); } }}
            placeholder="Describe the game you want…"
            aria-label="Game prompt"
            autosize minRows={4} maxRows={12}
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
            <Button color="dark" radius="md" loading={busy} onClick={create}>Create build</Button>
          </Group>
        </Paper>

        <Group gap="xs">
          {SAMPLES.map((s) => (
            <Button key={s} variant="default" size="xs" radius="xl" onClick={() => setPrompt(s)} disabled={busy}>
              {s.split(' ').slice(0, 4).join(' ')}…
            </Button>
          ))}
        </Group>

        {build && (
          <Paper withBorder radius="md" p="md" className="forge-rise">
            <Stack gap="sm">
              <Group gap={8}>
                <ThemeIcon size={18} radius="xl" color="sage"><Text size="10px" fw={700}>✓</Text></ThemeIcon>
                <Text size="sm" fw={500}>{build.spec.title}</Text>
              </Group>
              {meta.map(([label, value]) => (
                <Group key={label} justify="space-between" gap="sm">
                  <Text size="sm" c="dimmed">{label}</Text>
                  <Text size="sm" fw={500} ta="right">{value}</Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>

      {/* live, in-app player */}
      <Stack gap="md" mih={0}>
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text size="xs" tt="uppercase" fw={600} c="sage" lts="0.1em">Core engine · local</Text>
            <Text fw={500} size="lg">{build?.spec.title ?? 'Instant runtime sandbox'}</Text>
          </Box>
          {build && (
            <Button component="a" href={`/play/${build.slug}`} target="_blank" rel="noreferrer" size="xs" variant="default" radius="md">
              Open in window ↗
            </Button>
          )}
        </Group>

        <Paper withBorder radius="lg" bg="var(--forge-canvas)" style={{ flex: 1, minHeight: 520, overflow: 'hidden', position: 'relative' }}>
          {build ? (
            <Box ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
          ) : busy ? (
            <Stack h="100%" align="center" justify="center" gap="sm">
              <Loader color="sage" />
              <Text c="dimmed" size="sm">Generating GameSpec…</Text>
            </Stack>
          ) : (
            <Stack h="100%" align="center" justify="center" gap="xs" p="xl">
              <Text fw={500}>No build loaded yet</Text>
              <Text c="dimmed" maw={440} ta="center" size="sm">
                Describe a game and press <b>Create build</b>. This proves the core loop from
                local GameSpec to playable runtime.
              </Text>
            </Stack>
          )}
        </Paper>
        {build && <Text size="xs" c="dimmed" ta="center">WASD / arrows move · generated controls · R restart</Text>}
      </Stack>
    </Box>
  );
}
