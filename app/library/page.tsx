'use client';

/**
 * Library — a grid of generated games. Mock data for now; real data will come from the
 * content store / Vercel deployments. Thumbnails animate on hover (MiniSim). "New game"
 * routes back to the Studio chat; "Play" opens the game's own window (deployed URL later).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge, Box, Button, Container, Group, Paper, SegmentedControl, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { MiniSim, type MiniGame } from '@/engine/frontend/components/MiniSim';

interface Game extends MiniGame {
  id: string;
  title: string;
  genre: string;
  v: string;
  score: number;
}

const GAMES: Game[] = [
  { id: 'coastal', title: 'Coastal Run', genre: 'survivor · top-down', v: 'v4', score: 94, field: '#e7e4db', player: '#5f6b4d', enemies: ['#c2a77f', '#8ea1ab', '#b89aa0'] },
  { id: 'tide', title: 'Tide Keeper', genre: 'dodger · top-down', v: 'v3', score: 88, field: '#e2e7ea', player: '#4a6470', enemies: ['#9aa7b0', '#cdb89a', '#a9b59c'] },
  { id: 'ember', title: 'Ember Drift', genre: 'shooter · arena', v: 'v2', score: 84, field: '#e6e2ea', player: '#6b5570', enemies: ['#b29bb6', '#9aa7b0', '#c2a77f'] },
  { id: 'rust', title: 'Rust Harvest', genre: 'survivor · top-down', v: 'v2', score: 81, field: '#ece2d6', player: '#9a5e46', enemies: ['#c98e6e', '#a7a382', '#bf9a8a'] },
  { id: 'glass', title: 'Glasswing', genre: 'puzzle · grid', v: 'v1', score: 79, field: '#eef1f3', player: '#5f7c8a', enemies: ['#9aa7b0', '#cdb89a', '#a9b59c'] },
  { id: 'bakery', title: 'Bakery Brawl', genre: 'collector · arena', v: 'v1', score: 76, field: '#f0e7da', player: '#a0744a', enemies: ['#cda06a', '#b0a07a', '#c89a86'] },
];

function GameCard({ game }: { game: Game }) {
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
        <MiniSim game={game} playing={hover} />
        <Badge variant="default" size="sm" style={{ position: 'absolute', top: 10, left: 10 }}>{game.v}</Badge>
        {hover && (
          <Group gap="xs" justify="center" style={{ position: 'absolute', inset: 0 }}>
            <Button size="xs" color="dark" radius="md" onClick={() => window.open('about:blank', `play_${game.id}`, 'width=980,height=660')}>▶ Play</Button>
            <Button size="xs" variant="default" radius="md" component={Link} href="/">Refine</Button>
          </Group>
        )}
      </Box>
      <Box p="md">
        <Text fw={500}>{game.title}</Text>
        <Group justify="space-between" mt={4}>
          <Text size="sm" c="dimmed">{game.genre}</Text>
          <Group gap={6}>
            <Box w={7} h={7} style={{ borderRadius: '50%', background: game.player }} />
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
    return GAMES.filter((g) => !q || g.title.toLowerCase().includes(q));
  }, [query]);

  return (
    <Container size="xl" py={48}>
      <Group justify="space-between" align="flex-end" mb="xs">
        <Title order={1} fw={500}>Studio</Title>
        <Button color="dark" radius="md" component={Link} href="/">＋ New game</Button>
      </Group>
      <Text c="dimmed" mb="xl">
        <Text span fw={500} c="var(--forge-ink)">{GAMES.length} games</Text> · 4 playable · average score{' '}
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
