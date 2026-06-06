/**
 * Debugger agent — repair, not regeneration. Receives structured failures (tester output,
 * playtester invariant violations, logic-evaluator contradictions, runtime stack traces) plus
 * the specific offending file, and produces MINIMAL diffs that preserve working code. Never
 * rewrites whole files; bounded retry budget, then escalates to the user with a clear report.
 */
