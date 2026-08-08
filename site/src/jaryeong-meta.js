export const JARYEONG_META_SAVE_KEY = "sajayeonseong-jaryeong-meta-v1";
// 기존 저장은 보존한 채로 새 필드를 더하는 방식으로만 이관한다.
export const JARYEONG_META_SAVE_VERSION = 3;
export const JARYEONG_PARTY_SIZE = 5;
export const JARYEONG_MAX_LEVEL = 99;
export const JARYEONG_MAX_AWAKENING = 5;
export const JARYEONG_LEVEL_PROGRESS_MAX = 100;
export const DUPLICATE_LEVEL_PROGRESS = 25;
export const TALISMAN_PIECES_PER_SUMMON_TICKET = 10;
export const SUMMON_TICKET_COST = 1;

// 희귀/정예/보스 처치에서만 자동 획득하는 통합 부적 조각이다.
// 한 막에서 희귀(2) + 정예(3) + 보스(5)를 모두 처치하면 교환권 1장이 된다.
export const TALISMAN_PIECE_AWARDS = Object.freeze({
  rare: 2,
  elite: 3,
  boss: 5
});

// 아래 상수와 천장 필드는 이전 저장/호출부가 안전하게 복구될 수 있도록 남긴 호환 표면이다.
// 신규 경제는 개별 자령 조각이나 조각 천장을 사용하지 않는다.
export const TARGET_FRAGMENT_PITY_MISSES = 3;
export const TARGET_FRAGMENT_PITY_SOURCES = Object.freeze(["rare", "elite", "boss"]);

/** @deprecated 모든 소환은 교환권 1장을 사용한다. */
export const JARYEONG_SUMMON_THRESHOLDS = Object.freeze({
  common: SUMMON_TICKET_COST,
  uncommon: SUMMON_TICKET_COST,
  rare: SUMMON_TICKET_COST,
  legendary: SUMMON_TICKET_COST
});

/** @deprecated TALISMAN_PIECE_AWARDS를 사용한다. */
export const JARYEONG_FRAGMENT_AWARDS = TALISMAN_PIECE_AWARDS;

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
  rareMonster: "rare",
  "rare-monster": "rare",
  eliteMonster: "elite",
  "elite-monster": "elite",
  bossMonster: "boss",
  "boss-monster": "boss"
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

function safeIntegerAdd(total, amount) {
  return Math.min(Number.MAX_SAFE_INTEGER, total + amount);
}

function legacyFragmentPieceTotal(raw, source) {
  // v3 이후 저장은 이미 통합 조각으로 이관된 상태다. 같은 값을 다시 더하지 않는다.
  if (integerInRange(source?.version, 0, Number.MAX_SAFE_INTEGER, 0) >= JARYEONG_META_SAVE_VERSION) return 0;
  const candidates = [
    source?.fragments,
    source?.talismanFragments,
    source?.jaryeongFragments,
    raw !== source ? raw?.fragments : null,
    raw !== source ? raw?.talismanFragments : null,
    raw !== source ? raw?.jaryeongFragments : null,
    raw?.run?.fragments,
    raw?.run?.talismanFragments,
    raw?.run?.jaryeongFragments
  ];
  const seen = new Set();
  let total = 0;
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    for (const amount of Object.values(candidate)) {
      total = safeIntegerAdd(total, integerInRange(amount, 0, Number.MAX_SAFE_INTEGER, 0));
    }
  }
  return total;
}

function unifiedCounter(source, raw, field) {
  const value = source?.[field] ?? (raw !== source ? raw?.[field] : undefined) ?? raw?.run?.[field];
  return integerInRange(value, 0, Number.MAX_SAFE_INTEGER, 0);
}

export function createDefaultJaryeongMetaState(options = {}) {
  const definitions = catalogMap(options.catalog);
  const equippedParty = normalizedStarterParty(options.starterParty, definitions);
  return {
    version: JARYEONG_META_SAVE_VERSION,
    owned: Object.fromEntries(equippedParty.map((id) => [id, blankOwnedRecord()])),
    equippedParty,
    talismanPieces: 0,
    summonTickets: 0,
    // 구 호출부가 안전하게 읽을 수 있도록 빈 객체만 유지한다. 신규 경제는 이 값을 쓰지 않는다.
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

  const talismanPieces = safeIntegerAdd(
    unifiedCounter(source, raw, "talismanPieces"),
    legacyFragmentPieceTotal(raw, source)
  );
  const summonTickets = unifiedCounter(source, raw, "summonTickets");

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
  // 조각 천장은 통합 화폐로 전환하면서 종료됐다. 기존 값은 의도적으로 0으로 정리한다.
  const targetFragmentMisses = 0;

  return {
    version: JARYEONG_META_SAVE_VERSION,
    owned,
    equippedParty,
    talismanPieces,
    summonTickets,
    fragments: {},
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
  if (!Number.isInteger(raw.talismanPieces) || raw.talismanPieces < 0 || raw.talismanPieces > Number.MAX_SAFE_INTEGER) errors.push("talisman_pieces_invalid");
  if (!Number.isInteger(raw.summonTickets) || raw.summonTickets < 0 || raw.summonTickets > Number.MAX_SAFE_INTEGER) errors.push("summon_tickets_invalid");
  if (raw.fragments !== undefined) {
    if (!raw.fragments || typeof raw.fragments !== "object" || Array.isArray(raw.fragments)) errors.push("fragments_invalid");
    else if (Object.values(raw.fragments).some((amount) => Number(amount) !== 0)) errors.push("legacy_fragments_not_migrated");
  }
  if (raw.targetJaryeongId !== null && !definitions.has(raw.targetJaryeongId)) errors.push("target_jaryeong_invalid");
  if (!Number.isInteger(raw.targetFragmentMisses)
    || raw.targetFragmentMisses < 0
    || raw.targetFragmentMisses !== 0) errors.push("target_fragment_misses_invalid");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function getJaryeongRarity(id, options = {}) {
  return catalogMap(options.catalog).get(id)?.rarity || null;
}

export function getJaryeongSummonTicketCost(id, options = {}) {
  return getJaryeongRarity(id, options) ? SUMMON_TICKET_COST : null;
}

/** @deprecated getJaryeongSummonTicketCost를 사용한다. */
export function getJaryeongSummonThreshold(id, options = {}) {
  return getJaryeongSummonTicketCost(id, options);
}

export function getTalismanPieceAwardAmount(source) {
  const normalizedSource = AWARD_SOURCE_ALIASES[source] || source;
  return TALISMAN_PIECE_AWARDS[normalizedSource] ?? null;
}

/** @deprecated getTalismanPieceAwardAmount를 사용한다. */
export function getFragmentAwardAmount(source) {
  return getTalismanPieceAwardAmount(source);
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

export function awardTalismanPieces(rawState, award, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  const source = AWARD_SOURCE_ALIASES[award?.source] || award?.source;
  const unitAmount = getTalismanPieceAwardAmount(source);
  if (unitAmount == null) return { ok: false, reason: "source_unknown", state };
  const count = integerInRange(award?.count, 1, 1_000, 1);
  const amount = unitAmount * count;
  const previousPieces = state.talismanPieces;
  const totalPieces = safeIntegerAdd(previousPieces, amount);
  const nextState = {
    ...state,
    talismanPieces: totalPieces
  };
  return {
    ok: true,
    state: nextState,
    award: {
      kind: "talisman-pieces",
      source,
      unitAmount,
      count,
      amount,
      previousPieces,
      totalPieces,
      // UI 연동을 단순하게 하기 위한 숫자 별칭이다.
      previous: previousPieces,
      total: totalPieces
    }
  };
}

/**
 * 이전 호출부를 위한 호환 래퍼. jaryeongId는 표시용으로만 되돌리고,
 * 실제 화폐는 언제나 단일 talismanPieces에만 적립한다.
 */
export function awardTalismanFragments(rawState, award, options = {}) {
  const result = awardTalismanPieces(rawState, award, options);
  if (!result.ok) return result;
  return {
    ...result,
    award: {
      ...result.award,
      requestedJaryeongId: award?.jaryeongId ?? null,
      jaryeongId: award?.jaryeongId ?? null,
      pityEligible: false,
      guaranteedByPity: false,
      replacedByPity: false,
      previousMisses: 0,
      targetFragmentMisses: 0
    }
  };
}

export function exchangeTalismanPiecesForSummonTicket(rawState, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  const requestedTickets = integerInRange(options?.count ?? options?.tickets, 1, 1_000, 1);
  const requiredPieces = TALISMAN_PIECES_PER_SUMMON_TICKET * requestedTickets;
  if (state.talismanPieces < requiredPieces) {
    return {
      ok: false,
      reason: "insufficient_talisman_pieces",
      requiredPieces,
      availablePieces: state.talismanPieces,
      requestedTickets,
      state
    };
  }
  const previousPieces = state.talismanPieces;
  const previousTickets = state.summonTickets;
  const nextState = {
    ...state,
    talismanPieces: previousPieces - requiredPieces,
    summonTickets: safeIntegerAdd(previousTickets, requestedTickets)
  };
  return {
    ok: true,
    state: nextState,
    exchange: {
      piecesPerTicket: TALISMAN_PIECES_PER_SUMMON_TICKET,
      requestedTickets,
      ticketsGranted: requestedTickets,
      piecesSpent: requiredPieces,
      previousPieces,
      totalPieces: nextState.talismanPieces,
      previousTickets,
      totalTickets: nextState.summonTickets
    }
  };
}

export function summonJaryeong(rawState, jaryeongId, options = {}) {
  const state = sanitizeJaryeongMetaState(rawState, options);
  const rarity = getJaryeongRarity(jaryeongId, options);
  if (!rarity) return { ok: false, reason: "jaryeong_unknown", state };
  const requiredTickets = SUMMON_TICKET_COST;
  const availableTickets = state.summonTickets;
  const previous = state.owned[jaryeongId];
  if (previous?.level >= JARYEONG_MAX_LEVEL && previous.awakening >= JARYEONG_MAX_AWAKENING) {
    return {
      ok: false,
      reason: "jaryeong_maxed",
      requiredTickets,
      availableTickets,
      // 이전 UI 호출부가 안전하게 읽을 수 있는 별칭이다.
      required: requiredTickets,
      available: availableTickets,
      state
    };
  }
  if (availableTickets < requiredTickets) {
    return {
      ok: false,
      reason: "insufficient_summon_tickets",
      requiredTickets,
      availableTickets,
      required: requiredTickets,
      available: availableTickets,
      state
    };
  }

  const summonTickets = availableTickets - requiredTickets;
  if (!previous) {
    const nextState = {
      ...state,
      summonTickets,
      owned: { ...state.owned, [jaryeongId]: blankOwnedRecord() }
    };
    return {
      ok: true,
      kind: "unlock",
      rarity,
      requiredTickets,
      ticketsConsumed: requiredTickets,
      required: requiredTickets,
      state: nextState,
      record: nextState.owned[jaryeongId]
    };
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
    summonTickets,
    owned: { ...state.owned, [jaryeongId]: record },
    targetJaryeongId: reachedMaximum && state.targetJaryeongId === jaryeongId ? null : state.targetJaryeongId,
    targetFragmentMisses: 0
  };
  return {
    ok: true,
    kind: "duplicate",
    rarity,
    requiredTickets,
    ticketsConsumed: requiredTickets,
    required: requiredTickets,
    state: nextState,
    record
  };
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
