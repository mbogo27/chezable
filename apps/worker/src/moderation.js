// Name moderation (spec v1 §B1). Server-side only: never imported by browser code.
//
// Pipeline: normalise (NFKD, strip accents, drop zero-width, lowercase, fold leetspeak, collapse repeats),
// then match against lists that were compiled through the SAME normalisation (so "mboo" and the player's
// "mbooo" both become "mbo"). Boundary terms only match a whole token (tokens split on anything that isn't a
// letter, so "_" and digits separate words). Strict terms (4+ letters) are also checked with separators squashed
// out, catching "k.u.m.a"-style evasion.
//
// Swahili terms and tiers follow docs/swahili_profanity_blocklist_and_moderation_strategy.md (strict roots match
// anywhere; words with innocent look-alikes match only as a whole token; a whitelist for real names and places).
// Still to do: a review by native speakers from several regions (Swahili, Sheng, Gikuyu, Dholuo, Luhya,
// Kalenjin...). Keep these lists out of client code.
import { normalize, tokens, squash, nameFormatProblem } from '../../../packages/chez-sdk/src/names.js';

// Reject if the term appears anywhere (after normalisation), unless the token is whitelisted.
const STRICT = [
  'fuck', 'motherfucker', 'cunt', 'whore', 'bitch', 'bastard', 'asshole', 'faggot', 'retard', 'pedophile', 'paedophile',
  'vagina', 'hitler',
  // Swahili: sexual roots (catch conjugations: kutomba, nitakutomba, tombwa...), severe slurs, common insults
  'tomba', 'tombwa', 'dinya', 'dinywa', 'msenge', 'malaya', 'kahaba', 'kumamako', 'kumanyoko', 'kumamake', 'kumamayo',
  'kumayamama', 'kumamama', 'kumayako', 'pumbavu', 'mpuuzi', 'mburula',
];
// Reject only when it is a whole token: short terms that hide inside innocent words, names and places
// (Dickson, Hassan, Titus, Kakuma, Kumasi, Mbooni, Mbwana, Mbogo, Shitanda, Sussex, Grapefruit...).
const BOUNDARY = [
  'shit', 'dick', 'cock', 'cum', 'ass', 'arse', 'sex', 'sexy', 'tit', 'tits', 'boobs', 'porn', 'rape', 'rapist', 'nazi',
  'nigger', 'nigga', 'niger', 'negro', 'coon', 'spic', 'chink', 'dyke', 'slut', 'twat', 'wank', 'wanker', 'penis', 'pussy', 'pedo',
  'kuma', 'quma', 'mavi', 'mboro', 'mboo', 'nyoko', 'matako', 'tako', 'mkundu', 'ngono', 'kisimi', 'kumbafu', 'nyonyo', 'nyonyos',
  'shoga', 'basha', 'jinga', 'mjinga', 'zuzu', 'fisi', 'nyani', 'mbwa', 'kafiri', 'mchawi', 'msng', 'khb', 'pmbvu',
];
// Allow, but mark the name for review and make it reportable: mild insults, and animal words that people use as
// nicknames. Also catches blocked whole-token words run together with another word ("MbwaKali", "FisiMkali").
const FLAG = [
  'idiot', 'stupid', 'dumb', 'loser', 'fool', 'ugly', 'fat', 'pig', 'dog', 'hyena', 'baboon', 'monkey', 'donkey',
  'fala', 'mshenzi', 'kichaa', 'bure', 'punda', 'nguruwe', 'tumbili',
  'mjinga', 'shoga', 'fisi', 'mbwa', 'nyani', 'zuzu', 'matako', 'nyonyo', 'kafiri', 'mchawi',
];
// Always allow: real names and places that contain blocked strings.
const WHITELIST = [
  'scunthorpe', 'sussex', 'essex', 'middlesex', 'kakuma', 'hassan', 'dickson', 'dickens', 'hancock', 'peacock', 'cockburn',
  'titus', 'shitanda', 'cassandra', 'assumpta', 'bassanio', 'grapefruit', 'therapist', 'cucumber', 'document',
  'kumasi', 'kumamoto', 'akuma', 'mbooni', 'mbwana', 'jinja', 'himalaya', 'himalayas', 'malayalam',
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
  // camelCase is a word break too: "MbwaKali" is judged like "Mbwa_Kali"
  const norm = normalize(String(name).replace(/([a-z])(?=[A-Z])/g, '$1_'));
  const toks = tokens(norm);
  const kept = toks.filter((tk) => !W.has(tk));          // whitelisted tokens are exempt from every tier
  const keptStr = kept.join(' ');
  let review = false;
  for (const term of S) {
    if (keptStr.includes(term)) return { ok: false, tier: 'strict', flagged: false };
    if (term.length >= 4 && squash(kept.join('')).includes(term)) {
      // "Tom_Baraka", "TomBwana": the name Tom next to a name starting with the rest of the root. Allow, but review.
      if (term.startsWith('tom') && kept.some((tk, i) => tk === 'tom' && (kept[i + 1] || '').length >= 5 && kept[i + 1].startsWith(term.slice(3)))) { review = true; continue; }
      return { ok: false, tier: 'strict', flagged: false };
    }
  }
  // checked before normalisation, which would collapse it to a single letter
  if (String(name).toLowerCase().split(/[^a-z]+/).includes('kkk')) return { ok: false, tier: 'boundary', flagged: false };
  if (kept.some((tk) => B.has(tk))) return { ok: false, tier: 'boundary', flagged: false };
  // spelled out letter by letter ("k_u_m_a", "s-h-1-t"): judge the squashed word as a whole token
  const singles = kept.filter((tk) => tk.length === 1).length;
  if (singles >= 3 && singles >= kept.length - 1 && B.has(squash(kept.join('')))) return { ok: false, tier: 'boundary', flagged: false };
  const flagged = review || kept.some((tk) => F.has(tk) || [...F].some((f) => f.length >= 4 && tk.includes(f)));
  return { ok: true, tier: null, flagged };
}
