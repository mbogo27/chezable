// Thread screens (spec 2 §5.4 to §5.6): the intro with its path of three games, the turn card between turns,
// and the receipt at the end. The shell's /t/<id> page and the game pages both render these.
import { t, L } from './i18n.js';
import { esc, h, sheet } from './ui.js';
import { api, player, sendQueued, track, applyEarnings, cachedMe } from './net.js';
import { featured, game as gameOf } from './catalog.js';
import { threadDef, threadPath, TURNS } from './threads.js';
import { threadChallengeCode, threadChallengeStars } from './codes.js';
import * as TS from './thread-state.js';
import { icon, starsHtml, stripHtml, tile, nextCard, threadMark, earnChips, colorOf, hudHtml, receiptText, threadUrl, untilReset, threadName, fmtDay } from './screens.js';
import { setHud } from './header.js';
import { bindShareButton } from './share.js';
import { claimForm } from './claim.js';
import { nairobiDay } from './rules.js';
import * as store from './store.js';
import { prefetchGame } from './prefetch.js';

const titleOf = (def) => (def.kind === 'daily' ? (def.day === nairobiDay() ? t('thread_today') : t('thread_daily_on', { day: fmtDay(def.day) })) : t('thread_anytime'));

/** Start (or continue) a thread and go to its next game. */
export function goPlay(id, entry, from) {
  let s = TS.load(id);
  if (!s || s.status !== 'playing') s = TS.begin(id, entry, from);
  else if (s.runs.length) track('thread_resumed', { thread: id, turn: TS.view(s).next });
  const v = TS.view(s);
  location.href = TS.turnUrl(id, v.def.games[v.next]);
}

/* ---------- intro (§5.4) ---------- */
export function renderIntro(container, id, { from = null } = {}) {
  const def = threadDef(id);
  const s = TS.load(id);
  const v = s ? TS.view(s) : { def, passed: new Set(), lives: def.startingLives };
  setHud(hudHtml(v, 'intro'));
  const fromStars = threadChallengeStars(from);
  const going = s && s.status === 'playing' && s.runs.length;
  container.innerHTML = `
    ${fromStars != null ? `<p class="beat-banner" data-beat>${esc(t('thread_beat', { name: t('anon'), n: fromStars, m: TURNS * 3 }))}</p>` : ''}
    <section class="hero-panel">
      <h1 class="h-hero">${esc(titleOf(def))}</h1>
      <p>${esc(t('thread_desc'))}</p>
    </section>
    <ol class="path">${def.games.map((slug, i) => {
      const g = gameOf(slug);
      const done = v.passed && v.passed.has(i);
      return `<li class="step"><span class="step-node" style="background:${colorOf(g)}">${done ? '✓' : i + 1}</span><div><h2>${esc(L(g.title))}</h2><p>${esc(L(g.tagline))}</p></div></li>`;
    }).join('')}</ol>
    <p class="note">${esc(t('thread_lives_note', { n: def.startingLives }))}</p>
    <button class="btn wide" data-start>${esc(going ? t('thread_continue_turn', { n: TS.view(s).next + 1, m: TURNS }) : t('thread_start'))}</button>
    ${going ? `<button class="btn alt wide" data-restart>${esc(t('thread_restart'))}</button>` : ''}`;
  container.querySelector('[data-start]').onclick = () => goPlay(id, from ? 'challenge_link' : (new URLSearchParams(location.search).get('entry') || 'thread_page'), from);
  const rs = container.querySelector('[data-restart]');
  if (rs) rs.onclick = () => { TS.abandon(id); goPlay(id, 'thread_page', from); };
  prefetchGame(def.games[going ? TS.view(s).next : 0]);
  if (fromStars != null) {
    track('challenge_opened', { code: from, thread: id, new_player: Object.keys(store.get('played', {})).length ? 0 : 1 });
    // the challenger's name, if the server knows it within 3 seconds; "a friend" otherwise
    api('GET', '/challenge/' + from, null, { auth: false, timeout: 3000 }).then((c) => {
      const b = container.querySelector('[data-beat]');
      if (b && c && c.creator && c.creator.name) b.textContent = t('thread_beat', { name: c.creator.name, n: fromStars, m: TURNS * 3 });
    }).catch(() => {});
  }
}

/* ---------- turn card (§5.5) ---------- */
/**
 * Between turns, in the game page. v: the view after this run; run: { turn, game, scoreLabel, stars, strip, coins, xp }.
 * onRetry(): replay this turn (same seed). Returns the element.
 */
export function showTurnCard(v, run, { onRetry, goHome }) {
  const failed = !(run.stars > 0);
  const g = gameOf(run.game);
  const nextSlug = v.def.games[v.next];
  const ng = gameOf(nextSlug);
  setHud(hudHtml(v, 'done', run.turn));
  const canRetry = !failed && v.lives > 1 && run.stars < 3;
  const el = h(`<div class="screen turn-card" role="dialog" aria-modal="true" aria-labelledby="tcHead"><div class="screen-inner">
    <section class="result-card" style="--gc:${colorOf(g)}">
      ${failed ? `<p class="kicker">${esc(t('turn_failed'))}</p>` : ''}
      <h2 id="tcHead" class="result-label sm">${esc(L(g.title))}: ${esc(run.scoreLabel)}</h2>
      ${starsHtml(run.stars, 34)}
      ${stripHtml(run.strip)}
    </section>
    ${earnChips({ xp: run.xp, coins: run.coins, extra: `<span class="echip line">${esc(t('lives_n', { n: v.lives }))}</span>` })}
    ${failed ? '' : nextCard({ href: TS.turnUrl(v.def.id, nextSlug), color: colorOf(ng), iconHtml: icon(ng, 40), title: L(ng.title), sub: L(ng.tagline), attrs: 'data-next' })}
    <div class="actions">
      <button class="btn wide" data-primary>${esc(failed ? t('try_again') : t('next_game', { game: L(ng.title) }))}</button>
      ${canRetry ? `<button class="btn alt wide" data-retry>${esc(t('retry_stars'))}</button>` : ''}
    </div>
    <div class="text-links"><a href="${threadPath(v.def.id)}" data-path>${esc(t('thread_path'))}</a><a href="/" data-quit>${esc(t('thread_quit'))}</a></div>
  </div></div>`);
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  if (!failed) prefetchGame(nextSlug);
  q('[data-primary]').onclick = () => {
    if (failed) { el.remove(); onRetry(); return; }
    location.href = TS.turnUrl(v.def.id, nextSlug);
  };
  const rt = q('[data-retry]');
  if (rt) rt.onclick = () => { el.remove(); onRetry(); };
  q('[data-quit]').onclick = (e) => {
    e.preventDefault();
    const s = sheet(`<h2 class="sheet-title">${esc(t('thread_quit_title'))}</h2><p class="muted">${esc(t('thread_quit_body'))}</p>
      <div class="stack"><button class="btn wide" data-keep>${esc(t('keep_playing'))}</button><button class="btn alt wide" data-leave>${esc(t('thread_quit'))}</button></div>`, { label: t('thread_quit_title') });
    s.el.querySelector('[data-keep]').onclick = () => s.close();
    s.el.querySelector('[data-leave]').onclick = () => { s.close(); TS.abandon(v.def.id); goHome ? goHome('thread') : (location.href = '/'); };
  };
  setTimeout(() => q('[data-primary]').focus({ preventScroll: true }), 30);
  return el;
}

/* ---------- receipt (§5.6) ---------- */
/** Fill `container` with the receipt for thread `id` (its saved state). Sends the result (idempotent) for the rank. */
export function renderReceipt(container, id, { after = null } = {}) {
  const s = TS.load(id);
  if (!s) return false;
  const v = TS.view(s);
  const def = v.def;
  setHud(hudHtml(v, 'receipt'));
  const rows = def.games.map((slug, i) => ({ g: gameOf(slug), stars: v.best[i] ? v.best[i].stars : 0, label: v.best[i] ? v.best[i].scoreLabel : '–' }));
  const named = !!player().name;
  const url = threadUrl(def);
  const nextHref = '/t/new';
  const upTitle = def.kind === 'daily' ? t('thread_play_anytime') : t('thread_play_another');
  container.innerHTML = `
    <section class="hero-panel receipt">
      <p class="kicker">${esc(threadName(def))}</p>
      <h1 class="h-hero">${esc(v.out ? t('hud_out') : t('hud_complete'))}</h1>
      <div class="rrows">${rows.map((r) => `<div class="rrow"><span>${esc(L(r.g.title))}</span>${starsHtml(r.stars, 20)}<b>${esc(r.label)}</b></div>`).join('')}</div>
      <p class="rtotal">${esc(t('stars_of', { n: v.stars, m: TURNS * 3 }))} · ${esc(v.out ? t('hud_out') : t('lives_left', { n: v.lives }))}</p>
      ${def.kind === 'daily' && !v.out ? `<p class="rank-line" data-rank><span class="ph" aria-hidden="true"></span></p>` : ''}
    </section>
    <div data-earn>${earnChips({ xp: v.xp, coins: v.coins })}</div>
    <div data-claim></div>
    <div class="actions">
      ${v.out ? `<button class="btn wide" data-again>${esc(def.kind === 'daily' ? t('try_again_unranked') : t('try_again'))}</button>
        <button class="btn alt wide" data-share>${esc(t('share_result'))}</button>`
      : `<button class="btn wide" data-share>${esc(t('share_result'))}</button>
        <button class="btn alt wide" data-challenge>${esc(t('challenge_friend'))}</button>`}
    </div>
    ${nextCard({ href: nextHref, color: 'var(--hero-tint)', iconHtml: threadMark(featured.slice(0, 3).map((g) => g.id), 40), kicker: t('up_next'), title: upTitle,
      sub: def.kind === 'daily' ? t('thread_new_in', { time: untilReset() }) : '' })}
    <h3 class="rule-head">${esc(t('play_single'))}</h3>
    <div class="tiles tiles-4">${featured.map((g) => tile(g)).join('')}</div>`;
  const q = (sel) => container.querySelector(sel);
  if (!named) {
    q('[data-claim]').appendChild(claimForm({ title: t('claim_name'), sub: t('claim_keep_thread'), surface: 'receipt', onDone: () => q('[data-claim]').remove() }));
  }
  bindShareButton(q('[data-share]'), () => ({ text: receiptText(v, rows, ''), url, title: 'Chezable' }), 'receipt');
  const ch = q('[data-challenge]');
  if (ch) {
    const code = (s.challengeCode && threadChallengeStars(s.challengeCode) === v.stars) ? s.challengeCode : threadChallengeCode(v.stars);
    if (s.challengeCode !== code) TS.saveCode(id, code);
    const curl = `${url}?from=${code}`;
    sendQueued('PUT', '/challenges/' + code, { threadId: def.id }).catch(() => {});
    bindShareButton(ch, () => ({ text: t('thread_challenge_text', { n: v.stars, m: TURNS * 3, thread: threadName(def) }), url: curl, title: 'Chezable' }), 'receipt_challenge');
  }
  const again = q('[data-again]');
  if (again) again.onclick = () => { TS.abandon(id); goPlay(id, 'receipt_retry'); };
  // the result (idempotent): rank for the Daily thread, the completion bonus, confirmed coins
  const rank = q('[data-rank]');
  const known = s.result && s.result.server;
  const apply = (res) => {
    if (rank) { if (res && res.rank) rank.textContent = t('rank_today', { n: res.rank }); else rank.remove(); }
    if (res && res.awards && res.awards.length) {
      const bx = res.awards.reduce((a, w) => a + w.xp, 0), bc = res.awards.reduce((a, w) => a + w.coins, 0);
      q('[data-earn]').innerHTML = earnChips({ xp: v.xp + bx, coins: v.coins + bc });
    }
  };
  if (known) apply(known);
  else {
    let done = false;
    const timer = setTimeout(() => { if (!done && rank) rank.remove(); }, 5000);
    // after the last turn's run is in (when the game page just sent it), or the server would see an unfinished thread
    Promise.resolve(after).catch(() => {}).then(() => sendQueued('PUT', `/threads/${def.id}/results/${s.attempt}`, {})).then((res) => {
      done = true; clearTimeout(timer);
      applyEarnings(res);
      TS.setResult(id, { server: res, bonusCoins: 0 });
      apply(res);
    }).catch(() => { done = true; clearTimeout(timer); if (rank) rank.remove(); });
  }
  return true;
}
