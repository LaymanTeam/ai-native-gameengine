'use client';

/**
 * The engine's AI chat interface (see utilities/index.ts header: CLI → Vercel-hosted chat).
 * Consumes the director agent's SSE event stream from POST /api/chat:
 * tokens, tool progress, and generated images render incrementally.
 * Conversation history is held server-side (checkpointer keyed by threadId);
 * the client keeps a display copy only.
 */
import { useCallback, useRef, useState } from 'react';
import { Badge, Button, Group, Image, Loader, Paper, ScrollArea, Stack, Text, TextInput } from '@mantine/core';

const CHAT_LOG_PREFIX = '[engine/frontend/Chat]';

interface GeneratedImageAttachment {
  id: string;
  dataUrl: string;
  caption: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images: GeneratedImageAttachment[];
}

type SseEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; name: string; detail: string }
  | { type: 'tool_end'; name: string; ok: boolean; detail: string }
  | { type: 'image'; id: string; dataUrl: string; caption: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
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
    const history: ChatMessage[] = [...messages, { role: 'user', content, images: [] }];
    console.log(`${CHAT_LOG_PREFIX} send thread=${threadId} chars=${content.length}`);
    setMessages([...history, { role: 'assistant', content: '', images: [] }]);
    setInput('');
    setBusy(true);

    let assistantText = '';
    let assistantImages: GeneratedImageAttachment[] = [];
    const renderAssistant = () => {
      setMessages([...history, { role: 'assistant', content: assistantText, images: assistantImages }]);
      scrollToBottom();
    };

    const handleEvent = (event: SseEvent): void => {
      switch (event.type) {
        case 'token':
          assistantText += event.text;
          renderAssistant();
          break;
        case 'tool_start':
          console.log(`${CHAT_LOG_PREFIX} tool_start ${event.name}: ${event.detail}`);
          setActiveTool(event.name);
          break;
        case 'tool_end':
          console.log(`${CHAT_LOG_PREFIX} tool_end ${event.name} ok=${event.ok}: ${event.detail}`);
          setActiveTool(null);
          break;
        case 'image':
          console.log(`${CHAT_LOG_PREFIX} image received id=${event.id}`);
          assistantImages = [...assistantImages, { id: event.id, dataUrl: event.dataUrl, caption: event.caption }];
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, threadId }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '');
        throw new Error(`chat route failed status=${res.status} detail=${detail.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          try {
            handleEvent(JSON.parse(dataLine.slice(6)) as SseEvent);
          } catch (parseError) {
            console.error(`${CHAT_LOG_PREFIX} bad SSE frame`, parseError, dataLine.slice(0, 120));
          }
        }
      }
    } catch (error) {
      console.error(`${CHAT_LOG_PREFIX} stream error`, error);
      assistantText = assistantText || 'Something went wrong talking to the engine. Please try again.';
      renderAssistant();
    } finally {
      setActiveTool(null);
      setBusy(false);
    }
  }, [input, busy, messages, scrollToBottom]);

  return (
    <Stack flex={1} mih={0} gap="sm">
      <ScrollArea flex={1} viewportRef={viewportRef} type="auto" aria-label="Conversation history">
        <Stack gap="xs" p="xs">
          {messages.length === 0 && (
            <Text c="dimmed" ta="center" mt="xl">
              e.g. “A cozy fishing village RPG with a day/night cycle”
            </Text>
          )}
          {messages.map((message, index) => (
            <Paper
              key={`${message.role}-${index}`}
              p="sm"
              radius="md"
              withBorder={message.role === 'assistant'}
              bg={message.role === 'user' ? 'indigo.0' : 'transparent'}
            >
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                {message.role === 'user' ? 'You' : 'Engine'}
              </Text>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content || '…'}</Text>
              {message.images.map((image) => (
                <Image
                  key={image.id}
                  src={image.dataUrl}
                  alt={image.caption}
                  title={image.caption}
                  radius="sm"
                  mt="xs"
                  maw={420}
                />
              ))}
            </Paper>
          ))}
          {activeTool && (
            <Group gap="xs" pl="sm" aria-live="polite">
              <Loader size="xs" />
              <Badge variant="light">{activeTool}</Badge>
              <Text size="xs" c="dimmed">
                working…
              </Text>
            </Group>
          )}
        </Stack>
      </ScrollArea>
      <Group gap="xs" align="end">
        <TextInput
          flex={1}
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Describe your game…"
          aria-label="Game description"
          disabled={busy}
        />
        <Button onClick={() => void send()} loading={busy} aria-label="Send message">
          Send
        </Button>
      </Group>
    </Stack>
  );
}
