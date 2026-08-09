const BOSS_IDS = Object.freeze(["forest-boss", "crimson-boss", "moon-boss"]);

const BASIC_ACTION = Object.freeze({
  id: "basic-strike",
  name: "기본 공격",
  kind: "attack",
  effect: Object.freeze({ type: "damage", damageScale: 1 })
});

function freezeAction(action) {
  return Object.freeze({
    ...action,
    effect: Object.freeze({ ...action.effect }),
    schedule: Object.freeze({ ...action.schedule })
  });
}

function freezeBoss(definition) {
  return Object.freeze({
    ...definition,
    basicAction: freezeAction(definition.basicAction || BASIC_ACTION),
    actions: Object.freeze(definition.actions.map(freezeAction))
  });
}

/**
 * Boss-only pattern data. Normal and elite encounters intentionally have no
 * entry here, so tile sealing cannot leak into them through this API.
 *
 * Special actions occupy the enemy action for that turn. A one-turn warning is
 * returned on the previous turn while the boss still performs its basic attack.
 */
export const BOSS_PATTERN_CATALOG = Object.freeze({
  "forest-boss": freezeBoss({
    id: "forest-boss",
    name: "만생목 자령왕",
    element: "wood",
    concept: "살아 움직이는 덩굴과 재생하는 뿌리",
    basicAction: { ...BASIC_ACTION, id: "forest-root-strike", name: "뿌리 후려치기" },
    actions: [
      {
        id: "forest-life-barrier",
        name: "生木結界 · 생목결계",
        kind: "barrier",
        telegraph: "껍질이 벌어지며 두꺼운 생목 보호막이 자랍니다. 모든 속성 공격으로 파괴할 수 있습니다.",
        effect: { type: "gainEnemyShield", amount: 32 },
        schedule: { firstTurn: 3, interval: 7, telegraphTurns: 1 }
      },
      {
        id: "forest-vine-seal",
        name: "藤蔓封印 · 등만봉인",
        kind: "seal",
        telegraph: "바닥의 덩굴이 꿈틀거리며 퍼즐 칸을 향해 뻗습니다.",
        effect: { type: "lockTiles", count: 3, durationTurns: 3, visual: "vine" },
        schedule: { firstTurn: 7, interval: 7, telegraphTurns: 1 }
      },
      {
        id: "forest-root-recovery",
        name: "萬根回生 · 만근회생",
        kind: "recovery",
        telegraph: "땅속 뿌리가 빛나며 흩어진 생명력을 끌어모읍니다.",
        effect: { type: "healEnemyUnlessBurning", amount: 24 },
        schedule: { firstTurn: 5, interval: 7, telegraphTurns: 1 }
      }
    ]
  }),
  "crimson-boss": freezeBoss({
    id: "crimson-boss",
    name: "적월 화령왕",
    element: "fire",
    concept: "달아오른 용암 사슬과 폭발 직전의 화구",
    basicAction: { ...BASIC_ACTION, id: "crimson-cinder-strike", name: "적월 화탄" },
    actions: [
      {
        id: "crimson-core-barrier",
        name: "赤月護幕 · 적월호막",
        kind: "barrier",
        telegraph: "화구의 겉면이 굳으며 두꺼운 적월 보호막이 둘러집니다. 모든 속성 공격으로 파괴할 수 있습니다.",
        effect: { type: "gainEnemyShield", amount: 40 },
        schedule: { firstTurn: 3, interval: 7, telegraphTurns: 1 }
      },
      {
        id: "crimson-magma-seal",
        name: "熔岩鎖印 · 용암쇄인",
        kind: "seal",
        telegraph: "붉게 달아오른 사슬이 퍼즐판 둘레를 조여 옵니다.",
        effect: { type: "lockTiles", count: 4, durationTurns: 3, visual: "magma-chain" },
        schedule: { firstTurn: 7, interval: 7, telegraphTurns: 1 }
      },
      {
        id: "crimson-eruption",
        name: "火口爆裂 · 화구폭렬",
        kind: "attack",
        telegraph: "등의 화구가 부풀어 오르고 금이 간 틈으로 불빛이 샙니다.",
        effect: { type: "damageAndBurn", damageScale: 1.15, burn: 5 },
        schedule: { firstTurn: 5, interval: 7, telegraphTurns: 1 }
      },
      {
        id: "crimson-character-scatter",
        name: "焚字散華 · 문자산화",
        kind: "control",
        telegraph: "적월의 불씨가 문자 큐를 훑습니다. 다음 턴 임의의 문자 하나가 흩어집니다.",
        effect: { type: "removeQueueCharacters", count: 1 },
        schedule: { firstTurn: 6, interval: 7, telegraphTurns: 1 }
      }
    ]
  }),
  "moon-boss": freezeBoss({
    id: "moon-boss",
    name: "심해월 자령왕",
    element: "water",
    concept: "달의 인력으로 뒤집히는 바다와 휘감는 심해 해조",
    basicAction: { ...BASIC_ACTION, id: "moon-wave-strike", name: "월해 파동" },
    actions: [
      {
        id: "moon-tide-barrier",
        name: "深海護幕 · 심해호막",
        kind: "barrier",
        telegraph: "소용돌이가 둥근 수막을 만들며 심해 보호막이 형성됩니다. 모든 속성 공격으로 파괴할 수 있습니다.",
        effect: { type: "gainEnemyShield", amount: 48 },
        schedule: { firstTurn: 2, interval: 7, telegraphTurns: 1 }
      },
      {
        id: "moon-earthquake-tsunami",
        name: "地震海溢 · 지진해일",
        kind: "board",
        telegraph: "바닷바닥이 갈라지고 거대한 물결이 퍼즐판 뒤에서 솟구칩니다.",
        effect: { type: "resetBoard", clearTileSeals: true },
        schedule: { firstTurn: 4, interval: 7, telegraphTurns: 1 }
      },
      {
        id: "moon-seaweed-seal",
        name: "海藻縛印 · 해조박인",
        kind: "seal",
        telegraph: "검은 해조가 떠올라 퍼즐 칸 사이를 그물처럼 잇습니다.",
        effect: { type: "lockTiles", count: 4, durationTurns: 3, visual: "seaweed-net" },
        schedule: { firstTurn: 7, interval: 7, telegraphTurns: 1 }
      }
    ]
  })
});

function encounterIdOf(encounterOrId) {
  if (typeof encounterOrId === "string") return encounterOrId;
  if (!encounterOrId || typeof encounterOrId !== "object") return null;
  if (encounterOrId.kind !== "boss") return null;
  return encounterOrId.encounterId || encounterOrId.id || null;
}

function normalizeTurn(turn) {
  const number = Number(turn);
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 1;
}

function scheduledOnTurn(schedule, turn) {
  return turn >= schedule.firstTurn && (turn - schedule.firstTurn) % schedule.interval === 0;
}

function nextScheduledTurn(schedule, turn) {
  if (turn < schedule.firstTurn) return schedule.firstTurn;
  const cycles = Math.floor((turn - schedule.firstTurn) / schedule.interval) + 1;
  return schedule.firstTurn + cycles * schedule.interval;
}

export function getBossPatternDefinition(encounterOrId) {
  const id = encounterIdOf(encounterOrId);
  return id ? BOSS_PATTERN_CATALOG[id] || null : null;
}

/** Returns the deterministic enemy action, warnings, and cooldowns for a turn. */
export function getBossTurnPlan(encounterOrId, requestedTurn) {
  const boss = getBossPatternDefinition(encounterOrId);
  if (!boss) return null;
  const turn = normalizeTurn(requestedTurn);
  const special = boss.actions.find((action) => scheduledOnTurn(action.schedule, turn));
  const upcoming = boss.actions.find((action) => scheduledOnTurn(action.schedule, turn + action.schedule.telegraphTurns));
  const telegraphs = upcoming ? [{
    actionId: upcoming.id,
    name: upcoming.name,
    text: upcoming.telegraph,
    resolvesOnTurn: turn + upcoming.schedule.telegraphTurns
  }] : [];
  const action = special || boss.basicAction;
  return {
    bossId: boss.id,
    turn,
    action,
    telegraphs,
    cooldowns: Object.fromEntries(boss.actions.map((entry) => {
      const nextTurn = scheduledOnTurn(entry.schedule, turn)
        ? turn + entry.schedule.interval
        : nextScheduledTurn(entry.schedule, turn);
      return [entry.id, { nextTurn, turnsRemaining: nextTurn - turn }];
    }))
  };
}


/** Makes a three-player-turn tile-seal status from integration-selected tiles. */
export function createTileSealStatus(actionOrEffect, tileIds = []) {
  const effect = actionOrEffect?.effect || actionOrEffect;
  if (effect?.type !== "lockTiles") return null;
  const count = Math.max(1, Math.floor(Number(effect.count) || 1));
  return {
    tileIds: [...new Set(tileIds)].slice(0, count),
    remainingTurns: Math.max(1, Math.floor(Number(effect.durationTurns) || 1)),
    visual: effect.visual || "seal"
  };
}


/**
 * Applies 地震海溢 through an injected board factory. This keeps generation in
 * game.js while guaranteeing that the old board is not mutated or reused.
 */
export function resolveBossBoardEffect(board, actionOrEffect, createBoard) {
  const effect = actionOrEffect?.effect || actionOrEffect;
  if (effect?.type !== "resetBoard") return { board, reset: false, clearTileSeals: false };
  if (typeof createBoard !== "function") throw new TypeError("createBoard must be supplied for resetBoard effects");
  const nextBoard = createBoard();
  if (!Array.isArray(nextBoard) || nextBoard === board) throw new TypeError("createBoard must return a new board array");
  return { board: nextBoard, reset: true, clearTileSeals: effect.clearTileSeals === true };
}

export function validateBossPatternCatalog(encounters = []) {
  const errors = [];
  if (Object.keys(BOSS_PATTERN_CATALOG).length !== 3) errors.push("boss_count");
  for (const id of BOSS_IDS) {
    const boss = BOSS_PATTERN_CATALOG[id];
    if (!boss) { errors.push(`boss_missing:${id}`); continue; }
    const seals = boss.actions.filter((action) => action.effect.type === "lockTiles");
    if (seals.length !== 1) errors.push(`seal_count:${id}`);
    seals.forEach((action) => {
      if (action.schedule.interval < 7) errors.push(`seal_interval:${id}`);
      if (action.effect.durationTurns !== 3) errors.push(`seal_duration:${id}`);
      if (action.schedule.telegraphTurns < 1) errors.push(`seal_telegraph:${id}`);
    });
    for (let turn = 1; turn <= 84; turn += 1) {
      const scheduled = boss.actions.filter((action) => scheduledOnTurn(action.schedule, turn));
      if (scheduled.length > 1) errors.push(`action_collision:${id}:${turn}`);
    }
  }
  for (const encounter of encounters) {
    if (encounter?.kind !== "boss" && getBossPatternDefinition(encounter)) errors.push(`non_boss_pattern:${encounter.id}`);
    if (encounter?.kind === "boss" && !getBossPatternDefinition(encounter)) errors.push(`unknown_boss:${encounter.id}`);
  }
  return { ok: errors.length === 0, errors };
}
