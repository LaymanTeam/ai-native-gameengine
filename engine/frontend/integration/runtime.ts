'use client';

/**
 * Game runtime adapter — the live conditional-import seam.
 *
 * Uses the real PixiJS runtime as soon as `engine/renderer/pixi-js.ts` exports a `mountGame`
 * matching the MountGame contract (PixiJS v8). Until then it falls back to a lightweight canvas
 * preview so the play surface works today. The dynamic import is build-safe because the stub
 * file already exists (empty); when it's empty the feature check fails and we use the fallback.
 */
import type { GameRuntime, GameSpec, MountGame } from './contracts';

export async function mountGame(target: HTMLElement, spec: GameSpec): Promise<GameRuntime> {
  try {
    const mod = (await import('@/engine/renderer/pixi-js')) as Partial<{ mountGame: MountGame }>;
    if (typeof mod.mountGame === 'function') {
      return await mod.mountGame(target, spec);
    }
  } catch (err) {
    console.warn('[integration/runtime] real renderer unavailable; using placeholder', err);
  }
  return mountPlaceholder(target, spec);
}

/** Placeholder top-down "survivor" so /play works before the PixiJS runtime lands. */
function mountPlaceholder(target: HTMLElement, spec: GameSpec): GameRuntime {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  target.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let raf: number | null = null;

  const field = spec.palette.background;
  const playerColor = spec.palette.player;
  const enemyColors = [spec.palette.accent, spec.palette.danger, spec.palette.xp];

  interface E { x: number; y: number; c: string; s: number; r: number; }
  interface S { x: number; y: number; vx: number; vy: number; l: number; }
  const en: E[] = [];
  const sh: S[] = [];
  let t = 0;
  let w = 0;
  let h = 0;

  const fit = () => {
    const rc = canvas.getBoundingClientRect();
    canvas.width = rc.width * dpr;
    canvas.height = rc.height * dpr;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    w = rc.width;
    h = rc.height;
  };
  fit();
  const onResize = () => fit();
  window.addEventListener('resize', onResize);

  const frame = () => {
    if (!ctx) return;
    t++;
    const px = w / 2 + Math.cos(t * 0.018) * w * 0.22;
    const py = h / 2 + Math.sin(t * 0.024) * h * 0.18;
    if (t % 22 === 0 && en.length < 26) {
      const edge = Math.floor(Math.random() * 4);
      let ex = 0; let ey = 0;
      if (edge === 0) { ex = 0; ey = Math.random() * h; }
      else if (edge === 1) { ex = w; ey = Math.random() * h; }
      else if (edge === 2) { ex = Math.random() * w; ey = 0; }
      else { ex = Math.random() * w; ey = h; }
      const c = enemyColors[Math.floor(Math.random() * enemyColors.length)] ?? playerColor;
      en.push({ x: ex, y: ey, c, s: 0.5 + Math.random() * 0.5, r: 5 + Math.random() * 4 });
    }
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(38,36,31,0.05)';
    for (let i = 0; i < w; i += 44) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let j = 0; j < h; j += 44) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
    for (const e of en) {
      const dx = px - e.x; const dy = py - e.y; const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.s; e.y += (dy / d) * e.s;
      ctx.fillStyle = e.c;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
    }
    if (t % 13 === 0 && en.length) {
      let n = en[0]!; let best = 1e9;
      for (const e of en) { const dd = (e.x - px) ** 2 + (e.y - py) ** 2; if (dd < best) { best = dd; n = e; } }
      const a = Math.atan2(n.y - py, n.x - px);
      for (let i = -1; i <= 1; i++) {
        const aa = a + i * 0.16;
        sh.push({ x: px, y: py, vx: Math.cos(aa) * 5, vy: Math.sin(aa) * 5, l: 64 });
      }
    }
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i]!;
      s.x += s.vx; s.y += s.vy; s.l--;
      ctx.fillStyle = playerColor;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, 7); ctx.fill();
      for (let j = en.length - 1; j >= 0; j--) {
        const e = en[j]!;
        if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < (e.r + 3) ** 2) { en.splice(j, 1); sh.splice(i, 1); break; }
      }
      if (s.l <= 0) sh.splice(i, 1);
    }
    ctx.fillStyle = playerColor;
    ctx.beginPath(); ctx.arc(px, py, 8, 0, 7); ctx.fill();
    ctx.strokeStyle = playerColor + '55';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(px, py, 14, 0, 7); ctx.stroke();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.remove();
    },
  };
}
