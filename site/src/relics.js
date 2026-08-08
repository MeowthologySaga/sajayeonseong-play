export const IMMEDIATE_RUN_EFFECT_TYPES = Object.freeze([
  "heal", "loseHp", "shield", "maxHp", "moveSeconds", "nextMoveSeconds", "queueMax", "queueLife",
  "gainInk", "spendInk", "fragment", "reroll", "nextBattleDelay", "nextBattleReduction", "openingDamage",
  "nextIdiomPower", "elementAffinity", "gainRelic", "gainRareRelic", "gainRelicId", "draftIdiom",
  "upgradeIdiom", "removeIdiom", "masterIdiom", "masterCharacters", "balanceReward", "focusBuild",
  "startShield", "gainConsumable", "eliteDanger"
]);

export const RUNTIME_RELIC_EFFECT_TYPES = Object.freeze([
  "bossReflect", "burnEcho", "elementProcChance", "emergencyIdiom", "firstIdiomCharge",
  "guardedDamageReduction", "metalPierce", "overhealShield", "rainbowCharge", "refreshOldest",
  "rewardPreview", "roleChainDamage", "thirdIdiomDamage", "turnSevenDelay"
]);

export const SUPPORTED_RUN_EFFECT_TYPES = Object.freeze([
  ...new Set([...IMMEDIATE_RUN_EFFECT_TYPES, ...RUNTIME_RELIC_EFFECT_TYPES])
]);

export function validateRunEffectCoverage({ relics = [], events = [] } = {}) {
  const supported = new Set(SUPPORTED_RUN_EFFECT_TYPES);
  const references = [];
  relics.forEach((relic) => (relic.effects || []).forEach((effect) => references.push({ owner: `유물 ${relic.id}`, type: effect.type })));
  events.forEach((event) => (event.choices || []).forEach((choice) => (choice.effects || []).forEach((effect) => {
    references.push({ owner: `이벤트 ${event.id}/${choice.id}`, type: effect.type });
  })));
  const unsupported = references.filter((entry) => !supported.has(entry.type));
  return {
    ok: unsupported.length === 0,
    unsupported,
    referencedTypes: [...new Set(references.map((entry) => entry.type))].sort(),
    supportedTypes: [...supported].sort()
  };
}

export function findRunRelicEffect(relics = [], relicIds = [], type = "", predicate = null) {
  const owned = new Set(relicIds || []);
  for (const relic of relics || []) {
    if (!owned.has(relic.id)) continue;
    const effect = (relic.effects || []).find((candidate) => candidate.type === type && (!predicate || predicate(candidate, relic)));
    if (effect) return { ...effect, relicId: relic.id, relicName: relic.name };
  }
  return null;
}

export function claimRunTrigger(run, key) {
  if (!run || !key) return false;
  run.relicState ||= {};
  run.relicState.triggered ||= {};
  if (run.relicState.triggered[key]) return false;
  run.relicState.triggered[key] = true;
  return true;
}

export function countMissingIdiomChars(idiom, queue = []) {
  const available = new Map();
  (queue || []).forEach((entry) => {
    const char = typeof entry === "string" ? entry : entry?.char;
    if (char) available.set(char, (available.get(char) || 0) + 1);
  });
  const missingChars = [];
  (idiom?.chars || []).forEach((char) => {
    const count = available.get(char) || 0;
    if (count > 0) available.set(char, count - 1);
    else missingChars.push(char);
  });
  return missingChars;
}

export function chooseEmergencyIdiom(idioms = [], queue = []) {
  const choices = (idioms || []).map((idiom, index) => ({
    idiom,
    missingChars: countMissingIdiomChars(idiom, queue),
    index
  })).filter((entry) => entry.missingChars.length > 0);
  choices.sort((a, b) => a.missingChars.length - b.missingChars.length || a.index - b.index);
  return choices[0] || null;
}
