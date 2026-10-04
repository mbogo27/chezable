// Strings. The app is English only; all copy lives in one place so it stays easy to edit.
import en from '../../i18n/en.json';

let overlay = {};

/** Stage strings (stage.json "strings") sit on top of the shell strings. */
export function addStrings(strings) {
  if (!strings) return;
  overlay = { ...overlay, ...(strings.en || {}) };
}

export function t(key, vars) {
  let s = overlay[key] ?? en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}

/** Text from a manifest field: either a plain string or an { en } object. */
export function L(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj.en ?? '';
}
