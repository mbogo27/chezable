// Sharing (spec v1 §B2): exactly three options, WhatsApp first, then Facebook and Copy link.
// No native share sheet in v1 (it shows every app and defeats the limited-options goal).
import { t } from './i18n.js';
import { sheet, toast, esc } from './ui.js';
import { track } from './net.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]; // cosmetic: which wording, not gameplay

/** Challenge text by end-screen state, a few variants each so messages don't all read the same. */
export function challengeText({ variant = 'default', score, gameTitle, url, them, theirScore, rank }) {
  const v = {
    default: [`I scored ${score} in ${gameTitle} on Chezable. Beat me: ${url}`, `${score} in ${gameTitle}. Think you can beat that? ${url}`, `My score in ${gameTitle}: ${score}. Your turn: ${url}`],
    record: [`New personal best: ${score} in ${gameTitle} on Chezable. Beat me: ${url}`, `Just set my best in ${gameTitle}: ${score}. Can you top it? ${url}`],
    rank: [`I'm #${rank} this week in ${gameTitle} on Chezable with ${score}. Beat me: ${url}`, `#${rank} in ${gameTitle} this week (${score}). Come and knock me off: ${url}`],
    back: [`${them}, I beat your ${theirScore} with ${score} in ${gameTitle}. Your move: ${url}`, `${score} beats ${theirScore}, ${them}. Rematch? ${url}`],
  };
  return pick(v[variant] || v.default);
}

/** The three-option sheet. Returns when it closes. */
export function shareOptions({ text, url, game = null, state = null }) {
  const s = sheet(`
    <h2 style="font-size:24px">${esc(t('share_title'))}</h2>
    <p class="muted" style="word-break:break-word">${esc(text)}</p>
    <div class="stack">
      <a class="btn wa wide" data-via="whatsapp" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${esc(t('share_whatsapp'))}</a>
      <a class="btn alt wide" data-via="facebook" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">${esc(t('share_facebook'))}</a>
      <button class="btn alt wide" data-via="copy">${esc(t('share_copy'))}</button>
      <div class="copy-fallback" hidden><label class="field"><span>${esc(t('share_copy_manual'))}</span><input readonly value="${esc(url)}"></label></div>
      <button class="btn alt wide" data-via="close">${esc(t('close'))}</button>
    </div>`, { label: t('share_title') });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-via]');
    if (!b) return;
    const via = b.dataset.via;
    if (via === 'close') return s.close(false);
    track('share_tap', { channel: via, state_shown: state, game }, game);
    if (via === 'copy') {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(url);
        b.textContent = t('copied_short');
        toast(t('copied'));
      } catch (err) {
        // no clipboard permission: show the link selected so it can be copied by hand
        const fb = s.el.querySelector('.copy-fallback');
        fb.hidden = false;
        const input = fb.querySelector('input');
        input.focus(); input.select();
      }
      return;
    }
    setTimeout(() => s.close(true), 300);
  });
  return s.done;
}

/** End-screen share: the right wording for the state, then the three options. */
export function shareChallenge(o) {
  return shareOptions({ text: challengeText({ ...o, gameTitle: o.gameTitle }), url: o.url, game: o.game, state: o.state });
}

/** Back-compat for shell pages: share any text + link with the same three options. */
export function share({ text, url, game = null }) {
  const full = url && !text.includes(url) ? `${text} ${url}` : text;
  return shareOptions({ text: full, url: url || '', game });
}
