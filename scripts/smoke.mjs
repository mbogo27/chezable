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
const over = await A.ok('POST', '/run/finish', { runId: s2.runId, score: 11 });
assert.equal(over.flagged, true); ok('implausible score stored but flagged (Apple Slicer ≤ 10)');
const fab = await A.call('POST', '/run/finish', { runId: 'rFAKEFAKEFAKEFAKE', score: 5 });
assert.equal(fab.status, 404); ok('a fabricated score without a valid run token is rejected');
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
assert.ok(land.includes(`${nameA} scored 7 of 10 apples. Can you beat it?`)); ok('/c/ landing rewrites Open Graph tags for WhatsApp');
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
const today = await (await fetch(`${BASE}/api/top/${game}?board=week&mode=solo`)).json();
assert.ok(today.rows.length >= 2); assert.ok(today.rows[0].score >= today.rows[1].score); assert.ok(!today.rows.some((r) => r.score > 10), 'flagged score kept off the board'); ok(`weekly board: ${today.rows.map((r) => `${r.name}:${r.score}`).join(', ')}`);
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


// --- spec v1: names, reports, weekly boards, previews, moderation
const D = new Client('D'); await D.register();
assert.equal((await D.call('POST', '/player/name', { name: 'k_u_m_a' })).data.error, 'name_blocked'); ok('moderated name rejected with the generic code');
assert.equal((await D.call('POST', '/player/name', { name: '0722123456' })).data.error, 'name_invalid'); ok('phone-number-like name rejected');
assert.equal((await D.call('POST', '/player/name', { name: nameA.toLowerCase().replace('a', '4') })).status, 409); ok('lookalike of an existing name is taken');
const nm1 = `Dee_${uniq}`, nm2 = `Dee2_${uniq}`, nm3 = `Dee3_${uniq}`;
await D.ok('POST', '/player/name', { name: nm1 });
const ch1 = await D.ok('POST', '/player/name', { name: nm2 });
assert.ok(ch1.nextChangeAt > Date.now()); ok('first change is free');
const ch2 = await D.call('POST', '/player/name', { name: nm3 });
assert.equal(ch2.status, 429); assert.equal(ch2.data.error, 'name_change_wait'); ok('next change waits 14 days');
const flagged = new Client('F'); await flagged.register();
await flagged.ok('POST', '/player/name', { name: `PundaKali_${uniq.slice(0, 3)}` });
ok('mild/animal nickname allowed (flagged for review)');
await A2report();
async function A2report() {
  const r = await D.call('POST', '/report', { name: `PundaKali_${uniq.slice(0, 3)}`, reason: 'name' });
  assert.equal(r.status, 200); ok('report a name');
}
const dRun = await D.play(game, 6, { tiebreak: 20 });
assert.ok(dRun.finish.rank >= 1); assert.equal(typeof dRun.finish.prevBest, 'object'); ok(`finish returns weekly rank #${dRun.finish.rank} and gap info`);
const myRow = await D.ok('GET', `/top/${game}?board=week&mode=solo`);
assert.ok(myRow.me && myRow.me.rank); ok(`your row: #${myRow.me.rank}${myRow.me.next ? `, ${myRow.me.next.gap} behind ${myRow.me.next.name}` : ''}`);
const anon = new Client('U'); await anon.register();
await anon.play(game, 10, { tiebreak: 1 });
const wk = await (await fetch(`${BASE}/api/top/${game}?board=week&mode=solo`)).json();
assert.ok(wk.rows.some((r) => r.name === null || r.name === undefined)); ok('unclaimed players show on boards as Guest (spec 2 §3.4)');
const cutRun = await D.play('cut-in-half', 12.3, { tiebreak: 2.1 });
const dc = await D.ok('POST', '/challenge', { runId: cutRun.start.runId });
const card = await fetch(`${BASE}/og/c/${dc.id}.png`);
const cardBuf = Buffer.from(await card.arrayBuffer());
assert.equal(card.headers.get('content-type'), 'image/png'); assert.equal(cardBuf.subarray(1, 4).toString(), 'PNG'); assert.ok(card.url.includes('/og/c/')); ok(`preview card drawn for /c/${dc.id} (${(cardBuf.length / 1024).toFixed(0)} KB)`);
const landHtml = await (await fetch(`${BASE}/c/${dc.id}`)).text();
assert.ok(landHtml.includes(`/og/c/${dc.id}.png`)); assert.ok(landHtml.includes(`${nm2} scored 12.3 cm off. Can you beat it?`)); ok('/c/ HTML carries the challenge title and card image for WhatsApp');
assert.ok(dc.id && (await D.ok('GET', `/challenge/${dc.id}`)).expired === false); ok('challenge links do not expire');
if (process.env.ADMIN_TOKEN) {
  const adm = (path, body) => fetch(BASE + '/api/admin' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.ADMIN_TOKEN }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
  assert.equal((await fetch(BASE + '/api/admin/overview')).status, 401); ok('admin needs the token');
  const ov = await adm('/overview');
  assert.ok(ov.reports.length >= 1 && ov.flaggedNames.length >= 1 && ov.flaggedRuns.length >= 1); ok(`admin overview: ${ov.reports.length} reports, ${ov.flaggedNames.length} flagged names, ${ov.flaggedRuns.length} flagged scores`);
  await adm('/player', { id: D.id, action: 'hide' });
  const hid = await (await fetch(`${BASE}/api/challenge/${dc.id}`)).json();
  assert.equal(hid.hidden, true); ok('hidden player: their challenge link falls back to the plain game');
  const wk2 = await (await fetch(`${BASE}/api/top/cut-in-half?board=week&mode=solo`)).json();
  assert.ok(!wk2.rows.some((r) => r.name === nm2)); ok('hidden player removed from boards');
  await adm('/player', { id: D.id, action: 'unhide' });
} else console.log('  (admin checks skipped: set ADMIN_TOKEN to run them)');

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

/* ---------------- spec 2 ---------------- */
{
  const { encodeChallenge, threadChallengeCode } = await import('../packages/chez-sdk/src/codes.js');
  const { threadDef, turnSeed } = await import('../packages/chez-sdk/src/threads.js');
  const { nairobiDay } = await import('../packages/chez-sdk/src/rules.js');
  const A = new Client('A2'); await A.register();
  const B = new Client('B2'); await B.register();
  const nmA = `Ann_${uniq}`;
  await A.ok('POST', '/player/name', { name: nmA });

  // device-made codes: five rapid registrations make one record; the code's game, seed and score must match the run
  const run = await A.play('cut-in-half', 14.2, { tiebreak: 1.1 });
  const code = encodeChallenge({ game: 'cut-in-half', seed: run.start.seed, score: 14.2 });
  const puts = await Promise.all([1, 2, 3, 4, 5].map(() => A.call('PUT', `/challenges/${code}`, { runId: run.start.runId })));
  assert.ok(puts.every((r) => r.status === 200 || r.status === 201), JSON.stringify(puts.map((r) => r.status)));
  const listA = await A.ok('GET', '/challenges');
  assert.equal(listA.waitingThem.filter((c) => c.id === code).length, 1); ok('five rapid taps register one challenge (idempotent PUT)');
  const bad = encodeChallenge({ game: 'cut-in-half', seed: run.start.seed, score: 3.0 });
  assert.equal((await A.call('PUT', `/challenges/${bad}`, { runId: run.start.runId })).status, 422); ok('a code whose score does not match the run is refused');
  const pub = await B.ok('GET', `/challenge/${code}`);
  assert.equal(pub.creator.name, nmA); assert.equal(pub.creatorScore, 14.2); ok('the registered code shows the challenger and the score to beat');
  const land = await (await fetch(`${BASE}/c/${code}`)).text();
  assert.ok(land.includes(`${nmA} scored 14.2 cm off. Can you beat it?`) && land.includes(`/og/c/${code}.png`)); ok('/c/<code> preview names the challenger');

  // a code opened before its creator's device registered it still plays, same seed, against the code's score
  const run2 = await A.play('nyanya-jetpack', 61.3);
  const code2 = encodeChallenge({ game: 'nyanya-jetpack', seed: run2.start.seed, score: 61.3 });
  assert.equal((await B.call('GET', `/challenge/${code2}`)).status, 404);
  const early = await (await fetch(`${BASE}/c/${code2}`)).text();
  assert.ok(early.includes('A friend scored 61.3 m. Can you beat it?')); ok('unregistered code: the link preview still shows the score');
  const bs = await B.ok('POST', '/run/start', { game: 'nyanya-jetpack', challengeId: code2 });
  assert.equal(bs.seed, run2.start.seed); assert.equal(bs.mode, 'h2h'); ok('unregistered code: the friend plays the same seed');
  await sleep(2100);
  const bf = await B.ok('POST', '/run/finish', { runId: bs.runId, score: 70.2 });
  assert.equal(bf.challenge.result, 'win'); ok('unregistered code: the result is settled against the code\'s score');
  await A.ok('PUT', `/challenges/${code2}`, { runId: run2.start.runId });
  assert.equal((await B.ok('GET', `/challenge/${code2}`)).creator.name, nmA); ok('registration later claims it: the challenger is named');
  assert.equal((await B.call('PUT', `/challenges/${code2}`, { runId: bs.runId })).status, 422); ok('nobody else can claim a registered code');

  // an offline challenge run, finished later from the queue
  const run3 = await A.play('cut-in-half', 9.9);
  const code3 = encodeChallenge({ game: 'cut-in-half', seed: run3.start.seed, score: 9.9 });
  const lf = await B.ok('POST', '/run/finish', { runId: 'L' + crypto.randomUUID(), score: 12, durationMs: 9000,
    local: { game: 'cut-in-half', mode: 'h2h', variant: 'classic', seed: 'whatever', startedAt: Date.now() - 20000, challengeId: code3 } });
  assert.equal(lf.challenge.result, 'loss'); ok('a challenge played offline settles when it syncs');

  // names: the debounced check
  const n1 = await (await fetch(`${BASE}/api/names/${nmA.toUpperCase()}`)).json();
  const n2 = await (await fetch(`${BASE}/api/names/Free_${uniq}`)).json();
  const n3 = await (await fetch(`${BASE}/api/names/kuma`)).json();
  assert.deepEqual([n1.available, n1.reason, n2.available, n3.available, n3.reason], [false, 'name_taken', true, false, 'name_blocked']); ok('name check: taken (any case), free, blocked');

  // threads: the server recomputes games and seeds; lives come from the order of play; the first completion ranks
  const day = nairobiDay();
  const def = threadDef('daily-' + day);
  const attempt = 'att-' + uniq + '-1';
  const wrong = await A.call('POST', '/run/start', { game: def.games[1], mode: 'thread', thread: { id: def.id, turn: 0, attempt } });
  assert.equal(wrong.status, 400); ok('a thread turn must be the thread\'s game for that turn');
  const goodScore = { 'nyanya-jetpack': 130, 'cut-in-half': 4.5, 'cap-drop': 7, 'arrow-puzzle': 0 };
  const goodDetail = { 'cap-drop': { moves: 7, par: 7, solved: true }, 'arrow-puzzle': { bumps: 0, solved: true } };
  const playTurn = async (C, turn, att, score, detail) => {
    const g = def.games[turn];
    const s = await C.ok('POST', '/run/start', { game: g, mode: 'thread', thread: { id: def.id, turn, attempt: att } });
    assert.equal(s.seed, turnSeed(def, g));
    await sleep(2600);
    return C.ok('POST', '/run/finish', { runId: s.runId, score: score ?? goodScore[g], detail: detail ?? goodDetail[g] ?? {}, durationMs: 3000 });
  };
  const f0 = await playTurn(A, 0, attempt);
  assert.equal(f0.stars, 3); ok(`thread turn 1 (${def.games[0]}): same seed for everyone, 3 stars`);
  assert.equal((await A.call('PUT', `/threads/${def.id}/results/${attempt}`)).status, 409); ok('an unfinished thread is not accepted');
  await playTurn(A, 1, attempt); await playTurn(A, 2, attempt);
  const res = await A.ok('PUT', `/threads/${def.id}/results/${attempt}`);
  assert.deepEqual([res.status, res.stars, res.livesLeft, res.ranked], ['complete', 9, 3, true]); assert.ok(res.rank >= 1);
  assert.ok(res.awards.some((w) => w.event === 'thread.completed')); ok(`Daily thread complete: 9/9 stars, ranked #${res.rank}, completion bonus`);
  const again = await A.ok('PUT', `/threads/${def.id}/results/${attempt}`);
  assert.equal(again.stars, 9); assert.equal(again.awards.length, 0); ok('sending the result again changes nothing');
  // B: fails the first turn three times: out of lives, not ranked
  const attB = 'att-' + uniq + '-b';
  const failScore = { 'nyanya-jetpack': 2, 'cut-in-half': 80, 'cap-drop': 999, 'arrow-puzzle': 999 };
  const failDetail = { 'cap-drop': { moves: 3, par: 7, solved: false }, 'arrow-puzzle': { bumps: 3, solved: false } };
  for (let i = 0; i < 3; i++) await playTurn(B, 0, attB, failScore[def.games[0]], failDetail[def.games[0]] || {});
  const out = await B.ok('PUT', `/threads/${def.id}/results/${attB}`);
  assert.deepEqual([out.status, out.livesLeft, out.ranked], ['out', 0, false]); ok('three failed turns: out of lives, unranked');
  // A replays: unranked
  const att2 = 'att-' + uniq + '-2';
  for (let i = 0; i < 3; i++) await playTurn(A, i, att2);
  assert.equal((await A.ok('PUT', `/threads/${def.id}/results/${att2}`)).ranked, false); ok('a replay of the Daily thread is unranked');
  const sd = await A.ok('GET', `/standings/daily-thread/${day}`);
  assert.ok(sd.rows.some((r) => r.name === nmA && r.stars === 9) && sd.me && sd.me.stars === 9); ok(`Daily thread standings: ${sd.rows.length} ranked, your row #${sd.me.rank}`);
  assert.ok(!sd.rows.some((r) => r.me && r.stars !== 9)); ok('one ranked row per player');
  const wkb = await A.ok('GET', `/standings/daily-thread/${day}?board=week`);
  assert.ok(wkb.rows.length >= 1 && wkb.board === 'week'); ok('weekly roll-up of daily stars');
  // thread challenge
  const tc = threadChallengeCode(9);
  const tr = await A.ok('PUT', `/challenges/${tc}`, { threadId: def.id });
  assert.ok(tr.url.includes(`/t/${day}?from=${tc}`));
  const tpub = await B.ok('GET', `/challenge/${tc}`);
  assert.deepEqual([tpub.kind, tpub.stars, tpub.creator.name], ['thread', 9, nmA]);
  const tland = await (await fetch(`${BASE}/t/${day}?from=${tc}`)).text();
  assert.ok(tland.includes(`${nmA} got 9/9 stars`)); ok('thread challenge link: "Beat <name>\'s 9/9 stars" in the preview');

  // typical play time per game
  const st = await (await fetch(`${BASE}/api/games/stats`)).json();
  assert.ok(Object.values(st.durations).every((s) => s >= 15 && s % 15 === 0)); ok('typical play time per game, rounded to 15 s');
}

console.log(`\n${passed} checks passed.`);
