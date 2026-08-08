import { createSeededRng, randomInt } from "./run-engine.js";

export const COMBAT_OBJECTIVE_VERSION = 1;

export const COMBAT_OBJECTIVE_TYPE = Object.freeze({
  SHIELD_VICTORY: "shield-victory",
  ELEMENT_PROCS: "element-procs",
  IDIOM_ACTIVATIONS: "idiom-activations",
  CLEAR_SEALS: "clear-seals",
  TURN_LIMIT_VICTORY: "turn-limit-victory"
});

export const COMBAT_OBJECTIVE_TYPES = Object.freeze(Object.values(COMBAT_OBJECTIVE_TYPE));
export const COMBAT_OBJECTIVE_ELEMENTS = Object.freeze(["wood", "fire", "earth", "metal", "water"]);

export const COMBAT_OBJECTIVE_EVENT = Object.freeze({
  BATTLE_STARTED: "battle-started",
  SHIELD_CHANGED: "shield-changed",
  ELEMENT_PROC: "element-proc",
  IDIOM_ACTIVATED: "idiom-activated",
  SEALS_APPLIED: "seals-applied",
  SEALS_REMOVED: "seals-removed",
  SEALS_CLEARED: "seals-cleared",
  BATTLE_WON: "battle-won",
  BATTLE_LOST: "battle-lost"
});

function freezeDefinition(definition) {
  return Object.freeze({
    ...definition,
    target: Object.freeze({ ...definition.target }),
    reward: Object.freeze({ ...definition.reward })
  });
}

export const COMBAT_OBJECTIVE_DEFINITIONS = Object.freeze({
  [COMBAT_OBJECTIVE_TYPE.SHIELD_VICTORY]: freezeDefinition({
    title: "호신 유지",
    description: "보호막을 1 이상 남기고 승리",
    target: { minimumShield: 1 },
    reward: { kind: "ink", amount: 4 }
  }),
  [COMBAT_OBJECTIVE_TYPE.ELEMENT_PROCS]: freezeDefinition({
    title: "오행 공명",
    description: "지정 오행 효과를 2회 발동",
    target: { count: 2 },
    reward: { kind: "ink", amount: 5 }
  }),
  [COMBAT_OBJECTIVE_TYPE.IDIOM_ACTIVATIONS]: freezeDefinition({
    title: "성어 연성",
    description: "성어를 2회 발동",
    target: { count: 2 },
    reward: { kind: "ink", amount: 4 }
  }),
  [COMBAT_OBJECTIVE_TYPE.CLEAR_SEALS]: freezeDefinition({
    title: "해봉",
    description: "전투 중 생긴 봉인을 전부 해제",
    target: { minimumSeals: 1 },
    reward: { kind: "ink", amount: 6 }
  }),
  [COMBAT_OBJECTIVE_TYPE.TURN_LIMIT_VICTORY]: freezeDefinition({
    title: "속전속결",
    description: "8턴 안에 승리",
    target: { turnLimit: 8 },
    reward: { kind: "ink", amount: 5 }
  })
});

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, nonNegativeInteger(value, fallback));
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeSelectionInput(input = {}) {
  const source = input && typeof input === "object" ? input : { seed: input };
  const coordinateSource = source.coordinates && typeof source.coordinates === "object"
    ? source.coordinates
    : source;
  const seed = String(source.seed ?? source.runSeed ?? "sajayeonseong");
  const coordinates = {
    act: positiveInteger(coordinateSource.act, 1),
    routeIndex: nonNegativeInteger(coordinateSource.routeIndex ?? coordinateSource.nodeIndex, 0),
    battleIndex: nonNegativeInteger(coordinateSource.battleIndex ?? coordinateSource.encounterIndex, 0)
  };
  return { seed, coordinates };
}

function initialProgress(type) {
  switch (type) {
    case COMBAT_OBJECTIVE_TYPE.SHIELD_VICTORY:
      return { won: false, samples: 0, minimumShield: null, shieldBroken: false };
    case COMBAT_OBJECTIVE_TYPE.ELEMENT_PROCS:
    case COMBAT_OBJECTIVE_TYPE.IDIOM_ACTIVATIONS:
      return { count: 0 };
    case COMBAT_OBJECTIVE_TYPE.CLEAR_SEALS:
      return { applied: 0, removed: 0, remaining: 0 };
    case COMBAT_OBJECTIVE_TYPE.TURN_LIMIT_VICTORY:
      return { won: false, victoryTurn: null };
    default:
      throw new TypeError(`Unknown combat objective type: ${type}`);
  }
}

function assertObjectiveState(state) {
  if (!state || typeof state !== "object" || state.version !== COMBAT_OBJECTIVE_VERSION) {
    throw new TypeError("Invalid combat objective state");
  }
  if (!COMBAT_OBJECTIVE_TYPES.includes(state.type)) {
    throw new TypeError(`Unknown combat objective type: ${state.type}`);
  }
}

function setStatus(state, status) {
  state.status = status;
  return state;
}

function eventAmount(event, fallback = 1) {
  return nonNegativeInteger(event?.count ?? event?.amount, fallback);
}

function recordShield(progress, event, minimumShield) {
  const rawShield = event?.shield ?? event?.currentShield ?? event?.value;
  if (!Number.isFinite(Number(rawShield))) return;
  const shield = Math.max(0, Number(rawShield));
  progress.samples += 1;
  progress.minimumShield = progress.minimumShield == null
    ? shield
    : Math.min(progress.minimumShield, shield);
  if (shield < minimumShield) progress.shieldBroken = true;
}

function advanceShieldObjective(state, event) {
  if ([
    COMBAT_OBJECTIVE_EVENT.BATTLE_STARTED,
    COMBAT_OBJECTIVE_EVENT.SHIELD_CHANGED,
    COMBAT_OBJECTIVE_EVENT.BATTLE_WON
  ].includes(event.type)) {
    recordShield(state.progress, event, state.target.minimumShield);
  }
  if (event.type === COMBAT_OBJECTIVE_EVENT.BATTLE_WON) state.progress.won = true;
  if (state.progress.won
    && state.progress.samples > 0
    && !state.progress.shieldBroken
    && state.progress.minimumShield >= state.target.minimumShield) {
    setStatus(state, "completed");
  }
}

function advanceElementObjective(state, event) {
  if (event.type !== COMBAT_OBJECTIVE_EVENT.ELEMENT_PROC || event.element !== state.target.element) return;
  state.progress.count = Math.min(state.target.count, state.progress.count + eventAmount(event));
  if (state.progress.count >= state.target.count) setStatus(state, "completed");
}

function advanceIdiomObjective(state, event) {
  if (event.type !== COMBAT_OBJECTIVE_EVENT.IDIOM_ACTIVATED) return;
  state.progress.count = Math.min(state.target.count, state.progress.count + eventAmount(event));
  if (state.progress.count >= state.target.count) setStatus(state, "completed");
}

function advanceSealObjective(state, event) {
  if (event.type === COMBAT_OBJECTIVE_EVENT.SEALS_APPLIED) {
    const count = eventAmount(event);
    state.progress.applied += count;
    state.progress.remaining += count;
  } else if (event.type === COMBAT_OBJECTIVE_EVENT.SEALS_REMOVED) {
    const count = Math.min(state.progress.remaining, eventAmount(event));
    state.progress.removed += count;
    state.progress.remaining -= count;
  } else if (event.type === COMBAT_OBJECTIVE_EVENT.SEALS_CLEARED) {
    state.progress.removed += state.progress.remaining;
    state.progress.remaining = 0;
  }
  if (state.progress.applied >= state.target.minimumSeals && state.progress.remaining === 0) {
    setStatus(state, "completed");
  }
}

function advanceTurnObjective(state, event) {
  if (event.type !== COMBAT_OBJECTIVE_EVENT.BATTLE_WON) return;
  const rawTurn = event.turn ?? event.turns;
  state.progress.won = true;
  state.progress.victoryTurn = Number.isFinite(Number(rawTurn)) ? positiveInteger(rawTurn) : null;
  if (state.progress.victoryTurn != null && state.progress.victoryTurn <= state.target.turnLimit) {
    setStatus(state, "completed");
  }
}

/**
 * Selects and initializes one deterministic objective from a run seed and battle coordinates.
 * The returned state contains only JSON-compatible values and can be saved directly.
 */
export function selectCombatObjective(input = {}) {
  const { seed, coordinates } = normalizeSelectionInput(input);
  const selectionKey = `${seed}|${coordinates.act}|${coordinates.routeIndex}|${coordinates.battleIndex}`;
  const rng = createSeededRng(selectionKey);
  const type = COMBAT_OBJECTIVE_TYPES[randomInt(rng, COMBAT_OBJECTIVE_TYPES.length)];
  const definition = COMBAT_OBJECTIVE_DEFINITIONS[type];
  const target = clonePlain(definition.target);
  if (type === COMBAT_OBJECTIVE_TYPE.ELEMENT_PROCS) {
    target.element = COMBAT_OBJECTIVE_ELEMENTS[randomInt(rng, COMBAT_OBJECTIVE_ELEMENTS.length)];
  }
  return {
    version: COMBAT_OBJECTIVE_VERSION,
    id: `combat-objective-${hashText(`${selectionKey}|${type}`).toString(36)}`,
    seed,
    coordinates,
    type,
    title: definition.title,
    description: definition.description,
    target,
    reward: clonePlain(definition.reward),
    progress: initialProgress(type),
    status: "active",
    eventCount: 0
  };
}

/**
 * Applies one combat-domain event without mutating the supplied state.
 */
export function applyCombatObjectiveEvent(rawState, event = {}) {
  assertObjectiveState(rawState);
  const state = clonePlain(rawState);
  if (state.status !== "active" || !event || typeof event.type !== "string") return state;
  state.eventCount = nonNegativeInteger(state.eventCount, 0) + 1;

  switch (state.type) {
    case COMBAT_OBJECTIVE_TYPE.SHIELD_VICTORY:
      advanceShieldObjective(state, event);
      break;
    case COMBAT_OBJECTIVE_TYPE.ELEMENT_PROCS:
      advanceElementObjective(state, event);
      break;
    case COMBAT_OBJECTIVE_TYPE.IDIOM_ACTIVATIONS:
      advanceIdiomObjective(state, event);
      break;
    case COMBAT_OBJECTIVE_TYPE.CLEAR_SEALS:
      advanceSealObjective(state, event);
      break;
    case COMBAT_OBJECTIVE_TYPE.TURN_LIMIT_VICTORY:
      advanceTurnObjective(state, event);
      break;
  }

  if (state.status === "active" && (event.type === COMBAT_OBJECTIVE_EVENT.BATTLE_WON
    || event.type === COMBAT_OBJECTIVE_EVENT.BATTLE_LOST)) {
    setStatus(state, "failed");
  }
  return state;
}

export function isCombatObjectiveComplete(state) {
  return Boolean(state && state.status === "completed");
}

/**
 * Resolves the extra reward after completion. Fragment rewards always target the
 * jaryeong that appeared in this encounter and are unresolved without its id.
 */
export function resolveCombatObjectiveReward(state, context = {}) {
  if (!isCombatObjectiveComplete(state)) return null;
  const reward = clonePlain(state.reward);
  if (reward.kind !== "jaryeong-fragments") return reward;
  const jaryeongId = context.encounteredJaryeongId ?? context.jaryeongId;
  if (typeof jaryeongId !== "string" || !jaryeongId.trim()) return null;
  return { ...reward, jaryeongId: jaryeongId.trim() };
}
