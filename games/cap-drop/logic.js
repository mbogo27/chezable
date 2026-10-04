// Cap Drop puzzle logic: pure and seeded, shared by the game and the tests.
// State = gold cap cell + set of empty cells (plain caps are identical) [+ "visited centre" bit in Native].
// A move slides any cap into an orthogonally adjacent empty cell. The exit is the bottom-right cell.
// Native "Through the Water" (from Shisima): on odd boards the gold cap must pass through the centre before it may exit.
import { rng } from '../../packages/rng/rng.js';

export function neighbors(i, n) {
  const x = i % n, y = (i / n) | 0, r = [];
  if (x > 0) r.push(i - 1); if (x < n - 1) r.push(i + 1); if (y > 0) r.push(i - n); if (y < n - 1) r.push(i + n);
  return r;
}
export const centreOf = (n) => (n % 2 ? (n * n - 1) / 2 : -1);
const key = (s, E, v) => s + '|' + E.slice().sort((a, b) => a - b).join(',') + (v ? '*' : '');

/**
 * Breadth-first solver. Returns { dist, first } where first is the first move of a shortest solution.
 * native: the gold cap must have visited the centre (odd n) before reaching the exit counts as solved.
 * maxNodes caps the search (spec Appendix B: 5x5 boards); returns dist Infinity if it gives up.
 */
export function solve(n, s, E, { native = false, visited = false, maxNodes = 120000 } = {}) {
  const exit = n * n - 1, centre = native ? centreOf(n) : -1;
  const need = centre >= 0;
  let v0 = visited || s === centre;
  if (s === exit && (!need || v0)) return { dist: 0, first: null };
  const start = key(s, E, need && v0);
  const seen = new Map([[start, null]]);
  const q = [[s, E.slice(), need && v0]];
  let head = 0;
  while (head < q.length) {
    if (seen.size > maxNodes) return { dist: Infinity, first: null, capped: true };
    const [cs, ce, cv] = q[head++], ck = key(cs, ce, cv);
    for (let ei = 0; ei < ce.length; ei++) {
      const e = ce[ei];
      for (const c of neighbors(e, n)) {
        if (ce.includes(c)) continue;
        const ns = c === cs ? e : cs, ne = ce.slice(); ne[ei] = c;
        const nv = need ? cv || ns === centre : false;
        const nk = key(ns, ne, nv);
        if (seen.has(nk)) continue;
        seen.set(nk, { prev: ck, move: { from: c, to: e } });
        if (ns === exit && (!need || nv)) {
          let k = nk; const path = [];
          while (seen.get(k)) { path.unshift(seen.get(k).move); k = seen.get(k).prev; }
          return { dist: path.length, first: path[0] };
        }
        q.push([ns, ne, nv]);
      }
    }
  }
  return { dist: Infinity, first: null };
}

export function cfgFor(L) {
  if (L <= 3) return { n: 3, k: 2, lo: L + 1 };
  if (L <= 7) return { n: 3, k: 1, lo: 4 + (L - 4) * 2 };
  if (L <= 12) return { n: 4, k: 2, lo: 5 + (L - 8) };
  if (L <= 18) return { n: 4, k: 1, lo: 8 + (L - 13) * 2 };
  return { n: 5, k: 1, lo: Math.min(28, 14 + (L - 19)) };
}
/** Daily and head-to-head puzzles: one mid-difficulty board (spec §5.2). */
export const DAILY_CFG = { n: 4, k: 1, lo: 9 };

export function generate(seedStr, cfg, native = false) {
  const r = rng(seedStr), n = cfg.n, N = n * n, exit = N - 1, lo = cfg.lo, hi = cfg.lo + 3;
  let best = null, bestD = -1;
  for (let t = 0; t < 220; t++) {
    let s; do { s = Math.floor(r() * N); } while (s === exit);
    const pool = []; for (let i = 0; i < N; i++) if (i !== s) pool.push(i);
    const E = []; for (let k = 0; k < cfg.k; k++) { const j = Math.floor(r() * pool.length); E.push(pool.splice(j, 1)[0]); }
    const d = solve(n, s, E, { native, maxNodes: 60000 }).dist;
    if (d >= lo && d <= hi) return { n, s, E, par: d };
    if (d < Infinity && (bestD < lo ? d > bestD : d <= hi && d > bestD)) { best = { n, s, E, par: d }; bestD = d; }
  }
  return best;
}
export const levelSeed = (L) => 'kifuniko-' + L;
export function starsFor(moves, par) { return moves <= par ? 3 : moves <= par + Math.max(3, Math.ceil(par * 0.5)) ? 2 : 1; }
