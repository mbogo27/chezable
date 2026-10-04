// End screens (spec v1 §B4): fullscreen, one state at a time, chosen by priority.
//   1 first game (claim a name) · 5 beat a challenge · 6 lost a challenge · 2 new best · 3 rank moved
//   4 near miss · 7 default
// Layout: headline, score block, reserved media area (v2 replay clip), primary, secondary, Home.
// Also hosts the inline name claim (§B1) and the three-option share sheet (§B2).
import * as store from './store.js';
import { t, L } from './i18n.js';
import { api, track, player, savePlayer, refreshMe } from './net.js';
import { esc, h, announce } from './ui.js';
import { formatScore } from './catalog.js';
import { nameFormatProblem, suggestName } from './names.js';
import { shareChallenge } from './share.js';

const MAX_PROMPTS = 3;
let root = null;
export const closeEndScreen = () => { if (root) { root.remove(); root = null; } };
export const endScreenOpen = () => !!root;

/** ?force_state=1..7 (or localStorage chez:v1:force_state) shows a given state with test values. */
function forcedState() {
  const q = new URLSearchParams(location.search).get('force_state');
  const v = q || store.get('force_state');
  return v ? Number(v) : null;
}

function pickState({ res, r, named, promptsLeft, localPb }) {
  const forced = forcedState();
  if (forced) return forced;
  const ch = res && res.challenge;
  const fromLink = r.mode === 'h2h' && ch && ch.kind === 'beat';
  if (!named && promptsLeft && !fromLink) return 1;
  if (fromLink) return ch.result === 'win' ? 5 : 6;
  if ((res && res.pb) || (!res && localPb === true)) return 2;
  if (res && res.rank && res.prevRank && res.rank < res.prevRank) return 3;
  if (nearMiss(res)) return 4;
  return 7;
}
/** Within 10% of your personal best, or within 10% of the score of the player just above you. */
function nearMiss(res) {
  if (!res || res.pb) return null;
  const s = res.score, out = [];
  if (res.prevBest != null && res.prevBest !== 0) {
    const gap = Math.abs(res.prevBest - s);
    if (gap > 0 && gap <= Math.abs(res.prevBest) * 0.1) out.push(gap);
  }
  if (res.next && res.next.gap > 0 && res.next.gap <= Math.max(1, Math.abs(s) * 0.1)) out.push(res.next.gap);
  return out.length ? Math.min(...out) : null;
}

/**
 * Show the end screen. `ctx` carries the stage pieces it needs:
 *   M, run, result, res (server reply, or null offline), localPb, offline, scoreTxt,
 *   playAgain(), rematch(), createChallenge(opts) -> {url}, goHome(from), openStandings()
 */
export function showEndScreen(ctx) {
  closeEndScreen();
  const { M, run: r, result } = ctx;
  const res = ctx.res ? { ...ctx.res, score: result.score } : null;
  const fmt = (s) => formatScore(M.id, r.mode === 'h2h' ? 'h2h' : r.mode, s);
  const gapFmt = (g) => fmt(Math.round(g * 100) / 100).replace(/ off$/, '');
  const me = player();
  const named = !!me.name;
  const prompts = store.get('claim_prompts', 0);
  const promptsLeft = prompts < MAX_PROMPTS && !ctx.afterClaim; // Skip shows the rest of the screen without the prompt
  const state = pickState({ res, r, named, promptsLeft, localPb: ctx.localPb });
  const ch = res && res.challenge;
  const them = (ch && ch.creatorName) || t('anon');
  const scoreTxt = ctx.scoreTxt;
  const showClaim = !named && promptsLeft && (state === 1 || state === 5 || state === 6);
  if (showClaim) { store.set('claim_prompts', prompts + 1); track('name_claim_shown', { state: state }, M.id); }

  // ---------- headline + actions per state ----------
  let head = '', primary = null, secondary = null;
  const playAgain = { label: t('play_again'), run: () => { track('rematch_tap', { game: M.id, state_shown: state }, M.id); ctx.playAgain(); } };
  const shareIt = (variant, opts = {}) => async () => {
    const c = await ctx.createChallenge(opts);
    if (!c) return;
    await shareChallenge({ game: M.id, gameTitle: L(M.title), url: c.url, score: c.scoreText || scoreTxt, them, theirScore: ch ? fmt(ch.creatorScore) : '', rank: res && res.rank, variant, state });
  };
  switch (state) {
    case 1:
      head = t('es_first');
      break;
    case 2:
      head = t('es_best', { score: scoreTxt });
      primary = { label: t('es_share_challenge'), run: shareIt('record'), blue: true };
      secondary = playAgain;
      break;
    case 3: {
      const n = (res && res.rank) || 2, up = res && res.prevRank && res.rank ? Math.max(1, res.prevRank - res.rank) : 1;
      head = t('es_rank', { n, x: up });
      primary = { label: t('share'), run: shareIt('rank'), blue: true };
      secondary = n > 1 ? { label: t('es_beat_rank', { n: n - 1 }), run: playAgain.run } : playAgain;
      break;
    }
    case 4:
      head = t('es_near', { gap: gapFmt(nearMiss(res) ?? (forcedState() ? 1 : 0)) });
      primary = playAgain;
      break;
    case 5:
      head = t('es_beat', { name: them });
      primary = { label: t('es_challenge_back', { name: them }), run: shareIt('back', { targetId: ch && ch.creatorId }), blue: true };
      secondary = playAgain;
      break;
    case 6: {
      const tie = ch && ch.result === 'tie';
      const gap = ch ? Math.abs(ch.creatorScore - result.score) : 0;
      head = tie ? t('es_tie', { name: them }) : t('es_lost', { name: them, gap: gapFmt(gap) });
      primary = { label: t('es_rematch'), run: () => { track('rematch_tap', { game: M.id, state_shown: state }, M.id); ctx.rematch(); } };
      secondary = { label: t('es_someone_new'), run: shareIt('default') };
      break;
    }
    default:
      head = t('es_default');
      primary = playAgain;
      secondary = { label: t('challenge'), run: shareIt('default'), blue: true };
  }

  // ---------- score block ----------
  const best = res && res.best != null ? res.best : null;
  const vs = ch && r.mode === 'h2h' ? `<div class="vs">
      <div class="side ${ch.result === 'win' ? 'won' : ''}"><span>${esc(me.name || t('you'))}</span><b>${esc(scoreTxt)}</b></div>
      <div class="mid">vs</div>
      <div class="side ${ch.result === 'loss' ? 'won' : ''}"><span>${esc(them)}</span><b>${esc(fmt(ch.creatorScore))}</b></div></div>` : '';
  const scoreBlock = vs || `<p class="result-score">${esc(scoreTxt)}</p>
    <p class="muted es-meta">${best != null && state !== 2 ? esc(t('result_best', { best: fmt(best) })) : ''}${res && res.rank ? `${best != null && state !== 2 ? ' · ' : ''}${esc(t('es_rank_short', { n: res.rank }))}` : ''}</p>`;
  const color = (M.card && M.card.color) || '#F26B1D';
  const media = `<div class="es-media" style="--c:${color}" aria-hidden="true"><span class="es-media-icon">${(M.card && M.card.icon) || ''}</span><span class="es-media-score">${esc(scoreTxt)}</span></div>`;
  const earn = earnChips(res);
  const claim = showClaim ? claimPanel() : '';
  const chip = !named && prompts >= MAX_PROMPTS ? `<button class="chip blue es-claim-chip" data-claimchip>${esc(t('claim_name'))}</button>` : '';
  const assistTag = r.assist ? `<span class="pill assist">${esc(t('assist_run'))}</span>` : '';
  const counted = ch && ch.counted === false ? `<p class="muted">${esc(t('practice_run'))}</p>` : '';
  const offline = ctx.offline ? `<p class="muted">${esc(t('result_offline'))}</p>` : '';
  const skin = ctx.skin;
  const brand = skin && skin.cta ? `<a class="btn blue wide" href="${esc(skin.cta.url)}" target="_blank" rel="noopener">${esc(skin.cta.label)}</a>` : '';

  root = h(`<div class="endscreen" role="dialog" aria-modal="true" aria-labelledby="esHead" data-state="${state}">
    <div class="es-inner">
      ${chip}${assistTag}
      <h2 id="esHead" class="es-head">${esc(head)}</h2>
      <div class="es-score">${scoreBlock}${result.sub ? `<p class="muted es-sub">${esc(result.sub)}</p>` : ''}${counted}</div>
      ${media}
      ${earn}${offline}
      ${claim}
      <div class="es-actions">
        ${primary ? `<button class="btn wide ${primary.blue ? 'blue' : ''}" data-act="primary">${esc(primary.label)}</button>` : ''}
        ${secondary ? `<button class="btn alt wide" data-act="secondary">${esc(secondary.label)}</button>` : ''}
        ${(ctx.extraActions || []).map((x, i) => `<button class="btn alt wide" data-extra="${i}">${esc(x.label)}</button>`).join('')}
      </div>
      ${brand}
      <div class="es-foot">
        <a class="es-link" href="/top/${M.id}" data-act="standings">${esc(t('leaderboard'))}</a>
        <a class="es-link" href="/" data-act="home">${esc(t('home'))}</a>
      </div>
    </div></div>`);
  document.body.appendChild(root);
  announce(`${head} ${scoreTxt}`);
  track('game_end', { game: M.id, score: result.score, duration: Math.round(performance.now() - r.t0), state_shown: state }, M.id);

  const q = (s) => root.querySelector(s);
  if (primary) q('[data-act=primary]').onclick = primary.run;
  if (secondary) q('[data-act=secondary]').onclick = secondary.run;
  root.querySelectorAll('[data-extra]').forEach((b) => (b.onclick = () => ctx.extraActions[+b.dataset.extra].run()));
  q('[data-act=home]').onclick = (e) => { e.preventDefault(); ctx.goHome('result'); };
  q('[data-act=standings]').onclick = () => track('leaderboard_view', { game: M.id, board: 'week', from: 'result' }, M.id);
  const chipBtn = q('[data-claimchip]');
  if (chipBtn) chipBtn.onclick = () => { chipBtn.remove(); q('.es-actions').insertAdjacentElement('beforebegin', h(claimPanel())); bindClaim(); };
  if (showClaim) bindClaim();
  // focus the first meaningful control
  setTimeout(() => (q('#esName') || q('[data-act=primary]') || q('[data-act=home]')).focus({ preventScroll: true }), 30);

  function claimPanel() {
    return `<form class="es-claim" data-claim novalidate>
      <label for="esName" class="es-claim-label">${esc(state === 1 ? t('es_claim_lead') : t('claim_prompt'))}</label>
      <div class="es-claim-row">
        <input id="esName" name="name" maxlength="16" autocomplete="nickname" autocapitalize="off" spellcheck="false" placeholder="${esc(t('es_name_placeholder'))}" aria-describedby="esHint esErr">
        <button type="button" class="btn alt small" data-suggest>${esc(t('es_suggest'))}</button>
      </div>
      <p class="hint" id="esHint">${esc(t('es_name_hint'))} ${esc(t('es_device_note'))}</p>
      <p class="error" id="esErr" role="alert"></p>
      <div class="es-claim-actions">
        <button class="btn wide" type="submit">${esc(t('es_save_name'))}</button>
        ${state === 1 ? `<button class="btn alt wide" type="button" data-skip>${esc(t('es_skip'))}</button>
        <button class="btn alt wide" type="button" data-again>${esc(t('play_again'))}</button>` : ''}
      </div>
    </form>`;
  }
  function bindClaim() {
    const f = q('[data-claim]');
    const input = f.querySelector('#esName'), err = f.querySelector('#esErr');
    f.querySelector('[data-suggest]').onclick = () => { input.value = suggestName(); err.textContent = ''; input.focus(); };
    const skip = f.querySelector('[data-skip]');
    if (skip) skip.onclick = () => { track('name_claim_skip', {}, M.id); showEndScreen({ ...ctx, afterClaim: true }); };
    const again = f.querySelector('[data-again]');
    if (again) again.onclick = playAgain.run;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      const local = nameFormatProblem(name);
      if (local) { err.textContent = t(local === 'name_blocked' ? 'name_bad' : local === 'name_digits' ? 'name_digits' : 'name_invalid'); track('name_rejected', { tier: local === 'name_blocked' ? 'reserved' : 'format' }, M.id); return; }
      err.textContent = '';
      f.querySelector('[type=submit]').disabled = true;
      try {
        const out = await api('POST', '/player/name', { name });
        savePlayer({ name: out.handle });
        if (out.recovery) store.set('recovery', out.recovery);
        track('name_claimed', {}, M.id);
        refreshMe().catch(() => {});
        announce(t('name_claimed'));
        // the score now counts on the boards: re-show the screen in its next state
        showEndScreen(ctx);
      } catch (ex) {
        f.querySelector('[type=submit]').disabled = false;
        const code = ex && ex.code;
        err.textContent = ex && ex.offline ? t('offline') : code === 'name_taken' ? t('name_taken') : code === 'name_invalid' ? t('name_invalid') : code === 'name_change_wait' ? t('name_wait') : t('name_bad');
        track('name_rejected', { tier: code === 'name_taken' ? 'taken' : code === 'name_invalid' ? 'format' : 'moderation' }, M.id);
      }
    };
  }
}

function earnChips(res) {
  if (!res) return '';
  const xp = (res.awards || []).reduce((a, w) => a + w.xp, 0);
  const coins = (res.awards || []).reduce((a, w) => a + w.coins, 0);
  const chips = [];
  if (xp) chips.push(`<span class="chip blue">${esc(t('xp_earned', { xp }))}</span>`);
  if (coins) chips.push(`<span class="chip tape"><img class="coin" src="/icons/coin.svg" alt="" width="16" height="16">${esc(t('coins_earned', { coins }))}</span>`);
  if (res.levelUp) chips.push(`<span class="chip ok">${esc(t('level_up', { level: res.level }))}</span>`);
  return chips.length ? `<div class="earn">${chips.join('')}</div>` : '';
}
