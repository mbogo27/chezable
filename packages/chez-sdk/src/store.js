// localStorage under chez:v1:* (spec §4.4). Every access is guarded: storage can be absent or throw.
const NS = 'chez:v1:';

export function get(key, fallback = null) {
  try {
    const v = localStorage.getItem(NS + key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
export function set(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(NS + key);
    else localStorage.setItem(NS + key, JSON.stringify(value));
  } catch (e) { /* private mode or full: play on without persistence */ }
}
export function keys(prefix = '') {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS + prefix)) out.push(k.slice(NS.length));
    }
  } catch (e) {}
  return out;
}
export function dump() {
  const out = {};
  for (const k of keys()) out[k] = get(k);
  return out;
}
export function load(obj) {
  for (const [k, v] of Object.entries(obj || {})) set(k, v);
}

// One-time migration from the prototype keys (spec §4.4). Old keys are deleted afterwards.
export function migrate() {
  if (get('migrated')) return;
  const raw = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const del = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
  const best = (slug, mode, score) => {
    if (score == null || isNaN(score)) return;
    const b = get('best:' + slug, {});
    const k = `${mode}:classic`;
    if (!b[k]) b[k] = { score: +score, at: Date.now() };
    set('best:' + slug, b);
  };
  best('kata-tufaha', 'solo', parseFloat(raw('tufaha.best')));
  best('kata-nusu', 'solo', parseFloat(raw('halfcut.best')));
  best('nyanya-jetpack', 'solo', parseFloat(raw('nyanya.best')));
  best('kata-ndimu', 'solo', parseFloat(raw('ndimu.best')));
  best('ruka-kapu', 'solo', parseFloat(raw('kapu.best')));
  const tl = parseInt(raw('toka.level')); if (tl > 1) set('level:toka', tl);
  const kl = parseInt(raw('kifuniko.level')); if (kl > 1) set('level:kifuniko', kl);
  let muted = false;
  const old = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^(tufaha|halfcut|nyanya|ndimu|kapu|toka|kifuniko|zamia)\./.test(k)) old.push(k);
    }
  } catch (e) {}
  for (const k of old) { if (k.endsWith('.muted') && raw(k) === '1') muted = true; del(k); }
  if (muted) { const p = get('prefs', {}); p.sound = false; set('prefs', p); }
  set('migrated', 1);
}
