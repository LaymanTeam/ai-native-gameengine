/**
 * Designer/producer agent — phase 0 of the pipeline. Converts the user's prompt into a BOUNDED
 * game design document (reports/gdd.md + machine-readable config/gdd.json): one core mechanic,
 * 1-3 scenes, explicit non-goals/scope cuts. Confirms the GDD with the user in chat BEFORE any
 * generation spends tokens. The GDD is the cross-agent source of truth — every downstream agent
 * (coder, image-reviewer, playtester, logic-evaluator) receives it.
 */
