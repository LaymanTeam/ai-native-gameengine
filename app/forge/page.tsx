'use client';

/**
 * Forge (Path A runtime preview) — describe a game, get a real Phaser game generated from a
 * GameDefinition and played in-app. Keyless: uses the local generator. This is the runtime SDK
 * (Phaser) driven by the GameDefinition; the agent pipeline will produce richer definitions.
 */
import { useEffect, useState } from 'react';
import { ActionIcon, Box, Button, Group, Paper, Stack, Text, Textarea, ThemeIcon } from '@mantine/core';
import { buildLocalGameDefinition } from '@/engine/runtime/local-generator';
import type { GameDefinition } from '@/engine/runtime/game-definition';
import { PhaserGame } from '@/engine/frontend/components/PhaserGame';

const SAMPLES = [
  'a chaotic haunted bakery roguelite',
  'a neon space arena shooter with drone swarms',
  'a cozy coastal survivor gathering light',
];

interface Build { key: number; def: GameDefinition; }

export default function ForgePage() {
  const [prompt, setPrompt] = useState(SAMPLES[0] ?? '');
  const [build, setBuild] = useState<Build | null>(null);

  function create() {
    const def = buildLocalGameDefinition(prompt.trim() || SAMPLES[0]!);
    setBuild({ key: Date.now(), def });
  }

  // auto-start for demos/screenshots: /forge?play
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('play')) {
      const id = window.setTimeout(create, 300);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box p="xl" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)', gap: 28 }}>
      <Stack gap="lg">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={28} radius="xl" color="sage" variant="filled">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2l2.2 6.6H21l-5.4 4 2 6.6L12 15l-5.6 4.2 2-6.6L3 8.6h6.8z" /></svg>
          </ThemeIcon>
          <Box>
            <Text fw={500}>Forge runtime</Text>
            <Text size="sm" c="dimmed">Describe a game — Phaser builds it from a GameDefinition.</Text>
          </Box>
        </Group>

        <Paper withBorder radius="lg" p="sm" bg="var(--forge-bone-2)">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} autosize minRows={3} maxRows={8} variant="unstyled" placeholder="Describe the game…" />
          <Group justify="flex-end" mt="xs"><Button color="dark" radius="md" onClick={create}>Generate &amp; play</Button></Group>
        </Paper>

        <Group gap="xs">
          {SAMPLES.map((s) => (
            <Button key={s} variant="default" size="xs" radius="xl" onClick={() => setPrompt(s)}>{s.split(' ').slice(0, 4).join(' ')}…</Button>
          ))}
        </Group>

        {build && (
          <Paper withBorder radius="md" p="md">
            <Text fw={500} mb={6}>{build.def.title}</Text>
            <Stack gap={4}>
              <Group justify="space-between"><Text size="sm" c="dimmed">Enemies</Text><Text size="sm">{build.def.enemies.length} + boss</Text></Group>
              <Group justify="space-between"><Text size="sm" c="dimmed">Waves</Text><Text size="sm">{build.def.waves.length}</Text></Group>
              <Group justify="space-between"><Text size="sm" c="dimmed">Win</Text><Text size="sm">{build.def.winCondition}</Text></Group>
            </Stack>
          </Paper>
        )}
      </Stack>

      <Stack gap="xs" mih={0}>
        <Text size="xs" tt="uppercase" fw={600} c="sage" lts="0.1em">Live build · Phaser</Text>
        <Paper withBorder radius="lg" style={{ flex: 1, minHeight: 520, overflow: 'hidden', background: '#0d0f14' }}>
          {build
            ? <PhaserGame key={build.key} definition={build.def} />
            : <Stack h="100%" align="center" justify="center" p="xl"><Text fw={500} c="dimmed">Press Generate &amp; play</Text><Text size="sm" c="dimmed" ta="center" maw={420}>A real Phaser game is generated from the GameDefinition. WASD/arrows to move, auto-fire, survive and beat the boss.</Text></Stack>}
        </Paper>
        {build && <Text size="xs" c="dimmed" ta="center">Click the game · WASD / arrows to move · auto-fire · R to restart</Text>}
      </Stack>
    </Box>
  );
}
