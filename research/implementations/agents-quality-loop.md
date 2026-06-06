# Implementation: `engine/ai/agents/{image-reviewer,logic-evaluator,playtester,tester,debugger}.ts`

The quality-loop agent roster — every agent pairs a LangChain v1 `createAgent` (the model proposes)
with a **deterministic, model-free engine** (pure TypeScript that produces the actual verdict, so it
can never be hallucinated). Models come from `engine/ai/providers.ts`; runtime dependencies
(surfaces, regenerators, sessions, file IO) are **INJECTED**, never imported. Built from
`research/langchain-agents-chains-gemini.md` + `research/vercel-langchain-gemini.md`
(logic-evaluator & playtester also cite `research/bitecs.md`).

**Deps (shared):** `langchain` (`createAgent`, `tool`; image-reviewer also `humanInTheLoopMiddleware`),
`zod`, providers (`createTriageModel` / `createCoderModel`).

---

## `image-reviewer.ts` — asset rubric loop (triage model)

Scores assets against the style bible; bounded retry loop then escalates to a human via
`humanInTheLoopMiddleware`. The weighted rubric math (`scoreRubric`) is deterministic.

| Export | Signature | Purpose |
|---|---|---|
| `DEFAULT_PASS_THRESHOLD` / `DEFAULT_MAX_RETRIES` | consts (0.75 / 3) | Defaults. |
| `RubricScoresSchema` / `RubricScores` | zod / type | 5 criteria in [0,1]. |
| `RubricWeights` / `DEFAULT_RUBRIC_WEIGHTS` | interface / const | Relative weights. |
| `RubricVerdictSchema` / `RubricVerdict` | zod / type | `{ assetId, scores, weightedScore, passed, feedback, attempt }`. |
| `scoreRubric(scores, weights?)` | `=> number` | Normalized weighted score; clamps, guards divide-by-zero (unweighted-mean fallback). |
| `buildVerdict(args)` | `=> RubricVerdict` | Pure verdict from scores + bookkeeping. |
| `AssetReviewSurface`, `AssetRegenerator`, `ImageReviewerDeps` | interfaces | Injected human surface / regenerator / `{ styleBible, ... }`. |
| `createImageReviewerAgent(deps)` | `=> agent` | Tools `score_asset` / `regenerate_asset` / `escalate_to_human`; HITL gate on escalate. |

## `logic-evaluator.ts` — static rule coherence (triage model)

The agent only EXTRACTS a structured `RuleSpec`; coherence is proved by the deterministic
`evaluateRuleSpec` truth-table + state-machine engine (sandboxed boolean evaluator — operators
`and`/`or`/`not`/parens only, no `eval`).

| Export | Signature | Purpose |
|---|---|---|
| `PropositionSchema`/`Proposition`, `RuleExpressionSchema`/`RuleExpression`, `TransitionSchema`/`Transition`, `StateMachineSchema`/`StateMachine`, `RuleSpecSchema`/`RuleSpec` | zod / types | The extracted spec contract. |
| `LogicIssueSchema`/`LogicIssue`, `LogicVerdictSchema`/`LogicVerdict` | zod / types | `{ coherent, issues[], casesEnumerated }`; issues route `'spec'`→designer / `'impl'`→debugger. |
| `tokenizeExpression(expr)` | `(string) => Token[]` | Tokenize; throws on illegal chars. |
| `evaluateBooleanExpression(expr, assignment)` | `=> boolean` | Recursive-descent evaluator; unknown id throws. |
| `enumerateAssignments(names)` | `(string[]) => Record<string, boolean>[]` | All 2^n rows; refuses n>20. |
| `evaluateRuleSpec(spec)` | `(RuleSpec) => LogicVerdict` | Truth-table + reachability proof (win/lose exclusivity + reachability, contradictory constraints, transition/dead-end/reachability checks). |
| `createLogicEvaluatorAgent(onVerdict?)` | `=> agent` | Single `verify_rule_spec` tool runs the engine. |

## `playtester.ts` — headless playability (triage model)

`runPlaytest` drives an INJECTED `GameSession` through the controller action API against the bitECS
world and asserts invariants; deterministic and unit-testable with a fake session.

| Export | Signature | Purpose |
|---|---|---|
| `EntityPosition`, `GameSession`, `PlaytestOptions`, `PlaytesterDeps`, `PrototypeVisionCheck` | interfaces | Injected session contract + options. |
| `InvariantResultSchema`/`InvariantResult`, `PlaytestReportSchema`/`PlaytestReport` | zod / types | `{ playable, invariants[], worstStepMs, stepsRun }`. |
| `hasNanPosition(positions)` | `=> boolean` | NaN/Infinite coordinate guard. |
| `positionsChanged(before, after)` | `=> boolean` | Movement detection. |
| `runPlaytest(session, options?)` | `=> PlaytestReport` | Deterministic invariant probe (move / win+lose reachable / no-NaN / frame budget). |
| `createPlaytesterAgent(deps)` | `=> agent` | `run_invariants` + `vision_check_scene` tools. |

## `tester.ts` — authors + runs tests/tests.ts (coder model)

| Export | Signature | Purpose |
|---|---|---|
| `TestRunResultSchema` / `TestRunResult` | zod / type | `{ passed, total, failed, output, failures[] }`. |
| `TestFileWriter`, `TestRunner`, `ReportFailures`, `TesterDeps` | interfaces / type | Injected writer / tsx runner / failure callback. |
| `createTesterAgent(deps)` | `=> agent` | `write_tests` + `run_tests` tools; requires `writer` + `runner`. |

## `debugger.ts` — repair, not regeneration (coder model)

The model proposes minimal find/replace edits; the deterministic `applyMinimalDiff` engine applies
them — verifying each anchor is unique and rejecting disguised whole-file rewrites.

| Export | Signature | Purpose |
|---|---|---|
| `DEFAULT_DEBUG_MAX_RETRIES` / `MAX_REWRITE_FRACTION` | consts (3 / 0.5) | Defaults. |
| `StructuredFailureSchema`/`StructuredFailure`, `MinimalEditSchema`/`MinimalEdit`, `DiffResultSchema`/`DiffResult` | zod / types | Failure input, one edit, diff result. |
| `applyMinimalDiff(original, edits)` | `=> DiffResult` | Apply edits; rejects missing/ambiguous anchors and >50% rewrites. |
| `FileIO`, `EscalateToUser`, `DebuggerDeps` | interfaces / type | Injected IO + escalation. |
| `createDebuggerAgent(deps)` | `=> agent` | `read_file` / `apply_minimal_diff` / `escalate` tools; requires `io`. |

---

## Design note — the `humanInTheLoopMiddleware` `as never` workaround

In `image-reviewer.ts` the middleware option object is forced through a double `as never` cast:

```ts
middleware: [ humanInTheLoopMiddleware({ interruptOn: { escalate_to_human: { … } } } as never) as never ]
```

This is required by a LangChain typing bug — its middleware option types collapse to `never` under
`exactOptionalPropertyTypes` + zod v4 (an internal `ZodV3ObjectLike` constraint). The runtime shape
matches the documented API in `research/langchain-agents-chains-gemini.md`; only the types are wrong.

## Tests
`engine/ai/agents/agents-quality-loop.test.ts` — run
`npx tsx engine/ai/agents/agents-quality-loop.test.ts` (`node:assert/strict`; exercises the
deterministic engines — `scoreRubric`/`buildVerdict`, `evaluateRuleSpec` + boolean evaluator,
`runPlaytest` with a fake session, `applyMinimalDiff` — without live model calls).
