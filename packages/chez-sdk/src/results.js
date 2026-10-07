// The game result contract (spec 2 §4): stars and the result strip, from a game's score and detail.
// Pure, so the shell, the games and the Worker (thread validation) all agree. Thresholds live in each
// stage.json under "stars" and are placeholders until Mbogo sets them from real play data:
//   { "kind": "desc", "t": [1★, 2★, 3★] }   higher is better (distance): at least t[i]
//   { "kind": "asc",  "t": [1★, 2★, 3★] }   lower is better (cm off): at most t[i]
//   { "kind": "par",  "near": 2 }          puzzles: solved 1★, within `near` of best possible 2★, best possible 3★
//   { "kind": "bumps", "t": [1★, 2★, 3★] }  puzzles scored on mistakes: cleared, then at most t[i] bumps

/** Stars 0..3. 0 means failed (did not solve, crashed before the pass score, or out of time). */
export function starsFor(g, score, detail = {}) {
  const s = g && g.stars;
  if (!s || score == null) return null;
  const d = detail || {};
  if (d.solved === false) return 0;
  if (s.kind === 'par') {
    if (d.moves == null || d.par == null) return 1;
    return d.moves <= d.par ? 3 : d.moves <= d.par + (s.near ?? 2) ? 2 : 1;
  }
  if (s.kind === 'bumps') {
    const b = d.bumps ?? 0;
    return b <= s.t[2] ? 3 : b <= s.t[1] ? 2 : b <= s.t[0] ? 1 : 1;
  }
  const t = s.t || [];
  if (s.kind === 'asc') return score <= t[2] ? 3 : score <= t[1] ? 2 : score <= t[0] ? 1 : 0;
  return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
}

/** The result strip: small squares that summarise the run, on screen and in share text. true = filled. */
export function stripFor(g, score, detail = {}, stars = null) {
  const s = (g && g.stars) || {};
  const d = detail || {};
  if (d.solved === false) return [false, false, false, false, false];
  if (s.kind === 'par' && d.moves != null) {
    // one square per move, the last one outlined (capped so it fits on a phone)
    const n = Math.max(1, Math.min(20, d.moves));
    return Array.from({ length: n }, (_, i) => i < n - 1);
  }
  if (s.kind === 'bumps') {
    const b = Math.min(5, d.bumps ?? 0);
    return Array.from({ length: 5 }, (_, i) => i < 5 - b);
  }
  if (Array.isArray(d.cuts) && d.cuts.length) return d.cuts.map((c) => c.err <= (s.goodCut ?? 5));
  const t = s.t || [];
  if (s.kind === 'asc' && t[2] != null) {
    // 5 squares: full at the 3-star line, empty at twice the pass line
    const k = score <= t[2] ? 1 : Math.max(0, 1 - (score - t[2]) / Math.max(1, t[0] * 2 - t[2]));
    return Array.from({ length: 5 }, (_, i) => i < Math.round(k * 5));
  }
  if (t[2] != null) {
    const k = Math.max(0, Math.min(1, score / t[2]));
    return Array.from({ length: 5 }, (_, i) => i < Math.round(k * 5));
  }
  const n = stars == null ? 0 : stars;
  return [0, 1, 2].map((i) => i < n);
}

/** Text for a strip (share messages): ■ filled, □ empty. */
export const stripText = (strip) => (strip || []).map((x) => (x ? '■' : '□')).join('');
/** Text for stars (share messages). */
export const starText = (n) => '⭐'.repeat(Math.max(0, n || 0)) + '▫️'.repeat(Math.max(0, 3 - (n || 0)));
