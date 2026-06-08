import type { Asset, Enemy, GameDefinition } from './game-definition';

const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const safeColor = (value: string): string => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff');
type LocalAssetMood = 'haunted' | 'security' | 'sky' | 'platform' | 'space' | 'bakery' | 'coast' | 'neutral';
type SpriteSheetAnimation = NonNullable<NonNullable<Asset['spriteSheet']>['animations']>[number];

function blendColor(value: string, target: '#000000' | '#ffffff', amount: number): string {
  const color = safeColor(value).slice(1);
  const tr = target === '#ffffff' ? 255 : 0;
  const tg = tr;
  const tb = tr;
  const r = Number.parseInt(color.slice(0, 2), 16);
  const g = Number.parseInt(color.slice(2, 4), 16);
  const b = Number.parseInt(color.slice(4, 6), 16);
  const mix = (channel: number, dest: number) => Math.round(channel + (dest - channel) * Math.max(0, Math.min(1, amount)));
  return `#${[mix(r, tr), mix(g, tg), mix(b, tb)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function assetMood(definition: GameDefinition): LocalAssetMood {
  const text = [
    definition.title,
    definition.theme,
    definition.arena.name,
    definition.runtimeTemplate,
    definition.winCondition,
    definition.boss?.name,
    ...definition.enemies.map((enemy) => `${enemy.name} ${enemy.role}`),
  ].filter(Boolean).join(' ').toLowerCase();
  if (definition.runtimeTemplate === 'flight-shooter' || /(airplane|plane|jet|flight|sky|cloud|storm|zeppelin|dogfight|pilot|fighter)/.test(text)) return 'sky';
  if (definition.runtimeTemplate === 'puzzle-room' || definition.runtimeTemplate === 'agent-dashboard' || definition.runtimeTemplate === 'decision-room') return 'security';
  if (definition.runtimeTemplate === 'platformer' || /(platform|platformer|jump|jumper|ledge|castle|cave|ruin|temple|sideview|sidescroller)/.test(text)) return 'platform';
  if (/(pizza|kitchen|chef|food|pastr|cake|sugar|bread|oven|portal|pantry|baker)/.test(text)) return 'bakery';
  if (/(ghost|haunt|grave|vampire|witch|crypt|spirit|bone|spooky|horror)/.test(text)) return 'haunted';
  if (/(laser-grid|grid|lattice|scanner|security|crossfire|tripwire|firewall|lockdown)/.test(text)) return 'security';
  if (/(^|\s)(coast(?:al)?|tide|ocean|sea|waves?|harbor|beach|forest|meadow|reef|shore)(\s|$)/.test(text)) return 'coast';
  if (/(space|alien|star|moon|planet|orbital|comet|void|cosmic|neon|cyber|drone)/.test(text)) return 'space';
  if (/(bakery|pantry|baker|cozy)/.test(text)) return 'bakery';
  return 'neutral';
}

function moodDecal(cx: number, cy: number, r: number, mood: LocalAssetMood, accent: string, variant: string): string {
  const markOpacity = variant === 'boss' ? '.58' : '.46';
  if (mood === 'security') {
    return `<rect x="${cx - r * 0.5}" y="${cy - r * 0.5}" width="${r}" height="${r}" rx="${Math.max(2, r * 0.12)}" fill="#000" fill-opacity=".12" stroke="${accent}" stroke-opacity="${markOpacity}" stroke-width="1"/><path d="M${cx - r * 0.5} ${cy}H${cx + r * 0.5}M${cx} ${cy - r * 0.5}V${cy + r * 0.5}M${cx - r * 0.25} ${cy - r * 0.5}V${cy + r * 0.5}M${cx + r * 0.25} ${cy - r * 0.5}V${cy + r * 0.5}" stroke="#fff" stroke-opacity=".24" stroke-width="1"/>`;
  }
  if (mood === 'space') {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.78}" ry="${r * 0.26}" fill="none" stroke="${accent}" stroke-opacity="${markOpacity}" stroke-width="1.4"/><circle cx="${cx + r * 0.58}" cy="${cy - r * 0.2}" r="${Math.max(1.5, r * 0.09)}" fill="#fff" fill-opacity=".62"/><path d="M${cx - r * 0.42} ${cy + r * 0.34}L${cx + r * 0.46} ${cy - r * 0.36}" stroke="#fff" stroke-opacity=".18" stroke-width="1"/>`;
  }
  if (mood === 'sky') {
    return `<path d="M${cx - r * 0.62} ${cy + r * 0.18}C${cx - r * 0.22} ${cy - r * 0.16} ${cx + r * 0.2} ${cy + r * 0.32} ${cx + r * 0.62} ${cy - r * 0.02}" fill="none" stroke="${accent}" stroke-opacity="${markOpacity}" stroke-width="1.5" stroke-linecap="round"/><path d="M${cx - r * 0.34} ${cy - r * 0.24}H${cx + r * 0.42}" stroke="#fff" stroke-opacity=".24" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  if (mood === 'platform') {
    return `<path d="M${cx - r * 0.58} ${cy + r * 0.34}H${cx + r * 0.58}M${cx - r * 0.4} ${cy + r * 0.5}H${cx + r * 0.36}" stroke="${accent}" stroke-opacity="${markOpacity}" stroke-width="1.6" stroke-linecap="round"/><path d="M${cx - r * 0.48} ${cy - r * 0.36}L${cx - r * 0.14} ${cy - r * 0.58}L${cx + r * 0.24} ${cy - r * 0.34}" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  if (mood === 'haunted') {
    return `<path d="M${cx - r * 0.5} ${cy}Q${cx} ${cy - r * 0.52} ${cx + r * 0.5} ${cy}Q${cx} ${cy + r * 0.42} ${cx - r * 0.5} ${cy}Z" fill="#000" fill-opacity=".16" stroke="${accent}" stroke-opacity=".38" stroke-width="1"/><path d="M${cx - r * 0.36} ${cy - r * 0.12}L${cx + r * 0.36} ${cy + r * 0.18}M${cx + r * 0.34} ${cy - r * 0.14}L${cx - r * 0.34} ${cy + r * 0.18}" stroke="#fff" stroke-opacity=".24" stroke-width="1.2"/>`;
  }
  if (mood === 'bakery') {
    return `<path d="M${cx - r * 0.5} ${cy - r * 0.1}C${cx - r * 0.28} ${cy - r * 0.34} ${cx - r * 0.08} ${cy + r * 0.18} ${cx + r * 0.1} ${cy - r * 0.08}S${cx + r * 0.38} ${cy - r * 0.22} ${cx + r * 0.52} ${cy + r * 0.02}" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="1.6" stroke-linecap="round"/><circle cx="${cx - r * 0.34}" cy="${cy + r * 0.26}" r="${Math.max(1.3, r * 0.07)}" fill="${accent}" fill-opacity=".62"/><circle cx="${cx + r * 0.32}" cy="${cy + r * 0.2}" r="${Math.max(1.2, r * 0.06)}" fill="#fff" fill-opacity=".5"/>`;
  }
  if (mood === 'coast') {
    return `<path d="M${cx - r * 0.58} ${cy + r * 0.08}C${cx - r * 0.28} ${cy - r * 0.12} ${cx - r * 0.08} ${cy + r * 0.26} ${cx + r * 0.14} ${cy + r * 0.04}S${cx + r * 0.42} ${cy - r * 0.04} ${cx + r * 0.58} ${cy + r * 0.12}" fill="none" stroke="${accent}" stroke-opacity=".48" stroke-width="1.6" stroke-linecap="round"/><path d="M${cx - r * 0.42} ${cy + r * 0.28}C${cx - r * 0.18} ${cy + r * 0.12} ${cx + r * 0.18} ${cy + r * 0.4} ${cx + r * 0.42} ${cy + r * 0.22}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>`;
  }
  return `<path d="M${cx - r * 0.42} ${cy}H${cx + r * 0.42}M${cx} ${cy - r * 0.42}V${cy + r * 0.42}" stroke="${accent}" stroke-opacity=".34" stroke-width="1.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${Math.max(1.4, r * 0.08)}" fill="#fff" fill-opacity=".42"/>`;
}

function spriteSvg(width: number, height: number, body: string, accent: string, variant: string, mood: LocalAssetMood): string {
  const w = Math.max(8, Math.round(width));
  const h = Math.max(8, Math.round(height));
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const base = safeColor(body);
  const hi = safeColor(accent);
  const shadow = `<ellipse cx="${cx}" cy="${h - r * 0.22}" rx="${r * 0.72}" ry="${r * 0.18}" fill="#000" fill-opacity=".22"/>`;
  const defs = `<defs><filter id="s"><feDropShadow dx="0" dy="1.6" stdDeviation="1.4" flood-color="#000" flood-opacity=".42"/></filter><radialGradient id="body" cx="38%" cy="28%" r="74%"><stop offset="0" stop-color="${blendColor(base, '#ffffff', 0.34)}"/><stop offset=".58" stop-color="${base}"/><stop offset="1" stop-color="${blendColor(base, '#000000', 0.38)}"/></radialGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".44" stop-color="${hi}" stop-opacity=".4"/><stop offset="1" stop-color="#000" stop-opacity=".24"/></linearGradient></defs>`;
  const decal = moodDecal(cx, cy, r, mood, hi, variant);
  const shell = (content: string): string => svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-local-asset="sprite" data-mood="${mood}" data-variant="${variant}">${defs}${shadow}<g filter="url(#s)">${content}</g>${decal}</svg>`);

  if (variant.startsWith('flight-')) {
    const boss = variant === 'flight-boss';
    const scale = boss ? 1.1 : 1;
    return shell(`<g data-local-detail="${variant}" transform="scale(${scale} ${scale}) translate(${boss ? -r * 0.08 : 0} ${boss ? -r * 0.04 : 0})"><path d="M${r * 0.2} ${cy}C${r * 0.62} ${cy - r * 0.46} ${cx + r * 0.58} ${cy - r * 0.42} ${w - r * 0.12} ${cy}C${cx + r * 0.58} ${cy + r * 0.42} ${r * 0.62} ${cy + r * 0.46} ${r * 0.2} ${cy}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="${boss ? 2.2 : 1.7}"/><path d="M${cx - r * 0.12} ${cy - r * 0.08}L${cx - r * 0.68} ${r * 0.16}L${cx + r * 0.12} ${cy - r * 0.04}Z" fill="${hi}" fill-opacity=".78"/><path d="M${cx - r * 0.12} ${cy + r * 0.08}L${cx - r * 0.68} ${h - r * 0.16}L${cx + r * 0.12} ${cy + r * 0.04}Z" fill="${hi}" fill-opacity=".58"/><path d="M${r * 0.34} ${cy - r * 0.28}L${r * 0.12} ${cy - r * 0.5}M${r * 0.34} ${cy + r * 0.28}L${r * 0.12} ${cy + r * 0.5}" stroke="${hi}" stroke-opacity=".72" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="${cx + r * 0.38}" cy="${cy - r * 0.08}" rx="${r * 0.28}" ry="${r * 0.14}" fill="#fff" fill-opacity=".52"/><path d="M${w - r * 0.26} ${cy}L${w - r * 0.04} ${cy}" stroke="#fff" stroke-opacity=".62" stroke-width="1.4" stroke-linecap="round"/>${boss ? `<circle cx="${cx - r * 0.44}" cy="${cy}" r="${r * 0.18}" fill="${hi}" fill-opacity=".82"/><path d="M${cx - r * 0.68} ${cy - r * 0.32}H${cx - r * 0.16}M${cx - r * 0.68} ${cy + r * 0.32}H${cx - r * 0.16}" stroke="#fff" stroke-opacity=".32" stroke-width="1.1"/>` : ''}</g>`);
  }

  if (variant.startsWith('platform-')) {
    const boss = variant === 'platform-boss';
    const isPlayer = variant === 'platform-player';
    const leg = isPlayer ? r * 0.42 : r * 0.32;
    return shell(`<g data-local-detail="${variant}"><ellipse cx="${cx}" cy="${cy + r * 0.16}" rx="${r * (boss ? 0.78 : 0.58)}" ry="${r * (boss ? 0.66 : 0.5)}" fill="url(#body)" stroke="url(#rim)" stroke-width="${boss ? 2.3 : 1.7}"/><circle cx="${cx + r * 0.2}" cy="${cy - r * 0.42}" r="${r * (boss ? 0.34 : 0.26)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.4"/><path d="M${cx - r * 0.42} ${cy + r * 0.34}L${cx - leg} ${cy + r * 0.76}M${cx + r * 0.26} ${cy + r * 0.38}L${cx + leg} ${cy + r * 0.78}" stroke="${hi}" stroke-opacity=".72" stroke-width="${Math.max(1.6, r * 0.13)}" stroke-linecap="round"/><path d="M${cx - r * 0.36} ${cy}L${cx - r * 0.74} ${cy + r * 0.14}M${cx + r * 0.42} ${cy}L${cx + r * 0.78} ${cy - r * 0.18}" stroke="#fff" stroke-opacity=".32" stroke-width="1.3" stroke-linecap="round"/><circle cx="${cx + r * 0.3}" cy="${cy - r * 0.48}" r="${Math.max(1.5, r * 0.07)}" fill="#fff" fill-opacity=".72"/>${boss ? `<rect x="${cx - r * 0.5}" y="${cy - r * 0.08}" width="${r * 1.08}" height="${r * 0.3}" rx="${Math.max(2, r * 0.08)}" fill="${hi}" fill-opacity=".58"/><path d="M${cx - r * 0.78} ${cy - r * 0.32}H${cx + r * 0.72}M${cx - r * 0.78} ${cy + r * 0.46}H${cx + r * 0.72}" stroke="#fff" stroke-opacity=".24" stroke-width="1.1"/>` : ''}</g>`);
  }

  if (variant === 'bakery-chef') {
    return shell(`<g data-local-detail="bakery-chef"><ellipse cx="${cx}" cy="${cy + r * 0.16}" rx="${r * 0.52}" ry="${r * 0.58}" fill="#fff6df" stroke="#5b2f1f" stroke-opacity=".7" stroke-width="1.7"/><path d="M${cx - r * 0.44} ${cy - r * 0.06}H${cx + r * 0.44}V${cy + r * 0.5}Q${cx} ${cy + r * 0.68} ${cx - r * 0.44} ${cy + r * 0.5}Z" fill="#f8f1e6" stroke="${hi}" stroke-opacity=".7" stroke-width="1.4"/><circle cx="${cx}" cy="${cy - r * 0.36}" r="${r * 0.24}" fill="#f2be8d" stroke="#5b2f1f" stroke-opacity=".48" stroke-width="1.2"/><path d="M${cx - r * 0.46} ${cy - r * 0.54}C${cx - r * 0.44} ${cy - r * 0.88} ${cx - r * 0.18} ${cy - r * 0.82} ${cx - r * 0.08} ${cy - r * 0.64}C${cx + r * 0.04} ${cy - r * 0.9} ${cx + r * 0.38} ${cy - r * 0.82} ${cx + r * 0.34} ${cy - r * 0.52}Z" fill="#fffdf4" stroke="#5b2f1f" stroke-opacity=".36" stroke-width="1.1"/><circle cx="${cx - r * 0.08}" cy="${cy - r * 0.39}" r="${r * 0.035}" fill="#2b1a15"/><circle cx="${cx + r * 0.1}" cy="${cy - r * 0.39}" r="${r * 0.035}" fill="#2b1a15"/><path d="M${cx - r * 0.11} ${cy - r * 0.25}Q${cx} ${cy - r * 0.18} ${cx + r * 0.12} ${cy - r * 0.25}" fill="none" stroke="#2b1a15" stroke-opacity=".65" stroke-width="1" stroke-linecap="round"/><path d="M${cx - r * 0.42} ${cy + r * 0.02}L${cx - r * 0.82} ${cy + r * 0.16}M${cx + r * 0.38} ${cy + r * 0.02}L${cx + r * 0.72} ${cy - r * 0.22}M${cx - r * 0.2} ${cy + r * 0.62}L${cx - r * 0.36} ${cy + r * 0.86}M${cx + r * 0.22} ${cy + r * 0.62}L${cx + r * 0.38} ${cy + r * 0.86}" stroke="#5b2f1f" stroke-opacity=".78" stroke-width="${Math.max(1.5, r * 0.11)}" stroke-linecap="round"/><path d="M${cx + r * 0.26} ${cy + r * 0.16}L${cx + r * 0.86} ${cy - r * 0.36}" stroke="#c58b55" stroke-width="${Math.max(2, r * 0.12)}" stroke-linecap="round"/><circle cx="${cx + r * 0.9}" cy="${cy - r * 0.39}" r="${r * 0.09}" fill="#ffe08a" stroke="#5b2f1f" stroke-opacity=".32"/><path d="M${cx - r * 0.34} ${cy + r * 0.1}H${cx + r * 0.34}M${cx} ${cy - r * 0.02}V${cy + r * 0.46}" stroke="${hi}" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/></g>`);
  }

  if (variant === 'bakery-oven-boss') {
    return shell(`<g data-local-detail="bakery-oven-boss"><path d="M${cx - r * 0.78} ${cy + r * 0.62}V${cy - r * 0.22}Q${cx} ${cy - r * 0.92} ${cx + r * 0.78} ${cy - r * 0.22}V${cy + r * 0.62}Z" fill="#6a3425" stroke="#ffcf8a" stroke-opacity=".72" stroke-width="2.4"/><path d="M${cx - r * 0.52} ${cy + r * 0.24}V${cy - r * 0.12}Q${cx} ${cy - r * 0.54} ${cx + r * 0.52} ${cy - r * 0.12}V${cy + r * 0.24}Z" fill="#231019" stroke="${hi}" stroke-opacity=".85" stroke-width="1.9"/><circle cx="${cx}" cy="${cy + r * 0.02}" r="${r * 0.38}" fill="#c6427b" fill-opacity=".74"/><path d="M${cx - r * 0.2} ${cy + r * 0.08}A${r * 0.22} ${r * 0.22} 0 1 0 ${cx + r * 0.18} ${cy - r * 0.14}A${r * 0.16} ${r * 0.16} 0 1 1 ${cx - r * 0.2} ${cy + r * 0.08}Z" fill="#ffe1ff" fill-opacity=".82"/><circle cx="${cx - r * 0.28}" cy="${cy - r * 0.16}" r="${r * 0.07}" fill="#fff2b5"/><circle cx="${cx + r * 0.28}" cy="${cy - r * 0.16}" r="${r * 0.07}" fill="#fff2b5"/><path d="M${cx - r * 0.34} ${cy + r * 0.3}L${cx - r * 0.18} ${cy + r * 0.46}L${cx - r * 0.02} ${cy + r * 0.3}L${cx + r * 0.14} ${cy + r * 0.46}L${cx + r * 0.3} ${cy + r * 0.3}" fill="none" stroke="#fff8d8" stroke-opacity=".76" stroke-width="1.4"/><path d="M${cx - r * 0.86} ${cy - r * 0.08}L${cx - r * 1.02} ${cy - r * 0.38}M${cx + r * 0.86} ${cy - r * 0.08}L${cx + r * 1.02} ${cy - r * 0.38}" stroke="${hi}" stroke-opacity=".84" stroke-width="${Math.max(2, r * 0.1)}" stroke-linecap="round"/></g>`);
  }

  if (variant === 'bakery-macaron') {
    return shell(`<g data-local-detail="bakery-macaron"><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.78}" ry="${r * 0.54}" fill="#f2a6c8" stroke="#5b2f1f" stroke-opacity=".48" stroke-width="1.5"/><rect x="${cx - r * 0.58}" y="${cy - r * 0.04}" width="${r * 1.16}" height="${r * 0.18}" rx="${r * 0.09}" fill="#fff5d5" stroke="#5b2f1f" stroke-opacity=".18"/><path d="M${cx - r * 0.42} ${cy - r * 0.18}H${cx + r * 0.42}" stroke="#fff" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round"/><circle cx="${cx - r * 0.22}" cy="${cy + r * 0.12}" r="${r * 0.06}" fill="#5b2f1f"/><circle cx="${cx + r * 0.22}" cy="${cy + r * 0.12}" r="${r * 0.06}" fill="#5b2f1f"/><circle cx="${cx}" cy="${cy - r * 0.36}" r="${r * 0.08}" fill="${hi}" fill-opacity=".82"/><path d="M${cx + r * 0.42} ${cy - r * 0.04}L${cx + r * 0.82} ${cy - r * 0.28}" stroke="${hi}" stroke-width="${Math.max(1.8, r * 0.12)}" stroke-linecap="round"/></g>`);
  }

  if (variant === 'bakery-rolling-pin') {
    return shell(`<g data-local-detail="bakery-rolling-pin"><rect x="${cx - r * 0.7}" y="${cy - r * 0.24}" width="${r * 1.4}" height="${r * 0.48}" rx="${r * 0.22}" fill="#c98b52" stroke="#5b2f1f" stroke-opacity=".5" stroke-width="1.6" transform="rotate(${variant.length} ${cx} ${cy})"/><rect x="${cx - r * 1.02}" y="${cy - r * 0.11}" width="${r * 0.32}" height="${r * 0.22}" rx="${r * 0.1}" fill="#8f5932" transform="rotate(${variant.length} ${cx} ${cy})"/><rect x="${cx + r * 0.7}" y="${cy - r * 0.11}" width="${r * 0.32}" height="${r * 0.22}" rx="${r * 0.1}" fill="#8f5932" transform="rotate(${variant.length} ${cx} ${cy})"/><path d="M${cx - r * 0.34} ${cy - r * 0.12}H${cx + r * 0.34}M${cx - r * 0.38} ${cy + r * 0.1}H${cx + r * 0.28}" stroke="#fff7d8" stroke-opacity=".38" stroke-width="1.2" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="${hi}" fill-opacity=".55"/></g>`);
  }

  if (variant === 'bakery-proofling') {
    return shell(`<g data-local-detail="bakery-proofling"><path d="M${cx - r * 0.64} ${cy + r * 0.2}C${cx - r * 0.5} ${cy - r * 0.54} ${cx + r * 0.46} ${cy - r * 0.66} ${cx + r * 0.66} ${cy + r * 0.08}C${cx + r * 0.34} ${cy + r * 0.64} ${cx - r * 0.32} ${cy + r * 0.68} ${cx - r * 0.64} ${cy + r * 0.2}Z" fill="#e8bf86" stroke="#5b2f1f" stroke-opacity=".5" stroke-width="1.5"/><path d="M${cx - r * 0.36} ${cy - r * 0.26}C${cx - r * 0.12} ${cy - r * 0.46} ${cx + r * 0.2} ${cy - r * 0.42} ${cx + r * 0.42} ${cy - r * 0.18}" fill="none" stroke="#fff6d8" stroke-opacity=".48" stroke-width="1.4" stroke-linecap="round"/><circle cx="${cx - r * 0.18}" cy="${cy + r * 0.02}" r="${r * 0.08}" fill="#5b2f1f"/><circle cx="${cx + r * 0.18}" cy="${cy}" r="${r * 0.08}" fill="#5b2f1f"/><path d="M${cx + r * 0.24} ${cy + r * 0.26}L${cx + r * 0.78} ${cy + r * 0.52}" stroke="${hi}" stroke-opacity=".78" stroke-width="${Math.max(1.7, r * 0.1)}" stroke-linecap="round"/></g>`);
  }

  if (variant === 'player') {
    return shell(`<g data-local-detail="player-character"><ellipse cx="${cx}" cy="${cy + r * 0.1}" rx="${r * 0.52}" ry="${r * 0.62}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.8"/><circle cx="${cx}" cy="${cy - r * 0.5}" r="${r * 0.26}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.3"/><path d="M${cx - r * 0.28} ${cy - r * 0.04}L${cx - r * 0.74} ${cy + r * 0.12}M${cx + r * 0.28} ${cy - r * 0.04}L${cx + r * 0.74} ${cy + r * 0.12}M${cx - r * 0.24} ${cy + r * 0.52}L${cx - r * 0.44} ${cy + r * 0.86}M${cx + r * 0.24} ${cy + r * 0.52}L${cx + r * 0.44} ${cy + r * 0.86}" stroke="${hi}" stroke-opacity=".82" stroke-width="${Math.max(1.6, r * 0.12)}" stroke-linecap="round"/><path d="M${cx - r * 0.32} ${cy - r * 0.18}H${cx + r * 0.32}M${cx} ${cy - r * 0.26}V${cy + r * 0.42}" stroke="#fff" stroke-opacity=".38" stroke-width="1.4" stroke-linecap="round"/><circle cx="${cx + r * 0.08}" cy="${cy - r * 0.56}" r="${Math.max(1.6, r * 0.07)}" fill="#fff" fill-opacity=".72"/><path d="M${cx - r * 0.44} ${cy + r * 0.72}C${cx - r * 0.18} ${cy + r * 0.9} ${cx + r * 0.18} ${cy + r * 0.9} ${cx + r * 0.44} ${cy + r * 0.72}" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="1.2"/></g>`);
  }

  if (variant === 'escort') {
    return shell(`<g data-local-detail="escort"><rect x="${cx - r * 0.72}" y="${cy - r * 0.36}" width="${r * 1.44}" height="${r * 0.78}" rx="${Math.max(3, r * 0.14)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.9"/><path d="M${cx - r * 0.56} ${cy - r * 0.34}Q${cx} ${cy - r * 0.82} ${cx + r * 0.56} ${cy - r * 0.34}" fill="${hi}" fill-opacity=".68" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/><circle cx="${cx - r * 0.42}" cy="${cy + r * 0.44}" r="${Math.max(2.4, r * 0.18)}" fill="#161b22" stroke="${hi}" stroke-opacity=".74" stroke-width="1.2"/><circle cx="${cx + r * 0.42}" cy="${cy + r * 0.44}" r="${Math.max(2.4, r * 0.18)}" fill="#161b22" stroke="${hi}" stroke-opacity=".74" stroke-width="1.2"/><circle cx="${cx}" cy="${cy - r * 0.06}" r="${Math.max(2.6, r * 0.17)}" fill="#fff" fill-opacity=".78"/><path d="M${cx - r * 0.7} ${cy + r * 0.08}H${cx + r * 0.7}M${cx - r * 0.48} ${cy - r * 0.1}H${cx + r * 0.48}" stroke="#fff" stroke-opacity=".32" stroke-width="1.1" stroke-linecap="round"/></g>`);
  }

  if (variant === 'rescue') {
    const detail = `<circle cx="${cx + r * 0.42}" cy="${cy - r * 0.45}" r="${Math.max(2.2, r * 0.16)}" fill="${hi}" fill-opacity=".78"/><path d="M${cx + r * 0.42} ${cy - r * 0.7}V${cy - r * 0.2}M${cx + r * 0.18} ${cy - r * 0.45}H${cx + r * 0.66}" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" stroke-linecap="round"/>`;
    return shell(`<g data-local-detail="rescue"><path d="M${cx} ${r * 0.2}L${w - r * 0.25} ${cy + r * 0.12}L${cx + r * 0.32} ${h - r * 0.22}H${cx - r * 0.32}L${r * 0.25} ${cy + r * 0.12}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.7"/><rect x="${cx - r * 0.34}" y="${cy - r * 0.32}" width="${r * 0.68}" height="${r * 0.72}" rx="${Math.max(2, r * 0.12)}" fill="#000" fill-opacity=".16" stroke="${hi}" stroke-opacity=".72" stroke-width="1.2"/><path d="M${cx} ${cy - r * 0.45}V${cy + r * 0.5}M${cx - r * 0.46} ${cy + r * 0.02}H${cx + r * 0.46}" stroke="${hi}" stroke-opacity=".9" stroke-width="2" stroke-linecap="round"/>${detail}<path d="M${cx - r * 0.64} ${h - r * 0.3}C${cx - r * 0.28} ${h - r * 0.12} ${cx + r * 0.28} ${h - r * 0.12} ${cx + r * 0.64} ${h - r * 0.3}" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="1.2" stroke-linecap="round"/></g>`);
  }

  if (variant === 'defend-core') {
    return shell(`<g data-local-detail="defend-core"><rect x="${cx - r * 0.58}" y="${cy - r * 0.58}" width="${r * 1.16}" height="${r * 1.16}" rx="${Math.max(3, r * 0.16)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.9" transform="rotate(45 ${cx} ${cy})"/><circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#000" fill-opacity=".14" stroke="${hi}" stroke-opacity=".86" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r * 0.23}" fill="${hi}" fill-opacity=".84"/><path d="M${cx} ${cy - r * 0.72}V${cy - r * 0.46}M${cx} ${cy + r * 0.46}V${cy + r * 0.72}M${cx - r * 0.72} ${cy}H${cx - r * 0.46}M${cx + r * 0.46} ${cy}H${cx + r * 0.72}" stroke="#fff" stroke-opacity=".34" stroke-width="1.4" stroke-linecap="round"/><path d="M${cx - r * 0.38} ${cy - r * 0.38}L${cx + r * 0.38} ${cy + r * 0.38}M${cx + r * 0.38} ${cy - r * 0.38}L${cx - r * 0.38} ${cy + r * 0.38}" stroke="#fff" stroke-opacity=".18" stroke-width="1"/><path d="M${cx - r * 0.72} ${cy - r * 0.72}L${cx - r * 0.42} ${cy - r * 0.72}M${cx + r * 0.42} ${cy - r * 0.72}L${cx + r * 0.72} ${cy - r * 0.72}M${cx - r * 0.72} ${cy + r * 0.72}L${cx - r * 0.42} ${cy + r * 0.72}M${cx + r * 0.42} ${cy + r * 0.72}L${cx + r * 0.72} ${cy + r * 0.72}" stroke="${hi}" stroke-opacity=".62" stroke-width="1.3" stroke-linecap="round"/></g>`);
  }

  if (variant === 'coast-boss') {
    return shell(`<g data-local-detail="coastal-beast-boss"><path d="M${cx - r * 0.78} ${cy - r * 0.18}L${cx - r * 0.32} ${cy - r * 0.58}L${cx - r * 0.12} ${cy - r * 0.18}M${cx + r * 0.78} ${cy - r * 0.18}L${cx + r * 0.32} ${cy - r * 0.58}L${cx + r * 0.12} ${cy - r * 0.18}" fill="${hi}" fill-opacity=".82" stroke="#fff" stroke-opacity=".28" stroke-width="1.3"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.86}" ry="${r * 0.68}" fill="url(#body)" stroke="url(#rim)" stroke-width="2.4"/><path d="M${cx - r * 0.64} ${cy + r * 0.04}C${cx - r * 0.36} ${cy + r * 0.44} ${cx + r * 0.36} ${cy + r * 0.44} ${cx + r * 0.64} ${cy + r * 0.04}C${cx + r * 0.34} ${cy + r * 0.2} ${cx - r * 0.34} ${cy + r * 0.2} ${cx - r * 0.64} ${cy + r * 0.04}Z" fill="#05070b" fill-opacity=".72" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/><path d="M${cx - r * 0.42} ${cy + r * 0.12}L${cx - r * 0.28} ${cy + r * 0.34}L${cx - r * 0.14} ${cy + r * 0.12}M${cx + r * 0.14} ${cy + r * 0.12}L${cx + r * 0.28} ${cy + r * 0.34}L${cx + r * 0.42} ${cy + r * 0.12}" fill="#fff" fill-opacity=".8"/><circle cx="${cx - r * 0.28}" cy="${cy - r * 0.18}" r="${Math.max(2, r * 0.09)}" fill="${hi}"/><circle cx="${cx + r * 0.28}" cy="${cy - r * 0.18}" r="${Math.max(2, r * 0.09)}" fill="${hi}"/><path d="M${cx - r * 0.9} ${cy + r * 0.42}L${cx - r * 0.56} ${cy + r * 0.18}M${cx + r * 0.9} ${cy + r * 0.42}L${cx + r * 0.56} ${cy + r * 0.18}" stroke="${hi}" stroke-opacity=".86" stroke-width="${Math.max(2, r * 0.12)}" stroke-linecap="round"/></g>`);
  }

  if (variant === 'boss') {
    return shell(`<circle cx="${cx}" cy="${cy}" r="${r * 0.84}" fill="url(#body)" stroke="url(#rim)" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="${r * 0.56}" fill="#000" fill-opacity=".16" stroke="${hi}" stroke-opacity=".88" stroke-width="2"/><path d="M${cx} ${r * 0.16} L${w - r * 0.26} ${h - r * 0.45} L${r * 0.26} ${h - r * 0.45} Z" fill="${hi}" fill-opacity=".72"/><path d="M${cx - r * 0.66} ${cy}Q${cx} ${cy - r * 0.72} ${cx + r * 0.66} ${cy}" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="${r * 0.15}" fill="#fff" fill-opacity=".6"/>`);
  }

  if (variant === 'chaser' || variant === 'charger') {
    return shell(`<path d="M${cx} ${r * 0.22} L${w - r * 0.22} ${cy} L${cx} ${h - r * 0.22} L${r * 0.22} ${cy} Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.7"/><path d="M${cx} ${r * 0.44} L${w - r * 0.56} ${cy} L${cx} ${h - r * 0.44} L${r * 0.56} ${cy} Z" fill="${hi}" fill-opacity=".66"/><path d="M${cx - r * 0.4} ${cy}H${cx + r * 0.4}" stroke="#fff" stroke-opacity=".24" stroke-width="1.2"/>`);
  }

  if (variant === 'shooter') {
    return shell(`<rect x="${r * 0.3}" y="${r * 0.42}" width="${w - r * 0.6}" height="${h - r * 0.6}" rx="${Math.max(3, r * 0.22)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><rect x="${cx - r * 0.16}" y="${r * 0.1}" width="${r * 0.32}" height="${r * 0.94}" rx="1.5" fill="${hi}" fill-opacity=".84"/><rect x="${cx - r * 0.44}" y="${cy + r * 0.24}" width="${r * 0.88}" height="${r * 0.18}" rx="1" fill="#000" fill-opacity=".18"/><circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#fff" fill-opacity=".54"/>`);
  }

  if (variant === 'sniper') {
    return shell(`<g data-local-detail="sniper"><rect x="${r * 0.34}" y="${r * 0.48}" width="${w - r * 0.68}" height="${h - r * 0.78}" rx="${Math.max(3, r * 0.18)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><path d="M${cx} ${r * 0.14}V${cy + r * 0.28}" stroke="${hi}" stroke-opacity=".92" stroke-width="${Math.max(2, r * 0.18)}" stroke-linecap="round"/><path d="M${cx - r * 0.48} ${cy + r * 0.2}H${cx + r * 0.48}" stroke="#000" stroke-opacity=".26" stroke-width="${Math.max(2, r * 0.12)}" stroke-linecap="round"/><path d="M${cx - r * 0.52} ${cy - r * 0.28}L${cx + r * 0.52} ${cy + r * 0.42}" stroke="#fff" stroke-opacity=".3" stroke-width="1.1" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#fff" fill-opacity=".56"/><circle cx="${cx}" cy="${r * 0.28}" r="${r * 0.12}" fill="${hi}" fill-opacity=".8"/></g>`);
  }

  if (variant === 'sapper') {
    return shell(`<g data-local-detail="sapper"><path d="M${cx} ${r * 0.2}L${w - r * 0.28} ${cy + r * 0.18}L${cx + r * 0.28} ${h - r * 0.22}H${cx - r * 0.28}L${r * 0.28} ${cy + r * 0.18}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.6"/><rect x="${cx - r * 0.45}" y="${cy - r * 0.2}" width="${r * 0.9}" height="${r * 0.5}" rx="${Math.max(2, r * 0.12)}" fill="#000" fill-opacity=".22" stroke="${hi}" stroke-opacity=".78" stroke-width="1.2"/><circle cx="${cx + r * 0.48}" cy="${cy + r * 0.34}" r="${r * 0.2}" fill="${hi}" fill-opacity=".86"/><circle cx="${cx + r * 0.48}" cy="${cy + r * 0.34}" r="${r * 0.34}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.1"/><path d="M${cx - r * 0.42} ${cy - r * 0.38}L${cx + r * 0.18} ${cy + r * 0.1}" stroke="#fff" stroke-opacity=".28" stroke-width="1.2" stroke-linecap="round"/></g>`);
  }

  if (variant === 'support') {
    return shell(`<g data-local-detail="support"><circle cx="${cx}" cy="${cy}" r="${r * 0.68}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="none" stroke="${hi}" stroke-opacity=".9" stroke-width="2"/><path d="M${cx} ${cy - r * 0.44}V${cy + r * 0.44}M${cx - r * 0.44} ${cy}H${cx + r * 0.44}" stroke="#fff" stroke-opacity=".56" stroke-width="${Math.max(2, r * 0.15)}" stroke-linecap="round"/><circle cx="${cx + r * 0.52}" cy="${cy - r * 0.38}" r="${r * 0.14}" fill="${hi}" fill-opacity=".86"/><circle cx="${cx - r * 0.52}" cy="${cy + r * 0.38}" r="${r * 0.12}" fill="#fff" fill-opacity=".54"/><path d="M${cx - r * 0.7} ${cy - r * 0.1}Q${cx} ${cy - r * 0.64} ${cx + r * 0.7} ${cy - r * 0.1}" fill="none" stroke="${hi}" stroke-opacity=".36" stroke-width="1.3" stroke-linecap="round"/></g>`);
  }

  if (variant === 'guardian') {
    return shell(`<g data-local-detail="guardian"><path d="M${cx} ${r * 0.16}L${w - r * 0.3} ${cy - r * 0.08}Q${cx + r * 0.42} ${h - r * 0.28} ${cx} ${h - r * 0.14}Q${cx - r * 0.42} ${h - r * 0.28} ${r * 0.3} ${cy - r * 0.08}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.8"/><path d="M${cx} ${r * 0.36}L${cx + r * 0.46} ${cy - r * 0.02}Q${cx + r * 0.24} ${cy + r * 0.5} ${cx} ${cy + r * 0.66}Q${cx - r * 0.24} ${cy + r * 0.5} ${cx - r * 0.46} ${cy - r * 0.02}Z" fill="${hi}" fill-opacity=".62"/><path d="M${cx - r * 0.72} ${cy + r * 0.06}Q${cx} ${cy - r * 0.64} ${cx + r * 0.72} ${cy + r * 0.06}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy + r * 0.14}" r="${r * 0.18}" fill="#fff" fill-opacity=".44"/><circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="none" stroke="${hi}" stroke-opacity=".42" stroke-width="1.2"/></g>`);
  }

  if (variant === 'sentinel') {
    return shell(`<g data-local-detail="sentinel"><rect x="${cx - r * 0.58}" y="${cy - r * 0.58}" width="${r * 1.16}" height="${r * 1.16}" rx="${Math.max(3, r * 0.18)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.7" transform="rotate(45 ${cx} ${cy})"/><circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="#000" fill-opacity=".18" stroke="${hi}" stroke-opacity=".78" stroke-width="1.8"/><path d="M${cx} ${r * 0.14}V${cy - r * 0.1}M${cx} ${cy + r * 0.1}V${h - r * 0.24}M${r * 0.18} ${cy}H${cx - r * 0.1}M${cx + r * 0.1} ${cy}H${w - r * 0.18}" stroke="${hi}" stroke-opacity=".86" stroke-width="${Math.max(2, r * 0.14)}" stroke-linecap="round"/><path d="M${cx - r * 0.66} ${cy - r * 0.66}L${cx - r * 0.28} ${cy - r * 0.28}M${cx + r * 0.66} ${cy - r * 0.66}L${cx + r * 0.28} ${cy - r * 0.28}M${cx - r * 0.66} ${cy + r * 0.66}L${cx - r * 0.28} ${cy + r * 0.28}M${cx + r * 0.66} ${cy + r * 0.66}L${cx + r * 0.28} ${cy + r * 0.28}" stroke="#fff" stroke-opacity=".26" stroke-width="1.2" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="#fff" fill-opacity=".56"/></g>`);
  }

  if (variant === 'orbiter') {
    return shell(`<circle cx="${cx}" cy="${cy}" r="${r * 0.74}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${r * 0.44}" fill="none" stroke="${hi}" stroke-opacity=".9" stroke-width="2"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.82}" ry="${r * 0.3}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/><circle cx="${cx + r * 0.5}" cy="${cy - r * 0.36}" r="${r * 0.16}" fill="#fff" fill-opacity=".64"/><circle cx="${cx - r * 0.48}" cy="${cy + r * 0.36}" r="${r * 0.13}" fill="#fff" fill-opacity=".5"/>`);
  }

  if (variant === 'wanderer') {
    return shell(`<path d="M${cx - r * 0.72} ${cy - r * 0.08}C${cx - r * 0.52} ${cy - r * 0.7} ${cx + r * 0.4} ${cy - r * 0.72} ${cx + r * 0.66} ${cy - r * 0.08}C${cx + r * 0.78} ${cy + r * 0.48} ${cx - r * 0.42} ${cy + r * 0.84} ${cx - r * 0.72} ${cy - r * 0.08}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><circle cx="${cx - r * 0.22}" cy="${cy - r * 0.14}" r="${r * 0.25}" fill="#fff" fill-opacity=".24"/><circle cx="${cx + r * 0.28}" cy="${cy + r * 0.04}" r="${r * 0.2}" fill="${hi}" fill-opacity=".56"/><circle cx="${cx}" cy="${cy + r * 0.34}" r="${r * 0.16}" fill="#fff" fill-opacity=".3"/>`);
  }

  return shell(`<circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><rect x="${cx - r * 0.42}" y="${cy - r * 0.12}" width="${r * 0.84}" height="${r * 0.24}" rx="1" fill="${hi}" fill-opacity=".58"/><circle cx="${cx + r * 0.28}" cy="${cy - r * 0.28}" r="${r * 0.13}" fill="#fff" fill-opacity=".34"/>`);
}

function spriteSheetSvg(width: number, height: number, frameWidth: number, frameHeight: number, frames: number, body: string, accent: string, variant: string, mood: LocalAssetMood, animations: readonly SpriteSheetAnimation[] = []): string {
  const fw = Math.max(8, Math.round(frameWidth));
  const fh = Math.max(8, Math.round(frameHeight));
  const count = Math.max(2, Math.min(12, Math.round(frames)));
  const w = Math.max(Math.round(width), fw * count);
  const h = Math.max(Math.round(height), fh);
  const cx = fw / 2;
  const cy = fh / 2;
  const r = Math.min(fw, fh) / 2;
  const base = safeColor(body);
  const hi = safeColor(accent);
  const defs = `<defs><filter id="s"><feDropShadow dx="0" dy="1.4" stdDeviation="1.2" flood-color="#000" flood-opacity=".38"/></filter><radialGradient id="body" cx="38%" cy="28%" r="74%"><stop offset="0" stop-color="${blendColor(base, '#ffffff', 0.34)}"/><stop offset=".58" stop-color="${base}"/><stop offset="1" stop-color="${blendColor(base, '#000000', 0.38)}"/></radialGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".44" stop-color="${hi}" stop-opacity=".4"/><stop offset="1" stop-color="#000" stop-opacity=".24"/></linearGradient></defs>`;
  const frameMarks = ['idle-a', 'idle-b', 'move-a', 'move-b', 'move-c', 'attack', 'telegraph', 'hurt'];
  const variantCore = (frame: number): string => {
    const step = [0, 1, 0, -1][frame % 4] ?? 0;
    const pulse = 1 + (frame === 2 ? 0.08 : frame === 0 ? 0 : -0.03);
    const lean = step * r * 0.08;
    const shadow = `<ellipse cx="${cx}" cy="${fh - r * 0.22}" rx="${r * (0.66 + Math.abs(step) * 0.04)}" ry="${r * 0.16}" fill="#000" fill-opacity=".2"/>`;
    const limbs = `<path d="M${cx - r * 0.32} ${cy + r * 0.36}L${cx - r * (0.54 + step * 0.08)} ${cy + r * 0.76}M${cx + r * 0.32} ${cy + r * 0.36}L${cx + r * (0.54 - step * 0.08)} ${cy + r * 0.76}" stroke="#fff" stroke-opacity=".25" stroke-width="1.2" stroke-linecap="round"/><path d="M${cx - r * 0.42} ${cy - r * 0.12}L${cx - r * (0.78 - step * 0.08)} ${cy + r * 0.06}M${cx + r * 0.42} ${cy - r * 0.12}L${cx + r * (0.78 + step * 0.08)} ${cy + r * 0.06}" stroke="${hi}" stroke-opacity=".48" stroke-width="1.4" stroke-linecap="round"/>`;
    if (variant.startsWith('flight-')) {
      const boss = variant === 'flight-boss';
      const bank = step * 4;
      const thrust = frame >= 5 ? 0.92 : 0.52 + Math.abs(step) * 0.12;
      return `${shadow}<g filter="url(#s)" transform="rotate(${bank} ${cx} ${cy})" data-local-detail="${variant}"><path d="M${r * 0.18} ${cy}C${r * 0.62} ${cy - r * (0.42 + Math.abs(step) * 0.04)} ${cx + r * 0.56} ${cy - r * 0.4} ${fw - r * 0.1} ${cy}C${cx + r * 0.56} ${cy + r * 0.4} ${r * 0.62} ${cy + r * (0.42 + Math.abs(step) * 0.04)} ${r * 0.18} ${cy}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="${boss ? 2.2 : 1.7}"/><path d="M${cx - r * 0.1 + lean} ${cy - r * 0.07}L${cx - r * 0.72} ${r * 0.14}L${cx + r * 0.16} ${cy - r * 0.04}Z" fill="${hi}" fill-opacity=".8"/><path d="M${cx - r * 0.1 - lean} ${cy + r * 0.07}L${cx - r * 0.72} ${fh - r * 0.14}L${cx + r * 0.16} ${cy + r * 0.04}Z" fill="${hi}" fill-opacity=".58"/><path d="M${r * 0.34} ${cy - r * 0.3}L${r * 0.1} ${cy - r * 0.52}M${r * 0.34} ${cy + r * 0.3}L${r * 0.1} ${cy + r * 0.52}" stroke="${hi}" stroke-opacity=".72" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="${cx + r * 0.38}" cy="${cy - r * 0.08 + step * 0.25}" rx="${r * 0.26}" ry="${r * 0.13}" fill="#fff" fill-opacity=".52"/><path d="M${r * 0.1} ${cy}H${r * (0.1 - thrust)}" stroke="${hi}" stroke-opacity=".78" stroke-width="${Math.max(1.4, r * 0.12)}" stroke-linecap="round"/>${boss ? `<circle cx="${cx - r * 0.42}" cy="${cy}" r="${r * (0.15 + frame * 0.015)}" fill="${hi}" fill-opacity=".82"/><path d="M${cx - r * 0.72} ${cy - r * 0.32}H${cx - r * 0.12}M${cx - r * 0.72} ${cy + r * 0.32}H${cx - r * 0.12}" stroke="#fff" stroke-opacity=".32" stroke-width="1.1"/>` : ''}</g>`;
    }
    if (variant.startsWith('platform-')) {
      const boss = variant === 'platform-boss';
      const jump = frame === 5 || frame === 6;
      const squash = jump ? 0.92 : 1 + Math.abs(step) * 0.02;
      const stride = step * r * 0.22;
      const headX = cx + r * 0.22 + lean;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.28} ${jump ? -r * 0.12 : 0}) scale(1 ${squash})" data-local-detail="${variant}"><ellipse cx="${cx}" cy="${cy + r * 0.14}" rx="${r * (boss ? 0.78 : 0.56)}" ry="${r * (boss ? 0.64 : 0.48)}" fill="url(#body)" stroke="url(#rim)" stroke-width="${boss ? 2.3 : 1.7}"/><circle cx="${headX}" cy="${cy - r * 0.42}" r="${r * (boss ? 0.33 : 0.25)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.3"/><path d="M${cx - r * 0.28} ${cy + r * 0.34}L${cx - r * 0.48 - stride} ${cy + r * 0.8}M${cx + r * 0.26} ${cy + r * 0.34}L${cx + r * 0.44 + stride} ${cy + r * 0.8}" stroke="${hi}" stroke-opacity=".76" stroke-width="${Math.max(1.4, r * 0.13)}" stroke-linecap="round"/><path d="M${cx - r * 0.34} ${cy}L${cx - r * 0.72 + stride * 0.32} ${cy + r * 0.12}M${cx + r * 0.38} ${cy - r * 0.02}L${cx + r * 0.75 - stride * 0.18} ${cy - r * 0.18}" stroke="#fff" stroke-opacity=".32" stroke-width="1.3" stroke-linecap="round"/><circle cx="${headX + r * 0.08}" cy="${cy - r * 0.48}" r="${Math.max(1.3, r * 0.07)}" fill="#fff" fill-opacity=".7"/>${boss ? `<rect x="${cx - r * 0.48}" y="${cy - r * 0.08}" width="${r * 1.06}" height="${r * 0.28}" rx="${Math.max(2, r * 0.08)}" fill="${hi}" fill-opacity=".58"/><path d="M${cx - r * 0.74} ${cy + r * 0.48}H${cx + r * 0.72}" stroke="#fff" stroke-opacity=".24" stroke-width="1.1"/>` : ''}</g>`;
    }
    if (variant === 'bakery-chef') {
      const stride = step * r * 0.14;
      const attack = frame >= 5 ? 1 : 0;
      const hatLift = frame === 2 ? -r * 0.04 : 0;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.18} 0)" data-local-detail="bakery-chef"><ellipse cx="${cx}" cy="${cy + r * 0.16}" rx="${r * (0.5 + Math.abs(step) * 0.02)}" ry="${r * 0.58 * pulse}" fill="#fff6df" stroke="#5b2f1f" stroke-opacity=".72" stroke-width="1.7"/><path d="M${cx - r * 0.42} ${cy - r * 0.05}H${cx + r * 0.42}V${cy + r * 0.5}Q${cx} ${cy + r * 0.68} ${cx - r * 0.42} ${cy + r * 0.5}Z" fill="#f8f1e6" stroke="${hi}" stroke-opacity=".72" stroke-width="1.3"/><circle cx="${cx + lean * 0.18}" cy="${cy - r * 0.36}" r="${r * 0.24}" fill="#f2be8d" stroke="#5b2f1f" stroke-opacity=".48" stroke-width="1.1"/><path d="M${cx - r * 0.46 + lean * 0.12} ${cy - r * 0.54 + hatLift}C${cx - r * 0.44} ${cy - r * 0.88 + hatLift} ${cx - r * 0.18} ${cy - r * 0.82 + hatLift} ${cx - r * 0.08} ${cy - r * 0.64 + hatLift}C${cx + r * 0.04} ${cy - r * 0.9 + hatLift} ${cx + r * 0.38} ${cy - r * 0.82 + hatLift} ${cx + r * 0.34} ${cy - r * 0.52 + hatLift}Z" fill="#fffdf4" stroke="#5b2f1f" stroke-opacity=".34" stroke-width="1"/><circle cx="${cx - r * 0.08 + lean * 0.16}" cy="${cy - r * 0.39}" r="${Math.max(1.1, r * 0.035)}" fill="#2b1a15"/><circle cx="${cx + r * 0.1 + lean * 0.16}" cy="${cy - r * 0.39}" r="${Math.max(1.1, r * 0.035)}" fill="#2b1a15"/><path d="M${cx - r * 0.1} ${cy - r * 0.25}Q${cx} ${cy - r * 0.18} ${cx + r * 0.12} ${cy - r * 0.25}" fill="none" stroke="#2b1a15" stroke-opacity=".62" stroke-width="1" stroke-linecap="round"/><path d="M${cx - r * 0.38} ${cy + r * 0.02}L${cx - r * 0.78 + stride} ${cy + r * 0.18}M${cx + r * 0.36} ${cy + r * 0.02}L${cx + r * (0.72 + attack * 0.16)} ${cy - r * (0.22 + attack * 0.14)}M${cx - r * 0.2} ${cy + r * 0.62}L${cx - r * 0.36 - stride} ${cy + r * 0.86}M${cx + r * 0.22} ${cy + r * 0.62}L${cx + r * 0.38 - stride} ${cy + r * 0.86}" stroke="#5b2f1f" stroke-opacity=".8" stroke-width="${Math.max(1.5, r * 0.11)}" stroke-linecap="round"/><path d="M${cx + r * 0.22} ${cy + r * 0.16}L${cx + r * (0.88 + attack * 0.12)} ${cy - r * (0.34 + attack * 0.08)}" stroke="#c58b55" stroke-width="${Math.max(2, r * 0.12)}" stroke-linecap="round"/><circle cx="${cx + r * (0.9 + attack * 0.12)}" cy="${cy - r * (0.38 + attack * 0.08)}" r="${r * 0.09}" fill="#ffe08a" stroke="#5b2f1f" stroke-opacity=".32"/><path d="M${cx - r * 0.32} ${cy + r * 0.1}H${cx + r * 0.32}M${cx} ${cy - r * 0.02}V${cy + r * 0.46}" stroke="${hi}" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round"/></g>`;
    }
    if (variant === 'bakery-oven-boss') {
      const charge = frame >= 5 ? 1 : frame / 7;
      const portal = r * (0.36 + charge * 0.09);
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.12} 0)" data-local-detail="bakery-oven-boss"><path d="M${cx - r * 0.78} ${cy + r * 0.62}V${cy - r * 0.22}Q${cx} ${cy - r * (0.92 + charge * 0.08)} ${cx + r * 0.78} ${cy - r * 0.22}V${cy + r * 0.62}Z" fill="#6a3425" stroke="#ffcf8a" stroke-opacity=".76" stroke-width="2.4"/><path d="M${cx - r * 0.52} ${cy + r * 0.24}V${cy - r * 0.12}Q${cx} ${cy - r * 0.54} ${cx + r * 0.52} ${cy - r * 0.12}V${cy + r * 0.24}Z" fill="#231019" stroke="${hi}" stroke-opacity=".88" stroke-width="1.9"/><circle cx="${cx}" cy="${cy + r * 0.02}" r="${portal}" fill="#c6427b" fill-opacity=".76"/><path d="M${cx - r * (0.18 + charge * 0.05)} ${cy + r * 0.08}A${r * 0.22} ${r * 0.22} 0 1 0 ${cx + r * 0.18} ${cy - r * 0.14}A${r * 0.16} ${r * 0.16} 0 1 1 ${cx - r * (0.18 + charge * 0.05)} ${cy + r * 0.08}Z" fill="#ffe1ff" fill-opacity=".84"/><circle cx="${cx - r * 0.28}" cy="${cy - r * 0.16}" r="${r * (0.07 + charge * 0.02)}" fill="#fff2b5"/><circle cx="${cx + r * 0.28}" cy="${cy - r * 0.16}" r="${r * (0.07 + charge * 0.02)}" fill="#fff2b5"/><path d="M${cx - r * 0.34} ${cy + r * 0.3}L${cx - r * 0.18} ${cy + r * (0.46 + charge * 0.06)}L${cx - r * 0.02} ${cy + r * 0.3}L${cx + r * 0.14} ${cy + r * (0.46 + charge * 0.06)}L${cx + r * 0.3} ${cy + r * 0.3}" fill="none" stroke="#fff8d8" stroke-opacity=".78" stroke-width="1.4"/><path d="M${cx - r * 0.86} ${cy - r * 0.08}L${cx - r * 1.02} ${cy - r * (0.38 + charge * 0.06)}M${cx + r * 0.86} ${cy - r * 0.08}L${cx + r * 1.02} ${cy - r * (0.38 + charge * 0.06)}" stroke="${hi}" stroke-opacity=".86" stroke-width="${Math.max(2, r * 0.1)}" stroke-linecap="round"/></g>`;
    }
    if (variant === 'bakery-macaron') {
      const ready = frame >= 5 ? 1 : frame / 7;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.22} ${Math.abs(step) * r * 0.03})" data-local-detail="bakery-macaron"><ellipse cx="${cx}" cy="${cy}" rx="${r * (0.72 + ready * 0.06)}" ry="${r * 0.52}" fill="#f2a6c8" stroke="#5b2f1f" stroke-opacity=".5" stroke-width="1.5"/><rect x="${cx - r * 0.56}" y="${cy - r * 0.04}" width="${r * 1.12}" height="${r * 0.18}" rx="${r * 0.09}" fill="#fff5d5" stroke="#5b2f1f" stroke-opacity=".18"/><path d="M${cx - r * 0.42} ${cy - r * 0.18}H${cx + r * 0.42}" stroke="#fff" stroke-opacity=".42" stroke-width="1.1" stroke-linecap="round"/><circle cx="${cx - r * 0.22}" cy="${cy + r * 0.12}" r="${r * 0.06}" fill="#5b2f1f"/><circle cx="${cx + r * 0.22}" cy="${cy + r * 0.12}" r="${r * 0.06}" fill="#5b2f1f"/><circle cx="${cx}" cy="${cy - r * 0.36}" r="${r * (0.07 + ready * 0.04)}" fill="${hi}" fill-opacity=".84"/><path d="M${cx + r * 0.42} ${cy - r * 0.04}L${cx + r * (0.82 + ready * 0.16)} ${cy - r * 0.28}" stroke="${hi}" stroke-width="${Math.max(1.8, r * 0.12)}" stroke-linecap="round"/></g>`;
    }
    if (variant === 'bakery-rolling-pin') {
      const spin = step * 7 + frame * 4;
      return `${shadow}<g filter="url(#s)" transform="rotate(${spin} ${cx} ${cy})" data-local-detail="bakery-rolling-pin"><rect x="${cx - r * 0.7}" y="${cy - r * 0.24}" width="${r * 1.4}" height="${r * 0.48}" rx="${r * 0.22}" fill="#c98b52" stroke="#5b2f1f" stroke-opacity=".5" stroke-width="1.6"/><rect x="${cx - r * 1.02}" y="${cy - r * 0.11}" width="${r * 0.32}" height="${r * 0.22}" rx="${r * 0.1}" fill="#8f5932"/><rect x="${cx + r * 0.7}" y="${cy - r * 0.11}" width="${r * 0.32}" height="${r * 0.22}" rx="${r * 0.1}" fill="#8f5932"/><path d="M${cx - r * 0.34} ${cy - r * 0.12}H${cx + r * 0.34}M${cx - r * 0.38} ${cy + r * 0.1}H${cx + r * 0.28}" stroke="#fff7d8" stroke-opacity=".38" stroke-width="1.2" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="${hi}" fill-opacity=".55"/></g>`;
    }
    if (variant === 'bakery-proofling') {
      const aim = frame >= 5 ? 1 : frame / 7;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.24} 0)" data-local-detail="bakery-proofling"><path d="M${cx - r * 0.64} ${cy + r * 0.2}C${cx - r * 0.5} ${cy - r * (0.54 + aim * 0.06)} ${cx + r * 0.46} ${cy - r * 0.66} ${cx + r * 0.66} ${cy + r * 0.08}C${cx + r * 0.34} ${cy + r * 0.64} ${cx - r * 0.32} ${cy + r * 0.68} ${cx - r * 0.64} ${cy + r * 0.2}Z" fill="#e8bf86" stroke="#5b2f1f" stroke-opacity=".5" stroke-width="1.5"/><path d="M${cx - r * 0.36} ${cy - r * 0.26}C${cx - r * 0.12} ${cy - r * 0.46} ${cx + r * 0.2} ${cy - r * 0.42} ${cx + r * 0.42} ${cy - r * 0.18}" fill="none" stroke="#fff6d8" stroke-opacity=".48" stroke-width="1.4" stroke-linecap="round"/><circle cx="${cx - r * 0.18}" cy="${cy + r * 0.02}" r="${r * 0.08}" fill="#5b2f1f"/><circle cx="${cx + r * 0.18}" cy="${cy}" r="${r * 0.08}" fill="#5b2f1f"/><path d="M${cx + r * 0.24} ${cy + r * 0.26}L${cx + r * (0.78 + aim * 0.12)} ${cy + r * 0.52}" stroke="${hi}" stroke-opacity=".78" stroke-width="${Math.max(1.7, r * 0.1)}" stroke-linecap="round"/><circle cx="${cx + r * (0.8 + aim * 0.13)}" cy="${cy + r * 0.52}" r="${r * (0.08 + aim * 0.04)}" fill="${hi}" fill-opacity=".66"/></g>`;
    }
    if (variant === 'player') {
      const headX = cx + lean * 0.22;
      const stride = step * r * 0.12;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.2} 0)" data-local-detail="player-character"><ellipse cx="${cx}" cy="${cy + r * 0.1}" rx="${r * (0.5 + Math.abs(step) * 0.02)}" ry="${r * 0.6 * pulse}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.8"/><circle cx="${headX}" cy="${cy - r * 0.5}" r="${Math.max(3, r * 0.25)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.3"/><path d="M${cx - r * 0.28} ${cy - r * 0.04}L${cx - r * 0.74 + stride} ${cy + r * 0.12}M${cx + r * 0.28} ${cy - r * 0.04}L${cx + r * 0.74 + stride} ${cy + r * 0.12}M${cx - r * 0.22} ${cy + r * 0.5}L${cx - r * 0.44 - stride} ${cy + r * 0.86}M${cx + r * 0.22} ${cy + r * 0.5}L${cx + r * 0.44 - stride} ${cy + r * 0.86}" stroke="${hi}" stroke-opacity=".84" stroke-width="${Math.max(1.6, r * 0.12)}" stroke-linecap="round"/><path d="M${cx - r * 0.32} ${cy - r * 0.18}H${cx + r * 0.32}M${cx} ${cy - r * 0.26}V${cy + r * 0.42}" stroke="#fff" stroke-opacity=".38" stroke-width="1.4" stroke-linecap="round"/><circle cx="${headX + r * 0.08}" cy="${cy - r * 0.56}" r="${Math.max(1.4, r * 0.07)}" fill="#fff" fill-opacity=".72"/><path d="M${cx - r * 0.46} ${cy + r * 0.72}C${cx - r * 0.18} ${cy + r * 0.9} ${cx + r * 0.18} ${cy + r * 0.9} ${cx + r * 0.46} ${cy + r * 0.72}" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="1.1"/></g>`;
    }
    if (variant === 'coast-boss') {
      const charge = frame >= 5 ? 1 : frame / 7;
      const maw = r * (0.46 + charge * 0.08);
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.18} 0)" data-local-detail="coastal-beast-boss"><path d="M${cx - r * 0.8} ${cy - r * 0.18}L${cx - r * 0.34} ${cy - r * (0.58 + charge * 0.08)}L${cx - r * 0.1} ${cy - r * 0.14}M${cx + r * 0.8} ${cy - r * 0.18}L${cx + r * 0.34} ${cy - r * (0.58 + charge * 0.08)}L${cx + r * 0.1} ${cy - r * 0.14}" fill="${hi}" fill-opacity=".82" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/><ellipse cx="${cx}" cy="${cy}" rx="${r * (0.78 + charge * 0.04)}" ry="${r * 0.66}" fill="url(#body)" stroke="url(#rim)" stroke-width="2.4"/><path d="M${cx - r * 0.62} ${cy + r * 0.04}C${cx - r * 0.36} ${cy + maw} ${cx + r * 0.36} ${cy + maw} ${cx + r * 0.62} ${cy + r * 0.04}C${cx + r * 0.32} ${cy + r * 0.2} ${cx - r * 0.32} ${cy + r * 0.2} ${cx - r * 0.62} ${cy + r * 0.04}Z" fill="#05070b" fill-opacity=".74" stroke="#fff" stroke-opacity=".24" stroke-width="1.1"/><path d="M${cx - r * 0.42} ${cy + r * 0.12}L${cx - r * 0.28} ${cy + r * (0.32 + charge * 0.08)}L${cx - r * 0.14} ${cy + r * 0.12}M${cx + r * 0.14} ${cy + r * 0.12}L${cx + r * 0.28} ${cy + r * (0.32 + charge * 0.08)}L${cx + r * 0.42} ${cy + r * 0.12}" fill="#fff" fill-opacity=".82"/><circle cx="${cx - r * 0.28}" cy="${cy - r * 0.18}" r="${Math.max(2, r * (0.08 + charge * 0.02))}" fill="${hi}"/><circle cx="${cx + r * 0.28}" cy="${cy - r * 0.18}" r="${Math.max(2, r * (0.08 + charge * 0.02))}" fill="${hi}"/><path d="M${cx - r * 0.9} ${cy + r * 0.42}L${cx - r * 0.56} ${cy + r * 0.18}M${cx + r * 0.9} ${cy + r * 0.42}L${cx + r * 0.56} ${cy + r * 0.18}" stroke="${hi}" stroke-opacity=".86" stroke-width="${Math.max(2, r * 0.12)}" stroke-linecap="round"/></g>`;
    }
    if (variant === 'boss') {
      return `${shadow}<g filter="url(#s)"><circle cx="${cx}" cy="${cy}" r="${r * (0.76 + frame * 0.025)}" fill="url(#body)" stroke="url(#rim)" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="${r * (0.46 + frame * 0.035)}" fill="#000" fill-opacity=".14" stroke="${hi}" stroke-opacity=".82" stroke-width="2"/><path d="M${cx} ${r * 0.16} L${fw - r * 0.28} ${fh - r * (0.48 + step * 0.02)} L${r * 0.28} ${fh - r * (0.48 - step * 0.02)} Z" fill="${hi}" fill-opacity=".7"/><circle cx="${cx}" cy="${cy}" r="${r * 0.14}" fill="#fff" fill-opacity=".6"/></g>`;
    }
    if (variant === 'escort') {
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.24} 0)" data-local-detail="escort"><rect x="${cx - r * 0.72}" y="${cy - r * 0.36}" width="${r * 1.44}" height="${r * 0.78}" rx="${Math.max(3, r * 0.14)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.9"/><path d="M${cx - r * 0.56} ${cy - r * 0.34}Q${cx + step * 0.8} ${cy - r * (0.78 + Math.abs(step) * 0.03)} ${cx + r * 0.56} ${cy - r * 0.34}" fill="${hi}" fill-opacity=".68" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/><circle cx="${cx - r * 0.42}" cy="${cy + r * 0.44}" r="${Math.max(2.2, r * 0.18)}" fill="#161b22" stroke="${hi}" stroke-opacity=".74" stroke-width="1.2"/><circle cx="${cx + r * 0.42}" cy="${cy + r * 0.44}" r="${Math.max(2.2, r * 0.18)}" fill="#161b22" stroke="${hi}" stroke-opacity=".74" stroke-width="1.2"/><circle cx="${cx + step * 0.4}" cy="${cy - r * 0.06}" r="${Math.max(2.4, r * 0.17)}" fill="#fff" fill-opacity=".78"/><path d="M${cx - r * 0.7} ${cy + r * 0.08}H${cx + r * 0.7}M${cx - r * 0.48} ${cy - r * 0.1}H${cx + r * 0.48}" stroke="#fff" stroke-opacity=".32" stroke-width="1.1" stroke-linecap="round"/></g>`;
    }
    if (variant === 'rescue') {
      const rescueMark = `<circle cx="${cx + r * 0.42}" cy="${cy - r * 0.45}" r="${r * 0.14}" fill="${hi}" fill-opacity=".82"/><path d="M${cx + r * 0.42} ${cy - r * 0.66}V${cy - r * 0.24}M${cx + r * 0.22} ${cy - r * 0.45}H${cx + r * 0.62}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.35} 0)" data-local-detail="rescue"><path d="M${cx} ${r * 0.24}L${fw - r * 0.25} ${cy + r * 0.12}L${cx + r * 0.32} ${fh - r * 0.22}H${cx - r * 0.32}L${r * 0.25} ${cy + r * 0.12}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.7"/><path d="M${cx} ${cy - r * 0.45}V${cy + r * 0.5}M${cx - r * 0.46} ${cy + r * 0.02}H${cx + r * 0.46}" stroke="${hi}" stroke-opacity=".9" stroke-width="2" stroke-linecap="round"/>${rescueMark}</g>`;
    }
    if (variant === 'defend-core') {
      return `${shadow}<g filter="url(#s)" transform="rotate(${45 + frame * 8} ${cx} ${cy})"><rect x="${cx - r * 0.58}" y="${cy - r * 0.58}" width="${r * 1.16}" height="${r * 1.16}" rx="${Math.max(3, r * 0.16)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.9"/></g><circle cx="${cx}" cy="${cy}" r="${r * (0.22 + frame * 0.02)}" fill="${hi}" fill-opacity=".84"/>`;
    }
    if (variant === 'shooter') {
      return `${shadow}<g filter="url(#s)"><rect x="${r * 0.32}" y="${r * 0.42}" width="${fw - r * 0.64}" height="${fh - r * 0.6}" rx="${Math.max(3, r * 0.2)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><rect x="${cx - r * 0.16 + step}" y="${r * 0.1}" width="${r * 0.32}" height="${r * (0.86 + frame * 0.06)}" rx="1.5" fill="${hi}" fill-opacity=".84"/><circle cx="${cx}" cy="${cy}" r="${r * (0.18 + frame * 0.02)}" fill="#fff" fill-opacity=".54"/></g>`;
    }
    if (variant === 'sniper') {
      const lock = frame >= 5 ? 1 : frame / 6;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.2} 0)" data-local-detail="sniper"><rect x="${r * 0.34}" y="${r * 0.48}" width="${fw - r * 0.68}" height="${fh - r * 0.78}" rx="${Math.max(3, r * 0.18)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><path d="M${cx + step * 0.4} ${r * 0.12}V${cy + r * (0.26 + lock * 0.34)}" stroke="${hi}" stroke-opacity="${0.7 + lock * 0.22}" stroke-width="${Math.max(2, r * 0.17)}" stroke-linecap="round"/><path d="M${cx - r * (0.38 + lock * 0.2)} ${cy + r * 0.2}H${cx + r * (0.38 + lock * 0.2)}" stroke="#000" stroke-opacity=".26" stroke-width="${Math.max(2, r * 0.12)}" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r * (0.17 + lock * 0.04)}" fill="#fff" fill-opacity=".56"/><circle cx="${cx + step * 0.4}" cy="${r * 0.28}" r="${r * (0.1 + lock * 0.04)}" fill="${hi}" fill-opacity=".82"/></g>`;
    }
    if (variant === 'sapper') {
      const armed = frame >= 5 ? 1 : frame / 6;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.24} 0)" data-local-detail="sapper"><path d="M${cx} ${r * 0.22}L${fw - r * 0.28} ${cy + r * 0.18}L${cx + r * 0.28} ${fh - r * 0.22}H${cx - r * 0.28}L${r * 0.28} ${cy + r * 0.18}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.6"/><rect x="${cx - r * 0.45}" y="${cy - r * 0.18}" width="${r * 0.9}" height="${r * 0.48}" rx="${Math.max(2, r * 0.12)}" fill="#000" fill-opacity=".22" stroke="${hi}" stroke-opacity="${0.54 + armed * 0.28}" stroke-width="1.2"/><circle cx="${cx + r * (0.38 + armed * 0.14)}" cy="${cy + r * 0.36}" r="${r * (0.16 + armed * 0.08)}" fill="${hi}" fill-opacity=".86"/><circle cx="${cx + r * (0.38 + armed * 0.14)}" cy="${cy + r * 0.36}" r="${r * (0.26 + armed * 0.16)}" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width="1.1"/><path d="M${cx - r * 0.4} ${cy - r * 0.36}L${cx + r * (0.06 + armed * 0.18)} ${cy + r * 0.06}" stroke="#fff" stroke-opacity=".28" stroke-width="1.2" stroke-linecap="round"/></g>`;
    }
    if (variant === 'support') {
      const channel = frame >= 5 ? 1 : frame / 6;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.16} 0)" data-local-detail="support"><circle cx="${cx}" cy="${cy}" r="${r * (0.58 + channel * 0.08)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="${r * (0.34 + channel * 0.2)}" fill="none" stroke="${hi}" stroke-opacity="${0.52 + channel * 0.36}" stroke-width="2"/><path d="M${cx} ${cy - r * 0.42}V${cy + r * 0.42}M${cx - r * 0.42} ${cy}H${cx + r * 0.42}" stroke="#fff" stroke-opacity="${0.38 + channel * 0.22}" stroke-width="${Math.max(2, r * 0.14)}" stroke-linecap="round"/><circle cx="${cx + Math.cos(frame * 0.75) * r * 0.72}" cy="${cy + Math.sin(frame * 0.75) * r * 0.42}" r="${r * 0.12}" fill="${hi}" fill-opacity=".78"/><circle cx="${cx - Math.cos(frame * 0.75) * r * 0.72}" cy="${cy - Math.sin(frame * 0.75) * r * 0.42}" r="${r * 0.1}" fill="#fff" fill-opacity=".52"/></g>`;
    }
    if (variant === 'guardian') {
      const shield = frame >= 5 ? 1 : frame / 6;
      const arc = r * (0.78 + shield * 0.24);
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.12} 0)" data-local-detail="guardian"><path d="M${cx} ${r * 0.16}L${fw - r * 0.3} ${cy - r * 0.08}Q${cx + r * 0.42} ${fh - r * 0.28} ${cx} ${fh - r * 0.14}Q${cx - r * 0.42} ${fh - r * 0.28} ${r * 0.3} ${cy - r * 0.08}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.8"/><path d="M${cx} ${r * 0.36}L${cx + r * 0.44} ${cy - r * 0.02}Q${cx + r * 0.22} ${cy + r * 0.5} ${cx} ${cy + r * 0.66}Q${cx - r * 0.22} ${cy + r * 0.5} ${cx - r * 0.44} ${cy - r * 0.02}Z" fill="${hi}" fill-opacity="${0.42 + shield * 0.28}"/><path d="M${cx - arc} ${cy + r * 0.08}Q${cx} ${cy - arc} ${cx + arc} ${cy + r * 0.08}" fill="none" stroke="#fff" stroke-opacity="${0.2 + shield * 0.24}" stroke-width="1.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy + r * 0.12}" r="${r * (0.14 + shield * 0.06)}" fill="#fff" fill-opacity=".44"/><circle cx="${cx}" cy="${cy}" r="${r * (0.72 + shield * 0.2)}" fill="none" stroke="${hi}" stroke-opacity="${0.3 + shield * 0.32}" stroke-width="1.3"/></g>`;
    }
    if (variant === 'sentinel') {
      const charge = frame >= 5 ? 1 : frame / 6;
      const barrel = r * (0.5 + charge * 0.34);
      const glow = 0.28 + charge * 0.34;
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.1} 0)" data-local-detail="sentinel"><rect x="${cx - r * 0.56}" y="${cy - r * 0.56}" width="${r * 1.12}" height="${r * 1.12}" rx="${Math.max(3, r * 0.16)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.7" transform="rotate(${45 + step * 5} ${cx} ${cy})"/><circle cx="${cx}" cy="${cy}" r="${r * (0.34 + charge * 0.08)}" fill="#000" fill-opacity=".16" stroke="${hi}" stroke-opacity="${0.54 + charge * 0.34}" stroke-width="1.7"/><path d="M${cx} ${cy - barrel}V${cy - r * 0.08}M${cx} ${cy + r * 0.08}V${cy + barrel}M${cx - barrel} ${cy}H${cx - r * 0.08}M${cx + r * 0.08} ${cy}H${cx + barrel}" stroke="${hi}" stroke-opacity="${0.58 + charge * 0.28}" stroke-width="${Math.max(2, r * (0.12 + charge * 0.04))}" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r * (0.12 + charge * 0.08)}" fill="#fff" fill-opacity="${0.42 + charge * 0.24}"/><circle cx="${cx}" cy="${cy}" r="${r * (0.62 + charge * 0.2)}" fill="none" stroke="${hi}" stroke-opacity="${glow}" stroke-width="1.1"/></g>`;
    }
    if (variant === 'charger' || variant === 'chaser') {
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.3} 0)"><path d="M${cx} ${r * 0.2} L${fw - r * (0.2 + frame * 0.02)} ${cy} L${cx} ${fh - r * 0.2} L${r * (0.2 + frame * 0.02)} ${cy} Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.7"/><path d="M${cx} ${r * 0.44} L${fw - r * 0.56} ${cy} L${cx} ${fh - r * 0.44} L${r * 0.56} ${cy} Z" fill="${hi}" fill-opacity=".66"/></g>${limbs}`;
    }
    if (variant === 'orbiter') {
      const dotAngle = frame * Math.PI * 0.5;
      return `${shadow}<g filter="url(#s)"><circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.82}" ry="${r * 0.3}" fill="none" stroke="${hi}" stroke-opacity=".72" stroke-width="1.4"/><circle cx="${cx + Math.cos(dotAngle) * r * 0.76}" cy="${cy + Math.sin(dotAngle) * r * 0.3}" r="${r * 0.15}" fill="#fff" fill-opacity=".64"/><circle cx="${cx - Math.cos(dotAngle) * r * 0.76}" cy="${cy - Math.sin(dotAngle) * r * 0.3}" r="${r * 0.12}" fill="${hi}" fill-opacity=".58"/></g>`;
    }
    if (variant === 'wanderer') {
      return `${shadow}<g filter="url(#s)" transform="translate(${lean * 0.28} ${Math.abs(step) * r * 0.04})"><path d="M${cx - r * 0.72} ${cy - r * 0.08}C${cx - r * 0.52} ${cy - r * (0.7 + step * 0.04)} ${cx + r * 0.4} ${cy - r * 0.72} ${cx + r * 0.66} ${cy - r * 0.08}C${cx + r * 0.78} ${cy + r * 0.48} ${cx - r * 0.42} ${cy + r * 0.84} ${cx - r * 0.72} ${cy - r * 0.08}Z" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><circle cx="${cx + r * 0.28}" cy="${cy + r * 0.04}" r="${r * 0.2}" fill="${hi}" fill-opacity=".56"/></g>`;
    }
    return `${shadow}<g filter="url(#s)"><circle cx="${cx}" cy="${cy}" r="${r * (0.72 + Math.abs(step) * 0.03)}" fill="url(#body)" stroke="url(#rim)" stroke-width="1.5"/><rect x="${cx - r * 0.42}" y="${cy - r * 0.12 + step}" width="${r * 0.84}" height="${r * 0.24}" rx="1" fill="${hi}" fill-opacity=".58"/></g>${limbs}`;
  };
  const frameSvgs = Array.from({ length: count }, (_, frame) => {
    const offset = frame * fw;
    return `<g transform="translate(${offset} 0)" data-frame="${frame}" data-pose="${frameMarks[frame % frameMarks.length]}">${variantCore(frame)}${moodDecal(cx, cy, r, mood, hi, variant)}</g>`;
  }).join('');
  const detailAttr = variant === 'escort' || variant === 'rescue' || variant === 'defend-core' || variant.startsWith('flight-') || variant.startsWith('platform-') || variant.startsWith('bakery-') ? ` data-local-detail="${variant}"` : '';
  const animationAttr = animations.length ? ` data-animations="${animations.map((animation) => animation.name).join(',')}"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-local-asset="spritesheet" data-mood="${mood}" data-variant="${variant}" data-frames="${count}" data-frame-width="${fw}" data-frame-height="${fh}"${animationAttr}${detailAttr}>${defs}${frameSvgs}</svg>`;
  return svgDataUrl(svg);
}

function fxSvg(width: number, height: number, color: string, variant: 'bullet' | 'ebullet' | 'orb'): string {
  const w = Math.max(8, Math.round(width));
  const h = Math.max(8, Math.round(height));
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const base = safeColor(color);
  if (variant === 'ebullet') {
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="M${cx} ${r * 0.2} L${w - r * 0.3} ${cy} L${cx} ${h - r * 0.2} L${r * 0.3} ${cy} Z" fill="${base}" stroke="#fff" stroke-opacity=".35" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${r * 0.18}" fill="#fff" fill-opacity=".55"/></svg>`);
  }
  if (variant === 'orb') {
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="${base}" fill-opacity=".88" stroke="#fff" stroke-opacity=".42" stroke-width="1"/><circle cx="${cx - r * 0.18}" cy="${cy - r * 0.22}" r="${r * 0.2}" fill="#fff" fill-opacity=".55"/></svg>`);
  }
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><circle cx="${cx}" cy="${cy}" r="${r * 0.68}" fill="${base}" stroke="#fff" stroke-opacity=".42" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="#fff" fill-opacity=".5"/></svg>`);
}

function tileMoodPattern(w: number, h: number, mood: LocalAssetMood, accent: string, danger: string): string {
  if (mood === 'security') {
    return `<path d="M${w * 0.18} 0V${h}M${w * 0.5} 0V${h}M${w * 0.82} 0V${h}M0 ${h * 0.22}H${w}M0 ${h * 0.5}H${w}M0 ${h * 0.78}H${w}" stroke="${accent}" stroke-opacity=".2" stroke-width="1.4"/><rect x="${w * 0.34}" y="${h * 0.34}" width="${w * 0.32}" height="${h * 0.32}" rx="3" fill="${danger}" fill-opacity=".08" stroke="${danger}" stroke-opacity=".2"/>`;
  }
  if (mood === 'space') {
    return `<circle cx="${w * 0.18}" cy="${h * 0.2}" r="1.2" fill="#fff" fill-opacity=".38"/><circle cx="${w * 0.76}" cy="${h * 0.34}" r="1.4" fill="${accent}" fill-opacity=".34"/><ellipse cx="${w * 0.5}" cy="${h * 0.56}" rx="${w * 0.24}" ry="${h * 0.1}" fill="none" stroke="${accent}" stroke-opacity=".18"/><path d="M${w * 0.16} ${h * 0.76}L${w * 0.86} ${h * 0.18}" stroke="#fff" stroke-opacity=".08"/>`;
  }
  if (mood === 'sky') {
    return `<path d="M${w * 0.04} ${h * 0.3}H${w * 0.42}M${w * 0.52} ${h * 0.3}H${w * 0.96}M${w * 0.08} ${h * 0.62}H${w * 0.7}" stroke="${accent}" stroke-opacity=".18" stroke-linecap="round"/><path d="M${w * 0.16} ${h * 0.76}C${w * 0.28} ${h * 0.58} ${w * 0.42} ${h * 0.84} ${w * 0.58} ${h * 0.66}S${w * 0.82} ${h * 0.58} ${w * 0.92} ${h * 0.72}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-linecap="round"/><circle cx="${w * 0.76}" cy="${h * 0.18}" r="1.4" fill="${danger}" fill-opacity=".18"/>`;
  }
  if (mood === 'platform') {
    return `<path d="M${w * 0.08} ${h * 0.28}H${w * 0.46}M${w * 0.54} ${h * 0.54}H${w * 0.94}M${w * 0.16} ${h * 0.78}H${w * 0.7}" stroke="${accent}" stroke-opacity=".24" stroke-linecap="round" stroke-width="2"/><rect x="${w * 0.12}" y="${h * 0.3}" width="${w * 0.22}" height="${h * 0.08}" rx="2" fill="${danger}" fill-opacity=".1"/><path d="M${w * 0.62} ${h * 0.2}L${w * 0.74} ${h * 0.1}L${w * 0.86} ${h * 0.2}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-linecap="round"/>`;
  }
  if (mood === 'haunted') {
    return `<path d="M${w * 0.12} ${h * 0.72}Q${w * 0.28} ${h * 0.46} ${w * 0.52} ${h * 0.62}T${w * 0.88} ${h * 0.42}" fill="none" stroke="${accent}" stroke-opacity=".18"/><path d="M${w * 0.3} ${h * 0.22}L${w * 0.42} ${h * 0.38}L${w * 0.36} ${h * 0.52}M${w * 0.68} ${h * 0.72}L${w * 0.76} ${h * 0.56}L${w * 0.88} ${h * 0.62}" stroke="#000" stroke-opacity=".16"/><circle cx="${w * 0.74}" cy="${h * 0.24}" r="${Math.max(2, w * 0.045)}" fill="${danger}" fill-opacity=".12"/>`;
  }
  if (mood === 'bakery') {
    return `<path d="M${w * 0.1} ${h * 0.66}C${w * 0.24} ${h * 0.52} ${w * 0.32} ${h * 0.78} ${w * 0.46} ${h * 0.62}S${w * 0.76} ${h * 0.48} ${w * 0.9} ${h * 0.62}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-linecap="round"/><circle cx="${w * 0.24}" cy="${h * 0.24}" r="1.4" fill="${danger}" fill-opacity=".2"/><circle cx="${w * 0.7}" cy="${h * 0.78}" r="1.3" fill="${accent}" fill-opacity=".24"/><rect x="${w * 0.62}" y="${h * 0.22}" width="${w * 0.16}" height="${h * 0.08}" rx="2" fill="#fff" fill-opacity=".08"/>`;
  }
  if (mood === 'coast') {
    return `<path d="M${w * 0.08} ${h * 0.34}C${w * 0.22} ${h * 0.18} ${w * 0.34} ${h * 0.48} ${w * 0.5} ${h * 0.3}S${w * 0.78} ${h * 0.2} ${w * 0.92} ${h * 0.36}" fill="none" stroke="${accent}" stroke-opacity=".18" stroke-linecap="round"/><path d="M${w * 0.08} ${h * 0.62}C${w * 0.24} ${h * 0.48} ${w * 0.38} ${h * 0.76} ${w * 0.54} ${h * 0.58}S${w * 0.78} ${h * 0.52} ${w * 0.92} ${h * 0.68}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-linecap="round"/><circle cx="${w * 0.22}" cy="${h * 0.78}" r="1.2" fill="#fff" fill-opacity=".18"/>`;
  }
  return `<path d="M${w * 0.14} ${h * 0.78}L${w * 0.48} ${h * 0.42}M${w * 0.62} ${h * 0.26}L${w * 0.9} ${h * 0.58}" stroke="${accent}" stroke-opacity=".18"/><rect x="${w * 0.68}" y="${h * 0.14}" width="${w * 0.18}" height="${h * 0.1}" rx="2" fill="${danger}" fill-opacity=".12"/>`;
}

function tileSvg(width: number, height: number, floor: string, background: string, accent: string, danger: string, mood: LocalAssetMood): string {
  const w = Math.max(16, Math.round(width));
  const h = Math.max(16, Math.round(height));
  const base = safeColor(floor);
  const bg = safeColor(background);
  const hi = safeColor(accent);
  const risk = safeColor(danger);
  const marks = tileMoodPattern(w, h, mood, hi, risk);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-local-asset="tile" data-mood="${mood}"><defs><linearGradient id="floorShade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${blendColor(base, '#ffffff', 0.12)}"/><stop offset=".58" stop-color="${base}"/><stop offset="1" stop-color="${blendColor(base, '#000000', 0.2)}"/></linearGradient><radialGradient id="floorWear" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#floorShade)"/><rect width="${w}" height="${h}" fill="url(#floorWear)"/><path d="M0 0H${w}M0 0V${h}" stroke="${bg}" stroke-opacity=".28" stroke-width="2"/><path d="M0 ${h / 2}H${w}M${w / 2} 0V${h}" stroke="#fff" stroke-opacity=".06"/><path d="M${w * 0.06} ${h * 0.94}L${w * 0.94} ${h * 0.06}" stroke="#000" stroke-opacity=".08"/><g>${marks}</g></svg>`;
  return svgDataUrl(svg);
}

function sceneBackdropSvg(width: number, height: number, mood: LocalAssetMood, definition: GameDefinition): string {
  const w = Math.max(640, Math.round(width));
  const h = Math.max(360, Math.round(height));
  const p = definition.palette;
  const bg = safeColor(p.background);
  const floor = safeColor(p.floor);
  const accent = safeColor(p.accent);
  const danger = safeColor(p.danger);
  const xp = safeColor(p.xp);
  const projectile = safeColor(p.projectile);
  const player = safeColor(p.player);
  const text = [
    definition.title,
    definition.theme,
    definition.arena.name,
    definition.boss?.name,
  ].filter(Boolean).join(' ').toLowerCase();
  const coastal = mood === 'coast' || /(coast|tide|ocean|sea|wave|harbor|beach|reef|beast|hound|maw|charge)/.test(text);
  const commonDefs = `<defs><linearGradient id="sceneSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${blendColor(bg, '#ffffff', 0.16)}"/><stop offset=".55" stop-color="${bg}"/><stop offset="1" stop-color="${blendColor(floor, '#000000', 0.16)}"/></linearGradient><linearGradient id="sceneStone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${blendColor(floor, '#ffffff', 0.18)}"/><stop offset=".68" stop-color="${floor}"/><stop offset="1" stop-color="${blendColor(floor, '#000000', 0.34)}"/></linearGradient><radialGradient id="sceneGlow" cx="50%" cy="35%" r="58%"><stop offset="0" stop-color="#fff" stop-opacity=".52"/><stop offset=".32" stop-color="${xp}" stop-opacity=".3"/><stop offset="1" stop-color="${xp}" stop-opacity="0"/></radialGradient><filter id="softShadow"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".36"/></filter></defs>`;

  if (definition.runtimeTemplate === 'platformer') {
    const tower = (x: number, y: number, tw: number, th: number): string => {
      const notch = tw / 5;
      return `<g filter="url(#softShadow)"><rect x="${x}" y="${y}" width="${tw}" height="${th}" fill="url(#sceneStone)" stroke="${accent}" stroke-opacity=".22" stroke-width="2"/><path d="M${x} ${y}h${notch}v-${notch}h${notch}v${notch}h${notch}v-${notch}h${notch}v${notch}h${notch}v-${notch}h${notch}v${notch}" fill="${floor}" stroke="${accent}" stroke-opacity=".24"/><path d="M${x + tw * 0.28} ${y + th * 0.24}h${tw * 0.16}v${th * 0.12}h-${tw * 0.16}zM${x + tw * 0.62} ${y + th * 0.42}h${tw * 0.16}v${th * 0.12}h-${tw * 0.16}z" fill="${projectile}" fill-opacity=".42"/><path d="M${x + tw * 0.5} ${y + th * 0.18}v${th * 0.76}" stroke="#000" stroke-opacity=".12"/></g>`;
    };
    const ledge = (x: number, y: number, lw: number): string => `<g filter="url(#softShadow)"><rect x="${x}" y="${y}" width="${lw}" height="${h * 0.028}" rx="5" fill="${accent}" fill-opacity=".86"/><rect x="${x}" y="${y + h * 0.026}" width="${lw}" height="${h * 0.04}" rx="3" fill="url(#sceneStone)"/><path d="M${x + lw * 0.08} ${y + h * 0.054}h${lw * 0.12}M${x + lw * 0.36} ${y + h * 0.052}h${lw * 0.18}M${x + lw * 0.72} ${y + h * 0.052}h${lw * 0.14}" stroke="#000" stroke-opacity=".18" stroke-width="2"/></g>`;
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-local-asset="background" data-mood="${mood}" data-scene="castle-platformer">${commonDefs}<rect width="${w}" height="${h}" fill="url(#sceneSky)"/><circle cx="${w * 0.78}" cy="${h * 0.16}" r="${h * 0.09}" fill="url(#sceneGlow)"/><circle cx="${w * 0.78}" cy="${h * 0.16}" r="${h * 0.045}" fill="${xp}" fill-opacity=".88"/><path d="M0 ${h * 0.48}C${w * 0.16} ${h * 0.34} ${w * 0.26} ${h * 0.42} ${w * 0.42} ${h * 0.28}S${w * 0.76} ${h * 0.36} ${w} ${h * 0.24}V${h}H0Z" fill="${blendColor(bg, '#000000', 0.22)}" fill-opacity=".72"/><path d="M0 ${h * 0.6}C${w * 0.22} ${h * 0.48} ${w * 0.32} ${h * 0.56} ${w * 0.52} ${h * 0.42}S${w * 0.78} ${h * 0.54} ${w} ${h * 0.43}V${h}H0Z" fill="${blendColor(floor, '#000000', 0.14)}" fill-opacity=".82"/>${tower(w * 0.07, h * 0.28, w * 0.13, h * 0.5)}${tower(w * 0.74, h * 0.22, w * 0.15, h * 0.56)}<g filter="url(#softShadow)"><rect x="${w * 0.2}" y="${h * 0.48}" width="${w * 0.58}" height="${h * 0.32}" fill="url(#sceneStone)" stroke="${accent}" stroke-opacity=".2" stroke-width="2"/><path d="M${w * 0.2} ${h * 0.48}h${w * 0.055}v-${h * 0.035}h${w * 0.055}v${h * 0.035}h${w * 0.055}v-${h * 0.035}h${w * 0.055}v${h * 0.035}h${w * 0.055}v-${h * 0.035}h${w * 0.055}v${h * 0.035}h${w * 0.055}v-${h * 0.035}h${w * 0.055}v${h * 0.035}h${w * 0.055}v-${h * 0.035}h${w * 0.055}v${h * 0.035}h${w * 0.055}" fill="${floor}" stroke="${accent}" stroke-opacity=".22"/><path d="M${w * 0.32} ${h * 0.56}h${w * 0.06}v${h * 0.09}h-${w * 0.06}zM${w * 0.48} ${h * 0.56}h${w * 0.06}v${h * 0.09}h-${w * 0.06}zM${w * 0.64} ${h * 0.56}h${w * 0.06}v${h * 0.09}h-${w * 0.06}z" fill="${projectile}" fill-opacity=".36"/></g>${ledge(w * 0.1, h * 0.72, w * 0.28)}${ledge(w * 0.52, h * 0.62, w * 0.26)}${ledge(w * 0.36, h * 0.84, w * 0.42)}<path d="M${w * 0.2} ${h * 0.5}C${w * 0.22} ${h * 0.6} ${w * 0.18} ${h * 0.68} ${w * 0.23} ${h * 0.78}M${w * 0.78} ${h * 0.36}C${w * 0.82} ${h * 0.48} ${w * 0.72} ${h * 0.58} ${w * 0.76} ${h * 0.7}" stroke="${accent}" stroke-opacity=".38" stroke-width="5" stroke-linecap="round"/><rect width="${w}" height="${h}" fill="#000" fill-opacity=".1"/></svg>`);
  }

  if (definition.runtimeTemplate === 'puzzle-room') {
    const crystal = (cx: number, cy: number, scale: number): string => `<g filter="url(#softShadow)"><path d="M${cx} ${cy - 58 * scale}L${cx + 32 * scale} ${cy - 12 * scale}L${cx + 18 * scale} ${cy + 58 * scale}L${cx - 22 * scale} ${cy + 54 * scale}L${cx - 34 * scale} ${cy - 10 * scale}Z" fill="${xp}" fill-opacity=".76" stroke="#fff" stroke-opacity=".44" stroke-width="${2 * scale}"/><path d="M${cx} ${cy - 48 * scale}L${cx} ${cy + 46 * scale}M${cx - 28 * scale} ${cy - 8 * scale}L${cx + 28 * scale} ${cy - 10 * scale}" stroke="#fff" stroke-opacity=".32" stroke-width="${1.5 * scale}"/></g>`;
    const col = (x: number, y: number): string => `<g filter="url(#softShadow)"><ellipse cx="${x}" cy="${y}" rx="${w * 0.055}" ry="${h * 0.025}" fill="${blendColor(floor, '#ffffff', 0.14)}"/><rect x="${x - w * 0.045}" y="${y}" width="${w * 0.09}" height="${h * 0.24}" fill="url(#sceneStone)"/><ellipse cx="${x}" cy="${y + h * 0.24}" rx="${w * 0.06}" ry="${h * 0.028}" fill="${blendColor(floor, '#000000', 0.18)}"/><path d="M${x - w * 0.026} ${y + h * 0.02}v${h * 0.2}M${x + w * 0.026} ${y + h * 0.02}v${h * 0.2}" stroke="#fff" stroke-opacity=".12"/></g>`;
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-local-asset="background" data-mood="${mood}" data-scene="crystal-puzzle-room">${commonDefs}<rect width="${w}" height="${h}" fill="url(#sceneSky)"/><rect x="${w * 0.08}" y="${h * 0.1}" width="${w * 0.84}" height="${h * 0.8}" rx="${h * 0.045}" fill="url(#sceneStone)" stroke="${accent}" stroke-opacity=".34" stroke-width="4" filter="url(#softShadow)"/><path d="M${w * 0.16} ${h * 0.2}H${w * 0.84}M${w * 0.16} ${h * 0.32}H${w * 0.84}M${w * 0.16} ${h * 0.44}H${w * 0.84}M${w * 0.16} ${h * 0.56}H${w * 0.84}M${w * 0.16} ${h * 0.68}H${w * 0.84}M${w * 0.25} ${h * 0.16}V${h * 0.82}M${w * 0.38} ${h * 0.16}V${h * 0.82}M${w * 0.5} ${h * 0.16}V${h * 0.82}M${w * 0.62} ${h * 0.16}V${h * 0.82}M${w * 0.75} ${h * 0.16}V${h * 0.82}" stroke="#fff" stroke-opacity=".1" stroke-width="2"/><g filter="url(#softShadow)"><path d="M${w * 0.38} ${h * 0.18}A${w * 0.12} ${h * 0.18} 0 0 1 ${w * 0.62} ${h * 0.18}V${h * 0.38}H${w * 0.38}Z" fill="${blendColor(bg, '#000000', 0.28)}" stroke="${xp}" stroke-opacity=".52" stroke-width="4"/><circle cx="${w * 0.5}" cy="${h * 0.22}" r="${h * 0.075}" fill="url(#sceneGlow)"/><path d="M${w * 0.48} ${h * 0.19}A${h * 0.055} ${h * 0.055} 0 1 0 ${w * 0.54} ${h * 0.27}A${h * 0.05} ${h * 0.05} 0 1 1 ${w * 0.48} ${h * 0.19}Z" fill="${xp}" fill-opacity=".9"/></g><rect x="${w * 0.28}" y="${h * 0.45}" width="${w * 0.44}" height="${h * 0.28}" rx="16" fill="${blendColor(bg, '#000000', 0.22)}" fill-opacity=".7" stroke="${accent}" stroke-opacity=".46" stroke-width="3"/><path d="M${w * 0.34} ${h * 0.51}H${w * 0.66}M${w * 0.34} ${h * 0.59}H${w * 0.66}M${w * 0.34} ${h * 0.67}H${w * 0.66}M${w * 0.42} ${h * 0.48}V${h * 0.72}M${w * 0.5} ${h * 0.48}V${h * 0.72}M${w * 0.58} ${h * 0.48}V${h * 0.72}" stroke="${xp}" stroke-opacity=".28" stroke-width="2"/>${col(w * 0.17, h * 0.18)}${col(w * 0.83, h * 0.18)}${crystal(w * 0.2, h * 0.68, 1.05)}${crystal(w * 0.8, h * 0.66, 0.9)}${crystal(w * 0.5, h * 0.84, 0.75)}<rect width="${w}" height="${h}" fill="#000" fill-opacity=".08"/></svg>`);
  }

  if (coastal) {
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-local-asset="background" data-mood="${mood}" data-scene="coastal-boss-arena">${commonDefs}<rect width="${w}" height="${h}" fill="url(#sceneSky)"/><circle cx="${w * 0.18}" cy="${h * 0.16}" r="${h * 0.07}" fill="${projectile}" fill-opacity=".44"/><path d="M0 ${h * 0.34}C${w * 0.18} ${h * 0.26} ${w * 0.34} ${h * 0.38} ${w * 0.52} ${h * 0.3}S${w * 0.78} ${h * 0.24} ${w} ${h * 0.34}V${h}H0Z" fill="${blendColor(bg, '#000000', 0.18)}" fill-opacity=".56"/><rect x="0" y="${h * 0.42}" width="${w}" height="${h * 0.42}" fill="#1789a6" fill-opacity=".86"/><path d="M0 ${h * 0.5}C${w * 0.1} ${h * 0.44} ${w * 0.2} ${h * 0.58} ${w * 0.3} ${h * 0.51}S${w * 0.5} ${h * 0.43} ${w * 0.62} ${h * 0.51}S${w * 0.82} ${h * 0.59} ${w} ${h * 0.5}V${h * 0.62}C${w * 0.86} ${h * 0.7} ${w * 0.7} ${h * 0.55} ${w * 0.54} ${h * 0.64}S${w * 0.22} ${h * 0.7} 0 ${h * 0.62}Z" fill="#dff8ff" fill-opacity=".38"/><path d="M0 ${h * 0.58}C${w * 0.14} ${h * 0.52} ${w * 0.24} ${h * 0.66} ${w * 0.38} ${h * 0.58}S${w * 0.62} ${h * 0.52} ${w * 0.76} ${h * 0.6}S${w * 0.92} ${h * 0.66} ${w} ${h * 0.58}" fill="none" stroke="#fff" stroke-opacity=".56" stroke-width="4"/><path d="M0 ${h * 0.72}C${w * 0.18} ${h * 0.66} ${w * 0.28} ${h * 0.8} ${w * 0.46} ${h * 0.72}S${w * 0.74} ${h * 0.66} ${w} ${h * 0.76}V${h}H0Z" fill="#d9b267" fill-opacity=".96"/><path d="M${w * 0.08} ${h * 0.76}C${w * 0.2} ${h * 0.72} ${w * 0.28} ${h * 0.83} ${w * 0.4} ${h * 0.78}M${w * 0.55} ${h * 0.79}C${w * 0.68} ${h * 0.74} ${w * 0.78} ${h * 0.84} ${w * 0.9} ${h * 0.8}" stroke="#fff" stroke-opacity=".34" stroke-width="3" stroke-linecap="round"/><g filter="url(#softShadow)"><path d="M${w * 0.06} ${h * 0.74}L${w * 0.16} ${h * 0.58}L${w * 0.28} ${h * 0.76}Z" fill="${blendColor(floor, '#000000', 0.34)}"/><path d="M${w * 0.82} ${h * 0.72}L${w * 0.93} ${h * 0.56}L${w} ${h * 0.76}Z" fill="${blendColor(floor, '#000000', 0.42)}"/><path d="M${w * 0.64} ${h * 0.57}C${w * 0.72} ${h * 0.42} ${w * 0.88} ${h * 0.42} ${w * 0.95} ${h * 0.58}C${w * 0.88} ${h * 0.52} ${w * 0.75} ${h * 0.52} ${w * 0.64} ${h * 0.57}Z" fill="${blendColor(bg, '#000000', 0.46)}"/><ellipse cx="${w * 0.78}" cy="${h * 0.54}" rx="${w * 0.085}" ry="${h * 0.035}" fill="#000" fill-opacity=".34"/><circle cx="${w * 0.75}" cy="${h * 0.52}" r="${h * 0.01}" fill="${danger}"/><circle cx="${w * 0.82}" cy="${h * 0.52}" r="${h * 0.01}" fill="${danger}"/></g><path d="M${w * 0.18} ${h * 0.65}c${w * 0.04} -${h * 0.04} ${w * 0.08} -${h * 0.04} ${w * 0.12} 0M${w * 0.34} ${h * 0.69}c${w * 0.05} -${h * 0.04} ${w * 0.1} -${h * 0.04} ${w * 0.15} 0M${w * 0.56} ${h * 0.66}c${w * 0.04} -${h * 0.04} ${w * 0.09} -${h * 0.04} ${w * 0.13} 0" stroke="#fff" stroke-opacity=".5" stroke-width="4" stroke-linecap="round"/><rect width="${w}" height="${h}" fill="#000" fill-opacity=".04"/></svg>`);
  }

  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-local-asset="background" data-mood="${mood}" data-scene="arena">${commonDefs}<rect width="${w}" height="${h}" fill="url(#sceneSky)"/><rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.84}" height="${h * 0.76}" rx="24" fill="url(#sceneStone)" stroke="${accent}" stroke-opacity=".28" stroke-width="3"/><path d="M${w * 0.18} ${h * 0.28}H${w * 0.82}M${w * 0.18} ${h * 0.5}H${w * 0.82}M${w * 0.18} ${h * 0.72}H${w * 0.82}M${w * 0.3} ${h * 0.18}V${h * 0.82}M${w * 0.5} ${h * 0.18}V${h * 0.82}M${w * 0.7} ${h * 0.18}V${h * 0.82}" stroke="#fff" stroke-opacity=".1"/><circle cx="${w * 0.5}" cy="${h * 0.5}" r="${h * 0.16}" fill="url(#sceneGlow)"/></svg>`);
}

function generatedSourceForAsset(definition: GameDefinition, asset: Asset): string {
  const p = definition.palette;
  const mood = assetMood(definition);
  const enemy = definition.enemies.find((candidate) => candidate.spriteKey === asset.key);
  const actorSprite = (body: string, accent: string, variant: string) => {
    if (asset.spriteSheet) {
      return spriteSheetSvg(asset.width, asset.height, asset.spriteSheet.frameWidth, asset.spriteSheet.frameHeight, asset.spriteSheet.frames, body, accent, variant, mood, asset.spriteSheet.animations ?? []);
    }
    return spriteSvg(asset.width, asset.height, body, accent, variant, mood);
  };
  const isFlight = definition.runtimeTemplate === 'flight-shooter';
  const isPlatformer = definition.runtimeTemplate === 'platformer';
  const isAgentDashboard = definition.runtimeTemplate === 'agent-dashboard';
  const isDecisionRoom = definition.runtimeTemplate === 'decision-room';
  if (asset.kind === 'background') return sceneBackdropSvg(asset.width, asset.height, mood, definition);
  if (asset.key === definition.player.spriteKey) return actorSprite(p.player, p.projectile, mood === 'bakery' ? 'bakery-chef' : isFlight ? 'flight-player' : isPlatformer ? 'platform-player' : isAgentDashboard || isDecisionRoom ? 'support' : 'player');
  if (definition.escortSpriteKey === asset.key) return actorSprite(p.xp, p.accent, 'escort');
  if (definition.rescueSpriteKey === asset.key) return actorSprite(p.xp, p.projectile, 'rescue');
  if (definition.defendSpriteKey === asset.key) return actorSprite(p.accent, p.projectile, 'defend-core');
  if (definition.boss?.spriteKey === asset.key) return actorSprite(p.danger, p.accent, isFlight ? 'flight-boss' : isPlatformer ? 'platform-boss' : mood === 'bakery' ? 'bakery-oven-boss' : mood === 'coast' ? 'coast-boss' : 'boss');
  if (enemy) {
    const bakeryVariant = /macaron/i.test(enemy.name)
      ? 'bakery-macaron'
      : /rolling|pin/i.test(enemy.name)
        ? 'bakery-rolling-pin'
        : /proof|dough|bread/i.test(enemy.name)
          ? 'bakery-proofling'
          : `bakery-${enemy.role}`;
    return actorSprite(enemyColor(definition, enemy), p.accent, mood === 'bakery' ? bakeryVariant : isFlight ? `flight-${enemy.role}` : isPlatformer ? `platform-${enemy.role}` : enemy.role);
  }
  if (asset.key === 'bullet') return fxSvg(asset.width, asset.height, p.projectile, 'bullet');
  if (asset.key === 'ebullet') return fxSvg(asset.width, asset.height, p.danger, 'ebullet');
  if (asset.key === 'orb') return fxSvg(asset.width, asset.height, p.xp, 'orb');
  if (asset.kind === 'tile' || asset.key === definition.arena.tileKey) return tileSvg(asset.width, asset.height, p.floor, p.background, p.accent, p.danger, mood);
  return spriteSvg(asset.width, asset.height, p.accent, p.xp, 'brute', mood);
}

function curatedBackdropSource(definition: GameDefinition, asset: Asset): string | null {
  if (asset.kind !== 'background') return null;
  const text = [
    definition.title,
    definition.theme,
    definition.arena.name,
    definition.runtimeTemplate,
    definition.winCondition,
    definition.boss?.name,
    asset.prompt,
  ].filter(Boolean).join(' ').toLowerCase();
  if (definition.runtimeTemplate === 'flight-shooter' && /(airplane|plane|jet|flight|sky|cloud|storm|zeppelin|dogfight|pilot|fighter)/.test(text)) {
    return 'runtime:forge/curated/background/storm-zeppelin-flight.png';
  }
  if (definition.runtimeTemplate === 'platformer' && /(castle|platformer|ledge|clockwork)/.test(text)) {
    return 'runtime:forge/curated/background/castle-platformer.png';
  }
  if (definition.runtimeTemplate === 'puzzle-room' && /(crystal|temple|puzzle|mirror|moon)/.test(text)) {
    return 'runtime:forge/curated/background/crystal-temple-puzzle.png';
  }
  if (
    definition.winCondition === 'defeat-boss' &&
    /(bakery|pizza|kitchen|chef|food|pastr|cake|sugar|bread|oven|portal|summon|summoner|swarm|pantry|baker)/.test(text)
  ) {
    return 'runtime:forge/curated/background/bakery-portal-arena.png';
  }
  if (
    definition.winCondition === 'defeat-boss' &&
    /(ghost|haunt|grave|vampire|witch|crypt|spirit|bone|spooky|horror)/.test(text)
  ) {
    return 'runtime:forge/curated/background/haunted-boss-arena.png';
  }
  if (
    definition.winCondition === 'defeat-boss' &&
    /(shockwave|shock|seismic|quake|earthquake|tremor|sonic|stomp|slam|basalt|fault)/.test(text)
  ) {
    return 'runtime:forge/curated/background/seismic-shockwave-arena.png';
  }
  if (
    definition.winCondition === 'defeat-boss' &&
    /(^|\s)(coast(?:al)?|tide|ocean|sea|waves?|harbor|beach|reef|beast|hound|maw|charge)(\s|$)/.test(text)
  ) {
    return 'runtime:forge/curated/background/coastal-beast-arena.png';
  }
  if (
    (definition.winCondition === 'survive' || definition.winCondition === 'escort') &&
    /(^|\s)(coast(?:al)?|tide|ocean|sea|waves?|harbor|beach|reef|shore)(\s|$)/.test(text)
  ) {
    return 'runtime:forge/curated/background/coastal-survivor-escort.png';
  }
  return null;
}

function curatedSpriteSource(definition: GameDefinition, asset: Asset): string | null {
  if (asset.kind !== 'sprite') return null;
  if (assetMood(definition) === 'bakery' && asset.spriteSheet?.frames === 8) {
    if (definition.player.spriteKey === asset.key && asset.spriteSheet.frameWidth === 48 && asset.spriteSheet.frameHeight === 48) {
      return 'runtime:forge/curated/sprite/bakery-chef-atlas-sheet.png';
    }
    if (definition.boss?.spriteKey === asset.key && asset.spriteSheet.frameWidth === 118 && asset.spriteSheet.frameHeight === 118) {
      return 'runtime:forge/curated/sprite/bakery-overproofed-king-atlas-sheet.png';
    }
    const enemy = definition.enemies.find((candidate) => candidate.spriteKey === asset.key);
    if (enemy && asset.spriteSheet.frameWidth === 44 && asset.spriteSheet.frameHeight === 44) {
      if (/crumb|skitter/i.test(enemy.name)) return 'runtime:forge/curated/sprite/bakery-crumb-skitter-atlas-sheet.png';
      if (/macaron/i.test(enemy.name)) return 'runtime:forge/curated/sprite/bakery-macaron-atlas-sheet.png';
      if (/rolling|pan|pin/i.test(enemy.name)) return 'runtime:forge/curated/sprite/bakery-rolling-pan-atlas-sheet.png';
      if (/proof|dough|bread/i.test(enemy.name)) return 'runtime:forge/curated/sprite/bakery-proofling-atlas-sheet.png';
    }
  }

  if (definition.winCondition !== 'escort') return null;
  if (definition.escortSpriteKey !== asset.key) return null;
  if (assetMood(definition) !== 'coast') return null;
  if (
    asset.spriteSheet?.frameWidth !== 128 ||
    asset.spriteSheet.frameHeight !== 88 ||
    asset.spriteSheet.frames !== 8
  ) {
    return null;
  }
  return 'runtime:forge/curated/sprite/coastal-caravan-escort-sheet.png';
}

function enemyColor(definition: GameDefinition, enemy: Enemy): string {
  const p = definition.palette;
  const index = Math.max(0, definition.enemies.findIndex((candidate) => candidate.id === enemy.id));
  return [p.danger, p.accent, p.xp, p.projectile][index % 4] ?? p.danger;
}

export function attachLocalAssetSources(definition: GameDefinition): GameDefinition {
  return {
    ...definition,
    assets: definition.assets.map((asset) => (
      asset.src ? asset : { ...asset, src: curatedBackdropSource(definition, asset) ?? curatedSpriteSource(definition, asset) ?? generatedSourceForAsset(definition, asset) }
    )),
  };
}
