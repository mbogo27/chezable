// Stage runtime (spec §4.1): the shell chrome around a game, the run lifecycle, the result sheet,
// challenges (§5.3), pass the phone (§5.4), dailies (§5.2), Native variants (§8) and Assist mode (§9.4).
import * as store from './store.js';
import { prefs } from './prefs.js';
import { t, L, addStrings } from './i18n.js';
import { api, track, enqueue, flush, cachedMe, refreshMe, applyEarnings, player, on as onNet, sha256Hex, uuid, emit } from './net.js';
import { esc, h, toast, announce, sheet, anySheetOpen } from './ui.js';
import { share, shareOptions } from './share.js';
import { showEndScreen, closeEndScreen, endScreenOpen } from './endscreen.js';
import { audio } from './audio.js';
import { rng as makeRng, freshSeed } from '../../rng/rng.js';
import { game as catalogGame, featured as catalogGames, formatScore } from './catalog.js';
import { scoreDef, isBetter, levelFor, NATIVE_UNLOCK_LEVEL, nairobiDay } from './rules.js';
import { logoMarkSvg } from './logo.js';

let M = null;                 // merged manifest (catalog + runtime hooks)
let playFn = null, pauseFns = new Set(), resumeFns = new Set();
let current = null;           // active Run
let lastCtx = null;           // context of the last play, for "Play again"
let challenge = null;         // challenge loaded from ?c=
let skin = null;              // brand skin for /b/<brand>/<slug>/
let paused = false;
let openedAt = performance.now();
let passMatch = null;         // { names, seed, variant, results, resolve }
let dailySeed = null;         // { day, seed } cached for offline
const $ = (s, el = document) => el.querySelector(s);

/* ======================= public API ======================= */
export function stage(def) {
  const cat = catalogGame(def.id) || {};
  M = { ...cat, ...def, score: { ...(cat.score || {}), ...(def.score || {}) }, variants: { ...(cat.variants || {}), ...(def.variants || {}) } };
  addStrings(cat.strings); addStrings(def.strings);
  const brand = location.pathname.match(/^\/b\/([a-z0-9-]+)\//);
  if (brand) M.brand = brand[1];
  buildChrome();
  boot().catch((e) => { console.error(e); showIntro(); });
  return M;
}
export function onPlay(fn) { playFn = fn; }
export function onPause(fn) { pauseFns.add(fn); }
export function onResume(fn) { resumeFns.add(fn); }
export function pause() {
  if (paused || !current || current.done) return;
  paused = true;
  for (const fn of pauseFns) fn();
}
export function resume() {
  if (!paused) return;
  paused = false;
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

async function startRun(ctx = lastCtx || {}) {
  const mode = ctx.mode || 'solo';
  const variant = ctx.variant || 'classic';
  const assist = !!(prefs.assist && M.assist);
  const base = { game: M.id, mode, variant, assist, challenge: ctx.challenge || null, player: ctx.player || null, players: ctx.players || null, skin, ctx };
  if (ctx.local || mode === 'pass') {
    return new Run({ ...base, runId: 'L' + uuid(), seed: ctx.seed || freshSeed(), local: true });
  }
  try {
    const res = await api('POST', '/run/start', { game: M.id, mode, variant, assist, challengeId: ctx.challenge ? ctx.challenge.id : undefined });
    return new Run({ ...base, runId: res.runId, seed: res.seed, startedAt: res.startedAt, counted: res.counted !== false, challenge: res.challenge || base.challenge });
  } catch (e) {
    if (!e.offline) {
      if (e.code === 'challenge_expired') toast(t('c_expired'));
      else toast(t('error_generic'));
      throw e;
    }
    if (['h2h', 'okoa', 'revive', 'turn'].includes(mode)) { toast(t('challenge_need_net')); throw e; }
    let seed = freshSeed(), m = mode;
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
    track('game_start', { game: M.id, mode: r.mode, from_link: r.challenge ? 1 : 0, variant: r.variant, assist: r.assist ? 1 : 0, local: r.local ? 1 : 0 }, M.id);
    showBeatTarget(r);
    if (r.variant === 'native') store.set('native:' + M.id, 1);
    updateBar();
    return r;
  },
  /** Rebuild a run that was started before a reload (no new server run; finish still goes to the same id). */
  resume(saved) {
    closeIntro();
    const r = new Run({ game: M.id, mode: saved.mode, variant: saved.variant, assist: !!saved.assist, challenge: saved.challenge || null,
      runId: saved.runId, seed: saved.seed, startedAt: saved.startedAt, local: String(saved.runId).startsWith('L'), skin, ctx: { mode: saved.mode, variant: saved.variant } });
    current = r;
    lastCtx = { mode: saved.mode === 'h2h' ? 'solo' : saved.mode, variant: saved.variant };
    paused = false;
    track('run.resume', { mode: r.mode }, M.id);
    return r;
  },
  /** What a stage needs to save to resume later. */
  snapshot(r) {
    return { runId: r.runId, seed: r.seed, mode: r.mode, variant: r.variant, assist: r.assist, startedAt: r.startedAt, challenge: r.challenge ? { id: r.challenge.id, creator: r.challenge.creator, creatorScore: r.challenge.creatorScore } : null };
  },
};

/* ======================= chrome ======================= */
let bar, rail, main;
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
  bar = h(`<header class="chez-bar">
      <a class="home-btn" href="/" data-home>${logoMarkSvg}<span>${esc(t('home'))}</span></a>
      <h1 class="title"></h1>
      <a class="coins" href="/me" aria-label="${esc(t('coins'))}"><img class="coin" src="/icons/coin.svg" alt="" width="20" height="20"><span data-coins>0</span></a>
      <button class="icon-btn" data-menu aria-label="${esc(t('menu'))}" aria-haspopup="dialog">${menuSvg}</button>
    </header>`);
  document.body.insertBefore(bar, main);
  const skip = h(`<a class="skip" href="#stage">${esc(L(M.title))}</a>`);
  document.body.insertBefore(skip, bar);
  $('[data-menu]', bar).addEventListener('click', openMenu);
  $('[data-home]', bar).addEventListener('click', (e) => { e.preventDefault(); goHome('gamebar'); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !anySheetOpen() && !$('.overlay.show')) { e.preventDefault(); openMenu(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  onNet('me', updateBar);
  updateBar();
}
const menuSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

function updateBar() {
  if (!bar) return;
  const title = skin && skin.copy && skin.copy.title ? skin.copy.title : L(M.title);
  $('.title', bar).textContent = title;
  document.title = `${title} · Chezable`;
  const me = cachedMe();
  $('[data-coins]', bar).textContent = me && me.coins != null ? me.coins : '0';
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
  // (?mode=daily, ?c=...) never calls play() before the handler exists.
  await new Promise((r) => setTimeout(r, 0));
  openedAt = performance.now();
  track('stage.open', { brand: M.brand || undefined }, M.id);
  flush().catch(() => {});
  refreshMe().then(updateBar).catch(() => {});
  if (M.brand) {
    try { skin = await (await fetch(`/g/${M.id}/skins/${M.brand}.json`)).json(); } catch (e) { skin = null; }
    updateBar();
  }
  if ((M.modes || []).includes('daily')) {
    dailySeed = store.get('dailyseed:' + M.id);
    api('GET', '/daily/' + M.id, null, { auth: false }).then((d) => { dailySeed = d; store.set('dailyseed:' + M.id, d); }).catch(() => {});
  }
  const q = new URLSearchParams(location.search);
  const cid = q.get('c');
  if (cid) {
    track('link_open', { code: cid, game: M.id }, M.id);
    try {
      challenge = await api('GET', '/challenge/' + encodeURIComponent(cid));
      if (challenge.hidden) { challenge = null; notice = t('c_hidden'); }
    } catch (e) {
      notice = e.offline ? t('challenge_need_net') : t('c_hidden');
      challenge = null;
    }
  }
  renderRail();
  const direct = q.get('mode');
  if (challenge) return showChallengeIntro();
  if (direct === 'daily' && (M.modes || []).includes('daily')) return play({ mode: 'daily', variant: defaultVariant() });
  if (M.resumable && M.resume && M.resume()) return; // the game resumed itself (e.g. a long turn-based run)
  showIntro();
}

/* ======================= intro card ======================= */
let introEl = null;
let notice = null; // one-off friendly message on the intro card (e.g. an unavailable challenge link)
function closeIntro() { if (introEl) { introEl.remove(); introEl = null; } }

function bestFor(mode, variant) {
  const b = store.get('best:' + M.id, {});
  return b[`${mode}:${variant}`] || null;
}

function showIntro() {
  closeIntro();
  let variant = defaultVariant();
  const nd = nativeDef();
  const day = nairobiDay();
  const brandTitle = skin && skin.copy && skin.copy.title;
  introEl = h(`<div class="overlay show" role="dialog" aria-modal="true" aria-labelledby="introTitle"><div class="card intro">
      <div class="title-plank"><span class="outline" id="introTitle">${esc(brandTitle || L(M.title))}</span></div>
      <p style="font-size:17px;font-weight:600">${esc(L(M.rule))}</p>
      ${nd ? `<div class="variant-row">
        <div class="seg" role="group" aria-label="Variant">
          <button type="button" data-variant="classic">${esc(t('variant_classic'))}</button>
          <button type="button" data-variant="native">${esc(L(nd.label))}${nativeUnlocked() ? '' : ' 🔒'}</button>
        </div>
        <p class="variant-note" data-vnote></p>
      </div>` : ''}
      <div class="modes" data-modes></div>
      ${M.assist ? `<label class="switch"><span>${esc(t('assist'))}<br><small class="muted" style="font-weight:600">${esc(t('assist_desc'))}</small></span><input type="checkbox" data-assist ${prefs.assist ? 'checked' : ''}></label>` : ''}
      <p class="muted" data-best style="margin:0"></p>
      <details><summary style="cursor:pointer;font-weight:700;min-height:32px">${esc(t('how_to_play'))}</summary>${howtoHtml()}</details>
      <details><summary style="cursor:pointer;font-weight:700;min-height:32px">${esc(t('how_its_made'))}</summary><div data-made></div></details>
      <div class="intro-foot"><a class="es-link" href="/top/${M.id}">${esc(t('leaderboard'))}</a><a class="es-link" href="/" data-home-link>${esc(t('home'))}</a></div>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
    </div></div>`);
  document.body.appendChild(introEl);
  $('[data-home-link]', introEl).addEventListener('click', (e) => { e.preventDefault(); goHome('intro'); });
  notice = null;

  function paint() {
    introEl.querySelectorAll('[data-variant]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === variant)));
    const vnote = $('[data-vnote]', introEl);
    if (vnote) vnote.textContent = variant === 'native' ? `${L(nd.desc)} ${t('variant_native_note', { source: L(nd.source) })}` : '';
    const modes = modesFor(variant);
    const box = $('[data-modes]', introEl);
    box.innerHTML = '';
    const add = (mode, label, desc, primary) => {
      const b = h(`<button class="btn ${primary ? '' : 'alt'} wide" data-mode="${mode}">${esc(label)}</button>`);
      b.addEventListener('click', () => {
        audio.ensure();
        if (mode === 'pass') return startPass(variant);
        play({ mode, variant });
      });
      box.appendChild(b);
      if (desc) box.appendChild(h(`<p class="variant-note" style="margin:-4px 0 2px">${esc(desc)}</p>`));
    };
    let first = true;
    if (modes.includes('solo')) { add('solo', t('play'), '', first); first = false; }
    if (modes.includes('daily')) {
      const doneToday = store.get('daily:' + M.id) === day;
      add('daily', `${t('mode_daily')} · ${t('today')}${doneToday ? ' ✓' : ''}`, doneToday ? t('daily_done') : t('mode_daily_desc'), first); first = false;
    }
    if (modes.includes('pass')) { add('pass', t('mode_pass'), t('mode_pass_desc'), first); first = false; }
    if (M.turnBased) { add('turn', t('turn_link'), t('turn_link_desc'), first); first = false; }
    const b = bestFor('solo', variant) || bestFor('daily', variant);
    $('[data-best]', introEl).textContent = b ? t('result_best', { best: formatScore(M.id, b.mode || 'solo', b.score) }) : '';
    $('[data-made]', introEl).innerHTML = madeHtml(variant);
    const f = $('[data-mode]', introEl);
    if (f) f.focus({ preventScroll: true });
  }
  introEl.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.variant === 'native' && !nativeUnlocked()) { toast(t('variant_native_locked')); return; }
    variant = b.dataset.variant;
    store.set('variant:' + M.id, variant);
    if (variant === 'native') track('native.enable', {}, M.id);
    paint();
  }));
  const as = $('[data-assist]', introEl);
  if (as) as.addEventListener('change', () => { prefs.set('assist', as.checked); if (as.checked) track('assist.enable', {}, M.id); });
  paint();
}

function howtoHtml() {
  const steps = (M.howto && M.howto.en) || [];
  return `<ol class="howto" style="margin-top:8px">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
}
function madeHtml(variant) {
  const v = (M.variants && M.variants[variant]) || {};
  const src = v.source ? `<p class="muted" style="margin:6px 0 0">${esc(L(v.source))}</p>` : '';
  return `<p class="muted" style="margin:8px 0 6px">Chezability score: <b>${v.chezability ?? '–'}</b> / 6</p>
    <div class="notation" tabindex="0" aria-label="Notation">${esc(v.notation || '')}</div>${src}`;
}

/* ======================= challenge intro ======================= */
function showChallengeIntro() {
  closeIntro();
  const c = challenge;
  const me = player();
  const name = c.creator && c.creator.name ? c.creator.name : t('anon');
  const mine = c.creator && c.creator.id === me.id;
  const scoreTxt = formatScore(M.id, 'h2h', c.creatorScore);
  let title, body, accept, mode;
  if (c.kind === 'revive') {
    if (mine) {
      const caught = (c.entries || []).some((e) => e.result === 'caught');
      title = caught ? t('ch_revived', { name: (c.entries.find((e) => e.result === 'caught') || {}).name || t('anon'), score: formatScore(M.id, 'solo', c.creatorScore) }) : t('c_yours');
      body = '';
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
    accept = t('play');
    mode = 'turn';
  } else {
    title = mine ? t('c_yours') : t('c_beat_title', { name, score: scoreTxt, game: L(M.title) });
    body = mine ? '' : L(M.rule);
    accept = c.mine && c.mine.played ? t('c_practice') : t('play');
    mode = 'h2h';
    if (c.mine && c.mine.played) body = t('c_already', { score: formatScore(M.id, 'h2h', c.mine.score) });
  }
  const landing = c.kind === 'beat' && !mine;
  if (c.expired) { body = t('c_expired'); accept = null; }
  const entries = (c.entries || []).slice(0, 8);
  introEl = h(`<div class="overlay show" role="dialog" aria-modal="true" aria-labelledby="cTitle"><div class="card">
      <div class="title-plank"><span class="outline">${esc(L(M.title))}</span></div>
      <h2 id="cTitle" style="font-size:26px">${landing ? esc(title).replace(esc(name), `<b class="hl">${esc(name)}</b>`).replace(esc(scoreTxt), `<b class="hl">${esc(scoreTxt)}</b>`) : esc(title)}</h2>
      ${body && !landing ? `<p style="font-size:17px;font-weight:600">${esc(body)}</p>` : ''}
      ${c.variant === 'native' && nativeDef() ? `<p class="chip tape" style="align-self:flex-start">${esc(L(nativeDef().label))}</p>` : ''}
      <div class="stack">
        ${accept && !(mine && c.kind === 'beat') ? `<button class="btn wide big-play" data-accept>${esc(accept)}</button>` : ''}
        ${landing && body ? `<p class="howto-line">${esc(body)}</p>` : ''}
        ${mine && c.kind !== 'turn' ? `<button class="btn alt wide" data-reshare>${esc(t('share'))}</button>` : ''}
        ${landing ? '' : `<button class="btn alt wide" data-solo>${esc(t('play'))} · ${esc(t('mode_solo'))}</button>`}
      </div>
      <div class="intro-foot"><a class="es-link" href="/" data-home-link>${esc(t('home'))}</a></div>
      ${!landing && entries.length && c.kind === 'beat' ? `<h3 style="font-size:18px">${esc(t('c_board'))}</h3><div class="rows">${entries.map((e) => `<div class="row ${e.id === me.id ? 'me' : ''}"><span>${esc(e.name || t('anon'))}</span><b>${esc(formatScore(M.id, 'h2h', e.score))}</b></div>`).join('')}</div>` : ''}
    </div></div>`);
  document.body.appendChild(introEl);
  const a = $('[data-accept]', introEl);
  if (a) a.addEventListener('click', () => {
    audio.ensure();
    if (mode === 'h2h' && !(c.mine && c.mine.played)) track('challenge_accept', { code: c.id, game: M.id }, M.id);
    play({ mode, variant: c.variant, challenge: c });
  });
  const rs = $('[data-reshare]', introEl);
  if (rs) rs.addEventListener('click', () => shareOptions({ text: `I scored ${scoreTxt} in ${L(M.title)} on Chezable. Beat me: ${c.url}`, url: c.url, game: M.id }));
  const solo = $('[data-solo]', introEl);
  if (solo) solo.addEventListener('click', () => { challenge = null; history.replaceState(null, '', location.pathname); showIntro(); });
  $('[data-home-link]', introEl).addEventListener('click', (e) => { e.preventDefault(); goHome('intro'); });
  (a || solo || $('[data-home-link]', introEl)).focus({ preventScroll: true });
}

/* ======================= play ======================= */
function play(ctx) {
  closeIntro();
  closeEndScreen();
  lastCtx = ctx;
  if (!playFn) { console.error('Stage has no onPlay handler'); return; }
  Promise.resolve(playFn({ ...ctx, assist: !!(prefs.assist && M.assist), skin, speed: prefs.assist && M.assist ? 0.7 : 1 })).catch((e) => {
    if (!e || (!e.offline && !e.status)) console.error(e);
    showIntro();
  });
}

/* ---------- pass the phone ---------- */
async function askNames() {
  const saved = store.get('passnames', []);
  const s = sheet(`<h2 style="font-size:24px">${esc(t('players_names'))}</h2>
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
    const o = h(`<div class="overlay show" role="dialog" aria-modal="true"><div class="card" style="text-align:center">
      <h2 style="font-size:30px">${esc(t('pass_to', { name }))}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}
      <button class="btn wide">${esc(t('im_ready'))}</button></div></div>`);
    document.body.appendChild(o);
    const b = $('button', o);
    b.focus({ preventScroll: true });
    b.onclick = () => { audio.ensure(); o.remove(); res(); };
  });
}
async function startPass(variant) {
  const names = await askNames();
  if (!names) return showIntro();
  closeIntro();
  const nd = nativeDef();
  if (M.passCustom || (variant === 'native' && nd && nd.passCustom)) {
    lastCtx = { mode: 'pass', variant, players: names };
    passMatch = { custom: true, names, variant };
    return play(lastCtx);
  }
  const seed = freshSeed();
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
  api('POST', '/run/finish', body).then(applyEarnings).catch((e) => { if (e.offline) enqueue('/run/finish', body); });
  track('run.finish', { mode: 'pass', variant: pm.variant }, M.id);
  const s = sheet(`<h2 class="result-score" style="font-size:34px">${esc(head)}</h2>
    <div class="rows">${rows.map((r) => `<div class="row ${winner && r === winner ? 'win' : ''}"><span>${esc(r.name)}</span><b>${esc(formatScore(M.id, 'pass', r.score))}</b></div>`).join('')}</div>
    <div class="actions">
      <button class="btn" data-a="rematch">${esc(t('rematch'))}</button>
      <a class="btn alt" href="/" data-a="home">${esc(t('home'))}</a>
      <button class="btn alt" data-a="share">${esc(t('share'))}</button>
      <button class="btn alt" data-a="menu">${esc(t('back'))}</button>
    </div>`, { label: head, locked: true });
  s.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'rematch') { s.close(); rematch(pm); }
    if (a.dataset.a === 'home') { e.preventDefault(); s.close(); goHome('passphone'); }
    if (a.dataset.a === 'menu') { s.close(); showIntro(); }
    if (a.dataset.a === 'share') {
      const text = `${L(M.title)}: ${rows.map((r) => `${r.name} ${formatScore(M.id, 'pass', r.score)}`).join(' · ')}. ${head}.`;
      share({ text, url: `${location.origin}/g/${M.id}/`, game: M.id, kind: 'pass' });
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
  const seed = freshSeed();
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

/* ======================= finish + result sheet ======================= */
function recordLocalBest(r, result) {
  if (r.mode === 'pass' || r.mode === 'okoa' || r.mode === 'turn' || result.score == null) return false;
  const def = scoreDef(M, r.mode);
  const key = `${r.mode === 'revive' ? 'solo' : r.mode}:${r.variant}${r.assist ? ':assist' : ''}`;
  const b = store.get('best:' + M.id, {});
  const prev = b[key];
  const pb = isBetter(def, result.score, prev ? prev.score : null);
  if (pb) { b[key] = { score: result.score, at: Date.now(), mode: r.mode }; store.set('best:' + M.id, b); }
  const played = store.get('played', {});
  played[M.id] = (played[M.id] || 0) + 1;
  store.set('played', played);
  if (r.mode === 'daily') store.set('daily:' + M.id, nairobiDay());
  return pb && prev != null ? true : pb ? 'first' : false;
}

async function onFinish(r, result) {
  const durationMs = Math.round(performance.now() - r.t0);
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
  const localPb = recordLocalBest(r, result);
  track('run.finish', { mode: r.mode, variant: r.variant, assist: r.assist ? 1 : 0, score: result.score, ms: durationMs }, M.id);
  let inputHash = null;
  try { inputHash = r.log.length ? await sha256Hex(JSON.stringify(r.log)) : null; } catch (e) {}
  const detail = { ...(result.detail || {}), events: r.events.length ? r.events.slice(0, 20) : undefined, brand: M.brand || undefined };
  const body = { runId: r.runId, score: result.score, tiebreak: result.tiebreak, detail, inputHash, durationMs, finishedAt: Date.now() };
  if (r.local) body.local = { game: M.id, mode: r.mode, variant: r.variant, assist: r.assist, seed: r.seed, startedAt: r.startedAt };
  if (result.ghost) body.ghost = result.ghost;
  let res = null, offline = false;
  try {
    res = await api('POST', '/run/finish', body);
    applyEarnings(res);
  } catch (e) {
    if (e.offline || !(e.status >= 400 && e.status < 500)) { enqueue('/run/finish', body); offline = true; }
  }
  r.server = res;
  if (result.noSheet) return res;
  showResult(r, result, res, { offline, localPb });
  renderRail();
  return res;
}

function showResult(r, result, res, { offline, localPb }) {
  track('result.view', { mode: r.mode, variant: r.variant }, M.id);
  const scoreTxt = result.display || formatScore(M.id, r.mode, result.score);
  showEndScreen({
    M, run: r, result, res, offline, localPb, scoreTxt, skin,
    playAgain: () => {
      const ctx = { ...(r.ctx || lastCtx || {}) };
      if (ctx.mode === 'revive' || ctx.mode === 'okoa') { challenge = null; ctx.mode = 'solo'; ctx.challenge = null; }
      if (ctx.mode === 'h2h') { challenge = null; ctx.mode = 'solo'; ctx.challenge = null; }
      if (result.againCtx) Object.assign(ctx, result.againCtx);
      play(ctx);
    },
    rematch: () => play({ mode: 'h2h', variant: r.variant, challenge: r.challenge }),
    createChallenge: (opts = {}) => createChallenge(r, result, scoreTxt, { ...opts, noShare: true }),
    goHome,
    extraActions: result.actions || [],
  });
}

function shareLine(result, scoreTxt) {
  return (result.share && result.share.line) || scoreTxt;
}
export async function createChallenge(r, result, scoreTxt, { kind = 'beat', targetId, payload, noShare } = {}) {
  if (navigator.onLine === false) return toast(t('challenge_need_net'));
  if (r.local) {
    // an offline run has to reach the server before it can be challenged
    try { await flush(); } catch (e) {}
  }
  let pl = payload;
  const nd = nativeDef();
  if (pl === undefined && r.variant === 'native' && M.challengeSetup && kind === 'beat') {
    pl = await M.challengeSetup(r, result);
    if (pl === null) return;
  }
  // stages can attach what the receiver needs to rebuild the same board (e.g. the level number)
  if (kind === 'beat' && M.challengePayload) pl = { ...(M.challengePayload(r, result) || {}), ...(pl || {}) };
  toast(t('challenge_creating'), 1500);
  let c;
  try {
    c = await api('POST', '/challenge', { runId: r.runId, kind, payload: pl, targetId });
  } catch (e) {
    toast(e.offline ? t('challenge_need_net') : t('error_generic'));
    return;
  }
  track('challenge.create', { kind, variant: r.variant }, M.id);
  // level games are challenged on their head-to-head score (e.g. bumps), not the level reached
  if (noShare) return { ...c, scoreText: pl && typeof pl.h2hScore === 'number' ? formatScore(M.id, 'h2h', pl.h2hScore) : null };
  const line = pl && typeof pl.h2hScore === 'number' ? formatScore(M.id, 'h2h', pl.h2hScore) : shareLine(result, scoreTxt);
  const text = kind === 'revive'
    ? (result.reviveText || t('c_revive_title', { name: player().name || t('anon') }))
    : t('challenge_text', { result: line, game: L(M.title) });
  await shareOptions({ text: kind === 'revive' ? `${text} ${c.url}` : `${text} ${c.url}`, url: c.url, game: M.id });
  return c;
}

/* ======================= menu ======================= */
function openMenu() {
  if (anySheetOpen()) return;
  pause();
  const inRun = current && !current.done;
  const s = sheet(`<h2 style="font-size:24px">${esc(L(M.title))}</h2>
    <label class="switch"><span>${esc(t('sound'))}</span><input type="checkbox" data-p="sound" ${prefs.sound ? 'checked' : ''}></label>
    <label class="switch"><span>${esc(t('haptics'))}</span><input type="checkbox" data-p="haptics" ${prefs.haptics ? 'checked' : ''}></label>
    ${M.assist ? `<label class="switch"><span>${esc(t('assist'))}<br><small class="muted">${esc(t('assist_desc'))}</small></span><input type="checkbox" data-p="assist" ${prefs.assist ? 'checked' : ''} ${inRun ? 'disabled' : ''}></label>` : ''}
    <label class="switch"><span>${esc(t('reduced_motion'))}</span><input type="checkbox" data-p="reducedMotion" ${prefs.reducedMotion ? 'checked' : ''}></label>
    <details><summary style="cursor:pointer;font-weight:700;min-height:40px">${esc(t('how_to_play'))}</summary>${howtoHtml()}</details>
    <div class="stack">
      ${inRun ? `<button class="btn wide" data-m="resume">${esc(t('resume'))}</button>` : ''}
      <a class="btn alt wide" href="/top/${M.id}">${esc(t('leaderboard'))}</a>
      ${inRun ? `<button class="btn alt wide" data-m="quit">${esc(t('quit_run'))}</button>` : `<button class="btn alt wide" data-m="intro">${esc(t('back'))}</button>`}
      <a class="btn alt wide" href="/" data-m="home">${esc(t('home'))}</a>
    </div>`, { label: t('menu'), onClose: () => resume() });
  s.el.addEventListener('change', (e) => {
    const p = e.target.dataset.p;
    if (!p) return;
    prefs.set(p, e.target.checked);
    if (p === 'assist' && e.target.checked) track('assist.enable', {}, M.id);
    if (p === 'sound') audio.ensure();
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    if (b.dataset.m === 'resume') s.close();
    if (b.dataset.m === 'quit') { hideBeatTarget(); if (current) current.done = true; current = null; paused = false; s.close(); emit('quit'); for (const fn of quitFns) fn(); showIntro(); }
    if (b.dataset.m === 'intro') { s.close(); challenge ? showChallengeIntro() : showIntro(); }
    if (b.dataset.m === 'home') { e.preventDefault(); s.close(); goHome('gamebar'); }
  });
}
const quitFns = new Set();
export function onQuit(fn) { quitFns.add(fn); }
export function showMenu() { showIntro(); }

/* ======================= side rail ======================= */
async function renderRail() {
  if (!rail || getComputedStyle(rail).display === 'none') return;
  const mode = 'solo';
  let html = `<div class="card"><h2>${esc(t('leaderboard'))} · ${esc(t('lb_week'))}</h2><div class="rows" data-top><p class="muted">${esc(t('loading'))}</p></div>
    <a class="btn alt small" href="/top/${M.id}">${esc(t('leaderboard'))}</a></div>`;
  if (challenge && challenge.kind === 'beat') {
    html += `<div class="card"><h2>${esc(t('mode_h2h'))}</h2><p><b>${esc(challenge.creator && challenge.creator.name || t('anon'))}</b>: ${esc(formatScore(M.id, 'h2h', challenge.creatorScore))}</p></div>`;
  } else {
    html += `<div class="card"><h2>${esc(t('challenge'))}</h2><p class="muted">${esc(L(M.rule))}</p></div>`;
  }
  rail.innerHTML = html;
  try {
    const top = await api('GET', `/top/${M.id}?board=week&mode=${mode}&variant=classic&limit=5`, null, { auth: false });
    const rows = (top.rows || []).slice(0, 5);
    $('[data-top]', rail).innerHTML = rows.length
      ? rows.map((x) => `<div class="row"><span>#${x.rank} ${esc(x.name || t('anon'))}</span><b>${esc(formatScore(M.id, mode, x.score))}</b></div>`).join('')
      : `<p class="muted">${esc(t('lb_empty'))}</p>`;
  } catch (e) {
    $('[data-top]', rail).innerHTML = `<p class="muted">${esc(t('offline'))}</p>`;
  }
}
addEventListener('resize', () => { if (rail && !rail.innerHTML) renderRail(); });

/* ======================= Home + beat target (spec v1 §A2, §B3) ======================= */
/** Home from anywhere. Mid-run it asks first (the existing "Leave this run" rule); otherwise it just goes. */
export function goHome(from) {
  const go = () => { track('home_tap', { from }, M.id); flushNow(); location.href = '/'; };
  const inRun = current && !current.done && !endScreenOpen();
  if (!inRun) return go();
  pause();
  const s = sheet(`<h2 style="font-size:24px">${esc(t('leave_title'))}</h2><p class="muted">${esc(t('leave_body'))}</p>
    <div class="stack"><button class="btn wide" data-keep>${esc(t('keep_playing'))}</button><button class="btn alt wide" data-leave>${esc(t('leave_yes'))}</button></div>`,
    { label: t('leave_title'), onClose: (v) => { if (v !== 'leave') resume(); } });
  $('[data-keep]', s.el).onclick = () => s.close('keep');
  $('[data-leave]', s.el).onclick = () => { s.close('leave'); go(); };
}
function flushNow() { try { track('nav', { to: 'home' }, M.id); } catch (e) {} }

let beatEl = null;
function showBeatTarget(r) {
  hideBeatTarget();
  if (r.mode !== 'h2h' || !r.challenge || r.challenge.creatorScore == null) return;
  beatEl = h(`<div class="beat-pill" role="status">${esc(t('beat_target', { score: formatScore(M.id, 'h2h', r.challenge.creatorScore) }))}</div>`);
  document.body.appendChild(beatEl);
}
function hideBeatTarget() { if (beatEl) { beatEl.remove(); beatEl = null; } }
