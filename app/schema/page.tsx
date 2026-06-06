'use client';

/**
 * Schema — a GameSpec inspector/editor. The structured artifact the engine builds from.
 * Mock spec for now; bind to the real Zod GameSpec when it lands. Edits update the live
 * JSON preview on the right. Visual system only.
 */
import { useState } from 'react';
import {
  Badge, Box, Card, ColorInput, Container, Grid, Group, Paper, Progress,
  ScrollArea, Slider, Stack, Text, TextInput, Title,
} from '@mantine/core';

interface PlayerSpec { maxHealth: number; speed: number; projectiles: number; cooldownMs: number; }

const ENEMIES = [
  { name: 'Tide Wisp', role: 'shooter · ranged', color: '#8ea1ab', hp: 18, spd: 1.8 },
  { name: 'Drift Hound', role: 'charger · melee', color: '#c2a77f', hp: 30, spd: 3.1 },
  { name: 'Harbor Maw', role: 'boss · 90s', color: '#b89aa0', hp: 900, spd: 1.0 },
];

const EVALS = [
  { label: 'Schema validity', value: 100, color: 'sage' },
  { label: 'Playability', value: 92, color: 'sage' },
  { label: 'Difficulty curve', value: 88, color: 'sage' },
  { label: 'Theme coherence', value: 95, color: 'sage' },
  { label: 'Roster diversity', value: 71, color: 'yellow' },
] as const;

function Stat({ label, value, suffix, min, max, step, onChange }: {
  label: string; value: number; suffix?: string; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <Stack gap={8}>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="sm" fw={500}>{value}{suffix ?? ''}</Text>
      </Group>
      <Slider value={value} onChange={onChange} min={min} max={max} step={step ?? 1} color="sage" label={null} />
    </Stack>
  );
}

export default function SchemaPage() {
  const [title, setTitle] = useState('Coastal Run');
  const [theme, setTheme] = useState('calm coastal, soft light');
  const [palette, setPalette] = useState({ background: '#dfe3da', player: '#7e8b6d', accent: '#c2a77f', danger: '#8ea1ab', xp: '#cbb88f' });
  const [player, setPlayer] = useState<PlayerSpec>({ maxHealth: 120, speed: 2.4, projectiles: 3, cooldownMs: 640 });

  const spec = { title, genre: 'survivor', theme, palette, player, enemies: ENEMIES.length, waves: 9 };

  return (
    <Container size="xl" py={40}>
      <Grid gap={40}>
        {/* editor */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Group justify="space-between" align="flex-end" mb={4}>
            <Title order={2} fw={500}>{title || 'Untitled'}</Title>
            <Badge variant="default">GameSpec · v4</Badge>
          </Group>
          <Text c="dimmed" mb="xl">survivor · top-down · the structured artifact the engine builds from</Text>

          <Stack gap={40}>
            <section>
              <Text size="xs" tt="uppercase" c="dimmed" fw={500} lts="0.14em" mb="md">Meta</Text>
              <Grid>
                <Grid.Col span={6}><TextInput label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} /></Grid.Col>
                <Grid.Col span={6}><TextInput label="Theme" value={theme} onChange={(e) => setTheme(e.currentTarget.value)} /></Grid.Col>
              </Grid>
            </section>

            <section>
              <Text size="xs" tt="uppercase" c="dimmed" fw={500} lts="0.14em" mb="md">Palette</Text>
              <Group>
                {(Object.keys(palette) as (keyof typeof palette)[]).map((key) => (
                  <ColorInput
                    key={key}
                    label={key}
                    value={palette[key]}
                    onChange={(v) => setPalette((p) => ({ ...p, [key]: v }))}
                    w={150}
                    format="hex"
                    styles={{ label: { textTransform: 'capitalize', fontSize: 12 } }}
                  />
                ))}
              </Group>
            </section>

            <section>
              <Text size="xs" tt="uppercase" c="dimmed" fw={500} lts="0.14em" mb="md">Player</Text>
              <Grid gap="xl">
                <Grid.Col span={6}><Stat label="Max health" value={player.maxHealth} min={40} max={300} onChange={(v) => setPlayer((p) => ({ ...p, maxHealth: v }))} /></Grid.Col>
                <Grid.Col span={6}><Stat label="Move speed" value={player.speed} suffix="×" min={1} max={5} step={0.1} onChange={(v) => setPlayer((p) => ({ ...p, speed: v }))} /></Grid.Col>
                <Grid.Col span={6}><Stat label="Projectiles" value={player.projectiles} min={1} max={8} onChange={(v) => setPlayer((p) => ({ ...p, projectiles: v }))} /></Grid.Col>
                <Grid.Col span={6}><Stat label="Fire cooldown" value={player.cooldownMs} suffix="ms" min={120} max={1200} step={10} onChange={(v) => setPlayer((p) => ({ ...p, cooldownMs: v }))} /></Grid.Col>
              </Grid>
            </section>

            <section>
              <Text size="xs" tt="uppercase" c="dimmed" fw={500} lts="0.14em" mb="md">Enemies</Text>
              <Stack gap="xs">
                {ENEMIES.map((e) => (
                  <Paper key={e.name} withBorder radius="md" p="md">
                    <Group>
                      <Box w={34} h={34} style={{ borderRadius: 8, background: e.color }} />
                      <Box>
                        <Text fw={500}>{e.name}</Text>
                        <Text size="xs" c="dimmed">{e.role}</Text>
                      </Box>
                      <Group gap="xl" ml="auto">
                        <Box ta="center"><Text fw={500}>{e.hp}</Text><Text size="10px" c="dimmed" tt="uppercase">hp</Text></Box>
                        <Box ta="center"><Text fw={500}>{e.spd}</Text><Text size="10px" c="dimmed" tt="uppercase">spd</Text></Box>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </section>
          </Stack>
        </Grid.Col>

        {/* inspector */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xl" style={{ position: 'sticky', top: 88 }}>
            <Paper withBorder radius="md" p="md" bg="sage.0" style={{ borderColor: 'var(--forge-accent)' }}>
              <Group gap="xs">
                <Text c="sage.8" fw={600}>✓</Text>
                <Text size="sm">Validates against GameSpec schema</Text>
              </Group>
            </Paper>

            <Box>
              <Text size="xs" tt="uppercase" c="dimmed" fw={500} lts="0.14em" mb="sm">Live JSON</Text>
              <ScrollArea.Autosize mah={280}>
                <Card withBorder radius="md" p="md" bg="var(--forge-bone-2)">
                  <Text component="pre" ff="monospace" size="11px" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify(spec, null, 2)}
                  </Text>
                </Card>
              </ScrollArea.Autosize>
            </Box>

            <Box>
              <Text size="xs" tt="uppercase" c="dimmed" fw={500} lts="0.14em" mb="md">Eval</Text>
              <Stack gap="md">
                {EVALS.map((ev) => (
                  <Box key={ev.label}>
                    <Group justify="space-between" mb={5}>
                      <Text size="xs" c="dimmed">{ev.label}</Text>
                      <Text size="xs">{ev.value}</Text>
                    </Group>
                    <Progress value={ev.value} color={ev.color} size="sm" radius="xl" />
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
