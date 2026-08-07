export const REVIVE_TRACE_LIMITS = Object.freeze({
  minDrawnSamples: 140,
  minCoverage: 0.22,
  minPrecision: 0.16,
  minScore: 0.25
});

export function buildReviveCharacterPool(characters = [], readingByHanja = {}) {
  const seen = new Set();
  return characters.flatMap((entry) => {
    const char = String(entry?.hanja || "").trim();
    if (Array.from(char).length !== 1 || seen.has(char)) return [];
    const reading = String(
      readingByHanja[char]
      || entry.hunEum
      || entry.hun_eum
      || entry.radicalHunEum
      || entry.radical_hun_eum
      || entry.reading
      || ""
    ).trim();
    if (!reading) return [];
    seen.add(char);
    return [{ char, reading }];
  });
}

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
