'use client';

/**
 * In-app play surface. Mounts the runtime adapter (placeholder canvas now, PixiJS once
 * engine/renderer/pixi-js ships) for the game id in the route. Used as the fallback target of
 * openGame() when a game has no deployedUrl yet.
 */
import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Box, Button, Group, Text } from '@mantine/core';
import { findGame, MOCK_GAMES } from '@/engine/frontend/integration/library';
import { specFromPalette } from '@/engine/frontend/integration/gamespec';
import { mountGame } from '@/engine/frontend/integration/runtime';
import type { GameRuntime } from '@/engine/frontend/integration/contracts';

export default function PlayPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? 'coastal');
  const game = findGame(id) ?? MOCK_GAMES[0]!;
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let runtime: GameRuntime | null = null;
    let disposed = false;
    const spec = specFromPalette(game.title, game.palette);
    void mountGame(el, spec).then((r) => {
      if (disposed) r.destroy();
      else runtime = r;
    });
    return () => {
      disposed = true;
      runtime?.destroy();
    };
  }, [game]);

  return (
    <Box p="md" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="sm">
        <Box>
          <Text fw={500}>{game.title}</Text>
          <Text size="xs" c="dimmed">{game.genre}</Text>
        </Box>
        <Button variant="default" size="xs" radius="md" onClick={() => window.close()}>← Close</Button>
      </Group>
      <Box
        ref={hostRef}
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid rgba(38,36,31,0.08)',
          background: game.palette.field,
        }}
      />
      <Text size="xs" c="dimmed" mt="xs" ta="center">
        Placeholder runtime — upgrades to PixiJS automatically when engine/renderer/pixi-js ships.
      </Text>
    </Box>
  );
}
