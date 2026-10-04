// Small DOM helpers: toast, aria-live announcer, bottom sheet, escaping.
import { t } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

let toastEl = null, toastTimer = null;
export function toast(text, ms = 2400) {
  if (!toastEl) { toastEl = h('<div class="toast" role="status" aria-live="polite"></div>'); document.body.appendChild(toastEl); }
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

let liveEl = null;
/** Screen-reader announcement (scores, lives, turns, results). */
export function announce(text, assertive = false) {
  if (!liveEl) {
    liveEl = h('<div class="sr-only" aria-live="polite" aria-atomic="true"></div>');
    document.body.appendChild(liveEl);
  }
  liveEl.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  liveEl.textContent = '';
  setTimeout(() => { liveEl.textContent = text; }, 30);
}

/**
 * Bottom sheet (a centred card on wide screens). Returns { el, close, done } where done resolves on close.
 * Focus moves into the sheet and returns to the opener; Esc closes unless `locked`.
 */
const openSheets = [];
export function sheet(html, { label = '', locked = false, onClose } = {}) {
  const wrap = h(`<div class="sheet-wrap show"><div class="sheet" role="dialog" aria-modal="true" ${label ? `aria-label="${esc(label)}"` : ''}>${html}</div></div>`);
  const opener = document.activeElement;
  document.body.appendChild(wrap);
  const el = wrap.firstElementChild;
  let resolve;
  const done = new Promise((r) => (resolve = r));
  let closed = false;
  function close(value) {
    if (closed) return;
    closed = true;
    wrap.remove();
    openSheets.splice(openSheets.indexOf(api), 1);
    document.removeEventListener('keydown', onKey, true);
    if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    onClose && onClose(value);
    resolve(value);
  }
  function onKey(e) {
    if (openSheets[openSheets.length - 1] !== api) return;
    if (e.key === 'Escape' && !locked) { e.preventDefault(); e.stopPropagation(); close(null); }
    if (e.key === 'Tab') {
      const f = [...el.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  if (!locked) wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(null); });
  const api = { el, close, done, wrap };
  openSheets.push(api);
  setTimeout(() => {
    const f = el.querySelector('[autofocus],.btn,button,a[href],input');
    if (f) f.focus({ preventScroll: true });
  }, 30);
  return api;
}
export const anySheetOpen = () => openSheets.length > 0;

export function relAge(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return t('age_now');
  if (s < 3600) return t('age_min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('age_hr', { n: Math.floor(s / 3600) });
  return t('age_day', { n: Math.floor(s / 86400) });
}
