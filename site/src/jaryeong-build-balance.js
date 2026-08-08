export const BASE_ELEMENT_MATCH_DAMAGE = 9;
export const MAX_JARYEONG_DAMAGE_RATIO = .2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function calculateJaryeongMemberDamageRatio(member = {}) {
  const attack = clamp(member.attack, 0, 30);
  const level = clamp(member.level || 1, 1, 99);
  const awakening = clamp(member.awakening || 0, 0, 5);
  const attackIdentity = clamp((attack - 6) * .002, 0, .014);
  const growth = Math.min(.01, (level - 1) * .0002);
  const awakeningGrowth = awakening * .002;
  return .03 + attackIdentity + growth + awakeningGrowth;
}

export function calculateJaryeongDamageRatio({ members = [], leaderMultiplier = 1 } = {}) {
  const memberRatio = members.reduce((sum, member) => sum + calculateJaryeongMemberDamageRatio(member), 0);
  const leaderRatio = Math.max(0, (Number(leaderMultiplier) || 1) - 1);
  return Math.min(MAX_JARYEONG_DAMAGE_RATIO, memberRatio + leaderRatio);
}

export function calculateElementMatchAttack({
  units = 0,
  comboScale = 1,
  members = [],
  leaderMultiplier = 1,
  systemMultiplier = 1
} = {}) {
  const baseDamage = Math.max(0, BASE_ELEMENT_MATCH_DAMAGE * Math.max(0, units) * Math.max(0, comboScale));
  const jaryeongRatio = calculateJaryeongDamageRatio({ members, leaderMultiplier });
  const damageBeforeSystem = baseDamage * (1 + jaryeongRatio);
  return {
    baseDamage,
    jaryeongRatio,
    jaryeongBonusDamage: baseDamage * jaryeongRatio,
    totalDamage: damageBeforeSystem * Math.max(0, Number(systemMultiplier) || 0)
  };
}

export function capJaryeongSkillDamage(amount, enemyMaxHp, ratio = MAX_JARYEONG_DAMAGE_RATIO) {
  const requested = Math.max(0, Math.round(Number(amount) || 0));
  const maxHp = Math.max(1, Math.round(Number(enemyMaxHp) || 1));
  const cap = Math.max(1, Math.round(maxHp * clamp(ratio, 0, MAX_JARYEONG_DAMAGE_RATIO)));
  return Math.min(requested, cap);
}
