// Chezable shell pages (spec §3): home, daily set, challenges, profile, standings, challenge landing,
// and the static pages. A tiny history router; everything shared with the games comes from window.Chez.
import './style.css';
import logo from '../../../brand/logo-paths.json';
import { renderStatic } from './static.js';
import { pageAdmin, afterAdmin } from './admin.js';

const C = window.Chez;
const { t, L } = C;
const { esc, toast, relAge } = C.ui;
const { featured: games, formatScore, HOME_DAILIES, game: gameOf } = C.catalog;
const { levelFor, xpForLevel, nairobiDay, NATIVE_UNLOCK_LEVEL } = C.rules;
const app = document.getElementById('app');

const logoSvg = `<svg viewBox="${logo.viewBox}" role="img" aria-label="Chezable"><path class="mark" fill-rule="evenodd" d="${logo.mark}"/><path fill="#5271FF" fill-rule="evenodd" d="${logo.chez}"/><path class="able" fill-rule="evenodd" d="${logo.able}"/></svg>`;
const icon = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>',
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  swords: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l9 9M20 4l-9 9M6 15l3 3M18 15l-3 3M3 21l3-3M21 21l-3-3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5z" fill="currentColor"/></svg>',
};

/* ---------------- frame ---------------- */
function me() { return C.cachedMe() || {}; }
function level() { return levelFor(me().xp || 0); }
let waitingCount = C.store.get('waiting', 0);

function frame(active, inner) {
  const p = C.player();
  return `
  <header class="chez-bar app-bar">
    <a class="logo" href="/" aria-label="Chezable home">${logoSvg}</a>
    <span class="spacer"></span>
    <a class="coins" href="/me" aria-label="${esc(t('coins'))}: ${me().coins || 0}"><img class="coin" src="/icons/coin.svg" alt="" width="20" height="20"><span>${me().coins || 0}</span></a>
    <a class="icon-btn avatar" href="/me" aria-label="${esc(t('profile'))}">${esc((p.name || '?').slice(0, 1).toUpperCase())}</a>
  </header>
  <main id="main" class="page" tabindex="-1">${inner}</main>
  <nav class="tabbar" aria-label="Main">
    ${tab('/', 'home', t('home'), active === 'home')}
    ${tab('/daily', 'today', t('today'), active === 'daily')}
    ${tab('/challenges', 'swords', t('challenges'), active === 'challenges', waitingCount)}
    ${tab('/me', 'me', t('profile'), active === 'me')}
  </nav>`;
}
function tab(href, ic, label, on, badge) {
  return `<a href="${href}" ${on ? 'aria-current="page"' : ''}>${icon[ic]}<span>${esc(label)}</span>${badge ? `<i class="dot" aria-label="${badge}">${badge}</i>` : ''}</a>`;
}

function bestOf(slug) {
  const b = C.store.get('best:' + slug, {});
  const keys = Object.keys(b).filter((k) => !k.includes('assist'));
  const k = keys.find((x) => x.startsWith('solo:classic')) || keys.find((x) => x.startsWith('daily:')) || keys[0];
  return k ? { score: b[k].score, mode: k.split(':')[0] } : null;
}
function played(slug) { return !!(C.store.get('played', {})[slug]); }
const modeBadge = (g) => {
  const m = g.modes || [];
  const out = [];
  if (m.includes('daily')) out.push(`<span class="chip tape">${esc(t('mode_daily'))}</span>`);
  if (m.includes('h2h')) out.push(`<span class="chip blue">${esc(t('mode_h2h'))}</span>`);
  if (m.includes('pass')) out.push(`<span class="chip">${esc(t('mode_pass'))}</span>`);
  if (g.variants && g.variants.native) out.push(`<span class="chip play">${esc(L(g.variants.native.label))}</span>`);
  return out.join('');
};
function card(g) {
  const b = bestOf(g.id);
  const c = (g.card && g.card.color) || '#F26B1D';
  return `<a class="game-card" href="/g/${g.id}/" style="--c:${c}">
    <span class="gc-icon" aria-hidden="true">${(g.card && g.card.icon) || '🎮'}</span>
    <span class="gc-body">
      <b class="gc-title">${esc(L(g.title))}${!played(g.id) ? ` <span class="chip ok new">${esc(t('new_badge'))}</span>` : ''}</b>
      <span class="gc-rule">${esc(L(g.rule))}</span>
      <span class="gc-best">${b ? esc(t('best_short', { best: formatScore(g.id, b.mode, b.score) })) : esc(t('no_best'))}</span>
      <span class="gc-modes">${modeBadge(g)}</span>
    </span>
  </a>`;
}

/* ---------------- pages ---------------- */
function pageHome() {
  const day = nairobiDay();
  const dailies = HOME_DAILIES.map(gameOf).filter(Boolean);
  const next = games.find((g) => !played(g.id));
  return frame('home', `
    <section class="hero"><p class="tagline">${esc(t('app_tagline'))}</p>
      ${!C.player().name && C.store.get('claim_prompts', 0) >= 3 ? `<a class="chip blue" href="/me#name" style="margin-top:8px;text-decoration:none">${esc(t('claim_name'))}</a>` : ''}</section>
    <section aria-labelledby="todayH">
      <div class="section-head"><h2 id="todayH">${esc(t('today'))}</h2><a href="/daily">${esc(t('daily_title'))} →</a></div>
      <div class="today-strip">
        ${dailies.map((g) => {
          const done = C.store.get('daily:' + g.id) === day;
          return `<a class="today-item ${done ? 'done' : ''}" href="/g/${g.id}/?mode=daily" style="--c:${(g.card && g.card.color) || '#FFD21F'}">
            <span class="ti-icon" aria-hidden="true">${(g.card && g.card.icon) || ''}</span>
            <b>${esc(L(g.title))}</b><span>${done ? '✓ ' + esc(t('done')) : esc(t('not_done'))}</span></a>`;
        }).join('')}
      </div>
    </section>
    <section data-waiting hidden aria-live="polite"></section>
    <section aria-labelledby="gamesH">
      <div class="section-head"><h2 id="gamesH">${esc(t('games'))}</h2></div>
      <div class="grid">${games.map(card).join('')}</div>
    </section>
    <section class="card journey" aria-labelledby="jH">
      <h2 id="jH">${esc(t('journey'))}</h2>
      ${next ? `<p>${esc(t('journey_next'))}: <b>${esc(L(next.title))}</b>. ${esc(L(next.rule))}</p><a class="btn wide" href="/g/${next.id}/">${esc(t('play'))}: ${esc(L(next.title))}</a>`
        : `<p>${esc(t('journey_done'))}</p>`}
    </section>
    ${footer()}`);
}
async function afterHome() {
  try {
    const ch = await C.api('GET', '/challenges');
    setWaiting(ch.waitingYou.length);
    const box = document.querySelector('[data-waiting]');
    if (box && ch.waitingYou.length) {
      box.hidden = false;
      box.innerHTML = `<a class="card waiting" href="/challenges"><b>${esc(t('ch_waiting_badge'))}: ${ch.waitingYou.length}</b>
        <span class="muted">${ch.waitingYou.slice(0, 3).map((c) => `${esc(c.creatorName || t('anon'))} · ${esc(L(gameOf(c.game)?.title))}`).join(' · ')}</span></a>`;
    }
  } catch (e) {}
}
function setWaiting(n) {
  waitingCount = n;
  C.store.set('waiting', n);
  const tabEl = document.querySelector('.tabbar a[href="/challenges"]');
  if (tabEl) {
    let d = tabEl.querySelector('.dot');
    if (n && !d) { d = document.createElement('i'); d.className = 'dot'; tabEl.appendChild(d); }
    if (d) { if (n) { d.textContent = n; d.setAttribute('aria-label', String(n)); } else d.remove(); }
  }
}

function footer() {
  return `<footer class="foot">
    <a href="/about">${esc(t('about'))}</a><a href="/privacy">${esc(t('privacy'))}</a><a href="/terms">${esc(t('terms'))}</a>
    <span class="muted">Cheza: to play.</span></footer>`;
}

function pageDaily() {
  const day = nairobiDay();
  const list = games.filter((g) => (g.modes || []).includes('daily'));
  return frame('daily', `
    <h1 class="page-title">${esc(t('daily_title'))}</h1>
    <p class="muted">${esc(t('daily_intro'))}</p>
    <p class="chip tape" style="align-self:flex-start">${esc(new Date(Date.parse(day + 'T12:00:00Z')).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
    <div class="rows big">${list.map((g) => {
      const done = C.store.get('daily:' + g.id) === day;
      return `<a class="row link" href="/g/${g.id}/?mode=daily"><span><b>${esc(L(g.title))}</b><small>${esc(L(g.rule))}</small></span>
        <span class="chip ${done ? 'ok' : 'tape'}">${done ? '✓ ' + esc(t('done')) : esc(t('play'))}</span></a>`;
    }).join('')}</div>
    <h2 style="margin-top:8px">${esc(t('leaderboard'))}</h2>
    <div class="hstack">${list.map((g) => `<a class="btn alt small" href="/top/${g.id}">${esc(L(g.title))}</a>`).join('')}</div>
    ${footer()}`);
}

function pageChallenges() {
  return frame('challenges', `
    <h1 class="page-title">${esc(t('challenges'))}</h1>
    <div data-list><p class="muted">${esc(t('loading'))}</p></div>`);
}
async function afterChallenges() {
  const box = document.querySelector('[data-list]');
  let data;
  try { data = await C.api('GET', '/challenges'); }
  catch (e) { box.innerHTML = `<p class="muted">${esc(e.offline ? t('offline') : t('error_generic'))}</p>`; return; }
  setWaiting(data.waitingYou.length);
  const g = (c) => L(gameOf(c.game)?.title || c.game);
  const fmt = (c, s) => formatScore(c.game, 'h2h', s);
  const rowYou = (c) => {
    let line = `${esc(c.creatorName || t('anon'))}: ${esc(fmt(c, c.creatorScore))}`, btn = t('c_accept');
    if (c.action === 'continue') { line = esc(t('ch_revived', { name: c.rescuer || t('anon'), score: formatScore(c.game, 'solo', c.creatorScore) })); btn = t('ch_continue'); }
    if (c.action === 'move') { line = `${esc(c.opponentName || t('anon'))}`; btn = t('ch_your_move'); }
    return `<a class="row link" href="/g/${c.game}/?c=${c.id}"><span><b>${esc(g(c))}</b><small>${line} · ${esc(relAge(c.updatedAt))}</small></span><span class="chip play">${esc(btn)}</span></a>`;
  };
  const rowThem = (c) => `<div class="row"><span><b>${esc(g(c))}</b><small>${c.kind === 'turn' ? esc(t('c_turn_wait', { name: c.opponentName || t('anon') })) : esc(fmt(c, c.creatorScore))} · ${esc(relAge(c.createdAt))}</small></span>
      <button class="btn alt small" data-share="${esc(c.url)}" data-game="${esc(c.game)}" data-score="${esc(c.kind === 'turn' ? '' : fmt(c, c.creatorScore))}">${esc(t('share'))}</button></div>`;
  const rowDone = (c) => {
    let right = '';
    if (c.kind === 'turn') right = c.winner === 3 ? t('draw') : c.winner === c.youAre ? t('you_won') : t('you_lost');
    else if (c.mine) right = `${c.entries} · ${c.lastName || t('anon')} ${fmt(c, c.lastScore)}`;
    else right = `${fmt(c, c.myScore)} vs ${fmt(c, c.creatorScore)}`;
    const res = c.myResult === 'win' ? 'ok' : c.myResult === 'loss' ? '' : 'tape';
    return `<a class="row link" href="/g/${c.game}/?c=${c.id}"><span><b>${esc(g(c))}</b><small>${esc(c.mine ? t('you') : c.creatorName || t('anon'))} · ${esc(relAge(c.updatedAt))}</small></span><span class="chip ${res}">${esc(right)}</span></a>`;
  };
  const sect = (title, list, fn) => `<section><h2>${esc(title)} <span class="muted">(${list.length})</span></h2>
    <div class="rows big">${list.length ? list.map(fn).join('') : `<p class="muted">${esc(t('ch_none'))}</p>`}</div></section>`;
  box.innerHTML = sect(t('ch_waiting_you'), data.waitingYou, rowYou) + sect(t('ch_waiting_them'), data.waitingThem, rowThem) + sect(t('ch_finished'), data.finished, rowDone);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-share]');
    if (!b) return;
    const gm = gameOf(b.dataset.game);
    C.share({ text: b.dataset.score ? t('challenge_text', { result: b.dataset.score, game: L(gm.title) }) : L(gm.title), url: b.dataset.share, game: b.dataset.game, kind: 'challenge' });
  });
}

function pageMe() {
  const p = C.player();
  const m = me();
  const lvl = level();
  const xp = m.xp || 0;
  const lo = xpForLevel(lvl), hi = xpForLevel(lvl + 1);
  const pct = Math.round(((xp - lo) / Math.max(1, hi - lo)) * 100);
  const code = C.store.get('recovery');
  const prefs = C.prefs.all();
  return frame('me', `
    <h1 class="page-title">${esc(p.name || t('guest'))}</h1>
    <section class="card">
      <div class="level-row"><b class="display" style="font-size:24px">${esc(t('level', { level: lvl }))}</b><span class="muted">${xp} XP</span></div>
      <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(t('xp_to_next', { xp: hi - xp, level: lvl + 1 }))}"><i style="width:${pct}%"></i></div>
      <p class="muted">${esc(t('xp_to_next', { xp: hi - xp, level: lvl + 1 }))}${lvl < NATIVE_UNLOCK_LEVEL && p.cohort !== 'native' ? ` · ${esc(t('variant_native_locked'))}` : ''}</p>
      <p class="coins-line"><img class="coin" src="/icons/coin.svg" alt="" width="20" height="20"> <b>${m.coins || 0}</b> ${esc(t('coins'))}</p>
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
      C.track('name_claimed', {});
      if (res.recovery) { C.store.set('recovery', res.recovery); }
      toast(t('name_claimed'));
      await C.me().catch(() => {});
      render();
      if (res.recovery) setTimeout(() => { const b = document.querySelector('[data-show]'); if (b) b.click(); }, 50);
    } catch (e2) {
      err.textContent = e2.offline ? t('offline') : t(e2.code === 'name_taken' ? 'name_taken' : e2.code === 'name_blocked' ? 'name_bad' : e2.code === 'name_invalid' ? 'name_invalid' : e2.code === 'name_change_wait' ? 'name_wait' : 'error_generic');
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

function pageTop(slug) {
  const g = gameOf(slug);
  if (!g) return pageNotFound();
  return frame('', `
    <p><a href="/g/${g.id}/">← ${esc(L(g.title))}</a></p>
    <h1 class="page-title">${esc(t('leaderboard'))}: ${esc(L(g.title))}</h1>
    <div class="seg" role="tablist" aria-label="${esc(t('leaderboard'))}" data-board>
      <button role="tab" data-b="week">${esc(t('lb_week'))}</button><button role="tab" data-b="all">${esc(t('lb_all'))}</button>
    </div>
    <div class="hstack filters">
      ${(g.modes || []).includes('daily') ? `<div class="seg" data-modesel><button data-m="solo">${esc(t('mode_solo'))}</button><button data-m="daily">${esc(t('mode_daily'))}</button></div>` : ''}
      ${g.variants && g.variants.native ? `<div class="seg" data-varsel><button data-v="classic">${esc(t('variant_classic'))}</button><button data-v="native">${esc(L(g.variants.native.label))}</button></div>` : ''}
      ${g.assist ? `<label class="switch small"><span>${esc(t('lb_assist'))}</span><input type="checkbox" data-assist></label>` : ''}
    </div>
    <div class="rows big" data-rows role="tabpanel" aria-live="polite"><p class="muted">${esc(t('loading'))}</p></div>
    <div data-mine></div>
    <a class="btn wide" href="/g/${g.id}/">${esc(t('play'))}</a>`);
}
function afterTop(slug) {
  const g = gameOf(slug);
  if (!g) return;
  const st = { board: 'week', mode: 'solo', variant: 'classic', assist: 0 };
  const paint = () => {
    document.querySelectorAll('[data-b]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.b === st.board)));
    document.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
    document.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.variant)));
    load();
  };
  async function load() {
    const box = document.querySelector('[data-rows]'), mine = document.querySelector('[data-mine]');
    box.innerHTML = `<p class="muted">${esc(t('loading'))}</p>`; mine.innerHTML = '';
    C.track('leaderboard_view', { game: slug, board: st.board });
    try {
      const q = `/top/${slug}?board=${st.board}&mode=${st.mode}&variant=${st.variant}&assist=${st.assist}&limit=10`;
      const res = await C.api('GET', q, null, { auth: !!C.player().registered });
      const rows = res.rows || [];
      const fmt = (v) => formatScore(slug, st.mode, v);
      box.innerHTML = rows.length
        ? rows.map((r) => `<div class="row ${r.me ? 'me' : ''}"><span><b>#${r.rank}</b> ${esc(r.name)}${r.me ? ` <small>${esc(t('lb_you'))}</small>` : ''}</span>
            <span class="row-right"><b>${esc(fmt(r.score))}</b>${r.me ? '' : `<button class="report-btn" data-report="${esc(r.name)}" aria-label="${esc(t('report'))} ${esc(r.name)}">${esc(t('report'))}</button>`}</span></div>`).join('')
        : `<p class="muted">${esc(t('lb_empty'))}</p>`;
      // your row, even outside the top 10, with the gap to the next rank up
      if (res.me) {
        const gap = !res.me.next ? t('lb_top') : res.me.next.gap === 0 ? t('lb_tied', { name: res.me.next.name || t('anon') }) : t('lb_gap', { gap: fmt(res.me.next.gap).replace(/ off$/, ''), name: res.me.next.name || t('anon') });
        mine.innerHTML = `<div class="row me"><span><b>#${res.me.rank}</b> ${esc(res.me.name || t('you'))} <small>${esc(gap)}</small></span><b>${esc(fmt(res.me.score))}</b></div>`
          + (!C.player().name ? `<p class="muted">${esc(t('lb_unnamed'))} <a href="/me#name">${esc(t('claim_name'))}</a></p>` : '');
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
    const sh = C.ui.sheet(`<h2 style="font-size:24px">${esc(t('report_title', { name }))}</h2><p class="muted">${esc(t('report_body'))}</p>
      <div class="stack"><button class="btn wide" data-go>${esc(t('report'))}</button><button class="btn alt wide" data-x>${esc(t('cancel'))}</button></div>`, { label: t('report') });
    sh.el.querySelector('[data-x]').onclick = () => sh.close();
    sh.el.querySelector('[data-go]').onclick = async () => {
      try { await C.api('POST', '/report', { name, reason: 'name' }); toast(t('report_sent')); } catch (err) { toast(err.offline ? t('offline') : t('error_generic')); }
      sh.close();
    };
  });
  paint();
}

function pageChallenge(id) {
  return frame('', `<section class="card" style="margin-top:12px"><h1 style="font-size:26px">${esc(t('loading'))}</h1></section>`);
}
async function afterChallenge(id) {
  try {
    const c = await C.api('GET', '/challenge/' + encodeURIComponent(id));
    location.replace(`/g/${c.game}/?c=${encodeURIComponent(c.id)}`);
  } catch (e) {
    document.getElementById('main').innerHTML = `<section class="card" style="margin-top:12px"><h1 style="font-size:24px">${esc(e.offline ? t('challenge_need_net') : t('c_missing'))}</h1><a class="btn" href="/">${esc(t('home'))}</a></section>`;
  }
}

function pageNotFound() {
  return frame('', `<section class="card" style="margin-top:12px"><h1>404</h1><p>${esc(t('c_missing'))}</p><a class="btn" href="/">${esc(t('home'))}</a></section>`);
}

/* ---------------- router ---------------- */
function route() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  let m;
  if (p === '/') return [pageHome, afterHome, 'Chezable'];
  if (p === '/daily') return [pageDaily, null, t('daily_title')];
  if (p === '/challenges') return [pageChallenges, afterChallenges, t('challenges')];
  if (p === '/me') return [pageMe, afterMe, t('profile')];
  if (p === '/admin') return [() => frame('', pageAdmin()), afterAdmin, 'Admin'];
  if ((m = p.match(/^\/top\/([a-z0-9-]+)$/))) return [() => pageTop(m[1]), () => afterTop(m[1]), t('leaderboard')];
  if ((m = p.match(/^\/c\/([A-Za-z0-9]+)$/))) return [() => pageChallenge(m[1]), () => afterChallenge(m[1]), t('challenges')];
  if (['/about', '/privacy', '/terms'].includes(p)) return [() => frame('', renderStatic(p.slice(1)) + footer()), null, t(p.slice(1))];
  return [pageNotFound, null, '404'];
}
let first = true;
function render() {
  const [page, after, title] = route();
  app.innerHTML = page();
  document.title = title === 'Chezable' ? 'Chezable · Short games, built to be shared' : `${title} · Chezable`;
  bindFrame();
  if (after) after();
  if (!first) document.getElementById('main')?.focus({ preventScroll: true });
  first = false;
}
function bindFrame() {
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/g/') || url.pathname.startsWith('/b/')) return;
  if (url.pathname === location.pathname && url.hash) return;
  e.preventDefault();
  history.pushState(null, '', url.pathname + url.search + url.hash);
  render();
  scrollTo(0, 0);
});
addEventListener('popstate', render);
C.on('me', () => {
  const coins = document.querySelector('.app-bar .coins span:last-child');
  if (coins) coins.textContent = me().coins || 0;
});
render();
C.flush().catch(() => {});
C.me().then(() => { if (location.pathname === '/') { const c = document.querySelector('.app-bar .coins span:last-child'); if (c) c.textContent = me().coins || 0; } }).catch(() => {});
