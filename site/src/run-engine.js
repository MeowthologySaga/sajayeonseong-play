import { calculateElementProcChance } from "./element-procs.js";

export const RUN_LIMITS = Object.freeze({
  initialIdiomCount: 1,
  baseQueueMax: 14,
  maxQueueMax: 18,
  maxDelay: 2,
  maxDamageMultiplier: 3,
  maxShieldRatio: 1.5,
  maxEffectDepth: 1,
  maxComboChain: 20,
  minRunPool: 90,
  maxRunPool: 140,
  idiomBookMax: 8,
  activeIdiomMax: 4
});

function hashSeed(seed) {
  let hash = 2166136261;
  const text = String(seed || "sajayeonseong");
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRng(seed = `${Date.now()}`) {
  return { seed: String(seed), state: hashSeed(seed), calls: 0 };
}

export function randomFrom(rng) {
  if (!rng) return Math.random();
  rng.state = (rng.state + 0x6D2B79F5) >>> 0;
  let value = rng.state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  rng.calls = (rng.calls || 0) + 1;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(rng, max) {
  return Math.floor(randomFrom(rng) * Math.max(1, max));
}

export function pickWithRng(items, rng) {
  if (!items?.length) return null;
  return items[randomInt(rng, items.length)];
}

export function shuffleWithRng(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = randomInt(rng, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function chooseRotatingRecipes({ items = [], fixedIds = [], usedIds = [], previousIds = [], count = 3, rng } = {}) {
  const fixed = new Set(fixedIds);
  const previous = new Set(previousIds);
  const pool = items.filter((item) => item?.id && !fixed.has(item.id));
  if (!pool.length) return { choices: [], usedIds: [] };
  const wanted = Math.min(Math.max(0, count), pool.length);
  let used = new Set(usedIds);
  let available = pool.filter((item) => !used.has(item.id));
  if (available.length < wanted) {
    used = new Set();
    available = [...pool];
  }
  const nonRepeating = available.filter((item) => !previous.has(item.id));
  if (nonRepeating.length >= wanted) available = nonRepeating;
  const choices = shuffleWithRng(available, rng).slice(0, wanted);
  choices.forEach((item) => used.add(item.id));
  return { choices, usedIds: [...used] };
}

export function buildCharacterVolumes(characters = []) {
  const unique = [...new Map(characters.filter((entry) => entry?.hanja).map((entry) => [entry.hanja, entry])).values()];
  const cheonjamun = unique
    .filter((entry) => entry.inCheonjamun)
    .sort((a, b) => (a.firstSequence || Number.MAX_SAFE_INTEGER) - (b.firstSequence || Number.MAX_SAFE_INTEGER));
  const cheonSet = new Set(cheonjamun.map((entry) => entry.hanja));
  const extras = unique.filter((entry) => !cheonSet.has(entry.hanja));
  const volumes = [];
  for (let index = 0; index < 8; index++) {
    const rows = cheonjamun.slice(index * 125, index * 125 + 125);
    volumes.push({
      id: `cheon-${index + 1}`,
      index,
      label: `천자문 ${index + 1}권`,
      subtitle: `${index * 125 + 1}~${index * 125 + rows.length}자`,
      rows,
      chars: rows.map((entry) => entry.hanja)
    });
  }
  [extras.slice(0, 68), extras.slice(68)].forEach((rows, offset) => {
    volumes.push({
      id: `radical-${offset + 1}`,
      index: 8 + offset,
      label: `확장 부수 ${offset + 1}권`,
      subtitle: offset ? "후반 확장 67자" : "기초 확장 68자",
      rows,
      chars: rows.map((entry) => entry.hanja)
    });
  });
  return volumes;
}

export function buildRunCharacterPool({ volume, idioms = [], jaryeongs = [], fallbackCharacters = [], rng, targetSize = 125 }) {
  const required = new Set([
    ...idioms.flatMap((idiom) => idiom.chars || [...(idiom.hanja || "")]),
    ...jaryeongs.map((entry) => entry?.hanja).filter(Boolean)
  ]);
  const volumeChars = shuffleWithRng(volume?.chars || [], rng).filter((char) => !required.has(char));
  const safeTarget = Math.max(RUN_LIMITS.minRunPool, Math.min(RUN_LIMITS.maxRunPool, targetSize));
  const baseCount = Math.max(0, Math.min(volumeChars.length, safeTarget - required.size));
  const pool = [...required, ...volumeChars.slice(0, baseCount)];
  for (const char of volumeChars.slice(baseCount)) {
    if (pool.length >= RUN_LIMITS.minRunPool) break;
    pool.push(char);
  }
  if (pool.length < RUN_LIMITS.minRunPool) {
    const used = new Set(pool);
    const supplements = [...new Set(fallbackCharacters
      .map((entry) => typeof entry === "string" ? entry : entry?.hanja)
      .filter((char) => char && !used.has(char)))];
    for (const char of shuffleWithRng(supplements, rng)) {
      if (pool.length >= RUN_LIMITS.minRunPool) break;
      pool.push(char);
      used.add(char);
    }
  }
  return [...new Set(pool)].slice(0, RUN_LIMITS.maxRunPool);
}

const ROUTE_TEMPLATE = Object.freeze([
  [
    ["battle", "battle"], ["event", "rest"], ["battle", "elite"], ["rest", "shop"], ["boss"]
  ],
  [
    ["battle", "battle"], ["event", "shop"], ["battle", "battle"], ["elite", "rest"], ["boss"]
  ],
  [
    ["battle", "battle"], ["event", "rest"], ["battle", "battle"], ["elite", "rest"], ["boss"]
  ]
]);

const NODE_META = Object.freeze({
  battle: { label: "야생 자령", icon: "⚔", risk: "보통", description: "자령을 진정시키고 보상을 고릅니다." },
  elite: { label: "정예 자령", icon: "✦", risk: "높음", description: "강한 패턴을 이기면 희귀 보상이 나옵니다." },
  boss: { label: "장 수호자", icon: "印", risk: "우두머리", description: "이번 장의 빌드를 시험합니다." },
  event: { label: "기이한 사건", icon: "?", risk: "선택", description: "대가가 있는 짧은 거래를 만납니다." },
  rest: { label: "먹빛 쉼터", icon: "休", risk: "안전", description: "회복·성어 강화·교체 중 하나를 고릅니다." },
  shop: { label: "부적 상점", icon: "市", risk: "거래", description: "먹 조각으로 유물과 성어를 구입합니다." }
});

export function createRunRoute(rng, content) {
  const encounterUse = new Set();
  const eventUse = new Set();
  const route = [];
  ROUTE_TEMPLATE.forEach((actTemplate, actIndex) => {
    actTemplate.forEach((types, depthIndex) => {
      const choices = types.map((type, choiceIndex) => {
        const meta = NODE_META[type];
        const pool = type === "event"
          ? content.events.filter((entry) => !eventUse.has(entry.id))
          : content.encounters.filter((entry) => entry.act === actIndex + 1 && entry.kind === type && !encounterUse.has(entry.id));
        const selected = pickWithRng(pool, rng) || pickWithRng(type === "event" ? content.events : content.encounters.filter((entry) => entry.kind === type), rng);
        if (type === "event" && selected) eventUse.add(selected.id);
        if (["battle", "elite", "boss"].includes(type) && selected) encounterUse.add(selected.id);
        return {
          id: `a${actIndex + 1}-d${depthIndex + 1}-c${choiceIndex + 1}-${type}`,
          act: actIndex + 1,
          depth: depthIndex + 1,
          type,
          label: selected?.name || meta.label,
          icon: meta.icon,
          risk: selected?.risk || meta.risk,
          description: selected?.description || meta.description,
          contentId: selected?.id || null,
          completed: false
        };
      });
      route.push({ act: actIndex + 1, depth: depthIndex + 1, choices });
    });
  });
  return route;
}

export const RUN_PACING = Object.freeze({
  setupSeconds: 60,
  transitionSeconds: 10,
  nodeSeconds: Object.freeze({
    battle: [45, 75],
    elite: [75, 110],
    boss: [100, 150],
    event: [20, 45],
    rest: [20, 45],
    shop: [20, 45]
  })
});

export function estimateRunSeconds(route, rng, pacing = RUN_PACING) {
  const selectedTypes = [];
  let seconds = pacing.setupSeconds;
  for (const tier of route || []) {
    const node = pickWithRng(tier.choices || [], rng);
    const type = node?.type || "event";
    const [minimum, maximum] = pacing.nodeSeconds[type] || pacing.nodeSeconds.event;
    seconds += minimum + randomFrom(rng) * (maximum - minimum) + pacing.transitionSeconds;
    selectedTypes.push(type);
  }
  return {
    seconds,
    minutes: seconds / 60,
    combats: selectedTypes.filter((type) => ["battle", "elite", "boss"].includes(type)).length,
    selectedTypes
  };
}

export function simulateRunPacing({ runs = 10000, seed = "pacing-v1", content }) {
  const rng = createSeededRng(seed);
  const samples = [];
  const combats = [];
  for (let index = 0; index < runs; index++) {
    const route = createRunRoute(rng, content);
    const estimate = estimateRunSeconds(route, rng);
    samples.push(estimate.minutes);
    combats.push(estimate.combats);
  }
  samples.sort((a, b) => a - b);
  combats.sort((a, b) => a - b);
  const percentile = (values, ratio) => values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * ratio)))] || 0;
  const result = {
    runs,
    minimumMinutes: samples[0] || 0,
    p10Minutes: percentile(samples, .1),
    medianMinutes: percentile(samples, .5),
    p90Minutes: percentile(samples, .9),
    maximumMinutes: samples.at(-1) || 0,
    minimumCombats: combats[0] || 0,
    maximumCombats: combats.at(-1) || 0
  };
  return {
    ...result,
    pass: result.medianMinutes >= 18 && result.medianMinutes <= 24
      && result.p10Minutes >= 17 && result.p90Minutes <= 25
      && result.minimumCombats >= 9 && result.maximumCombats <= 11
  };
}

export function capCombatState(state) {
  const maxHp = Math.max(1, state.maxHp || 100);
  state.delay = Math.min(RUN_LIMITS.maxDelay, Math.max(0, state.delay || 0));
  state.damageMultiplier = Math.min(RUN_LIMITS.maxDamageMultiplier, Math.max(0, state.damageMultiplier || 1));
  state.shield = Math.min(Math.round(maxHp * RUN_LIMITS.maxShieldRatio), Math.max(0, state.shield || 0));
  state.hp = Math.min(maxHp, Math.max(0, state.hp || 0));
  return state;
}

export function applyEffectOps(target, ops = [], context = {}) {
  const result = { ...target, logs: [...(target.logs || [])] };
  for (const op of ops) {
    switch (op.type) {
      case "dealDamage": result.enemyHp = Math.max(0, (result.enemyHp || 0) - (op.amount || 0)); break;
      case "gainShield": result.shield = (result.shield || 0) + (op.amount || 0); break;
      case "heal": result.hp = (result.hp || 0) + (op.amount || 0); break;
      case "delay": result.delay = (result.delay || 0) + (op.turns || 0); break;
      case "chargeParty": result.partyCharge = (result.partyCharge || 0) + (op.amount || 0); break;
      case "returnQueueChar": result.returnedChars = (result.returnedChars || 0) + (op.count || 1); break;
      case "draw": result.draw = (result.draw || 0) + (op.count || 1); break;
      case "gainInk": result.ink = (result.ink || 0) + (op.amount || 0); break;
      default: result.logs.push(`unknown:${op.type}`);
    }
  }
  return capCombatState({ ...result, maxHp: context.maxHp || result.maxHp || 100 });
}

export function validateGameCatalog({ characters = [], idioms = [], jaryeongs = [], relics = [], events = [], encounters = [], volumes = [] }) {
  const errors = [];
  const warnings = [];
  const uniqueCheck = (rows, key, label) => {
    const values = rows.map((entry) => entry?.[key]).filter(Boolean);
    if (new Set(values).size !== values.length) errors.push(`${label} ${key} 중복`);
  };
  uniqueCheck(characters, "hanja", "한자");
  uniqueCheck(idioms, "id", "성어");
  uniqueCheck(jaryeongs, "id", "자령");
  uniqueCheck(relics, "id", "유물");
  uniqueCheck(events, "id", "이벤트");
  uniqueCheck(encounters, "id", "조우");
  if (characters.length !== 1135) errors.push(`한자 ${characters.length}/1135`);
  if (idioms.length !== 75) errors.push(`성어 ${idioms.length}/75`);
  if (jaryeongs.length !== 30) errors.push(`자령 ${jaryeongs.length}/30`);
  if (relics.length < 18) errors.push(`유물 ${relics.length}/18`);
  if (events.length < 12) errors.push(`이벤트 ${events.length}/12`);
  if (encounters.filter((entry) => entry.kind === "battle").length < 9) errors.push("일반 조우 9종 미만");
  if (encounters.filter((entry) => entry.kind === "elite").length < 3) errors.push("정예 조우 3종 미만");
  if (encounters.filter((entry) => entry.kind === "boss").length < 3) errors.push("보스 조우 3종 미만");
  if (volumes.length !== 10 || volumes.flatMap((entry) => entry.chars).length !== 1135) errors.push("문자권 분할 오류");
  const charSet = new Set(characters.map((entry) => entry.hanja));
  idioms.forEach((idiom) => (idiom.chars || []).forEach((char) => { if (!charSet.has(char)) errors.push(`${idiom.hanja || idiom.id}의 ${char} 누락`); }));
  characters.forEach((entry) => { if (!entry.hunEum) warnings.push(`${entry.hanja} 훈음 미검수`); });
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

const BOT_PROFILES = Object.freeze({
  random: { damage: 1, defense: 1, control: 1, economy: 1 },
  damage: { damage: 1.07, defense: .98, control: .97, economy: .97 },
  turtle: { damage: .94, defense: 1.1, control: 1, economy: .96 },
  control: { damage: .96, defense: 1, control: 1.14, economy: .95 },
  idiom: { damage: 1.03, defense: .97, control: .96, economy: 1.16 }
});

export function simulateBalance({ runs = 10000, seed = "balance-v1", content }) {
  const rng = createSeededRng(seed);
  const profiles = Object.keys(BOT_PROFILES);
  const encounterById = new Map((content.encounters || []).map((entry) => [entry.id, entry]));
  const results = Object.fromEntries(profiles.map((profile) => [profile, { runs: 0, wins: 0, turns: 0 }]));
  let infiniteLoops = 0;
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const profileId = profiles[runIndex % profiles.length];
    const profile = BOT_PROFILES[profileId];
    const waterBuild = profileId === "control"
      ? { partyMembers: 2, partyLevelSum: 4, leaderMatches: true, affinityStacks: 1, focusStacks: 1 }
      : { partyMembers: 1, partyLevelSum: 1, leaderMatches: false };
    const waterProcChance = calculateElementProcChance("water", waterBuild).chance;
    const maxHp = 118;
    let hp = maxHp;
    let turns = 0;
    let won = true;
    // 확장된 전체 카탈로그를 한 런에서 전부 싸우게 하지 않고,
    // 실제 15노드 경로에서 고른 9~11개 전투만 시뮬레이션한다.
    const route = createRunRoute(rng, { encounters: content.encounters || [], events: content.events || [] });
    const encounters = route
      .map((tier) => pickWithRng(tier.choices || [], rng))
      .filter((node) => ["battle", "elite", "boss"].includes(node?.type))
      .map((node) => encounterById.get(node.contentId))
      .filter(Boolean);
    for (const encounter of encounters) {
      let enemyHp = encounter.maxHp;
      let guard = 0;
      while (enemyHp > 0 && hp > 0 && guard++ < 40) {
        const boardLuck = .78 + randomFrom(rng) * .5;
        const damage = (42 + randomFrom(rng) * 26) * profile.damage * (1 + profile.economy * .12) * boardLuck;
        enemyHp -= damage;
        if (enemyHp > 0) {
          // All builds can earn guaranteed control from idioms and charged
          // Jaryeong skills. Water-match procs add a smaller, build-sensitive
          // opportunity on top instead of replacing those shared tools.
          const actionDelayed = randomFrom(rng) < Math.min(.12, .07 + waterProcChance * .05 * profile.control);
          const prevented = Math.min(.72, .2 * profile.defense + .16 * profile.control);
          if (!actionDelayed) hp -= Math.max(1, encounter.damage * (1 - prevented) * (.62 + randomFrom(rng) * .24));
          hp = Math.min(maxHp, hp + 2.3 * profile.defense + .6 * profile.economy);
        }
        turns++;
      }
      if (guard >= 40) infiniteLoops++;
      if (hp <= 0) { won = false; break; }
      hp = Math.min(maxHp, hp + 13 + profile.defense * 4.5);
    }
    const bucket = results[profileId];
    bucket.runs++;
    bucket.wins += won ? 1 : 0;
    bucket.turns += turns;
  }
  const summary = Object.fromEntries(Object.entries(results).map(([id, value]) => [id, {
    runs: value.runs,
    winRate: value.runs ? value.wins / value.runs : 0,
    averageTurns: value.runs ? value.turns / value.runs : 0
  }]));
  const rates = Object.values(summary).map((entry) => entry.winRate);
  const spread = Math.max(...rates) - Math.min(...rates);
  return {
    runs,
    infiniteLoops,
    spread,
    profiles: summary,
    pass: infiniteLoops === 0 && spread <= .2 && rates.every((rate) => rate >= .3 && rate <= .7)
  };
}
