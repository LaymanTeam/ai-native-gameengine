#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outputRoot = path.resolve(process.cwd(), 'public', 'runtime', 'forge', 'curated', 'sprite');

function flightForegroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs>
  <filter id="soft-shadow" x="-40%" y="-60%" width="180%" height="220%">
    <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#02050b" flood-opacity=".55"/>
  </filter>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="4" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="heroHull" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f5e4b9"/>
    <stop offset=".45" stop-color="#b9934f"/>
    <stop offset="1" stop-color="#3b2e24"/>
  </linearGradient>
  <linearGradient id="enemyHull" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8fa6b6"/>
    <stop offset=".5" stop-color="#3e5a70"/>
    <stop offset="1" stop-color="#171f2a"/>
  </linearGradient>
  <linearGradient id="redHull" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#c98c82"/>
    <stop offset=".48" stop-color="#8e3e4c"/>
    <stop offset="1" stop-color="#231b24"/>
  </linearGradient>
  <radialGradient id="muzzle" cx=".5" cy=".5" r=".7">
    <stop offset="0" stop-color="#fff8c7" stop-opacity="1"/>
    <stop offset=".45" stop-color="#ffb84a" stop-opacity=".75"/>
    <stop offset="1" stop-color="#ff7a36" stop-opacity="0"/>
  </radialGradient>
</defs>
<g opacity=".82" filter="url(#glow)">
  <path d="M318 374 C390 356 451 344 518 335" stroke="#ffd76b" stroke-width="4" stroke-linecap="round" stroke-opacity=".32" fill="none"/>
  <path d="M336 400 C419 392 493 383 574 370" stroke="#8de8ff" stroke-width="3" stroke-linecap="round" stroke-opacity=".24" fill="none"/>
  <path d="M708 296 C790 277 858 263 945 245" stroke="#ffad74" stroke-width="4" stroke-linecap="round" stroke-opacity=".2" fill="none"/>
  <circle cx="958" cy="238" r="20" fill="url(#muzzle)" opacity=".42"/>
</g>
<g transform="translate(238 421) rotate(-8) scale(1.22)" filter="url(#soft-shadow)">
  <ellipse cx="0" cy="42" rx="86" ry="18" fill="#02040a" opacity=".34"/>
  <g>
  <path d="M-104 0 C-54 -34 45 -33 126 -2 C42 30 -50 38 -104 0Z" fill="url(#heroHull)" stroke="#e9d49a" stroke-width="4"/>
  <path d="M-16 -5 L-82 -76 L34 -22 Z" fill="#c69c49" stroke="#ead29a" stroke-width="3"/>
  <path d="M-14 7 L-82 76 L38 25 Z" fill="#8d642f" stroke="#d2a85f" stroke-width="3"/>
  <path d="M-83 -15 L-128 -44 M-82 16 L-128 44" stroke="#fff4bf" stroke-width="8" stroke-linecap="round"/>
  <ellipse cx="44" cy="-10" rx="35" ry="16" fill="#e6fbff" opacity=".78"/>
  <path d="M83 -3 L138 -3" stroke="#fff9d6" stroke-width="9" stroke-linecap="round"/>
  <path d="M-34 -15 H31 M-47 11 H22" stroke="#49351e" stroke-width="5" stroke-linecap="round" opacity=".42"/>
  <path d="M-60 -2 H82 M-12 -34 V30 M20 -28 V25" stroke="#23170d" stroke-width="2" stroke-opacity=".32"/>
  <circle cx="-40" cy="-8" r="3" fill="#2a1b0f" opacity=".45"/><circle cx="-12" cy="-11" r="3" fill="#2a1b0f" opacity=".45"/><circle cx="16" cy="-10" r="3" fill="#2a1b0f" opacity=".45"/>
  <circle cx="92" cy="-3" r="10" fill="#fff7b8"/>
  </g>
</g>
<g transform="translate(497 266) rotate(9) scale(.82)" filter="url(#soft-shadow)">
  <g>
  <path d="M-86 0 C-44 -30 36 -28 96 -1 C34 28 -42 32 -86 0Z" fill="url(#redHull)" stroke="#ffc3ba" stroke-width="3"/>
  <path d="M-10 -5 L-62 -54 L32 -16 Z" fill="#f47d7d" stroke="#ffcec8" stroke-width="2"/>
  <path d="M-9 8 L-58 54 L32 20 Z" fill="#8b4458" stroke="#ef9aa3" stroke-width="2"/>
  <ellipse cx="31" cy="-7" rx="23" ry="11" fill="#9befff" opacity=".5"/>
  <path d="M-70 -11 L-102 -30 M-70 13 L-101 31" stroke="#ffddd6" stroke-width="5" stroke-linecap="round"/>
  <path d="M-44 -2 H54 M6 -25 V20" stroke="#120e14" stroke-width="2" stroke-opacity=".32"/>
  </g>
</g>
<g transform="translate(637 344) rotate(-13) scale(.76)" filter="url(#soft-shadow)">
  <g>
  <path d="M-88 0 C-44 -31 38 -28 100 -1 C35 28 -43 34 -88 0Z" fill="url(#enemyHull)" stroke="#c8e9ff" stroke-width="3"/>
  <path d="M-10 -5 L-63 -57 L34 -18 Z" fill="#6c96b2" stroke="#d4efff" stroke-width="2"/>
  <path d="M-10 8 L-61 55 L35 21 Z" fill="#2a425b" stroke="#a1c9e6" stroke-width="2"/>
  <ellipse cx="31" cy="-7" rx="22" ry="11" fill="#def8ff" opacity=".52"/>
  <circle cx="78" cy="-2" r="7" fill="#fff6b2"/>
  <path d="M-46 -1 H58 M4 -25 V22" stroke="#08101a" stroke-width="2" stroke-opacity=".34"/>
  </g>
</g>
<g transform="translate(947 297) rotate(6) scale(.95)" filter="url(#soft-shadow)">
  <g>
  <path d="M-98 0 C-48 -36 45 -32 116 -2 C42 33 -50 39 -98 0Z" fill="url(#redHull)" stroke="#ffc3ba" stroke-width="3"/>
  <path d="M-13 -5 L-72 -67 L40 -21 Z" fill="#f06d77" stroke="#ffd2cd" stroke-width="2"/>
  <path d="M-11 9 L-72 66 L42 24 Z" fill="#88415a" stroke="#f2a2a8" stroke-width="2"/>
  <ellipse cx="39" cy="-8" rx="28" ry="13" fill="#92e8ff" opacity=".48"/>
  <circle cx="91" cy="-2" r="8" fill="#fff0a0"/>
  <path d="M-50 -2 H72 M8 -28 V24" stroke="#120e14" stroke-width="2" stroke-opacity=".34"/>
  </g>
</g>
<g opacity=".75" filter="url(#glow)">
  <circle cx="335" cy="358" r="8" fill="#ffe78d"/>
  <circle cx="357" cy="349" r="6" fill="#ffe78d"/>
  <circle cx="380" cy="342" r="4" fill="#fff3b8"/>
  <path d="M382 418 C486 409 596 394 728 370" stroke="#7ee7ff" stroke-width="3" stroke-linecap="round" stroke-opacity=".36" fill="none"/>
</g>
</svg>`;
}

function shockwaveForegroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs>
  <filter id="lava-glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="5" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="dust" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="7"/>
  </filter>
  <linearGradient id="crack" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff2a8"/>
    <stop offset=".45" stop-color="#ff8a3c"/>
    <stop offset="1" stop-color="#6d210b"/>
  </linearGradient>
  <radialGradient id="dustGlow" cx=".55" cy=".5" r=".7">
    <stop offset="0" stop-color="#ffd8a4" stop-opacity=".46"/>
    <stop offset=".55" stop-color="#b56b35" stop-opacity=".18"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0"/>
  </radialGradient>
</defs>
<ellipse cx="812" cy="448" rx="440" ry="136" fill="url(#dustGlow)" filter="url(#dust)" opacity=".72"/>
<g filter="url(#lava-glow)" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M677 424 C742 390 863 392 930 424 C888 452 733 455 677 424Z" stroke="#ffe0a2" stroke-width="4" stroke-opacity=".46"/>
  <path d="M574 410 C681 348 933 349 1052 414 C1001 474 628 475 574 410Z" stroke="#ff9a4f" stroke-width="5" stroke-opacity=".38"/>
  <path d="M444 416 C604 315 1002 317 1185 420 C1102 535 545 538 444 416Z" stroke="#f06d34" stroke-width="6" stroke-opacity=".25"/>
  <path d="M704 425 L622 397 L573 415 L501 388 L452 404" stroke="url(#crack)" stroke-width="6" stroke-opacity=".82"/>
  <path d="M812 454 L758 508 L670 517 L618 570 L552 584" stroke="url(#crack)" stroke-width="6" stroke-opacity=".72"/>
  <path d="M875 421 L982 389 L1058 409 L1148 369 L1206 381" stroke="url(#crack)" stroke-width="6" stroke-opacity=".72"/>
  <path d="M882 464 L963 523 L1054 518 L1138 566" stroke="url(#crack)" stroke-width="5" stroke-opacity=".56"/>
  <path d="M756 407 L716 340 M842 402 L902 334 M742 464 L698 495 M896 452 L955 486" stroke="#ffe7a6" stroke-width="3" stroke-opacity=".34"/>
  <path d="M604 452 C666 437 718 435 780 444 M930 444 C995 437 1044 444 1098 462" stroke="#2a1208" stroke-width="7" stroke-opacity=".22"/>
</g>
<g opacity=".62">
  <circle cx="642" cy="352" r="7" fill="#f4b36a"/>
  <circle cx="1032" cy="330" r="8" fill="#d87a43"/>
  <circle cx="1002" cy="499" r="5" fill="#ffd28a"/>
  <circle cx="552" cy="467" r="5" fill="#f09a54"/>
  <circle cx="710" cy="520" r="4" fill="#ffd59a"/>
</g>
<g transform="translate(492 430) scale(1.04)" filter="url(#lava-glow)" opacity=".95">
  <ellipse cx="-2" cy="72" rx="88" ry="22" fill="#030201" opacity=".52"/>
  <path d="M-49 -4 C-42 -54 -5 -86 38 -74 C76 -49 88 -3 66 42 C36 81 -22 83 -55 45 C-68 25 -68 8 -49 -4Z" fill="#12100f" stroke="#ffb45d" stroke-width="5" stroke-linejoin="round"/>
  <path d="M-28 -36 C-10 -67 35 -66 56 -35 C49 -12 13 -1 -19 -14 Z" fill="#1d1a18" stroke="#ffe0a0" stroke-width="4" stroke-linejoin="round"/>
  <path d="M-20 -29 C1 -39 30 -37 47 -21" stroke="#fff1b8" stroke-width="3" stroke-linecap="round" opacity=".7"/>
  <path d="M-45 -2 C-98 -8 -131 -39 -121 -76 C-67 -80 -29 -52 -11 -16 Z" fill="#2d1912" stroke="#f48a42" stroke-width="5" stroke-linejoin="round"/>
  <path d="M35 0 C78 -7 119 -32 140 -67 C150 -18 107 36 49 50 Z" fill="#38160f" stroke="#ffc06e" stroke-width="5" stroke-linejoin="round"/>
  <path d="M-33 7 C-14 22 19 24 48 10" stroke="#6c3a1e" stroke-width="6" stroke-linecap="round" opacity=".7"/>
  <path d="M-44 50 L-73 96 M34 52 L66 96" stroke="#1e140f" stroke-width="17" stroke-linecap="round"/>
  <path d="M-44 50 L-73 96 M34 52 L66 96" stroke="#ffbe68" stroke-width="5" stroke-linecap="round" opacity=".66"/>
  <path d="M-57 12 L-112 46 M53 13 L111 -2" stroke="#1d130f" stroke-width="15" stroke-linecap="round"/>
  <path d="M-57 12 L-112 46 M53 13 L111 -2" stroke="#ffd084" stroke-width="4" stroke-linecap="round" opacity=".56"/>
  <path d="M-30 -1 L8 6 L39 -4 M-24 24 L15 31 L50 22" stroke="#ff8b42" stroke-width="3" stroke-linecap="round" opacity=".54"/>
  <path d="M-86 40 C-48 65 16 69 74 38" stroke="#fff1bd" stroke-width="4" stroke-linecap="round" opacity=".38" fill="none"/>
</g>
</svg>`;
}

function coastalChargeForegroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs>
  <filter id="hard-shadow" x="-45%" y="-55%" width="190%" height="210%">
    <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#01040a" flood-opacity=".72"/>
  </filter>
  <filter id="hot-glow" x="-70%" y="-70%" width="240%" height="240%">
    <feGaussianBlur stdDeviation="5" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="lane" x1="1" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff2a8" stop-opacity=".82"/>
    <stop offset=".38" stop-color="#ff6f3b" stop-opacity=".66"/>
    <stop offset="1" stop-color="#e52c50" stop-opacity=".08"/>
  </linearGradient>
  <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f7fbff"/>
    <stop offset=".42" stop-color="#80d8ff"/>
    <stop offset="1" stop-color="#1d5574"/>
  </linearGradient>
  <linearGradient id="beast" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffe2a5"/>
    <stop offset=".42" stop-color="#df653e"/>
    <stop offset="1" stop-color="#331018"/>
  </linearGradient>
  <radialGradient id="impact" cx=".5" cy=".5" r=".62">
    <stop offset="0" stop-color="#fff9d3" stop-opacity=".92"/>
    <stop offset=".36" stop-color="#ff9d48" stop-opacity=".62"/>
    <stop offset="1" stop-color="#ff264f" stop-opacity="0"/>
  </radialGradient>
</defs>
<g opacity=".78" filter="url(#hot-glow)">
  <path d="M884 218 C742 275 556 356 305 474" stroke="#12070b" stroke-width="84" stroke-linecap="round" stroke-opacity=".28" fill="none"/>
  <path d="M884 218 C742 275 556 356 305 474" stroke="url(#lane)" stroke-width="58" stroke-linecap="round" stroke-opacity=".62" fill="none"/>
  <path d="M841 235 C695 294 540 370 348 457" stroke="#fff1ba" stroke-width="6" stroke-linecap="round" stroke-opacity=".78" fill="none"/>
  <path d="M879 264 C735 320 580 395 378 498" stroke="#ff365e" stroke-width="8" stroke-linecap="round" stroke-opacity=".58" fill="none"/>
  <path d="M670 332 L603 300 L620 360 Z M548 391 L484 362 L501 421 Z M428 448 L366 421 L383 478 Z" fill="#fff4bf" opacity=".56"/>
</g>
<g filter="url(#hot-glow)" opacity=".88">
  <circle cx="862" cy="216" r="86" fill="none" stroke="#fff2bd" stroke-width="7" stroke-opacity=".62"/>
  <circle cx="862" cy="216" r="58" fill="none" stroke="#ff7044" stroke-width="8" stroke-opacity=".68"/>
  <path d="M777 224 C822 183 904 179 955 216 C930 248 868 267 812 255" fill="none" stroke="#ffc66e" stroke-width="8" stroke-linecap="round" stroke-opacity=".72"/>
  <path d="M820 150 L772 90 L851 126 M911 151 L983 100 L945 178" fill="none" stroke="#fff0b8" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".72"/>
  <circle cx="836" cy="206" r="10" fill="#fff9d0"/>
  <circle cx="884" cy="210" r="8" fill="#ffe28f"/>
</g>
<g transform="translate(302 479) rotate(-17)" filter="url(#hard-shadow)">
  <ellipse cx="0" cy="54" rx="84" ry="22" fill="#00040a" opacity=".44"/>
  <path d="M-58 24 C-44 -32 17 -55 57 -9 C69 32 39 69 -7 73 C-43 64 -68 43 -58 24Z" fill="url(#hero)" stroke="#f6fbff" stroke-width="6"/>
  <path d="M-21 -42 C-8 -66 34 -63 47 -34 C38 -13 2 -10 -21 -42Z" fill="#e9fbff" stroke="#1a3347" stroke-width="4"/>
  <path d="M-59 8 C-99 -16 -120 -54 -107 -81 C-57 -65 -36 -31 -34 8Z" fill="#ffe06f" stroke="#fff8c0" stroke-width="5"/>
  <path d="M44 8 C87 -4 126 -32 145 -63 C155 -29 124 18 60 39Z" fill="#ff7f45" stroke="#ffd49a" stroke-width="5"/>
  <path d="M-36 56 L-70 94 M34 57 L70 91 M-43 13 L-91 38 M48 19 L93 12" stroke="#d6f5ff" stroke-width="10" stroke-linecap="round"/>
  <circle cx="8" cy="-36" r="7" fill="#09151f"/>
</g>
<g filter="url(#hot-glow)">
  <circle cx="434" cy="425" r="42" fill="url(#impact)" opacity=".72"/>
  <circle cx="505" cy="393" r="22" fill="url(#impact)" opacity=".54"/>
  <path d="M258 519 C307 546 389 553 462 528" stroke="#9be8ff" stroke-width="7" stroke-linecap="round" stroke-opacity=".62" fill="none"/>
  <path d="M241 553 C329 588 449 589 540 546" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-opacity=".45" fill="none"/>
  <path d="M616 356 C665 334 718 313 771 292" stroke="#fff4b0" stroke-width="4" stroke-linecap="round" stroke-dasharray="18 18" stroke-opacity=".72" fill="none"/>
</g>
</svg>`;
}

const jobs = [
  { fileName: 'storm-zeppelin-flight-foreground.png', svg: flightForegroundSvg },
  { fileName: 'seismic-shockwave-foreground.png', svg: shockwaveForegroundSvg },
  { fileName: 'coastal-beast-charge-foreground.png', svg: coastalChargeForegroundSvg },
];

await mkdir(outputRoot, { recursive: true });
for (const job of jobs) {
  const target = path.join(outputRoot, job.fileName);
  await sharp(Buffer.from(job.svg()), { density: 144 })
    .resize(1280, 720, { fit: 'fill' })
    .png()
    .toFile(target);
  console.log(`[generate-curated-foreground-assets] wrote ${path.relative(process.cwd(), target)}`);
}
