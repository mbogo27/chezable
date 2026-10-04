// Cut It in Half (Cut it in half): stop the sliding saw at exactly 50 cm, three cuts (spec §7.1).
// The saw position is simulated at fixed 1/120 s steps from the run seed; the DOM only renders it.
// Native "Bila Kuhesabu": no guide line and no numbers until all three cuts are done.
import M from './stage.json';
import { fixedLoop, reduced } from '../_lib/kit.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const T = M.tunables;
const ROUNDS = T.rounds;
C.stage(M);

const $ = (s) => document.querySelector(s);
const board = $('#board'), saw = $('#saw'), guide = $('#guide'), plank = $('#plank');
const pL = $('#pieceL'), pR = $('#pieceR'), labL = $('#labL'), labR = $('#labR'), plankMark = $('#plankMark'), panel = $('#panel');
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);

/* ---------- saw drawing ---------- */
(function drawSaw() {
  let teeth = '';
  for (let y = 74; y < 182; y += 6) teeth += `M31 ${y}L26 ${y + 3}L31 ${y + 6}Z M49 ${y}L54 ${y + 3}L49 ${y + 6}Z `;
  saw.innerHTML = `<svg viewBox="0 0 80 196" width="80" height="196" aria-hidden="true">
    <path d="M40 84H11a6 6 0 0 1-6-6V68" fill="none" stroke="#1b1d1e" stroke-width="10" stroke-linecap="round"/>
    <path d="M40 84H11a6 6 0 0 1-6-6V68" fill="none" stroke="#aab3b7" stroke-width="5" stroke-linecap="round"/>
    <path d="${teeth}" fill="#8e979c" stroke="#1b1d1e" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="31" y="68" width="18" height="122" rx="9" fill="#d5dadd" stroke="#1b1d1e" stroke-width="3"/>
    <line x1="40" y1="80" x2="40" y2="178" stroke="#a0a9ad" stroke-width="2" stroke-linecap="round"/>
    <path d="M27 24V11a7 7 0 0 1 7-7h12a7 7 0 0 1 7 7v13" fill="none" stroke="#1b1d1e" stroke-width="7" stroke-linecap="round"/>
    <rect x="15" y="18" width="50" height="56" rx="12" fill="#f26b1d" stroke="#1b1d1e" stroke-width="3"/>
    <path d="M18 60h44v2a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10z" fill="#cf5316"/>
    <path d="M29 30v16M36 30v16M43 30v16" stroke="#1b1d1e" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="55" cy="40" r="4" fill="#1b1d1e"/></svg>`;
})();

/* ---------- layout ---------- */
let SW, SH, W, PH, PL, PT, sc, lw = 0;
let S = null, run = null, view = 'idle', cutT = 0.5;
function layout() {
  const r = board.getBoundingClientRect(); SW = r.width; SH = r.height;
  W = Math.min(SW * 0.86, 460);
  PH = Math.round(Math.max(52, Math.min(70, W * 0.15)));
  sc = Math.max(0.6, Math.min(1.1, (SH * 0.52) / 196));
  PT = Math.round(Math.max(196 * sc + 16, SH * 0.56));
  if (PT + PH > SH - 14) PT = SH - PH - 14;
  PL = (SW - W) / 2;
  Object.assign(plank.style, { left: PL + 'px', top: PT + 'px', width: W + 'px', height: PH + 'px' });
  board.querySelectorAll('.wood').forEach((el) => (el.style.width = W + 'px'));
  const fs = Math.round(Math.min(34, PH * 0.52));
  plankMark.style.fontSize = fs + 'px';
  labL.style.fontSize = labR.style.fontSize = Math.round(fs * 0.82) + 'px';
  guide.style.height = PH + 12 + 'px';
  if (view === 'result' || view === 'cutting') { lw = cutT * W; setPieces(16, 3.5); showLabels(1); positionSaw(cutT, 0); }
  else positionSaw(S ? S.pos : 0.5, 0);
}
new ResizeObserver(layout).observe(board);
function positionSaw(p, drop) {
  const x = PL + p * W;
  saw.style.transform = `translate(${x - 40 * sc}px,${PT - 190 * sc - 6 + drop}px) scale(${sc})`;
  guide.style.transform = `translate(${x - 1.5}px,${PT - 6}px)`;
}
function setPieces(spread, rot) {
  Object.assign(pL.style, { left: PL + 'px', top: PT + 'px', width: lw + 'px', height: PH + 'px', transform: `translateX(${-spread}px) rotate(${-rot}deg)` });
  Object.assign(pR.style, { left: PL + lw + 'px', top: PT + 'px', width: W - lw + 'px', height: PH + 'px', transform: `translateX(${spread}px) rotate(${rot}deg)` });
  pR.querySelector('.wood').style.left = -lw + 'px';
  labL.dataset.x = PL + lw / 2 - spread; labR.dataset.x = PL + lw + (W - lw) / 2 + spread;
}
function showLabels(k) {
  if (S && S.native) return;
  const y = PT + PH / 2;
  for (const el of [labL, labR]) { el.style.display = 'block'; el.style.left = el.dataset.x + 'px'; el.style.top = y + 'px'; el.style.transform = `translate(-50%,-50%) scale(${k})`; }
}
function resetPlank() {
  plank.style.display = 'block'; pL.style.display = pR.style.display = 'none';
  labL.style.display = labR.style.display = 'none';
  guide.style.opacity = S && S.native ? 0 : 1;
}

/* ---------- tweens (cosmetic) ---------- */
const tweens = [], dusts = [];
function tween(dur, fn, done, delay = 0) { tweens.push({ start: performance.now() + delay, dur: reduced() ? Math.min(dur, 60) : dur, fn, done }); }
const easeIn = (p) => p * p, easeOut = (p) => 1 - (1 - p) * (1 - p);
const easeOutBack = (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
function sawdust(x, y) {
  if (reduced()) return;
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('span'); el.className = 'dust';
    if (i % 3 === 0) el.style.background = '#c98a45';
    board.appendChild(el);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 160 + Math.random() * 260;
    dusts.push({ el, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 90, vr: (Math.random() - 0.5) * 600, life: 0.7 + Math.random() * 0.3 });
  }
}
function shake() { if (reduced()) return; board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake'); }

/* ---------- audio ---------- */
let eng = null;
function startEngine() {
  const ac = C.audio.ensure();
  if (!ac || !C.prefs.sound) return; stopEngine();
  const g = ac.createGain(); g.gain.value = 0;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650;
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 52;
  const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 104.7;
  const g2 = ac.createGain(); g2.gain.value = 0.3;
  o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(C.audio.master);
  o1.start(); o2.start(); g.gain.setTargetAtTime(0.045, ac.currentTime, 0.08);
  eng = { o1, o2, g };
}
function stopEngine() {
  const ac = C.audio.ctx;
  if (!eng || !ac) return; const e = eng; eng = null;
  e.g.gain.setTargetAtTime(0, ac.currentTime, 0.03);
  setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (_) {} }, 300);
}
function sfxCut() { C.audio.noise(0.4, 2300, 'bandpass', 0.38, 1); C.audio.tone(90, 240, 0.25, 'sawtooth', 0.12); }
function sfxThunk() { C.audio.tone(150, 55, 0.2, 'sine', 0.35); }

/* ---------- simulation ---------- */
function rating(err) { return err <= 0.2 ? t('kn_r0') : err <= 1 ? t('kn_r1') : err <= 3 ? t('kn_r2') : err <= 8 ? t('kn_r3') : t('kn_r4'); }
const total = () => Math.round(S.cuts.reduce((a, c) => a + c.err, 0) * 10) / 10;

function header() {
  if (!S) return;
  $('#who').textContent = run.player ? run.player.name : C.L(M.title);
  $('#round').textContent = t('kn_cut', { n: Math.min(S.round + 1, ROUNDS), m: ROUNDS });
  $('#total').innerHTML = S.cuts.length && !S.native ? `<b>${fmt(total())} cm</b>` : '';
}
function startAiming() {
  const s = S;
  s.speed = T.speeds[s.round] * (1 - T.jitter / 2 + s.rng() * T.jitter) * s.assistSpeed;
  s.phase = s.rng() * Math.PI * 2;
  s.aimTime = 0; s.aiming = true; view = 'aiming';
  resetPlank(); header();
  panel.innerHTML = `<p class="big ${reduced() ? '' : 'pulse'}">${C.ui.esc(t('kn_tap'))}</p><p class="sub">${C.ui.esc(t('kn_target'))}</p>`;
  startEngine();
  loop.play();
}
function step(dt, tick) {
  const s = S;
  if (!s || !s.aiming) return;
  s.time += dt; s.aimTime += dt;
  s.phase += dt * s.speed * (1 + T.sway * Math.sin(s.time * 0.9));
  s.pos = 0.5 + T.amp * Math.sin(s.phase);
  if (s.pendingCut) { s.pendingCut = false; if (s.aimTime > 0.2) cut(tick); }
}
function cut(tick) {
  const s = S;
  s.aiming = false; loop.halt(); view = 'cutting';
  run.input('C', tick);
  cutT = s.pos;
  const left = Math.round(cutT * 1000) / 10, right = Math.round((100 - left) * 10) / 10, err = Math.round(Math.abs(left - 50) * 10) / 10;
  s.cuts.push({ left, right, err });
  if (err <= 8) run.firstAtom();
  lw = cutT * W; guide.style.opacity = 0;
  stopEngine(); sfxCut(); C.haptic(35);
  panel.innerHTML = '';
  tween(170, (q) => positionSaw(cutT, easeIn(q) * (PH + 14)), () => {
    plank.style.display = 'none'; pL.style.display = pR.style.display = 'block';
    setPieces(0, 0); sawdust(PL + lw, PT + PH * 0.4); shake(); sfxThunk();
    labL.textContent = fmt(left) + 'CM'; labR.textContent = fmt(right) + 'CM';
    tween(430, (q) => { const e = easeOutBack(q); setPieces(16 * e, 3.5 * e); if (labL.style.display === 'block') showLabels(Number(labL.dataset.k || 1)); });
    tween(380, (q) => positionSaw(cutT, (PH + 14) * (1 - easeOut(q))), null, 140);
    tween(260, (q) => { const k = easeOutBack(q); labL.dataset.k = k; showLabels(k); }, null, 200);
    setTimeout(() => showCut(left, right, err), reduced() ? 120 : 560);
  });
}
function showCut(left, right, err) {
  view = 'result'; header();
  const last = S.round === ROUNDS - 1;
  const label = last ? t('kn_see') : t('kn_next');
  panel.innerHTML = S.native
    ? `<p class="big">${C.ui.esc(t('kn_hidden'))}</p><button class="btn" id="nextBtn">${C.ui.esc(label)}</button>`
    : `<p class="rating ${err <= 1 ? 'hot' : ''}">${C.ui.esc(rating(err))}</p>
       <p class="nums">${C.ui.esc(t('kn_off', { a: fmt(left), b: fmt(right), e: fmt(err) }))}</p>
       <button class="btn" id="nextBtn">${C.ui.esc(label)}</button>`;
  if (!S.native) C.ui.announce(`${rating(err)}. ${t('kn_off', { a: fmt(left), b: fmt(right), e: fmt(err) })}`);
  else C.ui.announce(t('kn_hidden'));
  const b = $('#nextBtn'); b.addEventListener('click', next); b.focus({ preventScroll: true });
}
function next() {
  if (view !== 'result') return;
  S.round++;
  if (S.round >= ROUNDS) return finish();
  startAiming();
}
async function finish() {
  view = 'done'; resetPlank(); positionSaw(0.5, 0);
  panel.innerHTML = '';
  const tot = total();
  const list = S.cuts.map((c) => `${fmt(c.left)}/${fmt(c.right)}`).join(', ');
  await run.finish({
    score: tot, tiebreak: Math.min(...S.cuts.map((c) => c.err)),
    detail: { cuts: S.cuts },
    sub: t('kn_cuts', { list }),
    share: { line: t('kn_line', { n: fmt(tot) }) },
  });
}

/* ---------- lifecycle ---------- */
C.onPlay(async (ctx) => {
  run = await C.run.start(ctx);
  S = { rng: run.rng, assistSpeed: run.speed, native: run.variant === 'native', round: 0, cuts: [], time: 0, pos: 0.5, aiming: false, pendingCut: false };
  board.classList.toggle('native', S.native);
  loop.resetTick();
  layout();
  startAiming();
});
C.onPause(() => { if (S && S.aiming) { loop.halt(); stopEngine(); } });
C.onResume(() => { if (S && S.aiming) { loop.play(); startEngine(); } });
C.onQuit(() => { S = null; stopEngine(); loop.halt(); panel.innerHTML = ''; resetPlank(); });

function tryCut() { if (S && S.aiming) { C.audio.ensure(); S.pendingCut = true; } }
board.addEventListener('pointerdown', (e) => { e.preventDefault(); tryCut(); });
panel.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) tryCut(); });
document.addEventListener('keydown', (e) => {
  if (C.isPaused() || document.querySelector('.sheet-wrap,.overlay.show')) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    if (S && S.aiming) { e.preventDefault(); tryCut(); }
    else if (view === 'result' && e.code === 'Space') { e.preventDefault(); next(); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopEngine(); });

/* ---------- render ---------- */
function render(now, alpha, dt) {
  if (S && S.aiming) positionSaw(S.pos, 0);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i], p = (now - tw.start) / tw.dur;
    if (p < 0) continue;
    tw.fn(Math.min(1, p));
    if (p >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
  }
  for (let i = dusts.length - 1; i >= 0; i--) {
    const d = dusts[i]; d.life -= dt; d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
    d.el.style.transform = `translate(${d.x}px,${d.y}px) rotate(${(d.r += d.vr * dt)}deg)`;
    d.el.style.opacity = Math.max(0, d.life);
    if (d.life <= 0) { d.el.remove(); dusts.splice(i, 1); }
  }
  if (!S && view === 'idle') positionSaw(0.5 + 0.3 * Math.sin(now / 900), 0);
}
const loop = fixedLoop({ step, render, STEP: 1 / 120 });
loop.start();
layout();
