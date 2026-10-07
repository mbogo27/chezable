// Sharing (spec 2 §1.2). The link is made on the device before the tap, so a tap never waits for the network:
// the share chain runs inside the click handler, keeping the tap's user activation (Android Chrome refuses
// navigator.share() after an await on the network).
//   1. navigator.share({ title, text, url })   2. open wa.me with the text   3. copy the link ("Link copied")
import { t } from './i18n.js';
import { toast, esc, sheet } from './ui.js';
import { track } from './net.js';

/** "I did <game> in <result>. Can you beat me?" plus the link on its own line. */
export const challengeText = (gameTitle, result) => t('share_challenge_text', { game: gameTitle, result });

function copyFallback(url) {
  // no clipboard permission: show the link selected, so it can be copied by hand
  const s = sheet(`<h2 class="sheet-title">${esc(t('share_copy_manual'))}</h2>
    <label class="field"><span class="sr-only">${esc(t('share_link'))}</span><input readonly value="${esc(url)}" data-link></label>
    <button class="btn wide" data-x>${esc(t('close'))}</button>`, { label: t('share_copy_manual') });
  const i = s.el.querySelector('[data-link]');
  setTimeout(() => { i.focus(); i.select(); }, 40);
  s.el.querySelector('[data-x]').onclick = () => s.close();
}

/**
 * Run the share chain. Call it synchronously from the click handler, with no await before it.
 * done(state) is called with 'shared' | 'copied' | 'idle' (cancelled) | 'failed'.
 */
export function shareNow({ title = 'Chezable', text, url, surface = 'end_screen', game = null }, done = () => {}) {
  const full = url && !text.includes(url) ? `${text}\n${url}` : text;
  const props = (method, extra = {}) => ({ surface, method, game, ...extra });
  if (typeof navigator !== 'undefined' && navigator.share) {
    track('share_tapped', props('native'));
    navigator.share(url ? { title, text, url } : { title, text }).then(() => {
      track('share_completed', props('native')); done('shared');
    }).catch((e) => {
      if (e && e.name === 'AbortError') { track('share_failed', props('native', { reason: 'cancelled' })); done('idle'); return; }
      track('share_failed', props('native', { reason: (e && e.name) || 'error' }));
      // the share sheet refused (no activation, not allowed): fall through to WhatsApp, then the clipboard
      whatsappOrCopy(full, url, props, done, false);
    });
    return;
  }
  whatsappOrCopy(full, url, props, done, true);
}
function whatsappOrCopy(full, url, props, done, tapped) {
  if (tapped) track('share_tapped', props('whatsapp'));
  let win = null;
  try { win = window.open('https://wa.me/?text=' + encodeURIComponent(full), '_blank'); } catch (e) { win = null; }
  if (win) {
    try { win.opener = null; } catch (e) {}
    track('share_completed', props('whatsapp'));
    return done('shared');
  }
  // pop-up blocked: copy the link instead
  copyLink(url || full, props, done);
}
function copyLink(text, props, done) {
  track('share_tapped', props('clipboard'));
  const ok = () => { track('share_completed', props('clipboard')); toast(t('copied')); done('copied'); };
  const fail = () => { track('share_failed', props('clipboard', { reason: 'denied' })); copyFallback(text); done('failed'); };
  try { navigator.clipboard.writeText(text).then(ok, fail); } catch (e) { fail(); }
}
/** Copy a link straight away (the "copy" path on its own). */
export function copyNow(url, surface = 'end_screen', game = null) {
  copyLink(url, (method, extra = {}) => ({ surface, method, game, ...extra }), () => {});
}

/**
 * A share button: idle label → "Shared" / "Link copied" for 2 seconds → idle again. No state lasts over 3 s.
 * payload() is called on the tap and must return synchronously { title, text, url, game }.
 */
export function bindShareButton(btn, payload, surface) {
  const idle = btn.textContent;
  let timer = null;
  btn.addEventListener('click', () => {
    const p = payload();
    if (!p) return;
    shareNow({ ...p, surface }, (state) => {
      clearTimeout(timer);
      if (state === 'shared' || state === 'copied') {
        btn.textContent = state === 'shared' ? t('shared_short') : t('copied_short');
        timer = setTimeout(() => { btn.textContent = idle; }, 2000);
      } else btn.textContent = idle;
    });
  });
}

/** Back-compat for shell pages: share any text and link the same way. */
export function share({ text, url, game = null, surface = 'page' }) {
  shareNow({ text, url, game, surface });
}
