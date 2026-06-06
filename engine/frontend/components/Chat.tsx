'use client';

/**
 * The engine's AI chat interface (see utilities/index.ts header: CLI → Vercel-hosted chat).
 * Consumes the director agent's SSE event stream from POST /api/chat:
 * tokens, tool progress, and generated images render incrementally.
 * Conversation history is held server-side (checkpointer keyed by threadId);
 * the client keeps a display copy only.
 *
 * Styling follows the Forge visual system (design/forge.css → Mantine theme): Forge avatar,
 * streaming text, tool/phase activity shown as a calm "build trace", inline concept images,
 * and a richer composer. The SSE plumbing is unchanged from the original implementation.
 */
import { useCallback, useRef, useState } from 'react';
import {
  ActionIcon, Avatar, Box, Button, Group, Image, Loader, Paper,
  ScrollArea, SegmentedControl, Stack, Text, Textarea, ThemeIcon,
} from '@mantine/core';
import type { EngineEvent } from '@/engine/frontend/integration/contracts';
import { streamChat } from '@/engine/frontend/integration/chat';
import { Markdown } from './Markdown';

const CHAT_LOG_PREFIX = '[engine/frontend/Chat]';

interface GeneratedImageAttachment {
  id: string;
  dataUrl: string;
  caption: string;
}

interface ToolStep {
  name: string;
  detail: string;
  status: 'running' | 'done' | 'failed';
}

interface Artifact {
  kind: string;
  title: string;
  markdown: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images: GeneratedImageAttachment[];
  steps: ToolStep[];
  artifacts: Artifact[];
}

const SUGGESTIONS = [
  'A chaotic top-down roguelite in a haunted bakery',
  'A neon arena shooter with drone swarms',
  'A cozy fishing-village RPG with a day/night cycle',
];

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <Paper withBorder radius="md" p="md" w="100%">
      <Group gap={8} mb="xs">
        <ThemeIcon size={18} radius="xl" color="sage" variant="light"><Text size="10px" fw={700}>GDD</Text></ThemeIcon>
        <Text fw={500} size="sm">{artifact.title}</Text>
      </Group>
      <Markdown source={artifact.markdown} />
    </Paper>
  );
}

function ForgeAvatar() {
  return (
    <Avatar size={28} radius="xl" color="sage" variant="filled">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M12 2l2.2 6.6H21l-5.4 4 2 6.6L12 15l-5.6 4.2 2-6.6L3 8.6h6.8z" />
      </svg>
    </Avatar>
  );
}

function TraceRow({ steps }: { steps: ToolStep[] }) {
  return (
    <Group gap="md" wrap="wrap">
      {steps.map((step, i) => (
        <Group key={`${step.name}-${i}`} gap={6} wrap="nowrap">
          {step.status === 'running' ? (
            <Loader size={14} color="sage" />
          ) : (
            <ThemeIcon size={16} radius="xl" variant="light" color={step.status === 'failed' ? 'red' : 'sage'}>
              <Text size="10px" fw={700}>{step.status === 'failed' ? '×' : '✓'}</Text>
            </ThemeIcon>
          )}
          <Text size="xs" c={step.status === 'running' ? 'var(--forge-ink)' : 'dimmed'}>{step.name}</Text>
        </Group>
      ))}
    </Group>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('Full');
  const threadIdRef = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || busy) return;

    threadIdRef.current ??= crypto.randomUUID();
    const threadId = threadIdRef.current;
    const history: ChatMessage[] = [...messages, { role: 'user', content, images: [], steps: [], artifacts: [] }];
    console.log(`${CHAT_LOG_PREFIX} send thread=${threadId} chars=${content.length}`);
    setMessages([...history, { role: 'assistant', content: '', images: [], steps: [], artifacts: [] }]);
    setInput('');
    setBusy(true);

    let assistantText = '';
    let assistantImages: GeneratedImageAttachment[] = [];
    let assistantSteps: ToolStep[] = [];
    let assistantArtifacts: Artifact[] = [];
    const renderAssistant = () => {
      setMessages([
        ...history,
        { role: 'assistant', content: assistantText, images: assistantImages, steps: assistantSteps, artifacts: assistantArtifacts },
      ]);
      scrollToBottom();
    };

    const handleEvent = (event: EngineEvent): void => {
      switch (event.type) {
        case 'token':
          assistantText += event.text;
          renderAssistant();
          break;
        case 'tool_start':
          console.log(`${CHAT_LOG_PREFIX} tool_start ${event.name}: ${event.detail}`);
          assistantSteps = [...assistantSteps, { name: event.name, detail: event.detail, status: 'running' }];
          renderAssistant();
          break;
        case 'tool_end': {
          console.log(`${CHAT_LOG_PREFIX} tool_end ${event.name} ok=${event.ok}: ${event.detail}`);
          const idx = [...assistantSteps].reverse().findIndex((s) => s.name === event.name && s.status === 'running');
          if (idx !== -1) {
            const realIdx = assistantSteps.length - 1 - idx;
            assistantSteps = assistantSteps.map((s, i) =>
              i === realIdx ? { ...s, status: event.ok ? 'done' : 'failed', detail: event.detail } : s,
            );
          }
          renderAssistant();
          break;
        }
        case 'image':
          console.log(`${CHAT_LOG_PREFIX} image received id=${event.id}`);
          assistantImages = [...assistantImages, { id: event.id, dataUrl: event.dataUrl, caption: event.caption }];
          renderAssistant();
          break;
        case 'artifact':
          console.log(`${CHAT_LOG_PREFIX} artifact ${event.kind}: ${event.title}`);
          assistantArtifacts = [...assistantArtifacts, { kind: event.kind, title: event.title, markdown: event.markdown }];
          renderAssistant();
          break;
        case 'error':
          console.error(`${CHAT_LOG_PREFIX} server error event: ${event.message}`);
          assistantText += `\n${event.message}`;
          renderAssistant();
          break;
        case 'done':
          console.log(`${CHAT_LOG_PREFIX} stream done thread=${threadId} chars=${assistantText.length}`);
          break;
        default:
          console.warn(`${CHAT_LOG_PREFIX} unknown SSE event`, event);
      }
    };

    try {
      await streamChat({ message: content, threadId, onEvent: handleEvent });
    } catch (error) {
      console.error(`${CHAT_LOG_PREFIX} stream error`, error);
      assistantText = assistantText || 'Something went wrong talking to the engine. Please try again.';
      renderAssistant();
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, scrollToBottom]);

  return (
    <Stack flex={1} mih={0} gap="sm">
      <ScrollArea flex={1} viewportRef={viewportRef} type="auto" aria-label="Conversation history">
        <Stack gap="lg" p="xs" maw={720} mx="auto" w="100%">
          {messages.length === 0 && (
            <Stack align="center" mt={80} gap="lg">
              <ForgeAvatar />
              <Text c="dimmed" ta="center" maw={420}>
                Describe a game and I’ll build a playable version. Keep refining it in plain language.
              </Text>
              <Group gap="xs" justify="center">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="default" size="xs" radius="xl" onClick={() => setInput(s)}>
                    {s}
                  </Button>
                ))}
              </Group>
            </Stack>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === 'user';
            return (
              <Group
                key={`${message.role}-${index}`}
                align="flex-start"
                gap="sm"
                wrap="nowrap"
                justify={isUser ? 'flex-end' : 'flex-start'}
                className="forge-rise"
              >
                {!isUser && <ForgeAvatar />}
                <Stack gap={6} maw="84%" align={isUser ? 'flex-end' : 'flex-start'}>
                  <Text size="10px" fw={600} tt="uppercase" c={isUser ? 'sage' : 'dimmed'} lts="0.08em">
                    {isUser ? 'You' : 'Forge'}
                  </Text>

                  {message.steps.length > 0 && <TraceRow steps={message.steps} />}

                  {message.artifacts.map((artifact, i) => (
                    <ArtifactCard key={`${artifact.kind}-${i}`} artifact={artifact} />
                  ))}

                  {(message.content || (!isUser && message.steps.length === 0)) && (
                    isUser ? (
                      <Paper p="sm" radius="md" withBorder bg="sage.0" style={{ borderBottomRightRadius: 4 }}>
                        <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                      </Paper>
                    ) : (
                      <Box>
                        {message.content
                          ? <Markdown source={message.content} tone="normal" />
                          : (busy ? <Text c="dimmed">…</Text> : null)}
                        {busy && index === messages.length - 1 && <span className="forge-caret" />}
                      </Box>
                    )
                  )}

                  {message.images.map((image) => (
                    <Paper key={image.id} withBorder radius="md" p={6} maw={420}>
                      <Image src={image.dataUrl} alt={image.caption} title={image.caption} radius="sm" />
                      <Text size="xs" c="dimmed" mt={6}>{image.caption}</Text>
                    </Paper>
                  ))}
                </Stack>
                {isUser && <Avatar size={28} radius="xl" color="gray" variant="light">T</Avatar>}
              </Group>
            );
          })}
        </Stack>
      </ScrollArea>

      <Box maw={720} mx="auto" w="100%">
        <Paper withBorder radius="lg" p="sm" bg="var(--forge-bone-2)">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Describe a game, or refine the current one…"
            aria-label="Game description"
            autosize
            minRows={1}
            maxRows={6}
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
            <SegmentedControl
              size="xs"
              radius="xl"
              value={mode}
              onChange={setMode}
              data={['Full', 'Balance', 'Style']}
              ml={4}
            />
            <Box flex={1} />
            <Button onClick={() => void send()} loading={busy} color="dark" radius="md" aria-label="Send message">
              Send
            </Button>
          </Group>
        </Paper>
        <Text size="xs" c="dimmed" mt={8} ta="center">gemini · structured GameSpec · ⏎ to send</Text>
      </Box>
    </Stack>
  );
}
