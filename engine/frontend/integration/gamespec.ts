/**
 * GameSpec seam — the structured artifact the engine builds from.
 *
 * Provides a fallback spec the Schema editor and play surface use today. When the engine ships
 * the authoritative Zod schema, do two things:
 *   1. In contracts.ts, replace `GameSpec` with `z.infer<typeof gameSpecSchema>`.
 *   2. Below, replace the `validateGameSpec` passthrough with a real `gameSpecSchema.parse`.
 * (We can't dynamic-import the schema module until it exists, so this is a one-line swap, not a
 * live conditional import — unlike the renderer in runtime.ts.)
 */
import type { GameSpec } from './contracts';

export const FALLBACK_SPEC: GameSpec = {
  title: 'Coastal Run',
  genre: 'survivor',
  theme: 'calm coastal, soft light',
  palette: { background: '#dfe3da', player: '#7e8b6d', accent: '#c2a77f', danger: '#8ea1ab', xp: '#cbb88f' },
  player: { maxHealth: 120, speed: 2.4, projectiles: 3, cooldownMs: 640 },
  enemies: [
    { name: 'Tide Wisp', role: 'shooter · ranged', color: '#8ea1ab', hp: 18, spd: 1.8 },
    { name: 'Drift Hound', role: 'charger · melee', color: '#c2a77f', hp: 30, spd: 3.1 },
    { name: 'Harbor Maw', role: 'boss · 90s', color: '#b89aa0', hp: 900, spd: 1.0 },
  ],
  waves: 9,
};

/** Passthrough until the real Zod schema lands (see header). */
export function validateGameSpec(input: unknown): GameSpec {
  // SEAM: const { gameSpecSchema } = await import('@/engine/.../game-spec'); return gameSpecSchema.parse(input);
  return input as GameSpec;
}

/** Build a spec for a game card that has no full spec yet (derive from its palette). */
export function specFromPalette(title: string, palette: { field: string; player: string; enemies: string[] }): GameSpec {
  return {
    ...FALLBACK_SPEC,
    title,
    palette: {
      ...FALLBACK_SPEC.palette,
      background: palette.field,
      player: palette.player,
      accent: palette.enemies[0] ?? FALLBACK_SPEC.palette.accent,
      danger: palette.enemies[1] ?? FALLBACK_SPEC.palette.danger,
    },
  };
}
