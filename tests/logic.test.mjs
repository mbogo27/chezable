// Unit tests for the pure, seeded logic shared by stages and the Worker.   node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, xmur3 } from '../packages/rng/rng.js';
import { levelFor, xpForLevel, nameProblem, nairobiDay, compareRuns, scoreDef, AWARDS } from '../packages/chez-sdk/src/rules.js';
import * as toka from '../games/toka/logic.js';
import * as kif from '../games/kifuniko/logic.js';
import * as shis from '../games/shisima/logic.js';
import { createCourse, createFlyer, stepFlyer, replay, STEP } from '../games/nyanya-jetpack/sim.js';
import fs from 'node:fs';

const stage = (slug) => JSON.parse(fs.readFileSync(new URL(`../games/${slug}/stage.json`, import.meta.url)));

test('rng: same seed, same sequence; streams are independent', () => {
  const a = rng('seed-1'), b = rng('seed-1'), c = rng('seed-1', 'other');
  const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
  // pinned value: changing the RNG would silently break every saved challenge seed
  assert.equal(xmur3('chezable')(), 2291545041);
});

test('levels: level 2 at 100 XP, monotonic', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(99), 1);
  assert.equal(levelFor(100), 2);
  assert.equal(xpForLevel(3), 283);
  for (let n = 2; n < 30; n++) assert.ok(xpForLevel(n + 1) > xpForLevel(n));
});

test('awards: closed-loop table matches spec §4.3', () => {
  assert.deepEqual([AWARDS['run.finished'].xp, AWARDS['run.finished'].coins, AWARDS['run.finished'].coinCapPerDay], [5, 1, 30]);
  assert.equal(AWARDS['challenge.sent'].coins, 0);
  assert.equal(AWARDS['challenge.accepted_by_new_player'].coins, 20);
});

test('names: format and blocklist (English, Swahili, Sheng, leetspeak)', () => {
  assert.equal(nameProblem('Wanjiru_22'), null);
  assert.equal(nameProblem('ab'), 'name_invalid');
  assert.equal(nameProblem('has space'), 'name_invalid');
  assert.equal(nameProblem('Malaya99'), 'name_bad');
  assert.equal(nameProblem('sh1t_happens'), 'name_bad');
  assert.equal(nameProblem('Chezable_Admin'), 'name_bad');
});

test('Nairobi day rolls over at 21:00 UTC', () => {
  assert.equal(nairobiDay(Date.parse('2026-10-03T20:59:00Z')), '2026-10-03');
  assert.equal(nairobiDay(Date.parse('2026-10-03T21:00:00Z')), '2026-10-04');
});

test('scores: per-mode order and tiebreaks', () => {
  const tk = stage('toka');
  assert.equal(scoreDef(tk, 'solo').order, 'desc');
  assert.equal(scoreDef(tk, 'daily').order, 'asc');
  const def = scoreDef(stage('kata-nusu'), 'h2h');
  assert.ok(compareRuns(def, { score: 3.1 }, { score: 4 }) < 0, 'lower cm off wins');
  assert.ok(compareRuns(def, { score: 3, tiebreak: 0.2 }, { score: 3, tiebreak: 1 }) < 0, 'tiebreak decides');
});

test('Toka: every generated level is solvable (classic and Giuthi)', () => {
  for (const native of [false, true]) {
    let rev = 0, backOnly = 0;
    for (let lvl = 1; lvl <= 40; lvl++) {
      const L = toka.generate(toka.levelSeed(lvl) + (native ? '-g' : ''), toka.cfgFor(lvl), native);
      assert.ok(L.arrows.length > 0);
      rev += L.arrows.filter((a) => a.rev).length;
      backOnly += L.arrows.filter((a) => a.rev && toka.blocker(L, a)).length;
      assert.ok(toka.solvable(L), `level ${lvl} native=${native} solvable`);
    }
    if (native) { assert.ok(rev > 20, 'native levels contain double-headed arrows'); assert.ok(backOnly > 0, 'some must reverse to leave'); }
    else assert.equal(rev, 0);
  }
  const d = toka.generate('toka-2026-10-04-abc', toka.DAILY_CFG, false);
  assert.deepEqual(d.arrows.map((a) => a.cells), toka.generate('toka-2026-10-04-abc', toka.DAILY_CFG, false).arrows.map((a) => a.cells), 'daily board deterministic');
});

test('Kifuniko: par is the true shortest solution; Maji ya Shisima needs the centre', () => {
  for (let lvl = 1; lvl <= 20; lvl++) {
    const P = kif.generate(kif.levelSeed(lvl), kif.cfgFor(lvl));
    assert.ok(P && P.par >= 1 && P.par < Infinity, `level ${lvl}`);
    assert.equal(kif.solve(P.n, P.s, P.E).dist, P.par);
  }
  // a 3x3 board where the plain route skips the centre: the native rule makes it longer or equal, never shorter
  for (let i = 0; i < 25; i++) {
    const P = kif.generate('kif-native-' + i, { n: 3, k: 1, lo: 4 }, true);
    const plain = kif.solve(P.n, P.s, P.E).dist, wet = kif.solve(P.n, P.s, P.E, { native: true }).dist;
    assert.ok(wet >= plain);
    assert.equal(wet, P.par);
  }
  // 4x4 has no centre: the native rule changes nothing
  const Q = kif.generate('even', { n: 4, k: 1, lo: 8 }, true);
  assert.equal(kif.solve(Q.n, Q.s, Q.E, { native: true }).dist, kif.solve(Q.n, Q.s, Q.E).dist);
});

test('Kifuniko: 5x5 solver stays bounded (Appendix B)', () => {
  const t0 = Date.now();
  const P = kif.generate(kif.levelSeed(25), kif.cfgFor(25));
  assert.ok(P.par < Infinity);
  assert.ok(Date.now() - t0 < 20000);
});

test('Nyanya: same seed and input log give the same distance (ghost / replay)', () => {
  const T = stage('nyanya-jetpack').tunables;
  const course = createCourse('nyanya-seed-1', T), f = createFlyer();
  const toggles = [];
  // a simple pilot: hold when below the corridor middle
  while (!f.dead && f.ticks < 120 * 60) {
    const want = f.y > course.corr(f.dist).mid + 0.02;
    if (want !== f.holding) { f.holding = want; toggles.push(f.ticks); }
    stepFlyer(f, course, STEP);
  }
  const again = replay('nyanya-seed-1', T, toggles);
  assert.equal(again, f.dist);
  assert.ok(f.dist > 50, `pilot flew ${f.dist.toFixed(1)} m`);
  assert.notEqual(replay('nyanya-seed-2', T, toggles), f.dist, 'a different seed is a different course');
});

test('Shisima: rules, centre lines, repetition draw, AI never misses a win in one', () => {
  const s0 = shis.initialState('shisima-test');
  assert.equal(s0.board.filter((v) => v === 1).length, 3);
  assert.equal(s0.board.filter((v) => v === 2).length, 3);
  assert.equal(s0.board[shis.CENTRE], 0);
  assert.throws(() => shis.applyMove(s0, [s0.board.indexOf(2), shis.CENTRE], 2));
  // a line must go through the centre: three on the rim is not a win
  assert.equal(shis.lineWinner([1, 1, 1, 0, 2, 2, 0, 0, 2]), 0);
  assert.equal(shis.lineWinner([1, 0, 0, 0, 1, 2, 2, 0, 1]), 1);
  // win in one: player 1 has 0 and 8, piece at 3 can step to 4
  const s = { board: [1, 0, 2, 1, 0, 2, 0, 0, 1], toMove: 1, winner: 0, plies: 0, history: [], seen: {} };
  s.board[2] = 2; s.board[6] = 2; s.board[5] = 2;
  const mv = shis.bestMove(s, 3);
  assert.equal(shis.applyMove(s, mv).winner, 1);
  // threefold repetition: shuttle two pieces back and forth on the rim
  const b0 = [1, 1, 1, 0, 2, 2, 2, 0, 0];
  let st = { board: b0, toMove: 1, winner: 0, plies: 0, history: [], seen: { [b0.join('') + 1]: 1 } };
  const cycle = [[2, 3], [6, 7], [3, 2], [7, 6]];
  for (let k = 0; k < 2; k++) for (const m of cycle) st = shis.applyMove(st, m);
  assert.equal(st.winner, 3, 'same position three times is a draw');
});
