// The standalone end screen (spec 2 §3.3), drawn by the shell from the game's result, never by the game.
// It renders at once from the local result (§1.1): moves or score, stars, best possible, the new-best flag
// from the locally stored best. What only the server knows (weekly rank, confirmed coins) starts as a quiet
// grey placeholder and fills in when the reply arrives; after 5 seconds, or on failure, the rank line hides.
//   result card · +XP +coins · claim your name · Share challenge · Play again / Next level · Next card
//   · Standings  Home · Play more
import { t, L } from './i18n.js';
import { esc, h, announce } from './ui.js';
import { player, track } from './net.js';
import { featured, formatScore } from './catalog.js';
import { scoreDef, compareRuns } from './rules.js';
import { bindShareButton, challengeText } from './share.js';
import { claimForm } from './claim.js';
import { icon, starsHtml, stripHtml, tile, nextCard, threadMark, earnChips, colorOf, leastPlayedToday } from './screens.js';
import { threadDef } from './threads.js';
import { load as loadThread, todayId, view as threadView } from './thread-state.js';
import { threadPath } from './threads.js';

let root = null;
export const closeEndScreen = () => { if (root) { root.remove(); root = null; } };
export const endScreenOpen = () => !!root;

/**
 * ctx: { M, run, result (GameResult), localPb, est {xp, coins}, share: { url, text } | null,
 *        againLabel, playAgain(), goHome(from), extraActions: [{ label, run }], duel }
 * Returns { update(serverReply), giveUp() }.
 */
export function showEndScreen(ctx) {
  closeEndScreen();
  const { M, run: r, result } = ctx;
  const me = player();
  const color = colorOf(M);
  const h2h = r.mode === 'h2h' && r.challenge && r.challenge.creatorScore != null && r.challenge.kind !== 'revive';
  let vs = '';
  if (h2h) {
    const c = r.challenge, them = (c.creator && c.creator.name) || t('anon');
    const cmp = compareRuns(scoreDef(M, 'h2h'), { score: result.score, tiebreak: result.tiebreak }, { score: c.creatorScore, tiebreak: c.creatorTiebreak });
    const theirs = formatScore(M.id, 'h2h', c.creatorScore);
    vs = `<p class="vs-line">${esc(cmp < 0 ? t('vs_won', { name: them, score: theirs }) : cmp > 0 ? t('vs_lost', { name: them, score: theirs }) : t('vs_tie', { name: them }))}</p>`;
  }
  const newBest = ctx.localPb === true && result.stars !== 0;
  const passed = result.stars == null || result.stars > 0;
  const nextLevel = M.levels && r.mode === 'solo' && passed;
  const againLabel = nextLevel ? t('next_level') : t('play_again');

  // the third slot: Today's Thread until it's done, then the game played least today
  const today = threadDef(todayId());
  const ts = loadThread(today.id);
  const threadDone = ts && ts.status !== 'playing';
  let promo;
  if (!threadDone) {
    const v = ts ? threadView(ts) : null;
    promo = nextCard({ href: threadPath(today.id), color: 'var(--hero-tint)', iconHtml: threadMark(today.games, 40), kicker: t('next'),
      title: v && ts.runs.length ? t('thread_continue_turn', { n: v.next + 1, m: 3 }) : t('thread_today'), sub: t('thread_desc_short'), attrs: 'data-promo="thread"' });
  } else {
    const g = leastPlayedToday(M.id);
    promo = nextCard({ href: `/g/${g.id}/`, color: colorOf(g), iconHtml: icon(g, 40), title: L(g.title), sub: L(g.tagline), attrs: `data-promo="${g.id}" data-prefetch="${g.id}"` });
  }
  const others = featured.filter((g) => g.id !== M.id).slice(0, 3);
  const est = ctx.est || {};

  root = h(`<div class="endscreen screen" role="dialog" aria-modal="true" aria-labelledby="esHead">
    <div class="screen-inner">
      <section class="result-card" style="--gc:${color}">
        ${newBest ? `<span class="badge-new">${esc(t('new_best_badge'))}</span>` : ''}
        ${me.name ? `<p class="nice">${esc(t('nice_one', { name: me.name }))}</p>` : ''}
        <h2 id="esHead" class="result-label">${esc(result.scoreLabel)}</h2>
        ${starsHtml(result.stars)}
        ${result.sub ? `<p class="result-sub">${esc(result.sub)}</p>` : ''}
        ${stripHtml(result.strip, true)}
        ${vs}
        <p class="rank-line" data-rank><span class="ph" aria-hidden="true"></span></p>
      </section>
      <div data-earn>${earnChips(est)}</div>
      ${ctx.offline ? `<p class="muted center">${esc(t('result_offline'))}</p>` : ''}
      <div data-claim></div>
      ${ctx.duel ? `<p class="duel-note">${esc(t('duel_note'))}</p>` : ''}
      <div class="actions">
        <button class="btn wide" data-act="share">${esc(ctx.share ? t('share_challenge') : t('share'))}</button>
        <button class="btn alt wide" data-act="again">${esc(againLabel)}</button>
        ${(ctx.extraActions || []).map((x, i) => `<button class="btn alt wide" data-extra="${i}">${esc(x.label)}</button>`).join('')}
      </div>
      ${promo}
      <div class="text-links"><a href="/top/${M.id}" data-act="standings">${esc(t('standings'))}</a><a href="/" data-act="home">${esc(t('home'))}</a></div>
      <h3 class="rule-head">${esc(t('play_more'))}</h3>
      <div class="tiles tiles-${others.length}">${others.map((g) => tile(g)).join('')}</div>
    </div></div>`);
  document.body.appendChild(root);
  const el = root;
  const q = (s) => el.querySelector(s);
  announce(`${result.scoreLabel}. ${result.stars != null ? t('stars_n', { n: result.stars }) : ''}`);

  if (!me.name) {
    const f = claimForm({ title: t('claim_name'), sub: t('claim_keep'), surface: 'end_screen', onDone: (name) => {
      f.remove();
      q('.result-card').insertAdjacentHTML('afterbegin', `<p class="nice">${esc(t('nice_one', { name }))}</p>`);
    } });
    q('[data-claim]').appendChild(f);
  }
  bindShareButton(q('[data-act=share]'), () => (ctx.share ? { ...ctx.share, game: M.id } : { text: t('share_game_text', { game: L(M.title), result: result.scoreLabel }), url: `${location.origin}/g/${M.id}/`, game: M.id }), 'end_screen');
  q('[data-act=again]').onclick = () => { track('rematch_tap', { game: M.id, next_level: nextLevel ? 1 : 0 }, M.id); ctx.playAgain(); };
  el.querySelectorAll('[data-extra]').forEach((b) => (b.onclick = () => ctx.extraActions[+b.dataset.extra].run()));
  q('[data-act=home]').onclick = (e) => { e.preventDefault(); ctx.goHome('result'); };
  q('[data-act=standings]').onclick = () => track('leaderboard_view', { game: M.id, board: 'week', from: 'result' }, M.id);
  const pf = q('[data-prefetch]');
  if (pf && ctx.prefetch) ctx.prefetch(pf.dataset.prefetch);
  setTimeout(() => (q('[data-act=share]')).focus({ preventScroll: true }), 30);

  const rank = q('[data-rank]');
  let settled = false;
  return {
    el,
    /** The server's reply: rank line, confirmed XP and coins. */
    update(res) {
      if (!root || root !== el || settled) return;
      settled = true;
      if (res && res.rank) rank.textContent = t('rank_week', { n: res.rank, game: L(M.title) });
      else rank.remove();
      if (res && res.awards) {
        const xp = res.awards.reduce((a, w) => a + w.xp, 0), coins = res.awards.reduce((a, w) => a + w.coins, 0);
        q('[data-earn]').innerHTML = earnChips({ xp, coins, extra: res.levelUp ? `<span class="echip ok">${esc(t('level_up', { level: res.level }))}</span>` : '' });
      }
    },
    /** No reply in 5 seconds, or it failed: hide the rank line, keep everything else. */
    giveUp() {
      if (!root || root !== el || settled) return;
      settled = true;
      rank.remove();
    },
  };
}

/** The text for "Share challenge". */
export const shareTextFor = (M, label) => challengeText(L(M.title), label);
