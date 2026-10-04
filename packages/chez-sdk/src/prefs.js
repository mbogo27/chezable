import * as store from './store.js';

const listeners = new Set();
const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function defaults() {
  const nav = (typeof navigator !== 'undefined' && (navigator.language || '')).toLowerCase();
  return {
    lang: nav.startsWith('sw') ? 'sw' : 'en',
    sound: true,          // open decision 6: on by default, visible mute, remembered
    haptics: true,
    reducedMotion: !!(mql && mql.matches),
    assist: false,
  };
}

let state = Object.assign(defaults(), store.get('prefs', {}));

export const prefs = {
  get lang() { return state.lang; },
  get sound() { return state.sound; },
  get haptics() { return state.haptics; },
  get reducedMotion() { return state.reducedMotion; },
  get assist() { return state.assist; },
  all() { return { ...state }; },
  set(key, value) {
    if (state[key] === value) return;
    state = { ...state, [key]: value };
    store.set('prefs', state);
    apply();
    for (const fn of listeners) { try { fn(key, value, state); } catch (e) { console.error(e); } }
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export function apply() {
  if (typeof document === 'undefined') return;
  const h = document.documentElement;
  h.lang = state.lang;
  h.dataset.reducedMotion = state.reducedMotion ? '1' : '0';
}
