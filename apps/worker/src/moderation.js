// Name moderation (spec v1 §B1). Server-side only: never imported by browser code.
//
// Pipeline: normalise (NFKD, strip accents, drop zero-width, lowercase, fold leetspeak, collapse repeats),
// then match against lists that were compiled through the SAME normalisation (so "mboo" and the player's
// "mbooo" both become "mbo"). Boundary terms only match a whole token (tokens split on anything that isn't a
// letter, so "_" and digits separate words). Strict terms (4+ letters) are also checked with separators squashed
// out, catching "k.u.m.a"-style evasion.
//
// STARTER LIST. The spec's supplied file (swahili_profanity_blocklist_and_moderation_strategy.md) was not in
// the repo when this was written; merge it in here, then have native speakers from several regions review
// the result (English, Swahili, Sheng, Gikuyu, Dholuo, Luhya, Kalenjin...). Keep it out of client code.
import { normalize, tokens, squash, nameFormatProblem } from '../../../packages/chez-sdk/src/names.js';

// Reject if the term appears anywhere (after normalisation), unless the token is whitelisted.
const STRICT = [
  'fuck', 'motherfucker', 'cunt', 'whore', 'bitch', 'bastard', 'asshole', 'faggot', 'retard', 'pedophile', 'paedophile',
  'vagina', 'hitler', 'kahaba', 'kumamako', 'kumanyoko', 'kumamake', 'kumamayo', 'msenge', 'kutomba', 'nitakutomba',
];
// Reject only when it is a whole token: short terms that hide inside innocent words, names and places
// (Dickson, Hassan, Titus, Kakuma, Mbogo, Shitanda, Sussex, Grapefruit...).
const BOUNDARY = [
  'shit', 'dick', 'cock', 'cum', 'ass', 'arse', 'sex', 'sexy', 'tit', 'tits', 'boobs', 'porn', 'rape', 'rapist', 'nazi', 'kkk',
  'nigger', 'nigga', 'niger', 'negro', 'coon', 'spic', 'chink', 'dyke', 'slut', 'twat', 'wank', 'wanker', 'penis', 'pussy', 'pedo',
  'kuma', 'mavi', 'mboro', 'mboo', 'nyoko', 'matako', 'mkundu', 'tomba', 'ngono', 'kisimi', 'malaya', 'kumbafu',
];
// Allow, but mark the name for review and make it reportable: mild insults, and animal words that people
// use as playful nicknames. (Open decision: block instead.)
const FLAG = [
  'idiot', 'stupid', 'dumb', 'loser', 'fool', 'ugly', 'fat', 'pig', 'dog', 'hyena', 'baboon', 'monkey', 'donkey',
  'mjinga', 'pumbavu', 'fala', 'mshenzi', 'mpuuzi', 'kichaa', 'bure', 'shoga', 'fisi', 'mbwa', 'nyani', 'punda', 'nguruwe', 'tumbili',
];
// Always allow: real names and places that contain blocked strings.
const WHITELIST = [
  'scunthorpe', 'sussex', 'essex', 'middlesex', 'kakuma', 'hassan', 'dickson', 'dickens', 'hancock', 'peacock', 'cockburn',
  'titus', 'shitanda', 'cassandra', 'assumpta', 'bassanio', 'grapefruit', 'therapist', 'cucumber', 'document', 'kumasi',
];

const compile = (list) => [...new Set(list.map((w) => normalize(w)))];
const S = compile(STRICT), B = new Set(compile(BOUNDARY)), F = new Set(compile(FLAG)), W = new Set(compile(WHITELIST));

/**
 * Checks a proposed name. Returns { ok, tier, flagged }.
 *   ok=false, tier: 'format' | 'reserved' | 'strict' | 'boundary'   → reject with the generic message
 *   ok=true,  flagged: true when a flag-tier word is present        → allow, mark for review
 * Never returns which term matched.
 */
export function checkName(name) {
  const fmt = nameFormatProblem(name);
  if (fmt) return { ok: false, tier: fmt === 'name_blocked' ? 'reserved' : 'format', flagged: false };
  const norm = normalize(name);
  const toks = tokens(norm);
  const kept = toks.filter((tk) => !W.has(tk));          // whitelisted tokens are exempt from every tier
  const keptStr = kept.join(' ');
  for (const term of S) {
    if (keptStr.includes(term)) return { ok: false, tier: 'strict', flagged: false };
    if (term.length >= 4 && squash(kept.join('')).includes(term)) return { ok: false, tier: 'strict', flagged: false };
  }
  if (kept.some((tk) => B.has(tk))) return { ok: false, tier: 'boundary', flagged: false };
  // spelled out letter by letter ("k_u_m_a", "s-h-1-t"): judge the squashed word as a whole token
  const singles = kept.filter((tk) => tk.length === 1).length;
  if (singles >= 3 && singles >= kept.length - 1 && B.has(squash(kept.join('')))) return { ok: false, tier: 'boundary', flagged: false };
  const flagged = kept.some((tk) => F.has(tk) || [...F].some((f) => f.length >= 4 && tk.includes(f)));
  return { ok: true, tier: null, flagged };
}
