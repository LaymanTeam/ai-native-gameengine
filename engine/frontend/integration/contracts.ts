/**
 * Frontend ↔ engine boundary contracts.
 *
 * Single source of truth for the types the UI depends on. As the engine fills in its real
 * modules, these get replaced by re-exports of the authoritative types (e.g. GameSpec becomes
 * `z.infer<typeof gameSpecSchema>`). Until then the UI compiles and runs against these shapes.
 *
 * See ./README.md for the full list of integration seams.
 */

// Director SSE events — canonical type lives in the engine; re-exported (type-only, erased).
export type { EngineEvent } from '@/engine/ai/tool-definitions';

/** Minimal palette the canvas/runtime previews need. */
export interface Palette {
  field: string;
  player: string;
  enemies: string[];
}

/** A generated game as the Library lists it. */
export interface GameSummary {
  id: string;
  title: string;
  genre: string;
  version: string;
  score: number;
  palette: Palette;
  /** Set once the game is deployed (engine/compiler/vercel-deploy.ts). */
  deployedUrl?: string;
}

/**
 * The structured artifact the engine builds from. Mirrors the expected real GameSpec; when the
 * engine ships a Zod schema, replace this with `export type GameSpec = z.infer<typeof ...>`.
 */
export interface GameSpec {
  title: string;
  genre: string;
  theme: string;
  palette: { background: string; player: string; accent: string; danger: string; xp: string };
  player: { maxHealth: number; speed: number; projectiles: number; cooldownMs: number };
  enemies: GameSpecEnemy[];
  waves?: number;
}

export interface GameSpecEnemy {
  name: string;
  role: string;
  color: string;
  hp: number;
  spd: number;
}

/** Handle returned by a mounted game; the play surface calls destroy() on unmount. */
export interface GameRuntime {
  destroy(): void;
}

/** The contract engine/renderer/pixi-js.ts is expected to satisfy. */
export type MountGame = (target: HTMLElement, spec: GameSpec) => Promise<GameRuntime> | GameRuntime;
