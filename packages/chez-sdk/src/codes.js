// Challenge codes made on the device (spec 2 §1.2): the link works before, or without, the server.
//   <gameSlug>-<seed>-<score>-<6 random base36 chars>      e.g. cap-drop-Xy7k9Pq2Rs_L4-9-a8k2m1
// The seed part drops the "<gameSlug>-" every seed starts with and turns its hyphens into dots, then
// carries flags after "_": L<n> the level board, n the Native variant, r a rescue (Nyanya Okoa).
// Old server ids (6 to 12 letters and digits, no hyphen) keep working alongside.
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

export const isOldId = (id) => /^[A-Za-z0-9]{6,12}$/.test(id);
export const CODE_RE = /^[a-z0-9-]{3,40}-[A-Za-z0-9._]{1,90}-\d{1,7}(?:\.\d{1,2})?-[0-9a-z]{6}$/;
export const isCode = (c) => typeof c === 'string' && c.length <= 140 && CODE_RE.test(c);
/** Anything that can be a challenge id in a URL: an old id or a device-made code. */
export const isChallengeId = (c) => isOldId(c) || isCode(c);

export function randomPart(n = 6) {
  const b = new Uint8Array(n);
  (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.random() * 256));
  return [...b].map((x) => B36[x % 36]).join('');
}

const scoreStr = (s) => String(Math.round(Number(s) * 100) / 100);

export function encodeChallenge({ game, seed, score, level = null, variant = 'classic', kind = 'beat', rand = randomPart() }) {
  const s = String(seed || '');
  let body = s.startsWith(game + '-') ? s.slice(game.length + 1) : 'x.' + s;
  body = body.replace(/-/g, '.').replace(/[^A-Za-z0-9.]/g, '');
  if (level) body += '_L' + Math.max(1, Math.floor(level));
  if (variant === 'native') body += '_n';
  if (kind === 'revive') body += '_r';
  return `${game}-${body}-${scoreStr(score)}-${rand}`;
}

/** -> { game, seed, score, level, variant, kind } or null. `slugs` are the known game ids. */
export function decodeChallenge(code, slugs) {
  if (!isCode(code)) return null;
  const game = slugs.filter((s) => code.startsWith(s + '-')).sort((a, b) => b.length - a.length)[0];
  if (!game) return null;
  const rest = code.slice(game.length + 1);
  const parts = rest.split('-');
  if (parts.length < 3) return null;
  const rand = parts.pop(), score = Number(parts.pop()), token = parts.join('-');
  if (!rand || !isFinite(score) || !token || token.includes('-')) return null;
  const [body, ...flags] = token.split('_');
  const seed = body.startsWith('x.') ? body.slice(2).replace(/\./g, '-') : `${game}-${body.replace(/\./g, '-')}`;
  const lv = flags.find((f) => /^L\d+$/.test(f));
  return {
    game, seed, score,
    level: lv ? Number(lv.slice(1)) : null,
    variant: flags.includes('n') ? 'native' : 'classic',
    kind: flags.includes('r') ? 'revive' : 'beat',
  };
}

/** Thread challenge code (spec 2 §5.6): the stars to beat plus 6 random characters, e.g. 6sk3j9x1. */
export const threadChallengeCode = (stars, rand = randomPart()) => `${Math.max(0, Math.min(9, stars | 0))}s${rand}`;
export const threadChallengeStars = (code) => (/^\ds[0-9a-z]{6}$/.test(code || '') ? Number(code[0]) : null);
