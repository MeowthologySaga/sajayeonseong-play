// v2 intentionally retires the old lower-dock default saved by early builds.
// Existing players therefore receive the new upper queue once, while choices
// made in this build continue to persist normally.
export const COMBAT_LAYOUT_STORAGE_KEY = "sajayeonseong-combat-layout-v2";

export const COMBAT_LAYOUT_MODES = Object.freeze(["bottom", "upper"]);

export function normalizeCombatLayoutMode(value) {
  return COMBAT_LAYOUT_MODES.includes(value) ? value : "upper";
}
