export function interpolateGridPath(from, to) {
  const start = { r: Math.trunc(Number(from?.r)), c: Math.trunc(Number(from?.c)) };
  const target = { r: Math.trunc(Number(to?.r)), c: Math.trunc(Number(to?.c)) };
  if (![start.r, start.c, target.r, target.c].every(Number.isFinite)) return [];

  const rowDelta = target.r - start.r;
  const colDelta = target.c - start.c;
  const steps = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
  if (!steps) return [];

  const path = [];
  let previous = start;
  for (let step = 1; step <= steps; step++) {
    const next = {
      r: Math.round(start.r + rowDelta * step / steps),
      c: Math.round(start.c + colDelta * step / steps)
    };
    if (next.r === previous.r && next.c === previous.c) continue;
    path.push(next);
    previous = next;
  }
  return path;
}
