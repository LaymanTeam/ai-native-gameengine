/**
 * Logic-evaluator agent — static logic verification of the game's rules BEFORE and AFTER coding.
 * Parses the GDD and systems/rules into logical propositions and checks consistency via truth
 * tables / exhaustive case enumeration (deterministic code, model only extracts propositions):
 * win and lose conditions are mutually exclusive and both reachable, no contradictory rules
 * (e.g. "key opens door" vs "door never opens"), every entity state transition has a defined
 * outcome, no dead-end states outside lose conditions. Flags uncovered cases to the designer
 * (spec gap) or debugger (implementation gap). Complements the playtester: this proves the
 * RULES are coherent; the playtester proves the BUILD obeys them.
 *
 * ARCHITECTURE: the agent is a LangChain v1 `createAgent` whose ONLY job is to extract a
 * structured `RuleSpec` (boolean variables, win/lose expressions, entity state machines) from
 * the natural-language GDD. The consistency proof is the deterministic, model-free
 * `evaluateRuleSpec` engine below — pure TypeScript so it is fully unit-testable and never
 * hallucinates a verdict. Research: research/langchain-agents-chains-gemini.md, bitecs.md.
 */
import { createAgent, tool } from 'langchain';
import * as z from 'zod';
import { createTriageModel } from '../providers';

const LOGIC_LOG_PREFIX = '[engine/ai/agents/logic-evaluator]';

// ---------------------------------------------------------------------------
// Zod schemas — the structured contract the model must produce.
// ---------------------------------------------------------------------------

/**
 * A boolean proposition extracted from the GDD, e.g. { name: 'hasKey', meaning: 'player holds the key' }.
 * `name` is a valid JS identifier so it can be used as a truth-table variable.
 */
export const PropositionSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'proposition name must be a valid identifier'),
  meaning: z.string().describe('plain-language meaning of the proposition'),
});
export type Proposition = z.infer<typeof PropositionSchema>;

/**
 * A boolean expression over proposition names. Only the operators `and`, `or`, `not`,
 * parentheses, and the literals `true`/`false` are permitted — this keeps evaluation
 * deterministic and prevents arbitrary code execution.
 */
export const RuleExpressionSchema = z.object({
  /** Boolean expression string, e.g. "hasKey and atDoor". */
  expression: z.string(),
  /** Optional human description for diagnostics. */
  description: z.string().default(''),
});
export type RuleExpression = z.infer<typeof RuleExpressionSchema>;

/** A single state-transition edge in an entity's state machine. */
export const TransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** The trigger/condition label (free text, used only for diagnostics). */
  on: z.string().default(''),
});
export type Transition = z.infer<typeof TransitionSchema>;

/** An entity state machine: declared states + transitions + which states are terminal. */
export const StateMachineSchema = z.object({
  entity: z.string(),
  states: z.array(z.string()).min(1),
  initial: z.string(),
  /** States that legitimately have no outgoing transitions (game-over / lose / win). */
  terminalStates: z.array(z.string()).default([]),
  transitions: z.array(TransitionSchema).default([]),
});
export type StateMachine = z.infer<typeof StateMachineSchema>;

/** The full extracted spec the deterministic engine consumes. */
export const RuleSpecSchema = z.object({
  propositions: z.array(PropositionSchema).default([]),
  winCondition: RuleExpressionSchema,
  loseCondition: RuleExpressionSchema,
  /** Additional invariants that must be satisfiable, e.g. "not (doorOpen and not hasKey)". */
  ruleConstraints: z.array(RuleExpressionSchema).default([]),
  stateMachines: z.array(StateMachineSchema).default([]),
});
export type RuleSpec = z.infer<typeof RuleSpecSchema>;

/** A single detected logic problem. */
export const LogicIssueSchema = z.object({
  kind: z.enum([
    'win_lose_overlap',
    'win_unreachable',
    'lose_unreachable',
    'contradictory_constraint',
    'undefined_transition',
    'dead_end_state',
    'unreachable_state',
    'parse_error',
  ]),
  /** 'spec' routes to the designer; 'impl' routes to the debugger. */
  route: z.enum(['spec', 'impl']),
  detail: z.string(),
});
export type LogicIssue = z.infer<typeof LogicIssueSchema>;

/** The deterministic verdict. */
export const LogicVerdictSchema = z.object({
  coherent: z.boolean(),
  issues: z.array(LogicIssueSchema),
  /** Number of truth-table rows enumerated (diagnostics). */
  casesEnumerated: z.number().int().nonnegative(),
});
export type LogicVerdict = z.infer<typeof LogicVerdictSchema>;

// ---------------------------------------------------------------------------
// Deterministic boolean-expression evaluator (model-free, sandboxed).
// ---------------------------------------------------------------------------

type Token = { type: 'id' | 'op' | 'lparen' | 'rparen' | 'lit'; value: string };

const OPERATORS = new Set(['and', 'or', 'not']);

/** Tokenize a boolean expression. Throws on illegal characters/tokens. */
export function tokenizeExpression(expr: string): Token[] {
  if (typeof expr !== 'string') {
    throw new Error(`${LOGIC_LOG_PREFIX} expression must be a string`);
  }
  const tokens: Token[] = [];
  const re = /\s*([()]|[A-Za-z_][A-Za-z0-9_]*)/y;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(expr)) !== null) {
    lastIndex = re.lastIndex;
    const raw = m[1];
    if (raw === undefined) continue;
    if (raw === '(') tokens.push({ type: 'lparen', value: raw });
    else if (raw === ')') tokens.push({ type: 'rparen', value: raw });
    else {
      const lower = raw.toLowerCase();
      if (OPERATORS.has(lower)) tokens.push({ type: 'op', value: lower });
      else if (lower === 'true' || lower === 'false') tokens.push({ type: 'lit', value: lower });
      else tokens.push({ type: 'id', value: raw });
    }
  }
  // Ensure the whole string was consumed (catches illegal chars).
  if (expr.slice(lastIndex).trim().length > 0) {
    throw new Error(`${LOGIC_LOG_PREFIX} illegal token near "${expr.slice(lastIndex).trim()}"`);
  }
  return tokens;
}

/**
 * Recursive-descent parser → evaluator over a given truth assignment.
 * Grammar: expr := term ('or' term)* ; term := factor ('and' factor)* ;
 *          factor := 'not' factor | '(' expr ')' | id | lit
 * An unknown identifier (not in the assignment) throws — surfaced as a parse_error.
 */
export function evaluateBooleanExpression(expr: string, assignment: Record<string, boolean>): boolean {
  const tokens = tokenizeExpression(expr);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];

  function parseExpr(): boolean {
    let left = parseTerm();
    while (peek()?.type === 'op' && peek()?.value === 'or') {
      next();
      const right = parseTerm();
      left = left || right;
    }
    return left;
  }
  function parseTerm(): boolean {
    let left = parseFactor();
    while (peek()?.type === 'op' && peek()?.value === 'and') {
      next();
      const right = parseFactor();
      left = left && right;
    }
    return left;
  }
  function parseFactor(): boolean {
    const t = peek();
    if (t === undefined) throw new Error(`${LOGIC_LOG_PREFIX} unexpected end of expression "${expr}"`);
    if (t.type === 'op' && t.value === 'not') {
      next();
      return !parseFactor();
    }
    if (t.type === 'lparen') {
      next();
      const val = parseExpr();
      const close = next();
      if (close?.type !== 'rparen') throw new Error(`${LOGIC_LOG_PREFIX} missing ')' in "${expr}"`);
      return val;
    }
    if (t.type === 'lit') {
      next();
      return t.value === 'true';
    }
    if (t.type === 'id') {
      next();
      if (!(t.value in assignment)) {
        throw new Error(`${LOGIC_LOG_PREFIX} unknown proposition "${t.value}" in "${expr}"`);
      }
      return assignment[t.value] as boolean;
    }
    throw new Error(`${LOGIC_LOG_PREFIX} unexpected token "${t.value}" in "${expr}"`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) {
    throw new Error(`${LOGIC_LOG_PREFIX} trailing tokens in "${expr}"`);
  }
  return result;
}

/** Enumerate all 2^n boolean assignments for the given proposition names. */
export function enumerateAssignments(names: string[]): Record<string, boolean>[] {
  const n = names.length;
  if (n > 20) {
    throw new Error(`${LOGIC_LOG_PREFIX} too many propositions (${n}); refusing 2^${n} enumeration`);
  }
  const rows: Record<string, boolean>[] = [];
  const total = 1 << n;
  for (let mask = 0; mask < total; mask++) {
    const row: Record<string, boolean> = {};
    for (let i = 0; i < n; i++) {
      const name = names[i];
      if (name === undefined) continue;
      row[name] = (mask & (1 << i)) !== 0;
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// State-machine reachability/coverage checks (graph traversal).
// ---------------------------------------------------------------------------

function checkStateMachine(sm: StateMachine): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const states = new Set(sm.states);
  const terminal = new Set(sm.terminalStates);

  if (!states.has(sm.initial)) {
    issues.push({
      kind: 'undefined_transition',
      route: 'spec',
      detail: `entity "${sm.entity}" initial state "${sm.initial}" is not in declared states`,
    });
  }

  // Every transition must reference declared states.
  const outgoing = new Map<string, Transition[]>();
  for (const t of sm.transitions) {
    if (!states.has(t.from)) {
      issues.push({
        kind: 'undefined_transition',
        route: 'spec',
        detail: `entity "${sm.entity}" transition from undeclared state "${t.from}"`,
      });
    }
    if (!states.has(t.to)) {
      issues.push({
        kind: 'undefined_transition',
        route: 'spec',
        detail: `entity "${sm.entity}" transition to undeclared state "${t.to}" (on "${t.on}")`,
      });
    }
    const list = outgoing.get(t.from) ?? [];
    list.push(t);
    outgoing.set(t.from, list);
  }

  // Reachability from initial via BFS.
  const reachable = new Set<string>();
  const queue: string[] = states.has(sm.initial) ? [sm.initial] : [];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const t of outgoing.get(cur) ?? []) {
      if (!reachable.has(t.to)) queue.push(t.to);
    }
  }

  for (const s of states) {
    if (!reachable.has(s)) {
      issues.push({
        kind: 'unreachable_state',
        route: 'spec',
        detail: `entity "${sm.entity}" state "${s}" is unreachable from initial "${sm.initial}"`,
      });
    }
    // Dead-end: a non-terminal state with no outgoing transitions.
    const hasOut = (outgoing.get(s)?.length ?? 0) > 0;
    if (!hasOut && !terminal.has(s)) {
      issues.push({
        kind: 'dead_end_state',
        route: 'spec',
        detail: `entity "${sm.entity}" state "${s}" is a dead-end (no outgoing transitions and not terminal)`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// The deterministic verdict engine — the heart of the agent.
// ---------------------------------------------------------------------------

/**
 * Prove (or disprove) the coherence of a RuleSpec with NO model involvement.
 * Checks:
 *  1. win & lose are never simultaneously true (mutual exclusivity)
 *  2. win is reachable (some constraint-satisfying assignment satisfies it)
 *  3. lose is reachable
 *  4. no ruleConstraint is unsatisfiable (always-false) — a contradiction
 *  5. every state machine: declared states, no undefined transitions, no unreachable states,
 *     no dead-ends outside terminal states.
 */
export function evaluateRuleSpec(spec: RuleSpec): LogicVerdict {
  const issues: LogicIssue[] = [];
  const names = spec.propositions.map((p) => p.name);
  const uniqueNames = Array.from(new Set(names));

  let rows: Record<string, boolean>[];
  try {
    rows = enumerateAssignments(uniqueNames);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      coherent: false,
      issues: [{ kind: 'parse_error', route: 'spec', detail: message }],
      casesEnumerated: 0,
    };
  }

  let winSatisfiable = false;
  let loseSatisfiable = false;
  let overlapFound = false;
  const constraintSatisfiable = new Array<boolean>(spec.ruleConstraints.length).fill(false);

  try {
    for (const row of rows) {
      // A row is "valid" only if it satisfies all rule constraints; win/lose reachability
      // is judged among constraint-satisfying worlds.
      let constraintsHold = true;
      for (let i = 0; i < spec.ruleConstraints.length; i++) {
        const c = spec.ruleConstraints[i];
        if (c === undefined) continue;
        const ok = evaluateBooleanExpression(c.expression, row);
        if (ok) constraintSatisfiable[i] = true;
        else constraintsHold = false;
      }

      const win = evaluateBooleanExpression(spec.winCondition.expression, row);
      const lose = evaluateBooleanExpression(spec.loseCondition.expression, row);

      if (win && lose) overlapFound = true;
      if (constraintsHold) {
        if (win) winSatisfiable = true;
        if (lose) loseSatisfiable = true;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      coherent: false,
      issues: [{ kind: 'parse_error', route: 'spec', detail: message }],
      casesEnumerated: rows.length,
    };
  }

  if (overlapFound) {
    issues.push({
      kind: 'win_lose_overlap',
      route: 'spec',
      detail: 'there exists a world state where both win and lose conditions are true',
    });
  }
  if (!winSatisfiable) {
    issues.push({
      kind: 'win_unreachable',
      route: 'spec',
      detail: 'no constraint-satisfying world state makes the win condition true',
    });
  }
  if (!loseSatisfiable) {
    issues.push({
      kind: 'lose_unreachable',
      route: 'spec',
      detail: 'no constraint-satisfying world state makes the lose condition true',
    });
  }
  for (let i = 0; i < spec.ruleConstraints.length; i++) {
    if (!constraintSatisfiable[i]) {
      const c = spec.ruleConstraints[i];
      issues.push({
        kind: 'contradictory_constraint',
        route: 'spec',
        detail: `rule constraint "${c?.expression ?? '(unknown)'}" is unsatisfiable (always false) — contradiction`,
      });
    }
  }

  for (const sm of spec.stateMachines) {
    issues.push(...checkStateMachine(sm));
  }

  return {
    coherent: issues.length === 0,
    issues,
    casesEnumerated: rows.length,
  };
}

// ---------------------------------------------------------------------------
// The LangChain agent — extracts the RuleSpec from the GDD; verdict is deterministic.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You are the logic-evaluator. Read the provided Game Design Document and rules, then call ' +
  'verify_rule_spec ONCE with a faithful structured extraction: list every boolean proposition, ' +
  'the win and lose conditions as boolean expressions over those propositions (operators: and, or, ' +
  'not, parentheses only), any invariant rule constraints, and each entity state machine (states, ' +
  'initial state, terminal states, transitions). Do NOT decide coherence yourself — the tool runs a ' +
  'deterministic truth-table proof. Report its verdict verbatim, then summarize which issues are ' +
  'spec gaps (route to designer) vs implementation gaps (route to debugger).';

/**
 * Factory: build the logic-evaluator agent. The single tool runs the deterministic engine,
 * so the verdict can never be hallucinated. `onVerdict` lets the caller route issues.
 */
export function createLogicEvaluatorAgent(
  onVerdict?: (verdict: LogicVerdict, spec: RuleSpec) => void,
) {
  console.log(`${LOGIC_LOG_PREFIX} create`);

  const verifyTool = tool(
    async (input: RuleSpec) => {
      console.log(
        `${LOGIC_LOG_PREFIX} verify_rule_spec props=${input.propositions.length} machines=${input.stateMachines.length}`,
      );
      let verdict: LogicVerdict;
      try {
        verdict = evaluateRuleSpec(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${LOGIC_LOG_PREFIX} verify_rule_spec engine error`, error);
        verdict = {
          coherent: false,
          issues: [{ kind: 'parse_error', route: 'spec', detail: message }],
          casesEnumerated: 0,
        };
      }
      try {
        onVerdict?.(verdict, input);
      } catch (cbErr) {
        console.error(`${LOGIC_LOG_PREFIX} onVerdict callback threw`, cbErr);
      }
      console.log(
        `${LOGIC_LOG_PREFIX} verdict coherent=${verdict.coherent} issues=${verdict.issues.length} cases=${verdict.casesEnumerated}`,
      );
      return JSON.stringify(verdict);
    },
    {
      name: 'verify_rule_spec',
      description:
        'Run a deterministic truth-table / state-machine proof over the extracted rule spec. ' +
        'Returns a verdict JSON: { coherent, issues[], casesEnumerated }.',
      schema: RuleSpecSchema,
    },
  );

  return createAgent({
    model: createTriageModel(),
    tools: [verifyTool],
    systemPrompt: SYSTEM_PROMPT,
  });
}
