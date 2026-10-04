// Toka level generator and rules: pure and seeded, shared by the game and the tests.
//
// Solvable by construction: each new arrow is only placed if it has a clear exit past every arrow already
// placed, so removing arrows in reverse placement order always works.
// Native "Giuthi arrows": some arrows have a double head. Blocked going forward, they reverse and leave by
// the tail; blocked both ways, they stay put and cost nothing. The generator may place a double-headed
// arrow whose only clear exit is backwards, so planning the reversal becomes part of the puzzle. The
// reverse-placement proof still holds because each arrow's recorded exit (forward or back) was clear.
import { rng } from '../../packages/rng/rng.js';

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function cfgFor(level) {
  const C = Math.min(16, 5 + Math.floor(level * 0.7));
  return { C, R: Math.min(22, C + Math.floor(level * 0.45)), maxLen: Math.min(16, 4 + Math.floor(level * 0.6)) };
}
export const DAILY_CFG = cfgFor(12);

export function generate(seedStr, cfg, native = false) {
  const r = rng(seedStr);
  const { C, R, maxLen } = cfg, turnP = 0.32;
  const occ = Array.from({ length: R }, () => new Array(C).fill(-1));
  const arrows = [];
  let filled = 0;
  const inb = (x, y) => x >= 0 && y >= 0 && x < C && y < R;
  const rayClear = (x, y, dx, dy, own) => { x += dx; y += dy; while (inb(x, y)) { if (occ[y][x] !== -1 || own.has(x + ',' + y)) return false; x += dx; y += dy; } return true; };
  const tries = C * R * 10;
  for (let t = 0; t < tries && filled < C * R * 0.9; t++) {
    const sx = Math.floor(r() * C), sy = Math.floor(r() * R);
    if (occ[sy][sx] !== -1) continue;
    const target = 2 + Math.floor(r() * (maxLen - 1));
    const path = [[sx, sy]], own = new Set([sx + ',' + sy]);
    let d = Math.floor(r() * 4);
    for (let k = 1; k < target; k++) {
      const turns = [(d + 1) % 4, (d + 3) % 4]; if (r() < 0.5) turns.reverse();
      const opts = r() < turnP ? [...turns, d] : [d, ...turns];
      let moved = false;
      for (const nd of opts) {
        const [px, py] = path[path.length - 1], nx = px + DIRS[nd][0], ny = py + DIRS[nd][1];
        if (inb(nx, ny) && occ[ny][nx] === -1 && !own.has(nx + ',' + ny)) { path.push([nx, ny]); own.add(nx + ',' + ny); d = nd; moved = true; break; }
      }
      if (!moved) break;
    }
    while (path.length >= 2) {
      const [hx, hy] = path[path.length - 1], [bx, by] = path[path.length - 2], dx = hx - bx, dy = hy - by;
      const [tx, ty] = path[0], [ux, uy] = path[1], bdx = tx - ux, bdy = ty - uy;
      const fwd = rayClear(hx, hy, dx, dy, own);
      const back = native && rayClear(tx, ty, bdx, bdy, own);
      // Native: most arrows that can only leave backwards become double-headed; a few clear ones do too
      let rev = false, ok = fwd;
      if (native && !fwd && back && r() < 0.8) { rev = true; ok = true; }
      else if (native && fwd && r() < 0.12) rev = true;
      if (ok) {
        const id = arrows.length;
        arrows.push({ id, cells: path.map(([x, y]) => ({ x, y })), dx, dy, rev });
        for (const [x, y] of path) occ[y][x] = id;
        filled += path.length;
        break;
      }
      const p = path.pop(); own.delete(p[0] + ',' + p[1]);
    }
  }
  return { C, R, occ, arrows };
}

/** First blocker along a ray from the head (or from the tail when backwards). */
export function blocker(L, a, backwards = false) {
  let x, y, dx, dy;
  if (!backwards) { ({ x, y } = a.cells[a.cells.length - 1]); dx = a.dx; dy = a.dy; }
  else { ({ x, y } = a.cells[0]); dx = a.cells[0].x - a.cells[1].x; dy = a.cells[0].y - a.cells[1].y; }
  let k = 0;
  while (true) {
    x += dx; y += dy; k++;
    if (x < 0 || y < 0 || x >= L.C || y >= L.R) return null;
    const o = L.occ[y][x];
    if (o !== -1 && o !== a.id) return { id: o, k };
  }
}

/** What a tap on arrow a does: 'exit' | 'reverse' (leaves by the tail) | 'stop' (double head, no cost) | 'bump'. */
export function tapOutcome(L, a) {
  if (!blocker(L, a)) return { kind: 'exit' };
  if (a.rev) return blocker(L, a, true) ? { kind: 'stop' } : { kind: 'reverse' };
  return { kind: 'bump', blk: blocker(L, a) };
}
export function removeArrow(L, a) { for (const c of a.cells) L.occ[c.y][c.x] = -1; a.gone = true; }

/** Greedy solve check used by tests: repeatedly remove any arrow that can leave. */
export function solvable(L) {
  let left = L.arrows.filter((a) => !a.gone).length, progress = true;
  while (left && progress) {
    progress = false;
    for (const a of L.arrows) {
      if (a.gone) continue;
      const o = tapOutcome(L, a);
      if (o.kind === 'exit' || o.kind === 'reverse') { removeArrow(L, a); left--; progress = true; }
    }
  }
  return left === 0;
}
export const levelSeed = (n) => 'toka-' + n;
