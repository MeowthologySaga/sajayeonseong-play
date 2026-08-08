export const DEFAULT_BACKGROUND_FALLBACK = "assets/backgrounds/act1-mistwood.png";

function usableEntries(pool) {
  const source = typeof pool === "string" ? [pool] : Array.isArray(pool) ? pool : [];
  return [...new Set(source.filter((entry) => typeof entry === "string" && entry.trim().length > 0))];
}

function normalizedIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.trunc(number));
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value ?? "sajayeonseong");
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectionKey({ runSeed, sceneKey, battleIndex, nodeIndex }) {
  return [
    String(runSeed ?? "sajayeonseong"),
    String(sceneKey ?? "scene"),
    `battle:${normalizedIndex(battleIndex)}`,
    `node:${normalizedIndex(nodeIndex)}`
  ].join("|");
}

export function validateBackgroundPool(pool, { label = "background pool" } = {}) {
  const entries = usableEntries(pool);
  const errors = [];

  if (pool == null) {
    errors.push(`${label} is missing`);
  } else if (typeof pool === "string") {
    if (!pool.trim()) errors.push(`${label} contains an empty path`);
  } else if (Array.isArray(pool)) {
    if (pool.length === 0) errors.push(`${label} is empty`);
    pool.forEach((entry, index) => {
      if (typeof entry !== "string" || !entry.trim()) {
        errors.push(`${label}[${index}] must be a non-empty string`);
      }
    });
    if (entries.length < pool.filter((entry) => typeof entry === "string" && entry.trim()).length) {
      errors.push(`${label} contains duplicate paths`);
    }
  } else {
    errors.push(`${label} must be a string or an array of strings`);
  }

  return { valid: errors.length === 0, entries, errors };
}

export function normalizeBackgroundPool(pool, fallback = DEFAULT_BACKGROUND_FALLBACK) {
  const primary = usableEntries(pool);
  if (primary.length) return primary;

  const fallbackEntries = usableEntries(fallback);
  if (fallbackEntries.length) return fallbackEntries;

  return [DEFAULT_BACKGROUND_FALLBACK];
}

export function chooseBackgroundVariant({
  pool,
  runSeed = "sajayeonseong",
  sceneKey = "scene",
  battleIndex = 0,
  nodeIndex = 0,
  previousBackground = null,
  fallback = DEFAULT_BACKGROUND_FALLBACK
} = {}) {
  const variants = normalizeBackgroundPool(pool, fallback);
  if (variants.length === 1) return variants[0];

  const key = selectionKey({ runSeed, sceneKey, battleIndex, nodeIndex });
  const selected = variants[hashText(key) % variants.length];
  if (selected !== previousBackground) return selected;

  const alternatives = variants.filter((entry) => entry !== previousBackground);
  return alternatives[hashText(`${key}|avoid-repeat`) % alternatives.length];
}

export function selectBackgroundForScene({
  pools,
  sceneKey,
  runSeed = "sajayeonseong",
  battleIndex = 0,
  nodeIndex = 0,
  previousBackground = null,
  fallback
} = {}) {
  const catalog = pools && typeof pools === "object" && !Array.isArray(pools) ? pools : null;
  const pool = catalog ? catalog[sceneKey] : pools;
  const resolvedFallback = fallback ?? catalog?.fallback ?? catalog?.default ?? DEFAULT_BACKGROUND_FALLBACK;

  return chooseBackgroundVariant({
    pool,
    runSeed,
    sceneKey,
    battleIndex,
    nodeIndex,
    previousBackground,
    fallback: resolvedFallback
  });
}

export function validateBackgroundPools(pools, requiredSceneKeys = []) {
  const errors = [];
  if (!pools || typeof pools !== "object" || Array.isArray(pools)) {
    return { valid: false, errors: ["background pools must be an object keyed by scene"], scenes: {} };
  }

  const scenes = {};
  for (const sceneKey of requiredSceneKeys) {
    const result = validateBackgroundPool(pools[sceneKey], { label: `backgrounds.${sceneKey}` });
    scenes[sceneKey] = result;
    errors.push(...result.errors);
  }

  return { valid: errors.length === 0, errors, scenes };
}
