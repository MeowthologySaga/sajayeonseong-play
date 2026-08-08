import { RUN_LIMITS } from "./run-engine.js";

export const RUN_SAVE_KEY = "sajayeonseong-run-v1";
export const RUN_SAVE_VERSION = 1;
export const RUN_SAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COMBAT_NODE_TYPES = new Set(["battle", "elite", "boss"]);

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function activeRunNode(run) {
  const tier = run?.route?.[run.routeIndex];
  if (!tier || !run.currentNodeId) return null;
  return tier.choices?.find((node) => node.id === run.currentNodeId) || null;
}

export function describeRunSaveStage(payload) {
  const run = payload?.run || {};
  const battle = payload?.battle || {};
  const node = activeRunNode(run);
  if (battle.gameOver && Number(battle.playerHp) <= 0 && !battle.reviveUsed) {
    return { id: "revive", label: "부활 판정 대기" };
  }
  if (run.pendingContractJaryeongId) return { id: "contract", label: "자령 계약 선택" };
  if (run.pendingReward) return { id: "reward", label: "전투 보상 선택" };
  if (!run.leaderJaryeongId) return { id: "leader", label: "리더 선택" };
  if ((run.idiomBookIds?.length || 0) < RUN_LIMITS.initialIdiomCount) return { id: "draft", label: "시작 성어 선택" };
  if (run.currentEncounterId) {
    return { id: "battle", label: `${node?.label || "전투"} · ${Math.max(1, Number(battle.turn) || 1)}턴` };
  }
  if (run.currentNodeId) return { id: "node", label: `${node?.label || "노드"} 선택 중` };
  return { id: "route", label: "다음 경로 선택" };
}

export function validateRunSave(payload, now = Date.now()) {
  const errors = [];
  if (!payload || typeof payload !== "object") return { ok: false, errors: ["저장 데이터 형식 오류"] };
  if (payload.version !== RUN_SAVE_VERSION) errors.push("저장 버전 불일치");
  if (!isFiniteNumber(payload.savedAt) || now - Number(payload.savedAt) > RUN_SAVE_MAX_AGE_MS || Number(payload.savedAt) > now + 60_000) errors.push("저장 시각 오류");
  if (!isFiniteNumber(payload.elapsedMs) || payload.elapsedMs < 0) errors.push("런 경과 시간 오류");
  const run = payload.run;
  if (!run || typeof run !== "object") errors.push("런 데이터 누락");
  else {
    if (!/^SAJA-[A-Z0-9-]+$/.test(run.seed || "")) errors.push("런 시드 오류");
    if (!run.rng || !isFiniteNumber(run.rng.state) || !isFiniteNumber(run.rng.calls) || run.rng.seed !== run.seed) errors.push("시드 난수 상태 오류");
    if (!Array.isArray(run.route) || run.route.length !== 15) errors.push("15노드 경로 오류");
    if (!Number.isInteger(run.routeIndex) || run.routeIndex < 0 || run.routeIndex > 15) errors.push("현재 노드 위치 오류");
    if (!Array.isArray(run.characterPool) || run.characterPool.length < 90 || run.characterPool.length > 140) errors.push("문자 풀 범위 오류");
    if (!Array.isArray(run.partyJaryeongIds) || run.partyJaryeongIds.length > 5) errors.push("자령 편성 오류");
    if (!Array.isArray(run.idiomBookIds) || run.idiomBookIds.length > 8) errors.push("성어첩 범위 오류");
    const node = activeRunNode(run);
    if (run.currentNodeId && !node) errors.push("현재 노드 참조 오류");
    if (run.currentEncounterId && (!node || !COMBAT_NODE_TYPES.has(node.type) || node.contentId !== run.currentEncounterId)) {
      errors.push("전투 조우 참조 오류");
    }
  }
  const battle = payload.battle;
  if (!battle || typeof battle !== "object") errors.push("전투 데이터 누락");
  else {
    if (!isFiniteNumber(battle.playerHp) || !isFiniteNumber(battle.enemyHp) || !isFiniteNumber(battle.turn)) errors.push("전투 수치 오류");
    if (!Array.isArray(battle.queue) || battle.queue.length > RUN_LIMITS.maxQueueMax) errors.push("문자 큐 범위 오류");
    if (battle.board?.length && (battle.board.length !== 5 || battle.board.some((row) => !Array.isArray(row) || row.length !== 6))) errors.push("보드 크기 오류");
    if (!Array.isArray(battle.lockedTiles) || !Array.isArray(battle.freshQueueIds) || !Array.isArray(battle.usedStageIdiomIds) || !Array.isArray(battle.usedRotatingIdiomIds)) errors.push("Set/Map 복원 데이터 오류");
    if (battle.combatObjective != null && (
      typeof battle.combatObjective !== "object"
      || Array.isArray(battle.combatObjective)
      || !Number.isInteger(battle.combatObjective.version)
      || typeof battle.combatObjective.type !== "string"
      || !["active", "completed", "failed"].includes(battle.combatObjective.status)
    )) errors.push("전투 목표 상태 오류");
    if (battle.rareEncounter != null && (
      typeof battle.rareEncounter !== "object"
      || Array.isArray(battle.rareEncounter)
      || !Number.isInteger(battle.rareEncounter.version)
      || typeof battle.rareEncounter.gimmick !== "string"
      || !["active", "defeated", "escaped"].includes(battle.rareEncounter.status)
      || !isFiniteNumber(battle.rareEncounter.escapeCountdown)
    )) errors.push("희귀 조우 상태 오류");
  }
  return { ok: errors.length === 0, errors };
}

export function encodeRunSave({ run, battle, savedAt = Date.now(), elapsedMs = 0 }) {
  const payload = {
    version: RUN_SAVE_VERSION,
    savedAt,
    elapsedMs: Math.max(0, Number(elapsedMs) || 0),
    run,
    battle
  };
  const validation = validateRunSave(payload, savedAt);
  if (!validation.ok) throw new Error(validation.errors.join(" / "));
  return JSON.stringify(payload);
}

export function decodeRunSave(raw, now = Date.now()) {
  if (!raw) return { ok: false, payload: null, errors: ["저장 데이터 없음"] };
  try {
    const payload = JSON.parse(raw);
    const validation = validateRunSave(payload, now);
    return { ...validation, payload: validation.ok ? payload : null };
  } catch {
    return { ok: false, payload: null, errors: ["저장 JSON 손상"] };
  }
}
