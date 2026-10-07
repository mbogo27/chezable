// Thread progress on this device (spec 2 §5.3 "Resume"): saved after every turn, so leaving or refreshing
// offers "Continue today's thread (turn 2 of 3)". Daily progress expires at the Nairobi midnight reset,
// Anytime progress after 24 hours. Stored under chez:v1:thread:<id>, plus thread:current for the one in play.
import * as store from './store.js';
import { threadDef, tally, threadPath, dailyThreadId, TURNS } from './threads.js';
import { nairobiDay } from './rules.js';
import { uuid, track } from './net.js';

const DAY = 86400000;
export const todayId = () => dailyThreadId(nairobiDay());

function expired(s) {
  const def = threadDef(s.id);
  if (!def) return true;
  if (def.kind === 'daily') return def.day !== nairobiDay();
  return Date.now() - (s.startedAt || 0) > DAY;
}

/** The saved state for a thread id, or null (none, or expired and removed). */
export function load(id) {
  const s = store.get('thread:' + id);
  if (!s) return null;
  if (expired(s)) { store.set('thread:' + id, null); if (store.get('thread:current') === id) store.set('thread:current', null); return null; }
  return s;
}
const save = (s) => store.set('thread:' + s.id, s);

/** Start a fresh attempt (also used for "Try again"). entry: home_hero | start_bar | end_card | challenge_link | ... */
export function begin(id, entry = 'home_hero', from = null) {
  const def = threadDef(id);
  if (!def) return null;
  const prev = load(id);
  const s = { id, attempt: uuid(), startedAt: Date.now(), entry, from: from || (prev && prev.from) || null, runs: [], status: 'playing',
    tries: ((prev && prev.tries) || 0) + 1, result: null };
  save(s);
  store.set('thread:current', id);
  track('thread_started', { kind: def.kind, thread: id, entry });
  return s;
}

/** Where a thread stands: its definition, lives, best result per turn, and the turn to play next. */
export function view(s) {
  const def = threadDef(s.id);
  const tl = tally(s.runs, def.startingLives, TURNS);
  let turn = 0;
  while (turn < TURNS && tl.passed.has(turn)) turn++;
  const stars = [0, 1, 2].reduce((a, i) => a + (tl.best[i] ? tl.best[i].stars || 0 : 0), 0);
  const coins = s.runs.reduce((a, r) => a + (r.coins || 0), 0) + (s.result && s.result.bonusCoins || 0);
  const xp = s.runs.reduce((a, r) => a + (r.xp || 0), 0) + (s.result && s.result.bonusXp || 0);
  const durationMs = s.runs.reduce((a, r) => a + (r.durationMs || 0), 0);
  return { def, ...tl, turn: Math.min(turn, TURNS - 1), next: turn, stars, coins, xp, durationMs, done: tl.complete || tl.out };
}

/** Record a finished turn. Returns the new view. */
export function addRun(id, run) {
  const s = load(id);
  if (!s) return null;
  const before = view(s);
  const retry = before.passed.has(run.turn);
  s.runs.push({ ...run, retry });
  const v = view(s);
  s.status = v.complete ? 'complete' : v.out ? 'out' : 'playing';
  save(s);
  track('turn_completed', { thread: id, turn: run.turn, game: run.game, stars: run.stars, lives: v.lives, retry: retry ? 1 : 0 });
  if (v.complete) track('thread_completed', { thread: id, stars: v.stars, lives: v.lives, duration: Math.round(v.durationMs / 1000) });
  return v;
}
export function setResult(id, result) {
  const s = load(id);
  if (!s) return;
  s.result = { ...(s.result || {}), ...result };
  save(s);
}
export function saveCode(id, code) {
  const s = load(id);
  if (!s) return;
  s.challengeCode = code;
  save(s);
}
export function abandon(id) {
  const s = load(id);
  if (!s) return;
  track('thread_abandoned', { thread: id, turn: view(s).next });
  store.set('thread:' + id, null);
  if (store.get('thread:current') === id) store.set('thread:current', null);
}

/** The thread to offer "Continue" for: today's Daily if it's mid-way, else the current Anytime one. */
export function inProgress() {
  const d = load(todayId());
  if (d && d.status === 'playing' && d.runs.length) return d;
  const cur = store.get('thread:current');
  const c = cur ? load(cur) : null;
  return c && c.status === 'playing' && c.runs.length ? c : null;
}
/** The URL a thread's game turn is played at. */
export const turnUrl = (id, slug) => `/g/${slug}/?thread=${encodeURIComponent(id)}`;
export { threadPath };
