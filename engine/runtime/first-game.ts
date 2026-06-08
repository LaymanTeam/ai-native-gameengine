/**
 * First-game vertical slice target.
 *
 * This is the concrete prompt the app can use as a golden slice while the broader
 * arbitrary-prompt engine continues to mature. The JSON source is also read by
 * Node QA scripts so the UI preset and recurring visual matrix cannot drift.
 */
import firstGameVerticalSlice from './first-game.json';

export const FIRST_GAME_VERTICAL_SLICE = firstGameVerticalSlice;
