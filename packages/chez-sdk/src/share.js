// Sharing (spec §6.1): Web Share API first; otherwise a sheet with WhatsApp first, copy link, SMS.
import { t } from './i18n.js';
import { sheet, toast, esc } from './ui.js';
import { track } from './net.js';

export async function share({ text, url, game = null, kind = 'score' }) {
  track('share.tap', { kind }, game);
  const full = url ? `${text} ${url}` : text;
  if (navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text });
      track('share.done', { kind, via: 'native' }, game);
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
  }
  const s = sheet(`
    <h2 style="font-size:24px">${esc(t('share_title'))}</h2>
    <p class="muted" style="margin:0;word-break:break-word">${esc(full)}</p>
    <div class="stack">
      <a class="btn wa wide" data-via="whatsapp" href="https://wa.me/?text=${encodeURIComponent(full)}" target="_blank" rel="noopener">${esc(t('share_whatsapp'))}</a>
      <button class="btn alt wide" data-via="copy">${esc(t('share_copy'))}</button>
      <a class="btn alt wide" data-via="sms" href="sms:?&body=${encodeURIComponent(full)}">${esc(t('share_sms'))}</a>
      <button class="btn alt wide" data-via="close">${esc(t('close'))}</button>
    </div>`, { label: t('share_title') });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-via]');
    if (!b) return;
    const via = b.dataset.via;
    if (via === 'close') return s.close(false);
    if (via === 'copy') {
      e.preventDefault();
      try { await navigator.clipboard.writeText(full); toast(t('copied')); }
      catch (err) { toast(t('share_unavailable')); return; }
    }
    track('share.done', { kind, via }, game);
    s.close(true);
  });
  return s.done;
}
