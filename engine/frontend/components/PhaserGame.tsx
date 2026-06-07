'use client';

/**
 * Mounts the Phaser runtime for a GameDefinition. Phaser is imported dynamically (browser only)
 * so it never loads during SSR. Re-mounts when the definition changes.
 */
import { useEffect, useRef } from 'react';
import type { GameDefinition } from '@/engine/runtime/game-definition';

export function PhaserGame({ definition }: { definition: GameDefinition }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let handle: { destroy(): void } | null = null;
    let disposed = false;
    void import('@/engine/runtime/phaser/forge-game').then(({ createForgeGame }) => {
      if (disposed) return;
      handle = createForgeGame(el, definition);
    });
    return () => {
      disposed = true;
      handle?.destroy();
      el.innerHTML = '';
    };
  }, [definition]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
