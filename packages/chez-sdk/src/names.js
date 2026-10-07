// Player names (spec v1 §B1): format rules, the normalisation pipeline, and "Suggest one".
// Shared by the browser (instant feedback) and the Worker (authoritative). The profanity lists are NOT here:
// they live only in the Worker so they can't be read or probed from the browser.

export const NAME_MIN = 3, NAME_MAX = 16;
const FORMAT = /^[A-Za-z0-9_]+$/; // spec 2 §3.4: letters, numbers and underscore
const RESERVED_TOKENS = ['chezable', 'admin', 'administrator', 'mod', 'moderator', 'support', 'official', 'staff', 'team', 'system', 'root', 'help'];
const RESERVED_SQUASHED = ['chezable', 'admin', 'official', 'moderator'];
const LINKY = ['http', 'www', 'gmail', 'yahoo', 'hotmail', 'outlook', 'dotcom', 'cokeke'];

/**
 * Steps 1 to 5 of the pipeline: NFKD + strip accents, drop zero-width/format characters, lowercase,
 * fold leetspeak and homoglyphs, collapse repeated letters. Used on names AND on every list entry.
 */
export function normalize(s) {
  return String(s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯﻿]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't')
    .replace(/(.)\1+/g, '$1');
}
/** Step 7: tokens split on anything that isn't a letter (separators, digits). */
export const tokens = (norm) => norm.split(/[^a-z]+/).filter(Boolean);
/** Step 8: separators removed, for catching k.u.m.a-style evasion of long strict terms. */
export const squash = (norm) => norm.replace(/[^a-z]/g, '');
/** The uniqueness key: two names that normalise the same can't both exist. */
export const nameKey = (name) => normalize(name).replace(/[^a-z0-9]/g, '');

/** Format and reserved-word rules. Returns null, or an error code. Moderation runs separately on the server. */
export function nameFormatProblem(name) {
  const n = String(name || '');
  if (n.length < NAME_MIN || n.length > NAME_MAX || !FORMAT.test(n)) return 'name_invalid';
  if (/^_|_$/.test(n)) return 'name_invalid';
  if (/^[0-9_]+$/.test(n)) return 'name_digits';
  if (/[0-9]{7,}/.test(n)) return 'name_digits';
  const lower = n.toLowerCase().replace(/[_-]/g, '');
  if (LINKY.some((w) => lower.includes(w))) return 'name_blocked';
  const norm = normalize(n);
  if (tokens(norm).some((tk) => RESERVED_TOKENS.some((r) => normalize(r) === tk))) return 'name_blocked';
  if (RESERVED_SQUASHED.some((w) => squash(norm).includes(normalize(w)))) return 'name_blocked';
  return null;
}

/* ---------- Suggest one: clean adjective + animal + number, no moderation pass needed ---------- */
const ADJ = ['Swift', 'Brave', 'Lucky', 'Sunny', 'Clever', 'Happy', 'Mighty', 'Quiet', 'Bright', 'Bold', 'Calm', 'Eager', 'Gentle', 'Jolly', 'Keen', 'Merry', 'Nimble', 'Proud', 'Rapid', 'Steady', 'Witty', 'Zesty', 'Golden', 'Silver', 'Cosmic', 'Turbo', 'Royal', 'Mellow', 'Snappy', 'Breezy'];
const ANIMAL = ['Zebra', 'Gazelle', 'Cheetah', 'Falcon', 'Lion', 'Rhino', 'Giraffe', 'Eagle', 'Dolphin', 'Turtle', 'Kudu', 'Impala', 'Heron', 'Otter', 'Panda', 'Koala', 'Okapi', 'Oryx', 'Flamingo', 'Gecko', 'Parrot', 'Hornbill', 'Weaver', 'Sunbird', 'Mongoose', 'Tortoise', 'Eland', 'Ibis', 'Crane', 'Dikdik'];
export function suggestName(rand = Math.random) {
  for (let i = 0; i < 50; i++) {
    const s = ADJ[Math.floor(rand() * ADJ.length)] + ANIMAL[Math.floor(rand() * ANIMAL.length)] + (10 + Math.floor(rand() * 90));
    if (s.length <= NAME_MAX && !nameFormatProblem(s)) return s;
  }
  return 'HappyZebra' + (10 + Math.floor(rand() * 90));
}
export const SUGGEST_WORDS = { ADJ, ANIMAL };
