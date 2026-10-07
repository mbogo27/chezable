// Name claim (spec 2 §3.4): an inline input and a Claim button, no signup. 3 to 16 letters, numbers or
// underscores, unique ignoring case. Availability is checked as the player types (debounced 300 ms).
// The name binds to this device's player id, so every score already set here, this one included, moves to it.
import { t } from './i18n.js';
import { esc, h, announce, sheet } from './ui.js';
import { api, track, savePlayer, refreshMe, player } from './net.js';
import * as store from './store.js';
import { nameFormatProblem } from './names.js';

const errText = (code) => t(code === 'name_taken' ? 'name_taken_try' : code === 'name_invalid' ? 'name_invalid' : code === 'name_digits' ? 'name_digits'
  : code === 'name_change_wait' ? 'name_wait' : code === 'offline' ? 'offline' : 'name_bad');

/**
 * Returns an element: { title, sub } heading, the input row, and the inline message line.
 * onDone(name) runs after a successful claim. surface goes to the name_claimed event.
 */
export function claimForm({ title = t('claim_name'), sub = '', surface = 'end_screen', onDone = () => {}, dark = false } = {}) {
  const id = 'nm' + Math.random().toString(36).slice(2, 7);
  const el = h(`<form class="claim ${dark ? 'dark' : ''}" novalidate data-claimform>
    <label class="claim-title" for="${id}">${esc(title)}</label>
    ${sub ? `<p class="claim-sub">${esc(sub)}</p>` : ''}
    <div class="claim-row">
      <input id="${id}" name="name" maxlength="16" autocomplete="nickname" autocapitalize="off" spellcheck="false" placeholder="${esc(t('es_name_placeholder'))}" aria-describedby="${id}m">
      <button class="btn" type="submit">${esc(t('claim_short'))}</button>
    </div>
    <p class="claim-msg" id="${id}m" role="status"></p>
  </form>`);
  const input = el.querySelector('input'), msg = el.querySelector('.claim-msg'), btn = el.querySelector('[type=submit]');
  let timer = null, seq = 0;
  const say = (text, bad) => { msg.textContent = text; msg.classList.toggle('bad', !!bad); };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const name = input.value.trim();
    say('');
    if (name.length < 3) return;
    const local = nameFormatProblem(name);
    if (local) return say(errText(local), true);
    const mine = ++seq;
    timer = setTimeout(async () => {
      try {
        const r = await api('GET', '/names/' + encodeURIComponent(name), null, { auth: !!player().registered, timeout: 4000 });
        if (mine !== seq) return;
        say(r.available ? t('name_free') : errText(r.reason), !r.available);
      } catch (e) { /* offline: the claim itself will say */ }
    }, 300);
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    const local = nameFormatProblem(name);
    if (local) { say(errText(local), true); track('name_rejected', { tier: local === 'name_blocked' ? 'reserved' : 'format' }); return; }
    btn.disabled = true;
    try {
      const out = await api('POST', '/player/name', { name });
      savePlayer({ name: out.handle });
      if (out.recovery) store.set('recovery', out.recovery);
      track('name_claimed', { surface });
      announce(t('name_claimed'));
      refreshMe().catch(() => {});
      onDone(out.handle);
    } catch (ex) {
      btn.disabled = false;
      const code = ex && ex.offline ? 'offline' : ex && ex.code;
      say(errText(code), true);
      track('name_rejected', { tier: code === 'name_taken' ? 'taken' : code === 'name_invalid' ? 'format' : 'moderation' });
    }
  });
  return el;
}

/** The claim form in a sheet (Home's claim card, the start screen's "Claim your name"). */
export function claimSheet(surface, onDone = () => {}) {
  const s = sheet('<div data-slot></div>', { label: t('claim_name') });
  const f = claimForm({ title: t('claim_name'), sub: t('claim_card_sub'), surface, onDone: (n) => { s.close(); onDone(n); } });
  s.el.querySelector('[data-slot]').replaceWith(f);
  setTimeout(() => f.querySelector('input').focus(), 40);
  return s;
}
