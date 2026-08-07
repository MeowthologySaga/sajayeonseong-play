export const REVIVE_TRACE_LIMITS = Object.freeze({
  minDrawnSamples: 140,
  minCoverage: 0.22,
  minPrecision: 0.16,
  minScore: 0.25
});

export function scoreReviveTrace({ targetCount = 0, overlap = 0, drawnCount = 0 } = {}) {
  const coverage = targetCount > 0 ? overlap / targetCount : 0;
  const precision = drawnCount > 0 ? overlap / drawnCount : 0;
  return {
    coverage,
    precision,
    score: coverage * 0.72 + precision * 0.28,
    drawn: drawnCount
  };
}

export function passesReviveTrace(metrics, limits = REVIVE_TRACE_LIMITS) {
  return Boolean(metrics
    && metrics.drawn >= limits.minDrawnSamples
    && metrics.coverage >= limits.minCoverage
    && metrics.precision >= limits.minPrecision
    && metrics.score >= limits.minScore);
}
