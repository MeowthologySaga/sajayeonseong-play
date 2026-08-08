export const RARE_ENCOUNTER_SAVE_VERSION = 1;
export const RARE_FIRST_CANDIDATE_DEADLINE_MS = 5 * 60 * 1_000;
export const RARE_FIRST_CANDIDATE_MIN_CHANCE = 0.35;

export const RARE_ENCOUNTER_CHANCE_BY_ACT = Object.freeze({
  1: 0.08,
  2: 0.12,
  3: 0.18
});

export const RARE_SPAWN_CHANCE_BY_ACT = RARE_ENCOUNTER_CHANCE_BY_ACT;

export const RARE_GIMMICKS = Object.freeze({
  ESCAPE_COUNTDOWN: "escapeCountdown",
  TALISMAN_SHIELD: "talismanShield",
  IDIOM_WEAKNESS: "idiomWeakness"
});

export const RARE_GIMMICK_TYPES = Object.freeze(Object.values(RARE_GIMMICKS));

const NORMAL_BATTLE_TYPES = new Set(["battle", "normal", "normalBattle", "normal-battle"]);
const MAX_ROLL = 1 - Number.EPSILON;

function normalizedInteger(value, minimum = 0, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.floor(number));
}

function normalizedAmount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function normalizedAct(value) {
  return Math.min(3, Math.max(1, normalizedInteger(value, 1, 1)));
}

function normalizedRoll(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(MAX_ROLL, Math.max(0, number));
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

function encounterTypeOf(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.nodeType
    ?? value.encounterType
    ?? value.type
    ?? value.kind
    ?? value.node?.type
    ?? value.node?.kind
    ?? "";
}

function cloneEncounterState(state) {
  return {
    ...state,
    idiomWeakness: state?.idiomWeakness ? { ...state.idiomWeakness } : null,
    outcome: state?.outcome ? { ...state.outcome } : null
  };
}

function terminalOutcome(kind) {
  const defeated = kind === "defeated";
  return {
    kind,
    success: defeated,
    escaped: !defeated,
    rewardEligible: defeated,
    runContinues: true,
    runEnded: false
  };
}

export function isRareEncounterCandidate(value) {
  return NORMAL_BATTLE_TYPES.has(String(encounterTypeOf(value)));
}

export function deterministicRareRoll({
  runSeed = "sajayeonseong",
  act = 1,
  nodeId = "",
  battleIndex = 0,
  candidateIndex = 0
} = {}) {
  const key = [
    String(runSeed),
    `act:${normalizedAct(act)}`,
    `node:${String(nodeId)}`,
    `battle:${normalizedInteger(battleIndex)}`,
    `candidate:${normalizedInteger(candidateIndex)}`
  ].join("|");
  return hashText(key) / 4294967296;
}

export function rollRareEncounter(options = {}) {
  const act = normalizedAct(options.act);
  const baseChance = RARE_ENCOUNTER_CHANCE_BY_ACT[act];
  if (!isRareEncounterCandidate(options.node ?? options)) {
    return {
      eligible: false,
      appears: false,
      isRare: false,
      act,
      baseChance: 0,
      chance: 0,
      roll: null,
      firstCandidateAdjusted: false,
      forcedByDeadline: false,
      guaranteed: false,
      reason: "not_normal_battle"
    };
  }

  const elapsedMs = normalizedInteger(options.elapsedMs);
  const candidatesSeen = normalizedInteger(
    options.candidatesSeen ?? options.normalBattlesChecked ?? options.candidateIndex
  );
  const rareEncounterSeen = Boolean(
    options.rareEncounterSeen ?? options.hasSeenRareEncounter ?? options.rareSeen
  );
  const firstCandidateAdjusted = !rareEncounterSeen
    && candidatesSeen === 0
    && elapsedMs < RARE_FIRST_CANDIDATE_DEADLINE_MS;
  const forcedByDeadline = !rareEncounterSeen
    && elapsedMs >= RARE_FIRST_CANDIDATE_DEADLINE_MS;
  const chance = forcedByDeadline
    ? 1
    : firstCandidateAdjusted
      ? Math.max(baseChance, RARE_FIRST_CANDIDATE_MIN_CHANCE)
      : baseChance;
  const suppliedRoll = normalizedRoll(options.roll);
  const roll = suppliedRoll ?? deterministicRareRoll({
    runSeed: options.runSeed,
    act,
    nodeId: options.nodeId ?? options.node?.id,
    battleIndex: options.battleIndex,
    candidateIndex: candidatesSeen
  });
  const appears = forcedByDeadline || roll < chance;

  return {
    eligible: true,
    appears,
    isRare: appears,
    act,
    baseChance,
    chance,
    roll,
    firstCandidateAdjusted,
    forcedByDeadline,
    guaranteed: forcedByDeadline,
    reason: forcedByDeadline ? "deadline_guarantee" : appears ? "roll_pass" : "roll_fail"
  };
}

export function shouldSpawnRareEncounter(options = {}) {
  return rollRareEncounter(options).appears;
}

export function createRareEncounterState({
  encounterId = "rare-encounter",
  gimmick = RARE_GIMMICKS.ESCAPE_COUNTDOWN,
  maxHp = 120,
  escapeTurns = 3,
  shield,
  weaknessIdiomId = null,
  weaknessMultiplier = 1.5
} = {}) {
  const gimmickType = typeof gimmick === "string" ? gimmick : gimmick?.type;
  if (!RARE_GIMMICK_TYPES.includes(gimmickType)) {
    throw new RangeError(`Unknown rare encounter gimmick: ${String(gimmickType)}`);
  }

  const safeMaxHp = Math.max(1, normalizedInteger(maxHp, 1, 120));
  const safeShield = normalizedInteger(shield, 0, Math.round(safeMaxHp * 0.35));
  const safeMultiplier = Math.max(1, normalizedAmount(weaknessMultiplier, 1.5));
  const weaknessId = weaknessIdiomId == null ? null : String(weaknessIdiomId);

  return {
    version: RARE_ENCOUNTER_SAVE_VERSION,
    encounterId: String(encounterId),
    gimmick: gimmickType,
    status: "active",
    turn: 0,
    maxHp: safeMaxHp,
    enemyHp: safeMaxHp,
    // Every rare jaryeong is a fleeing encounter. The selected gimmick adds
    // pressure on top of the shared countdown instead of replacing it.
    escapeCountdown: Math.max(1, normalizedInteger(escapeTurns, 1, 3)),
    talismanShield: gimmickType === RARE_GIMMICKS.TALISMAN_SHIELD ? safeShield : 0,
    idiomWeakness: gimmickType === RARE_GIMMICKS.IDIOM_WEAKNESS
      ? { idiomId: weaknessId, multiplier: safeMultiplier }
      : null,
    outcome: null,
    runContinues: true,
    runEnded: false
  };
}

export function calculateRareEncounterDamage(state, {
  baseDamage = 0,
  idiomId = null
} = {}) {
  const normalizedBaseDamage = normalizedAmount(baseDamage);
  const weakness = state?.gimmick === RARE_GIMMICKS.IDIOM_WEAKNESS
    ? state.idiomWeakness
    : null;
  const weaknessMatched = Boolean(
    weakness?.idiomId != null
    && idiomId != null
    && String(weakness.idiomId) === String(idiomId)
  );
  const multiplier = weaknessMatched ? Math.max(1, normalizedAmount(weakness.multiplier, 1)) : 1;
  const totalDamage = Math.round(normalizedBaseDamage * multiplier);
  const weaknessBonus = Math.max(0, totalDamage - normalizedBaseDamage);
  const shieldBefore = normalizedAmount(state?.talismanShield);
  const shieldDamage = Math.min(shieldBefore, totalDamage);
  const hpDamage = Math.max(0, totalDamage - shieldDamage);

  return {
    baseDamage: normalizedBaseDamage,
    multiplier,
    weaknessMatched,
    weaknessBonus,
    bonusDamage: weaknessBonus,
    totalDamage,
    shieldBefore,
    shieldDamage,
    absorbedByShield: shieldDamage,
    shieldAfter: shieldBefore - shieldDamage,
    hpDamage,
    damageToHp: hpDamage
  };
}

export function calculateIdiomWeaknessBonus(state, attack = {}) {
  const damage = calculateRareEncounterDamage(state, attack);
  return {
    matched: damage.weaknessMatched,
    multiplier: damage.multiplier,
    baseDamage: damage.baseDamage,
    bonusDamage: damage.weaknessBonus,
    totalDamage: damage.totalDamage
  };
}

export function applyRareEncounterDamage(state, attack = {}) {
  const current = cloneEncounterState(state);
  const enemyHpBefore = normalizedAmount(current.enemyHp);
  if (current.status !== "active") {
    return {
      state: current,
      damage: {
        ...calculateRareEncounterDamage({ ...current, talismanShield: 0 }, { baseDamage: 0 }),
        enemyHpBefore,
        enemyHpAfter: enemyHpBefore,
        ignored: true
      }
    };
  }

  const damage = calculateRareEncounterDamage(current, attack);
  const enemyHpAfter = Math.max(0, enemyHpBefore - damage.hpDamage);
  let next = {
    ...current,
    enemyHp: enemyHpAfter,
    talismanShield: damage.shieldAfter
  };
  if (enemyHpAfter === 0) {
    next = {
      ...next,
      status: "defeated",
      outcome: terminalOutcome("defeated")
    };
  }

  return {
    state: next,
    damage: { ...damage, enemyHpBefore, enemyHpAfter, ignored: false }
  };
}

export function advanceRareEncounterTurn(state, turnsOrOptions = 1) {
  const current = cloneEncounterState(state);
  if (current.status !== "active") return current;

  const requestedTurns = typeof turnsOrOptions === "object"
    ? turnsOrOptions?.turns
    : turnsOrOptions;
  const turns = normalizedInteger(requestedTurns, 0, 1);
  if (turns === 0) return current;

  let next = { ...current, turn: normalizedInteger(current.turn) + turns };
  if (current.escapeCountdown != null) {
    const escapeCountdown = Math.max(0, normalizedInteger(current.escapeCountdown) - turns);
    next = { ...next, escapeCountdown };
    if (escapeCountdown === 0) {
      next = {
        ...next,
        status: "escaped",
        outcome: terminalOutcome("escaped")
      };
    }
  }
  return next;
}

export function resolveRareEncounterTurn(state, attack = {}) {
  const applied = applyRareEncounterDamage(state, attack);
  return {
    damage: applied.damage,
    state: applied.state.status === "active"
      ? advanceRareEncounterTurn(applied.state, 1)
      : applied.state
  };
}
