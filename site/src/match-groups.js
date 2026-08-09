/**
 * Find all 3+ horizontal/vertical element matches on a board, then merge
 * touching runs of the same element into a single combo group.
 *
 * This matches Puzzle & Dragons-style combo semantics: a cross/T/L made from
 * one continuous colour is one combo, not one horizontal combo plus one
 * vertical combo. Separated matched islands remain separate combos.
 */
export function findElementMatches(board) {
  if (!Array.isArray(board) || !board.length || !Array.isArray(board[0]) || !board[0].length) {
    return { matched: new Set(), groups: [] };
  }
  const rows = board.length;
  const cols = board[0].length;
  const matched = new Set();
  const elementAt = (r, c) => board[r]?.[c]?.element || null;

  for (let r = 0; r < rows; r++) {
    let start = 0;
    for (let c = 1; c <= cols; c++) {
      if (c === cols || elementAt(r, c) !== elementAt(r, start)) {
        if (elementAt(r, start) && c - start >= 3) {
          for (let x = start; x < c; x++) matched.add(`${r},${x}`);
        }
        start = c;
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      if (r === rows || elementAt(r, c) !== elementAt(start, c)) {
        if (elementAt(start, c) && r - start >= 3) {
          for (let y = start; y < r; y++) matched.add(`${y},${c}`);
        }
        start = r;
      }
    }
  }

  const groups = [];
  const visited = new Set();
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (const key of matched) {
    if (visited.has(key)) continue;
    const [startR, startC] = key.split(",").map(Number);
    const element = elementAt(startR, startC);
    const queue = [[startR, startC]];
    const group = [];
    visited.add(key);

    for (let head = 0; head < queue.length; head++) {
      const [r, c] = queue[head];
      group.push([r, c]);
      for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const neighborKey = `${nr},${nc}`;
        if (visited.has(neighborKey) || !matched.has(neighborKey)) continue;
        if (elementAt(nr, nc) !== element) continue;
        visited.add(neighborKey);
        queue.push([nr, nc]);
      }
    }

    group.sort(([ar, ac], [br, bc]) => ar - br || ac - bc);
    groups.push(group);
  }

  groups.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);
  return { matched, groups };
}
