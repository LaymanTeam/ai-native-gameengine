/**
 * Logic-evaluator agent — static logic verification of the game's rules BEFORE and AFTER coding.
 * Parses the GDD and systems/rules into logical propositions and checks consistency via truth
 * tables / exhaustive case enumeration (deterministic code, model only extracts propositions):
 * win and lose conditions are mutually exclusive and both reachable, no contradictory rules
 * (e.g. "key opens door" vs "door never opens"), every entity state transition has a defined
 * outcome, no dead-end states outside lose conditions. Flags uncovered cases to the designer
 * (spec gap) or debugger (implementation gap). Complements the playtester: this proves the
 * RULES are coherent; the playtester proves the BUILD obeys them.
 */
