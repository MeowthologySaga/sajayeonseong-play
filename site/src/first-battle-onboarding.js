import { createSeededRng, shuffleWithRng } from "./run-engine.js";

export const FIRST_BATTLE_ONBOARDING_VERSION = 1;
export const FIRST_BATTLE_ONBOARDING_SECONDS = 30;
export const LEADER_SKILL_READY_CHARGE = 5;

export const FIRST_BATTLE_ONBOARDING_EVENT = Object.freeze({
  INTENT_READ: "intent-read",
  RESPONSE_CHOSEN: "response-chosen",
  ENEMY_ACTION_RESOLVED: "enemy-action-resolved",
  BATTLE_ENDED: "battle-ended"
});

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
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

function normalizePartyIds(input) {
  const source = Array.isArray(input) ? input : [];
  return [...new Set(source.map((id) => String(id || "").trim()).filter(Boolean))];
}

function normalizeCharacters(input) {
  const source = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? Array.from(input)
      : [];
  return source.map((entry) => {
    if (typeof entry === "string") return entry;
    return typeof entry?.char === "string" ? entry.char : "";
  }).filter(Boolean);
}

function normalizeFixedIdioms(source) {
  const requested = source.fixedIdioms ?? source.idioms ?? (source.fixedIdiom ? [source.fixedIdiom] : []);
  return Array.isArray(requested) ? requested.filter((idiom) => idiom && typeof idiom === "object") : [];
}

function idiomCharacters(idiom) {
  return normalizeCharacters(idiom?.chars ?? idiom?.characters ?? idiom?.sourceHanja);
}

function missingCharacters(requiredCharacters, availableCharacters) {
  const availableCounts = availableCharacters.reduce((counts, char) => {
    counts[char] = (counts[char] || 0) + 1;
    return counts;
  }, {});
  return requiredCharacters.filter((char) => {
    if ((availableCounts[char] || 0) <= 0) return true;
    availableCounts[char] -= 1;
    return false;
  });
}

function normalizeIntent(intent = {}) {
  const effectType = typeof intent.effect?.type === "string"
    ? intent.effect.type
    : typeof intent.effectType === "string"
      ? intent.effectType
      : null;
  return {
    id: String(intent.id || "first-intent"),
    name: String(intent.name || "적의 다음 행동"),
    kind: String(intent.kind || "attack"),
    threat: String(intent.threat || "medium"),
    effectType,
    effectText: String(intent.effectText || "행동 예고"),
    responseHint: String(intent.responseHint || "")
  };
}

function defaultResponseHint(intent) {
  if (intent.responseHint) return intent.responseHint;
  switch (intent.effectType) {
    case "lockTiles": return "봉인 전에 이동 경로를 넓게 확보하세요.";
    case "pierce": return "보호막을 우회하므로 회복 수단을 준비하세요.";
    case "reduceMoveTime": return "짧고 확실한 이동 경로를 먼저 정하세요.";
    case "weaken": return "정화나 회복을 사용할 타이밍을 남겨 두세요.";
    case "gainEnemyShield": return "적 보호막이 쌓이기 전에 공격을 집중하세요.";
    case "healEnemy": return "적이 회복하기 전에 화력과 성어를 집중하세요.";
    default: return "즉시 준비된 리더 기술과 성어 완성을 대응 수단으로 활용하세요.";
  }
}

function buildHintSteps(intent) {
  return [
    {
      id: "read-intent",
      trigger: FIRST_BATTLE_ONBOARDING_EVENT.INTENT_READ,
      stage: "forecast",
      text: `다음 의도: ${intent.name} · ${intent.effectText}`
    },
    {
      id: "choose-response",
      trigger: FIRST_BATTLE_ONBOARDING_EVENT.RESPONSE_CHOSEN,
      stage: "response",
      text: `권장 대응: ${defaultResponseHint(intent)}`
    },
    {
      id: "check-result",
      trigger: FIRST_BATTLE_ONBOARDING_EVENT.ENEMY_ACTION_RESOLVED,
      stage: "result",
      text: "적 행동 뒤 체력·보호막·상태 변화를 확인하세요."
    }
  ];
}

function eligibilityReason(context, fixedIdioms, alreadyGranted) {
  if (!context.isNewRun) return "not-new-run";
  if (context.isResume) return "resumed-run";
  if (alreadyGranted) return "already-granted";
  if (context.completedRuns > 0) return "not-first-run";
  if (context.battleIndex !== 0) return "not-first-battle";
  if (context.isBoss || context.encounterKind === "boss") return "boss-battle";
  if (!context.partyIds.length || !context.leaderId || !context.partyIds.includes(context.leaderId)) return "leader-missing";
  if (fixedIdioms.length !== 1 || !idiomCharacters(fixedIdioms[0]).length) return "fixed-idiom-required";
  return null;
}

function buildSupplyPlan({ selectionKey, idiom, availableCharacters }) {
  const requiredCharacters = idiomCharacters(idiom);
  const missing = missingCharacters(requiredCharacters, availableCharacters);
  const ordered = shuffleWithRng(missing, createSeededRng(`${selectionKey}|character-supply`));
  const firstTurnCount = Math.ceil(ordered.length / 2);
  return {
    kind: "fixed-idiom-character-supply",
    idiomId: String(idiom.id || idiom.sourceHanja || requiredCharacters.join("")),
    requiredCharacters,
    availableCharacters,
    missingCharacters: [...ordered],
    deadlineTurn: 2,
    deliveries: [
      { turn: 1, characters: ordered.slice(0, firstTurnCount) },
      { turn: 2, characters: ordered.slice(firstTurnCount) }
    ]
  };
}

function assertOnboardingState(state) {
  if (!state || typeof state !== "object" || state.version !== FIRST_BATTLE_ONBOARDING_VERSION) {
    throw new TypeError("Invalid first-battle onboarding state");
  }
}

/**
 * Builds the deterministic, UI-agnostic plan for the first battle of a player's
 * first new run. Ineligible contexts still return a saveable state with a reason.
 */
export function createFirstBattleOnboarding(input = {}) {
  const source = input && typeof input === "object" ? input : { seed: input };
  const seed = String(source.seed ?? source.runSeed ?? "sajayeonseong");
  const partyIds = normalizePartyIds(source.partyIds ?? source.party);
  const leaderId = String(source.leaderId ?? partyIds[0] ?? "");
  const fixedIdioms = normalizeFixedIdioms(source);
  const fixedIdiom = fixedIdioms[0] || null;
  const availableCharacters = normalizeCharacters(source.availableCharacters ?? source.queueCharacters);
  const intent = normalizeIntent(source.enemyIntent);
  const context = {
    isNewRun: source.isNewRun === true,
    isResume: source.isResume === true || source.resumed === true,
    completedRuns: nonNegativeInteger(source.completedRuns, 0),
    battleIndex: nonNegativeInteger(source.battleIndex ?? source.coordinates?.battleIndex, 0),
    encounterKind: String(source.encounterKind ?? source.battleKind ?? "battle"),
    isBoss: source.isBoss === true,
    partyIds,
    leaderId,
    fixedIdiomId: fixedIdiom ? String(fixedIdiom.id || fixedIdiom.sourceHanja || idiomCharacters(fixedIdiom).join("")) : null
  };
  const alreadyGranted = source.alreadyGranted === true || source.onboardingGranted === true;
  const reason = eligibilityReason(context, fixedIdioms, alreadyGranted);
  const selectionKey = [
    seed,
    context.completedRuns,
    context.battleIndex,
    context.encounterKind,
    context.partyIds.join(","),
    context.leaderId,
    context.fixedIdiomId || "",
    fixedIdiom ? idiomCharacters(fixedIdiom).join("") : "",
    availableCharacters.join(""),
    intent.id
  ].join("|");
  const eligible = reason === null;
  const plan = eligible ? {
    leaderCharge: {
      kind: "leader-skill-charge",
      jaryeongId: context.leaderId,
      charge: LEADER_SKILL_READY_CHARGE,
      uses: 1
    },
    characterSupply: buildSupplyPlan({ selectionKey, idiom: fixedIdiom, availableCharacters }),
    enemyIntent: intent,
    hints: buildHintSteps(intent)
  } : null;
  return {
    version: FIRST_BATTLE_ONBOARDING_VERSION,
    id: `first-battle-onboarding-${hashText(selectionKey).toString(36)}`,
    seed,
    durationSeconds: FIRST_BATTLE_ONBOARDING_SECONDS,
    context,
    eligible,
    ineligibleReason: reason,
    plan,
    grantIssued: false,
    grantIssueCount: 0,
    hintProgress: { stepIndex: 0, completed: false },
    finished: false
  };
}

/**
 * Issues the immediate charge and two-turn character supply plan at most once.
 */
export function issueFirstBattleOnboardingGrants(rawState) {
  assertOnboardingState(rawState);
  const state = clonePlain(rawState);
  if (!state.eligible || state.grantIssued || state.finished || !state.plan) {
    return { state, grants: null };
  }
  state.grantIssued = true;
  state.grantIssueCount = 1;
  return {
    state,
    grants: {
      leaderCharge: clonePlain(state.plan.leaderCharge),
      characterSupply: clonePlain(state.plan.characterSupply)
    }
  };
}

/**
 * Advances the three inline hint stages in order. Out-of-order events do not skip
 * a stage, and a finished battle permanently closes the onboarding state.
 */
export function advanceFirstBattleOnboarding(rawState, event = {}) {
  assertOnboardingState(rawState);
  const state = clonePlain(rawState);
  if (!state.eligible || state.finished || !event || typeof event.type !== "string") return state;
  if (event.type === FIRST_BATTLE_ONBOARDING_EVENT.BATTLE_ENDED) {
    state.finished = true;
    return state;
  }
  if (!state.grantIssued || state.hintProgress.completed) return state;
  const currentStep = state.plan?.hints?.[state.hintProgress.stepIndex];
  if (!currentStep || currentStep.trigger !== event.type) return state;
  state.hintProgress.stepIndex += 1;
  state.hintProgress.completed = state.hintProgress.stepIndex >= state.plan.hints.length;
  return state;
}

export function getCurrentFirstBattleHint(state) {
  if (!state?.eligible || state.finished || state.hintProgress?.completed) return null;
  return clonePlain(state.plan?.hints?.[state.hintProgress?.stepIndex] || null);
}
