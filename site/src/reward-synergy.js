// Reward-fit information is deliberately descriptive rather than a score.
// Keeping it data-only means the same reward and build always produce the
// same comparison notes in the UI, tests, and any future replay viewer.

const ELEMENT_LABELS = Object.freeze({
  wood: "목",
  fire: "화",
  earth: "토",
  metal: "금",
  water: "수"
});

const ELEMENT_IDS = new Set(Object.keys(ELEMENT_LABELS));

const TAG_LABELS = Object.freeze({
  damage: "피해",
  defense: "방어",
  control: "제어",
  heal: "회복",
  queue: "문자 운영",
  idiom: "성어",
  chain: "연쇄",
  tempo: "시간",
  survival: "생존",
  element: "오행",
  economy: "자원",
  growth: "성장",
  learning: "학습",
  choice: "선택"
});

const CORE_TAGS = new Set(Object.keys(TAG_LABELS));
// These tags describe content provenance or a UI/learning context, not a
// combat axis. They must never produce a "same-axis" synergy note by merely
// appearing on both the reward and the current build.
const NON_TACTICAL_TAGS = new Set(["idiom", "choice", "learning"]);
const SYNERGY_TAGS = new Set([...CORE_TAGS].filter((tag) => !NON_TACTICAL_TAGS.has(tag)));

function arrayOf(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tagList(entry = {}) {
  const fromEntry = arrayOf(entry.tags);
  const fromIdiom = arrayOf(entry.idiom?.effectSpec?.tags);
  const fromSpec = arrayOf(entry.effectSpec?.tags);
  return unique([...fromEntry, ...fromIdiom, ...fromSpec]);
}

function operationList(entry = {}) {
  return arrayOf(entry.idiom?.effectSpec?.ops).length
    ? arrayOf(entry.idiom.effectSpec.ops)
    : arrayOf(entry.effectSpec?.ops).length
      ? arrayOf(entry.effectSpec.ops)
      : arrayOf(entry.effects);
}

function hasOperation(operations, ...types) {
  return operations.some((operation) => types.includes(operation?.type));
}

function operationAmount(operations, ...types) {
  return operations
    .filter((operation) => types.includes(operation?.type))
    .reduce((total, operation) => total + numeric(operation.amount, 0), 0);
}

function elementList(entry = {}, tags = []) {
  return unique([
    entry.element,
    ...tags.filter((tag) => ELEMENT_IDS.has(tag)),
    ...operationList(entry).map((operation) => operation?.element)
  ].filter((element) => ELEMENT_IDS.has(element)));
}

function candidateIdiom(reward = {}) {
  return reward.idiom || (reward.type === "idiom" ? reward : null);
}

function candidateRole(reward = {}) {
  const idiom = candidateIdiom(reward);
  return String(idiom?.role || reward.role || "").trim();
}

function primaryTag(tags) {
  return tags.find((tag) => SYNERGY_TAGS.has(tag)) || "";
}

function tagLabel(tag) {
  return TAG_LABELS[tag] || tag || "전투";
}

function elementLabel(element) {
  return ELEMENT_LABELS[element] || element || "오행";
}

function addNote(notes, badge, reason, tone = "neutral") {
  if (!badge || !reason || notes.some((note) => note.badge === badge)) return;
  notes.push({ badge, reason, tone });
}

function commonTags(left, right) {
  const rightSet = new Set(right);
  return left.filter((tag) => rightSet.has(tag) && SYNERGY_TAGS.has(tag));
}

function snapshotEntries(entries, mapper) {
  return arrayOf(entries).map(mapper).filter(Boolean);
}

/**
 * Creates a serializable, non-mutating description of the live run state.
 * The evaluator also accepts this plain shape directly, making it safe to
 * reuse outside DOM code.
 */
export function createRewardBuildSnapshot(build = {}) {
  const party = snapshotEntries(build.party, (member) => ({
    id: member.id,
    name: member.name,
    element: member.element
  }));
  const idioms = snapshotEntries(build.idioms, (idiom) => ({
    id: idiom.id,
    name: idiom.name,
    role: idiom.role,
    tags: tagList(idiom)
  }));
  const relics = snapshotEntries(build.relics, (relic) => ({
    id: relic.id,
    name: relic.name,
    tags: tagList(relic)
  }));
  const maxHp = Math.max(1, numeric(build.maxHp, 1));
  const hp = Math.max(0, Math.min(maxHp, numeric(build.hp, maxHp)));
  const partyElementCounts = party.reduce((counts, member) => {
    if (ELEMENT_IDS.has(member.element)) counts[member.element] = (counts[member.element] || 0) + 1;
    return counts;
  }, {});
  const leader = build.leader && ELEMENT_IDS.has(build.leader.element)
    ? { id: build.leader.id, name: build.leader.name, element: build.leader.element }
    : null;

  return {
    party,
    partyElements: Object.keys(partyElementCounts).sort(),
    partyElementCounts,
    leader,
    idioms,
    idiomRoles: unique(idioms.map((idiom) => idiom.role)),
    idiomTags: unique(idioms.flatMap((idiom) => idiom.tags)),
    relics,
    relicTags: unique(relics.flatMap((relic) => relic.tags)),
    hp,
    maxHp,
    hpRatio: hp / maxHp,
    shield: Math.max(0, numeric(build.shield, 0))
  };
}

function evaluateRecovery(reward, build, notes) {
  const operations = operationList(reward);
  const healAmount = operationAmount(operations, "heal");
  const shieldAmount = operationAmount(operations, "shield", "gainShield", "startShield");
  const inkAmount = operationAmount(operations, "gainInk");
  const recoveryRelic = build.relicTags.includes("heal");
  const defenseRelic = build.relicTags.includes("defense");

  if (healAmount > 0) {
    if (build.hpRatio <= 0.45) addNote(notes, "위기 회복", `체력 ${Math.round(build.hpRatio * 100)}%에서 회복 ${healAmount}이 바로 반영됩니다.`, "context");
    else addNote(notes, `체력 ${Math.round(build.hpRatio * 100)}%`, `회복 ${healAmount}으로 다음 전투의 여유를 만듭니다.`, "context");
    if (recoveryRelic) addNote(notes, "회복 유물 축", "보유 회복 유물과 함께 생존 축을 유지합니다.", "synergy");
  }
  if (shieldAmount > 0) {
    if (build.shield <= 8) addNote(notes, "보호막 보완", `현재 보호막 ${build.shield}에 ${shieldAmount}을 더합니다.`, "support");
    else addNote(notes, "보호막 축적", `현재 보호막 ${build.shield} 위에 ${shieldAmount}을 겹칩니다.`, "support");
    if (defenseRelic) addNote(notes, "방어 유물 축", "보유 방어 유물과 함께 안정성을 쌓습니다.", "synergy");
  }
  if (inkAmount > 0) addNote(notes, "먹 정비", `먹 ${inkAmount}을 확보해 행로 선택지를 넓힙니다.`, "neutral");
}

function evaluateRelic(reward, build, notes) {
  const tags = tagList(reward);
  const operations = operationList(reward);
  const elements = elementList(reward, tags);
  const matchedElement = elements.find((element) => element === build.leader?.element)
    || elements.find((element) => build.partyElementCounts[element]);

  if (matchedElement) {
    const partyCount = build.partyElementCounts[matchedElement] || 0;
    if (build.leader?.element === matchedElement) {
      addNote(notes, `${elementLabel(matchedElement)} 리더 연계`, `${elementLabel(matchedElement)} 리더와 ${partyCount}자령 편성의 드롭 처리가 이어집니다.`, "synergy");
    } else {
      addNote(notes, `${elementLabel(matchedElement)} 자령 ${partyCount}`, `편성된 ${elementLabel(matchedElement)} 자령의 원소 처리와 맞물립니다.`, "synergy");
    }
  }

  const relicOverlap = commonTags(tags, build.relicTags);
  if (relicOverlap.length) {
    const tag = primaryTag(relicOverlap);
    addNote(notes, `${tagLabel(tag)} 유물 연계`, `보유 유물의 ${tagLabel(tag)} 축을 한 단계 더 쌓습니다.`, "synergy");
  }
  const idiomOverlap = commonTags(tags, build.idiomTags);
  if (idiomOverlap.length) {
    const tag = primaryTag(idiomOverlap);
    addNote(notes, `${tagLabel(tag)} 성어 연계`, `보유 성어의 ${tagLabel(tag)} 효과와 같은 전투 축입니다.`, "synergy");
  }

  if (hasOperation(operations, "heal") || tags.includes("heal") || tags.includes("survival")) evaluateRecovery(reward, build, notes);
  if ((hasOperation(operations, "shield", "gainShield", "startShield") || tags.includes("defense")) && build.shield <= 8) {
    addNote(notes, "보호막 보완", `현재 보호막 ${build.shield}에서 방어 수단을 보탭니다.`, "support");
  }
}

function evaluateIdiom(reward, build, notes) {
  const idiom = candidateIdiom(reward) || reward;
  const tags = tagList(idiom);
  const operations = operationList(idiom);
  const role = candidateRole(reward);
  const isUpgrade = reward.type === "idiom-upgrade";

  if (isUpgrade) {
    addNote(notes, "보유 성어 심화", `${idiom.name || "선택한 성어"}의 ${role || "전투"} 효과를 강화합니다.`, "support");
  } else if (role && build.idiomRoles.includes(role)) {
    addNote(notes, `${role} 연계`, `보유 성어와 같은 ${role} 역할을 이어갑니다.`, "synergy");
  } else if (role) {
    addNote(notes, "새 역할 확보", `${role} 역할을 성어첩에 더합니다.`, "neutral");
  }

  const relicOverlap = commonTags(tags, build.relicTags);
  if (relicOverlap.length) {
    const tag = primaryTag(relicOverlap);
    addNote(notes, `${tagLabel(tag)} 유물 연계`, `보유 유물의 ${tagLabel(tag)} 축과 함께 작동합니다.`, "synergy");
  }
  const idiomOverlap = commonTags(tags, build.idiomTags);
  if (!isUpgrade && idiomOverlap.length) {
    const tag = primaryTag(idiomOverlap);
    addNote(notes, `${tagLabel(tag)} 성어 축`, `현재 성어의 ${tagLabel(tag)} 전술을 이어갑니다.`, "synergy");
  }

  if (hasOperation(operations, "chargeParty") && build.party.length) {
    const leaderLabel = build.leader ? `${elementLabel(build.leader.element)} 리더` : "편성 자령";
    addNote(notes, "파티 기력", `${leaderLabel}를 포함한 ${build.party.length}자령의 기술 준비에 보탭니다.`, "support");
  }
  if ((role.includes("속성") || tags.includes("element")) && build.partyElements.length >= 3) {
    addNote(notes, `${build.partyElements.length}속성 편성`, `현재 ${build.partyElements.length}속성 자령 편성으로 원소 선택 폭이 넓습니다.`, "synergy");
  }
  if (hasOperation(operations, "heal", "gainShield")) evaluateRecovery(idiom, build, notes);
}

function evaluateJaryeong(reward, build, notes) {
  const element = reward.element;
  if (ELEMENT_IDS.has(element) && build.leader?.element === element) {
    addNote(notes, `${elementLabel(element)} 리더 연계`, `${elementLabel(element)} 리더가 같은 원소 자령의 전투 흐름을 받쳐요.`, "synergy");
  } else if (ELEMENT_IDS.has(element) && build.partyElementCounts[element]) {
    addNote(notes, `${elementLabel(element)} 편성 연계`, `현재 ${elementLabel(element)} 자령 ${build.partyElementCounts[element]}명과 원소 축을 맞춥니다.`, "synergy");
  }
  if (reward.skillDesc?.includes("보호막") && build.shield <= 8) {
    addNote(notes, "보호막 보완", `현재 보호막 ${build.shield}에서 기술 방어를 더합니다.`, "support");
  }
}

/**
 * Returns one to three short comparison notes. They are not a rank, score,
 * or directive; the player still chooses between distinct strategic routes.
 */
export function evaluateRewardSynergy(reward = {}, rawBuild = {}) {
  const build = rawBuild?.partyElementCounts && rawBuild?.hpRatio != null
    ? rawBuild
    : createRewardBuildSnapshot(rawBuild);
  const notes = [];
  const type = reward.type || "unknown";

  if (type === "idiom" || type === "idiom-upgrade") evaluateIdiom(reward, build, notes);
  else if (type === "relic") evaluateRelic(reward, build, notes);
  else if (type === "heal") evaluateRecovery(reward, build, notes);
  else if (type === "jaryeong") evaluateJaryeong(reward, build, notes);

  if (!notes.length) {
    const tag = primaryTag(tagList(reward));
    const typeLabel = type === "idiom" ? "성어" : type === "relic" ? "유물" : type === "heal" ? "정비" : "보상";
    if (type === "relic" && tag) {
      addNote(notes, `새 ${tagLabel(tag)} 축`, `보유 유물·성어에 없는 ${tagLabel(tag)} 전술을 더합니다.`, "neutral");
    } else {
      addNote(notes, `${typeLabel} 선택`, tag ? `${tagLabel(tag)} 전술을 새로 검토할 수 있습니다.` : "현재 빌드와 독립적으로 비교할 수 있는 선택지입니다.", "neutral");
    }
  }

  return notes.slice(0, 3);
}
