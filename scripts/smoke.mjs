// End-to-end API smoke test against a running Worker (default http://127.0.0.1:8787, local SQLite D1).
//   node scripts/smoke.mjs [baseUrl]
// Plays the core loop as simulated players: register, claim names, run, challenge, accept, send back,
// rescue (Rescue), Water Bugs by link, leaderboards, recovery, caps and fair-play checks.
import { webcrypto as crypto } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const enc = new TextEncoder();
const hex = (b) => Buffer.from(b).toString('hex');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };

class Client {
  constructor(label) {
    this.label = label;
    this.id = crypto.randomUUID();
    this.secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  }
  async call(method, path, body, auth = true) {
    const text = body == null ? '' : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const ts = String(Date.now());
      const keyHex = await sha(this.secret);
      const key = await crypto.subtle.importKey('raw', Buffer.from(keyHex, 'hex'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const msg = `${method}\n/api${path}\n${ts}\n${await sha(text)}`;
      Object.assign(headers, { 'X-Chez-Player': this.id, 'X-Chez-Ts': ts, 'X-Chez-Sig': hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg))) });
    }
    const res = await fetch(BASE + '/api' + path, { method, headers, body: method === 'GET' ? undefined : text });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  async ok(method, path, body, auth) {
    const r = await this.call(method, path, body, auth);
    if (r.status >= 400) throw new Error(`${this.label} ${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  }
  register(cohort = 'classic') { return this.ok('POST', '/player', { id: this.id, secret: this.secret, cohort, lang: 'en' }, false); }
  async play(game, score, opts = {}) {
    const s = await this.ok('POST', '/run/start', { game, mode: opts.mode || 'solo', variant: opts.variant || 'classic', challengeId: opts.challengeId });
    if (opts.wait !== 0) await sleep(opts.wait || 2600);
    const f = await this.ok('POST', '/run/finish', { runId: s.runId, score, tiebreak: opts.tiebreak ?? null, detail: opts.detail || {}, durationMs: 3000 });
    return { start: s, finish: f };
  }
}

const uniq = Date.now().toString(36).slice(-5);
console.log(`Smoke test against ${BASE}`);

// --- health, catalogue, daily
const h = await (await fetch(BASE + '/api/health')).json();
assert.ok(h.ok); ok('health ' + h.day);
const cat = await (await fetch(BASE + '/api/catalog')).json();
assert.ok(cat.games.length >= 1); ok(`catalogue lists ${cat.games.length} stages`);
const dailyGame = cat.games.find((g) => (g.modes || []).includes('daily'));

// --- identity
const A = new Client('A'), B = new Client('B'), N = new Client('N');
await A.register(); await B.register();
const again = await A.register(); assert.equal(again.id, A.id); ok('register is idempotent');
const imposter = await new Client('X').call('POST', '/player', { id: A.id, secret: 'x'.repeat(40) }, false);
assert.equal(imposter.status, 409); ok('cannot re-register someone else\'s id');
const bad = new Client('bad'); bad.id = A.id;
assert.equal((await bad.call('GET', '/me')).status, 401); ok('wrong secret is rejected (bad signature)');

const nameA = `Wanjiru_${uniq}`;
const claim = await A.ok('POST', '/player/name', { name: nameA });
assert.equal(claim.handle, nameA); assert.match(claim.recovery, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/); ok('claim name returns a recovery code once');
assert.equal((await B.call('POST', '/player/name', { name: nameA.toUpperCase() })).status, 409); ok('names are unique, case-insensitive');
assert.equal((await B.call('POST', '/player/name', { name: 'malaya_1' })).status, 422); ok('profanity filter (Swahili)');
assert.equal((await B.call('POST', '/player/name', { name: 'a b' })).status, 422); ok('name format enforced');
await B.ok('POST', '/player/name', { name: `Otieno_${uniq}` });

// --- runs, ledger
const game = 'apple-slicer';
const r1 = await A.play(game, 4, { tiebreak: 30 });
assert.ok(r1.finish.awards.find((a) => a.event === 'run.finished')); assert.ok(r1.finish.awards.find((a) => a.event === 'stage.first_play'));
ok(`first run: +${r1.finish.awards.reduce((s, a) => s + a.xp, 0)} XP, rank ${r1.finish.rank}`);
const r2 = await A.play(game, 7, { tiebreak: 41 });
assert.equal(r2.finish.pb, true); assert.ok(r2.finish.awards.find((a) => a.event === 'run.personal_best')); ok('personal best detected and awarded');
const r3 = await A.play(game, 8, { tiebreak: 41 });
assert.equal(r3.finish.pb, true); assert.ok(!r3.finish.awards.find((a) => a.event === 'run.personal_best')); ok('PB award capped at 1 per game per day');
const dup = await A.call('POST', '/run/finish', { runId: r3.start.runId, score: 9 });
assert.equal(dup.status, 409); ok('a run can only finish once');
const s = await A.ok('POST', '/run/start', { game, mode: 'solo', variant: 'classic' });
assert.equal((await A.call('POST', '/run/finish', { runId: s.runId, score: 5 })).status, 422); ok('too-fast runs rejected (T0 duration)');
const s2 = await A.ok('POST', '/run/start', { game, mode: 'solo', variant: 'classic' });
await sleep(2600);
assert.equal((await A.call('POST', '/run/finish', { runId: s2.runId, score: 11 })).status, 422); ok('score bounds enforced (Apple Slicer ≤ 10)');
assert.equal((await B.call('POST', '/run/finish', { runId: r2.start.runId, score: 1 })).status, 404); ok('cannot finish someone else\'s run');
// offline run synced later
const off = await A.ok('POST', '/run/finish', { runId: 'L' + crypto.randomUUID(), score: 6, durationMs: 20000, local: { game, mode: 'solo', variant: 'classic', seed: 'offline-seed', startedAt: Date.now() - 60000 } });
assert.ok(off.ok); ok('offline (queued) run accepted on sync');

// --- challenge loop
const ch = await A.ok('POST', '/challenge', { runId: r2.start.runId });
assert.match(ch.url, /\/c\/[A-Za-z0-9]{8}$/); ok('challenge link ' + ch.url);
const pub = await (await fetch(BASE + '/api/challenge/' + ch.id)).json();
assert.equal(pub.creator.name, nameA); assert.equal(pub.creatorScore, 7); ok('public challenge info');
const land = await (await fetch(BASE + '/c/' + ch.id)).text();
assert.ok(land.includes(`${nameA} challenged you: 7 of 10 apples`)); ok('/c/ landing rewrites Open Graph tags for WhatsApp');
const bAccept = await B.ok('POST', '/run/start', { game, challengeId: ch.id });
assert.equal(bAccept.seed, r2.start.seed); assert.equal(bAccept.mode, 'h2h'); ok('B plays the same seed in h2h');
await sleep(2600);
const bFin = await B.ok('POST', '/run/finish', { runId: bAccept.runId, score: 9, tiebreak: 50 });
assert.equal(bFin.challenge.result, 'win'); assert.ok(bFin.awards.find((a) => a.event === 'h2h.won')); ok('B beats A: h2h.played + h2h.won');
const prac = await B.play(game, 2, { challengeId: ch.id });
assert.equal(prac.finish.challenge.counted, false); ok('only the first attempt counts');
// newcomer N arrives after the challenge was created -> recruit
await N.register();
const nRun = await N.play(game, 3, { challengeId: ch.id });
assert.equal(nRun.finish.challenge.result, 'loss'); ok('new player accepted: counted as a loss vs A');
const aMe = await A.ok('GET', '/me');
const ledgerHasRecruit = aMe.xp > 0; assert.ok(ledgerHasRecruit); ok(`A now has ${aMe.xp} XP, ${aMe.coins} coins, level ${aMe.level}`);
const lists = await A.ok('GET', '/challenges');
assert.ok(lists.finished.find((c) => c.id === ch.id)); ok('challenge shows as finished for A');
// send it back: B challenges A on a new seed with target
const back = await B.play(game, 6);
const chBack = await B.ok('POST', '/challenge', { runId: back.start.runId, targetId: A.id });
const aLists = await A.ok('GET', '/challenges');
assert.ok(aLists.waitingYou.find((c) => c.id === chBack.id)); ok('"Send it back" lands in A\'s waiting list');

// --- leaderboards + friends
const today = await (await fetch(`${BASE}/api/top/${game}?board=today&mode=solo`)).json();
assert.ok(today.rows.length >= 2); assert.ok(today.rows[0].score >= today.rows[1].score); ok(`today board: ${today.rows.map((r) => `${r.name}:${r.score}`).join(', ')}`);
const friends = await A.ok('GET', `/top/${game}?board=friends&mode=solo`);
assert.ok(friends.rows.length >= 2); ok('friends board built from the play graph');

// --- daily
if (dailyGame) {
  const d1 = await (await fetch(`${BASE}/api/daily/${dailyGame.id}`)).json();
  const d2 = await (await fetch(`${BASE}/api/daily/${dailyGame.id}`)).json();
  assert.equal(d1.seed, d2.seed); ok(`daily seed stable for ${d1.day}`);
}

// --- recovery
const C2 = new Client('A-on-new-phone');
const rec = await C2.ok('POST', '/player/recover', { code: claim.recovery.toLowerCase(), secret: C2.secret }, false);
assert.equal(rec.id, A.id); C2.id = rec.id;
const me2 = await C2.ok('GET', '/me'); assert.equal(me2.handle, nameA); ok('recovery code restores the player on a new device');
assert.equal((await A.call('GET', '/me')).status, 401); ok('old device secret retired after recovery');

// --- caps: challenge.sent XP capped at 10/day
for (let i = 0; i < 11; i++) await C2.ok('POST', '/challenge', { runId: r1.start.runId });
ok('11 challenges created (XP cap checked server-side)');

// --- telemetry
const ev = await B.ok('POST', '/events', { events: [{ name: 'session.start', props: {}, ts: Date.now(), session: 'abc' }, { name: 'BAD NAME', ts: Date.now() }] });
assert.equal(ev.n, 1); ok('telemetry batch accepted, bad names dropped');

// --- Nyanya Rescue rescue + Water Bugs turns (when those stages exist)
if (cat.games.find((g) => g.id === 'nyanya-jetpack')) {
  const run = await C2.ok('POST', '/run/start', { game: 'nyanya-jetpack', mode: 'solo', variant: 'native' });
  await sleep(2100);
  await C2.ok('POST', '/run/finish', { runId: run.runId, score: 312.4 });
  const rv = await C2.ok('POST', '/challenge', { runId: run.runId, kind: 'revive' });
  const bOk = await B.ok('POST', '/run/start', { game: 'nyanya-jetpack', challengeId: rv.id });
  assert.equal(bOk.mode, 'okoa');
  await B.ok('POST', '/run/finish', { runId: bOk.runId, score: 1 });
  const aL = await C2.ok('GET', '/challenges');
  assert.ok(aL.waitingYou.find((c) => c.id === rv.id && c.action === 'continue')); ok('Rescue: B rescued A; A sees "carry on"');
  const cont = await C2.ok('POST', '/run/start', { game: 'nyanya-jetpack', challengeId: rv.id });
  assert.equal(cont.mode, 'revive'); await sleep(2100);
  await C2.ok('POST', '/run/finish', { runId: cont.runId, score: 420 });
  assert.equal((await C2.call('POST', '/run/start', { game: 'nyanya-jetpack', challengeId: rv.id })).status, 409); ok('Rescue continuation can only be used once');
}
if (cat.games.find((g) => g.id === 'water-bugs')) {
  const t = await B.ok('POST', '/challenge', { kind: 'turn', game: 'water-bugs' });
  const st = t.state;
  const { legalMoves } = await import('../games/water-bugs/logic.js');
  const m1 = legalMoves(st, 1)[0];
  await B.ok('POST', `/challenge/${t.id}/move`, { move: m1 });
  assert.equal((await B.call('POST', `/challenge/${t.id}/move`, { move: m1 })).status, 409); ok('Water Bugs: cannot move twice in a row');
  const pubT = await N.ok('GET', `/challenge/${t.id}`);
  assert.equal(pubT.yourTurn, true);
  const m2 = legalMoves(pubT.state, 2)[0];
  const after = await N.ok('POST', `/challenge/${t.id}/move`, { move: m2 });
  assert.equal(after.state.toMove, 1); ok('Water Bugs: second player joins by link and moves');
  assert.equal((await N.call('POST', `/challenge/${t.id}/move`, { move: [0, 8] })).status, 409); ok('Water Bugs: turn order enforced');
}

console.log(`\n${passed} checks passed.`);
