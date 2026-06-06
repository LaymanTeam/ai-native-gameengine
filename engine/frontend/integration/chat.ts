'use client';

/**
 * Chat transport — the seam between the chat UI and the director agent.
 *
 * Today it speaks the engine's existing SSE protocol at POST /api/chat
 * (token/tool_start/tool_end/image/error/done). If the transport changes (different endpoint,
 * websockets, an SDK), swap the body of streamChat — the UI only depends on this signature.
 */
import type { EngineEvent } from './contracts';

export interface StreamChatOptions {
  message: string;
  threadId: string;
  onEvent: (event: EngineEvent) => void;
  signal?: AbortSignal;
}

export async function streamChat({ message, threadId, onEvent, signal }: StreamChatOptions): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, threadId }),
    ...(signal ? { signal } : {}),
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
    const frames = buffer.split('\n\n'); // SSE frames separated by blank line
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as EngineEvent);
      } catch (parseError) {
        console.error('[integration/chat] bad SSE frame', parseError, dataLine.slice(0, 120));
      }
    }
  }
}
