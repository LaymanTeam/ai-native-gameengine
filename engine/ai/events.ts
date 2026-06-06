/**
 * Structured engine events — emitted by tools and pipeline chains onto the route's SSE stream
 * so the frontend renders progress (tokens, build trace, images, artifacts) live.
 * Shared by engine/ai/tool-definitions.ts and engine/ai/pipelines/*.
 */
export type EngineEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; name: string; detail: string }
  | { type: 'tool_end'; name: string; ok: boolean; detail: string }
  | { type: 'image'; id: string; dataUrl: string; caption: string }
  | { type: 'artifact'; kind: string; title: string; markdown: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type EmitEvent = (event: EngineEvent) => void;
