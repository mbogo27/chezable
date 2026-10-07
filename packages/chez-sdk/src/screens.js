// Shared screen pieces (spec 2 §3, §5): game icons and tiles, stars, the result strip, the "Next" card,
// earnings chips, the thread HUD and receipt. Game pages and shell pages both build from these.
import { t, L } from './i18n.js';
import { esc } from './ui.js';
import { featured, game as gameOf } from './catalog.js';
import * as store from './store.js';
import { nairobiDay } from './rules.js';
import { threadPath, TURNS } from './threads.js';
import { starText } from './results.js';

export const colorOf = (g) => (g && g.card && g.card.color) || '#E1E5FF';
/** A game's icon (SVG image from its own sprites; emoji for archived games still on the old art). */
export function icon(g, size = 52) {
  const ic = g && g.card && g.card.icon;
  if (ic && ic.startsWith('/')) return `<img class="g-icon" src="${esc(ic)}" alt="" width="${size}" height="${size}" decoding="async">`;
  return `<span class="g-icon emoji" aria-hidden="true" style="font-size:${Math.round(size * 0.7)}px;width:${size}px;height:${size}px">${esc(ic || '🎮')}</span>`;
}

const STAR = 'M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.5 6 20.9l1.3-6.7-5-4.7 6.8-.8z';
export function starsHtml(n, size = 40) {
  if (n == null) return '';
  const one = (on) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="${on ? '#FFD84A' : 'rgba(255,255,255,.55)'}" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  return `<span class="stars" role="img" aria-label="${esc(t('stars_n', { n }))}">${[0, 1, 2].map((i) => one(i < n)).join('')}</span>`;
}
export const stripHtml = (strip, big = false) => (strip && strip.length ? `<span class="strip ${big ? 'big' : ''}" aria-hidden="true">${strip.map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('')}</span>` : '');

/** Small game tile: coloured block, icon, name (Play more, Home hero, receipt). */
export function tile(g, href, { size = 36, cls = '' } = {}) {
  return `<a class="g-tile ${cls}" href="${esc(href || `/g/${g.id}/`)}" style="--gc:${colorOf(g)}">${icon(g, size)}<span>${esc(L(g.title))}</span></a>`;
}
/** The "Next" promo card, in the next thing's colour. */
export function nextCard({ href, color, iconHtml, kicker = t('next'), title, sub = '', attrs = '' }) {
  return `<a class="next-card" href="${esc(href)}" style="--gc:${color}" ${attrs}>
    <span class="next-icon">${iconHtml}</span>
    <span class="next-text"><span class="kicker">${esc(kicker)}</span><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
    <svg class="chev" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>`;
}
/** Today's Thread mark: three dots in the thread's game colours, linked by a dotted line. */
export function threadMark(games, size = 48) {
  const cs = games.map((s) => colorOf(gameOf(s)));
  return `<svg width="${size}" height="${size}" viewBox="0 0 30 30" aria-hidden="true"><path d="M9 15h3M18 15h3" stroke="#111" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0.1 4"/>${cs.map((c, i) => `<circle cx="${6 + i * 9}" cy="15" r="3.4" fill="${c}" stroke="#111" stroke-width="1.6"/>`).join('')}</svg>`;
}

/** Earnings chips: +XP, +coins, and an optional extra chip. */
export function earnChips({ xp = 0, coins = 0, extra = '' } = {}) {
  const out = [];
  if (xp) out.push(`<span class="echip ink" data-xp>${esc(t('xp_earned', { xp }))}</span>`);
  if (coins) out.push(`<span class="echip coins" data-coinsearned>${esc(t('coins_earned', { coins }))}</span>`);
  if (extra) out.push(extra);
  return out.length ? `<div class="echips">${out.join('')}</div>` : '';
}

/* ---------- played today (for "the next game": the one played least today) ---------- */
export function notePlayedToday(slug) {
  const day = nairobiDay();
  const p = store.get('played_today', {});
  const counts = p.day === day ? p.counts || {} : {};
  counts[slug] = (counts[slug] || 0) + 1;
  store.set('played_today', { day, counts });
}
export function leastPlayedToday(except) {
  const p = store.get('played_today', {});
  const counts = p.day === nairobiDay() ? p.counts || {} : {};
  const list = featured.filter((g) => g.id !== except);
  // fewest plays today, then catalogue order after the current game so it cycles
  const start = featured.findIndex((g) => g.id === except);
  const order = (g) => (featured.indexOf(g) - start + featured.length) % featured.length;
  return list.slice().sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0) || order(a) - order(b))[0];
}

/* ---------- thread HUD (spec 2 §5.2) ---------- */
const TICK = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const heart = (on) => `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.4-4.5-9.4-9C1.1 8.1 3.2 4.5 6.8 4.5c2.1 0 3.5 1.1 4.2 2.5h2c.7-1.4 2.1-2.5 4.2-2.5 3.6 0 5.7 3.6 4.2 7-2 4.5-9.4 9-9.4 9z" fill="${on ? 'var(--heart)' : 'none'}" stroke="${on ? 'var(--heart)' : 'var(--muted)'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
/**
 * v: a thread view (thread-state.view) or { def, passed:Set, lives }. stage: 'intro' | 'play' | 'done' | 'receipt'.
 * current: the turn being played (or just played).
 */
export function hudHtml(v, stage, current = 0) {
  const label = stage === 'intro' ? t('hud_intro', { n: TURNS, l: v.def.startingLives })
    : stage === 'receipt' ? (v.out ? t('hud_out') : t('hud_complete'))
    : stage === 'done' ? t('hud_turn_done', { n: current + 1, m: TURNS }) : t('hud_turn', { n: current + 1, m: TURNS });
  const nodes = v.def.games.map((s, i) => {
    const done = v.passed && v.passed.has(i);
    const cur = !done && stage === 'play' && i === current;
    const bg = done || cur || (stage === 'done' && i === current) ? colorOf(gameOf(s)) : 'var(--surface)';
    return `<span class="hud-node ${done ? 'done' : ''} ${cur ? 'current' : ''}" style="background:${bg}" title="${esc(L(gameOf(s).title))}">${done ? TICK : ''}</span>`;
  }).join('<span class="hud-link"></span>');
  const lives = v.lives ?? v.def.startingLives;
  return `<span class="hud-label">${esc(label)}</span>
    <span class="hud-nodes" role="img" aria-label="${esc(t('hud_nodes', { n: v.passed ? v.passed.size : 0, m: TURNS }))}">${nodes}</span>
    <span class="hud-hearts" role="img" aria-label="${esc(t('lives_n', { n: lives }))}">${[0, 1, 2].map((i) => heart(i < lives)).join('')}</span>`;
}

/* ---------- thread receipt (spec 2 §5.6) ---------- */
export function fmtDay(day) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function threadName(def) {
  return def.kind === 'daily' ? `${t('thread_today')} · ${fmtDay(def.day)}` : t('thread_anytime');
}
/** The text receipt for "Share result". */
export function receiptText(v, rows, url) {
  const w = Math.max(...rows.map((r) => L(r.g.title).length));
  return [`Chezable · ${threadName(v.def)}`,
    ...rows.map((r) => `${L(r.g.title).padEnd(w, ' ')} ${starText(r.stars)}`),
    `${t('stars_of', { n: v.stars, m: TURNS * 3 })} · ${v.out ? t('hud_out') : t('lives_left', { n: v.lives })}`,
    url].join('\n');
}
export const threadUrl = (def) => location.origin + threadPath(def.id);
/** Time until the next Nairobi midnight, as "6h 12m". */
export function untilReset() {
  const now = Date.now(), eat = now + 3 * 3600000;
  const next = Math.ceil(eat / 86400000) * 86400000 - 3 * 3600000;
  const m = Math.max(1, Math.round((next - now) / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
