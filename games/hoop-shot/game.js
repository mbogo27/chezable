// Hoop Shot: tap when the power bar is right; higher hoops score more (spec §7.8).
// 400x700 world, constant 1/240 s physics step, seeded bar phase and wind per shot.
// Native "Niko!": call a hoop before the shot. Called hit doubles, called miss scores zero.
import M from './stage.json';
import { fitCanvas, fixedLoop, outlined, TAU, hud, onControl, reduced } from '../_lib/kit.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const T = M.tunables;
C.stage(M);

const GROUND = 600, BALL_R = 11, HALF = 24, THETA = T.theta * Math.PI / 180;
const LAUNCH = { x: 108, y: 452 };
const HOOPS = [
  { label: 'D', x: 200, y: 390, pts: 25, col: '#c9d0d5' },
  { label: 'C', x: 258, y: 345, pts: 50, col: '#ffcc33' },
  { label: 'B', x: 316, y: 300, pts: 100, col: '#5fd068' },
  { label: 'A', x: 338, y: 205, pts: 150, col: '#ff6fae' },
  { label: 'SSS', x: 360, y: 110, pts: 200, col: '#ff4a3d' },
];
function vReq(h) { const dx = h.x - LAUNCH.x, hh = LAUNCH.y - (h.y - 4), c = Math.cos(THETA); return Math.sqrt(T.gravity * dx * dx / (2 * c * c * (dx * Math.tan(THETA) - hh))); }
const VMIN = vReq(HOOPS[0]) * 0.85, VMAX = vReq(HOOPS[4]) * 1.08;

const view = fitCanvas(document.getElementById('cv'), 400, 700);
const ctx = view.ctx;
const play = document.getElementById('play');
const callsEl = document.getElementById('calls');
const setScore = hud(document.getElementById('score'));
const setSub = hud(document.getElementById('sub'));
const setBalls = hud(document.getElementById('balls'));

let S = null, run = null;
let fx = { pops: [], nets: {}, shootT: -9 };

function newState(r) {
  return { rng: r.rng, speed: r.speed, niko: r.variant === 'native', score: 0, balls: T.balls, shot: 0, phase: 0, power: 0,
    ball: null, mode: 'aim', log: [], swishes: 0, call: null, wind: 0, pendingShoot: false, endT: -1, over: false };
}
function nextShot() {
  S.mode = 'aim'; S.phase = S.rng() * 0.5; S.call = null;
  S.wind = (S.rng() * 2 - 1) * T.windMax;
  paintCalls();
}

/* ---------------- physics ---------------- */
function hitPoint(b, px, py, pr, rest) {
  const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), m = b.r + pr;
  if (d < m && d > 0.0001) {
    const nx = dx / d, ny = dy / d; b.x = px + nx * m; b.y = py + ny * m;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; b.vx *= 0.97; b.spin += (b.vx * ny - b.vy * nx) * 0.002; return Math.abs(vn); }
  }
  return 0;
}
function hitSeg(b, x1, y1, x2, y2, rest) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy; let u = ((b.x - x1) * dx + (b.y - y1) * dy) / L; u = Math.max(0, Math.min(1, u));
  return hitPoint(b, x1 + dx * u, y1 + dy * u, 2, rest);
}
function physics(b, h) {
  const py = b.y;
  b.vy += T.gravity * h; b.vx += S.wind * h; b.x += b.vx * h; b.y += b.vy * h; b.t += h;
  for (const hp of HOOPS) {
    let k = hitPoint(b, hp.x - HALF, hp.y, 3, 0.72) + hitPoint(b, hp.x + HALF, hp.y, 3, 0.72);
    k += hitSeg(b, hp.x + HALF + 4, hp.y - 26, hp.x + HALF + 4, hp.y + 4, 0.85);
    if (k > 20) { b.touched = true; if (k > 60) sfx.rim(); }
    if (!b.scored && py < hp.y && b.y >= hp.y && b.vy > 0 && b.x > hp.x - HALF + 3 && b.x < hp.x + HALF - 3) scored(hp, b);
  }
  hitSeg(b, 388, GROUND, 388, HOOPS[2].y + 40, 0.4);
  if (b.y + b.r > GROUND) { b.y = GROUND - b.r; if (b.vy > 60) sfx.bounce(Math.min(1, b.vy / 700)); b.vy = -b.vy * 0.55; b.vx *= 0.86; if (Math.abs(b.vy) < 40) b.vy = 0; }
  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; }
}
function scored(hp, b) {
  b.scored = true; b.hoop = hp.label;
  const swish = !b.touched;
  let pts = Math.round(hp.pts * (swish ? 1.5 : 1));
  let note = swish ? t('rk_swish') : '';
  if (S.call) {
    if (S.call === hp.label) { pts *= 2; note = t('rk_niko'); }
    else { pts = 0; note = t('rk_bust', { h: S.call }); }
  }
  S.score += pts;
  if (swish) S.swishes++;
  S.log.push({ label: hp.label, pts, swish, call: S.call });
  fx.nets[hp.label] = performance.now();
  fx.pops.push({ text: `+${pts}`, sub: note, x: hp.x, y: hp.y - 28, t0: performance.now(), col: hp.col });
  sfx.score(hp.pts); C.haptic(25);
  run.firstAtom();
  C.ui.announce(t('rk_shot', { n: S.shot, r: `${hp.label} +${pts}` }));
}

const STEP = 1 / 240;
function step(dt, tick) {
  const s = S;
  if (!s || s.over) return;
  if (s.mode === 'aim') {
    s.phase += dt * (T.barSpeed + s.shot * T.barSpeedStep) * s.speed;
    const f = s.phase % 1; s.power = f < 0.5 ? f * 2 : 2 - f * 2;
    if (s.pendingShoot) { s.pendingShoot = false; shoot(tick); }
  } else s.pendingShoot = false;
  if (s.mode === 'flight' && s.ball) {
    const b = s.ball;
    physics(b, dt);
    b.spin += b.vx * dt * 0.02;
    const slow = Math.hypot(b.vx, b.vy) < 30 && b.y >= GROUND - b.r - 1;
    b.rest = slow ? b.rest + dt : 0;
    if (b.x - b.r > 440 || b.rest > 0.35 || b.t > 7) finishBall();
  }
  if (s.endT >= 0) { s.endT -= dt; if (s.endT < 0) end(); }
}
function shoot(tick) {
  const s = S;
  C.audio.ensure();
  const v = VMIN + s.power * (VMAX - VMIN);
  s.ball = { x: LAUNCH.x, y: LAUNCH.y, vx: v * Math.cos(THETA), vy: -v * Math.sin(THETA), r: BALL_R, spin: 0, touched: false, scored: false, t: 0, rest: 0 };
  s.balls--; s.shot++; s.mode = 'flight';
  fx.shootT = performance.now();
  run.input(`S${s.call || ''}`, tick);
  sfx.shoot();
  callsEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
}
function finishBall() {
  const s = S;
  if (s.ball && !s.ball.scored) {
    s.log.push({ label: 'Miss', pts: 0, call: s.call });
    C.ui.announce(t('rk_shot', { n: s.shot, r: t('rk_miss') }));
  }
  s.ball = null;
  if (s.balls <= 0) { s.mode = 'end'; s.endT = 0.5; }
  else nextShot();
}
async function end() {
  const s = S;
  s.over = true; loop.halt();
  const rows = s.log.map((l, i) => `${i + 1}. ${l.label === 'Miss' ? t('rk_miss') : `${l.label} +${l.pts}${l.swish ? ` (${t('rk_swish')})` : ''}`}${l.call ? ` · ${t('rk_called', { h: l.call })}` : ''}`);
  await run.finish({
    score: s.score, tiebreak: -s.swishes,
    detail: { shots: s.log, swishes: s.swishes },
    sub: rows.join('  '),
    share: { line: t('rk_line', { n: s.score }) },
  });
}

/* ---------------- Niko! call chips ---------------- */
function paintCalls() {
  if (!S || !S.niko) { callsEl.hidden = true; return; }
  callsEl.hidden = false;
  callsEl.innerHTML = [`<button type="button" data-call="" aria-pressed="${S.call === null}">${C.ui.esc(t('rk_nocall'))}</button>`]
    .concat(HOOPS.map((h, i) => `<button type="button" data-call="${h.label}" aria-pressed="${S.call === h.label}" aria-label="${C.ui.esc(t('rk_call'))} ${h.label} (${i + 1})">${h.label}<span class="p">${h.pts}</span></button>`)).join('');
}
callsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-call]');
  if (!b || !S || S.mode !== 'aim') return;
  S.call = b.dataset.call || null;
  paintCalls();
  callsEl.querySelector(`[data-call="${S.call || ''}"]`)?.focus();
});

/* ---------------- lifecycle + input ---------------- */
C.onPlay(async (ctx) => {
  run = await C.run.start(ctx);
  S = newState(run);
  fx = { pops: [], nets: {}, shootT: -9 };
  loop.resetTick();
  nextShot();
  loop.play();
});
C.onPause(() => loop.halt());
C.onResume(() => { if (S && !S.over) loop.play(); });
C.onQuit(() => { S = null; callsEl.hidden = true; loop.halt(); });

play.addEventListener('pointerdown', (e) => {
  if (onControl(e) || !S || S.over) return;
  e.preventDefault();
  if (S.mode === 'aim') S.pendingShoot = true;
});
document.addEventListener('keydown', (e) => {
  if (!S || S.over || C.isPaused() || document.querySelector('.sheet-wrap,.overlay.show')) return;
  if (e.code === 'Space' || (e.code === 'Enter' && !e.target.closest('button'))) { e.preventDefault(); if (!e.repeat && S.mode === 'aim') S.pendingShoot = true; }
  if (S.niko && S.mode === 'aim' && /^Digit[0-5]$/.test(e.code)) {
    const n = +e.code.slice(5);
    S.call = n === 0 ? null : HOOPS[n - 1].label;
    paintCalls();
    C.ui.announce(S.call ? t('rk_called', { h: S.call }) : t('rk_nocall'));
  }
});

/* ---------------- sound ---------------- */
let lastRim = 0;
const sfx = {
  shoot() { C.audio.tone(300, 520, 0.12, 'triangle', 0.1); },
  rim() { const n = performance.now(); if (n - lastRim < 90) return; lastRim = n; C.audio.tone(900, 700, 0.15, 'square', 0.05); },
  bounce(v) { C.audio.tone(140, 80, 0.1, 'sine', 0.25 * v + 0.05); },
  score(p) { const base = p >= 150 ? 660 : p >= 100 ? 587 : 523; C.audio.chord([base, base * 1.26, base * 1.5], 0.07, 0.18, 'triangle', 0.14); },
};

/* ---------------- drawing ---------------- */
function drawScene() {
  const sky = ctx.createLinearGradient(0, -400, 0, GROUND); sky.addColorStop(0, '#8fd3f0'); sky.addColorStop(1, '#d9f1fb');
  ctx.fillStyle = sky; ctx.fillRect(-600, -600, 1600, GROUND + 600);
  ctx.fillStyle = '#9fd38a'; ctx.beginPath(); ctx.moveTo(-600, GROUND);
  for (let x = -600; x <= 1000; x += 20) ctx.lineTo(x, GROUND - 40 - 28 * Math.sin(x / 70));
  ctx.lineTo(1000, GROUND); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c98f55'; ctx.fillRect(-600, GROUND, 1600, 700);
  ctx.fillStyle = '#3e9a3a'; ctx.fillRect(-600, GROUND, 1600, 16);
  for (let x = -600; x < 1000; x += 26) { ctx.beginPath(); ctx.arc(x + 13, GROUND + 16, 13, 0, Math.PI); ctx.fill(); }
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-600, GROUND); ctx.lineTo(1000, GROUND); ctx.stroke();
}
function drawStructure() {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(388, GROUND); ctx.lineTo(388, HOOPS[2].y + 40); ctx.stroke();
  ctx.strokeStyle = '#aab3b8'; ctx.lineWidth = 7; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(HOOPS[0].x + HALF + 4, HOOPS[0].y - 20);
  for (let i = 1; i < HOOPS.length; i++) { const a = HOOPS[i - 1], b = HOOPS[i]; ctx.lineTo(a.x + HALF + 4, b.y + 16); ctx.lineTo(b.x + HALF + 4, b.y + 16); }
  ctx.lineTo(HOOPS[4].x + HALF + 4, HOOPS[4].y - 28);
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = '#f26b1d'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(388, HOOPS[2].y + 40); ctx.lineTo(HOOPS[1].x + HALF + 4, HOOPS[2].y + 16); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = '#aab3b8'; ctx.lineWidth = 5; ctx.stroke();
  for (const h of HOOPS) {
    ctx.fillStyle = S && S.call === h.label ? '#ffd21f' : '#ffffff'; ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(h.x + HALF + 1, h.y - 28, 7, 34); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(h.x, h.y, HALF, 5, 0, Math.PI, TAU); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#e8601c'; ctx.lineWidth = 3.5; ctx.stroke();
  }
}
function drawNet(h, now) {
  const k = fx.nets[h.label] ? (now - fx.nets[h.label]) / 500 : 2, stretch = k < 1 && !reduced() ? Math.sin(k * Math.PI) * 10 : 0;
  const top = h.y, bot = h.y + 38 + stretch, bw = HALF * 0.62, n = 6;
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6;
  for (let i = 0; i <= n; i++) { const xt = h.x - HALF + i * (2 * HALF / n), xb = h.x - bw + i * (2 * bw / n); ctx.beginPath(); ctx.moveTo(xt, top); ctx.lineTo(xb, bot); ctx.stroke(); }
  for (let i = 0; i < n; i++) {
    const xt = h.x - HALF + i * (2 * HALF / n), xb = h.x - bw + (i + 1) * (2 * bw / n), xt2 = h.x - HALF + (i + 1) * (2 * HALF / n), xb2 = h.x - bw + i * (2 * bw / n);
    ctx.beginPath(); ctx.moveTo(xt, top); ctx.lineTo(xb, bot); ctx.moveTo(xt2, top); ctx.lineTo(xb2, bot); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
  }
  outlined(ctx, h.label, h.x, h.y + 20, h.label.length > 1 ? 15 : 18, h.col, 'center');
  if (S && S.call === h.label) outlined(ctx, '★', h.x - HALF - 12, h.y - 12, 18, '#ffd21f');
}
function drawFrontRims() {
  for (const h of HOOPS) { ctx.beginPath(); ctx.ellipse(h.x, h.y, HALF, 5, 0, 0, Math.PI); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = '#ff7a2e'; ctx.lineWidth = 4; ctx.stroke(); }
}
function drawBall(x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, '#ffb067'); g.addColorStop(1, '#e2661b');
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#1b1d1e'; ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
  ctx.beginPath(); ctx.arc(-r * 1.15, 0, r * 0.85, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.15, 0, r * 0.85, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
  ctx.restore();
}
function drawPlayer(now) {
  const k = Math.max(0, 1 - (now - fx.shootT) / 350), jump = k > 0 && !reduced() ? Math.sin(k * Math.PI) * 10 : 0;
  ctx.save(); ctx.translate(0, -jump); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ink = '#1b1d1e', skin = '#8a5a3b';
  ctx.strokeStyle = ink; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(72, 548); ctx.lineTo(66, 596); ctx.moveTo(84, 548); ctx.lineTo(92, 596); ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = 7; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
  for (const [x, d] of [[66, -1], [92, 1]]) { ctx.beginPath(); ctx.ellipse(x + d * 4, 598, 10, 5, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#16303f'; ctx.beginPath(); ctx.moveTo(62, 522); ctx.lineTo(94, 522); ctx.lineTo(97, 556); ctx.lineTo(80, 556); ctx.lineTo(78, 544); ctx.lineTo(76, 556); ctx.lineTo(59, 556); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f26b1d'; ctx.beginPath(); ctx.moveTo(60, 490); ctx.quadraticCurveTo(78, 482, 96, 490); ctx.lineTo(95, 526); ctx.lineTo(61, 526); ctx.closePath(); ctx.fill(); ctx.stroke();
  outlined(ctx, '22', 78, 508, 16);
  const hx = LAUNCH.x - 4 + k * 6, hy = LAUNCH.y + 8 - k * 6;
  ctx.strokeStyle = ink; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(64, 494); ctx.quadraticCurveTo(70, 470, hx - 10, hy); ctx.moveTo(92, 494); ctx.quadraticCurveTo(102, 476, hx + 2, hy + 4); ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = 6; ctx.stroke();
  ctx.beginPath(); ctx.arc(80, 470, 15, 0, TAU); ctx.fillStyle = skin; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ink; ctx.stroke();
  ctx.beginPath(); ctx.arc(80, 466, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(87, 470, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(86, 477, 4, 0.2, Math.PI - 0.6); ctx.lineWidth = 1.8; ctx.stroke();
  ctx.restore();
}
function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function drawPowerBar() {
  const x = 24, y0 = 440, h = 150, w = 14;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 3;
  rr(x, y0, w, h, w / 2); ctx.fill();
  if (S && S.mode === 'aim') {
    const fh = S.power * h, g = ctx.createLinearGradient(0, y0 + h, 0, y0); g.addColorStop(0, '#ffd21f'); g.addColorStop(0.6, '#f2a12a'); g.addColorStop(1, '#e5322a');
    ctx.save(); rr(x, y0, w, h, w / 2); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(x, y0 + h - fh, w, fh); ctx.restore();
  }
  rr(x, y0, w, h, w / 2); ctx.stroke();
}
function drawWind() {
  if (!S || !T.windMax) return;
  const w = S.wind, n = Math.round(Math.abs(w));
  const arrow = n < 2 ? '·' : w < 0 ? '←' : '→';
  outlined(ctx, `${t('rk_wind')} ${arrow} ${n}`, 200, 40, 18, '#fff');
}

function render(now) {
  view.begin();
  drawScene(); drawStructure();
  for (const h of HOOPS) drawNet(h, now);
  drawPlayer(now);
  if (!S || S.mode === 'aim') drawBall(LAUNCH.x - 2, LAUNCH.y - 6, BALL_R, 0);
  if (S && S.ball) drawBall(S.ball.x, S.ball.y, S.ball.r, S.ball.spin);
  drawFrontRims(); drawPowerBar(); drawWind();
  fx.pops = fx.pops.filter((p) => now - p.t0 < 1100);
  for (const p of fx.pops) {
    const k = (now - p.t0) / 1100;
    ctx.save(); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    outlined(ctx, p.text, p.x - 30, p.y - k * 30, 24, p.col);
    if (p.sub) outlined(ctx, p.sub, p.x - 30, p.y - k * 30 + 22, 15, '#fff');
    ctx.restore();
  }
  if (S && S.mode === 'aim' && S.shot === 0) outlined(ctx, t('rk_tap'), 170, 520, 20);
  if (S) {
    setScore(C.catalog.formatScore(M.id, 'solo', S.score));
    setBalls(`🏀 ×${S.balls}`);
    const b = (C.store.get('best:' + M.id, {})[`solo:${run.variant}`] || {}).score;
    setSub(run.player ? C.ui.esc(run.player.name) : b != null ? C.ui.esc(t('result_best', { best: C.catalog.formatScore(M.id, 'solo', b) })) : '');
  }
}

const loop = fixedLoop({ step, render, STEP });
loop.start();
