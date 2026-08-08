export const IDIOM_SPEED_STORAGE_KEY = "sajayeonseong-idiom-speed";

export const IDIOM_CAST_TIMINGS = Object.freeze({
  fast: Object.freeze({
    roguelike: Object.freeze({ holdMs: 620, animationMs: 620, glyphStaggerMs: 80 }),
    puzzle: Object.freeze({ holdMs: 900, animationMs: 1550, glyphStaggerMs: 80 })
  }),
  slow: Object.freeze({
    roguelike: Object.freeze({ holdMs: 1750, animationMs: 1750, glyphStaggerMs: 160 }),
    puzzle: Object.freeze({ holdMs: 2300, animationMs: 2300, glyphStaggerMs: 160 })
  })
});

export function normalizeIdiomSpeed(value) {
  return value === "fast" ? "fast" : "slow";
}

export function getIdiomCastTiming(speed, mode) {
  const normalizedSpeed = normalizeIdiomSpeed(speed);
  const normalizedMode = mode === "roguelike" ? "roguelike" : "puzzle";
  return IDIOM_CAST_TIMINGS[normalizedSpeed][normalizedMode];
}
