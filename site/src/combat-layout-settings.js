export const COMBAT_LAYOUT_STORAGE_KEY = "sajayeonseong-combat-layout-v1";

export const COMBAT_LAYOUT_MODES = Object.freeze(["bottom", "upper"]);

export function normalizeCombatLayoutMode(value) {
  return COMBAT_LAYOUT_MODES.includes(value) ? value : "bottom";
}
