// Rules shared by the shell and the Worker. The Worker is the only writer of XP and coins;
// the shell uses these for display only.

/** Spec §4.3 award table. cap: per player per day unless noted. */
export const AWARDS = {
  'run.finished':                     { xp: 5,  coins: 1,  coinCapPerDay: 30 },
  'run.personal_best':                { xp: 10, coins: 3,  perGamePerDay: 1 },
  'stage.first_play':                 { xp: 25, coins: 10, oncePerGame: true },
  'daily.completed':                  { xp: 15, coins: 5,  perGamePerDay: 1 },
  'h2h.played':                       { xp: 5,  coins: 2,  perDay: 10 },
  'h2h.won':                          { xp: 15, coins: 5,  perDay: 10 },
  'challenge.accepted_by_new_player': { xp: 30, coins: 20, perDay: 5 },
  'native.played':                    { xp: 10, coins: 5,  oncePerGame: true },
  'challenge.sent':                   { xp: 2,  coins: 0,  perDay: 10 },
  'thread.completed':                 { xp: 10, coins: 5,  perDay: 10 }, // spec 2 §5.3 bonus (tune later)
};

/**
 * Levels: you are level n once total XP reaches round(100 × (n−1)^1.5).
 * Level 2 at 100 XP, 3 at 283, 4 at 520, 5 at 800 (spec §4.3, read so level 1 starts at 0 XP).
 */
export function xpForLevel(n) { return n <= 1 ? 0 : Math.round(100 * Math.pow(n - 1, 1.5)); }
export function levelFor(xp) {
  let n = 1;
  while (xp >= xpForLevel(n + 1)) n++;
  return n;
}
export const NATIVE_UNLOCK_LEVEL = 2;

/** Africa/Nairobi is UTC+3 all year (no DST). */
export function nairobiDay(ts = Date.now()) {
  return new Date(ts + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
export function nairobiDayStart(day) {
  return Date.parse(day + 'T00:00:00Z') - 3 * 3600 * 1000;
}

/** Weekly boards reset Monday 00:00 East Africa Time (UTC+3). Returns that Monday as YYYY-MM-DD. */
export function weekKey(ts = Date.now()) {
  const d = new Date(ts + 3 * 3600 * 1000);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
}

// Name rules live in names.js (format, shared) and the Worker's moderation.js (lists, server only).
export { nameFormatProblem } from './names.js';

/* ---------- scoring ---------- */
/** Score definition for a mode, with per-mode overrides from stage.json. */
export function scoreDef(stage, mode) {
  const base = stage.score || {};
  const o = (base.modes && base.modes[mode]) || {};
  return { ...base, ...o, modes: undefined };
}
/** Negative when a is better than b (a sorts first). Ties go to the lower tiebreak, then the earlier time. */
export function compareRuns(def, a, b) {
  const dir = def.order === 'asc' ? 1 : -1;
  if (a.score !== b.score) return dir * (a.score - b.score);
  const ta = a.tiebreak ?? Infinity, tb = b.tiebreak ?? Infinity;
  if (ta !== tb) return ta - tb;
  return (a.at || 0) - (b.at || 0);
}
export function isBetter(def, score, prev) {
  if (prev == null) return true;
  return def.order === 'asc' ? score < prev : score > prev;
}

/** Codes for challenge ids and recovery codes (no look-alike characters). */
export const ID_ABC = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RECOVERY_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
