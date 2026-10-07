// Spec 2: challenge codes made on the device, thread composition and lives, stars and the result strip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeChallenge, decodeChallenge, isCode, isChallengeId, isOldId, threadChallengeCode, threadChallengeStars } from '../packages/chez-sdk/src/codes.js';
import { threadDef, pickGames, turnSeed, tally, parseThreadId, threadIdFromPath, threadPath, PUZZLES } from '../packages/chez-sdk/src/threads.js';
import { starsFor, stripFor, starText, stripText } from '../packages/chez-sdk/src/results.js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const SLUGS = readdirSync('games').filter((d) => existsSync(`games/${d}/stage.json`));
const stage = (id) => JSON.parse(readFileSync(`games/${id}/stage.json`, 'utf8'));

test('challenge codes round-trip: game, seed, score, level, variant, kind', () => {
  const cases = [
    { game: 'cut-in-half', seed: 'cut-in-half-AbCdEf1234', score: 23.6 },
    { game: 'nyanya-jetpack', seed: 'nyanya-jetpack-2026-10-07-xY7k9P', score: 142.5 },
    { game: 'cap-drop', seed: 'cap-drop-Zz9', score: 9, level: 12 },
    { game: 'arrow-puzzle', seed: 'arrow-puzzle-t1x2y3', score: 0, variant: 'native' },
    { game: 'nyanya-jetpack', seed: 'nyanya-jetpack-QQ', score: 88.1, kind: 'revive' },
    { game: 'cut-in-half', seed: 'cut-in-half-tq3fz8', score: 6 },
    { game: 'cut-in-half', seed: 'oddseed-without-prefix', score: 1 },
  ];
  for (const c of cases) {
    const code = encodeChallenge(c);
    assert.ok(isCode(code) && isChallengeId(code), code);
    assert.ok(code.startsWith(c.game + '-'), code);
    const d = decodeChallenge(code, SLUGS);
    assert.deepEqual(d, { game: c.game, seed: c.seed, score: c.score, level: c.level || null, variant: c.variant || 'classic', kind: c.kind || 'beat' }, code);
  }
});

test('codes: the six random characters differ; old ids still count; junk does not', () => {
  const a = encodeChallenge({ game: 'cut-in-half', seed: 'cut-in-half-x', score: 3 });
  const b = encodeChallenge({ game: 'cut-in-half', seed: 'cut-in-half-x', score: 3 });
  assert.notEqual(a, b);
  assert.match(a, /-[0-9a-z]{6}$/);
  assert.ok(isOldId('HEbsjR8h') && isChallengeId('HEbsjR8h') && !isCode('HEbsjR8h'));
  for (const bad of ['', 'cut-in-half', 'nope-x-1-abcdef', 'cut-in-half--1-abcdef', 'cut-in-half-x-1-ABCDEF', '../../etc-x-1-abcdef']) assert.equal(decodeChallenge(bad, SLUGS), null, bad);
  const thr = threadChallengeCode(6);
  assert.equal(threadChallengeStars(thr), 6);
  assert.ok(isOldId(thr), 'thread codes fit the old id route');
});

test('threads: same id, same games and seeds; three different games; puzzles never back to back', () => {
  for (let d = 1; d <= 60; d++) {
    const day = `2026-${String(10 + Math.floor((d - 1) / 30)).padStart(2, '0')}-${String(((d - 1) % 30) + 1).padStart(2, '0')}`;
    const a = threadDef('daily-' + day), b = threadDef('daily-' + day);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.games).size, 3);
    for (let i = 1; i < 3; i++) assert.ok(!(PUZZLES.includes(a.games[i]) && PUZZLES.includes(a.games[i - 1])), `${day}: ${a.games}`);
    for (const g of a.games) assert.equal(turnSeed(a, g), turnSeed(b, g));
    assert.ok(turnSeed(a, a.games[0]).startsWith(a.games[0] + '-t'));
  }
  // over many threads, every game and every order shows up
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(pickGames('anytime-' + i.toString(36).padStart(6, '0')).join(','));
  assert.ok(seen.size >= 12, `only ${seen.size} orders`);
  assert.equal(parseThreadId('daily-2026-10-07').kind, 'daily');
  assert.equal(parseThreadId('anytime-abc123').kind, 'anytime');
  assert.equal(parseThreadId('weekly-1'), null);
  assert.equal(threadIdFromPath('2026-10-07'), 'daily-2026-10-07');
  assert.equal(threadPath('daily-2026-10-07'), '/t/2026-10-07');
  assert.equal(threadDef('daily-2026-10-07').ranked, true);
  assert.equal(threadDef('anytime-abc123').ranked, false);
});

test('thread lives: a failed turn costs a life and replays; a retry costs a life; zero lives ends it', () => {
  // clean run
  let r = tally([{ turn: 0, stars: 2 }, { turn: 1, stars: 3 }, { turn: 2, stars: 1 }]);
  assert.deepEqual([r.lives, r.complete, r.out], [3, true, false]);
  // fail then pass, retry a passed turn for more stars (better result replaces), then finish
  r = tally([{ turn: 0, stars: 0 }, { turn: 0, stars: 1 }, { turn: 0, stars: 3 }, { turn: 1, stars: 2 }, { turn: 2, stars: 2 }]);
  assert.deepEqual([r.lives, r.complete, r.best[0].stars], [1, true, 3]);
  // a failed retry costs only the retry's life, and the earlier pass stands
  r = tally([{ turn: 0, stars: 2 }, { turn: 0, stars: 0 }]);
  assert.deepEqual([r.lives, r.best[0].stars, r.passed.has(0)], [2, 2, true]);
  // three fails: out of lives
  r = tally([{ turn: 0, stars: 1 }, { turn: 1, stars: 0 }, { turn: 1, stars: 0 }, { turn: 1, stars: 0 }]);
  assert.deepEqual([r.lives, r.out, r.complete], [0, true, false]);
  // runs after the lives ran out don't count
  r = tally([{ turn: 0, stars: 0 }, { turn: 0, stars: 0 }, { turn: 0, stars: 0 }, { turn: 0, stars: 3 }]);
  assert.equal(r.out, true);
});

test('stars and strips follow each game\'s rule', () => {
  const ny = stage('nyanya-jetpack'), cut = stage('cut-in-half'), cap = stage('cap-drop'), arr = stage('arrow-puzzle');
  assert.deepEqual([5, 10, 40, 119, 120, 500].map((s) => starsFor(ny, s, {})), [0, 1, 2, 2, 3, 3]);
  assert.deepEqual([31, 30, 15, 6, 0.4].map((s) => starsFor(cut, s, {})), [0, 1, 2, 3, 3]);
  assert.equal(starsFor(cap, 9, { moves: 9, par: 9, solved: true }), 3);
  assert.equal(starsFor(cap, 11, { moves: 11, par: 9 }), 2);
  assert.equal(starsFor(cap, 14, { moves: 14, par: 9 }), 1);
  assert.equal(starsFor(cap, 999, { moves: 3, par: 9, solved: false }), 0);
  assert.deepEqual([0, 1, 2, 5].map((b) => starsFor(arr, b, { bumps: b })), [3, 2, 1, 1]);
  assert.equal(starsFor(arr, 2, { bumps: 2, solved: false }), 0);
  // strips
  assert.deepEqual(stripFor(cap, 9, { moves: 4, par: 4 }), [true, true, true, false]);
  assert.equal(stripText(stripFor(cap, 9, { moves: 9, par: 9 })), '■■■■■■■■□');
  assert.deepEqual(stripFor(cut, 12, { cuts: [{ err: 1 }, { err: 7 }, { err: 4 }] }), [true, false, true]);
  assert.equal(stripFor(ny, 60, {}).filter(Boolean).length, 3);
  assert.equal(stripFor(ny, 500, {}).filter(Boolean).length, 5);
  assert.deepEqual(stripFor(arr, 0, { bumps: 0 }), [true, true, true, true, true]);
  assert.deepEqual(stripFor(cap, 0, { solved: false }), [false, false, false, false, false]);
  assert.equal(starText(2), '⭐⭐▫️');
});
