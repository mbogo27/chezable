// Stage runtime: the shell around every game. The shared header, the start screen, the run lifecycle and the
// game result contract (spec 2 §4), the end screen, challenges made on the device (§1.2), thread turns (§5),
// pass the phone, dailies, Native variants and Assist mode.
//
// Game contract, as this codebase spells it (spec 2 §4 names it game.start / GameResult / forceEnd):
//   Chez.onPlay(ctx => ...)        the shell starts the game: ctx.mode solo | daily | h2h | thread | ..., the run's seed
//   run.finish(result)            the game hands back its result; the shell completes it into a GameResult
//                                 { gameSlug, seed, score, scoreLabel, stars, bestPossible, durationMs, strip, coinsEarned, xpEarned }
//   Chez.onForceEnd(fn)           called at maxDurationSec (60 s by default): the game finishes at once with what it has
// Games never draw an end screen.
import * as store from './store.js';
import { prefs } from './prefs.js';
import { t, L, addStrings } from './i18n.js';
import { api, track, enqueue, flush, sendQueued, cachedMe, refreshMe, applyEarnings, player, on as onNet, sha256Hex, uuid, emit, flushEventsNow } from './net.js';
import { esc, h, toast, announce, sheet, anySheetOpen } from './ui.js';
import { share, shareNow, challengeText } from './share.js';
import { showEndScreen, closeEndScreen, endScreenOpen } from './endscreen.js';
import { audio } from './audio.js';
import { rng as makeRng, freshSeed } from '../../rng/rng.js';
import { game as catalogGame, featured as catalogGames, formatScore } from './catalog.js';
import { scoreDef, isBetter, levelFor, NATIVE_UNLOCK_LEVEL, nairobiDay, AWARDS } from './rules.js';
import { headerHtml, mountHeader, setHud, setSlim, setCoins } from './header.js';
import { starsFor, stripFor } from './results.js';
import { encodeChallenge, decodeChallenge, isChallengeId } from './codes.js';
import { threadDef, turnSeed, threadPath, TURNS } from './threads.js';
import * as TS from './thread-state.js';
import { showTurnCard, renderReceipt } from './thread-ui.js';
import { icon, colorOf, hudHtml, threadMark, notePlayedToday } from './screens.js';
import { claimSheet } from './claim.js';
import { prefetchGame } from './prefetch.js';

let M = null;                 // merged manifest (catalog + runtime hooks)
let playFn = null;
const pauseFns = new Set(), resumeFns = new Set(), quitFns = new Set(), forceFns = new Set();
let current = null;           // active Run
let lastCtx = null;           // context of the last play, for "Play again"
let challenge = null;         // challenge loaded from ?c=
let skin = null;              // brand skin for /b/<brand>/<slug>/
let paused = false;
let openedAt = performance.now();
let passMatch = null;         // { names, seed, variant, results, resolve }
let dailySeed = null;         // { day, seed } cached for offline
let thread = null;            // { id, turn } when this page plays a thread turn
let notice = null;            // a one-off message on the start screen (e.g. an unavailable challenge)
const $ = (s, el = document) => el.querySelector(s);

/* ======================= public API ======================= */
export function stage(def) {
  const cat = catalogGame(def.id) || {};
  M = { ...cat, ...def, score: { ...(cat.score || {}), ...(def.score || {}) }, variants: { ...(cat.variants || {}), ...(def.variants || {}) } };
  addStrings(cat.strings); addStrings(def.strings);
  const brand = location.pathname.match(/^\/b\/([a-z0-9-]+)\//);
  if (brand) M.brand = brand[1];
  buildChrome();
  boot().catch((e) => { console.error(e); showStart(); });
  return M;
}
export function onPlay(fn) { playFn = fn; }
export function onPause(fn) { pauseFns.add(fn); }
export function onResume(fn) { resumeFns.add(fn); }
export function onQuit(fn) { quitFns.add(fn); }
/** spec 2 §4 forceEnd(): the shell calls this at maxDurationSec; the game finishes at once with its current result. */
export function onForceEnd(fn) { forceFns.add(fn); }
export function pause() {
  if (paused || !current || current.done) return;
  paused = true;
  clock.pauseAt = performance.now();
  for (const fn of pauseFns) fn();
}
export function resume() {
  if (!paused) return;
  paused = false;
  if (clock.pauseAt) { clock.pausedMs += performance.now() - clock.pauseAt; clock.pauseAt = 0; }
  for (const fn of resumeFns) fn();
}
export const isPaused = () => paused;
export const manifest = () => M;
export const currentRun = () => current;

/* ======================= runs ======================= */
class Run {
  constructor(o) {
    Object.assign(this, o);
    this.rng = makeRng(this.seed);
    this.speed = this.assist ? 0.7 : 1;
    this.tunables = { ...(M.tunables || {}) };
    this.log = [];
    this.events = [];
    this.t0 = performance.now();
    this.startedAt = this.startedAt || Date.now();
    this.done = false;
    this._firstInput = false;
    this._firstAtom = false;
  }
  stream(name) { return makeRng(this.seed, name); }
  input(code, tick) {
    this.log.push([tick == null ? Math.round(performance.now() - this.t0) : tick, code]);
    if (!this._firstInput) this.firstInput();
  }
  firstInput() {
    if (this._firstInput) return;
    this._firstInput = true;
    track('run.first_input', { ms: Math.round(performance.now() - openedAt), mode: this.mode, variant: this.variant }, M.id);
  }
  firstAtom() {
    if (this._firstAtom) return;
    this._firstAtom = true;
    track('run.first_atom', { ms: Math.round(performance.now() - this.t0), mode: this.mode, variant: this.variant }, M.id);
  }
  event(name, props = {}) {
    this.events.push({ name, ...props });
    track('run.event', { name, ...props }, M.id);
  }
  finish(result) {
    if (this.done) return Promise.resolve();
    this.done = true;
    return onFinish(this, result || {});
  }
}

const localSeed = () => `${M.id}-${freshSeed()}`;
async function startRun(ctx = lastCtx || {}) {
  const mode = ctx.mode || 'solo';
  const variant = ctx.variant || 'classic';
  const assist = !!(prefs.assist && M.assist);
  const base = { game: M.id, mode, variant, assist, challenge: ctx.challenge || null, player: ctx.player || null, players: ctx.players || null, skin, ctx, duel: !!ctx.duel };
  if (ctx.local || mode === 'pass') {
    return new Run({ ...base, runId: 'L' + uuid(), seed: ctx.seed || localSeed(), local: true });
  }
  let th = null;
  if (mode === 'thread') {
    const s = TS.load(thread.id);
    th = { id: thread.id, turn: ctx.turn, attempt: s.attempt };
  }
  try {
    const res = await api('POST', '/run/start', { game: M.id, mode, variant, assist, challengeId: ctx.challenge ? ctx.challenge.id : undefined, thread: th || undefined }, { timeout: 6000 });
    return new Run({ ...base, runId: res.runId, seed: res.seed, startedAt: res.startedAt, counted: res.counted !== false, challenge: res.challenge ? { ...base.challenge, ...res.challenge } : base.challenge, thread: th });
  } catch (e) {
    if (!e.offline) {
      if (e.code === 'challenge_expired') toast(t('c_expired'));
      else if (e.code === 'challenge_hidden') toast(t('c_hidden'));
      else toast(t('error_generic'));
      throw e;
    }
    // offline: a thread turn and a challenge from its code still play, on the same seed (spec 2 §1.2, §5)
    if (mode === 'thread') return new Run({ ...base, runId: 'L' + uuid(), seed: turnSeed(threadDef(thread.id), M.id), local: true, thread: th });
    if (mode === 'h2h' && ctx.challenge && ctx.challenge.seed && ctx.challenge.kind === 'beat') {
      return new Run({ ...base, runId: 'L' + uuid(), seed: ctx.challenge.seed, variant: ctx.challenge.variant || variant, local: true });
    }
    if (['h2h', 'okoa', 'revive', 'turn'].includes(mode)) { toast(t('challenge_need_net')); throw e; }
    let seed = localSeed(), m = mode;
    if (mode === 'daily') {
      if (dailySeed && dailySeed.day === nairobiDay()) seed = dailySeed.seed;
      else { m = 'solo'; toast(t('offline')); }
    }
    return new Run({ ...base, mode: m, runId: 'L' + uuid(), seed, local: true });
  }
}

export const run = {
  async start(ctx) {
    const r = await startRun(ctx || lastCtx || {});
    current = r;
    paused = false;
    track('game_start', { game: M.id, mode: r.mode, from_link: r.challenge ? 1 : 0, variant: r.variant, assist: r.assist ? 1 : 0, local: r.local ? 1 : 0, duel: r.duel ? 1 : 0 }, M.id);
    showBeatTarget(r);
    if (r.variant === 'native') store.set('native:' + M.id, 1);
    setSlim(true);
    startClock(r);
    return r;
  },
  /** Rebuild a run that was started before a reload (no new server run; finish still goes to the same id). */
  resume(saved) {
    closeScreen();
    const r = new Run({ game: M.id, mode: saved.mode, variant: saved.variant, assist: !!saved.assist, challenge: saved.challenge || null,
      runId: saved.runId, seed: saved.seed, startedAt: saved.startedAt, local: String(saved.runId).startsWith('L'), skin, ctx: { mode: saved.mode, variant: saved.variant } });
    current = r;
    lastCtx = { mode: saved.mode === 'h2h' ? 'solo' : saved.mode, variant: saved.variant };
    paused = false;
    setSlim(true);
    track('run.resume', { mode: r.mode }, M.id);
    return r;
  },
  /** What a stage needs to save to resume later. */
  snapshot(r) {
    return { runId: r.runId, seed: r.seed, mode: r.mode, variant: r.variant, assist: r.assist, startedAt: r.startedAt, challenge: r.challenge ? { id: r.challenge.id, creator: r.challenge.creator, creatorScore: r.challenge.creatorScore } : null };
  },
};

/* ---------- the clock: maxDurationSec, then forceEnd (spec 2 §4) ---------- */
const clock = { timer: 0, pausedMs: 0, pauseAt: 0, el: null };
function startClock(r) {
  stopClock();
  const max = M.maxDurationSec;
  if (!max || ['okoa', 'turn', 'pass'].includes(r.mode) || !forceFns.size) return;
  clock.pausedMs = 0; clock.pauseAt = 0;
  clock.timer = setInterval(() => {
    if (r.done || r !== current) return stopClock();
    if (paused) return;
    const left = max - (performance.now() - r.t0 - clock.pausedMs) / 1000;
    if (left <= 10 && left > 0) {
      if (!clock.el) { clock.el = h('<div class="time-pill" role="timer" aria-live="off"></div>'); document.body.appendChild(clock.el); }
      clock.el.textContent = t('secs_left', { n: Math.ceil(left) });
    }
    if (left <= 0) {
      stopClock();
      track('run.force_end', { mode: r.mode, max }, M.id);
      for (const fn of forceFns) fn();
    }
  }, 250);
}
function stopClock() { clearInterval(clock.timer); clock.timer = 0; if (clock.el) { clock.el.remove(); clock.el = null; } }
// test hook for scripts/browser.mjs: what the clock does at maxDurationSec, without waiting a minute
if (typeof window !== 'undefined') window.__chezForceEnd = () => { stopClock(); for (const fn of forceFns) fn(); };

/* ======================= chrome ======================= */
let rail, main;
function buildChrome() {
  document.body.classList.add('chez-game');
  const st = document.getElementById('stage');
  st.classList.add('chez-stage');
  if (!st.getAttribute('aria-label')) st.setAttribute('aria-label', `${L(M.title)}. ${L(M.rule)}`);
  main = h('<div class="chez-main"></div>');
  st.replaceWith(main);
  main.appendChild(st);
  rail = h('<aside class="chez-rail" aria-label="Standings and challenge"></aside>');
  main.appendChild(rail);
  document.body.insertBefore(h(headerHtml()), main);
  // games skip drawing while a shell screen covers them (spec 2 §1.1: nothing competes with the end screen's first paint)
  const sync = () => document.body.classList.toggle('screen-open', !!document.querySelector('body > .screen'));
  new MutationObserver(sync).observe(document.body, { childList: true });
  mountHeader({ onHome: () => goHome('header'), menu: gameMenu });
  const skip = h(`<a class="skip" href="#stage">${esc(L(M.title))}</a>`);
  document.body.insertBefore(skip, document.body.firstChild);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !anySheetOpen() && current && !current.done && !$('.screen')) { e.preventDefault(); $('[data-menu]').click(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  onNet('me', updateTitle);
  updateTitle();
}
function updateTitle() {
  const title = skin && skin.copy && skin.copy.title ? skin.copy.title : L(M.title);
  document.title = `${title} · Chezable`;
  const me = cachedMe();
  setCoins(me && me.coins != null ? me.coins : 0);
}

function playerLevel() {
  const me = cachedMe();
  return me && me.xp != null ? levelFor(me.xp) : 1;
}
function nativeUnlocked() {
  return playerLevel() >= NATIVE_UNLOCK_LEVEL || player().cohort === 'native';
}
function defaultVariant() {
  if (!M.variants || !M.variants.native) return 'classic';
  const saved = store.get('variant:' + M.id);
  if (saved === 'native' && nativeUnlocked()) return 'native';
  if (saved === 'classic') return 'classic';
  return player().cohort === 'native' ? 'native' : 'classic';
}
function nativeDef() { return (M.variants && M.variants.native) || null; }
function modesFor(variant) {
  const nd = nativeDef();
  if (variant === 'native' && nd && nd.modes) return nd.modes;
  return M.modes || ['solo'];
}

/* ======================= boot ======================= */
async function boot() {
  // Chez.stage() runs before the game's own Chez.onPlay() line; wait a tick so a direct link
  // (?mode=daily, ?c=..., ?thread=...) never calls play() before the handler exists.
  await new Promise((r) => setTimeout(r, 0));
  openedAt = performance.now();
  track('stage.open', { brand: M.brand || undefined }, M.id);
  flush().catch(() => {});
  refreshMe().then(updateTitle).catch(() => {});
  if (M.brand) {
    try { skin = await (await fetch(`/g/${M.id}/skins/${M.brand}.json`)).json(); } catch (e) { skin = null; }
    updateTitle();
  }
  if ((M.modes || []).includes('daily')) {
    dailySeed = store.get('dailyseed:' + M.id);
    api('GET', '/daily/' + M.id, null, { auth: false }).then((d) => { dailySeed = d; store.set('dailyseed:' + M.id, d); }).catch(() => {});
  }
  const q = new URLSearchParams(location.search);
  if (q.get('thread')) return bootThread(q.get('thread'));
  const cid = q.get('c');
  if (cid) {
    const ok = await loadChallenge(cid);
    renderRail();
    if (ok) return showChallengeIntro();
  }
  renderRail();
  const direct = q.get('mode');
  if (direct === 'daily' && (M.modes || []).includes('daily')) return play({ mode: 'daily', variant: defaultVariant() });
  if (direct === 'duel' && (M.modes || []).includes('h2h')) return play({ mode: 'solo', variant: defaultVariant(), duel: true });
  if (M.resumable && M.resume && M.resume()) return; // the game resumed itself (e.g. a long turn-based run)
  showStart();
}

/**
 * ?c=<code>: the code itself carries the game, seed and score (spec 2 §1.2 step 5), so the challenge works even
 * if the creator's device never registered it. The server adds the challenger's name, if it answers within 3 s.
 */
async function loadChallenge(cid) {
  const isNew = !Object.keys(store.get('played', {})).length;
  track('challenge_opened', { code: cid, game: M.id, new_player: isNew ? 1 : 0 }, M.id);
  track('link_open', { code: cid, game: M.id }, M.id);
  const d = decodeChallenge(cid, catalogGames.map((g) => g.id).concat(M.id));
  const fromCode = d && d.game === M.id ? {
    id: cid, kind: d.kind, game: d.game, seed: d.seed, variant: d.variant, creatorScore: d.score, creator: { id: null, name: null },
    payload: d.level ? { level: d.level } : null, entries: [], fromCode: true,
  } : null;
  try {
    const c = await api('GET', '/challenge/' + encodeURIComponent(cid), null, { timeout: 3000 });
    if (c.hidden) { notice = t('c_hidden'); challenge = null; return false; }
    challenge = c;
    return true;
  } catch (e) {
    if (fromCode) { challenge = fromCode; return true; }
    notice = e.offline ? t('challenge_need_net') : t('c_hidden');
    challenge = null;
    return false;
  }
}

/* ======================= thread turns (spec 2 §5) ======================= */
function bootThread(id) {
  const def = threadDef(id);
  let s = def ? TS.load(id) : null;
  if (!def) { location.replace('/'); return; }
  if (!s) { location.replace(threadPath(id)); return; }
  const v = TS.view(s);
  if (v.done) { showReceiptHere(id); return; }
  if (def.games[v.next] !== M.id) { location.replace(TS.turnUrl(id, def.games[v.next])); return; }
  thread = { id };
  playTurn(v.next);
}
function playTurn(turn) {
  const s = TS.load(thread.id);
  if (!s) { location.href = '/'; return; }
  const v = TS.view(s);
  thread.turn = turn;
  setHud(hudHtml(v, 'play', turn));
  play({ mode: 'thread', variant: 'classic', turn });
}
function showReceiptHere(id, after = null) {
  closeScreen();
  const el = h('<div class="screen receipt-screen" role="dialog" aria-modal="true"><div class="screen-inner" data-inner></div></div>');
  document.body.appendChild(el);
  screenEl = el;
  renderReceipt($('[data-inner]', el), id, { after });
  const hd = $('h1', el);
  if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: true }); }
}

/* ======================= start screen (spec 2 §3.2) ======================= */
let screenEl = null;
function closeScreen() { if (screenEl) { screenEl.remove(); screenEl = null; } }

function bestFor(mode, variant) {
  const b = store.get('best:' + M.id, {});
  return b[`${mode}:${variant}`] || null;
}

function threadBar() {
  const going = TS.inProgress();
  const today = threadDef(TS.todayId());
  const ts = TS.load(today.id);
  let title, sub, href, games = today.games;
  if (going) {
    const v = TS.view(going);
    title = going.id === today.id ? t('thread_continue_today', { n: v.next + 1, m: TURNS }) : t('thread_continue_any', { n: v.next + 1, m: TURNS });
    sub = t('thread_desc_short'); href = TS.turnUrl(going.id, v.def.games[v.next]); games = v.def.games;
  } else if (ts && ts.status !== 'playing') {
    title = t('thread_play_anytime'); sub = t('thread_desc_short'); href = '/t/new?entry=start_bar';
  } else {
    title = t('thread_play_today'); sub = t('thread_desc_short'); href = threadPath(today.id) + '?entry=start_bar';
  }
  return `<a class="thread-bar" href="${esc(href)}"><span class="tb-mark">${threadMark(games, 30)}</span><span class="tb-text"><b>${esc(title)}</b><span>${esc(sub)}</span></span>
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;
}

function showStart() {
  closeScreen();
  closeEndScreen();
  setHud(null);
  setSlim(false);
  const variant = defaultVariant();
  const modes = modesFor(variant);
  const day = nairobiDay();
  const brandTitle = skin && skin.copy && skin.copy.title;
  const b = bestFor('solo', variant) || bestFor('daily', variant);
  const doneToday = store.get('daily:' + M.id) === day;
  const pills = [];
  if (modes.includes('solo')) pills.push(['solo', t('mode_solo')]);
  if ((M.modes || []).includes('h2h')) pills.push(['duel', t('mode_duel')]);
  if (modes.includes('daily')) pills.push(['daily', doneToday ? `${t('mode_daily')} ✓` : t('mode_daily')]);
  const dateTxt = new Date(Date.parse(day + 'T12:00:00Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^(\d+) (\w+)/, '$2 $1,');
  screenEl = h(`<div class="screen start-screen" style="--gc:${colorOf(M)}" role="dialog" aria-modal="true" aria-labelledby="ssTitle">
    <div class="start-main">
      ${icon(M, 96)}
      <h1 id="ssTitle" class="start-title">${esc(brandTitle || L(M.title))}</h1>
      <p class="start-tag">${esc(L(M.tagline) || L(M.rule))}</p>
      <p class="best-pill" data-best ${b ? '' : 'hidden'}>${b ? esc(t('your_best', { best: formatScore(M.id, b.mode || 'solo', b.score) })) : ''}</p>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
      <h2 class="choose">${esc(t('choose_play'))}</h2>
      <div class="mode-pills">${pills.map(([m, label]) => `<button class="pill-btn" data-mode="${m}">${esc(label)}</button>`).join('')}</div>
      ${!player().name ? `<button class="btn alt claim-btn" data-claim>${esc(t('claim_name'))}</button>` : ''}
      <p class="start-date">${esc(dateTxt)}</p>
    </div>
    ${M.brand ? '' : threadBar()}
  </div>`);
  notice = null;
  document.body.appendChild(screenEl);
  screenEl.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
    audio.ensure();
    const m = btn.dataset.mode;
    if (m === 'duel') return play({ mode: 'solo', variant, duel: true });
    play({ mode: m, variant });
  }));
  const cl = $('[data-claim]', screenEl);
  if (cl) cl.onclick = () => claimSheet('start_screen', () => cl.remove());
  $('[data-mode]', screenEl).focus({ preventScroll: true });
  // "· #1 this week", from the weekly board, if the server answers
  if (b && player().registered) {
    api('GET', `/top/${M.id}?board=week&mode=solo&variant=${variant}&limit=1`, null, { timeout: 4000 }).then((r) => {
      const el = screenEl && $('[data-best]', screenEl);
      if (el && r && r.me && r.me.rank) el.textContent = `${t('your_best', { best: formatScore(M.id, b.mode || 'solo', b.score) })} · ${t('rank_short_week', { n: r.me.rank })}`;
    }).catch(() => {});
  }
}

/* ---------- the game's own section of the menu: settings, how to play, variant, pass the phone ---------- */
function gameMenu() {
  const inRun = current && !current.done && !endScreenOpen();
  const nd = nativeDef();
  const variant = defaultVariant();
  if (inRun) pause();
  return {
    html: `<h3 class="menu-h">${esc(L(M.title))}</h3>
      ${inRun ? `<div class="stack"><button class="btn wide" data-m="resume">${esc(t('resume'))}</button><button class="btn alt wide" data-m="quit">${esc(t('quit_run'))}</button></div>` : ''}
      <label class="switch"><span>${esc(t('sound'))}</span><input type="checkbox" data-p="sound" ${prefs.sound ? 'checked' : ''}></label>
      <label class="switch"><span>${esc(t('haptics'))}</span><input type="checkbox" data-p="haptics" ${prefs.haptics ? 'checked' : ''}></label>
      <label class="switch"><span>${esc(t('reduced_motion'))}</span><input type="checkbox" data-p="reducedMotion" ${prefs.reducedMotion ? 'checked' : ''}></label>
      ${M.assist ? `<label class="switch"><span>${esc(t('assist'))}<br><small class="muted">${esc(t('assist_desc'))}</small></span><input type="checkbox" data-p="assist" ${prefs.assist ? 'checked' : ''} ${inRun ? 'disabled' : ''}></label>` : ''}
      ${nd && !inRun ? `<div class="field"><span>${esc(t('variant'))}</span><div class="seg" role="group" aria-label="${esc(t('variant'))}">
        <button type="button" data-variant="classic" aria-pressed="${variant === 'classic'}">${esc(t('variant_classic'))}</button>
        <button type="button" data-variant="native" aria-pressed="${variant === 'native'}">${esc(L(nd.label))}${nativeUnlocked() ? '' : ' 🔒'}</button></div>
        <small class="muted">${esc(L(nd.desc))}</small></div>` : ''}
      ${(M.modes || []).includes('pass') && !inRun ? `<button class="btn alt wide" data-m="pass">${esc(t('mode_pass'))}</button>` : ''}
      <details><summary class="summary">${esc(t('how_to_play'))}</summary>${howtoHtml()}</details>
      <details><summary class="summary">${esc(t('how_its_made'))}</summary>${madeHtml(variant)}</details>
      <a class="menu-link" href="/top/${M.id}"><span>${esc(t('leaderboard'))}: ${esc(L(M.title))}</span></a>`,
    onClose: () => resume(),
    bind(el, close) {
      el.addEventListener('change', (e) => {
        const p = e.target.dataset.p;
        if (!p) return;
        prefs.set(p, e.target.checked);
        if (p === 'assist' && e.target.checked) track('assist.enable', {}, M.id);
        if (p === 'sound') audio.ensure();
      });
      el.addEventListener('click', (e) => {
        const v = e.target.closest('[data-variant]');
        if (v) {
          if (v.dataset.variant === 'native' && !nativeUnlocked()) { toast(t('variant_native_locked')); return; }
          store.set('variant:' + M.id, v.dataset.variant);
          if (v.dataset.variant === 'native') track('native.enable', {}, M.id);
          el.querySelectorAll('[data-variant]').forEach((x) => x.setAttribute('aria-pressed', String(x === v)));
          if (screenEl && screenEl.classList.contains('start-screen')) showStart();
          return;
        }
        const b = e.target.closest('[data-m]');
        if (!b) return;
        if (b.dataset.m === 'resume') close();
        if (b.dataset.m === 'quit') { close(); quitRun(); }
        if (b.dataset.m === 'pass') { close(); startPass(defaultVariant()); }
      });
    },
  };
}
function quitRun() {
  hideBeatTarget(); stopClock();
  if (current) current.done = true;
  current = null; paused = false;
  setSlim(false);
  emit('quit');
  for (const fn of quitFns) fn();
  if (thread) { location.href = threadPath(thread.id); return; }
  challenge ? showChallengeIntro() : showStart();
}
export function showMenu() { showStart(); }

function howtoHtml() {
  const steps = (M.howto && M.howto.en) || [];
  return `<ol class="howto">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
}
function madeHtml(variant) {
  const v = (M.variants && M.variants[variant]) || {};
  const src = v.source ? `<p class="muted">${esc(L(v.source))}</p>` : '';
  return `<p class="muted">Chezability score: <b>${v.chezability ?? '–'}</b> / 6</p>
    <div class="notation" tabindex="0" aria-label="Notation">${esc(v.notation || '')}</div>${src}`;
}

/* ======================= challenge landing (spec v1 §B3, restyled) ======================= */
function showChallengeIntro() {
  closeScreen();
  setHud(null); setSlim(false);
  const c = challenge;
  const me = player();
  const name = c.creator && c.creator.name ? c.creator.name : t('anon');
  const mine = c.creator && c.creator.id && c.creator.id === me.id;
  const scoreTxt = formatScore(M.id, 'h2h', c.creatorScore);
  let title, body = '', accept = t('play'), mode = 'h2h';
  if (c.kind === 'revive') {
    if (mine) {
      const caught = (c.entries || []).some((e) => e.result === 'caught');
      title = caught ? t('ch_revived', { name: (c.entries.find((e) => e.result === 'caught') || {}).name || t('anon'), score: formatScore(M.id, 'solo', c.creatorScore) }) : t('c_yours');
      accept = caught && !c.continued ? t('ch_continue') : null;
      mode = 'revive';
    } else {
      title = t('c_revive_title', { name });
      body = t('c_revive_body', { name, score: formatScore(M.id, 'solo', c.creatorScore) });
      accept = t('c_revive_accept');
      mode = 'okoa';
    }
  } else if (c.kind === 'turn') {
    title = t('c_turn_title', { name });
    body = c.yourTurn ? t('c_turn_body') : t('c_turn_wait', { name: c.waitingOn || name });
    mode = 'turn';
  } else {
    title = mine ? t('c_yours') : t('c_beat_title', { name, score: scoreTxt, game: L(M.title) });
    body = mine ? '' : L(M.tagline) || L(M.rule);
    if (c.mine && c.mine.played) { body = t('c_already', { score: formatScore(M.id, 'h2h', c.mine.score) }); accept = t('c_practice'); }
  }
  if (c.expired) { body = t('c_expired'); accept = null; }
  screenEl = h(`<div class="screen start-screen" style="--gc:${colorOf(M)}" role="dialog" aria-modal="true" aria-labelledby="cTitle">
    <div class="start-main">
      ${icon(M, 96)}
      <p class="kicker">${esc(L(M.title))}</p>
      <h1 id="cTitle" class="start-title sm">${esc(title)}</h1>
      ${body ? `<p class="start-tag">${esc(body)}</p>` : ''}
      ${c.variant === 'native' && nativeDef() ? `<p class="best-pill">${esc(L(nativeDef().label))}</p>` : ''}
      <div class="mode-pills">
        ${accept && !(mine && c.kind === 'beat') ? `<button class="pill-btn big" data-accept>${esc(accept)}</button>` : ''}
        ${mine && c.kind === 'beat' ? `<button class="pill-btn" data-reshare>${esc(t('share'))}</button>` : ''}
        <button class="pill-btn alt" data-solo>${esc(t('mode_solo'))}</button>
      </div>
      <div class="text-links"><a href="/" data-home-link>${esc(t('home'))}</a></div>
    </div>
  </div>`);
  document.body.appendChild(screenEl);
  const a = $('[data-accept]', screenEl);
  if (a) a.addEventListener('click', () => {
    audio.ensure();
    if (mode === 'h2h' && !(c.mine && c.mine.played)) track('challenge_accept', { code: c.id, game: M.id }, M.id);
    play({ mode, variant: c.variant, challenge: c });
  });
  const rs = $('[data-reshare]', screenEl);
  if (rs) rs.addEventListener('click', () => shareNow({ text: challengeText(L(M.title), scoreTxt), url: `${location.origin}/c/${c.id}`, game: M.id, surface: 'landing' }));
  $('[data-solo]', screenEl).addEventListener('click', () => { challenge = null; history.replaceState(null, '', location.pathname); showStart(); });
  $('[data-home-link]', screenEl).addEventListener('click', (e) => { e.preventDefault(); goHome('intro'); });
  (a || $('[data-solo]', screenEl)).focus({ preventScroll: true });
}

/* ======================= play ======================= */
function play(ctx) {
  closeScreen();
  closeEndScreen();
  lastCtx = ctx;
  if (!playFn) { console.error('Stage has no onPlay handler'); return; }
  Promise.resolve(playFn({ ...ctx, assist: !!(prefs.assist && M.assist), skin, speed: prefs.assist && M.assist ? 0.7 : 1 })).catch((e) => {
    if (!e || (!e.offline && !e.status)) console.error(e);
    setSlim(false);
    if (thread) { location.href = threadPath(thread.id); return; }
    showStart();
  });
}

/* ---------- pass the phone ---------- */
async function askNames() {
  const saved = store.get('passnames', []);
  const s = sheet(`<h2 class="sheet-title">${esc(t('players_names'))}</h2>
    <div class="field"><label for="pn1">${esc(t('player_n', { n: 1 }))}</label><input id="pn1" maxlength="14" autocomplete="off" value="${esc(saved[0] || '')}"></div>
    <div class="field"><label for="pn2">${esc(t('player_n', { n: 2 }))}</label><input id="pn2" maxlength="14" autocomplete="off" value="${esc(saved[1] || '')}"></div>
    <button class="btn wide" data-go>${esc(t('start_match'))}</button>
    <button class="btn alt wide" data-x>${esc(t('cancel'))}</button>`, { label: t('players_names') });
  $('[data-x]', s.el).onclick = () => s.close(null);
  $('[data-go]', s.el).onclick = () => {
    const a = $('#pn1', s.el).value.trim() || t('player_n', { n: 1 });
    const b = $('#pn2', s.el).value.trim() || t('player_n', { n: 2 });
    store.set('passnames', [a, b]);
    s.close([a, b]);
  };
  return s.done;
}
function passOverlay(name, sub) {
  return new Promise((res) => {
    const o = h(`<div class="overlay show" role="dialog" aria-modal="true"><div class="card center">
      <h2 class="sheet-title">${esc(t('pass_to', { name }))}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}
      <button class="btn wide">${esc(t('im_ready'))}</button></div></div>`);
    document.body.appendChild(o);
    const b = $('button', o);
    b.focus({ preventScroll: true });
    b.onclick = () => { audio.ensure(); o.remove(); res(); };
  });
}
async function startPass(variant) {
  const names = await askNames();
  if (!names) return showStart();
  closeScreen();
  const nd = nativeDef();
  if (M.passCustom || (variant === 'native' && nd && nd.passCustom)) {
    lastCtx = { mode: 'pass', variant, players: names };
    passMatch = { custom: true, names, variant };
    return play(lastCtx);
  }
  const seed = localSeed();
  passMatch = { names, seed, variant, results: [], startedAt: Date.now() };
  for (let i = 0; i < names.length; i++) {
    await passOverlay(names[i], `${L(M.title)} · ${i + 1}/${names.length}`);
    const result = await new Promise((resolve) => {
      passMatch.resolve = resolve;
      lastCtx = { mode: 'pass', variant, seed, player: { name: names[i], index: i } };
      play(lastCtx);
    });
    passMatch.results.push({ name: names[i], ...result });
  }
  const pm = passMatch;
  passMatch = null;
  showPassResults(pm);
}
function showPassResults(pm) {
  const def = scoreDef(M, 'pass');
  const rows = pm.results.map((r) => ({ name: r.name, score: r.score, tiebreak: r.tiebreak }));
  return passResultSheet(rows, def, pm);
}
function passResultSheet(rows, def, pm) {
  setSlim(false);
  const sorted = rows.slice().sort((a, b) => {
    const d = def.order === 'asc' ? a.score - b.score : b.score - a.score;
    return d || (a.tiebreak ?? 0) - (b.tiebreak ?? 0);
  });
  const tie = sorted.length > 1 && sorted[0].score === sorted[1].score && (sorted[0].tiebreak ?? 0) === (sorted[1].tiebreak ?? 0);
  const winner = tie ? null : sorted[0];
  const head = winner ? t('wins', { name: winner.name }) : t('draw');
  announce(head);
  // one ledger run for the match (pass runs earn run.finished only; no boards, no guest XP)
  const body = { runId: 'L' + uuid(), local: { game: M.id, mode: 'pass', variant: pm.variant, seed: pm.seed || 'pass', startedAt: pm.startedAt || Date.now() - 60000 },
    score: winner ? winner.score : sorted[0].score, detail: { players: rows }, finishedAt: Date.now() };
  sendQueued('POST', '/run/finish', body).then(applyEarnings).catch(() => {});
  track('run.finish', { mode: 'pass', variant: pm.variant }, M.id);
  const s = sheet(`<h2 class="result-label sm">${esc(head)}</h2>
    <div class="rows">${rows.map((r) => `<div class="row ${winner && r === winner ? 'win' : ''}"><span>${esc(r.name)}</span><b>${esc(formatScore(M.id, 'pass', r.score))}</b></div>`).join('')}</div>
    <div class="stack">
      <button class="btn wide" data-a="rematch">${esc(t('rematch'))}</button>
      <button class="btn alt wide" data-a="share">${esc(t('share'))}</button>
      <button class="btn alt wide" data-a="menu">${esc(t('back'))}</button>
      <a class="btn alt wide" href="/" data-a="home">${esc(t('home'))}</a>
    </div>`, { label: head, locked: true });
  s.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'rematch') { s.close(); rematch(pm); }
    if (a.dataset.a === 'home') { e.preventDefault(); s.close(); goHome('passphone'); }
    if (a.dataset.a === 'menu') { s.close(); showStart(); }
    if (a.dataset.a === 'share') {
      const text = `${L(M.title)}: ${rows.map((r) => `${r.name} ${formatScore(M.id, 'pass', r.score)}`).join(' · ')}. ${head}.`;
      share({ text, url: `${location.origin}/g/${M.id}/`, game: M.id, surface: 'pass' });
    }
  });
}
async function rematch(pm) {
  const names = pm.names.slice().reverse();
  store.set('passnames', names);
  if (pm.custom) {
    passMatch = { custom: true, names, variant: pm.variant };
    lastCtx = { mode: 'pass', variant: pm.variant, players: names };
    return play(lastCtx);
  }
  const seed = localSeed();
  passMatch = { names, seed, variant: pm.variant, results: [], startedAt: Date.now() };
  for (let i = 0; i < names.length; i++) {
    await passOverlay(names[i], `${L(M.title)} · ${i + 1}/${names.length}`);
    const result = await new Promise((resolve) => {
      passMatch.resolve = resolve;
      lastCtx = { mode: 'pass', variant: pm.variant, seed, player: { name: names[i], index: i } };
      play(lastCtx);
    });
    passMatch.results.push({ name: names[i], ...result });
  }
  const done = passMatch; passMatch = null;
  showPassResults(done);
}

/* ======================= finish: GameResult → end screen at once ======================= */
function recordLocalBest(r, R) {
  const played = store.get('played', {});
  played[M.id] = (played[M.id] || 0) + 1;
  store.set('played', played);
  notePlayedToday(M.id);
  if (r.mode === 'daily') store.set('daily:' + M.id, nairobiDay());
  if (['pass', 'okoa', 'turn', 'thread'].includes(r.mode) || R.score == null || R.stars === 0) return false;
  const def = scoreDef(M, r.mode);
  const key = `${r.mode === 'revive' ? 'solo' : r.mode}:${r.variant}${r.assist ? ':assist' : ''}`;
  const b = store.get('best:' + M.id, {});
  const prev = b[key];
  const pb = isBetter(def, R.score, prev ? prev.score : null);
  if (pb) { b[key] = { score: R.score, at: Date.now(), mode: r.mode }; store.set('best:' + M.id, b); }
  return pb && prev != null ? true : pb ? 'first' : false;
}

/** Complete the game's result into the spec's GameResult. */
function toGameResult(r, result, durationMs) {
  const detail = result.detail || {};
  const stars = result.stars !== undefined ? result.stars : starsFor(M, result.score, detail);
  const strip = result.strip || stripFor(M, result.score, detail, stars);
  const scoreLabel = result.scoreLabel || result.display || formatScore(M.id, r.mode, result.score);
  return { ...result, gameSlug: M.id, seed: r.seed, score: result.score, scoreLabel, stars, strip, durationMs,
    bestPossible: result.bestPossible ?? (detail.par != null ? detail.par : undefined) };
}

/** What the run probably earned, shown at once; the server's figures replace it when they arrive. */
function estimate(r, R, localPb, firstPlay) {
  if (['pass', 'okoa'].includes(r.mode)) return { xp: 0, coins: 0 };
  const add = (k, o) => { o.xp += AWARDS[k].xp; o.coins += AWARDS[k].coins; };
  const o = { xp: 0, coins: 0 };
  add('run.finished', o);
  if (firstPlay) add('stage.first_play', o);
  if (localPb === true) add('run.personal_best', o);
  if (r.mode === 'h2h' && r.counted !== false) add('h2h.played', o);
  return o;
}

async function onFinish(r, result) {
  const endedAt = performance.now();
  const durationMs = Math.round(endedAt - r.t0);
  stopClock();
  setSlim(false);
  // custom pass match (Kati): game reports all players
  if (r.mode === 'pass' && passMatch && passMatch.custom) {
    const pm = passMatch; passMatch = null;
    const rows = (result.detail && result.detail.players) || [];
    return passResultSheet(rows, scoreDef(M, 'pass'), { ...pm, seed: r.seed, startedAt: r.startedAt });
  }
  if (r.mode === 'pass' && passMatch && passMatch.resolve) {
    const res = passMatch.resolve; passMatch.resolve = null;
    announce(`${r.player ? r.player.name : ''}: ${formatScore(M.id, 'pass', result.score)}`);
    return res({ score: result.score, tiebreak: result.tiebreak, detail: result.detail });
  }
  hideBeatTarget();
  const firstPlay = !(store.get('played', {})[M.id]);
  performance.mark('chez:finish');
  const R = toGameResult(r, result, durationMs);
  const localPb = recordLocalBest(r, R);
  const est = estimate(r, R, localPb, firstPlay);
  R.coinsEarned = est.coins; R.xpEarned = est.xp;
  track('run.finish', { mode: r.mode, variant: r.variant, assist: r.assist ? 1 : 0, score: R.score, stars: R.stars, ms: durationMs }, M.id);

  if (r.mode === 'thread' && thread) return finishTurn(r, R, est, endedAt);

  const sh = challengeShare(r, R);
  let es = null;
  if (!result.noSheet) {
    es = showEndScreen({
      M, run: r, result: R, localPb, est, share: sh, duel: r.duel, offline: r.local && navigator.onLine === false,
      playAgain: () => playAgainFrom(r, R),
      goHome, extraActions: result.actions || [], prefetch: prefetchGame,
    });
    performance.mark('chez:shown');
    paintTime(endedAt, 'end_screen');
    track('game_end', { game: M.id, score: R.score, stars: R.stars, duration: durationMs, mode: r.mode }, M.id);
  }
  // in the background: the result (queued first, so it survives leaving the page), then the challenge code
  return submit(r, R, sh, es);
}

function playAgainFrom(r, R) {
  const ctx = { ...(r.ctx || lastCtx || {}) };
  if (['revive', 'okoa', 'h2h'].includes(ctx.mode)) { challenge = null; ctx.mode = 'solo'; ctx.challenge = null; history.replaceState(null, '', location.pathname); }
  if (R.againCtx) Object.assign(ctx, R.againCtx);
  play(ctx);
}

/** spec 2 §1.1: log how long from the game ending to the end screen's first paint. */
function paintTime(endedAt, surface) {
  // build: our own work, from the game's result to the screen in the page; ms: to the first paint after it
  const build = Math.round(performance.now() - endedAt);
  requestAnimationFrame(() => setTimeout(() => {
    track('end_screen_render_ms', { game: M.id, ms: Math.round(performance.now() - endedAt), build, surface }, M.id);
  }, 0));
}

async function finishBody(r, R) {
  let inputHash = null;
  try { inputHash = r.log.length ? await sha256Hex(JSON.stringify(r.log)) : null; } catch (e) {}
  const detail = { ...(R.detail || {}), events: r.events.length ? r.events.slice(0, 20) : undefined, brand: M.brand || undefined };
  const body = { runId: r.runId, score: R.score, tiebreak: R.tiebreak, detail, inputHash, durationMs: R.durationMs, finishedAt: Date.now() };
  if (r.local) {
    body.local = { game: M.id, mode: r.mode, variant: r.variant, assist: r.assist, seed: r.seed, startedAt: r.startedAt };
    if (r.mode === 'h2h' && r.challenge) body.local.challengeId = r.challenge.id;
    if (r.thread) body.local.thread = r.thread;
  }
  if (R.ghost) body.ghost = R.ghost;
  return body;
}

async function submit(r, R, sh, es) {
  const body = await finishBody(r, R);
  let settled = false;
  const timer = setTimeout(() => { if (!settled && es) es.giveUp(); }, 5000);
  const sending = sendQueued('POST', '/run/finish', body);
  // the challenge registration goes in the queue right behind the result, so it never arrives first
  if (sh) enqueue('/challenges/' + sh.code, { runId: r.runId, payload: sh.payload }, 'PUT');
  let res = null;
  try {
    res = await sending;
    applyEarnings(res);
    if (es) es.update(res);
  } catch (e) {
    if (es) es.giveUp();
  } finally { settled = true; clearTimeout(timer); }
  r.server = res;
  if (sh) flush().catch(() => {});
  renderRail();
  return res;
}

/** The challenge link for a run, made on the device before any tap (spec 2 §1.2). */
function challengeShare(r, R, kind = 'beat') {
  if (!(M.modes || []).includes('h2h') || ['pass', 'okoa', 'turn', 'revive'].includes(r.mode) || M.challengeSetup) return null;
  if (R.stars === 0 && M.levels) return null; // an unsolved puzzle board isn't a challenge
  const pl = M.challengePayload ? M.challengePayload(r, R) : null;
  const level = (pl && pl.level) || (r.challenge && r.challenge.payload && r.challenge.payload.level) || null;
  const score = pl && typeof pl.h2hScore === 'number' ? pl.h2hScore : R.score;
  if (score == null) return null;
  const code = encodeChallenge({ game: M.id, seed: r.seed, score, level, variant: r.variant, kind });
  const label = pl && typeof pl.h2hScore === 'number' ? formatScore(M.id, 'h2h', pl.h2hScore) : R.scoreLabel;
  return { code, url: `${location.origin}/c/${code}`, title: 'Chezable', text: challengeText(L(M.title), label), payload: pl || undefined };
}

/**
 * Stage-made challenges (Nyanya's rescue link): the code is made now, the share sheet opens in this same tap,
 * and the registration follows in the queue. Call it from a click handler.
 */
export function createChallenge(r, result, scoreTxt, { kind = 'beat', payload } = {}) {
  const R = { ...result, scoreLabel: scoreTxt, score: kind === 'revive' && payload && payload.dist != null ? payload.dist : result.score };
  const code = encodeChallenge({ game: M.id, seed: r.seed, score: R.score, variant: r.variant, kind });
  const url = `${location.origin}/c/${code}`;
  enqueue('/challenges/' + code, { runId: r.runId, payload }, 'PUT');
  flush().catch(() => {});
  const text = kind === 'revive' ? (result.reviveText || t('c_revive_title', { name: player().name || t('anon') })) : challengeText(L(M.title), scoreTxt);
  shareNow({ text, url, game: M.id, surface: kind === 'revive' ? 'rescue' : 'end_screen' });
  return { id: code, url };
}

/* ---------- a thread turn's end: the turn card, or the receipt after the last turn (spec 2 §5.5, §5.6) ---------- */
async function finishTurn(r, R, est, endedAt) {
  const turn = thread.turn;
  const v = TS.addRun(thread.id, { turn, game: M.id, runId: r.runId, score: R.score, scoreLabel: R.scoreLabel, stars: R.stars ?? 0, strip: R.strip, durationMs: R.durationMs, coins: est.coins, xp: est.xp });
  if (!v) { location.href = '/'; return; }
  const body = await finishBody(r, R);
  const sending = sendQueued('POST', '/run/finish', body).then((res) => { applyEarnings(res); return res; });
  if (v.done) {
    // the receipt shows now; it sends the thread's result once this turn's run is in
    showReceiptHere(thread.id, sending);
    paintTime(endedAt, 'receipt');
  } else {
    showTurnCard(v, { turn, game: M.id, scoreLabel: R.scoreLabel, stars: R.stars ?? 0, strip: R.strip, coins: est.coins, xp: est.xp },
      { onRetry: () => playTurn(turn), goHome: () => goHome('thread') });
    paintTime(endedAt, 'turn_card');
  }
  return sending.catch(() => null);
}

/* ======================= side rail (wide screens) ======================= */
async function renderRail() {
  if (!rail || getComputedStyle(rail).display === 'none') return;
  const mode = 'solo';
  let html = `<div class="card"><h2>${esc(t('standings'))} · ${esc(t('lb_week'))}</h2><div class="rows" data-top><p class="muted">${esc(t('loading'))}</p></div>
    <a class="btn alt small" href="/top/${M.id}">${esc(t('standings'))}</a></div>`;
  if (challenge && challenge.kind === 'beat') {
    html += `<div class="card"><h2>${esc(t('mode_h2h'))}</h2><p><b>${esc((challenge.creator && challenge.creator.name) || t('anon'))}</b>: ${esc(formatScore(M.id, 'h2h', challenge.creatorScore))}</p></div>`;
  }
  rail.innerHTML = html;
  try {
    const top = await api('GET', `/top/${M.id}?board=week&mode=${mode}&variant=classic&limit=5`, null, { auth: false });
    const rows = (top.rows || []).slice(0, 5);
    $('[data-top]', rail).innerHTML = rows.length
      ? rows.map((x) => `<div class="row"><span>#${x.rank} ${esc(x.name || t('guest'))}</span><b>${esc(formatScore(M.id, mode, x.score))}</b></div>`).join('')
      : `<p class="muted">${esc(t('lb_empty'))}</p>`;
  } catch (e) {
    $('[data-top]', rail).innerHTML = `<p class="muted">${esc(t('offline'))}</p>`;
  }
}
addEventListener('resize', () => { if (rail && !rail.innerHTML) renderRail(); });

/* ======================= Home + beat target ======================= */
/** Home from anywhere. Mid-run it asks first; otherwise it just goes. */
export function goHome(from) {
  const go = () => { track('home_tap', { from }, M.id); flushEventsNow(); location.href = '/'; };
  const inRun = current && !current.done && !endScreenOpen() && !screenEl;
  if (!inRun) return go();
  pause();
  const s = sheet(`<h2 class="sheet-title">${esc(t('leave_title'))}</h2><p class="muted">${esc(t('leave_body'))}</p>
    <div class="stack"><button class="btn wide" data-keep>${esc(t('keep_playing'))}</button><button class="btn alt wide" data-leave>${esc(t('leave_yes'))}</button></div>`,
    { label: t('leave_title'), onClose: (v) => { if (v !== 'leave') resume(); } });
  $('[data-keep]', s.el).onclick = () => s.close('keep');
  $('[data-leave]', s.el).onclick = () => { s.close('leave'); go(); };
}

let beatEl = null;
function showBeatTarget(r) {
  hideBeatTarget();
  if (r.mode !== 'h2h' || !r.challenge || r.challenge.creatorScore == null) return;
  beatEl = h(`<div class="beat-pill" role="status">${esc(t('beat_target', { score: formatScore(M.id, 'h2h', r.challenge.creatorScore) }))}</div>`);
  document.body.appendChild(beatEl);
}
function hideBeatTarget() { if (beatEl) { beatEl.remove(); beatEl = null; } }
