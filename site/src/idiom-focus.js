function previewFor(previews, id) {
  if (previews instanceof Map) return previews.get(id) || null;
  return previews?.[id] || null;
}

function collectedCount(idiom, preview) {
  if (Array.isArray(preview?.availability)) return preview.availability.filter(Boolean).length;
  return 0;
}

/**
 * Creates the small, keyboard-selectable list used above the large idiom card.
 * The entries deliberately carry only the data the HUD needs so it can be
 * exercised without a DOM or an active battle.
 */
export function buildIdiomFocusEntries(fixedIdioms = [], rotatingIdioms = [], previews = new Map()) {
  return [
    ...fixedIdioms.map((idiom) => ({ idiom, kind: "fixed" })),
    ...rotatingIdioms.map((idiom) => ({ idiom, kind: "rotating" }))
  ].map(({ idiom, kind }) => {
    const preview = previewFor(previews, idiom.id);
    const collected = collectedCount(idiom, preview);
    const required = Array.isArray(idiom?.chars) ? idiom.chars.length : 4;
    return {
      id: idiom.id,
      idiom,
      kind,
      collected,
      required,
      ready: preview?.ready ?? (required > 0 && collected >= required)
    };
  });
}

/** Keep a deliberate selection if it is still in this round; otherwise choose
 * an actionable recipe first, then the one nearest completion, then fixed. */
export function chooseFocusedIdiomEntry(entries = [], focusedIdiomId = null) {
  const retained = entries.find((entry) => entry.id === focusedIdiomId);
  if (retained) return retained;
  return [...entries].sort((left, right) =>
    Number(right.ready) - Number(left.ready)
    || right.collected - left.collected
    || (left.kind === right.kind ? 0 : left.kind === "fixed" ? -1 : 1)
  )[0] || null;
}

/** Returns the next valid tab for ArrowLeft, ArrowRight, Home, or End roving focus. */
export function getIdiomFocusRovingIndex(entries = [], currentId, key) {
  if (!entries.length) return -1;
  const currentIndex = Math.max(0, entries.findIndex((entry) => entry.id === currentId));
  if (key === "Home") return 0;
  if (key === "End") return entries.length - 1;
  if (key === "ArrowLeft") return (currentIndex - 1 + entries.length) % entries.length;
  if (key === "ArrowRight") return (currentIndex + 1) % entries.length;
  return currentIndex;
}
