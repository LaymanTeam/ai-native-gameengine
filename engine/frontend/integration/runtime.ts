'use client';

/**
 * Game runtime adapter — the live conditional-import seam, with a real in-app fallback.
 *
 * Uses the real PixiJS runtime as soon as `engine/renderer/pixi-js.ts` exports a `mountGame`
 * matching the MountGame contract. Until then it mounts a self-contained Canvas2D survivor that
 * actually plays the generated GameSpec (WASD/arrows, auto-fire, enemies, HP, score, win/lose) —
 * entirely in-app, no external service and no API key.
 */
import type { GameRuntime, GameSpec, MountGame } from './contracts';

export async function mountGame(target: HTMLElement, spec: GameSpec): Promise<GameRuntime> {
  try {
    const mod = (await import('@/engine/renderer/pixi-js')) as Partial<{ mountGame: MountGame }>;
    if (typeof mod.mountGame === 'function') {
      return await mod.mountGame(target, spec);
    }
  } catch (err) {
    console.warn('[integration/runtime] real renderer unavailable; using in-app Canvas2D runtime', err);
  }
  return mountCanvas2D(target, spec);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2) || '00', 16);
  const g = parseInt(h.slice(2, 4) || '00', 16);
  const b = parseInt(h.slice(4, 6) || '00', 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function mountCanvas2D(target: HTMLElement, spec: GameSpec): GameRuntime {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', outline: 'none', cursor: 'crosshair' });
  target.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;

  const ink = luminance(spec.palette.background) > 0.6 ? '38,36,31' : '236,235,228';
  const enemyColors = spec.enemies.length ? spec.enemies.map((e) => e.color) : [spec.palette.danger];
  const enemyHp = spec.enemies.length ? spec.enemies.map((e) => Math.max(8, e.hp)) : [16];
  const enemySpd = spec.enemies.length ? spec.enemies.map((e) => e.spd) : [1.6];

  const SPEED = spec.player.speed * 1.7;
  const SHOTS = Math.max(1, spec.player.projectiles);
  const FIRE_EVERY = Math.max(6, Math.round(spec.player.cooldownMs / 16));
  const SURVIVE = 90; // seconds to win

  interface Enemy { x: number; y: number; c: string; s: number; r: number; hp: number; }
  interface Shot { x: number; y: number; vx: number; vy: number; l: number; }
  interface Orb { x: number; y: number; l: number; }

  const keys: Record<string, boolean> = {};
  // Don't hijack keys while the user is typing in a form field (the composer textarea, etc.) —
  // otherwise preventDefault() on space/arrows swallows them mid-typing.
  const isEditable = (el: EventTarget | null): boolean => {
    const node = el as HTMLElement | null;
    if (!node || !node.tagName) return false;
    const tag = node.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (isEditable(e.target)) return;
    keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (isEditable(e.target)) return;
    keys[e.key.toLowerCase()] = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let W = 0; let H = 0;
  const fit = () => {
    const rc = canvas.getBoundingClientRect();
    canvas.width = rc.width * dpr; canvas.height = rc.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); W = rc.width; H = rc.height;
  };
  fit();
  const onResize = () => fit();
  window.addEventListener('resize', onResize);

  const player = { x: W / 2, y: H / 2, hp: spec.player.maxHealth };
  const en: Enemy[] = [];
  const sh: Shot[] = [];
  const orbs: Orb[] = [];
  let t = 0; let score = 0; let raf: number | null = null; let over: 'win' | 'lose' | null = null;
  let moved = false;

  const spawn = () => {
    const i = Math.floor(Math.random() * enemyColors.length);
    const edge = Math.floor(Math.random() * 4);
    let x = 0; let y = 0;
    if (edge === 0) { x = 0; y = Math.random() * H; }
    else if (edge === 1) { x = W; y = Math.random() * H; }
    else if (edge === 2) { x = Math.random() * W; y = 0; }
    else { x = Math.random() * W; y = H; }
    en.push({ x, y, c: enemyColors[i]!, s: (enemySpd[i] ?? 1.6) * 0.8, r: 7 + (i === enemyColors.length - 1 ? 6 : 0), hp: enemyHp[i]! });
  };

  const frame = () => {
    t++;
    const seconds = t / 60;

    // movement
    let mx = 0; let my = 0;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (mx || my) { moved = true; const d = Math.hypot(mx, my); player.x += (mx / d) * SPEED; player.y += (my / d) * SPEED; }
    else if (!moved && !over) { player.x = W / 2 + Math.cos(t * 0.018) * W * 0.18; player.y = H / 2 + Math.sin(t * 0.024) * H * 0.16; }
    player.x = Math.max(10, Math.min(W - 10, player.x));
    player.y = Math.max(10, Math.min(H - 10, player.y));

    const spawnEvery = Math.max(10, 40 - Math.floor(seconds));
    if (!over && t % spawnEvery === 0 && en.length < 60) spawn();

    // background
    ctx.fillStyle = spec.palette.background; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(${ink},0.06)`;
    const g = 44; const ox = (t * 0.2) % g; const oy = (t * 0.15) % g;
    for (let x = -ox; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -oy; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // enemies
    for (let j = en.length - 1; j >= 0; j--) {
      const e = en[j]!;
      const dx = player.x - e.x; const dy = player.y - e.y; const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.s; e.y += (dy / d) * e.s;
      ctx.fillStyle = e.c; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
      if (!over && d < e.r + 9) { player.hp -= 0.4; }
    }

    // auto-fire
    if (!over && t % FIRE_EVERY === 0 && en.length) {
      let n = en[0]!; let best = 1e9;
      for (const e of en) { const dd = (e.x - player.x) ** 2 + (e.y - player.y) ** 2; if (dd < best) { best = dd; n = e; } }
      const base = Math.atan2(n.y - player.y, n.x - player.x);
      for (let i = 0; i < SHOTS; i++) {
        const a = base + (i - (SHOTS - 1) / 2) * 0.18;
        sh.push({ x: player.x, y: player.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, l: 70 });
      }
    }
    // shots
    ctx.fillStyle = spec.palette.player;
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i]!; s.x += s.vx; s.y += s.vy; s.l--;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, 7); ctx.fill();
      for (let j = en.length - 1; j >= 0; j--) {
        const e = en[j]!;
        if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < (e.r + 3) ** 2) {
          e.hp -= 10; sh.splice(i, 1);
          if (e.hp <= 0) { orbs.push({ x: e.x, y: e.y, l: 90 }); en.splice(j, 1); score += 10; }
          break;
        }
      }
      if (s.l <= 0) sh.splice(i, 1);
    }
    // xp orbs (drift toward player, collected)
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i]!; o.l--;
      const dx = player.x - o.x; const dy = player.y - o.y; const d = Math.hypot(dx, dy) || 1;
      if (d < 90) { o.x += (dx / d) * 3; o.y += (dy / d) * 3; }
      if (d < 12) { score += 5; orbs.splice(i, 1); continue; }
      ctx.fillStyle = spec.palette.xp; ctx.beginPath(); ctx.arc(o.x, o.y, 3, 0, 7); ctx.fill();
      if (o.l <= 0) orbs.splice(i, 1);
    }

    // player
    ctx.fillStyle = spec.palette.player; ctx.beginPath(); ctx.arc(player.x, player.y, 8, 0, 7); ctx.fill();
    ctx.strokeStyle = spec.palette.accent; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(player.x, player.y, 13, 0, 7); ctx.stroke();

    // HUD
    const hpFrac = Math.max(0, player.hp) / spec.player.maxHealth;
    ctx.fillStyle = `rgba(${ink},0.18)`; ctx.fillRect(16, 16, 180, 7);
    ctx.fillStyle = spec.palette.danger; ctx.fillRect(16, 16, 180 * hpFrac, 7);
    ctx.fillStyle = `rgba(${ink},0.85)`; ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`${Math.max(0, Math.ceil(player.hp))} HP`, 16, 40);
    ctx.textAlign = 'right';
    ctx.fillText(`${score}`, W - 16, 28);
    ctx.fillStyle = `rgba(${ink},0.5)`; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${Math.max(0, Math.ceil(SURVIVE - seconds))}s`, W - 16, 46);
    ctx.textAlign = 'left';

    // win/lose
    if (!over && player.hp <= 0) over = 'lose';
    if (!over && seconds >= SURVIVE) over = 'win';
    if (over) {
      ctx.fillStyle = `rgba(${ink},0.5)`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = spec.palette.background; ctx.textAlign = 'center';
      ctx.font = '600 28px system-ui, sans-serif';
      ctx.fillText(over === 'win' ? 'You survived' : 'You fell', W / 2, H / 2 - 6);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`Score ${score} · press R to restart`, W / 2, H / 2 + 22);
      ctx.textAlign = 'left';
      if (keys['r']) { restart(); }
    }

    raf = requestAnimationFrame(frame);
  };

  function restart() {
    en.length = 0; sh.length = 0; orbs.length = 0; t = 0; score = 0; over = null; moved = true;
    player.x = W / 2; player.y = H / 2; player.hp = spec.player.maxHealth;
  }

  canvas.focus({ preventScroll: true });
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      canvas.remove();
    },
  };
}
