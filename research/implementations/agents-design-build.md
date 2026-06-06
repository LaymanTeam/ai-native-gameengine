# Implementation: `engine/ai/agents/{designer,coder,researcher,planner-interpreter,search-and-get}.ts`

The build-side agent roster — design → research → plan → asset-trawl → code. Every agent is a
LangChain v1 `createAgent` (LangGraph loop under the hood; no custom state machine). Models come
from `engine/ai/providers.ts`; sibling engine tools are **INJECTED**, never imported. Most carry a
module-scoped `MemorySaver` checkpointer so multi-turn loops persist across warm invocations, plus a
`*ThreadConfig(threadId)` helper. Built from `research/langchain-agents-chains-gemini.md` +
`research/vercel-langchain-gemini.md` (search-and-get also cites `generations/info.md`).

**Deps (shared):** `langchain` (`createAgent`, `tool`), `@langchain/core/tools`
(`StructuredToolInterface`), `@langchain/langgraph` (`MemorySaver`), `zod`, providers.

---

## `designer.ts` — phase 0, bounded GDD

| Export | Signature | Purpose |
|---|---|---|
| `DESIGNER_LOG_PREFIX` | `string` | Log prefix. |
| `gddSceneSchema` | zod | `{ id, name, description }`. |
| `gddSchema` / `GameDesignDocument` | zod / type | title/pitch/genre/coreMechanic/scenes(1–3)/win/lose/controls/nonGoals. |
| `renderGddMarkdown(gdd)` | `(GameDesignDocument) => string` | reports/gdd.md (pure). |
| `parseGdd(value: unknown)` | `=> { ok: true; gdd } \| { ok: false; errors: string[] }` | Discriminated validation. |
| `DesignerAgentOptions` | interface | `{ tools? }`. |
| `createDesignerAgent(options?)` | `=> agent` | `createConversationModel`; confirms scope before persisting. |
| `designerThreadConfig(threadId)` | `=> { configurable: { thread_id } }` | Checkpointer key. |

## `coder.ts` — phase 2, systems/ + ui/ code

The typecheck tool is always present (coder's self-verification); file-IO tools are injected.

| Export | Signature | Purpose |
|---|---|---|
| `CODER_LOG_PREFIX` | `string` | Log prefix. |
| `TypecheckResult` | interface | `{ ok, exitCode, diagnostics }`. |
| `TYPECHECK_OUTPUT_LIMIT` | const (8000) | Max diagnostics chars handed to the model. |
| `runTypecheck(gameDir)` | `=> Promise<TypecheckResult>` | Spawn `npx tsc --noEmit`; never throws on tsc failure. |
| `clampDiagnostics(raw)` | `(string) => string` | Clamp/tidy tsc output (pure). |
| `makeTypecheckTool(gameDir)` | `=> StructuredToolInterface` | `typecheck_game` tool bound to one dir. |
| `CoderAgentOptions` | interface | `{ gameDir, tools? }`. |
| `createCoderAgent(options)` | `=> agent` | `createCoderModel`; requires `gameDir`. |
| `coderThreadConfig(threadId)` | `=> config` | Checkpointer key. |

## `researcher.ts` — genre/mechanic references

| Export | Signature | Purpose |
|---|---|---|
| `RESEARCHER_LOG_PREFIX` | `string` | Log prefix. |
| `researchNoteSchema` / `ResearchNote` | zod / type | `{ topic, summary, sources[] }`. |
| `renderResearchNoteMarkdown(note)` | `(ResearchNote) => string` | research/reports/<topic>.md (pure). |
| `makeGroundedSearchTool()` | `=> tool` | `grounded_web_research` — invokes the grounded model INSIDE a function tool (see design note). |
| `ResearcherAgentOptions` | interface | `{ tools? }`. |
| `createResearcherAgent(options?)` | `=> agent` | `createConversationModel` + grounded tool. |
| `researcherThreadConfig(threadId)` | `=> config` | Checkpointer key. |

## `planner-interpreter.ts` — prompt → structured pipeline plan

Uses `responseFormat` so the director gets `result.structuredResponse` (no checkpointer).

| Export | Signature | Purpose |
|---|---|---|
| `PLANNER_LOG_PREFIX` | `string` | Log prefix. |
| `pipelinePhaseSchema` / `PipelinePhase` | zod / type | `'design'\|'assets'\|'code'\|'test'\|'deploy'`. |
| `pipelinePlanSchema` / `PipelinePlan` | zod / type | gameIdea/genre/coreMechanicCandidate/targetSceneCount(1–3)/phases/constraints/openQuestions. |
| `parsePipelinePlan(value: unknown)` | `=> { ok: true; plan } \| { ok: false; errors }` | Discriminated validation. |
| `planNeedsUserInput(plan)` | `(PipelinePlan) => boolean` | True if open questions exist (pure). |
| `PlannerAgentOptions` | interface | `{ tools? }`. |
| `createPlannerInterpreterAgent(options?)` | `=> agent` | `createConversationModel`, `responseFormat: pipelinePlanSchema`. |

## `search-and-get.ts` — open-source asset trawl + GPL provenance

License filtering is deterministic (pure code), not model-judged — the agent's GPL-3.0 safety
guarantee. Primary sources: OpenGameArt (rejects NC/ND) and Kenney (mostly CC0).

| Export | Signature | Purpose |
|---|---|---|
| `SEARCH_AND_GET_LOG_PREFIX` | `string` | Log prefix. |
| `PRIMARY_ASSET_SOURCES` | const | `{ openGameArt, kenney }` base URLs. |
| `licenseRecordSchema` / `LicenseRecord` | zod / type | `assets/**/LICENSE.json` provenance. |
| `GPL_COMPATIBLE_LICENSES` | const tuple | Allow-list of GPL-3.0-compatible identifiers. |
| `normalizeLicense(license)` | `(string) => string` | Uppercase/trim/collapse separators (pure). |
| `isGplCompatibleLicense(license)` | `(string) => boolean` | Reject any `-NC`/`-ND`; else allow-list check. |
| `filterCompatibleAssets(records)` | `=> { kept[], rejected[] }` | Partition by compatibility (pure). |
| `openGameArtSearchUrl(query)` | `(string) => string` | Advanced-search URL (pure). |
| `makeLicenseCheckTool()` | `=> StructuredToolInterface` | `check_license` deterministic gate. |
| `makeGroundedAssetSearchTool()` | `=> tool` | `grounded_asset_search` — grounded model inside a function tool. |
| `SearchAndGetAgentOptions` | interface | `{ tools? }`. |
| `createSearchAndGetAgent(options?)` | `=> agent` | `createConversationModel` + license-check + grounded tools. |
| `searchAndGetThreadConfig(threadId)` | `=> config` | Checkpointer key. |

---

## Design note — the `makeGrounded*SearchTool` pattern

`createAgent` rejects models that already have tools pre-bound (`MultipleToolsBoundError`), and
Gemini cannot mix its `googleSearch` specialty tool with function tools on one model. So the
search-grounded model is **invoked INSIDE a plain function tool** (`grounded_web_research` /
`grounded_asset_search`) that the un-bound agent model calls — rather than being the agent model
itself. Both `researcher.ts` and `search-and-get.ts` use this pattern.

## Tests
`engine/ai/agents/agents-design-build.test.ts` — run
`npx tsx engine/ai/agents/agents-design-build.test.ts` (exercises the pure helpers — GDD/plan
rendering + parsing, license normalization/filtering, diagnostics clamping — without live model
calls).
