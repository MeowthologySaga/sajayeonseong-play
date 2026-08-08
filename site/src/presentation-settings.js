export const IDIOM_SPEED_STORAGE_KEY = "sajayeonseong-idiom-speed";
export const BATTLE_DISPLAY_STORAGE_KEY = "sajayeonseong-battle-display";

export const IDIOM_CAST_TIMINGS = Object.freeze({
  fast: Object.freeze({
    roguelike: Object.freeze({ holdMs: 620, animationMs: 620, glyphStaggerMs: 80 }),
    puzzle: Object.freeze({ holdMs: 900, animationMs: 1550, glyphStaggerMs: 80 })
  }),
  slow: Object.freeze({
    // Slow is intentionally a reading pace, not a slightly slower flourish.
    // These values are at least 1.5× the former slow presentation time.
    roguelike: Object.freeze({ holdMs: 4200, animationMs: 4200, glyphStaggerMs: 320 }),
    puzzle: Object.freeze({ holdMs: 5200, animationMs: 5200, glyphStaggerMs: 320 })
  })
});

// Fast preserves the timing used before the display preference existed.
// Slow gives combat cause/result copy enough time to be read as a single toast.
export const BATTLE_FEEDBACK_TIMINGS = Object.freeze({
  fast: Object.freeze({ playerMs: 2100, enemyMs: 3000, prepareMs: 3000 }),
  slow: Object.freeze({ playerMs: 4800, enemyMs: 6200, prepareMs: 6200 })
});

export function normalizeIdiomSpeed(value) {
  return value === "fast" ? "fast" : "slow";
}

export function getIdiomCastTiming(speed, mode) {
  const normalizedSpeed = normalizeIdiomSpeed(speed);
  const normalizedMode = mode === "roguelike" ? "roguelike" : "puzzle";
  return IDIOM_CAST_TIMINGS[normalizedSpeed][normalizedMode];
}

/** Missing and legacy values deliberately normalize to the old fast behavior. */
export function normalizeBattleDisplay(value) {
  return value === "slow" ? "slow" : "fast";
}

export function getBattleFeedbackDuration(display, kind) {
  const timing = BATTLE_FEEDBACK_TIMINGS[normalizeBattleDisplay(display)];
  if (kind === "enemy") return timing.enemyMs;
  if (kind === "prepare") return timing.prepareMs;
  return timing.playerMs;
}
