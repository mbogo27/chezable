// The one shared header (spec 2 §2.3), rendered on every page: shell pages and every game, including mid-run.
//   left: menu button · centre: the Chezable logo, linking Home · right: the coin chip
// A second row carries the thread HUD in thread mode; during play the header collapses to a slim 44 px.
// No page writes its own header markup: they all call headerHtml() / mountHeader().
import { t } from './i18n.js';
import { esc, h, sheet } from './ui.js';
import { cachedMe, on as onNet } from './net.js';
import * as store from './store.js';
import { logoSvg } from './logo.js';

const menuSvg = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
const coins = () => { const m = cachedMe(); return m && m.coins != null ? m.coins : 0; };

export function headerHtml() {
  const n = coins();
  return `<header class="chez-header" data-header>
    <div class="hdr-row">
      <button class="hdr-menu" type="button" data-menu aria-label="${esc(t('menu'))}" aria-haspopup="dialog">${menuSvg}<i class="hdr-dot" data-menudot hidden></i></button>
      <a class="hdr-logo" href="/" data-home aria-label="${esc(t('home_label'))}">${logoSvg}</a>
      <a class="coin-chip" href="/me" data-coins aria-label="${esc(t('coins_n', { n }))}"><span class="chip-in"><img class="coin" src="/icons/coin.svg" alt="" width="22" height="22"><span data-n>${n}</span></span></a>
    </div>
    <div class="thread-hud" data-hud hidden></div>
  </header>`;
}

let el = null;
/**
 * Wire up a header already in the page (or insert one at the top of <body>).
 * opts.onHome(e): optional; called instead of following the logo link (a run in progress asks first).
 * opts.menu(): optional extra section for the menu sheet, as { html, bind(sheetEl, close) }.
 */
export function mountHeader(opts = {}) {
  el = document.querySelector('[data-header]');
  if (!el) { el = h(headerHtml()); document.body.insertBefore(el, document.body.firstChild); }
  el.querySelector('[data-menu]').addEventListener('click', () => openSiteMenu(opts.menu ? opts.menu() : null));
  if (opts.onHome) el.querySelector('[data-home]').addEventListener('click', (e) => { e.preventDefault(); opts.onHome(e); });
  setWaiting(store.get('waiting', 0));
  return el;
}
export function setCoins(n) {
  if (!el) el = document.querySelector('[data-header]');
  if (!el) return;
  const a = el.querySelector('[data-coins]');
  a.querySelector('[data-n]').textContent = n;
  a.setAttribute('aria-label', t('coins_n', { n }));
}
onNet('me', () => setCoins(coins()));
/** Thread HUD row (spec 2 §5.2): html, or null to hide it. */
export function setHud(html) {
  if (!el) el = document.querySelector('[data-header]');
  if (!el) return;
  const hud = el.querySelector('[data-hud]');
  hud.hidden = !html;
  hud.innerHTML = html || '';
  document.body.classList.toggle('has-hud', !!html);
}
/** The slim 44 px header during active gameplay (it never disappears). */
export function setSlim(on) { document.body.classList.toggle('hdr-slim', !!on); }
/** A dot on the menu button when challenges are waiting for you. */
export function setWaiting(n) {
  store.set('waiting', n || 0);
  const d = (el || document).querySelector('[data-menudot]');
  if (d) d.hidden = !n;
}

/** The menu sheet: site navigation, then the page's own section (a game's settings), then the small print. */
export function openSiteMenu(extra = null) {
  const waiting = store.get('waiting', 0);
  const here = location.pathname;
  const link = (href, label, badge) => `<a class="menu-link" href="${href}"${here === href ? ' aria-current="page"' : ''}><span>${esc(label)}</span>${badge ? `<i class="count">${badge}</i>` : ''}</a>`;
  const s = sheet(`<h2 class="sheet-title">${esc(t('menu'))}</h2>
    <nav class="menu-nav" aria-label="${esc(t('menu'))}">
      ${link('/', t('home'))}
      ${link('/t/today', t('thread_today'))}
      ${link('/standings', t('standings'))}
      ${link('/challenges', t('challenges'), waiting)}
      ${link('/me', t('profile'))}
    </nav>
    ${extra ? `<div class="menu-extra">${extra.html}</div>` : ''}
    <p class="menu-foot"><a href="/about">${esc(t('about'))}</a><a href="/privacy">${esc(t('privacy'))}</a><a href="/terms">${esc(t('terms'))}</a></p>`,
  { label: t('menu'), onClose: extra && extra.onClose });
  if (extra && extra.bind) extra.bind(s.el, s.close);
  return s;
}
