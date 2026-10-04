// Zamia: dive the wreck with two rival divers, grab treasure, get back before the air or Papa runs out
// your luck (spec §7.4). Every random draw comes from named streams of the run seed (one per dive and
// diver), so the trench, events, your dice and each rival's dice are identical for everyone on a seed,
// and a half-played trench can resume after a reload at the start of the next dive.
// Native "Kiothi seeding": before dive 1 you may move one tile anywhere in the trench.
import M from './stage.json';
import { reduced } from '../_lib/kit.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const esc = C.ui.esc;
const TN = M.tunables;
C.stage({ ...M, resumable: true, resume: tryResume });

const $ = (s) => document.querySelector(s);
const NAMES = { 1: 'beads', 2: 'porcelain', 3: 'silver', 4: 'gold' };
const TITLE = { 1: 'Beads', 2: 'Porcelain', 3: 'Silver', 4: 'Gold' };
const TIERS = [[0, 'Bronze'], [15, 'Silver'], [30, 'Gold'], [45, 'Platinum'], [60, 'Legend']];
const EVENTS = ['calm', 'current', 'bloom', 'collapse', 'leak', 'frenzy'];
const RIVALS = [
  { name: 'Baraka', short: 'B', color: '#33c2b0', cap: 3, downMin: 3, upMin: 2, turnAt: 6 },
  { name: 'Zawadi', short: 'Z', color: '#b58cf5', cap: 2, downMin: 2, upMin: 1, turnAt: 10 },
];
const FATE = { safe: '🟨', bitten: '🦈', drowned: '💨' };
const stream = (seed, name) => C.rng(seed, name);
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const tierOf = (s) => { let x = TIERS[0][1]; for (const [m, n] of TIERS) if (s >= m) x = n; return x; };
const tierLabel = (name) => t('tier_' + name) !== 'tier_' + name ? t('tier_' + name) : name;

/* ---------------- flow control ---------------- */
let RUN = 0, rejectCur = null, fast = false;
class Abort extends Error {}
const sleep = (ms, id) => new Promise((res, rej) => setTimeout(() => (id !== RUN ? rej(new Abort()) : res()), fast ? 15 : reduced() ? Math.min(ms, 120) : ms));
function choice(opts, id) {
  return new Promise((res, rej) => {
    const box = $('#actions'); box.innerHTML = '';
    opts.forEach((o) => {
      const b = document.createElement('button'); b.className = 'btn' + (o.cls ? ' ' + o.cls : ''); b.textContent = o.label;
      b.onclick = () => { if (id !== RUN) return; C.audio.ensure(); box.innerHTML = ''; rejectCur = null; res(o.key); };
      box.appendChild(b);
    });
    rejectCur = () => rej(new Abort());
    const first = box.querySelector('button'); if (first) first.focus({ preventScroll: true });
  });
}
function waiting(text) { $('#actions').innerHTML = `<span class="wait">${esc(text)}</span>`; }
$('#actions').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const bs = [...$('#actions').querySelectorAll('button')], i = bs.indexOf(document.activeElement);
  if (i < 0) return; e.preventDefault();
  bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length].focus();
});

/* ---------------- state ---------------- */
let G = null, run = null;
const value = (it) => (it.stack ? it.stack.reduce((a, b) => a + value(b), 0) : it.val);
const itemName = (it) => (it.stack ? t('pile') : t(NAMES[it.lvl]));
const active = (d) => !d.back && !d.out;
const allDone = () => G.divers.every((d) => !active(d));
const occupied = (i, me) => G.divers.some((d) => d !== me && active(d) && d.pos === i);
const showVals = () => G.event === 'bloom';

function makeTrench(r) {
  const tiles = [];
  for (let lvl = 1; lvl <= 4; lvl++) {
    const base = (lvl - 1) * 4, arr = [];
    for (let v = 0; v < 4; v++) { arr.push({ lvl, val: base + v, mimic: false }); arr.push({ lvl, val: base + v, mimic: false }); }
    shuffle(arr, r);
    const mimics = lvl === 3 ? 1 : lvl === 4 ? 2 : 0;
    for (let k = 0; k < mimics; k++) { arr[k].mimic = true; arr[k].val = 0; }
    shuffle(arr, r); tiles.push(...arr);
  }
  return tiles.map((it) => ({ item: it }));
}
function newGame(r, saved) {
  RUN++; const id = RUN; if (rejectCur) { const x = rejectCur; rejectCur = null; x(); }
  const seed = r.seed;
  G = {
    seed, dive: 0, track: makeTrench(stream(seed, 'layout')), events: shuffle(EVENTS.slice(), stream(seed, 'events')).slice(0, 3),
    sunk: [], logs: [], turnOf: null, fed: 0, fates: [],
    divers: [{ name: t('you'), short: t('you'), color: '#f26b1d', isPlayer: true, banked: 0 }]
      .concat(RIVALS.map((c) => ({ name: c.name, short: c.short, color: c.color, cfg: c, banked: 0 }))),
  };
  if (saved) {
    G.dive = saved.dive; G.track = saved.track; G.sunk = saved.sunk; G.fed = saved.fed; G.fates = saved.fates;
    saved.banked.forEach((b, i) => (G.divers[i].banked = b));
  }
  runGame(id).catch((e) => { if (!(e instanceof Abort)) console.error(e); });
}

/* ---------------- resume after reload ---------------- */
function save() {
  C.store.set('resume:zamia', { snap: C.run.snapshot(run), dive: G.dive + 1, track: G.track, sunk: G.sunk, fed: G.fed, fates: G.fates, banked: G.divers.map((d) => d.banked), at: Date.now() });
}
function tryResume() {
  const s = C.store.get('resume:zamia');
  if (!s || !s.snap || s.dive >= TN.dives || Date.now() - s.at > 12 * 3600 * 1000) return false;
  const o = C.ui.h(`<div class="overlay show" role="dialog" aria-modal="true"><div class="card">
    <div class="title-plank"><span class="outline">Zamia</span></div>
    <h2 style="font-size:26px">${esc(t('z_resume'))}</h2><p class="muted">${esc(t('z_resume_body', { n: s.dive + 1 }))}</p>
    <button class="btn wide" data-go>${esc(t('z_resume'))}</button><button class="btn alt wide" data-new>${esc(t('z_resume_new'))}</button></div></div>`);
  document.body.appendChild(o);
  o.querySelector('[data-go]').focus();
  o.querySelector('[data-go]').onclick = () => { o.remove(); run = C.run.resume(s.snap); newGame(run, s); };
  o.querySelector('[data-new]').onclick = () => { o.remove(); C.store.set('resume:zamia', null); C.showMenu(); };
  return true;
}

/* ---------------- board rendering ---------------- */
let BW = 0;
function xy(i) {
  if (i < 0) return { x: BW / 2, y: 62 };
  if (i >= G.track.length) return { x: BW / 2, y: 126 + G.track.length * 54 + 6 };
  return { x: BW / 2 + Math.sin(i * 0.62 + 0.4) * BW * 0.27, y: 126 + i * 54 };
}
function shapeHTML(it, showVal, tag = 'div', extra = '') {
  if (it.stack) return `<${tag} class="tile stack" ${extra}><span class="shape"></span><span class="val">${showVal ? value(it) : '×' + it.stack.length}</span></${tag}>`;
  const mim = it.mimic && showVal;
  return `<${tag} class="tile l${it.lvl}${mim ? ' mimic' : ''}" ${extra}><span class="shape"></span><span class="val">${mim ? '!' : showVal ? it.val : ''}</span></${tag}>`;
}
function buildBoard() {
  const sea = $('#sea'); BW = $('#trench').clientWidth;
  sea.querySelectorAll('.tile,.boat,.tok,.slot-target').forEach((e) => e.remove());
  const H = 126 + (G.track.length + 1) * 54 + 60; sea.style.height = H + 'px';
  const rope = $('#rope'); rope.setAttribute('width', BW); rope.setAttribute('height', H);
  const pts = [xy(-1)].concat(G.track.map((_, i) => xy(i))).map((p) => `${p.x},${p.y}`).join(' ');
  rope.innerHTML = `<polyline points="${pts}" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="2" stroke-dasharray="3 6"/>`;
  const b = document.createElement('div'); b.className = 'boat'; const bp = xy(-1);
  b.style.left = bp.x + 'px'; b.style.top = bp.y - 22 + 'px';
  b.innerHTML = `<svg width="150" height="70" viewBox="0 0 150 70" aria-hidden="true"><path d="M76 4 L76 46 L122 46 Z" fill="#f4efe2" stroke="#1b1d1e" stroke-width="3" stroke-linejoin="round"/><line x1="76" y1="2" x2="76" y2="48" stroke="#1b1d1e" stroke-width="3"/><path d="M6 44 H144 L128 62 H24 Z" fill="#9a5b2e" stroke="#1b1d1e" stroke-width="3" stroke-linejoin="round"/><path d="M14 52 H136" stroke="#c98a45" stroke-width="3"/></svg>`;
  sea.appendChild(b);
  renderTiles();
  for (const d of G.divers) { const tk = document.createElement('div'); tk.className = 'tok'; tk.style.background = d.color; tk.textContent = d.short; d.el = tk; sea.appendChild(tk); }
  const s = document.createElement('div'); s.className = 'tok'; s.id = 'tokShark'; s.textContent = '🦈'; s.setAttribute('aria-label', 'Papa'); sea.appendChild(s); G.sharkEl = s;
}
function renderTiles(seeding) {
  const sea = $('#sea'); sea.querySelectorAll('.tile').forEach((e) => e.remove());
  G.track.forEach((tl, i) => {
    const p = xy(i); let el;
    if (tl.item) { const w = document.createElement('div'); w.innerHTML = shapeHTML(tl.item, showVals() || seeding, seeding ? 'button' : 'div', seeding ? `data-i="${i}" aria-label="${esc(itemName(tl.item))} ${value(tl.item)}, depth ${i + 1}"` : ''); el = w.firstChild; }
    else { el = document.createElement('div'); el.className = 'tile'; el.innerHTML = '<div class="blank" style="margin:13px"></div>'; }
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; sea.insertBefore(el, sea.querySelector('.tok'));
  });
}
function renderTokens() {
  const atBoat = G.divers.filter((d) => d.pos < 0);
  G.divers.forEach((d) => {
    let p = xy(d.pos);
    if (d.pos < 0) { const k = atBoat.indexOf(d); p = { x: p.x + (k - (atBoat.length - 1) / 2) * 40, y: p.y + 4 }; }
    d.el.style.left = p.x + 'px'; d.el.style.top = p.y + 'px';
    d.el.classList.toggle('out', !!d.out); d.el.classList.toggle('turn', G.turnOf === d);
    d.el.innerHTML = esc(d.short) + (d.carried && d.carried.length && active(d) ? `<span class="w">${d.carried.length}</span>` : '');
  });
  const sp = xy(G.shark), shared = G.divers.some((d) => active(d) && d.pos === G.shark && G.shark < G.track.length);
  G.sharkEl.style.left = sp.x + (shared ? 40 : 0) + 'px'; G.sharkEl.style.top = sp.y + 'px';
}
function sharkSpeed() { const o = G.oxygen, base = o > 12 ? 1 : o > 6 ? 2 : 3, e = G.event; return Math.max(0, base + (e === 'calm' ? -1 : e === 'frenzy' ? 1 : 0)); }
function renderHud() {
  $('#diveLbl').textContent = `${run.mode === 'daily' ? t('z_daily') : run.mode === 'h2h' ? t('mode_h2h') : t('z_practice')} · ${t('z_dive', { n: G.dive + 1 })}`;
  $('#airLbl').textContent = t('z_air');
  $('#airNum').textContent = G.oxygen;
  $('#airMeter').setAttribute('aria-valuenow', G.oxygen); $('#airMeter').setAttribute('aria-valuemax', G.maxO2);
  const f = $('#airFill'); f.style.width = (G.oxygen / G.maxO2) * 100 + '%';
  f.style.background = G.oxygen > 12 ? '#3fbf6a' : G.oxygen > 6 ? '#f2b632' : '#e5544a';
  const s = sharkSpeed(); $('#papaSpd').textContent = s ? t('z_papa', { n: s }) : t('z_rest');
  const me = G.divers[0];
  $('#chips').innerHTML = me.carried && me.carried.length ? me.carried.map((it) => `<span class="chip"><span class="mini tile ${it.stack ? 'stack' : 'l' + it.lvl}" style="position:relative;transform:none"><span class="shape"></span></span>${value(it)}</span>`).join('') : `<span class="muted">${esc(t('z_nothing'))}</span>`;
  $('#banked').textContent = t('z_banked', { n: me.banked });
}
function renderAll() { renderTokens(); renderHud(); }
function log(msg, strong) {
  G.logs.unshift({ msg, strong }); G.logs = G.logs.slice(0, 2);
  $('#log').innerHTML = G.logs.map((l, i) => (i === 0 ? `<b>${esc(l.msg)}</b>` : `<span>${esc(l.msg)}</span>`)).join('');
}
function follow(i) { const tr = $('#trench'); const y = xy(i).y; tr.scrollTo({ top: Math.max(0, y - tr.clientHeight * 0.45), behavior: reduced() ? 'auto' : 'smooth' }); }

/* ---------------- dives ---------------- */
function setupDive(d) {
  G.dive = d; G.event = G.events[d];
  if (d > 0) {
    G.track = G.track.filter((tl) => tl.item);
    for (let i = 0; i < G.sunk.length; i += 3) G.track.push({ item: { stack: G.sunk.slice(i, i + 3), lvl: 4 } });
    G.sunk = [];
  }
  if (G.event === 'collapse') { const r = stream(G.seed, 'collapse' + d); for (let i = 0; i < G.track.length - 1; i++) if (r() < 0.4) { [G.track[i], G.track[i + 1]] = [G.track[i + 1], G.track[i]]; i++; } }
  G.maxO2 = G.event === 'leak' ? TN.leakAir : TN.air; G.oxygen = G.maxO2;
  G.shark = G.track.length;
  G.prng = stream(G.seed, 'you' + d);
  G.divers.forEach((v, i) => { v.pos = -1; v.dir = 1; v.turned = false; v.back = false; v.out = false; v.carried = []; v.gain = 0; v.fate = ''; if (i) v.rng = stream(G.seed, `rival${i - 1}-${d}`); });
  G.logs = []; buildBoard(); renderAll();
  $('#event').innerHTML = `<b>${esc(t('z_dive', { n: d + 1 }))}: ${esc(t('ev_' + G.event))}.</b> ${esc(t('ev_' + G.event + '_d'))}`;
  $('#trench').scrollTo({ top: 0 });
}
async function rollDice(r, id, who) {
  const row = $('#diceRow'); C.audio.noise(0.12, 2500, 'lowpass', 0.25);
  const a = 1 + Math.floor(r() * 3), b = 1 + Math.floor(r() * 3);
  if (!reduced() && !fast) for (let k = 0; k < 5; k++) { row.innerHTML = `<span class="die">${1 + Math.floor(Math.random() * 3)}</span><span class="die">${1 + Math.floor(Math.random() * 3)}</span>`; await sleep(60, id); }
  row.innerHTML = `<span class="die">${a}</span><span class="die">${b}</span><span id="diceTxt">${esc(who)}</span>`;
  return a + b;
}
function stepsFor(d, roll) { let s = Math.max(0, roll - d.carried.length); if (G.event === 'current') s = Math.max(0, s + (d.dir > 0 ? 1 : -1)); return s; }
async function move(d, steps, id) {
  for (let k = 0; k < steps; k++) {
    let n = d.pos + d.dir;
    while (n >= 0 && n < G.track.length && occupied(n, d)) n += d.dir;
    if (d.dir > 0 && n >= G.track.length) break;
    if (d.dir < 0 && n < 0) { d.pos = -1; renderTokens(); await sleep(200, id); return bank(d); }
    d.pos = n; renderTokens(); C.audio.tone(320, 240, 0.06, 'sine', 0.06); follow(d.pos); await sleep(200, id);
  }
}
function bank(d) {
  d.back = true; const v = d.carried.reduce((a, it) => a + value(it), 0); d.banked += v; d.gain = v; d.fate = 'safe';
  log(d.isPlayer ? t('z_back', { v }) : t('z_back_them', { name: d.name, v }));
  d.carried = []; if (d.isPlayer) C.audio.chord([523, 659, 784], 0.08, 0.18); renderAll();
}
function noDeeper(d) { for (let i = d.pos + 1; i < G.track.length; i++) if (!occupied(i, d)) return false; return true; }

async function playerTurn(d, id) {
  follow(d.pos < 0 ? -1 : d.pos);
  let opts;
  if (d.pos < 0) opts = [{ key: 'down', label: t('z_dive_in') }];
  else if (!d.turned && noDeeper(d)) opts = [{ key: 'up', label: t('z_turn_roll') }];
  else if (!d.turned) opts = [{ key: 'down', label: t('z_keep') }, { key: 'up', label: t('z_turn'), cls: 'alt' }];
  else opts = [{ key: 'up', label: t('z_swim') }];
  log(d.turned ? t('z_yourturn_up') : t('z_yourturn'), true);
  const c = await choice(opts, id);
  run.input(c, G.dive);
  if (c === 'up' && !d.turned) { d.turned = true; d.dir = -1; }
  const roll = await rollDice(G.prng, id, '');
  const steps = stepsFor(d, roll);
  $('#diceTxt').textContent = `${roll}${d.carried.length ? ` − ${d.carried.length}` : ''}${G.event === 'current' ? (d.dir > 0 ? ' + 1' : ' − 1') : ''} = ${steps}`;
  await move(d, steps, id);
  if (d.back) return;
  if (await catchCheck(d, id)) return;
  const tile = G.track[d.pos];
  if (tile.item) {
    const it = tile.item;
    let label = t('z_take', { name: itemName(it) });
    if (showVals()) label += it.mimic ? ' (!)' : ` (${value(it)})`;
    log(it.stack ? t('z_pile') : it.lvl >= 3 && !showVals() ? t('z_maybe_mimic', { name: t(NAMES[it.lvl]) }) : t('z_landed', { name: t(NAMES[it.lvl]) }), true);
    const c2 = await choice([{ key: 'take', label }, { key: 'leave', label: t('z_leave'), cls: 'alt' }], id);
    run.input(c2, G.dive);
    if (c2 === 'take') await take(d, tile, id);
  } else if (d.carried.length) {
    log(t('z_empty'), true);
    const opts2 = d.carried.map((it, i) => ({ key: 'd' + i, label: t('z_drop', { name: it.stack ? t('pile') : t(TITLE[it.lvl]), v: value(it) }), cls: 'alt' }));
    opts2.unshift({ key: 'keep', label: t('z_keep_all') });
    const c3 = await choice(opts2, id);
    run.input(c3, G.dive);
    if (c3 !== 'keep') { const it = d.carried.splice(+c3.slice(1), 1)[0]; tile.item = it; renderTiles(); log(t('z_dropped', { v: value(it), name: itemName(it) })); }
  }
  renderAll();
}
async function take(d, tile, id) {
  const it = tile.item; tile.item = null; renderTiles();
  if (it.mimic) {
    C.audio.tone(300, 90, 0.35, 'square', 0.08); G.shark = Math.max(0, G.shark - 2); renderTokens();
    log(d.isPlayer ? t('z_mimic_you') : t('z_mimic_them', { name: d.name }), true);
    await sleep(700, id); renderAll(); await catchCheck(d, id); return;
  }
  d.carried.push(it);
  if (d.isPlayer) { C.audio.tone(660, 990, 0.12, 'triangle', 0.14); log(t('z_took', { name: itemName(it), v: value(it) })); run.firstAtom(); }
  else log(t('z_took_them', { name: d.name }));
  renderAll();
}
async function rivalTurn(d, id) {
  const c = d.cfg;
  waiting(t('z_diving', { name: d.name }));
  if (!d.turned && d.pos >= 0 && (d.carried.length >= c.cap || G.oxygen <= c.turnAt + d.pos * 0.4 || noDeeper(d))) {
    d.turned = true; d.dir = -1; log(t('z_turns', { name: d.name })); renderTokens(); await sleep(350, id);
  }
  follow(d.pos < 0 ? -1 : d.pos); await sleep(250, id);
  const roll = await rollDice(d.rng, id, d.name);
  await move(d, stepsFor(d, roll), id);
  if (d.back) { await sleep(400, id); return; }
  if (await catchCheck(d, id)) return;
  const tl = G.track[d.pos];
  if (tl.item && d.carried.length < c.cap) {
    const it = tl.item, lvl = it.stack ? 4 : it.lvl;
    const want = d.dir > 0 ? lvl >= c.downMin : lvl >= c.upMin;
    if (want && !(showVals() && it.mimic)) await take(d, tl, id);
  }
  await sleep(450, id);
}
async function catchCheck(d, id) {
  if (!active(d) || d.pos < 0 || d.pos < G.shark || G.shark >= G.track.length) return false;
  await bite(d, id); return true;
}
async function bite(d, id) {
  C.audio.tone(110, 70, 0.4, 'sawtooth', 0.12); C.audio.noise(0.3, 500, 'lowpass', 0.3); C.haptic(50);
  follow(d.pos); renderTokens();
  const mult = G.event === 'frenzy' ? 2 : 1;
  let feed = -1;
  if (d.isPlayer) {
    if (d.carried.length) {
      log(t('z_reached'), true);
      const opts = d.carried.map((it, i) => { const lv = it.stack ? 4 : it.lvl; return { key: 'f' + i, label: t('z_feed', { v: value(it), b: lv * mult }) }; });
      opts.push({ key: 'bite', label: t('z_bite'), cls: 'red' });
      const c = await choice(opts, id); run.input(c, G.dive); if (c !== 'bite') feed = +c.slice(1);
    } else log(t('z_flee'), true);
  } else if (d.carried.length) {
    let bi = 0; d.carried.forEach((it, i) => { if (value(it) < value(d.carried[bi])) bi = i; }); feed = bi;
  }
  if (feed >= 0) {
    const it = d.carried.splice(feed, 1)[0], lv = it.stack ? 4 : it.lvl;
    G.shark = Math.min(G.track.length, G.shark + lv * mult);
    if (d.isPlayer) G.fed++;
    log(d.isPlayer ? t('z_fed', { v: value(it), name: itemName(it), b: lv * mult }) : t('z_fed_them', { name: d.name, b: lv * mult }));
    renderAll(); await sleep(600, id); return 'fed';
  }
  const had = d.carried.length;
  G.sunk.push(...d.carried); d.carried = []; d.out = true; d.fate = 'bitten'; d.pos = -1;
  if (!d.isPlayer) log(had ? t('z_caught_them', { name: d.name }) : t('z_chased', { name: d.name }));
  else if (had) log(t('z_caught_you'));
  renderAll(); await sleep(800, id); return 'bitten';
}
async function sharkPhase(id) {
  const sp = sharkSpeed(); if (!sp) return;
  for (let s = 0; s < sp; s++) {
    if (G.shark > 0) G.shark--; renderTokens(); await sleep(260, id);
    const victims = G.divers.filter((d) => active(d) && d.pos >= 0 && d.pos >= G.shark).sort((a, b) => b.pos - a.pos);
    for (const v of victims) { if (!active(v) || v.pos < G.shark) continue; const r = await bite(v, id); if (r === 'fed') return; }
  }
}
async function airOut(id) {
  C.audio.tone(300, 90, 0.35, 'square', 0.08); log(t('z_airout'), true);
  for (const d of G.divers) if (active(d)) { G.sunk.push(...d.carried); d.carried = []; d.out = true; d.fate = 'drowned'; d.pos = -1; }
  renderAll(); await sleep(900, id);
}
async function runDive(id) {
  while (true) {
    for (const d of G.divers) {
      if (!active(d)) continue;
      G.turnOf = d; renderTokens();
      if (d.carried.length) { G.oxygen = Math.max(0, G.oxygen - d.carried.length); renderHud(); }
      if (G.oxygen <= 0) G.airOut = true;
      if (d.isPlayer) { C.ui.announce(`${t('z_air')}: ${G.oxygen}`); await playerTurn(d, id); } else await rivalTurn(d, id);
      if (G.airOut) { G.airOut = false; await airOut(id); return; }
      if (allDone()) return;
    }
    G.turnOf = null; waiting(t('z_stirs')); await sharkPhase(id);
    if (allDone()) return;
  }
}

/* ---------------- Kiothi seeding (Native) ---------------- */
function kiothiSeeding(id) {
  return new Promise((res, rej) => {
    const sea = $('#sea'); sea.classList.add('seeding');
    let picked = -1;
    log(t('z_seed_body'), true);
    renderTiles(true);
    const box = $('#actions'); box.innerHTML = '';
    const skip = document.createElement('button'); skip.className = 'btn alt'; skip.textContent = t('z_seed_skip'); box.appendChild(skip);
    const finish = (msg) => { sea.classList.remove('seeding'); sea.removeEventListener('click', onClick); box.innerHTML = ''; renderTiles(); renderAll(); if (msg) log(msg, true); rejectCur = null; res(); };
    skip.onclick = () => { run.input('seed-skip', 0); finish(); };
    rejectCur = () => { sea.classList.remove('seeding'); sea.removeEventListener('click', onClick); rej(new Abort()); };
    function onClick(e) {
      const b = e.target.closest('button.tile');
      if (!b || id !== RUN) return;
      const i = +b.dataset.i;
      if (picked < 0) { picked = i; b.classList.add('picked'); log(t('z_seed_where'), true); C.audio.tone(520, 700, 0.08, 'triangle', 0.1); return; }
      if (i === picked) { picked = -1; b.classList.remove('picked'); log(t('z_seed_pick'), true); return; }
      const [tl] = G.track.splice(picked, 1);
      G.track.splice(i, 0, tl);
      run.input(`seed:${picked}>${i}`, 0); run.event('kiothi', { from: picked, to: i, lvl: tl.item.lvl });
      finish(t('z_seed_done', { name: t(NAMES[tl.item.lvl]), a: picked + 1, b: i + 1 }));
    }
    sea.addEventListener('click', onClick);
    const first = sea.querySelector('button.tile'); if (first) first.focus({ preventScroll: true });
    log(t('z_seed_pick'), true);
  });
}

/* ---------------- summaries + finish ---------------- */
const fateTxt = (d) => (d.fate === 'safe' ? t('z_safe', { v: d.gain }) : d.fate === 'bitten' ? t('z_bitten') : t('z_drowned'));
function diveSummary(id) {
  G.turnOf = null; renderAll(); $('#actions').innerHTML = ''; $('#diceRow').innerHTML = '';
  G.fates.push(G.divers[0].fate || 'drowned');
  const last = G.dive === TN.dives - 1, nxt = last ? null : G.events[G.dive + 1];
  if (!last) save();
  return new Promise((res, rej) => {
    const o = C.ui.h(`<div class="overlay show" role="dialog" aria-modal="true"><div class="card">
      <h2 style="font-size:28px">${esc(t('z_done', { n: G.dive + 1 }))}</h2>
      <div class="rows">${G.divers.map((d) => `<div class="row ${d.isPlayer ? 'me' : ''}"><span>${esc(d.name)}<small>${esc(fateTxt(d))}</small></span><b>${d.banked}</b></div>`).join('')}</div>
      ${nxt ? `<p class="muted">${esc(t('z_nextinfo', { name: t('ev_' + nxt), desc: t('ev_' + nxt + '_d') }))}</p>` : ''}
      <button class="btn wide">${esc(last ? t('z_final') : t('z_next_dive', { n: G.dive + 2 }))}</button></div></div>`);
    document.body.appendChild(o);
    const b = o.querySelector('button'); b.focus({ preventScroll: true });
    b.onclick = () => { if (id !== RUN) return; o.remove(); rejectCur = null; res(); };
    rejectCur = () => { o.remove(); rej(new Abort()); };
    C.ui.announce(t('z_done', { n: G.dive + 1 }));
  });
}
async function finalScore() {
  C.store.set('resume:zamia', null);
  const me = G.divers[0], s = me.banked, tier = tierOf(s);
  const ranked = G.divers.slice().sort((a, b) => b.banked - a.banked);
  const better = G.divers.filter((d) => d !== me && d.banked > s).length, level = G.divers.filter((d) => d !== me && d.banked === s).length;
  const placeTxt = better === 0 && level === 0 ? t('z_place1') : better === 0 ? t('z_tie') : better === 1 ? t('z_place2') : t('z_place3');
  const nextT = TIERS.find((x) => x[0] > s);
  const grid = G.fates.map((f) => FATE[f] || '💨').join('');
  const day = new Date().toLocaleDateString(C.prefs.lang === 'sw' ? 'sw-KE' : 'en-KE', { day: 'numeric', month: 'short' });
  await run.finish({
    score: s, tiebreak: G.fed,
    detail: { banked: s, tier, fates: G.fates, rivals: G.divers.slice(1).map((d) => d.banked), fed: G.fed },
    sub: `${tierLabel(tier)}. ${nextT ? t('z_tier_next', { tier: tierLabel(nextT[1]), n: nextT[0] }) : t('z_tier_top')} ${placeTxt} · ${ranked.map((d) => `${d.name} ${d.banked}`).join(', ')}`,
    share: { line: t('z_line', { n: s, tier: tierLabel(tier) }), grid, head: `Zamia ${day} · ${s} pts (${tierLabel(tier)})` },
  });
}
async function runGame(id) {
  for (let d = G.dive; d < TN.dives; d++) {
    setupDive(d);
    if (d === 0 && run.variant === 'native' && !G.seeded) { G.seeded = true; await kiothiSeeding(id); }
    log(d === 0 ? t('z_start') : t('z_refill', { n: d + 1 }), true);
    await sleep(500, id);
    await runDive(id);
    await diveSummary(id);
  }
  await finalScore();
}

/* ---------------- lifecycle ---------------- */
C.onPlay(async (ctx) => {
  C.store.set('resume:zamia', null);
  run = await C.run.start(ctx);
  newGame(run);
});
C.onQuit(() => { RUN++; if (rejectCur) { const x = rejectCur; rejectCur = null; try { x(); } catch (_) {} } C.store.set('resume:zamia', null); });
addEventListener('resize', () => { if (G && $('#trench').clientWidth !== BW) { buildBoard(); renderAll(); } });

// test hook for scripts/browser.mjs: speeds up animation and presses the first choice on screen
window.__chezAuto = () => {
  fast = true;
  const b = document.querySelector('.overlay.show .btn') || document.querySelector('#actions button');
  if (b) b.click();
};

// idle board behind the intro card
G = { seed: 'idle', dive: 0, track: makeTrench(stream('idle', 'layout')), events: ['calm'], sunk: [], logs: [], turnOf: null, fates: [], event: 'calm',
  divers: [{ name: t('you'), short: t('you'), color: '#f26b1d', isPlayer: true, banked: 0 }].concat(RIVALS.map((c) => ({ name: c.name, short: c.short, color: c.color, cfg: c, banked: 0 }))) };
G.maxO2 = TN.air; G.oxygen = TN.air; G.shark = G.track.length;
for (const v of G.divers) { v.pos = -1; v.dir = 1; v.carried = []; v.back = false; v.out = false; }
run = { mode: 'daily' };
requestAnimationFrame(() => { buildBoard(); renderAll(); $('#event').innerHTML = `<b>Zamia.</b> ${esc(C.L(M.rule))}`; });
