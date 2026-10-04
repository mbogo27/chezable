import en from '../../i18n/en.json';
import sw from '../../i18n/sw.json';
import { prefs } from './prefs.js';

const shell = { en, sw };
let overlay = { en: {}, sw: {} };

/** Stage strings (stage.json "strings") sit on top of the shell strings. */
export function addStrings(strings) {
  if (!strings) return;
  overlay = { en: { ...overlay.en, ...(strings.en || {}) }, sw: { ...overlay.sw, ...(strings.sw || {}) } };
}

export function t(key, vars, lang = prefs.lang) {
  let s = overlay[lang]?.[key] ?? shell[lang]?.[key] ?? overlay.en[key] ?? shell.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}

/** Pick the right language from a {en, sw} object (or return a plain string). */
export function L(obj, lang = prefs.lang) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? obj.en ?? '';
}
