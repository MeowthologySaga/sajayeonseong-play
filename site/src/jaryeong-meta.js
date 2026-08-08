export const JARYEONG_META_SAVE_KEY = "sajayeonseong-jaryeong-meta-v1";
// 이전 로컬 저장 키는 유지하고 페이로드 버전만 올려 자동 이관한다.
export const JARYEONG_META_SAVE_VERSION = 2;
export const JARYEONG_PARTY_SIZE = 5;
export const JARYEONG_MAX_LEVEL = 99;
export const JARYEONG_MAX_AWAKENING = 5;
export const JARYEONG_LEVEL_PROGRESS_MAX = 100;
export const DUPLICATE_LEVEL_PROGRESS = 25;
export const TARGET_FRAGMENT_PITY_MISSES = 3;
export const TARGET_FRAGMENT_PITY_SOURCES = Object.freeze(["rare", "elite", "boss"]);

export const JARYEONG_SUMMON_THRESHOLDS = Object.freeze({
  common: 12,
  uncommon: 24,
  rare: 40,
  legendary: 60
});

export const JARYEONG_FRAGMENT_AWARDS = Object.freeze({
  normal: 2,
  rare: 4,
  elite: 6,
  boss: 10,
  meta: 5
});

export const JARYEONG_META_CATALOG = Object.freeze([
  ["wood-mok", "common"], ["wood-tree", "uncommon"], ["wood-life", "rare"],
  ["wood-bamboo", "common"], ["wood-orchid", "rare"], ["wood-forest", "legendary"],
  ["fire-hwa", "common"], ["fire-light", "uncommon"], ["fire-sun", "rare"],
  ["fire-lantern", "common"], ["fire-fox", "rare"], ["fire-phoenix", "legendary"],
  ["earth-to", "common"], ["earth-stone", "uncommon"], ["earth-mountain", "rare"],
  ["earth-pottery", "rare"], ["earth-tortoise", "common"], ["earth-valley", "legendary"],
  ["metal-gold", "common"], ["metal-jade", "uncommon"], ["metal-sword", "rare"],
  ["metal-bell", "common"], ["metal-mirror", "rare"], ["metal-chain", "legendary"],
  ["water-sui", "common"], ["water-rain", "uncommon"], ["water-sea", "rare"],
  ["water-abyss", "common"], ["water-ice", "rare"], ["water-mist", "legendary"]
].map(([id, rarity]) => Object.freeze({ id, rarity })));

export const DEFAULT_JARYEONG_STARTER_PARTY = Object.freeze([
  "wood-mok",
  "fire-hwa",
  "earth-to",
  "metal-gold",
  "water-sui"
]);

const AWARD_SOURCE_ALIASES = Object.freeze({
  battle: "normal",
  normalMonster: "normal",
  "normal-monster": "normal",
  rareMonster: "rare",
  "rare-monster": "rare"
});

function integerInRange(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function catalogMap(catalog = JARYEONG_META_CATALOG) {
  const rows = Array.isArray(catalog)
    ? catalog
    : Object.entries(catalog || {}).map(([id, value]) => ({ id, ...(typeof value === "string" ? { rarity: value } : value) }));
  return new Map(rows
    .filter((entry) => entry?.id)
    .map((entry) => [String(entry.id), {
      id: String(entry.id),
      rarity: Object.hasOwn(JARYEONG_SUMMON_THRESHOLDS, entry.rarity) ? entry.rarity : "common"
    }]));
}

function normalizedStarterParty(starterParty, definitions) {
  const requested = Array.isArray(starterParty) ? starterParty : DEFAULT_JARYEONG_STARTER_PARTY;
  const unique = [...new Set(requested.filter((id) => definitions.has(id)))];
  for (const id of definitions.keys()) {
    if (unique.length >= JARYEONG_PARTY_SIZE) break;
    if (!unique.includes(id)) unique.push(id);
  }
  return unique.slice(0, JARYEONG_PARTY_SIZE);
}

function blankOwnedRecord() {
  return { level: 1, levelProgress: 0, awakening: 0, duplicateSummons: 0 };
}

function sanitizeOwnedRecord(value, legacyLevel) {
  const source = value && typeof value === "object" ? value : {};
  return {
    level: integerInRange(source.level ?? legacyLevel, 1, JARYEONG_MAX_LEVEL, 1),
    levelProgress: integerInRange(source.levelProgress, 0, JARYEONG_LEVEL_PROGRESS_MAX - 1, 0),
    awakening: integerInRange(source.awakening, 0, JARYEONG_MAX_AWAKENING, 0),
    duplicateSummons: integerInRange(source.duplicateSummons, 0, Number.MAX_SAFE_INTEGER, 0)
  };
}

function unwrapMetaState(raw) {
  if (!raw || typeof raw !== "object") return {};
  return raw.jaryeongMeta && typeof raw.jaryeongMeta === "object" ? raw.jaryeongMeta : raw;
}

function legacyPartyIds(raw, source) {
  const candidates = [
    source.equippedParty,
    source.equippedJaryeongIds,
    source.partyJaryeongIds,
    raw?.run?.partyJaryeongIds
  ];
  return candidates.find(Array.isArray) || [];
}

export function createDefaultJaryeongMetaState(options = {}) {
  const definitions = catalogMap(options.catalog);
  const equippedParty = normalizedStarterParty(options.starterParty, definitions);
  return {
    version: JARYEONG_META_SAVE_VERSION,
    owned: Object.fromEntries(equippedParty.map((id) => [id, blankOwnedRecord()])),
    equippedParty,
    fragments: {},
    targetJaryeongId: null,
    targetFragmentMisses: 0
  };
}

export function sanitizeJaryeongMetaState(raw, options = {}) {
  const definitions = catalogMap(options.catalog);
  const starterParty = normalizedStarterParty(options.starterParty, definitions);
  const source = unwrapMetaState(raw);
  const legacyLevels = source.jaryeongLevels || raw?.run?.jaryeongLevels || {};
  const owned = {};

  const ownedSource = source.owned && typeof source.owned === "object" ? source.owned : {};
  const explicitOwnedIds = [
    ...(Array.isArray(source.owned) ? source.owned : Object.keys(ownedSource)),
    ...(Array.isArray(source.ownedJaryeongIds) ? source.ownedJaryeongIds : []),
    ...legacyPartyIds(raw, source),
    ...starterParty
  ];

  for (const id of [...new Set(explicitOwnedIds)]) {
    if (!definitions.has(id)) continue;
    owned[id] = sanitizeOwnedRecord(Array.isArray(source.owned) ? null : ownedSource[id], legacyLevels[id]);
  }

  const fragmentSource = source.fragments || source.talismanFragments || source.jaryeongFragments || {};
  const fragments = {};
  if (fragmentSource && typeof fragmentSource === "object") {
    for (const [id, amount] of Object.entries(fragmentSource)) {
      if (!definitions.has(id)) continue;
      const normalized = integerInRange(amount, 0, Number.MAX_SAFE_INTEGER, 0);
      if (normalized > 0) fragments[id] = normalized;
    }
  }

  const requestedParty = legacyPartyIds(raw, source);
  const equippedParty = [];
  for (const id of [...requestedParty, ...starterParty, ...Object.keys(owned)]) {
    if (equippedParty.length >= JARYEONG_PARTY_SIZE) break;
    if (definitions.has(id) && owned[id] && !equippedParty.includes(id)) equippedParty.push(id);
  }

  const requestedTargetRecord = owned[source.targetJaryeongId];
  const targetIsMaxed = requestedTargetRecord?.level >= JARYEONG_MAX_LEVEL
    && requestedTargetRecord.awakening >= JARYEONG_MAX_AWAKENING;
  const targetJaryeongId = definitions.has(source.targetJaryeongId) && !targetIsMaxed ? source.targetJaryeongId : null;
  const targetFragmentMisses = targetJaryeongId
    ? integerInRange(source.targetFragmentMisses, 0, TARGET_FRAGMENT_PITY_MISSES, 0)
    : 0;

  return {
    version: JARYEONG_META_SAVE_VERSION,
    owned,
    equippedParty,
    fragments,
    targetJaryeongId,
    targetFragmentMisses
  };
}

export function validateJaryeongMetaState(raw, options = {}) {
  const errors = [];
  const definitions = catalogMap(options.catalog);
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["state_missing"] };
  if (raw.version !== JARYEONG_META_SAVE_VERSION) errors.push("version_invalid");
  if (!raw.owned || typeof raw.owned !== "object" || Array.isArray(raw.owned)) errors.push("owned_invalid");
  else {
    for (const [id, record] of Object.entries(raw.owned)) {
      if (!definitions.has(id)) errors.push(`owned_unknown:${id}`);
      if (!record || typeof record !== "object"
        || !Number.isInteger(record.level) || record.level < 1 || record.level > JARYEONG_MAX_LEVEL
        || !Number.isInteger(record.levelProgress) || record.levelProgress < 0 || record.levelProgress >= JARYEONG_LEVEL_PROGRESS_MAX
        || !Number.isInteger(record.awakening) || record.awakening < 0 || record.awakening > JARYEONG_MAX_AWAKENING
        || !Number.isInteger(record.duplicateSummons) || record.duplicateSummons < 0) errors.push(`owned_record_invalid:${id}`);
    }
  }
  if (!Array.isArray(raw.equippedParty)
    || raw.equippedParty.length !== JARYEONG_PARTY_SIZE
    || new Set(raw.equippedParty).size !== JARYEONG_PARTY_SIZE) errors.push("party_invalid");
  else if (raw.equippedParty.some((id) => !raw.owned?.[id])) errors.push("party_not_owned");
  if (!raw.fragments || typeof raw.fragments !== "object" || Array.isArray(raw.fragments)) errors.push("fragments_invalid");
  else {
    for (const [id, amount] of Object.entries(raw.fragments)) {
      if (!definitions.has(id)) errors.push(`fragments_unknown:${id}`);
      if (!Number.isInteger(amount) || amount < 0) errors.push(`fragments_amount_invalid:${id}`);
    }
  }
  if (raw.targetJaryeongId !== null && !definitions.has(raw.targetJaryeongId)) errors.push("target_jaryeong_invalid");
  if (!Number.isInteger(raw.targetFragmentMisses)
    || raw.targetFragmentMisses < 0
    || raw.targetFragmentMisses > TARGET_FRAGMENT_PITY_MISSES
    || (raw.targetJaryeongId === null && raw.targetFragmentMisses !== 0)) errors.push("target_fragment_misses_invalid");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function getJaryeongRarity(id, options = {}) {
  return catalogMap(options.catalog).get(id)?.rarity || null;
}

export function getJaryeongSummonThreshold(id, options = {}) {
  const rarity = getJaryeongRarity(id, options);
  return rarity ? JARYEONG_SUMMON_THRESHOLDS[rarity] : null;
}

export function getFragmentAwardAmount(source) {
  const normalizedSource = AWARD_SOURCE_ALIASES[source] || source;
  return JARYEONG_FRAGMENT_AWARDS[normalizedSource] ?? null;
}

export function setTargetJaryeong(rawState, targetJaryeongId, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  if (targetJaryeongId == null) {
    return {
      ok: true,
      changed: state.targetJaryeongId !== null,
      state: { ...state, targetJaryeongId: null, targetFragmentMisses: 0 }
    };
  }
  if (!catalogMap(options.catalog).has(targetJaryeongId)) {
    return { ok: false, reason: "jaryeong_unknown", changed: false, state };
  }
  const targetRecord = state.owned[targetJaryeongId];
  if (targetRecord?.level >= JARYEONG_MAX_LEVEL && targetRecord.awakening >= JARYEONG_MAX_AWAKENING) {
    return { ok: false, reason: "jaryeong_maxed", changed: false, state };
  }
  if (state.targetJaryeongId === targetJaryeongId) return { ok: true, changed: false, state };
  return {
    ok: true,
    changed: true,
    state: { ...state, targetJaryeongId, targetFragmentMisses: 0 }
  };
}

export function resetTargetFragmentPity(rawState, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  return { ...state, targetFragmentMisses: 0 };
}

export function setEquippedJaryeongParty(rawState, partyIds, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  const requested = Array.isArray(partyIds) ? partyIds : [];
  if (requested.length !== JARYEONG_PARTY_SIZE) return { ok: false, reason: "party_size", state };
  if (new Set(requested).size !== JARYEONG_PARTY_SIZE) return { ok: false, reason: "party_duplicate", state };
  const missingId = requested.find((id) => !state.owned[id]);
  if (missingId) return { ok: false, reason: "party_not_owned", jaryeongId: missingId, state };
  return { ok: true, state: { ...state, equippedParty: [...requested] } };
}

export function getPreparedJaryeongParty(rawState, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  const validation = validateJaryeongMetaState(state, options);
  return {
    ok: validation.ok && state.equippedParty.length === JARYEONG_PARTY_SIZE,
    partyIds: [...state.equippedParty],
    state,
    errors: validation.errors
  };
}

export function awardTalismanFragments(rawState, award, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  const definitions = catalogMap(options.catalog);
  const requestedJaryeongId = award?.jaryeongId;
  if (!definitions.has(requestedJaryeongId)) return { ok: false, reason: "jaryeong_unknown", state };
  const source = AWARD_SOURCE_ALIASES[award?.source] || award?.source;
  const unitAmount = getFragmentAwardAmount(source);
  if (unitAmount == null) return { ok: false, reason: "source_unknown", state };
  const pityEligible = TARGET_FRAGMENT_PITY_SOURCES.includes(source);
  const guaranteedByPity = Boolean(state.targetJaryeongId
    && state.targetFragmentMisses >= TARGET_FRAGMENT_PITY_MISSES
    && pityEligible);
  const jaryeongId = guaranteedByPity ? state.targetJaryeongId : requestedJaryeongId;
  const replacedByPity = guaranteedByPity && requestedJaryeongId !== jaryeongId;
  const count = integerInRange(award?.count, 1, 1_000, 1);
  const amount = unitAmount * count;
  const previous = state.fragments[jaryeongId] || 0;
  const total = Math.min(Number.MAX_SAFE_INTEGER, previous + amount);
  const previousMisses = state.targetFragmentMisses;
  const targetFragmentMisses = !state.targetJaryeongId || jaryeongId === state.targetJaryeongId
    ? 0
    : Math.min(TARGET_FRAGMENT_PITY_MISSES, previousMisses + 1);
  const nextState = {
    ...state,
    fragments: { ...state.fragments, [jaryeongId]: total },
    targetFragmentMisses
  };
  return {
    ok: true,
    state: nextState,
    award: {
      requestedJaryeongId,
      jaryeongId,
      source,
      unitAmount,
      count,
      amount,
      previous,
      total,
      pityEligible,
      guaranteedByPity,
      replacedByPity,
      previousMisses,
      targetFragmentMisses
    }
  };
}

export function summonJaryeong(rawState, jaryeongId, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  const rarity = getJaryeongRarity(jaryeongId, options);
  if (!rarity) return { ok: false, reason: "jaryeong_unknown", state };
  const required = JARYEONG_SUMMON_THRESHOLDS[rarity];
  const available = state.fragments[jaryeongId] || 0;
  const previous = state.owned[jaryeongId];
  if (previous?.level >= JARYEONG_MAX_LEVEL && previous.awakening >= JARYEONG_MAX_AWAKENING) {
    return { ok: false, reason: "jaryeong_maxed", required, available, state };
  }
  if (available < required) {
    return { ok: false, reason: "insufficient_fragments", required, available, state };
  }

  const fragments = { ...state.fragments, [jaryeongId]: available - required };
  if (!previous) {
    const nextState = {
      ...state,
      fragments,
      owned: { ...state.owned, [jaryeongId]: blankOwnedRecord() }
    };
    return { ok: true, kind: "unlock", rarity, required, state: nextState, record: nextState.owned[jaryeongId] };
  }

  const duplicateSummons = previous.duplicateSummons + 1;
  let level = previous.level;
  let levelProgress = previous.levelProgress;
  if (level < JARYEONG_MAX_LEVEL) {
    levelProgress += DUPLICATE_LEVEL_PROGRESS;
    while (levelProgress >= JARYEONG_LEVEL_PROGRESS_MAX && level < JARYEONG_MAX_LEVEL) {
      level++;
      levelProgress -= JARYEONG_LEVEL_PROGRESS_MAX;
    }
    if (level >= JARYEONG_MAX_LEVEL) levelProgress = 0;
  }
  const record = {
    level,
    levelProgress,
    awakening: Math.min(JARYEONG_MAX_AWAKENING, previous.awakening + 1),
    duplicateSummons
  };
  const reachedMaximum = record.level >= JARYEONG_MAX_LEVEL && record.awakening >= JARYEONG_MAX_AWAKENING;
  const nextState = {
    ...state,
    fragments,
    owned: { ...state.owned, [jaryeongId]: record },
    targetJaryeongId: reachedMaximum && state.targetJaryeongId === jaryeongId ? null : state.targetJaryeongId,
    targetFragmentMisses: reachedMaximum && state.targetJaryeongId === jaryeongId ? 0 : state.targetFragmentMisses
  };
  return { ok: true, kind: "duplicate", rarity, required, state: nextState, record };
}

export function encodeJaryeongMetaState(rawState, options = {}) {
  return JSON.stringify(sanitizeJaryeongMetaState(rawState, options));
}

export function decodeJaryeongMetaState(raw, options = {}) {
  if (!raw) {
    const state = createDefaultJaryeongMetaState(options);
    return { ok: true, repaired: true, state, errors: ["save_empty"] };
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const validation = validateJaryeongMetaState(parsed, options);
    return {
      ok: true,
      repaired: !validation.ok,
      state: sanitizeJaryeongMetaState(parsed, options),
      errors: validation.errors
    };
  } catch {
    return {
      ok: false,
      repaired: true,
      state: createDefaultJaryeongMetaState(options),
      errors: ["json_invalid"]
    };
  }
}
