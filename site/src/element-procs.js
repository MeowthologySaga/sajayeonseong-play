export const ELEMENT_PROC_RULES = Object.freeze({
  wood: Object.freeze({ effect: "회복", powerRank: 1, baseChance: .52, maxChance: .90, amountPerUnit: 5 }),
  earth: Object.freeze({ effect: "보호막", powerRank: 2, baseChance: .46, maxChance: .88, amountPerUnit: 7 }),
  fire: Object.freeze({ effect: "화상", powerRank: 3, baseChance: .38, maxChance: .82, amountPerUnit: 1 }),
  metal: Object.freeze({ effect: "관통", powerRank: 4, baseChance: .30, maxChance: .76, damageMultiplier: 1.15, shieldBreakBase: 4, shieldBreakPerUnit: 3 }),
  water: Object.freeze({ effect: "행동 지연", powerRank: 5, baseChance: .16, maxChance: .52, turns: 1 })
});

export const ELEMENT_PROC_BONUSES = Object.freeze({
  extraMatchUnit: .04,
  synergyStack: .06,
  partyMember: .03,
  extraJaryeongLevel: .01,
  matchingLeader: .08,
  affinityStack: .06,
  focusStack: .04
});

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function calculateElementProcChance(element, context = {}) {
  const rule = ELEMENT_PROC_RULES[element];
  if (!rule) return null;

  const units = Math.max(1, Math.floor(finiteNonNegative(context.units) || 1));
  const partyMembers = Math.floor(finiteNonNegative(context.partyMembers));
  const partyLevelSum = Math.max(partyMembers, Math.floor(finiteNonNegative(context.partyLevelSum)));
  const bonuses = {
    match: Math.min(3, units - 1) * ELEMENT_PROC_BONUSES.extraMatchUnit,
    synergy: Math.min(2, finiteNonNegative(context.synergyStacks)) * ELEMENT_PROC_BONUSES.synergyStack,
    party: partyMembers * ELEMENT_PROC_BONUSES.partyMember,
    levels: Math.max(0, partyLevelSum - partyMembers) * ELEMENT_PROC_BONUSES.extraJaryeongLevel,
    leader: context.leaderMatches ? ELEMENT_PROC_BONUSES.matchingLeader : 0,
    affinity: finiteNonNegative(context.affinityStacks) * ELEMENT_PROC_BONUSES.affinityStack,
    focus: finiteNonNegative(context.focusStacks) * ELEMENT_PROC_BONUSES.focusStack,
    relic: finiteNonNegative(context.relicBonus)
  };
  const rawChance = rule.baseChance + Object.values(bonuses).reduce((sum, value) => sum + value, 0);
  const chance = Math.min(rule.maxChance, Math.max(0, rawChance));
  return { element, rule, units, chance, baseChance: rule.baseChance, bonuses };
}

export function rollElementProc(element, context = {}, random = 1) {
  const details = calculateElementProcChance(element, context);
  if (!details) return null;
  const sampled = typeof random === "function" ? Number(random()) : Number(random);
  const roll = Number.isFinite(sampled) ? Math.min(.999999999, Math.max(0, sampled)) : .999999999;
  return { ...details, roll, activated: roll < details.chance };
}

export function formatProcPercent(chance) {
  return `${Math.round(finiteNonNegative(chance) * 100)}%`;
}
