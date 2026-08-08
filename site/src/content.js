const ELEMENT_CYCLE = ["wood", "fire", "earth", "metal", "water"];
const ELEMENT_LABELS = Object.freeze({ wood: "목", fire: "화", earth: "토", metal: "금", water: "수" });

export const RELIC_CATALOG = Object.freeze([
  { id: "artisan-brush", type: "relic", rarity: "common", tags: ["tempo"], name: "장인의 붓", glyph: "筆", desc: "이동시간 +0.5초", effects: [{ type: "moveSeconds", amount: .5 }] },
  { id: "jade-bookmark", type: "relic", rarity: "common", tags: ["queue"], name: "옥 책갈피", glyph: "冊", desc: "문자 큐 최대치 +2", effects: [{ type: "queueMax", amount: 2 }] },
  { id: "bronze-seal", type: "relic", rarity: "common", tags: ["queue"], name: "청동 봉인", glyph: "印", desc: "문자 수명 +1턴", effects: [{ type: "queueLife", amount: 1 }] },
  { id: "cloud-inkstone", type: "relic", rarity: "common", tags: ["defense"], name: "구름 벼루", glyph: "硯", desc: "전투 시작 보호막 8", effects: [{ type: "startShield", amount: 8 }] },
  { id: "red-thread", type: "relic", rarity: "common", tags: ["idiom"], name: "붉은 인연실", glyph: "緣", desc: "첫 성어 발동 시 자령 기운 +1", effects: [{ type: "firstIdiomCharge", amount: 1 }] },
  { id: "rain-charm", type: "relic", rarity: "common", tags: ["control", "water"], name: "빗물 부적", glyph: "雨", desc: "수 지연 발동률 +12%p", effects: [{ type: "elementProcChance", element: "water", amount: .12 }] },
  { id: "stone-tortoise", type: "relic", rarity: "uncommon", tags: ["defense", "earth"], name: "돌거북패", glyph: "龜", desc: "토 보호막 발동률 +10%p · 보호막 20 이상일 때 받는 피해 -15%", effects: [{ type: "elementProcChance", element: "earth", amount: .1 }, { type: "guardedDamageReduction", ratio: .15 }] },
  { id: "golden-needle", type: "relic", rarity: "uncommon", tags: ["damage", "metal"], name: "금침", glyph: "針", desc: "금 관통 발동률 +12%p · 발동 시 보호막 6 추가 파괴", effects: [{ type: "elementProcChance", element: "metal", amount: .12 }, { type: "metalPierce", amount: 6 }] },
  { id: "ember-jar", type: "relic", rarity: "uncommon", tags: ["damage", "fire"], name: "불씨 항아리", glyph: "炎", desc: "화상 발동률 +10%p · 화상이 끝날 때 피해 4 추가", effects: [{ type: "elementProcChance", element: "fire", amount: .1 }, { type: "burnEcho", amount: 4 }] },
  { id: "sprout-knot", type: "relic", rarity: "uncommon", tags: ["heal", "wood"], name: "새싹 매듭", glyph: "芽", desc: "목 회복 발동률 +10%p · 초과 회복 절반을 보호막으로 전환", effects: [{ type: "elementProcChance", element: "wood", amount: .1 }, { type: "overhealShield", ratio: .5 }] },
  { id: "echo-bell", type: "relic", rarity: "uncommon", tags: ["idiom", "chain"], name: "메아리 방울", glyph: "鈴", desc: "서로 다른 역할 성어를 연속 사용하면 피해 10", effects: [{ type: "roleChainDamage", amount: 10 }] },
  { id: "empty-slip", type: "relic", rarity: "uncommon", tags: ["queue"], name: "빈 목간", glyph: "簡", desc: "4콤보 이상이면 가장 오래된 문자 수명 초기화", effects: [{ type: "refreshOldest", combo: 4 }] },
  { id: "moon-mirror", type: "relic", rarity: "rare", tags: ["control", "defense"], name: "달거울", glyph: "月", desc: "보스의 강공격을 런당 한 번 40% 반사", effects: [{ type: "bossReflect", ratio: .4 }] },
  { id: "five-color-cord", type: "relic", rarity: "rare", tags: ["element"], name: "오색 매듭", glyph: "五", desc: "한 턴에 4속성 이상 지우면 전체 자령 +1", effects: [{ type: "rainbowCharge", amount: 1 }] },
  { id: "phoenix-paper", type: "relic", rarity: "rare", tags: ["survival"], name: "봉황지", glyph: "鳳", desc: "체력 30% 이하에서 성어 조건을 런당 한 번 보충", effects: [{ type: "emergencyIdiom", uses: 1 }] },
  { id: "ink-dragon-scale", type: "relic", rarity: "rare", tags: ["damage", "idiom"], name: "먹룡의 비늘", glyph: "龍", desc: "세 번째 성어마다 고정 피해 18", effects: [{ type: "thirdIdiomDamage", amount: 18 }] },
  { id: "scholar-lantern", type: "relic", rarity: "rare", tags: ["learning", "choice"], name: "학자의 등불", glyph: "學", desc: "보상에서 훈음과 시너지 후보를 한 장 더 미리 봄", effects: [{ type: "rewardPreview", amount: 1 }] },
  { id: "sealed-hourglass", type: "relic", rarity: "rare", tags: ["tempo", "control"], name: "봉인 모래시계", glyph: "時", desc: "7턴째에 적 행동을 1회 지연", effects: [{ type: "turnSevenDelay", turns: 1 }] }
]);

export const EVENT_CATALOG = Object.freeze([
  { id: "old-library", name: "낡은 서고", description: "먼지 속 목간이 대가를 요구합니다.", choices: [
    { id: "forget", label: "성어 하나를 봉인하고 희귀 유물 획득", minIdioms: 2, effects: [{ type: "removeIdiom", count: 1 }, { type: "gainRareRelic", count: 1 }] },
    { id: "blood", label: "체력 15를 내고 큐 최대치 +2", effects: [{ type: "loseHp", amount: 15 }, { type: "queueMax", amount: 2 }] },
    { id: "leave", label: "조용히 떠난다", effects: [] }
  ] },
  { id: "rain-shrine", name: "비 내리는 사당", description: "물소리가 다음 행동을 잠재웁니다.", choices: [
    { id: "wash", label: "체력 18 회복", effects: [{ type: "heal", amount: 18 }] },
    { id: "listen", label: "다음 전투 첫 적 행동 지연", effects: [{ type: "nextBattleDelay", turns: 1 }] }
  ] },
  { id: "red-market", name: "붉은 야시장", description: "불씨 상인이 수상한 부적을 펼칩니다.", choices: [
    { id: "buy", label: "먹 30을 내고 유물 획득", effects: [{ type: "spendInk", amount: 30 }, { type: "gainRelic", count: 1 }] },
    { id: "gamble", label: "체력 10을 내고 성어 강화", effects: [{ type: "loseHp", amount: 10 }, { type: "upgradeIdiom", count: 1 }] }
  ] },
  { id: "stone-oath", name: "돌의 맹세", description: "석령이 단단함을 시험합니다.", choices: [
    { id: "guard", label: "최대 체력 +3, 다음 전투 피해 -5%", effects: [{ type: "maxHp", amount: 3 }, { type: "nextBattleReduction", ratio: .05 }] },
    { id: "break", label: "석파 부적 1개 획득 · 다음 전투 시작 피해 24", effects: [{ type: "gainConsumable", id: "stone-break", amount: 1, damage: 24 }] }
  ] },
  { id: "wandering-scribe", name: "떠도는 서생", description: "한 글자의 뜻을 바꾸어 보라 말합니다.", choices: [
    { id: "learn", label: "새 성어 후보 3장 중 하나 획득", effects: [{ type: "draftIdiom", count: 1 }] },
    { id: "copy", label: "보유 성어 하나의 숙련도 상승", effects: [{ type: "masterIdiom", count: 1 }] }
  ] },
  { id: "moon-ferry", name: "달빛 나루", description: "건너편에는 빠른 길과 잃어버린 글자가 보입니다.", choices: [
    { id: "rush", label: "다음 전투 이동시간 +1초, 체력 -8", effects: [{ type: "nextMoveSeconds", amount: 1 }, { type: "loseHp", amount: 8 }] },
    { id: "search", label: "문자 수명 +1턴", effects: [{ type: "queueLife", amount: 1 }] }
  ] },
  { id: "five-gates", name: "오행의 문", description: "선택한 오행은 피해 +8%, 일반 매치 부가효과 발동률 +6%p를 얻습니다.", choices: ELEMENT_CYCLE.map((element) => ({ id: element, label: `${ELEMENT_LABELS[element]} 공명 · 피해 +8% · 부가효과 +6%p`, effects: [{ type: "elementAffinity", element, amount: 1 }] })) },
  { id: "broken-talisman", name: "찢어진 부적", description: "조각을 잇거나 힘으로 태울 수 있습니다.", choices: [
    { id: "mend", label: "부적 조각 2개 획득", effects: [{ type: "fragment", amount: 2 }] },
    { id: "burn", label: "다음 전투 시작 피해 24", effects: [{ type: "openingDamage", amount: 24 }] }
  ] },
  { id: "quiet-school", name: "고요한 서당", description: "잠시 복습하면 다음 글자가 선명해집니다.", choices: [
    { id: "study", label: "도감 숙련 4자, 체력 10 회복", effects: [{ type: "masterCharacters", count: 4 }, { type: "heal", amount: 10 }] },
    { id: "practice", label: "다음 성어의 피해·회복·보호막 +20%", effects: [{ type: "nextIdiomPower", ratio: .2 }] }
  ] },
  { id: "mirror-pond", name: "거울 연못", description: "현재 빌드의 약한 축이 수면에 비칩니다.", choices: [
    { id: "balance", label: "부족한 빌드 축 보상 획득", effects: [{ type: "balanceReward", count: 1 }] },
    { id: "focus", label: "가장 강한 축 강화, 최대 체력 -3", effects: [{ type: "focusBuild", amount: 1 }, { type: "maxHp", amount: -3 }] }
  ] },
  { id: "sealed-well", name: "봉인된 우물", description: "깊은 먹빛이 위험한 힘을 품고 있습니다.", choices: [
    { id: "draw", label: "희귀 유물 획득, 다음 정예 피해 +15%", effects: [{ type: "gainRareRelic", count: 1 }, { type: "eliteDanger", ratio: .15 }] },
    { id: "seal", label: "보호막 20", effects: [{ type: "shield", amount: 20 }] }
  ] },
  { id: "paper-cranes", name: "종이학 무리", description: "한 마리를 따라가면 길이 짧아집니다.", choices: [
    { id: "follow", label: "먹 18 획득, 체력 6 회복", effects: [{ type: "gainInk", amount: 18 }, { type: "heal", amount: 6 }] },
    { id: "release", label: "다음 보상 새로고침 +1", effects: [{ type: "reroll", amount: 1 }] }
  ] }
]);

const ENCOUNTER_ROWS = [
  ["forest-sprout",1,"battle","wood-mok","wild-growth",135,11,"물안개 숲의 목령"],
  ["forest-canopy",1,"battle","wood-tree","wild-canopy",150,12,"덩굴 그늘의 수령"],
  ["forest-ember",1,"battle","fire-light","wild-flash",145,13,"길 잃은 광령"],
  ["forest-bamboo",1,"battle","wood-bamboo","wild-bamboo",150,13,"죽엽 길잡이 죽령"],
  ["forest-warden",1,"elite","earth-stone","wild-stone-guard",225,16,"석문 수호령"],
  ["forest-orchid",1,"elite","wood-orchid","wild-orchid",245,17,"회향 난령"],
  ["forest-forest",1,"elite","wood-forest","wild-forest",235,16,"고목 숲등의 삼령"],
  ["forest-boss",1,"boss","wood-life","wild-regrowth",310,18,"만생목 자령왕"],
  ["crimson-flame",2,"battle","fire-hwa","wild-ember",185,15,"홍염의 화령"],
  ["crimson-sun",2,"battle","earth-mountain","wild-landslide",205,16,"적벽을 걷는 산령"],
  ["crimson-stone",2,"battle","earth-to","wild-earth-wall",220,15,"잿빛 토령"],
  ["crimson-lantern",2,"battle","fire-lantern","wild-lantern",215,17,"유등 동굴의 등령"],
  ["crimson-fox",2,"battle","fire-fox","wild-fox",225,18,"묵화 꼬리의 호령"],
  ["crimson-tortoise",2,"battle","earth-tortoise","wild-tortoise",235,16,"육각 성벽의 귀령"],
  ["crimson-valley",2,"battle","earth-valley","wild-valley",225,17,"붉은 협곡의 곡령"],
  ["crimson-blade",2,"elite","metal-sword","wild-sword",300,21,"봉인검 자령"],
  ["crimson-pottery",2,"elite","earth-pottery","wild-pottery",325,22,"금계 청자 도령"],
  ["crimson-phoenix",2,"elite","fire-phoenix","wild-phoenix",315,21,"재점화 봉령"],
  ["crimson-boss",2,"boss","fire-sun","boss-crimson-order",410,24,"적월 화령장"],
  ["moon-tide",3,"battle","water-sui","wild-tide",245,18,"달물결 수령"],
  ["moon-rain",3,"battle","water-rain","wild-rain",260,18,"별비 우령"],
  ["moon-gold",3,"battle","metal-gold","wild-pierce",275,20,"월광 금령"],
  ["moon-abyss",3,"battle","water-abyss","wild-abyss",290,21,"심연수의 연령"],
  ["moon-ice",3,"battle","water-ice","wild-ice",305,22,"빙맥을 헤엄치는 빙령"],
  ["moon-mist",3,"battle","water-mist","wild-mist",290,21,"무영 수로의 무령"],
  ["moon-jade",3,"elite","metal-jade","wild-reflect",360,24,"옥경 수호령"],
  ["moon-bell",3,"elite","metal-bell","wild-bell",395,25,"무음 누각의 종령"],
  ["moon-mirror",3,"elite","metal-mirror","wild-mirror",415,26,"역광 거울의 경령"],
  ["moon-chain",3,"elite","metal-chain","wild-chain",390,25,"봉쇄 사슬의 쇄령"],
  ["moon-boss",3,"boss","water-sea","boss-moon-trial",520,28,"심해월 자령왕"]
];

const WEAKNESS = { wood: ["water","fire"], fire: ["metal","earth"], earth: ["wood","water"], metal: ["fire","wood"], water: ["wood","water"] };

export const ENCOUNTER_CATALOG = Object.freeze(ENCOUNTER_ROWS.map(([id, act, kind, jaryeongId, behaviorId, maxHp, damage, name]) => {
  const element = jaryeongId.split("-")[0];
  const [weakElement, resistElement] = WEAKNESS[element] || ["water", "fire"];
  return { id, act, kind, jaryeongId, behaviorId, maxHp, damage, name, weakElement, resistElement, risk: kind === "boss" ? "우두머리" : kind === "elite" ? "높음" : "보통", description: `${act}장 ${kind === "boss" ? "수호자" : kind === "elite" ? "정예" : "야생"} 전투` };
}));

const CATEGORY_EFFECTS = Object.freeze({
  "가족·관계": { tags: ["defense", "idiom"], ops: [{ type: "gainShield", amount: 14 }, { type: "chargeParty", amount: 1 }] },
  "감정·관계": { tags: ["heal", "idiom"], ops: [{ type: "heal", amount: 14 }, { type: "gainShield", amount: 6 }] },
  "감정·심리": { tags: ["control"], ops: [{ type: "delay", turns: 1 }, { type: "dealDamage", amount: 10 }] },
  "경계·교훈": { tags: ["defense", "control"], ops: [{ type: "gainShield", amount: 12 }, { type: "dealDamage", amount: 12 }] },
  "관계·동사": { tags: ["idiom", "queue"], ops: [{ type: "returnQueueChar", count: 1 }, { type: "chargeParty", amount: 1 }] },
  "관계·소통": { tags: ["idiom", "chain"], ops: [{ type: "dealDamage", amount: 18 }, { type: "draw", count: 1 }] },
  "노력·성취": { tags: ["damage", "growth"], ops: [{ type: "dealDamage", amount: 24 }] },
  "비교·수량": { tags: ["queue", "economy"], ops: [{ type: "dealDamage", amount: 14 }, { type: "gainInk", amount: 4 }] },
  "윤리·수양": { tags: ["defense", "heal"], ops: [{ type: "heal", amount: 10 }, { type: "gainShield", amount: 10 }] },
  "지혜·판단": { tags: ["control", "queue"], ops: [{ type: "delay", turns: 1 }, { type: "returnQueueChar", count: 1 }] },
  default: { tags: ["damage", "idiom"], ops: [{ type: "dealDamage", amount: 18 }] }
});

export function buildIdiomSpecs(rows = [], legacyIds = {}) {
  return rows.map((row, index) => {
    const preset = CATEGORY_EFFECTS[row.category] || CATEGORY_EFFECTS.default;
    const rarityScale = row.tier === "희귀" ? 1.25 : row.tier === "기본" ? .85 : 1;
    return {
      id: legacyIds[row.hanja] || `idiom-${index + 1}`,
      hanja: row.hanja,
      chars: [...row.hanja],
      reading: row.reading,
      meaning: row.meaning,
      category: row.category,
      tier: row.tier,
      effectSpec: {
        id: legacyIds[row.hanja] || `idiom-${index + 1}`,
        trigger: "onActivate",
        conditions: [],
        ops: preset.ops.map((op) => ({ ...op, amount: op.amount ? Math.round(op.amount * rarityScale) : op.amount })),
        tags: preset.tags,
        oncePerTurn: true,
        chainPolicy: "no-repeat",
        powerBudget: row.tier === "희귀" ? 30 : row.tier === "기본" ? 18 : 24
      }
    };
  });
}

export const AUDIO_MANIFEST = Object.freeze({
  bgm: [
    { id: "menu", zone: "menu", src: "assets/audio/bgm/menu-workshop-loop.mp3", volume: .55, loop: true },
    { id: "act-1", zone: "act-1", src: "assets/audio/bgm/act1-mistwood-loop.mp3", volume: .52, loop: true },
    { id: "act-2", zone: "act-2", src: "assets/audio/bgm/act2-emberstone-loop.mp3", volume: .52, loop: true },
    { id: "act-3", zone: "act-3", src: "assets/audio/bgm/act3-moonmetal-loop.mp3", volume: .52, loop: true },
    { id: "elite-boss", zone: "boss", src: "assets/audio/bgm/elite-boss-loop.mp3", volume: .58, loop: true },
    { id: "final-boss", zone: "final-boss", src: "assets/audio/bgm/final-boss-loop.mp3", volume: .6, loop: true },
    { id: "victory", zone: "victory", src: "assets/audio/bgm/victory-result.mp3", volume: .58, loop: false }
  ],
  sfx: [
    ["ui-hover","ui-hover.mp3",.18,350],["ui-confirm","ui-confirm.mp3",.42,70],["ui-cancel","ui-cancel.mp3",.35,70],
    ["tile-pick","tile-pick.mp3",.32,45],["tile-swap","tile-swap.mp3",.3,42],["tile-match","tile-match.mp3",.38,65],
    ["combo-low","combo-low.mp3",.4,90],["combo-high","combo-high.mp3",.52,110],["idiom-ready","idiom-ready.mp3",.52,160],
    ["idiom-cast","idiom-cast.mp3",.64,220],["hit-wood","hit-wood.mp3",.42,80],["hit-fire","hit-fire.mp3",.44,80],
    ["hit-earth","hit-earth.mp3",.44,80],["hit-metal","hit-metal.mp3",.44,80],["hit-water","hit-water.mp3",.42,80],
    ["shield","shield.mp3",.45,100],["heal","heal.mp3",.46,100],["debuff","debuff.mp3",.42,120],
    ["enemy-hit","enemy-hit.mp3",.44,65],["reward","reward.mp3",.58,220],["victory","victory.mp3",.68,400],
    ["defeat","defeat.mp3",.58,400],["revive-brush","revive-brush.mp3",.58,90]
  ].map(([id,file,volume,cooldownMs]) => ({ id, src: `assets/audio/sfx/${file}`, volume, cooldownMs }))
});

export const RUN_CONTENT = Object.freeze({ relics: RELIC_CATALOG, events: EVENT_CATALOG, encounters: ENCOUNTER_CATALOG });
