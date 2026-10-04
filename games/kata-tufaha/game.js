// Kata Tufaha: throw knives through the gap in the spinning spiked ring (spec §7.7).
// Logical 400x700 world, fixed 1/120 s steps, all gameplay randomness from the run seed.
// Native "Kati": pass the phone, one player throws while the other spins the ring to block.
import M from './stage.json';
import { fitCanvas, fixedLoop, outlined, TAU, angDiff, reduced, hud, onControl } from '../_lib/kit.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const T = M.tunables;
C.stage(M);

const LW = 400, LH = 700, CX = 200, CY = 215, R = 118, TH = 24, AR = 44, REST_Y = 585;
const play = document.getElementById('play');
const view = fitCanvas(document.getElementById('cv'), LW, LH);
const ctx = view.ctx;
const setScore = hud(document.getElementById('score'));
const setSub = hud(document.getElementById('sub'));
const setKnives = hud(document.getElementById('knives'));

let S = null;       // simulation state
let run = null;
let fx = { debris: [], halves: [], sparks: [], flashT: -9, shakeT: -9 }; // cosmetic only

function newState(r, kati) {
  return {
    rng: r.rng, speed: r.speed, kati, time: 0, knives: T.knives, cuts: 0, throws: 0,
    rot: r.rng() * TAU, dir: r.rng() < 0.5 ? -1 : 1, gapHalf: T.gapStart, apple: r.rng() < 0.5 ? 'green' : 'red',
    ringAlive: true, spawnAge: 0, knife: { state: 'rest', y: REST_Y, x: CX, timer: 0 },
    pendingThrow: false, ending: -1, over: false, drag: 0, keySpin: 0,
  };
}

function newRing() {
  S.ringAlive = true; S.spawnAge = 0;
  S.rot = S.rng() * TAU; S.dir = S.rng() < 0.5 ? -1 : 1;
  S.gapHalf = S.kati ? T.katiGap : Math.max(T.gapMin, T.gapStart - S.cuts * T.gapPerCut);
  S.apple = S.rng() < 0.5 ? 'green' : 'red';
}

function omega() {
  const used = T.knives - S.knives;
  let w = T.omegaBase + used * T.omegaPerKnife + S.cuts * T.omegaPerCut;
  if (S.cuts >= T.wobbleFrom) w *= 1 + 0.35 * Math.sin(S.time * 1.7);
  return w * S.dir * S.speed;
}

/* ---------------- simulation (fixed step) ---------------- */
function step(dt, tick) {
  const s = S;
  if (!s || s.over) return;
  s.time += dt;
  if (s.pendingThrow) { s.pendingThrow = false; tryThrow(tick); }
  if (s.ringAlive) {
    s.spawnAge += dt;
    if (s.kati) {
      // the ring player spins it: drag (as a dial) or arrow keys, capped so every knife stays fair
      const cap = T.katiMaxOmega * s.speed * dt;
      const fromDrag = Math.max(-cap, Math.min(cap, s.drag));
      s.drag -= fromDrag;
      const d = Math.max(-cap, Math.min(cap, fromDrag + s.keySpin * cap));
      s.rot += d + T.katiDrift * s.dir * s.speed * dt;
    } else {
      s.rot += omega() * dt;
      if (s.cuts >= T.reverseFrom && s.rng() < dt * T.reverseRate) s.dir *= -1;
    }
  }
  const k = s.knife;
  if (k.state === 'fly') {
    const steps = 6;
    for (let i = 0; i < steps && k.state === 'fly'; i++) {
      k.y -= T.throwSpeed * dt / steps;
      const outer = CY + R + TH / 2, inner = CY + R - TH / 2;
      if (s.ringAlive && k.y <= outer && k.y >= inner - 2) {
        const margin = (5 + TH / 2) / R;
        if (angDiff(Math.PI / 2, s.rot) > s.gapHalf - margin) { hitRing(); break; }
      }
      if (k.y <= CY + AR * 0.55) { k.y = CY + AR * 0.55; slice(); }
    }
  } else if (k.state === 'bounce') {
    k.vy += 1800 * dt; k.y += k.vy * dt; k.x += k.vx * dt; k.ang += k.spin * dt;
    if (k.y > LH + 120) afterKnife();
  } else if (k.state === 'stuck') {
    k.timer += dt;
    if (k.timer >= 0.65) {
      s.knife = { state: 'rest', y: REST_Y, x: CX, timer: 0 };
      if (s.knives <= 0 || roundOver()) s.ending = 0.3; else newRing();
    }
  }
  if (s.ending >= 0) { s.ending -= dt; if (s.ending < 0) endRound(); }
}

function tryThrow(tick) {
  const s = S;
  if (s.knife.state !== 'rest' || !s.ringAlive || s.knives <= 0 || s.spawnAge < 0.32 || s.ending >= 0) return;
  C.audio.ensure();
  s.knives--; s.throws++;
  s.knife = { state: 'fly', y: REST_Y, x: CX, timer: 0 };
  run && run.input('T', tick);
  C.audio.noise(0.12, 2500, 'highpass', 0.25);
}

function hitRing() {
  const k = S.knife;
  k.state = 'bounce';
  k.vx = (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 160); // cosmetic: only x and spin
  k.vy = 520; k.spin = (Math.random() < 0.5 ? -1 : 1) * 14; k.ang = 0;
  C.audio.tone(1400, 900, 0.25, 'square', 0.08); C.audio.tone(2100, 1500, 0.3, 'triangle', 0.08);
  C.haptic(40);
  fx.shakeT = performance.now();
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 160 + Math.random() * 260;
    fx.sparks.push({ x: k.x, y: k.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.3 });
  }
  C.ui.announce(t('kt_blocked', { n: S.knives }));
}

function slice() {
  const s = S;
  s.knife.state = 'stuck'; s.knife.timer = 0;
  s.cuts++; s.ringAlive = false;
  if (s.kati) s.round.cuts++;
  run && run.firstAtom();
  fx.flashT = performance.now();
  C.audio.noise(0.2, 1800, 'bandpass', 0.5); C.audio.tone(500, 160, 0.2, 'sine', 0.25); C.audio.tone(300, 80, 0.35, 'sawtooth', 0.05, 0.05);
  C.haptic(25);
  const n = 14, span = (TAU - 2 * s.gapHalf) / n;
  for (let i = 0; i < n; i++) {
    const a0 = s.rot + s.gapHalf + i * span, mid = a0 + span / 2, v = 220 + Math.random() * 240;
    fx.debris.push({ a0: a0 - s.rot, span, x: CX, y: CY, rot0: s.rot, vx: Math.cos(mid) * v, vy: Math.sin(mid) * v - 120, spin: (Math.random() - 0.5) * 8, r: 0, life: 1.2 });
  }
  fx.halves.push({ side: -1, x: CX, y: CY, vx: -170, vy: -260, rot: 0, spin: -4, col: s.apple, life: 1.4 }, { side: 1, x: CX, y: CY, vx: 170, vy: -260, rot: 0, spin: 4, col: s.apple, life: 1.4 });
  C.ui.announce(t('kt_sliced', { n: s.kati ? s.round.cuts : s.cuts }));
}

function afterKnife() {
  S.knife = { state: 'rest', y: REST_Y, x: CX, timer: 0 };
  if (S.knives <= 0) S.ending = 0.6;
}
function roundOver() { return S.knives <= 0; }

/* ---------------- run lifecycle ---------------- */
async function endRound() {
  const s = S;
  if (s.kati) {
    s.results.push({ name: s.round.thrower, score: s.round.cuts });
    if (s.results.length < 2) return startKatiRound(1);
  }
  s.over = true;
  loop.halt();
  const r = run;
  if (s.kati) {
    const best = Math.max(...s.results.map((x) => x.score));
    return r.finish({ score: best, detail: { players: s.results } });
  }
  const verdict = s.cuts === T.knives ? t('kt_v_perfect') : s.cuts >= 7 ? t('kt_v_sharp') : s.cuts >= 4 ? t('kt_v_ok') : t('kt_v_low');
  await r.finish({
    score: s.cuts, tiebreak: Math.round(s.time * 100) / 100,
    detail: { cuts: s.cuts, throws: s.throws, secs: Math.round(s.time * 10) / 10 },
    sub: verdict, share: { line: t('kt_line', { n: s.cuts }) },
  });
}

let katiPlayers = null;
function startKatiRound(i) {
  const [a, b] = katiPlayers;
  const thrower = i === 0 ? a : b, ringer = i === 0 ? b : a;
  const results = S && S.results ? S.results : [];
  S = newState(run, true);
  S.results = results;
  S.round = { i, thrower, ringer, cuts: 0 };
  S.gapHalf = T.katiGap;
  loop.halt();
  const o = C.ui.h(`<div class="overlay show" role="dialog" aria-modal="true"><div class="card" style="text-align:center">
      <p class="muted">${C.ui.esc(t('kt_round', { n: i + 1 }))}</p>
      <h2 style="font-size:28px">${C.ui.esc(t('kt_thrower', { name: thrower }))}</h2>
      <p style="font-weight:700">${C.ui.esc(t('kt_ringer', { name: ringer }))}</p>
      <p class="muted">${C.ui.esc(t('kt_kati_help'))}</p>
      <button class="btn wide">${C.ui.esc(t('im_ready'))}</button></div></div>`);
  document.body.appendChild(o);
  const btn = o.querySelector('button');
  btn.focus({ preventScroll: true });
  btn.onclick = () => { C.audio.ensure(); o.remove(); loop.play(); };
}

C.onPlay(async (ctx) => {
  run = await C.run.start(ctx);
  fx = { debris: [], halves: [], sparks: [], flashT: -9, shakeT: -9 };
  loop.resetTick();
  const kati = run.variant === 'native' && run.mode === 'pass';
  play.classList.toggle('kati', kati);
  if (kati) {
    katiPlayers = run.players || [t('player_n', { n: 1 }), t('player_n', { n: 2 })];
    S = null;
    startKatiRound(0);
  } else {
    S = newState(run, false);
    loop.play();
  }
});
C.onPause(() => loop.halt());
C.onResume(() => { if (S && !S.over && !document.querySelector('.overlay.show')) loop.play(); });
C.onQuit(() => { S = null; loop.halt(); });

/* ---------------- input ---------------- */
let dialAng = null;
const pointerAngle = (p) => Math.atan2(p.y - CY, p.x - CX);
play.addEventListener('pointerdown', (e) => {
  if (onControl(e) || !S || S.over) return;
  e.preventDefault();
  C.audio.ensure();
  const p = view.toLogical(e.clientX, e.clientY);
  if (S.kati && p.y < LH * 0.5) {
    dialAng = { id: e.pointerId, a: pointerAngle(p) };
    try { play.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }
  S.pendingThrow = true;
});
play.addEventListener('pointermove', (e) => {
  if (!dialAng || e.pointerId !== dialAng.id || !S) return;
  const a = pointerAngle(view.toLogical(e.clientX, e.clientY));
  let d = a - dialAng.a;
  if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  S.drag += d; dialAng.a = a;
});
const endDial = (e) => { if (dialAng && e.pointerId === dialAng.id) dialAng = null; };
play.addEventListener('pointerup', endDial);
play.addEventListener('pointercancel', endDial);
document.addEventListener('keydown', (e) => {
  if (!S || S.over || C.isPaused() || document.querySelector('.sheet-wrap,.overlay.show')) return;
  if (['Space', 'ArrowUp', 'Enter'].includes(e.code)) { e.preventDefault(); if (!e.repeat) S.pendingThrow = true; }
  if (S.kati && (e.code === 'ArrowLeft' || e.code === 'KeyA')) { e.preventDefault(); S.keySpin = -1; }
  if (S.kati && (e.code === 'ArrowRight' || e.code === 'KeyD')) { e.preventDefault(); S.keySpin = 1; }
});
document.addEventListener('keyup', (e) => {
  if (S && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) S.keySpin = 0;
});

/* ---------------- drawing ---------------- */
function drawRingBody(a0, a1) {
  const step = 0.42;
  for (let a = a0 + 0.16; a < a1 - 0.08; a += step) {
    const b = R + TH / 2 - 3, tip = R + TH / 2 + 24, w = 0.085;
    ctx.beginPath(); ctx.moveTo(Math.cos(a - w) * b, Math.sin(a - w) * b); ctx.lineTo(Math.cos(a) * tip, Math.sin(a) * tip); ctx.lineTo(Math.cos(a + w) * b, Math.sin(a + w) * b); ctx.closePath();
    ctx.fillStyle = '#dfe4e8'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#1b1d1e'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, R, a0, a1); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = TH + 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R, a0, a1); ctx.strokeStyle = '#a9b1b8'; ctx.lineWidth = TH; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R - TH * 0.12, a0, a1); ctx.strokeStyle = '#cfd5da'; ctx.lineWidth = TH * 0.55; ctx.stroke();
  for (let a = a0 + 0.2; a < a1 - 0.05; a += step) {
    ctx.beginPath(); ctx.arc(Math.cos(a) * R, Math.sin(a) * R, 4, 0, TAU); ctx.fillStyle = '#eef1f3'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = '#1b1d1e'; ctx.stroke();
  }
}
function appleShape(r) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.62);
  ctx.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.12, -r * 0.55, r * 0.98, r * 0.1);
  ctx.bezierCurveTo(r * 0.86, r * 0.8, r * 0.38, r * 1.05, 0, r * 0.88);
  ctx.bezierCurveTo(-r * 0.38, r * 1.05, -r * 0.86, r * 0.8, -r * 0.98, r * 0.1);
  ctx.bezierCurveTo(-r * 1.12, -r * 0.55, -r * 0.55, -r * 1.05, 0, -r * 0.62);
  ctx.closePath();
}
function drawApple(x, y, r, col, half) {
  ctx.save(); ctx.translate(x, y);
  if (half) { ctx.beginPath(); ctx.rect(half < 0 ? -r * 1.4 : 0, -r * 1.6, r * 1.4, r * 3); ctx.clip(); }
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.3, r * 0.1, 0, 0, r * 1.05);
  if (col === 'green') { g.addColorStop(0, '#c9f27a'); g.addColorStop(0.55, '#78c832'); g.addColorStop(1, '#3f8f1c'); }
  else { g.addColorStop(0, '#ff9a8a'); g.addColorStop(0.55, '#e5322a'); g.addColorStop(1, '#a3171a'); }
  appleShape(r); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1b1d1e'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-r * 0.42, -r * 0.22, r * 0.16, r * 0.28, 0.35, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  if (half) {
    ctx.beginPath(); ctx.ellipse(0, r * 0.12, r * 0.16, r * 0.78, 0, 0, TAU); ctx.fillStyle = '#fdf6d8'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1b1d1e'; ctx.stroke();
    ctx.fillStyle = '#5a3a1e'; for (const sy of [-0.05, 0.25]) { ctx.beginPath(); ctx.ellipse(0, r * sy, r * 0.05, r * 0.09, 0, 0, TAU); ctx.fill(); }
  }
  ctx.lineCap = 'round'; ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.quadraticCurveTo(r * 0.02, -r * 0.9, -r * 0.1, -r * 1.05); ctx.stroke();
  ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * 0.02, -r * 0.85); ctx.quadraticCurveTo(r * 0.4, -r * 1.2, r * 0.75, -r * 0.95); ctx.quadraticCurveTo(r * 0.4, -r * 0.62, r * 0.02, -r * 0.85);
  ctx.fillStyle = '#4fae3a'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#1b1d1e'; ctx.stroke();
  ctx.restore();
}
function drawKnife(x, y, ang, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(scale, scale);
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1d1e';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(9, 18, 10, 42, 4, 58); ctx.lineTo(-4, 58); ctx.bezierCurveTo(-10, 42, -9, 18, 0, 0); ctx.closePath();
  const g = ctx.createLinearGradient(-9, 0, 9, 0); g.addColorStop(0, '#e9edf0'); g.addColorStop(0.5, '#b7c0c7'); g.addColorStop(1, '#8d979e');
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 54); ctx.strokeStyle = 'rgba(27,29,30,.3)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.rect(-4.5, 58, 9, 34); ctx.fillStyle = '#b98a52'; ctx.fill(); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.6; for (let yy = 62; yy < 92; yy += 5) { ctx.beginPath(); ctx.moveTo(-4.5, yy); ctx.lineTo(4.5, yy + 3); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 100, 7.5, 0, TAU); ctx.lineWidth = 5.5; ctx.strokeStyle = '#1b1d1e'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#c7cfd5'; ctx.stroke();
  ctx.restore();
}

function render(now, alpha, dt) {
  // cosmetic particles advance with real frame time
  for (const d of fx.debris) { d.vy += 1500 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.spin * dt; d.life -= dt; }
  fx.debris = fx.debris.filter((d) => d.life > 0 && d.y < LH + 200);
  for (const h of fx.halves) { h.vy += 1500 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.spin * dt; h.life -= dt; }
  fx.halves = fx.halves.filter((h) => h.life > 0);
  for (const p of fx.sparks) { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  fx.sparks = fx.sparks.filter((p) => p.life > 0);

  view.begin();
  const s = S || { rot: now / 1600, ringAlive: true, gapHalf: T.gapStart, apple: 'green', spawnAge: 1, knife: { state: 'rest', y: REST_Y, x: CX }, knives: T.knives, cuts: 0 };
  ctx.save();
  if (!reduced() && now - fx.shakeT < 200) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
  if (s.ringAlive) {
    drawApple(CX, CY, AR, s.apple, 0);
    const k = Math.min(1, s.spawnAge / 0.3), sc = reduced() ? 1 : 0.6 + 0.4 * (1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2));
    ctx.save(); ctx.translate(CX, CY); ctx.scale(sc, sc); ctx.rotate(s.rot); drawRingBody(s.gapHalf, TAU - s.gapHalf); ctx.restore();
  }
  for (const d of fx.debris) { ctx.save(); ctx.globalAlpha = Math.min(1, d.life * 1.5); ctx.translate(d.x, d.y); ctx.rotate(d.rot0 + d.r); drawRingBody(d.a0, d.a0 + d.span); ctx.restore(); }
  for (const h of fx.halves) { ctx.save(); ctx.globalAlpha = Math.min(1, h.life * 1.5); ctx.translate(h.x, h.y); ctx.rotate(h.rot); drawApple(0, 0, AR, h.col, h.side); ctx.restore(); }
  if (now - fx.flashT < 160) { ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - (now - fx.flashT) / 160)})`; ctx.beginPath(); ctx.arc(CX, CY, R * 1.3, 0, TAU); ctx.fill(); }
  for (const p of fx.sparks) { ctx.fillStyle = `rgba(255,210,31,${Math.min(1, p.life * 2.5)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill(); }
  const k = s.knife;
  if (k.state === 'rest' && s.knives > 0 && s.ringAlive) drawKnife(CX, REST_Y + (reduced() ? 0 : Math.sin(now / 300) * 3), 0);
  else if (k.state === 'fly') drawKnife(CX, k.y, 0);
  else if (k.state === 'stuck') { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (k.timer / 0.65) * 1.4); drawKnife(CX, k.y, 0); ctx.restore(); }
  else if (k.state === 'bounce') drawKnife(k.x, k.y, k.ang);
  ctx.restore();
  if (S && !S.over && S.throws === 0 && !S.kati) outlined(ctx, t('kt_tap'), CX, REST_Y - 58, 22);
  if (S && S.kati) {
    outlined(ctx, S.round.ringer, CX, 24, 18, '#FFD21F');
    outlined(ctx, S.round.thrower, CX, LH - 22, 18, '#FFD21F');
  }
  // HUD
  if (S) {
    const cuts = S.kati ? S.round.cuts : S.cuts;
    setScore(C.catalog.formatScore(M.id, 'solo', cuts));
    setKnives(`<span class="k" aria-hidden="true">🔪</span> ×${S.knives}`);
    if (S.kati) setSub(C.ui.esc(t('kt_thrower', { name: S.round.thrower })));
    else {
      const b = (C.store.get('best:' + M.id, {})[`solo:${run ? run.variant : 'classic'}`] || {}).score;
      setSub(b != null ? C.ui.esc(t('result_best', { best: C.catalog.formatScore(M.id, 'solo', b) })) : '');
    }
  }
}

const loop = fixedLoop({ step, render, STEP: 1 / 120 });
loop.start();
