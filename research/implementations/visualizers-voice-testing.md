# Implementation: `engine/tools/visualizers/*` + `engine/tools/voice/voice.ts` + `engine/testing/test-runner.ts`

The human/AI review surfaces (style bible, composed prototype still, asset rubric), the voice layer
over the chat UI, and the tsx test runner. The three visualizers are built from
`research/architecture.md` + `research/langchain-agents-chains-gemini.md` +
`research/vercel-langchain-gemini.md`; voice and test-runner are framework-native (**no research
doc**).

---

## `engine/tools/visualizers/visual-direction.ts`

Uses Gemini Google-Search grounding (`createSearchGroundedModel`) to research visual references and
emit the **STYLE BIBLE** — `config/style.json` + `reports/style.md` (palette, sprite resolution,
perspective, outline rules) prepended to EVERY image prompt — plus grounded reference notes into
`references/` and `research/`. The style bible MUST exist before any image generation.

**Deps:** `node:fs` (promises), `node:path`, `zod`, `createSearchGroundedModel` from providers.

| Export | Signature | Purpose |
|---|---|---|
| `StyleBibleSchema` / `StyleBible` | zod / type | title/summary/artStyle/palette[#RRGGBB]/spriteResolution/perspective/outline/shading/mood/rules. |
| `VisualReferenceSchema` / `VisualReference` | zod / type | `{ title, reason, url? }`. |
| `VisualDirectionResultSchema` / `VisualDirectionResult` | zod / type | `{ style, references[], notes }`. |
| `GroundedModelLike`, `VisualDirectionDeps`, `VisualDirectionOptions`, `VisualDirectionOutput` | interfaces | Injectable model + fs; `{ prompt, gameRoot }`; output paths. |
| `extractText(content: unknown)` | `=> string` | LangChain content (string \| block[]) → text. |
| `parseVisualDirection(text: string)` | `=> VisualDirectionResult` | Pull first JSON object from (fenced) text, validate. |
| `renderStyleMarkdown(result)` | `=> string` | reports/style.md body. |
| `styleBibleToPromptPreamble(style)` | `(StyleBible) => string` | Compact block prepended to image prompts. |
| `runVisualDirection(options, deps?)` | `=> Promise<VisualDirectionOutput>` | Research + write styleJson/styleMd/referencesJson/researchNotes. |

## `engine/tools/visualizers/prototype-still.ts`

Layers background + sprites into one static PNG of the COMPOSED scene for human/AI review (the
playtester vision-checks this still). Composition is headless via a pluggable `Compositor` — the
default is **`sharp`, lazily imported inside `createSharpCompositor().compose` so the module carries
no compile-time dependency on sharp's typings** (it is a hoisted transitive dep) — fully injectable.

**Deps:** `node:fs` (promises), `node:path`, `zod`; `sharp` lazy/optional.

| Export | Signature | Purpose |
|---|---|---|
| `SceneLayerSchema` / `SceneLayer` | zod / type | `{ name, source, x?, y? }` (source = data URL or absolute path). |
| `PrototypeSceneSchema` / `PrototypeScene` | zod / type | `{ width, height, background?, layers[] (min 1) }`. |
| `ResolvedLayer`, `Compositor`, `PrototypeStillDeps`, `PrototypeStillOptions`, `PrototypeStillOutput` | interfaces | Compositor contract + injected IO. |
| `resolveLayerBuffer(source, readFile)` | `=> Promise<Buffer>` | Decode data URL or read absolute file → PNG bytes. |
| `createSharpCompositor()` | `=> Compositor` | Default sharp-backed compositor (lazy import; clear error if absent). |
| `composePrototypeStill(options, deps?)` | `=> Promise<PrototypeStillOutput>` | Compose scene → PNG file. |

## `engine/tools/visualizers/asset-review.ts`

The asset-review surface: scores an asset against the style bible with a numeric rubric (AI via the
triage model, or human at the escalation gate) and returns a structured verdict
(accept/retry/escalate). Provides both the AI scoring path and pure verdict-shaping the human gate
reuses.

**Deps:** `zod`, `createTriageModel` from providers, `styleBibleToPromptPreamble`/`StyleBible` from
`visual-direction`.

| Export | Signature | Purpose |
|---|---|---|
| `DEFAULT_ACCEPT_THRESHOLD` / `DEFAULT_MAX_RETRIES` | consts (75 / 3) | Defaults. |
| `RUBRIC_CRITERIA` / `RubricCriterion` | tuple / type | palette/style/resolution/subject/outline criteria. |
| `RubricScores` | type | Per-criterion 0–100 scores. |
| `AssetVerdictSchema` / `AssetVerdict` | zod / type | `{ score, rubric, issues[], decision, human, rationale }`. |
| `AssetUnderReview`, `ReviewConfig`, `ReviewModelLike`, `AssetReviewDeps` | interfaces | Inputs + injectable model. |
| `computeScore(rubric)` | `(RubricScores) => number` | Equal-weight mean (rounded). |
| `decideFromScore(score, config)` | `=> 'accept'\|'retry'\|'escalate'` | Deterministic decision from score + retry state. |
| `parseModelJudgment(text)` | `=> { rubric, issues, rationale }` | Parse (fenced) JSON judgment. |
| `buildReviewPrompt(asset, style)` | `=> string` | Rubric prompt / human surface text. |
| `reviewAsset(asset, style, config?, deps?)` | `=> Promise<AssetVerdict>` | AI scoring + deterministic decision (multimodal image_url). |
| `buildHumanVerdict(input)` | `=> AssetVerdict` | Shape a human decision into a verdict (`human:true`). |

---

## `engine/tools/voice/voice.ts`

Speech-to-text over the chat UI, wrapping the browser Web Speech API
(`SpeechRecognition`/`webkitSpeechRecognition`) in a typed event-driven state machine with a
graceful `unsupported` fallback. The pure reducer is exported and tested independently of any real
backend. **No research doc** — framework-native; "OS libraries" intent maps to the browser API.

**Deps:** none (browser globals, all defensively guarded; injectable recognition factory).

| Export | Signature | Purpose |
|---|---|---|
| `VoiceState` | `'idle'\|'listening'\|'error'\|'unsupported'` | Lifecycle states. |
| `VoiceEvent` | union | START/STOP/RESULT/ERROR/END/UNSUPPORTED. |
| `VoiceMachineState` | interface | `{ status, finalTranscript, interimTranscript, error }`. |
| `initialVoiceState` | const | Initial machine state. |
| `voiceReduce(state, event)` | `=> VoiceMachineState` | Pure reducer. |
| `combinedTranscript(state)` | `=> string` | final + interim joined. |
| `SpeechRecognitionLike`, `SpeechRecognitionFactory`, `VoiceControllerOptions` | types | Structural backend + options. |
| `detectSpeechRecognition()` | `=> SpeechRecognitionFactory \| null` | Feature-detect (SSR/Node-safe). |
| `VoiceController` | class | `getState()`, `isSupported()`, `start()`, `stop()`. |

---

## `engine/testing/test-runner.ts`

Runs a generated game's `tests/tests.ts` via tsx in a child process, captures structured pass/fail
+ stack traces, returns machine-readable results for the tester agent. **No research doc** —
`node:child_process`-native.

**Deps:** `node:child_process` (spawn), `node:fs/promises` (access), `zod`.

| Export | Signature | Purpose |
|---|---|---|
| `TestFailureSchema` / `TestFailure` | zod / type | `{ message, stack: string[] }`. |
| `TestRunResultSchema` / `TestRunResult` | zod / type | `{ passed, exitCode, signal, timedOut, durationMs, stdout, stderr, failures[] }`. |
| `RunGameTestsOptions` | interface | `{ timeoutMs?; command? }` (default `npx tsx <file>`, 120000ms wall). |
| `parseFailures(output)` | `(string) => TestFailure[]` | Extract failure lines + trailing stack. |
| `runGameTests(testFilePath, options?)` | `=> Promise<TestRunResult>` | Spawn tsx; never throws on test failure, only on missing file / spawn error. |

---

## Tests
- `engine/tools/visualizers/visualizers.test.ts` — `npx tsx engine/tools/visualizers/visualizers.test.ts`
  (injected models + a mock `Compositor`, offline).
- `engine/tools/voice/voice.test.ts` — `npx tsx engine/tools/voice/voice.test.ts` (drives the reducer
  + a mocked recognition backend).
- `engine/testing/test-runner.test.ts` — `npx tsx engine/testing/test-runner.test.ts`
  (`node:assert/strict`, a `command` override spawns a fake test process).
