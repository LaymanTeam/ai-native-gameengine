#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const baseUrl = process.env.SELFTEST_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3027'}`;
const screenshotDir = process.env.VISUAL_MATRIX_SCREENSHOT_DIR ?? mkdtempSync(path.join(tmpdir(), 'hackathon-multimodal-forge-visual-matrix-'));
const minPairDistance = Number(process.env.VISUAL_MATRIX_MIN_PAIR_DISTANCE ?? '0.004');
const minAverageDistance = Number(process.env.VISUAL_MATRIX_MIN_AVERAGE_DISTANCE ?? '0.055');
const baselineManifestPath = process.env.VISUAL_MATRIX_BASELINE ?? '';
const maxBaselineDistance = Number(process.env.VISUAL_MATRIX_MAX_BASELINE_DISTANCE ?? '0.16');
const visualReviewMode = (process.env.VISUAL_MATRIX_REVIEW_MODE ?? 'local').toLowerCase();
const minReviewScore = Number(process.env.VISUAL_MATRIX_MIN_REVIEW_SCORE ?? '30');
const visualReviewModel = process.env.VISUAL_MATRIX_REVIEW_MODEL ?? 'gemini-3.1-flash-lite';
const curatedBaselineOut = process.env.VISUAL_MATRIX_BASELINE_OUT ?? '';
const scenarioFilterSpec = process.env.VISUAL_MATRIX_SCENARIOS ?? process.env.VISUAL_MATRIX_SCENARIO ?? '';
const scenarioMatchMode = (process.env.VISUAL_MATRIX_SCENARIO_MATCH ?? 'exact').toLowerCase();
const skipDiversity = /^(1|true|yes)$/i.test(process.env.VISUAL_MATRIX_SKIP_DIVERSITY ?? '');
const firstGameVerticalSlice = JSON.parse(readFileSync(path.join(cwd, 'engine/runtime/first-game.json'), 'utf8'));

const allScenarios = [
  {
    id: 'first-game-tablet',
    prompt: firstGameVerticalSlice.prompt,
    objective: 'first-game',
    defaultIncluded: false,
  },
  { id: 'boss-tablet', prompt: 'haunted boss raid', objective: 'defeat-boss' },
  { id: 'beam-boss-tablet', prompt: 'neon laser beam boss raid', objective: 'defeat-boss-beam' },
  { id: 'laser-grid-boss-tablet', prompt: 'neon laser grid security boss raid', objective: 'defeat-boss-laser-grid' },
  { id: 'charge-boss-tablet', prompt: 'coastal charging beast boss raid', objective: 'defeat-boss-charge' },
  { id: 'summon-boss-tablet', prompt: 'bakery portal swarm summoner boss raid', objective: 'defeat-boss-summon' },
  { id: 'minefield-boss-tablet', prompt: 'neon minefield trap boss raid', objective: 'defeat-boss-minefield' },
  { id: 'vortex-boss-tablet', prompt: 'gravity vortex singularity boss raid', objective: 'defeat-boss-vortex' },
  { id: 'shockwave-boss-tablet', prompt: 'seismic shockwave stomp boss raid', objective: 'defeat-boss-shockwave' },
  { id: 'flight-tablet', prompt: 'fast airplane shooter with storm clouds enemy fighters and a zeppelin boss', objective: 'flight-shooter' },
  { id: 'platformer-tablet', prompt: 'castle platformer jump quest with ledge monsters and a clockwork boss', objective: 'platformer' },
  { id: 'puzzle-room-tablet', prompt: 'crystal temple puzzle where an archivist pushes mirrors onto switches and opens a moon gate', objective: 'solve-puzzle' },
  { id: 'decision-room-tablet', prompt: 'boardroom decision app for a product launch with stakeholders evidence options recommendation and audit trail', objective: 'select-decision' },
  { id: 'agent-dashboard-tablet', prompt: 'agent operations dashboard for shipping a Vercel game app with queues approvals logs and deployment health', objective: 'approve-deploy' },
  { id: 'score-tablet', prompt: 'neon arcade score attack', objective: 'score-target' },
  { id: 'survive-tablet', prompt: 'a cozy coastal survivor gathering light', objective: 'survive' },
  { id: 'relic-tablet', prompt: 'crystal relic hunt collectathon', objective: 'collect-relics' },
  { id: 'capture-tablet', prompt: 'neon ritual capture zone control run', objective: 'capture-zone' },
  { id: 'escort-tablet', prompt: 'coastal caravan escort protect companion run', objective: 'escort' },
  { id: 'defend-tablet', prompt: 'neon reactor core defense run', objective: 'defend-core' },
  { id: 'repair-tablet', prompt: 'neon uplink repair node network run', objective: 'repair-nodes' },
  { id: 'extract-tablet', prompt: 'neon extraction escape portal run', objective: 'extract' },
  { id: 'rescue-tablet', prompt: 'neon rescue stranded survivor extraction run', objective: 'rescue' },
  { id: 'unlock-tablet', prompt: 'neon vault keycard unlock escape run', objective: 'unlock-gate' },
];

function parseScenarioFilter(spec) {
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function scenarioMatchesFilter(scenario, filter) {
  if (scenario.id === filter || scenario.objective === filter) return true;
  if (scenarioMatchMode === 'fuzzy') {
    return scenario.id.includes(filter) || scenario.objective.includes(filter);
  }
  return false;
}

function selectScenarios(available, filters) {
  if (filters.length === 0) return available.filter((scenario) => scenario.defaultIncluded !== false);
  if (!['exact', 'fuzzy'].includes(scenarioMatchMode)) {
    throw new Error(`VISUAL_MATRIX_SCENARIO_MATCH must be exact or fuzzy; got ${scenarioMatchMode}`);
  }
  const selected = [];
  const missing = [];
  for (const filter of filters) {
    const matches = available.filter((scenario) => scenarioMatchesFilter(scenario, filter));
    if (matches.length === 0) {
      missing.push(filter);
      continue;
    }
    for (const match of matches) {
      if (!selected.some((scenario) => scenario.id === match.id)) selected.push(match);
    }
  }
  if (missing.length > 0) {
    throw new Error(`VISUAL_MATRIX_SCENARIOS did not match: ${missing.join(', ')}`);
  }
  return selected;
}

const scenarioFilters = parseScenarioFilter(scenarioFilterSpec);
const scenarios = selectScenarios(allScenarios, scenarioFilters);

function log(message) {
  console.log(`[forge-visual-matrix] ${message}`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scaleScore(value, low, high) {
  if (value <= low) return 0;
  if (value >= high) return 100;
  return Math.round(((value - low) / (high - low)) * 100);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default;
  } catch (error) {
    throw new Error(`sharp not available for visual matrix analysis: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runSelftestScenario(scenario) {
  const url = `${baseUrl}/forge?play&selftest=1&prompt=${encodeURIComponent(scenario.prompt)}`;
  const env = {
    ...process.env,
    SELFTEST_URL: url,
    SELFTEST_VIEWPORTS: `${scenario.id}:900x900`,
    SELFTEST_SCREENSHOT_DIR: screenshotDir,
  };
  log(`running ${scenario.objective} prompt at ${scenario.id}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:browser'], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 24 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${scenario.id} browser self-test failed with exit ${result.status ?? 'unknown'}`);
  }
  return parseScenarioOutput(scenario, `${result.stdout}\n${result.stderr}`);
}

function parseScenarioOutput(scenario, output) {
  const id = escapeRegex(scenario.id);
  const screenshotMatch = new RegExp(`\\[${id}\\] PASS play screenshot captured \\(([^)]+)\\)`).exec(output);
  const cropMatch = new RegExp(`\\[${id}\\] PASS play canvas crop has visual detail \\((\\d+)x(\\d+) crop @ (\\d+),(\\d+),`).exec(output);
  if (!screenshotMatch?.[1]) throw new Error(`${scenario.id} did not report a captured screenshot`);
  if (!cropMatch) throw new Error(`${scenario.id} did not report a canvas crop`);
  const screenshotPath = screenshotMatch[1];
  if (!existsSync(screenshotPath)) throw new Error(`${scenario.id} screenshot file does not exist: ${screenshotPath}`);
  return {
    ...scenario,
    screenshotPath,
    crop: {
      width: Number(cropMatch[1]),
      height: Number(cropMatch[2]),
      left: Number(cropMatch[3]),
      top: Number(cropMatch[4]),
    },
  };
}

async function buildSignature(sharp, scenario) {
  const targetWidth = 48;
  const targetHeight = 27;
  const cropPath = path.join(screenshotDir, `canvas-${scenario.id}.png`);
  const cropImage = sharp(readFileSync(scenario.screenshotPath), { failOn: 'none' })
    .ensureAlpha()
    .extract({
      left: scenario.crop.left,
      top: scenario.crop.top,
      width: scenario.crop.width,
      height: scenario.crop.height,
    });
  await cropImage.clone().png().toFile(cropPath);
  const raw = await cropImage
    .clone()
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .raw()
    .toBuffer();

  const signature = [];
  const buckets = new Set();
  const lumas = [];
  let lumaSum = 0;
  let chromaSum = 0;
  let minLuma = 255;
  let maxLuma = 0;
  for (let px = 0; px < targetWidth * targetHeight; px++) {
    const i = px * 4;
    const r = raw[i] ?? 0;
    const g = raw[i + 1] ?? 0;
    const b = raw[i + 2] ?? 0;
    signature.push(r, g, b);
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    lumas.push(luma);
    lumaSum += luma;
    chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
  }

  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const current = lumas[y * targetWidth + x] ?? 0;
      if (x < targetWidth - 1) {
        edgeTotal += Math.abs(current - (lumas[y * targetWidth + x + 1] ?? current));
        edgeCount++;
      }
      if (y < targetHeight - 1) {
        edgeTotal += Math.abs(current - (lumas[(y + 1) * targetWidth + x] ?? current));
        edgeCount++;
      }
    }
  }

  const quadrants = [
    { sum: 0, count: 0 },
    { sum: 0, count: 0 },
    { sum: 0, count: 0 },
    { sum: 0, count: 0 },
  ];
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const index = (y < targetHeight / 2 ? 0 : 2) + (x < targetWidth / 2 ? 0 : 1);
      quadrants[index].sum += lumas[y * targetWidth + x] ?? 0;
      quadrants[index].count++;
    }
  }
  const quadrantMeans = quadrants.map((quadrant) => quadrant.count > 0 ? quadrant.sum / quadrant.count : 0);

  const pixels = targetWidth * targetHeight;
  return {
    ...scenario,
    canvasCropPath: cropPath,
    canvasCropFile: path.basename(cropPath),
    screenshotFile: path.basename(scenario.screenshotPath),
    signature,
    visual: {
      sampledSize: `${targetWidth}x${targetHeight}`,
      colorBuckets: buckets.size,
      meanLuma: Number((lumaSum / pixels).toFixed(2)),
      meanChroma: Number((chromaSum / pixels).toFixed(2)),
      lumaRange: Number((maxLuma - minLuma).toFixed(2)),
      edgeDensity: Number(((edgeCount > 0 ? edgeTotal / edgeCount : 0) / 255).toFixed(4)),
      quadrantLumaSpread: Number((Math.max(...quadrantMeans) - Math.min(...quadrantMeans)).toFixed(2)),
    },
  };
}

function signatureDistance(a, b) {
  let total = 0;
  for (let i = 0; i < a.signature.length; i++) {
    total += Math.abs(a.signature[i] - b.signature[i]);
  }
  return total / (a.signature.length * 255);
}

function pairwiseDistances(signatures) {
  const pairs = [];
  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      pairs.push({
        a: signatures[i].id,
        b: signatures[j].id,
        objectives: `${signatures[i].objective}/${signatures[j].objective}`,
        distance: Number(signatureDistance(signatures[i], signatures[j]).toFixed(4)),
      });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  return pairs;
}

function loadBaselineComparison(signatures) {
  if (!baselineManifestPath) return { enabled: false };

  const baseline = JSON.parse(readFileSync(baselineManifestPath, 'utf8'));
  const baselineSignatures = Array.isArray(baseline.signatures) ? baseline.signatures : [];
  const baselineById = new Map(
    baselineSignatures
      .filter((entry) => typeof entry?.id === 'string' && Array.isArray(entry.signature))
      .map((entry) => [entry.id, entry]),
  );
  const comparisons = signatures.map((current) => {
    const baselineEntry = baselineById.get(current.id);
    if (!baselineEntry) {
      return {
        id: current.id,
        objective: current.objective,
        pass: false,
        status: 'missing-baseline',
        distance: null,
      };
    }
    if (baselineEntry.signature.length !== current.signature.length) {
      return {
        id: current.id,
        objective: current.objective,
        pass: false,
        status: 'signature-size-mismatch',
        distance: null,
      };
    }
    const distance = Number(signatureDistance(current, baselineEntry).toFixed(4));
    return {
      id: current.id,
      objective: current.objective,
      pass: distance <= maxBaselineDistance,
      status: distance <= maxBaselineDistance ? 'within-baseline' : 'drifted',
      distance,
    };
  });
  const numericDistances = comparisons
    .map((comparison) => comparison.distance)
    .filter((distance) => typeof distance === 'number');
  return {
    enabled: true,
    path: baselineManifestPath,
    maxDistance: maxBaselineDistance,
    pass: comparisons.every((comparison) => comparison.pass),
    compared: numericDistances.length,
    maxObservedDistance: numericDistances.length > 0 ? Math.max(...numericDistances) : null,
    comparisons,
  };
}

function localReviewScenario(scenario) {
  const visual = scenario.visual;
  const rubric = {
    colorVariety: scaleScore(visual.colorBuckets, 10, 24),
    contrast: scaleScore(visual.lumaRange, 35, 150),
    chroma: scaleScore(visual.meanChroma, 6, 22),
    spatialDetail: scaleScore(visual.edgeDensity, 0.006, 0.022),
    composition: scaleScore(visual.quadrantLumaSpread, 0.5, 5),
  };
  const score = Math.round(
    rubric.colorVariety * 0.3 +
      rubric.contrast * 0.2 +
      rubric.chroma * 0.25 +
      rubric.spatialDetail * 0.2 +
      rubric.composition * 0.05,
  );
  const issues = [];
  if (rubric.colorVariety < 35) issues.push(`low color variety (${visual.colorBuckets} coarse buckets)`);
  if (rubric.contrast < 35) issues.push(`low luminance range (${visual.lumaRange})`);
  if (rubric.chroma < 35) issues.push(`muted palette/chroma (${visual.meanChroma})`);
  if (rubric.spatialDetail < 35) issues.push(`low edge/detail density (${visual.edgeDensity})`);
  if (rubric.composition < 20) issues.push(`flat quadrant composition (${visual.quadrantLumaSpread})`);
  return {
    id: scenario.id,
    objective: scenario.objective,
    mode: 'local',
    score,
    pass: score >= minReviewScore,
    rubric,
    issues,
    rationale: issues.length > 0
      ? `Local canvas-crop reviewer found ${issues.length} visual concern(s).`
      : 'Local canvas-crop reviewer found sufficient color, contrast, detail, and composition variety.',
  };
}

function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('model review returned no JSON object');
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeModelReview(raw, scenario) {
  const score = clamp(Math.round(Number(raw?.score ?? 0)), 0, 100);
  const issues = Array.isArray(raw?.issues) ? raw.issues.map((issue) => String(issue)).filter(Boolean) : [];
  const tags = Array.isArray(raw?.tags) ? raw.tags.map((tag) => String(tag)).filter(Boolean) : [];
  return {
    id: scenario.id,
    objective: scenario.objective,
    mode: 'model',
    model: visualReviewModel,
    score,
    pass: raw?.pass === false ? false : score >= minReviewScore,
    rubric: raw?.rubric && typeof raw.rubric === 'object' ? raw.rubric : null,
    tags,
    issues,
    rationale: typeof raw?.rationale === 'string' && raw.rationale.trim()
      ? raw.rationale.trim()
      : 'Model reviewer did not provide a rationale.',
  };
}

async function modelReviewScenario(scenario) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('VISUAL_MATRIX_REVIEW_MODE=model requires GOOGLE_API_KEY');
  }
  if (typeof fetch !== 'function') {
    throw new Error('VISUAL_MATRIX_REVIEW_MODE=model requires a global fetch implementation');
  }
  const imageData = readFileSync(scenario.canvasCropPath).toString('base64');
  const prompt = [
    'You are reviewing a 2D Phaser game screenshot crop for an AI game engine QA gate.',
    'Be strict but practical. Score whether this crop looks like a playable, readable game scene',
    'with clear subject silhouettes, non-flat composition, objective-specific visual identity, and enough polish.',
    '',
    `Scenario: ${scenario.id}`,
    `Prompt: ${scenario.prompt}`,
    `Objective: ${scenario.objective}`,
    `Metrics: colors=${scenario.visual.colorBuckets}, meanLuma=${scenario.visual.meanLuma}, meanChroma=${scenario.visual.meanChroma}, lumaRange=${scenario.visual.lumaRange}, edgeDensity=${scenario.visual.edgeDensity}`,
    '',
    'Return exactly one JSON object:',
    '{"score":0-100,"pass":true|false,"rubric":{"readability":0-100,"objectiveClarity":0-100,"composition":0-100,"polish":0-100},"issues":["concrete issue"],"tags":["short tag"],"rationale":"one sentence"}',
  ].join('\n');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${visualReviewModel}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: imageData } },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`model review HTTP ${response.status}: ${rawText.slice(0, 300)}`);
  }
  const parsed = JSON.parse(rawText);
  const text = (parsed.candidates?.[0]?.content?.parts ?? [])
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('\n');
  return normalizeModelReview(extractJsonObject(text), scenario);
}

function modelReviewFailureItem(scenario, error, skipped = false) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: scenario.id,
    objective: scenario.objective,
    mode: 'model',
    model: visualReviewModel,
    score: 0,
    pass: false,
    rubric: null,
    tags: skipped ? ['model-review-skipped'] : ['model-review-error'],
    issues: [skipped ? `model review skipped after earlier failure: ${message}` : `model review failed: ${message}`],
    rationale: skipped
      ? 'Model reviewer was skipped after an earlier external API failure.'
      : 'Model reviewer could not score this canvas crop because the external API failed.',
  };
}

async function buildVisualReview(signatures) {
  if (visualReviewMode === 'off' || visualReviewMode === 'none') {
    return { enabled: false, mode: visualReviewMode, pass: true };
  }
  if (!Number.isFinite(minReviewScore) || minReviewScore < 0 || minReviewScore > 100) {
    throw new Error(`VISUAL_MATRIX_MIN_REVIEW_SCORE must be 0-100, got ${process.env.VISUAL_MATRIX_MIN_REVIEW_SCORE}`);
  }
  if (!['local', 'model'].includes(visualReviewMode)) {
    throw new Error(`VISUAL_MATRIX_REVIEW_MODE must be local, model, or off; got ${visualReviewMode}`);
  }

  const items = [];
  let terminalModelError = null;
  for (const scenario of signatures) {
    if (visualReviewMode === 'local') {
      items.push(localReviewScenario(scenario));
      continue;
    }
    if (terminalModelError) {
      items.push(modelReviewFailureItem(scenario, terminalModelError, true));
      continue;
    }
    try {
      items.push(await modelReviewScenario(scenario));
    } catch (error) {
      items.push(modelReviewFailureItem(scenario, error));
      const message = error instanceof Error ? error.message : String(error);
      if (/429|quota|rate/i.test(message)) {
        terminalModelError = error;
      }
    }
  }
  const scores = items.map((item) => item.score);
  return {
    enabled: true,
    mode: visualReviewMode,
    model: visualReviewMode === 'model' ? visualReviewModel : null,
    minScore: minReviewScore,
    pass: items.every((item) => item.pass),
    minObservedScore: scores.length > 0 ? Math.min(...scores) : null,
    averageScore: scores.length > 0 ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : null,
    items,
  };
}

function buildCuratedBaselineSnapshot(manifest) {
  return {
    schemaVersion: 1,
    kind: 'forge-visual-matrix-baseline',
    generatedAt: manifest.generatedAt,
    thresholds: manifest.thresholds,
    summary: manifest.summary,
    visualReview: manifest.visualReview,
    signatures: manifest.signatures,
    scenarios: manifest.scenarios.map((scenario) => ({
      id: scenario.id,
      prompt: scenario.prompt,
      objective: scenario.objective,
      crop: scenario.crop,
      visual: scenario.visual,
    })),
    pairwise: manifest.pairwise,
  };
}

function writeCuratedBaseline(manifest) {
  if (!curatedBaselineOut) return { enabled: false };
  const targetPath = path.resolve(cwd, curatedBaselineOut);
  if (!manifest.summary.pass) {
    return {
      enabled: true,
      path: targetPath,
      written: false,
      skippedReason: 'visual matrix did not pass',
    };
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(buildCuratedBaselineSnapshot(manifest), null, 2)}\n`);
  return {
    enabled: true,
    path: targetPath,
    written: true,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReviewReport(manifest) {
  const reviewById = new Map((manifest.visualReview?.items ?? []).map((item) => [item.id, item]));
  const cardHtml = manifest.scenarios.map((scenario) => `
      <article class="card">
        <div class="meta">
          <h2>${escapeHtml(scenario.objective)}</h2>
          <p>${escapeHtml(scenario.prompt)}</p>
        </div>
        <a href="${escapeHtml(scenario.canvasCropFile)}"><img class="crop" src="${escapeHtml(scenario.canvasCropFile)}" alt="${escapeHtml(scenario.id)} canvas crop"></a>
        <a class="shot" href="${escapeHtml(scenario.screenshotFile)}">full screenshot</a>
        <dl>
          <div><dt>Scenario</dt><dd>${escapeHtml(scenario.id)}</dd></div>
          <div><dt>Crop</dt><dd>${scenario.crop.width}x${scenario.crop.height} @ ${scenario.crop.left},${scenario.crop.top}</dd></div>
          <div><dt>Colors</dt><dd>${scenario.visual.colorBuckets}</dd></div>
          <div><dt>Luma</dt><dd>${scenario.visual.meanLuma}</dd></div>
          <div><dt>Chroma</dt><dd>${scenario.visual.meanChroma}</dd></div>
          <div><dt>Review</dt><dd>${reviewById.has(scenario.id) ? `${reviewById.get(scenario.id).score}/${manifest.visualReview.minScore}` : 'n/a'}</dd></div>
        </dl>
      </article>`).join('\n');

  const pairRows = manifest.pairwise.map((pair) => `
        <tr>
          <td>${escapeHtml(pair.a)}</td>
          <td>${escapeHtml(pair.b)}</td>
          <td>${escapeHtml(pair.objectives)}</td>
          <td>${pair.distance.toFixed(4)}</td>
        </tr>`).join('\n');

  const baseline = manifest.baseline;
  const baselineSummary = baseline.enabled
    ? `<span class="pill">baseline ${baseline.pass ? 'PASS' : 'FAIL'}${typeof baseline.maxObservedDistance === 'number' ? ` max ${baseline.maxObservedDistance.toFixed(4)} / ${baseline.maxDistance.toFixed(4)}` : ''}</span>`
    : '<span class="pill">baseline not configured</span>';
  const visualReview = manifest.visualReview;
  const reviewSummary = visualReview.enabled
    ? `<span class="pill">review ${visualReview.pass ? 'PASS' : 'FAIL'} min ${visualReview.minObservedScore} / ${visualReview.minScore}</span>`
    : '<span class="pill">review off</span>';
  const baselineSection = baseline.enabled ? `
    <section class="pairs">
      <h2 class="table-title">Baseline Drift</h2>
      <table>
        <thead><tr><th>Scenario</th><th>Objective</th><th>Status</th><th>Distance</th></tr></thead>
        <tbody>
${baseline.comparisons.map((comparison) => `
          <tr>
            <td>${escapeHtml(comparison.id)}</td>
            <td>${escapeHtml(comparison.objective)}</td>
            <td>${escapeHtml(comparison.status)}</td>
            <td>${typeof comparison.distance === 'number' ? comparison.distance.toFixed(4) : 'n/a'}</td>
          </tr>`).join('\n')}
        </tbody>
      </table>
    </section>` : '';
  const reviewSection = visualReview.enabled ? `
    <section class="pairs">
      <h2 class="table-title">Visual Review</h2>
      <table>
        <thead><tr><th>Scenario</th><th>Objective</th><th>Score</th><th>Issues</th><th>Rationale</th></tr></thead>
        <tbody>
${visualReview.items.map((item) => `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.objective)}</td>
            <td>${item.score}/${visualReview.minScore}</td>
            <td>${escapeHtml(item.issues.length > 0 ? item.issues.join('; ') : 'none')}</td>
            <td>${escapeHtml(item.rationale)}</td>
          </tr>`).join('\n')}
        </tbody>
      </table>
    </section>` : '';

  const status = manifest.summary.pass ? 'PASS' : 'FAIL';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Forge Visual Review</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f2ec; color: #26241f; }
      body { margin: 0; padding: 28px; }
      header { max-width: 1120px; margin: 0 auto 22px; display: grid; gap: 8px; }
      h1 { margin: 0; font-size: 28px; line-height: 1.1; font-weight: 700; }
      h2 { margin: 0; font-size: 15px; line-height: 1.2; text-transform: capitalize; }
      p { margin: 0; color: #6f6a60; }
      .summary { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .pill { border: 1px solid rgba(38, 36, 31, 0.14); border-radius: 999px; padding: 6px 10px; background: #fffaf0; font-size: 13px; }
      .pill strong { color: ${manifest.summary.pass ? '#356b42' : '#9b3333'}; }
      .grid { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
      .card { border: 1px solid rgba(38, 36, 31, 0.14); background: #fffaf0; border-radius: 8px; padding: 12px; display: grid; gap: 10px; }
      .meta { min-height: 58px; display: grid; align-content: start; gap: 4px; }
      .crop { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: #11151c; border-radius: 6px; }
      .shot { color: #566949; font-size: 13px; text-decoration: none; }
      .shot:hover { text-decoration: underline; }
      dl { margin: 0; display: grid; gap: 5px; font-size: 12px; }
      dl div { display: flex; justify-content: space-between; gap: 12px; }
      dt { color: #7e766b; }
      dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
      .pairs { max-width: 1120px; margin: 22px auto 0; border: 1px solid rgba(38, 36, 31, 0.14); background: #fffaf0; border-radius: 8px; overflow: hidden; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .table-title { padding: 10px; border-bottom: 1px solid rgba(38, 36, 31, 0.1); }
      th, td { padding: 9px 10px; border-bottom: 1px solid rgba(38, 36, 31, 0.1); text-align: left; }
      th { color: #6f6a60; font-weight: 600; }
      tr:last-child td { border-bottom: 0; }
      @media (max-width: 640px) { body { padding: 14px; } }
    </style>
  </head>
  <body>
    <header>
      <h1>Forge Visual Review</h1>
      <div class="summary">
        <span class="pill"><strong>${status}</strong></span>
        <span class="pill">min distance ${manifest.summary.minDistance.toFixed(4)} / ${manifest.thresholds.minPairDistance.toFixed(4)}</span>
        <span class="pill">average ${manifest.summary.averageDistance.toFixed(4)} / ${manifest.thresholds.minAverageDistance.toFixed(4)}</span>
        <span class="pill">closest ${escapeHtml(manifest.summary.closestPair?.a ?? 'n/a')} vs ${escapeHtml(manifest.summary.closestPair?.b ?? 'n/a')}</span>
        ${baselineSummary}
        ${reviewSummary}
      </div>
      <p>${escapeHtml(manifest.generatedAt)} - canvas crops are isolated from the surrounding Forge UI.</p>
    </header>
    <main class="grid">
${cardHtml}
    </main>
    <section class="pairs">
      <table>
        <thead><tr><th>A</th><th>B</th><th>Objectives</th><th>Distance</th></tr></thead>
        <tbody>
${pairRows}
        </tbody>
      </table>
    </section>
${baselineSection}
${reviewSection}
  </body>
</html>
`;
}

try {
  if (scenarioFilters.length > 0) {
    log(`scenario filter selected ${scenarios.length}/${allScenarios.length} match=${scenarioMatchMode}: ${scenarios.map((scenario) => scenario.id).join(', ')}`);
  }
  const parsed = scenarios.map(runSelftestScenario);
  const sharp = await loadSharp();
  const signatures = [];
  for (const scenario of parsed) {
    signatures.push(await buildSignature(sharp, scenario));
  }
  const pairs = pairwiseDistances(signatures);
  const baseline = loadBaselineComparison(signatures);
  const visualReview = await buildVisualReview(signatures);
  const minDistance = pairs[0]?.distance ?? 0;
  const averageDistance = pairs.length > 0
    ? Number((pairs.reduce((sum, pair) => sum + pair.distance, 0) / pairs.length).toFixed(4))
    : 0;
  const diversityPass = skipDiversity || (minDistance >= minPairDistance && averageDistance >= minAverageDistance);
  const pass = diversityPass && baseline.pass !== false && visualReview.pass !== false;
  const reportPath = path.join(screenshotDir, 'visual-review.html');
  const manifest = {
    generatedAt: new Date().toISOString(),
    screenshotDir,
    reviewReportPath: reportPath,
    reviewReportFile: path.basename(reportPath),
    selection: {
      availableScenarios: allScenarios.length,
      scenarioCount: scenarios.length,
      filters: scenarioFilters,
      matchMode: scenarioMatchMode,
      skipDiversity,
    },
    thresholds: {
      minPairDistance,
      minAverageDistance,
      maxBaselineDistance,
      skipDiversity,
    },
    summary: {
      pass,
      diversityPass,
      minDistance,
      averageDistance,
      closestPair: pairs[0] ?? null,
    },
    baseline,
    visualReview,
    curatedBaseline: { enabled: Boolean(curatedBaselineOut) },
    signatures: signatures.map((scenario) => ({
      id: scenario.id,
      objective: scenario.objective,
      sampledSize: scenario.visual.sampledSize,
      signature: scenario.signature,
    })),
    scenarios: signatures.map(({ signature, ...scenario }) => scenario),
    pairwise: pairs,
  };
  manifest.curatedBaseline = writeCuratedBaseline(manifest);
  const manifestPath = path.join(screenshotDir, 'visual-matrix.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(reportPath, buildReviewReport(manifest));
  if (!pass) {
    console.error(`[forge-visual-matrix] FAILED minDistance=${minDistance} averageDistance=${averageDistance} diversity=${diversityPass ? 'pass' : 'fail'} reviewMin=${visualReview.minObservedScore ?? 'off'} manifest=${manifestPath} report=${reportPath}`);
    process.exitCode = 1;
  } else {
    const baselineMessage = manifest.curatedBaseline?.written ? ` baselineOut=${manifest.curatedBaseline.path}` : '';
    log(`PASS minDistance=${minDistance} averageDistance=${averageDistance} diversity=${diversityPass ? 'pass' : 'skipped'} reviewMin=${visualReview.minObservedScore ?? 'off'} manifest=${manifestPath} report=${reportPath}${baselineMessage}`);
  }
} catch (error) {
  console.error(`[forge-visual-matrix] ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
