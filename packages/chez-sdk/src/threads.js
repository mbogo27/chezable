// Game threads (spec 2 §5): three of the four games played as one run, lives and coins carried over.
// A thread is configuration, worked out from its id, so every device and the Worker agree:
//   daily-YYYY-MM-DD    Today's Thread (Nairobi date): same games, order and seeds for everyone; ranked
//   anytime-<6-12 a-z0-9>  an Anytime thread: unranked; the same id always gives the same thread
import { rng, shuffle, xmur3 } from '../../rng/rng.js';

export const THREAD_GAMES = ['nyanya-jetpack', 'cut-in-half', 'cap-drop', 'arrow-puzzle'];
export const PUZZLES = ['cap-drop', 'arrow-puzzle'];
export const STARTING_LIVES = 3;
export const TURNS = 3;

export function parseThreadId(id) {
  const s = String(id || '');
  let m;
  if ((m = s.match(/^daily-(\d{4}-\d{2}-\d{2})$/))) return { kind: 'daily', day: m[1] };
  if (/^anytime-[a-z0-9]{6,12}$/.test(s)) return { kind: 'anytime' };
  return null;
}
/** /t/2026-10-07 and /t/anytime-abc123 (the URL forms) to a thread id. */
export function threadIdFromPath(part) {
  const s = decodeURIComponent(String(part || ''));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'daily-' + s;
  return parseThreadId(s) ? s : null;
}
export const threadPath = (id) => '/t/' + (id.startsWith('daily-') ? id.slice(6) : id);
export const dailyThreadId = (day) => 'daily-' + day;
export function newAnytimeId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = new Uint8Array(8);
  (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.random() * 256));
  return 'anytime-' + [...b].map((x) => abc[x % abc.length]).join('');
}

/** Choose and order the three games: a seeded shuffle, take three; the two puzzles never back to back. */
export function pickGames(seed) {
  const picked = shuffle(THREAD_GAMES.slice(), rng(seed, 'games')).slice(0, TURNS);
  const puzzles = picked.filter((g) => PUZZLES.includes(g));
  if (puzzles.length === 2) {
    const arcade = picked.find((g) => !PUZZLES.includes(g));
    return [puzzles[0], arcade, puzzles[1]];
  }
  return picked;
}

export function threadDef(id) {
  const p = parseThreadId(id);
  if (!p) return null;
  return {
    id, kind: p.kind, day: p.day || null,
    title: p.kind === 'daily' ? "Today's Thread" : 'Anytime thread',
    games: pickGames(id), seed: id, startingLives: STARTING_LIVES, ranked: p.kind === 'daily',
  };
}

/** Each turn's seed: hash(thread seed + game slug). It starts with the slug like every run seed. */
export function turnSeed(def, slug) {
  return `${slug}-t${xmur3(def.seed + slug)().toString(36)}`;
}

/**
 * Lives from a thread's runs, in play order (spec 2 §5.3):
 *   a failed turn (0 stars) costs 1 life; retrying a turn already passed costs 1 life (and the better
 *   result replaces the old one). A failed retry costs nothing more: its life was paid when it started.
 * runs: [{ turn, stars }]. Returns { lives, passed: Set of turns, best: { [turn]: run }, out, complete }.
 */
export function tally(runs, lives0 = STARTING_LIVES, turns = TURNS) {
  let lives = lives0;
  const passed = new Set(), best = {};
  for (const r of runs) {
    if (lives <= 0) break;
    if (passed.has(r.turn)) lives--;
    else if (!(r.stars > 0)) lives--;
    if (r.stars > 0) passed.add(r.turn);
    if (!best[r.turn] || (r.stars || 0) > (best[r.turn].stars || 0)) best[r.turn] = r;
  }
  const complete = passed.size >= turns;
  return { lives: Math.max(0, lives), passed, best, out: lives <= 0 && !complete, complete };
}
