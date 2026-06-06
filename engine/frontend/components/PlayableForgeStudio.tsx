'use client';

import { useMemo, useState } from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';

interface ForgeSpec {
  title: string;
  theme: string;
  template?: 'roguelite' | 'flight-shooter';
  arena?: { name: string };
  player?: { name: string };
  weapons?: Array<{ id: string; name: string }>;
  enemies?: Array<{ id: string; name: string }>;
}

interface GenerationResult {
  source: string;
  model?: string;
  message?: string;
  spec: ForgeSpec;
}

const DEFAULT_PROMPT =
  'Make a chaotic top-down action roguelite in a haunted bakery where I fight enchanted pastries with kitchen magic.';

const SAMPLES = [
  DEFAULT_PROMPT,
  'A fast airplane shooter with storm clouds, enemy fighters, and a zeppelin boss',
  'A neon moon temple where a space wizard clears rooms of asteroid spirits',
];

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'game'
  );
}

function templateLabel(template: ForgeSpec['template']) {
  return template === 'flight-shooter' ? 'Flight shooter' : 'Room action roguelite';
}

function generationInstruction() {
  return 'Generate a complete playable vertical slice using the existing bounded template system. Prioritize demo clarity, readable controls, and a shareable player URL.';
}

export function PlayableForgeStudio() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready to create a playable build');
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [playerUrl, setPlayerUrl] = useState('');
  const [error, setError] = useState('');

  const generatedMeta = useMemo(() => {
    if (!result) return [];
    return [
      ['Source', result.model || result.source],
      ['Template', templateLabel(result.spec.template)],
      ['Arena', result.spec.arena?.name || 'Generated arena'],
      ['Player', result.spec.player?.name || 'Generated hero'],
    ];
  }, [result]);

  async function createGame() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || busy) return;

    setBusy(true);
    setError('');
    setStatus('Generating structured GameSpec');
    try {
      const generationResponse = await fetch('/api/forge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: cleanPrompt, instruction: generationInstruction() }),
      });
      if (!generationResponse.ok) {
        throw new Error(`Generation failed with ${generationResponse.status}`);
      }
      const generation = (await generationResponse.json()) as GenerationResult;

      setResult(generation);
      setStatus('Saving shareable player URL');
      const slug = slugify(`${generation.spec.title}-${Date.now().toString(36)}`);
      const artifact = {
        schemaVersion: 1,
        slug,
        prompt: cleanPrompt,
        source: generation.source,
        model: generation.model,
        createdAt: new Date().toISOString(),
        playerPath: `/?play=1&game=${encodeURIComponent(slug)}`,
        spec: generation.spec,
      };

      const saveResponse = await fetch('/api/forge/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(artifact),
      });
      if (!saveResponse.ok) {
        throw new Error(`Storage failed with ${saveResponse.status}`);
      }
      const saved = (await saveResponse.json()) as { playerUrl?: string; mode?: string };
      if (!saved.playerUrl) {
        throw new Error('Saved game did not return a player URL.');
      }

      setPlayerUrl(saved.playerUrl);
      setStatus(`Playable URL saved${saved.mode ? ` via ${saved.mode}` : ''}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown generation error';
      setError(message);
      setStatus('Build failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container fluid p={0} style={{ flex: 1, minHeight: 0 }}>
      <Box
        p="xl"
        style={{
          minHeight: 'calc(100dvh - 64px)',
          display: 'grid',
          gridTemplateColumns: 'minmax(330px, 400px) minmax(0, 1fr)',
          gap: 24,
        }}
      >
        <Paper withBorder radius="lg" p="lg" bg="var(--forge-bone-2)">
          <Stack gap="lg">
            <Box>
              <Badge variant="light" color="sage" mb="xs">
                Forge bridge spike
              </Badge>
              <Title order={1} fw={600} size="h2">
                Chat shell, real playable builds
              </Title>
              <Text c="dimmed" mt="xs">
                This branch keeps the calmer multimodal frontend and routes generation to the working Forge backend.
              </Text>
            </Box>

            <Textarea
              label="Game prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              autosize
              minRows={7}
              maxRows={12}
              disabled={busy}
            />

            <Group gap="sm">
              <Button color="dark" radius="md" loading={busy} onClick={() => void createGame()}>
                Create playable URL
              </Button>
              {playerUrl ? (
                <Button component="a" href={playerUrl} target="_blank" rel="noreferrer" variant="default" radius="md">
                  Open build
                </Button>
              ) : null}
            </Group>

            <Stack gap={8}>
              <Text size="sm" fw={500}>
                Samples
              </Text>
              {SAMPLES.map((sample) => (
                <Button key={sample} variant="default" radius="md" size="xs" justify="flex-start" onClick={() => setPrompt(sample)}>
                  {sample}
                </Button>
              ))}
            </Stack>

            <Paper withBorder radius="md" p="md" bg="white">
              <Stack gap={6}>
                <Group justify="space-between" gap="sm">
                  <Text size="sm" c="dimmed">
                    Status
                  </Text>
                  <Text size="sm" fw={600} ta="right">
                    {status}
                  </Text>
                </Group>
                {generatedMeta.map(([label, value]) => (
                  <Group key={label} justify="space-between" gap="sm">
                    <Text size="sm" c="dimmed">
                      {label}
                    </Text>
                    <Text size="sm" fw={500} ta="right">
                      {value}
                    </Text>
                  </Group>
                ))}
                {error ? (
                  <Text size="sm" c="red">
                    {error}
                  </Text>
                ) : null}
              </Stack>
            </Paper>
          </Stack>
        </Paper>

        <Stack gap="md" mih={0}>
          <Paper withBorder radius="lg" p="md" bg="white">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Text size="xs" tt="uppercase" fw={700} c="sage" lts="0.08em">
                  Live player surface
                </Text>
                <Title order={2} size="h3" fw={600}>
                  {result?.spec.title || 'Generate a game to preview it here'}
                </Title>
                <Text size="sm" c="dimmed">
                  {playerUrl ? 'The iframe below is the same shareable Vercel player URL used by the current demo.' : 'This will create a saved build and embed the public player URL.'}
                </Text>
              </Box>
              {playerUrl ? (
                <Code fz="xs" maw={420} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {playerUrl}
                </Code>
              ) : null}
            </Group>
          </Paper>

          <Paper
            withBorder
            radius="lg"
            bg="var(--forge-canvas)"
            style={{ flex: 1, minHeight: 520, overflow: 'hidden', position: 'relative' }}
          >
            {playerUrl ? (
              <iframe
                src={playerUrl}
                title="Playable generated game"
                style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#0d0d0d' }}
                allow="autoplay; fullscreen; gamepad"
              />
            ) : (
              <Stack h="100%" align="center" justify="center" gap="xs">
                <Text fw={600}>No build loaded yet</Text>
                <Text c="dimmed" maw={460} ta="center">
                  Click Create playable URL. The app will generate a GameSpec, save it through the Forge API, then embed the live Vercel player page here.
                </Text>
              </Stack>
            )}
          </Paper>

          <Text size="xs" c="dimmed">
            Uses <Anchor href="https://prompt-roguelite-forge.vercel.app" target="_blank">prompt-roguelite-forge.vercel.app</Anchor> as the backend in this spike. A full migration would move those API routes and runtime into this Next app.
          </Text>
        </Stack>
      </Box>
    </Container>
  );
}
