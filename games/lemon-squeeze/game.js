// Lemon Squeeze: swipe to cut the lemon and drain fly-free pieces into the glass (spec §7.3).
// Flies move at fixed 1/60 s steps from the run seed, and juice is credited from each piece's area,
// so the score never depends on the screen. Juice drops are cosmetic.
// Native "Panga Nzi": a challenger places the flies; their layout becomes the receiver's board.
import M from './stage.json';
import { fixedLoop, outlined, reduced, hud } from '../_lib/kit.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const T = M.tunables;
const CAPACITY = T.capacity, FLY_R = T.flyR;
C.stage({ ...M, challengeSetup: placeFlies });

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const setLvl = hud(document.getElementById('lvl')), setCuts = hud(document.getElementById('cutsTxt')), setPips = hud(document.getElementById('pips'));

/* ---------- geometry (lemon-local units: radius 1) ---------- */
function circlePoly(n) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push({ x: Math.cos(a), y: Math.sin(a) }); } return p; }
function sArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
const area = (p) => Math.abs(sArea(p));
function centroid(p) { let x = 0, y = 0, A = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = a.x * b.y - b.x * a.y; A += c; x += (a.x + b.x) * c; y += (a.y + b.y) * c; } A /= 2; if (Math.abs(A) < 1e-9) return p[0]; return { x: x / (6 * A), y: y / (6 * A) }; }
function side(a, b, p) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
function splitLine(poly, a, b) {
  const A = [], B = [], X = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(a, b, p), sq = side(a, b, q);
    if (sp >= 0) A.push(p); if (sp <= 0) B.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const u = sp / (sp - sq), x = { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }; A.push(x); B.push(x); X.push(x); }
  }
  return { A, B, X };
}
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let u = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u)); }
function insideBy(poly, pt, margin) {
  const o = Math.sign(sArea(poly)) || 1;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-9) continue; if (o * side(a, b, pt) / L < margin) return false; }
  return true;
}
const ORIG = area(circlePoly(56));

/* ---------- state ---------- */
let S = null, run = null;
let falling = [], drops = [], swipe = null, flash = null, msg = null, popT = 0, deadFly = null, juicedAt = 0, shownFill = 0;
let aim = { ang: 0.4, off: 0 };

function startLevel(n) {
  const s = S;
  s.level = n; s.cuts = 0; s.filled = 0; s.poly = circlePoly(56); s.mode = 'play';
  s.cutLimit = n === 1 ? 8 : n <= 3 ? 7 : 6;
  falling = []; drops = []; deadFly = null; flash = null; shownFill = 0;
  const nf = Math.min(1 + n, T.maxFlies), spd = Math.min(0.9, 0.3 + 0.08 * n) * s.speed, r = s.rng;
  s.flies = [];
  for (let i = 0; i < nf; i++) {
    let p;
    const placed = s.layout && s.layout[i];
    if (placed && n <= 3) p = { x: placed.x, y: placed.y };
    else for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.62; p = { x: Math.cos(a) * rr, y: Math.sin(a) * rr }; if (s.flies.every((f) => Math.hypot(f.x - p.x, f.y - p.y) > 0.28)) break; }
    s.flies.push({ x: p.x, y: p.y, ang: r() * 7, turn: 0, speed: spd * (0.8 + r() * 0.4), base: spd, pause: r() * 0.6, flap: r() * 7 });
  }
  popT = performance.now();
  if (n === 1) setMsg(t('kd_swipe'), '#fff', 2600);
  C.ui.announce(`${t('kd_lemon', { n })}. ${t('kd_cuts', { n: s.cutLimit })}`);
}
function setMsg(text, color, dur = 1300) { msg = { text, color, t0: performance.now(), dur }; }

/* ---------- layout ---------- */
let W = 0, H = 0, dpr = 1, LR = 100, cx = 0, cy = 0, G = {}, lemonTex = null;
function resize() {
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const gw = Math.min(W * 0.36, 170), gh = Math.min(H * 0.24, 200), top = H - gh - Math.max(14, H * 0.035);
  G = { gw, gh, top, bottom: top + gh, mL: W / 2 - gw / 2, mR: W / 2 + gw / 2, bHalf: gw * 0.42 };
  const dropY = (G.mL + 10) * 0.42;
  G.straws = [{ a: { x: -12, y: top - dropY - 6 }, b: { x: G.mL + 3, y: top - 2 } }, { a: { x: W + 12, y: top - dropY - 6 }, b: { x: G.mR - 3, y: top - 2 } }];
  LR = Math.min(W * 0.34, H * 0.18); cy = Math.max(LR * 1.2 + 8, H * 0.25); cx = W / 2;
  lemonTex = makeLemon(LR);
}
new ResizeObserver(resize).observe(cv);
function makeLemon(r) {
  const s = Math.ceil(r * 2 + 8), oc = document.createElement('canvas'); oc.width = Math.ceil(s * dpr); oc.height = Math.ceil(s * dpr);
  const g = oc.getContext('2d'); g.scale(dpr, dpr); g.translate(s / 2, s / 2);
  g.fillStyle = '#f2bf16'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.fillStyle = '#ffe066'; g.beginPath(); g.arc(0, 0, r * 0.95, 0, 7); g.fill();
  g.fillStyle = '#fff7d4'; g.beginPath(); g.arc(0, 0, r * 0.9, 0, 7); g.fill();
  for (let i = 0; i < 10; i++) {
    const a0 = i / 10 * Math.PI * 2 + 0.045, a1 = (i + 1) / 10 * Math.PI * 2 - 0.045, mid = (a0 + a1) / 2;
    g.beginPath(); g.moveTo(Math.cos(mid) * r * 0.1, Math.sin(mid) * r * 0.1); g.arc(0, 0, r * 0.84, a0, a1); g.closePath();
    const gr = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 0.84); gr.addColorStop(0, '#ffe98a'); gr.addColorStop(1, i % 2 ? '#ffd21f' : '#ffcc0f'); g.fillStyle = gr; g.fill();
  }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = 'rgba(255,250,200,.55)';
  for (let i = 0; i < 160; i++) { const a = rnd() * Math.PI * 2, d = (0.18 + rnd() * 0.62) * r; g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.035, r * 0.012, a, 0, 7); g.fill(); }
  g.fillStyle = '#fff7d4'; g.beginPath(); g.arc(0, 0, r * 0.08, 0, 7); g.fill();
  return { c: oc, s };
}

/* ---------- cutting (applied on a sim tick) ---------- */
function doCut(a, b, tick) {
  const s = S;
  const scr = (p) => ({ x: cx + p.x * LR, y: cy + p.y * LR });
  const fl = (col) => { flash = { a: scr(a), b: scr(b), color: col, t0: performance.now() }; };
  if (Math.hypot(b.x - a.x, b.y - a.y) < 0.2) return;
  const { A, B, X } = splitLine(s.poly, a, b);
  if (X.length < 2) { fl('#9aa3a8'); return; }
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  if (!X.every((x) => { const u = ((x.x - a.x) * dx + (x.y - a.y) * dy) / L; return u > -0.15 && u < 1.15; })) { fl('#9aa3a8'); setMsg(t('kd_across'), '#fff'); return; }
  const aA = area(A), aB = area(B);
  if (Math.min(aA, aB) < 0.004 * ORIG) { fl('#9aa3a8'); return; }
  s.cuts++; s.totalCuts++;
  run.input(`C${a.x.toFixed(3)},${a.y.toFixed(3)},${b.x.toFixed(3)},${b.y.toFixed(3)}`, tick);
  const hit = s.flies.find((f) => segDist(f, X[0], X[1]) < FLY_R * 0.8);
  if (hit) { fl('#e5322a'); return fail(hit); }
  let fa = 0, fb = 0; for (const f of s.flies) side(a, b, f) > 0 ? fa++ : fb++;
  if (fa > 0 && fb > 0) { fl('#e5322a'); setMsg(t('kd_both'), '#ffb3a8'); sfx.buzz(); C.ui.announce(t('kd_both')); return; }
  const keep = fa > 0 ? A : B, drop = fa > 0 ? B : A;
  const ck = centroid(keep), cd = centroid(drop);
  let nx = cd.x - ck.x, ny = cd.y - ck.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
  s.poly = keep; fl('#3fe04a'); sfx.slice(); C.haptic(20);
  run.firstAtom();
  // the juice is credited 0.42 s of sim time later, from the piece's area
  s.pendingJuice.push({ at: s.time + 0.42, vol: area(drop) / ORIG });
  falling.push({ poly: drop, c: cd, ox: 0, oy: 0, rot: 0, vx: nx * 140, vy: ny * 140 - 90, vr: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2), t: 0, vol: area(drop) / ORIG });
}
function fail(f) {
  S.mode = 'dead'; deadFly = f; sfx.squish(); C.haptic(80);
  C.ui.announce(t('kd_fly'));
  setTimeout(() => end('kd_fly'), 900);
}
async function end(reasonKey) {
  const s = S;
  if (!s || s.over) return;
  s.over = true; loop.halt();
  const juiced = s.level - 1;
  await run.finish({
    score: juiced, tiebreak: s.totalCuts,
    detail: { lemons: juiced, cuts: s.totalCuts, reason: reasonKey },
    sub: t(reasonKey), share: { line: t('kd_line', { n: juiced }) },
  });
}

/* ---------- simulation ---------- */
function step(dt, tick) {
  const s = S;
  if (!s || s.over) return;
  s.time += dt;
  if (s.pendingCut) { const c = s.pendingCut; s.pendingCut = null; if (s.mode === 'play') doCut(c.a, c.b, tick); }
  if (s.mode === 'play' || s.mode === 'juiced') {
    const margin = FLY_R * 0.55, r = s.rng;
    for (const f of s.flies) {
      f.flap += dt * 40;
      if (f.pause > 0) { f.pause -= dt; continue; }
      if (r() < dt * 0.9) f.turn = (r() - 0.5) * 6;
      if (r() < dt * 0.35) f.pause = 0.25 + r() * 0.8;
      if (r() < dt * 0.25) f.speed = f.base * (r() < 0.4 ? 2.2 : 0.6 + r() * 0.8);
      f.ang += f.turn * dt;
      const nx = f.x + Math.cos(f.ang) * f.speed * dt, ny = f.y + Math.sin(f.ang) * f.speed * dt;
      if (insideBy(s.poly, { x: nx, y: ny }, margin)) { f.x = nx; f.y = ny; }
      else {
        const c = centroid(s.poly); f.ang = Math.atan2(c.y - f.y, c.x - f.x) + (r() - 0.5) * 1.2;
        if (!insideBy(s.poly, f, margin)) { f.x += (c.x - f.x) * Math.min(1, dt * 3); f.y += (c.y - f.y) * Math.min(1, dt * 3); }
      }
    }
  }
  for (let i = s.pendingJuice.length - 1; i >= 0; i--) if (s.time >= s.pendingJuice[i].at) { s.filled += s.pendingJuice[i].vol; s.pendingJuice.splice(i, 1); }
  if (s.mode === 'play') {
    if (s.filled >= CAPACITY - 1e-6) { s.mode = 'juiced'; s.juicedAt = s.time; juicedAt = performance.now(); sfx.win(); C.ui.announce(t('kd_juiced')); }
    else if (s.cuts >= s.cutLimit && !s.pendingJuice.length) { s.mode = 'dead'; sfx.buzz(); C.ui.announce(t('kd_out')); s.endAt = s.time + 0.8; }
  }
  if (s.mode === 'juiced' && s.time - s.juicedAt > 1.6) startLevel(s.level + 1);
  if (s.mode === 'dead' && s.endAt && s.time >= s.endAt) { s.endAt = 0; end('kd_out'); }
}

/* ---------- lifecycle ---------- */
C.onPlay(async (ctx) => {
  run = await C.run.start(ctx);
  const payload = run.challenge && run.challenge.payload;
  S = { rng: run.rng, speed: run.speed, time: 0, totalCuts: 0, pendingJuice: [], over: false, pendingCut: null,
    layout: payload && Array.isArray(payload.flies) ? payload.flies.slice(0, T.maxFlies).map((f) => ({ x: +f.x, y: +f.y })) : null };
  if (S.layout && run.challenge.creator) setMsg(t('kd_from', { name: run.challenge.creator.name || t('anon') }), '#fff', 2600);
  loop.resetTick();
  startLevel(1);
  loop.play();
  cv.focus({ preventScroll: true });
});
C.onPause(() => loop.halt());
C.onResume(() => { if (S && !S.over) loop.play(); });
C.onQuit(() => { S = null; loop.halt(); });

/* ---------- input ---------- */
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
const toLocal = (p) => ({ x: (p.x - cx) / LR, y: (p.y - cy) / LR });
cv.addEventListener('pointerdown', (e) => {
  if (!S || S.mode !== 'play') return; e.preventDefault(); C.audio.ensure();
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  const p = pos(e); swipe = { a: p, b: p, id: e.pointerId };
});
cv.addEventListener('pointermove', (e) => { if (swipe && e.pointerId === swipe.id) swipe.b = pos(e); });
cv.addEventListener('pointerup', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const s = swipe; swipe = null; s.b = pos(e);
  if (S && S.mode === 'play' && Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) >= 25) S.pendingCut = { a: toLocal(s.a), b: toLocal(s.b) };
});
cv.addEventListener('pointercancel', () => { swipe = null; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
// keyboard: left/right rotate the aim line, up/down shift it, Enter or Space cuts along it
function aimLine() { const nx = -Math.sin(aim.ang), ny = Math.cos(aim.ang); const ox = nx * aim.off, oy = ny * aim.off; return { a: { x: ox - Math.cos(aim.ang) * 1.4, y: oy - Math.sin(aim.ang) * 1.4 }, b: { x: ox + Math.cos(aim.ang) * 1.4, y: oy + Math.sin(aim.ang) * 1.4 } }; }
document.addEventListener('keydown', (e) => {
  if (!S || S.over || C.isPaused() || document.querySelector('.sheet-wrap,.overlay.show,.editor')) return;
  if (e.code === 'ArrowLeft') { aim.ang -= 0.08; e.preventDefault(); }
  if (e.code === 'ArrowRight') { aim.ang += 0.08; e.preventDefault(); }
  if (e.code === 'ArrowUp') { aim.off = Math.max(-0.95, aim.off - 0.05); e.preventDefault(); }
  if (e.code === 'ArrowDown') { aim.off = Math.min(0.95, aim.off + 0.05); e.preventDefault(); }
  if ((e.code === 'Enter' || e.code === 'Space') && S.mode === 'play') { e.preventDefault(); C.audio.ensure(); S.pendingCut = aimLine(); }
});

// test hook for scripts/browser.mjs: cut along the best fly-free chord it can find
window.__chezAuto = () => {
  if (!S || S.mode !== 'play' || S.pendingCut) return;
  let best = null;
  for (let i = 0; i < 48; i++) for (const off of [-0.6, -0.45, -0.3, 0.3, 0.45, 0.6]) {
    const ang = i / 48 * Math.PI, nx = -Math.sin(ang), ny = Math.cos(ang);
    const a = { x: nx * off - Math.cos(ang) * 1.4, y: ny * off - Math.sin(ang) * 1.4 }, b = { x: nx * off + Math.cos(ang) * 1.4, y: ny * off + Math.sin(ang) * 1.4 };
    const { A, B, X } = splitLine(S.poly, a, b);
    if (X.length < 2 || S.flies.some((f) => segDist(f, X[0], X[1]) < FLY_R * 1.6)) continue;
    let fa = 0, fb = 0; for (const f of S.flies) side(a, b, f) > 0 ? fa++ : fb++;
    if (fa && fb) continue;
    const v = fa ? area(B) : area(A);
    if (!best || v > best.v) best = { v, a, b };
  }
  if (best) S.pendingCut = { a: best.a, b: best.b };
};

/* ---------- Panga Nzi: place the flies before sending ---------- */
function placeFlies() {
  return new Promise((resolve) => {
    const flies = [];
    const el = C.ui.h(`<div class="editor" role="dialog" aria-modal="true" aria-labelledby="pzT"><div class="card">
      <h2 id="pzT" style="font-size:26px">${C.ui.esc(t('kd_place'))}</h2>
      <p class="muted">${C.ui.esc(t('kd_place_body'))}</p>
      <canvas width="600" height="600" aria-label="Lemon. Tap to place a fly."></canvas>
      <p class="muted" data-n aria-live="polite"></p>
      <div class="hstack"><button class="btn alt" data-clear>${C.ui.esc(t('kd_place_clear'))}</button><button class="btn" data-done disabled>${C.ui.esc(t('kd_place_done'))}</button></div>
      <button class="btn alt wide" data-cancel>${C.ui.esc(t('cancel'))}</button></div></div>`);
    document.body.appendChild(el);
    const c = el.querySelector('canvas'), g = c.getContext('2d'), tex = makeLemon(250);
    function paint() {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 600, 600);
      g.drawImage(tex.c, 300 - tex.s / 2, 300 - tex.s / 2, tex.s, tex.s);
      g.strokeStyle = '#1b1d1e'; g.lineWidth = 4; g.beginPath(); g.arc(300, 300, 250, 0, 7); g.stroke();
      for (const f of flies) { g.beginPath(); g.arc(300 + f.x * 250, 300 + f.y * 250, FLY_R * 250, 0, 7); g.fillStyle = '#2f8c74'; g.fill(); g.lineWidth = 4; g.stroke(); }
      el.querySelector('[data-n]').textContent = t('kd_placed', { n: flies.length });
      el.querySelector('[data-done]').disabled = flies.length < 2;
    }
    c.addEventListener('pointerdown', (e) => {
      const r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width * 600 - 300) / 250, y = ((e.clientY - r.top) / r.height * 600 - 300) / 250;
      if (Math.hypot(x, y) > 0.7 || flies.length >= T.maxFlies) return;
      if (flies.some((f) => Math.hypot(f.x - x, f.y - y) < 0.2)) return;
      flies.push({ x: +x.toFixed(3), y: +y.toFixed(3) }); paint();
    });
    const close = (v) => { el.remove(); resolve(v); };
    el.querySelector('[data-clear]').onclick = () => { flies.length = 0; paint(); };
    el.querySelector('[data-done]').onclick = () => close({ flies });
    el.querySelector('[data-cancel]').onclick = () => close(null);
    paint();
  });
}

/* ---------- sound ---------- */
let lastPlop = 0;
const sfx = {
  slice() { C.audio.noise(0.18, 3200, 'highpass', 0.35, 1.5); C.audio.tone(900, 300, 0.12, 'triangle', 0.08); },
  plop() { const n = performance.now(); if (n - lastPlop < 70) return; lastPlop = n; C.audio.tone(700 + Math.random() * 500, 250, 0.09, 'sine', 0.12); },
  buzz() { C.audio.tone(180, 160, 0.35, 'sawtooth', 0.07); C.audio.tone(186, 170, 0.35, 'sawtooth', 0.05); },
  squish() { C.audio.noise(0.3, 600, 'lowpass', 0.7, 1.5); C.audio.tone(220, 60, 0.25, 'sine', 0.35); },
  win() { C.audio.chord([523, 659, 784, 1047], 0.09, 0.22, 'triangle', 0.16); },
};

/* ---------- drawing ---------- */
function drawStraw(s) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.stroke();
  ctx.save(); ctx.lineCap = 'butt'; ctx.setLineDash([9, 9]); ctx.strokeStyle = '#e5322a'; ctx.stroke(); ctx.restore();
}
function glassX(y, sd) { const k = (y - G.top) / G.gh; return W / 2 + sd * (G.gw / 2 + (G.bHalf - G.gw / 2) * k); }
function drawGlass(now) {
  const { top, bottom } = G, inBot = bottom - 12, inTop = top + 12;
  ctx.beginPath(); ctx.moveTo(glassX(top, -1), top); ctx.lineTo(glassX(top, 1), top); ctx.lineTo(glassX(bottom, 1), bottom); ctx.lineTo(glassX(bottom, -1), bottom); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();
  if (shownFill > 0.002) {
    const ly = inBot - shownFill * (inBot - inTop), wob = reduced() ? 0 : Math.sin(now / 180) * 1.5;
    ctx.beginPath(); ctx.moveTo(glassX(ly, -1) + 5, ly + wob); ctx.lineTo(glassX(ly, 1) - 5, ly - wob); ctx.lineTo(glassX(inBot, 1) - 5, inBot); ctx.lineTo(glassX(inBot, -1) + 5, inBot); ctx.closePath();
    const gr = ctx.createLinearGradient(0, ly, 0, inBot); gr.addColorStop(0, '#ffe25a'); gr.addColorStop(1, '#f4c018'); ctx.fillStyle = gr; ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(glassX(top, -1), top); ctx.lineTo(glassX(bottom, -1), bottom); ctx.lineTo(glassX(bottom, 1), bottom); ctx.lineTo(glassX(top, 1), top);
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(W / 2, top, G.gw / 2, 4, 0, 0, 7); ctx.lineWidth = 2.5; ctx.stroke();
}
function piecePath(p) { ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q.x * LR, q.y * LR) : ctx.moveTo(q.x * LR, q.y * LR))); ctx.closePath(); }
function drawPiece(p, ox, oy, rot, c, scale = 1) {
  ctx.save(); ctx.translate(cx + ox, cy + oy);
  if (scale !== 1) ctx.scale(scale, scale);
  if (rot) { ctx.translate(c.x * LR, c.y * LR); ctx.rotate(rot); ctx.translate(-c.x * LR, -c.y * LR); }
  piecePath(p); ctx.save(); ctx.clip(); ctx.drawImage(lemonTex.c, -lemonTex.s / 2, -lemonTex.s / 2, lemonTex.s, lemonTex.s); ctx.restore();
  piecePath(p); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 3 / scale; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
}
function drawFly(f, scale) {
  const s = FLY_R * LR * scale, x = cx + f.x * LR * scale, y = cy + f.y * LR * scale;
  ctx.save(); ctx.translate(x, y);
  if (f === deadFly) { ctx.fillStyle = 'rgba(60,140,60,.75)'; ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * 7, r = s * (0.7 + ((i * 37) % 5) / 7); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.scale(1.3, 0.45); }
  ctx.rotate(f.ang);
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = Math.max(1, s * 0.07); ctx.lineCap = 'round';
  for (const sy of [-1, 1]) for (const lx of [-0.15, 0.05, 0.25]) { ctx.beginPath(); ctx.moveTo(lx * s, 0); ctx.lineTo((lx - 0.08) * s, sy * 0.48 * s); ctx.stroke(); }
  const fl = f === deadFly || reduced() ? 1 : 0.75 + 0.25 * Math.abs(Math.sin(f.flap));
  for (const sy of [-1, 1]) { ctx.save(); ctx.translate(-0.15 * s, sy * 0.28 * s); ctx.rotate(sy * 0.5); ctx.scale(1, fl); ctx.beginPath(); ctx.ellipse(-0.25 * s, 0, 0.55 * s, 0.24 * s, 0, 0, 7); ctx.fillStyle = 'rgba(225,238,250,.72)'; ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.05); ctx.strokeStyle = 'rgba(27,29,30,.7)'; ctx.stroke(); ctx.restore(); }
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.beginPath(); ctx.ellipse(-0.3 * s, 0, 0.42 * s, 0.3 * s, 0, 0, 7); ctx.fillStyle = '#2f8c74'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.12 * s, 0, 0.27 * s, 0.26 * s, 0, 0, 7); ctx.fillStyle = '#4b5157'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0.42 * s, 0, 0.18 * s, 0, 7); ctx.fillStyle = '#2b2f33'; ctx.fill(); ctx.stroke();
  for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(0.47 * s, sy * 0.13 * s, 0.12 * s, 0, 7); ctx.fillStyle = '#d8322a'; ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke(); }
  ctx.restore();
}
function line(a, b, col, alpha) { ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 4.5; ctx.stroke(); ctx.restore(); }

function render(now, alpha, dt) {
  if (!W || !H || !lemonTex) return;
  for (let i = falling.length - 1; i >= 0; i--) {
    const p = falling[i]; p.t += dt; p.vy += 900 * dt; p.ox += p.vx * dt; p.oy += p.vy * dt; p.rot += p.vr * dt;
    if (p.t > 0.42) {
      const wx = cx + p.ox + p.c.x * LR, wy = cy + p.oy + p.c.y * LR, n = Math.max(4, Math.min(26, Math.round(p.vol * 70)));
      if (!reduced()) for (let k = 0; k < n; k++) drops.push({ x: wx + (Math.random() - 0.5) * LR * 0.4, y: wy + (Math.random() - 0.5) * LR * 0.25, vx: (Math.random() - 0.5) * 160 + p.vx * 0.2, vy: -60 - Math.random() * 120, r: 3.5 + Math.random() * 3.5, py: wy });
      falling.splice(i, 1);
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.py = d.y; d.vy += 1500 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
    if (d.x < d.r) { d.x = d.r; d.vx = Math.abs(d.vx) * 0.5; } if (d.x > W - d.r) { d.x = W - d.r; d.vx = -Math.abs(d.vx) * 0.5; }
    for (const s of G.straws) {
      const minx = Math.min(s.a.x, s.b.x), maxx = Math.max(s.a.x, s.b.x);
      if (d.x < minx || d.x > maxx) continue;
      const ly = s.a.y + (s.b.y - s.a.y) * (d.x - s.a.x) / (s.b.x - s.a.x);
      if (d.y + d.r >= ly && d.py + d.r <= ly + 10) { d.y = ly - d.r; let ux = s.b.x - s.a.x, uy = s.b.y - s.a.y; const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul; const sp = Math.max(40, d.vx * ux + d.vy * uy) * 0.96; d.vx = ux * sp; d.vy = uy * sp; }
    }
    if (d.y > G.top + 4 && d.x > G.mL - 5 && d.x < G.mR + 5) { drops.splice(i, 1); sfx.plop(); continue; }
    if (d.y > H + 20) drops.splice(i, 1);
  }
  const target = S ? Math.min(S.filled / CAPACITY, 1) : 0;
  shownFill += (target - shownFill) * Math.min(1, dt * 6);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  drawGlass(now); G.straws.forEach(drawStraw);
  let sc = 1; const pt = (now - popT) / 380;
  if (pt < 1 && !reduced()) { const p = Math.max(0, pt), c = 1.7; sc = 0.55 + 0.45 * (1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2)); }
  drawPiece(S ? S.poly : circlePoly(56), 0, 0, 0, { x: 0, y: 0 }, sc);
  for (const p of falling) drawPiece(p.poly, p.ox, p.oy, p.rot, p.c);
  if (S) for (const f of S.flies) drawFly(f, sc);
  for (const d of drops) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fillStyle = '#ffd21f'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(27,29,30,.6)'; ctx.stroke(); }
  outlined(ctx, Math.min(100, Math.floor(shownFill * 100 + 0.001)) + '%', W / 2, Math.min(G.top - 34, G.straws[0].a.y - 14), Math.round(Math.min(40, W * 0.09)));
  if (swipe) line(swipe.a, swipe.b, '#3fe04a', 1);
  if (S && S.mode === 'play' && document.activeElement === cv && !swipe) {
    const l = aimLine(); ctx.save(); ctx.setLineDash([10, 8]); line({ x: cx + l.a.x * LR, y: cy + l.a.y * LR }, { x: cx + l.b.x * LR, y: cy + l.b.y * LR }, '#FFD21F', 0.85); ctx.restore();
  }
  if (flash) { const k = 1 - (now - flash.t0) / 450; if (k > 0) line(flash.a, flash.b, flash.color, k); else flash = null; }
  if (msg) { const k = (now - msg.t0) / msg.dur; if (k < 1) { ctx.save(); ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1; outlined(ctx, msg.text, W / 2, cy + LR + 30, Math.round(Math.min(24, W * 0.06)), msg.color); ctx.restore(); } else msg = null; }
  if (S && S.mode === 'juiced') { const k = Math.min(1, (now - juicedAt) / 250); ctx.save(); ctx.translate(W / 2, cy); ctx.rotate(-0.04); ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k); outlined(ctx, t('kd_juiced'), 0, 0, Math.round(Math.min(46, W * 0.11)), '#ffd21f'); ctx.restore(); }
  if (S) {
    setLvl(C.ui.esc(t('kd_lemon', { n: S.level })));
    setCuts(C.ui.esc(t('kd_cuts', { n: Math.max(0, S.cutLimit - S.cuts) })));
    setPips(Array.from({ length: S.cutLimit }, (_, i) => `<i class="${i < S.cuts ? 'used' : ''}"></i>`).join(''));
  }
}
const loop = fixedLoop({ step, render, STEP: 1 / 60 });
loop.start();
