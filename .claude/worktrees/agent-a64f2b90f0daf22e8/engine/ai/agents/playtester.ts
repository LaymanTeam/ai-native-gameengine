/**
 * Playtester agent — catches "compiles but unplayable". Drives the generated game headlessly
 * through engine/input/controller's action API against the bitECS world (no renderer) and
 * asserts invariants: player can move, win state reachable, lose state reachable, no NaN
 * positions, frame budget respected. Also vision-checks composed prototype-still screenshots
 * (via image-reviewer/Gemini vision) to catch integration errors individual asset review misses.
 * Failures route to the debugger agent, not back to full regeneration.
 */
