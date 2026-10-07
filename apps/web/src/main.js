// Chezable shell pages (spec 2 §3): Home, Standings, the thread pages (/t/...), challenges, profile, the challenge
// landing and the static pages. A tiny history router; the header, screens and thread engine come from window.Chez,
// the same code the game pages use.
import './style.css';
import { renderStatic } from './static.js';
import { pageAdmin, afterAdmin } from './admin.js';

const C = window.Chez;
const { t, L } = C;
const { esc, toast, relAge } = C.ui;
const { featured: games, formatScore, game: gameOf } = C.catalog;
const { levelFor, xpForLevel, nairobiDay, NATIVE_UNLOCK_LEVEL } = C.rules;
const { threadDef, threadIdFromPath, threadPath, newAnytimeId, TURNS } = C.threads;
const TS = C.threadState;
const S = C.screens;
const app = document.getElementById('app');

/* ---------------- frame: the shared header, then the page ---------------- */
function me() { return C.cachedMe() || {}; }
function level() { return levelFor(me().xp || 0); }
function frame(inner, cls = '') {
  return `${C.header.headerHtml()}<main id="main" class="page ${cls}" tabindex="-1">${inner}</main>`;
}
function footer() {
  return `<footer class="foot">
    <a href="/about">${esc(t('about'))}</a><a href="/privacy">${esc(t('privacy'))}</a><a href="/terms">${esc(t('terms'))}</a>
    <span class="muted">Cheza: to play.</span></footer>`;
}
function bestOf(slug) {
  const b = C.store.get('best:' + slug, {});
  const keys = Object.keys(b).filter((k) => !k.includes('assist'));
  const k = keys.find((x) => x.startsWith('solo:classic')) || keys.find((x) => x.startsWith('daily:')) || keys[0];
  return k ? { score: b[k].score, mode: k.split(':')[0] } : null;
}

/* ---------------- Home (spec 2 §3.1) ---------------- */
function durationText(slug) {
  const d = (C.store.get('durations', {}) || {})[slug] || (gameOf(slug) || {}).typicalSec || 45;
  const sec = Math.max(15, Math.round(d / 15) * 15);
  if (sec < 60) return t('duration_sec', { n: sec });
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${t('duration_min', { n: m })} ${t('duration_sec', { n: s })}` : t('duration_min', { n: m });
}
function threadHero() {
  const id = TS.todayId();
  const def = threadDef(id);
  const s = TS.load(id);
  const tilesHtml = `<div class="hero-tiles" aria-hidden="true">${def.games.map((slug) => `<span class="hero-tile" style="--gc:${S.colorOf(gameOf(slug))}">${S.icon(gameOf(slug), 38)}</span>`).join('<span class="hero-link"></span>')}</div>`;
  if (s && s.status !== 'playing') {
    const v = TS.view(s);
    return `<section class="thread-hero" aria-labelledby="thH">
      ${tilesHtml}
      <h2 id="thH" class="h-hero">${esc(t('thread_done', { n: v.stars, m: TURNS * 3 }))}</h2>
      <div class="stack" style="width:100%">
        <a class="btn wide" href="${threadPath(id)}">${esc(t('thread_see_result'))}</a>
        <a class="btn alt wide" href="/t/new?entry=home_hero">${esc(t('thread_play_anytime'))}</a>
      </div></section>`;
  }
  const going = s && s.runs.length ? TS.view(s) : null;
  return `<section class="thread-hero" aria-labelledby="thH">
    ${going ? '' : `<span class="badge-new hero-badge">${esc(t('new_badge'))}</span>`}
    ${tilesHtml}
    <h2 id="thH" class="h-hero">${esc(t('thread_today'))}</h2>
    <p>${esc(t('thread_desc'))}</p>
    <button class="btn wide" data-thread>${esc(going ? t('thread_continue_turn', { n: going.next + 1, m: TURNS }) : t('thread_start'))}</button>
  </section>`;
}
function gameCard(g) {
  return `<article class="game-card" style="--gc:${S.colorOf(g)}">
    <a class="gc-top" href="/g/${g.id}/">${S.icon(g, 52)}<h3>${esc(L(g.title))}</h3></a>
    <div class="gc-body">
      <p class="gc-tag">${esc(L(g.tagline) || L(g.rule))}</p>
      <span class="gc-dur" data-dur="${g.id}">${esc(durationText(g.id))}</span>
      <a class="btn small wide" href="/g/${g.id}/">${esc(t('play'))}</a>
      ${(g.modes || []).includes('h2h') ? `<a class="btn alt small wide" href="/g/${g.id}/?mode=duel">${esc(t('duel'))}</a>` : ''}
    </div>
  </article>`;
}
function pageHome() {
  const day = nairobiDay();
  const dateTxt = new Date(Date.parse(day + 'T12:00:00Z')).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const anytime = TS.inProgress();
  return frame(`
    <div class="home-top"><span class="muted">${esc(dateTxt)}</span><a href="/standings">${esc(t('standings'))}</a></div>
    ${threadHero()}
    ${anytime && anytime.id !== TS.todayId() ? `<a class="card link-card" href="${TS.turnUrl(anytime.id, TS.view(anytime).def.games[TS.view(anytime).next])}"><b>${esc(t('thread_continue_any', { n: TS.view(anytime).next + 1, m: TURNS }))}</b></a>` : ''}
    <section data-waiting hidden aria-live="polite"></section>
    <h2 class="rule-head">${esc(t('all_games'))}</h2>
    <div class="game-grid">${games.map(gameCard).join('')}</div>
    ${C.player().name ? '' : `<section class="claim-card" aria-labelledby="clH">
      <h2 id="clH">${esc(t('claim_name'))}</h2>
      <p>${esc(t('claim_card_sub'))}</p>
      <button class="btn inverse" data-claim>${esc(t('claim_name'))}</button>
    </section>`}
    ${footer()}`, 'home');
}
async function afterHome() {
  const b = document.querySelector('[data-thread]');
  if (b) b.onclick = () => C.threadUi.goPlay(TS.todayId(), 'home_hero');
  const cl = document.querySelector('[data-claim]');
  if (cl) cl.onclick = () => C.claimSheet('home', () => render());
  C.prefetchGame(threadDef(TS.todayId()).games[0]);
  // the typical play time per game, from real play once there's enough of it (rounded to 15 s)
  C.api('GET', '/games/stats', null, { auth: false, timeout: 5000 }).then((r) => {
    if (!r || !r.durations) return;
    C.store.set('durations', r.durations);
    document.querySelectorAll('[data-dur]').forEach((el) => { el.textContent = durationText(el.dataset.dur); });
  }).catch(() => {});
  try {
    const ch = await C.api('GET', '/challenges');
    C.header.setWaiting(ch.waitingYou.length);
    const box = document.querySelector('[data-waiting]');
    if (box && ch.waitingYou.length) {
      box.hidden = false;
      box.innerHTML = `<a class="card link-card" href="/challenges"><b>${esc(ch.waitingYou.length === 1 ? t('waiting_one') : t('waiting_n', { n: ch.waitingYou.length }))}</b>
        <span class="muted">${ch.waitingYou.slice(0, 3).map((c) => `${esc(c.creatorName || t('anon'))} · ${esc(L(gameOf(c.game)?.title))}`).join(' · ')}</span></a>`;
    }
  } catch (e) {}
}

/* ---------------- Daily games (the per-game dailies; Today's Thread is on Home) ---------------- */
function pageDaily() {
  const day = nairobiDay();
  const list = games.filter((g) => (g.modes || []).includes('daily'));
  return frame(`
    <h1 class="page-title">${esc(t('daily_title'))}</h1>
    <p class="muted">${esc(t('daily_intro'))}</p>
    <div class="rows">${list.map((g) => {
      const done = C.store.get('daily:' + g.id) === day;
      return `<a class="row link" href="/g/${g.id}/?mode=daily"><span><b>${esc(L(g.title))}</b><small>${esc(L(g.tagline))}</small></span>
        <span class="chip ${done ? 'ok' : 'tape'}">${done ? '✓ ' + esc(t('done')) : esc(t('play'))}</span></a>`;
    }).join('')}</div>
    ${footer()}`);
}

/* ---------------- Challenges ---------------- */
function pageChallenges() {
  return frame(`<h1 class="page-title">${esc(t('challenges'))}</h1><div data-list><p class="muted">${esc(t('loading'))}</p></div>`);
}
async function afterChallenges() {
  const box = document.querySelector('[data-list]');
  let data;
  try { data = await C.api('GET', '/challenges'); }
  catch (e) { box.innerHTML = `<p class="muted">${esc(e.offline ? t('offline') : t('error_generic'))}</p>`; return; }
  C.header.setWaiting(data.waitingYou.length);
  const g = (c) => L(gameOf(c.game)?.title || c.game);
  const fmt = (c, s) => formatScore(c.game, 'h2h', s);
  const rowYou = (c) => {
    let line = `${esc(c.creatorName || t('anon'))}: ${esc(fmt(c, c.creatorScore))}`, btn = t('c_accept');
    if (c.action === 'continue') { line = esc(t('ch_revived', { name: c.rescuer || t('anon'), score: formatScore(c.game, 'solo', c.creatorScore) })); btn = t('ch_continue'); }
    if (c.action === 'move') { line = `${esc(c.opponentName || t('anon'))}`; btn = t('ch_your_move'); }
    return `<a class="row link" href="/g/${c.game}/?c=${encodeURIComponent(c.id)}"><span><b>${esc(g(c))}</b><small>${line} · ${esc(relAge(c.updatedAt))}</small></span><span class="chip tape">${esc(btn)}</span></a>`;
  };
  const rowThem = (c) => `<div class="row"><span><b>${esc(g(c))}</b><small>${c.kind === 'turn' ? esc(t('c_turn_wait', { name: c.opponentName || t('anon') })) : esc(fmt(c, c.creatorScore))} · ${esc(relAge(c.createdAt))}</small></span>
      <button class="btn alt small" data-share="${esc(c.url)}" data-game="${esc(c.game)}" data-score="${esc(c.kind === 'turn' ? '' : fmt(c, c.creatorScore))}">${esc(t('share'))}</button></div>`;
  const rowDone = (c) => {
    let right = '';
    if (c.kind === 'turn') right = c.winner === 3 ? t('draw') : c.winner === c.youAre ? t('you_won') : t('you_lost');
    else if (c.mine) right = `${c.entries} · ${c.lastName || t('anon')} ${fmt(c, c.lastScore)}`;
    else right = `${fmt(c, c.myScore)} vs ${fmt(c, c.creatorScore)}`;
    const res = c.myResult === 'win' ? 'ok' : c.myResult === 'loss' ? '' : 'tape';
    return `<a class="row link" href="/g/${c.game}/?c=${encodeURIComponent(c.id)}"><span><b>${esc(g(c))}</b><small>${esc(c.mine ? t('you') : c.creatorName || t('anon'))} · ${esc(relAge(c.updatedAt))}</small></span><span class="chip ${res}">${esc(right)}</span></a>`;
  };
  const sect = (title, list, fn) => `<section class="stack"><h2>${esc(title)} <span class="muted">(${list.length})</span></h2>
    <div class="rows">${list.length ? list.map(fn).join('') : `<p class="muted">${esc(t('ch_none'))}</p>`}</div></section>`;
  box.innerHTML = sect(t('ch_waiting_you'), data.waitingYou, rowYou) + sect(t('ch_waiting_them'), data.waitingThem, rowThem) + sect(t('ch_finished'), data.finished, rowDone);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-share]');
    if (!b) return;
    const gm = gameOf(b.dataset.game);
    C.shareNow({ text: b.dataset.score ? t('share_challenge_text', { result: b.dataset.score, game: L(gm.title) }) : L(gm.title), url: b.dataset.share, game: b.dataset.game, surface: 'challenges' });
  });
}

/* ---------------- Profile ---------------- */
function pageMe() {
  const p = C.player();
  const m = me();
  const lvl = level();
  const xp = m.xp || 0;
  const lo = xpForLevel(lvl), hi = xpForLevel(lvl + 1);
  const pct = Math.round(((xp - lo) / Math.max(1, hi - lo)) * 100);
  const code = C.store.get('recovery');
  const prefs = C.prefs.all();
  return frame(`
    <h1 class="page-title">${esc(p.name || t('guest'))}</h1>
    <section class="card">
      <div class="level-row"><b class="display" style="font-size:24px">${esc(t('level', { level: lvl }))}</b><span class="muted">${xp} XP</span></div>
      <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(t('xp_to_next', { xp: hi - xp, level: lvl + 1 }))}"><i style="width:${pct}%"></i></div>
      <p class="muted">${esc(t('xp_to_next', { xp: hi - xp, level: lvl + 1 }))}${lvl < NATIVE_UNLOCK_LEVEL && p.cohort !== 'native' ? ` · ${esc(t('variant_native_locked'))}` : ''}</p>
      <p class="coins-line"><img class="coin" src="/icons/coin.svg" alt="" width="22" height="22"> <b>${m.coins || 0}</b> ${esc(t('coins'))}</p>
      <p class="muted" style="font-size:14px">${esc(t('coins_note'))}</p>
    </section>
    <section class="card" id="name">
      <h2>${esc(p.name ? t('change_name') : t('claim_name'))}</h2>
      <p class="muted">${esc(t('claim_prompt'))}</p>
      ${p.name && m.nextChangeAt ? `<p class="notice">${esc(t('name_next_change', { date: new Date(m.nextChangeAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long' }) }))}</p>` : p.name && m.freeChange ? `<p class="muted">${esc(t('name_free_change'))}</p>` : ''}
      <form data-name class="stack" novalidate>
        <div class="field"><label for="nm">${esc(t('name'))}</label>
          <input id="nm" name="name" maxlength="16" autocomplete="nickname" autocapitalize="off" spellcheck="false" value="${esc(p.name || '')}" aria-describedby="nmHint nmErr"><button type="button" class="btn alt small" data-suggest style="align-self:flex-start">${esc(t('es_suggest'))}</button>
          <span class="hint" id="nmHint">${esc(t('name_hint'))} ${esc(t('es_device_note'))}</span><span class="error" id="nmErr" role="alert"></span></div>
        <button class="btn wide" type="submit">${esc(p.name ? t('change_name') : t('claim_name'))}</button>
      </form>
    </section>
    <section class="card">
      <h2>${esc(t('recovery'))}</h2>
      ${p.name ? `<p class="muted">${esc(t('recovery_desc'))}</p>
        ${code ? `<p class="recovery" data-code hidden>${esc(code)}</p><button class="btn alt wide" data-show>${esc(t('recovery_show'))}</button>` : `<button class="btn alt wide" data-newcode>${esc(t('recovery_show'))}</button>`}`
        : `<p class="muted">${esc(t('recovery_none'))}</p>`}
      <details><summary class="summary">${esc(t('restore'))}</summary>
        <form data-restore class="stack" style="margin-top:10px">
          <p class="muted">${esc(t('restore_desc'))}</p>
          <div class="field"><label for="rc">${esc(t('recovery'))}</label><input id="rc" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-JKLM"></div>
          <button class="btn alt wide" type="submit">${esc(t('restore'))}</button>
        </form></details>
    </section>
    <section class="card">
      <h2>${esc(t('stats'))}</h2>
      <div class="rows" data-bests>${games.map((g) => { const b = bestOf(g.id); return `<div class="row"><span>${esc(L(g.title))}</span><b>${b ? esc(formatScore(g.id, b.mode, b.score)) : '–'}</b></div>`; }).join('')}</div>
    </section>
    <section class="card">
      <h2>${esc(t('settings'))}</h2>
      ${['sound', 'haptics', 'reducedMotion', 'assist'].map((k) => `<label class="switch"><span>${esc(t(k === 'reducedMotion' ? 'reduced_motion' : k))}${k === 'assist' ? `<br><small class="muted">${esc(t('assist_desc'))}</small>` : ''}</span><input type="checkbox" data-pref="${k}" ${prefs[k] ? 'checked' : ''}></label>`).join('')}
      <div class="hstack"><button class="btn alt small" data-export>${esc(t('export'))}</button><label class="btn alt small" style="cursor:pointer">${esc(t('import'))}<input type="file" accept="application/json" data-import hidden></label></div>
    </section>
    <p><a href="/daily">${esc(t('daily_title'))}</a></p>
    ${footer()}`);
}
function afterMe() {
  const f = document.querySelector('[data-name]');
  f.querySelector('[data-suggest]').onclick = () => { f.name.value = C.names.suggestName(); f.name.focus(); };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    const err = document.getElementById('nmErr');
    const problem = C.rules.nameFormatProblem(name);
    if (problem) { err.textContent = t(problem === 'name_blocked' ? 'name_bad' : problem); C.track('name_rejected', { tier: problem === 'name_blocked' ? 'reserved' : 'format' }); return; }
    err.textContent = '';
    try {
      const res = await C.api('POST', '/player/name', { name });
      C.savePlayer({ name: res.handle });
      C.track('name_claimed', { surface: 'profile' });
      if (res.recovery) { C.store.set('recovery', res.recovery); }
      toast(t('name_claimed'));
      await C.me().catch(() => {});
      render();
      if (res.recovery) setTimeout(() => { const b = document.querySelector('[data-show]'); if (b) b.click(); }, 50);
    } catch (e2) {
      err.textContent = e2.offline ? t('offline') : t(e2.code === 'name_taken' ? 'name_taken_try' : e2.code === 'name_blocked' ? 'name_bad' : e2.code === 'name_invalid' ? 'name_invalid' : e2.code === 'name_change_wait' ? 'name_wait' : 'error_generic');
      C.track('name_rejected', { tier: e2.code || 'error' });
    }
  });
  const show = document.querySelector('[data-show]');
  if (show) show.onclick = () => { const c = document.querySelector('[data-code]'); c.hidden = !c.hidden; };
  const nc = document.querySelector('[data-newcode]');
  if (nc) nc.onclick = async () => {
    try { const r = await C.api('POST', '/player/recovery'); C.store.set('recovery', r.recovery); render(); setTimeout(() => document.querySelector('[data-show]')?.click(), 30); }
    catch (e) { toast(e.offline ? t('offline') : t('error_generic')); }
  };
  document.querySelector('[data-restore]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('rc').value;
    const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
    try {
      const r = await C.api('POST', '/player/recover', { code, secret }, { auth: false });
      C.savePlayer({ id: r.id, secret, name: r.handle, cohort: r.cohort, registered: true });
      C.store.set('recovery', code.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g).join('-'));
      await C.me().catch(() => {});
      toast(t('restore_ok', { name: r.handle || '' }));
      render();
    } catch (e2) { toast(e2.offline ? t('offline') : t('restore_bad')); }
  });
  document.querySelectorAll('[data-pref]').forEach((i) => i.addEventListener('change', () => {
    C.prefs.set(i.dataset.pref, i.checked);
    if (i.dataset.pref === 'assist' && i.checked) C.track('assist.enable', {});
  }));
  document.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([JSON.stringify({ chezable: 1, exportedAt: new Date().toISOString(), data: C.store.dump() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'chezable-data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  document.querySelector('[data-import]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!j || j.chezable !== 1 || typeof j.data !== 'object') throw new Error('bad');
      C.store.load(j.data);
      toast(t('import_ok'));
      setTimeout(() => location.reload(), 600);
    } catch (err) { toast(t('error_generic')); }
  };
  if (location.hash === '#name') setTimeout(() => document.getElementById('nm')?.focus(), 50);
  if (!meFetched) {
    meFetched = true;
    const before = JSON.stringify(me());
    C.me().then(() => {
      if (location.pathname === '/me' && JSON.stringify(me()) !== before && !document.activeElement?.matches('input')) render();
    }).catch(() => {});
  }
}
let meFetched = false;

/* ---------------- Standings (spec 2 §3.5, §5.7): Daily thread tab + per-game boards ---------------- */
function pageStandings(slug) {
  if (slug && !gameOf(slug)) return pageNotFound();
  const tabs = [['thread', t('daily_thread'), '/standings'], ...games.map((g) => [g.id, L(g.title), `/top/${g.id}`])];
  const on = slug || 'thread';
  return frame(`
    <h1 class="page-title">${esc(t('standings'))}</h1>
    <nav class="tabs" aria-label="${esc(t('standings'))}">${tabs.map(([k, label, href]) => `<a href="${href}" ${k === on ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>
    <div class="seg" role="tablist" aria-label="${esc(t('standings'))}" data-board>
      ${on === 'thread' ? `<button role="tab" data-b="day">${esc(t('board_today'))}</button><button role="tab" data-b="week">${esc(t('board_week'))}</button>`
        : `<button role="tab" data-b="week">${esc(t('lb_week'))}</button><button role="tab" data-b="all">${esc(t('lb_all'))}</button>`}
    </div>
    ${on !== 'thread' ? gameFilters(gameOf(on)) : ''}
    <div class="rows" data-rows role="tabpanel" aria-live="polite"><p class="muted">${esc(t('loading'))}</p></div>
    <div data-mine></div>
    <p class="muted small-note">${esc(t('lb_guest_note'))}</p>
    ${on === 'thread' ? `<a class="btn wide" href="${threadPath(TS.todayId())}">${esc(t('thread_play_today'))}</a>` : `<a class="btn wide" href="/g/${on}/">${esc(t('play'))}</a>`}`, 'standings');
}
function gameFilters(g) {
  return `<div class="hstack filters">
    ${(g.modes || []).includes('daily') ? `<div class="seg" data-modesel><button data-m="solo">${esc(t('mode_solo'))}</button><button data-m="daily">${esc(t('mode_daily'))}</button></div>` : ''}
    ${g.variants && g.variants.native ? `<div class="seg" data-varsel><button data-v="classic">${esc(t('variant_classic'))}</button><button data-v="native">${esc(L(g.variants.native.label))}</button></div>` : ''}
    ${g.assist ? `<label class="switch small"><span>${esc(t('lb_assist'))}</span><input type="checkbox" data-assist></label>` : ''}
  </div>`;
}
const mmss = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function afterStandings(slug) {
  const isThread = !slug;
  const st = { board: isThread ? 'day' : 'week', mode: 'solo', variant: 'classic', assist: 0 };
  const paint = () => {
    document.querySelectorAll('[data-b]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.b === st.board)));
    document.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
    document.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.variant)));
    load();
  };
  const nameOf = (n) => n || t('guest');
  async function load() {
    const box = document.querySelector('[data-rows]'), mine = document.querySelector('[data-mine]');
    box.innerHTML = `<p class="muted">${esc(t('loading'))}</p>`; mine.innerHTML = '';
    C.track('leaderboard_view', { game: slug || 'daily_thread', board: st.board });
    try {
      if (isThread) {
        const res = await C.api('GET', `/standings/daily-thread/${nairobiDay()}${st.board === 'week' ? '?board=week' : ''}`, null, { auth: !!C.player().registered });
        const row = (r) => `<div class="row ${r.me ? 'me' : ''}"><span><b>#${r.rank}</b> ${esc(nameOf(r.name))}${r.me ? ` <small>${esc(t('lb_you'))}</small>` : ''}</span>
          <span class="row-right"><b>${esc(t('stars_of', { n: r.stars, m: st.board === 'week' ? (r.threads || 1) * TURNS * 3 : TURNS * 3 }))}</b><small>${mmss(r.durationMs)}</small></span></div>`;
        box.innerHTML = res.rows.length ? res.rows.map(row).join('') : `<p class="muted">${esc(t('lb_empty'))}</p>`;
        if (res.me && !res.rows.some((r) => r.me)) mine.innerHTML = row(res.me);
        return;
      }
      const q = `/top/${slug}?board=${st.board}&mode=${st.mode}&variant=${st.variant}&assist=${st.assist}&limit=10`;
      const res = await C.api('GET', q, null, { auth: !!C.player().registered });
      const rows = res.rows || [];
      const fmt = (v) => formatScore(slug, st.mode, v);
      box.innerHTML = rows.length
        ? rows.map((r) => `<div class="row ${r.me ? 'me' : ''}"><span><b>#${r.rank}</b> ${esc(nameOf(r.name))}${r.me ? ` <small>${esc(t('lb_you'))}</small>` : ''}</span>
            <span class="row-right"><b>${esc(fmt(r.score))}</b>${r.me || !r.name ? '' : `<button class="report-btn" data-report="${esc(r.name)}" aria-label="${esc(t('report'))} ${esc(r.name)}">${esc(t('report'))}</button>`}</span></div>`).join('')
        : `<p class="muted">${esc(t('lb_empty'))}</p>`;
      if (res.me) {
        const gap = !res.me.next ? t('lb_top') : res.me.next.gap === 0 ? t('lb_tied', { name: nameOf(res.me.next.name) }) : t('lb_gap', { gap: fmt(res.me.next.gap).replace(/ off$/, ''), name: nameOf(res.me.next.name) });
        mine.innerHTML = `<div class="row me"><span><b>#${res.me.rank}</b> ${esc(res.me.name || t('guest'))} <small>${esc(gap)}</small></span><b>${esc(fmt(res.me.score))}</b></div>`;
      }
    } catch (e) { box.innerHTML = `<p class="muted">${esc(e.offline ? t('offline') : t('error_generic'))}</p>`; }
  }
  document.querySelector('[data-board]').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (b) { st.board = b.dataset.b; paint(); } });
  document.querySelector('[data-modesel]')?.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { st.mode = b.dataset.m; paint(); } });
  document.querySelector('[data-varsel]')?.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { st.variant = b.dataset.v; paint(); } });
  document.querySelector('[data-assist]')?.addEventListener('change', (e) => { st.assist = e.target.checked ? 1 : 0; paint(); });
  document.querySelector('[data-rows]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-report]');
    if (!b) return;
    const name = b.dataset.report;
    const sh = C.ui.sheet(`<h2 class="sheet-title">${esc(t('report_title', { name }))}</h2><p class="muted">${esc(t('report_body'))}</p>
      <div class="stack"><button class="btn wide" data-go>${esc(t('report'))}</button><button class="btn alt wide" data-x>${esc(t('cancel'))}</button></div>`, { label: t('report') });
    sh.el.querySelector('[data-x]').onclick = () => sh.close();
    sh.el.querySelector('[data-go]').onclick = async () => {
      try { await C.api('POST', '/report', { name, reason: 'name' }); toast(t('report_sent')); } catch (err) { toast(err.offline ? t('offline') : t('error_generic')); }
      sh.close();
    };
  });
  paint();
}

/* ---------------- threads: /t/<date>, /t/anytime-<id>, /t/today, /t/new (spec 2 §5) ---------------- */
function threadRoute(part) {
  if (part === 'today') return TS.todayId();
  if (part === 'new') { const id = newAnytimeId(); history.replaceState(null, '', threadPath(id) + location.search); return id; }
  return threadIdFromPath(part);
}
function pageThread(id) {
  if (!id || !threadDef(id)) return pageNotFound();
  return frame('<div class="screen-inner flat" data-thread-page></div>', 'thread');
}
function afterThread(id) {
  const box = document.querySelector('[data-thread-page]');
  if (!box) return;
  const s = TS.load(id);
  if (s && s.status !== 'playing') C.threadUi.renderReceipt(box, id);
  else C.threadUi.renderIntro(box, id, { from: new URLSearchParams(location.search).get('from') });
}

/* ---------------- /c/<code>: straight to the game; the code carries game, seed and score (spec 2 §1.2) ---------------- */
function pageChallenge() {
  return frame(`<section class="card" style="margin-top:12px"><h1 style="font-size:24px">${esc(t('loading'))}</h1></section>`);
}
async function afterChallenge(id) {
  const d = C.codes.decodeChallenge(id, C.catalog.games.map((g) => g.id));
  if (d) { location.replace(`/g/${d.game}/?c=${encodeURIComponent(id)}`); return; }
  try {
    const c = await C.api('GET', '/challenge/' + encodeURIComponent(id), null, { timeout: 3000 });
    location.replace(`/g/${c.game}/?c=${encodeURIComponent(c.id)}`);
  } catch (e) {
    document.getElementById('main').innerHTML = `<section class="card" style="margin-top:12px"><h1 style="font-size:24px">${esc(e.offline ? t('challenge_need_net') : t('c_missing'))}</h1><a class="btn" href="/">${esc(t('home'))}</a></section>`;
  }
}

function pageNotFound() {
  return frame(`<section class="card" style="margin-top:12px"><h1>404</h1><p>${esc(t('c_missing'))}</p><a class="btn" href="/">${esc(t('home'))}</a></section>`);
}

/* ---------------- router ---------------- */
function route() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  let m;
  if (p === '/') return [pageHome, afterHome, 'Chezable'];
  if (p === '/daily') return [pageDaily, null, t('daily_title')];
  if (p === '/challenges') return [pageChallenges, afterChallenges, t('challenges')];
  if (p === '/me') return [pageMe, afterMe, t('profile')];
  if (p === '/standings') return [() => pageStandings(null), () => afterStandings(null), t('standings')];
  if (p === '/admin') return [() => frame(pageAdmin()), afterAdmin, 'Admin'];
  if ((m = p.match(/^\/top\/([a-z0-9-]+)$/))) return [() => pageStandings(m[1]), () => afterStandings(m[1]), t('standings')];
  if ((m = p.match(/^\/t\/([A-Za-z0-9-]+)$/))) { const id = threadRoute(m[1]); return [() => pageThread(id), () => afterThread(id), t('thread_today')]; }
  if ((m = p.match(/^\/c\/([A-Za-z0-9._~-]+)$/))) return [pageChallenge, () => afterChallenge(m[1]), t('challenges')];
  if (['/about', '/privacy', '/terms'].includes(p)) return [() => frame(renderStatic(p.slice(1)) + footer()), null, t(p.slice(1))];
  return [pageNotFound, null, '404'];
}
let first = true;
function render() {
  const [page, after, title] = route();
  app.innerHTML = page();
  document.title = title === 'Chezable' ? 'Chezable · Short games, built to be shared' : `${title} · Chezable`;
  C.header.mountHeader();
  C.header.setHud(null);
  if (after) after();
  if (!first) document.getElementById('main')?.focus({ preventScroll: true });
  first = false;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/g/') || url.pathname.startsWith('/b/')) return;
  if (url.pathname === location.pathname && url.hash) return;
  e.preventDefault();
  C.ui.closeAllSheets();
  history.pushState(null, '', url.pathname + url.search + url.hash);
  render();
  scrollTo(0, 0);
});
addEventListener('popstate', render);
render();
C.flush().catch(() => {});
C.me().catch(() => {});
