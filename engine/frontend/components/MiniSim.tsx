'use client';

/**
 * Lightweight top-down "survivor" preview rendered on a canvas. Used for game-card
 * thumbnails: draws a static frame normally and animates while `playing` (hover).
 * Placeholder visual only — the real runtime is engine/renderer/pixi-js.ts.
 */
import { useEffect, useRef } from 'react';

export interface MiniGame {
  field: string;
  player: string;
  enemies: string[];
}

interface Enemy { x: number; y: number; c: string; s: number; r: number; }
interface Shot { x: number; y: number; vx: number; vy: number; l: number; }

export function MiniSim({ game, playing }: { game: MiniGame; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d');
    if (!x) return;
    const dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;
    const fit = () => {
      const rc = c.getBoundingClientRect();
      c.width = rc.width * dpr;
      c.height = rc.height * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = rc.width;
      h = rc.height;
    };
    fit();

    const bg = () => {
      x.fillStyle = game.field;
      x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(38,36,31,0.04)';
      for (let i = 0; i < w; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
      for (let j = 0; j < h; j += 24) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
    };
    const player = (px: number, py: number) => {
      x.fillStyle = game.player;
      x.beginPath(); x.arc(px, py, 5.5, 0, 7); x.fill();
      x.strokeStyle = game.player + '66';
      x.lineWidth = 1.3;
      x.beginPath(); x.arc(px, py, 10, 0, 7); x.stroke();
    };
    const drawStatic = () => {
      fit();
      bg();
      const pts: [number, number, number][] = [[0.28, 0.36, 0], [0.72, 0.3, 1], [0.64, 0.7, 2], [0.4, 0.62, 0], [0.8, 0.6, 1]];
      for (const p of pts) {
        x.fillStyle = game.enemies[p[2]] ?? game.player;
        x.beginPath(); x.arc(w * p[0], h * p[1], 4, 0, 7); x.fill();
      }
      player(w * 0.5, h * 0.5);
    };

    if (!playing) {
      drawStatic();
      return;
    }

    const en: Enemy[] = [];
    const sh: Shot[] = [];
    let t = 0;
    const frame = () => {
      t++;
      const px = w / 2 + Math.cos(t * 0.02) * w * 0.22;
      const py = h / 2 + Math.sin(t * 0.026) * h * 0.2;
      if (t % 20 === 0 && en.length < 14) {
        const edge = Math.floor(Math.random() * 4);
        let ex = 0; let ey = 0;
        if (edge === 0) { ex = 0; ey = Math.random() * h; }
        else if (edge === 1) { ex = w; ey = Math.random() * h; }
        else if (edge === 2) { ex = Math.random() * w; ey = 0; }
        else { ex = Math.random() * w; ey = h; }
        const col = game.enemies[Math.floor(Math.random() * game.enemies.length)] ?? game.player;
        en.push({ x: ex, y: ey, c: col, s: 0.5 + Math.random() * 0.5, r: 3.5 + Math.random() * 2.5 });
      }
      bg();
      for (const e of en) {
        const dx = px - e.x; const dy = py - e.y; const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * e.s; e.y += (dy / d) * e.s;
        x.fillStyle = e.c;
        x.beginPath(); x.arc(e.x, e.y, e.r, 0, 7); x.fill();
      }
      if (t % 14 === 0 && en.length) {
        let n = en[0]!; let best = 1e9;
        for (const e of en) { const dd = (e.x - px) ** 2 + (e.y - py) ** 2; if (dd < best) { best = dd; n = e; } }
        const a = Math.atan2(n.y - py, n.x - px);
        sh.push({ x: px, y: py, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, l: 50 });
      }
      for (let i = sh.length - 1; i >= 0; i--) {
        const s = sh[i]!;
        s.x += s.vx; s.y += s.vy; s.l--;
        x.fillStyle = game.player;
        x.beginPath(); x.arc(s.x, s.y, 1.8, 0, 7); x.fill();
        for (let j = en.length - 1; j >= 0; j--) {
          const e = en[j]!;
          if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < (e.r + 2) ** 2) { en.splice(j, 1); sh.splice(i, 1); break; }
        }
        if (s.l <= 0) sh.splice(i, 1);
      }
      player(px, py);
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [playing, game]);

  return <canvas ref={ref} className="forge-canvas" />;
}
