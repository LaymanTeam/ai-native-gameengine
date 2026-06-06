'use client';

/**
 * Library — a grid of generated games. Data comes from the integration layer
 * (engine/frontend/integration/library), so it lights up with the real source when wired.
 * Thumbnails animate on hover (MiniSim). "New game" routes to the Studio chat; "Play" opens
 * the game via the deploy seam (deployed URL or the in-app /play/<id> runtime).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge, Box, Button, Container, Group, Paper, SegmentedControl, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { MiniSim } from '@/engine/frontend/components/MiniSim';
import { MOCK_GAMES } from '@/engine/frontend/integration/library';
import { openGame } from '@/engine/frontend/integration/deploy';
import type { GameSummary } from '@/engine/frontend/integration/contracts';

function GameCard({ game }: { game: GameSummary }) {
  const [hover, setHover] = useState(false);
  return (
    <Paper
      withBorder
      radius="lg"
      style={{ overflow: 'hidden', cursor: 'pointer', transition: 'transform .2s, box-shadow .2s', transform: hover ? 'translateY(-4px)' : undefined, boxShadow: hover ? '0 24px 60px -34px rgba(38,36,31,0.5)' : undefined }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Box style={{ position: 'relative', aspectRatio: '16 / 10', background: 'var(--forge-canvas)' }}>
        <MiniSim game={game.palette} playing={hover} />
        <Badge variant="default" size="sm" style={{ position: 'absolute', top: 10, left: 10 }}>{game.version}</Badge>
        {hover && (
          <Group gap="xs" justify="center" style={{ position: 'absolute', inset: 0 }}>
            <Button size="xs" color="dark" radius="md" onClick={() => openGame(game)}>▶ Play</Button>
            <Button size="xs" variant="default" radius="md" component={Link} href="/">Refine</Button>
          </Group>
        )}
      </Box>
      <Box p="md">
        <Text fw={500}>{game.title}</Text>
        <Group justify="space-between" mt={4}>
          <Text size="sm" c="dimmed">{game.genre}</Text>
          <Group gap={6}>
            <Box w={7} h={7} style={{ borderRadius: '50%', background: game.palette.player }} />
            <Text size="sm">{game.score}</Text>
          </Group>
        </Group>
      </Box>
    </Paper>
  );
}

export default function LibraryPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_GAMES.filter((g) => !q || g.title.toLowerCase().includes(q));
  }, [query]);

  return (
    <Container size="xl" py={48}>
      <Group justify="space-between" align="flex-end" mb="xs">
        <Title order={1} fw={500}>Studio</Title>
        <Button color="dark" radius="md" component={Link} href="/">＋ New game</Button>
      </Group>
      <Text c="dimmed" mb="xl">
        <Text span fw={500} c="var(--forge-ink)">{MOCK_GAMES.length} games</Text> · 4 playable · average score{' '}
        <Text span fw={500} c="var(--forge-ink)">84</Text>
      </Text>

      <Group mb="xl">
        <SegmentedControl value={filter} onChange={setFilter} data={['All', 'Playable', 'Recent', 'Top scored']} radius="xl" />
        <TextInput
          ml="auto"
          w={240}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search your games…"
          aria-label="Search games"
        />
      </Group>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(256px, 1fr))', gap: 22 }}>
        <Paper
          component={Link}
          href="/"
          radius="lg"
          style={{ border: '1px dashed rgba(38,36,31,0.2)', minHeight: 224, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--mantine-color-dimmed)', textDecoration: 'none' }}
        >
          <Box w={46} h={46} style={{ borderRadius: '50%', border: '1px solid currentColor', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 300 }}>＋</Box>
          <Text size="sm">Describe a new game</Text>
        </Paper>
        {games.map((g) => <GameCard key={g.id} game={g} />)}
      </Box>
    </Container>
  );
}
