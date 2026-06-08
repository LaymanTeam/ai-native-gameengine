#!/usr/bin/env -S npx tsx
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { generateImage } from '../engine/ai/providers.ts';

const outputRoot = path.resolve(process.cwd(), 'public', 'runtime', 'forge', 'curated', 'background');

const jobs = [
  {
    id: 'castle-platformer',
    fileName: 'castle-platformer.png',
    prompt: [
      'Create one polished 2D side-view platformer runtime background, 16:9.',
      'Scene: moonlit castle courtyard with crenellated walls, tall towers, readable stone ledges, moss, clockwork details, and clear foreground platform bands.',
      'Composition: strong depth, clear value separation, game-ready silhouette readability, no playable characters.',
      'No UI, no text, no icons, no logos, no frame, no watermark, no debug grid.',
    ].join(' '),
  },
  {
    id: 'coastal-beast-arena',
    fileName: 'coastal-beast-arena.png',
    prompt: [
      'Create one polished 2D game runtime background, 16:9, for a coastal charging beast boss fight.',
      'Scene: stormy shoreline arena with ocean waves, wet sand, dark rocks, foam trails, and a huge recognizable horned sea-beast silhouette emerging from the surf on the right side.',
      'Composition: central playable lane remains readable, the beast silhouette is obvious at thumbnail size, dramatic but not cluttered.',
      'No UI, no text, no icons, no logos, no frame, no watermark, no debug grid.',
    ].join(' '),
  },
  {
    id: 'storm-zeppelin-flight',
    fileName: 'storm-zeppelin-flight.png',
    prompt: [
      'Create one polished painterly 2D side-scrolling flight-shooter runtime background, 16:9.',
      'Scene: turbulent storm-cloud sky at dusk with layered dark blue clouds, rain streaks, lightning glow, distant horizon haze, and no ground.',
      'Subject: a huge recognizable armored zeppelin boss on the far right third with gondola, fins, and broad airship silhouette; two or three small enemy fighter silhouettes in the mid-distance.',
      'Composition: open left third and central flight lane for player/gameplay, high-contrast silhouettes, readable storm clouds and zeppelin at thumbnail size.',
      'No UI, no text, no icons, no logos, no frame, no watermark, no debug grid, no sci-fi interface panels.',
    ].join(' '),
  },
  {
    id: 'seismic-shockwave-arena',
    fileName: 'seismic-shockwave-arena.png',
    prompt: [
      'Create one polished 2D game runtime background, 16:9, for a seismic shockwave stomp boss raid.',
      'Scene: cracked basalt arena inside a volcanic canyon at dusk, broken stone floor plates, glowing magma fissures, dust clouds, falling pebbles, distant cliffs, and heavy impact craters.',
      'Subject: a huge recognizable earth titan boss silhouette on the right third, bulky rocky shoulders and a raised foot or hammer-like arm implying a shockwave stomp.',
      'Composition: central playable arena remains empty and readable, concentric cracked shockwave rings embedded in the ground, strong value separation, readable at thumbnail size.',
      'No ocean, no sea monster, no UI, no text, no icons, no logos, no frame, no watermark, no debug grid.',
    ].join(' '),
  },
  {
    id: 'haunted-boss-arena',
    fileName: 'haunted-boss-arena.png',
    prompt: [
      'Create one polished 2D game runtime background, 16:9, for a haunted crypt boss fight.',
      'Scene: gothic crypt arena with a readable circular stone combat floor, candles, bones, ghost fog, red-violet spirit light, and a spectral monster maw in the far wall.',
      'Composition: central playable floor remains empty and readable, the haunted boss-lair identity is obvious at thumbnail size, dramatic but not cluttered.',
      'No UI, no text, no icons, no logos, no frame, no watermark, no debug grid.',
    ].join(' '),
  },
  {
    id: 'bakery-portal-arena',
    fileName: 'bakery-portal-arena.png',
    prompt: [
      'Create one polished 2D game runtime background, 16:9, for a whimsical bakery portal summoner boss fight.',
      'Scene: warm bakery-tile arena with pastry shelves, flour sacks, sugar sparks, amber lanterns, and a glowing magical oven portal at the far wall.',
      'Composition: central playable floor remains empty and readable, bakery and portal identities are obvious at thumbnail size, cozy but high contrast.',
      'No UI, no text, no icons, no logos, no frame, no watermark, no debug grid.',
    ].join(' '),
  },
  {
    id: 'coastal-survivor-escort',
    fileName: 'coastal-survivor-escort.png',
    prompt: [
      'Create one polished 2D game runtime background, 16:9, for cozy coastal survivor and escort objectives.',
      'Scene: sandy beach meadow with turquoise waves, tide pools, grass, driftwood, lantern beacons, supply crates, and caravan path markers around the edges.',
      'Composition: central playable area remains empty and readable, warm bright palette, clear coastal identity, no playable characters.',
      'No UI, no text, no icons, no logos, no frame, no watermark, no debug grid.',
    ].join(' '),
  },
  {
    id: 'crystal-temple-puzzle',
    fileName: 'crystal-temple-puzzle.png',
    prompt: [
      'Create one polished 2D top-down puzzle-room runtime background, 16:9.',
      'Scene: crystal temple chamber with an integrated square stone puzzle grid, moon gate, glowing crystal columns, mirror plinths, switches, and clean floor paths.',
      'Composition: readable board area, strong crystal-temple identity, dark blue stone with cyan and violet highlights, game-ready not abstract.',
      'No UI, no text, no icons, no logos, no frame, no watermark, no debug grid.',
    ].join(' '),
  },
];

function dataUrlToBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('generated image returned no base64 payload');
  return Buffer.from(base64, 'base64');
}

async function generateWithFallback(prompt) {
  try {
    return await generateImage(prompt, { pro: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[generate-curated-forge-assets] pro generation failed, retrying flash: ${message}`);
    return generateImage(prompt, { pro: false });
  }
}

await mkdir(outputRoot, { recursive: true });

for (const job of jobs) {
  console.log(`[generate-curated-forge-assets] generating ${job.id}`);
  const generated = await generateWithFallback(job.prompt);
  const normalized = await sharp(dataUrlToBuffer(generated.dataUrl), { failOn: 'none' })
    .resize(1280, 720, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  const target = path.join(outputRoot, job.fileName);
  await writeFile(target, normalized);
  console.log(`[generate-curated-forge-assets] wrote ${path.relative(process.cwd(), target)}`);
}
