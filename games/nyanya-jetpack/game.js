// Nyanya Jetpack: hold to fire the jetpack and keep the tomato off the spikes (spec §7.2).
// Course and mines come from the run seed; the sim runs at 1/120 s; hold/release ticks are logged so a
// challenger's run can be replayed as a ghost. Native "Okoa": a crash can be rescued by a friend.
import M from './stage.json';
import { fixedLoop, reduced, hud, onControl } from '../_lib/kit.js';
import { STEP, TIERS, tierIndex, createCourse, createFlyer, stepFlyer } from './sim.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const T = M.tunables;
C.stage(M);

const cv = document.getElementById('cv'), ctx = cv.getContext('2d'), play = document.getElementById('play');
const hint = document.getElementById('hint'), tierEl = document.getElementById('tier');
const setDist = hud(document.getElementById('dist'));
const setSub = hud(document.getElementById('sub'));
const tierName = (i) => t('tier_' + TIERS[i].name);

let W = 0, H = 0, dpr = 1;
function resize() {
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}
new ResizeObserver(resize).observe(cv);

let S = null, run = null, idleCourse = createCourse('idle', T);
let particles = [], deadAt = 0, squash = 0;

function setTier(i, pop) {
  tierEl.textContent = tierName(i); tierEl.style.background = TIERS[i].c;
  if (pop && !reduced()) { tierEl.classList.add('pop'); setTimeout(() => tierEl.classList.remove('pop'), 260); }
}

/* ---------------- lifecycle ---------------- */
C.onPlay(async (ctx) => {
  run = await C.run.start(ctx);
  const course = createCourse(run.seed, T);
  const mode = run.mode;
  const crashAt = run.challenge && run.challenge.creatorScore;
  S = {
    mode, course, h: STEP * run.speed, pressed: false, toggles: [], tierIdx: 0, over: false,
    f: createFlyer(mode === 'revive' ? { dist: crashAt, y: course.corr(crashAt).mid, shield: 1.5 } : mode === 'okoa' ? { dist: Math.max(0, crashAt - 12), y: course.corr(Math.max(0, crashAt - 12)).mid } : {}),
    ghost: null, target: null, okoaT: 0,
  };
  if (mode === 'h2h' && run.challenge && run.challenge.payload && Array.isArray(run.challenge.payload.ghost)) {
    S.ghost = { f: createFlyer(), toggles: run.challenge.payload.ghost, i: 0, name: (run.challenge.creator && run.challenge.creator.name) || t('anon') };
  }
  if (mode === 'okoa') {
    // the friend's falling tomato: drifts down the tunnel ahead of you, swaying (seeded from the crash seed)
    const sway = C.rng(run.seed, 'okoa');
    S.target = { ahead: 3.2, y: 0.18, vy: 0.05 + sway() * 0.04, phase: sway() * 6, amp: 0.12 + sway() * 0.1 };
  }
  S.tierIdx = tierIndex(S.f.dist); setTier(S.tierIdx, false);
  particles = []; squash = 0;
  loop.resetTick();
  S.state = 'ready';
  hint.textContent = mode === 'okoa' ? t('ny_catch') : mode === 'revive' ? t('ny_back', { n: Math.floor(crashAt) }) : t('ny_hold');
  hint.hidden = false;
  loop.play();
});
C.onPause(() => { if (S && S.state === 'play') { S.state = 'paused'; hint.textContent = t('ny_keep'); hint.hidden = false; } pointers.clear(); keyHeld = false; updateHold(); });
C.onResume(() => {});
C.onQuit(() => { S = null; hint.hidden = true; thrustSound(false); });

/* ---------------- simulation ---------------- */
function step(dt, tick) {
  const s = S;
  if (!s || s.state !== 'play') return;
  const f = s.f;
  if (s.pressed !== f.holding) { f.holding = s.pressed; s.toggles.push(f.ticks); run.input(f.holding ? 'P' : 'R', f.ticks); }
  if (s.ghost && !s.ghost.f.dead) {
    const g = s.ghost;
    while (g.i < g.toggles.length && g.toggles[g.i] <= g.f.ticks) { g.f.holding = !g.f.holding; g.i++; }
    stepFlyer(g.f, s.course, STEP);
  }
  const crashed = stepFlyer(f, s.course, s.h);
  if (s.mode === 'okoa') {
    s.okoaT += s.h;
    const tg = s.target;
    tg.ahead = Math.max(0, 3.2 * (1 - s.okoaT / (T.okoaSecs * 0.8)));
    tg.y += tg.vy * s.h;
    const c = s.course.corr(f.dist + tg.ahead * 10);
    const yy = tg.y + Math.sin(s.okoaT * 1.6 + tg.phase) * tg.amp;
    tg.yy = Math.max(c.top + 0.05, Math.min(c.bot - 0.05, yy));
    if (tg.y > 0.8 || tg.y < 0.2) tg.vy = -tg.vy;
    if (!crashed && Math.hypot(tg.ahead, (tg.yy - f.y) * 10) < 0.9) return endOkoa(true);
    if (crashed || s.okoaT >= T.okoaSecs) return endOkoa(false);
    return;
  }
  if (s.tierIdx < TIERS.length - 1 && f.dist >= TIERS[s.tierIdx + 1].m) {
    s.tierIdx++; setTier(s.tierIdx, true); sfxTier();
    C.ui.announce(t('ny_tier', { tier: tierName(s.tierIdx) }));
    if (s.tierIdx === 1) run.firstAtom();
  }
  if (f.dist > 50) run.firstAtom();
  if (crashed) die();
}
function die() {
  const s = S;
  s.state = 'dying'; deadAt = performance.now(); thrustSound(false); sfxSplat(); C.haptic(70);
  const tx = txPos(), py = s.f.y * H, r = T.radius * H;
  if (!reduced()) for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random() * 0.9) * H;
    particles.push({ x: tx, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3 * H, s: r * (0.12 + Math.random() * 0.22), c: i % 4 === 0 ? '#ffd0b8' : i % 3 === 0 ? '#3c9a3a' : '#d92a22', life: 1 });
  }
  setTimeout(finish, 900);
}
async function finish() {
  const s = S;
  if (!s || s.over) return;
  s.over = true; loop.halt(); hint.hidden = true;
  const d = Math.round(s.f.dist * 10) / 10;
  const i = tierIndex(d), nxt = TIERS[i + 1];
  const result = {
    score: d,
    detail: { tier: TIERS[i].name, toggles: s.toggles.length },
    sub: `${t('ny_tier', { tier: tierName(i) })}.${nxt ? ' ' + t('ny_next', { tier: tierName(i + 1), m: nxt.m }) : ''}`,
    share: { line: t('ny_line', { tier: tierName(i), n: Math.floor(d) }) },
    ghost: run.assist || s.mode === 'revive' ? undefined : s.toggles,
  };
  if (run.variant === 'native' && s.mode !== 'revive') {
    const r = run;
    result.reviveText = t('ny_okoa_text', { n: Math.floor(d) });
    result.actions = [{ label: '🍅 ' + t('ny_okoa'), primary: true, closes: false, run: () => C.createChallenge(r, result, C.catalog.formatScore(M.id, 'solo', d), { kind: 'revive', payload: { dist: d } }) }];
  }
  await run.finish(result);
}
async function endOkoa(caught) {
  const s = S;
  s.state = 'over'; s.over = true; loop.halt(); thrustSound(false); hint.hidden = true;
  if (caught) { C.audio.chord([660, 880, 1320], 0.08); C.haptic(40); } else sfxSplat();
  C.ui.announce(caught ? t('ny_caught') : t('ny_missed'));
  await run.finish({ score: caught ? 1 : 0, display: caught ? t('ny_caught') : t('ny_missed'), detail: { caught } });
}

/* ---------------- input ---------------- */
const pointers = new Set();
let keyHeld = false;
function updateHold() {
  if (!S) return;
  S.pressed = (pointers.size > 0 || keyHeld) && (S.state === 'play' || S.state === 'ready' || S.state === 'paused');
  thrustSound(S.pressed && S.state === 'play');
}
function press() {
  C.audio.ensure();
  if (!S) return;
  if (S.state === 'ready' || S.state === 'paused') { S.state = 'play'; hint.hidden = true; run.firstInput(); }
  updateHold();
}
play.addEventListener('pointerdown', (e) => {
  if (onControl(e)) return;
  e.preventDefault(); pointers.add(e.pointerId); press();
});
const release = (e) => { pointers.delete(e.pointerId); updateHold(); };
addEventListener('pointerup', release); addEventListener('pointercancel', release);
play.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (!['Space', 'ArrowUp', 'KeyW'].includes(e.code) || !S || S.over || document.querySelector('.sheet-wrap,.overlay.show')) return;
  e.preventDefault(); if (e.repeat) return; keyHeld = true; press();
});
document.addEventListener('keyup', (e) => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { keyHeld = false; updateHold(); } });

/* ---------------- sound ---------------- */
let thrustGain = null;
function thrustSound(on) {
  const ac = C.audio.ctx;
  if (!ac) return;
  if (!thrustGain) {
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    thrustGain = ac.createGain(); thrustGain.gain.value = 0;
    src.connect(lp); lp.connect(thrustGain); thrustGain.connect(C.audio.master); src.start();
  }
  thrustGain.gain.setTargetAtTime(on ? 0.22 : 0, ac.currentTime, on ? 0.03 : 0.06);
}
function sfxSplat() { C.audio.noise(0.35, 700, 'lowpass', 0.7); C.audio.tone(180, 45, 0.25, 'sine', 0.45); }
function sfxTier() { C.audio.chord([660, 880, 1320], 0.08, 0.25, 'triangle', 0.18); }

/* ---------------- drawing ---------------- */
const txPos = () => Math.min(W * 0.3, H * 0.5);
function draw(now) {
  const s = S;
  const course = s ? s.course : idleCourse;
  const f = s ? s.f : { dist: (now / 1000) * 6 % 200, y: 0.5, vy: 0, holding: false };
  if (!s) idleCourse.genTo(f.dist + 60);
  const dist = f.dist, ppm = 0.1 * H, tx = txPos(), sx = (m) => tx + (m - dist) * ppm;
  const m0 = dist - tx / ppm, m1 = dist + (W - tx) / ppm;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (s && s.state === 'dying' && !reduced() && now - deadAt < 260) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  for (let i = 0; i < TIERS.length; i++) {
    const a = TIERS[i].m, b = TIERS[i + 1] ? TIERS[i + 1].m : 1e9;
    if (b < m0 || a > m1) continue;
    ctx.fillStyle = TIERS[i].c;
    const x0 = Math.max(-10, sx(a)), x1 = Math.min(W + 10, sx(b));
    ctx.fillRect(x0, 0, x1 - x0, H);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(0.12 * H)}px "Archivo Black", Impact, sans-serif`;
  ctx.fillStyle = 'rgba(27,29,30,.78)';
  for (let i = 0; i < TIERS.length; i++) { const mm = TIERS[i].m + 9, x = sx(mm); if (x > -0.6 * H && x < W + 0.6 * H) ctx.fillText(tierName(i), x, course.corr(mm).mid * H); }
  drawWalls(course, dist, sx, m0, m1, ppm, true); drawWalls(course, dist, sx, m0, m1, ppm, false);
  for (const mn of course.mines) { const x = sx(mn.m); if (x < -50 || x > W + 50) continue; drawMine(x, mn.y * H, mn.r * H, mn.spin + now / 700); }
  if (s && s.ghost) {
    const g = s.ghost.f;
    ctx.save(); ctx.globalAlpha = 0.4;
    drawTomato(sx(g.dist), g.y * H, T.radius * H, 0, 1, 1, g.holding && !g.dead, g.dead);
    ctx.restore();
    ctx.font = `700 13px Barlow, system-ui, sans-serif`; ctx.fillStyle = 'rgba(27,29,30,.7)';
    ctx.fillText(t('ny_ghost', { name: s.ghost.name }), Math.max(60, Math.min(W - 60, sx(g.dist))), Math.max(14, g.y * H - T.radius * H - 14));
  }
  if (s && s.target && s.state !== 'over') {
    const tg = s.target, x = tx + tg.ahead * ppm;
    drawTomato(x, tg.yy * H, T.radius * H, Math.sin(now / 200) * 0.3, 1, 1, false, false, true);
    const left = Math.max(0, T.okoaSecs - s.okoaT);
    ctx.font = `${Math.round(0.07 * H)}px "Archivo Black", Impact, sans-serif`; ctx.lineWidth = 5; ctx.strokeStyle = '#1b1d1e'; ctx.fillStyle = '#fff';
    ctx.strokeText(t('ny_secs', { n: left.toFixed(1) }), W / 2, 0.08 * H); ctx.fillText(t('ny_secs', { n: left.toFixed(1) }), W / 2, 0.08 * H);
  }
  let sxq = 1, syq = 1;
  const dead = s && (s.state === 'dying' || (s.over && s.mode !== 'okoa'));
  if (dead) { squash = Math.min(1, squash + 0.15); sxq = 1 + 0.45 * squash; syq = 1 - 0.45 * squash; }
  const ang = s && s.state === 'play' ? Math.max(-0.4, Math.min(0.4, f.vy / T.vmax * 0.38)) : 0;
  if (s && s.f.shield > 0) { ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now / 80); }
  const hover = (!s || s.state === 'ready') && !reduced() ? 0.018 * Math.sin(now / 320) : 0; // cosmetic only, never written to the sim
  drawTomato(tx, (f.y + hover) * H, T.radius * H, ang, sxq, syq, f.holding && s && s.state === 'play', dead);
  if (s && s.f.shield > 0) ctx.restore();
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawWalls(course, dist, sx, m0, m1, ppm, top) {
  const SP = 0.045;
  const edge = (m) => { const c = course.corr(m); return top ? (c.top - SP) * H : (c.bot + SP) * H; };
  const tip = (m) => { const c = course.corr(m); return top ? c.top * H : c.bot * H; };
  ctx.beginPath(); ctx.moveTo(-5, top ? -5 : H + 5);
  for (let x = -5; x <= W + 6; x += 6) ctx.lineTo(x, edge(dist + (x - sx(dist)) / ppm));
  ctx.lineTo(W + 6, top ? -5 : H + 5); ctx.closePath();
  ctx.fillStyle = '#2b3337'; ctx.fill();
  ctx.lineWidth = Math.max(2, 0.02 * H); ctx.strokeStyle = '#3d494e';
  ctx.beginPath();
  const off = top ? -0.035 * H : 0.035 * H;
  for (let x = -5; x <= W + 6; x += 8) { const yy = edge(dist + (x - sx(dist)) / ppm) + off; x <= -5 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
  ctx.stroke();
  const sw = 0.35; let k = Math.floor(m0 / sw) * sw - sw;
  ctx.beginPath();
  for (; k < m1 + sw; k += sw) { const xl = sx(k), xr = sx(k + sw), xm = sx(k + sw / 2); ctx.moveTo(xl, edge(k)); ctx.lineTo(xm, tip(k + sw / 2)); ctx.lineTo(xr, edge(k + sw)); ctx.closePath(); }
  ctx.fillStyle = '#efebe3'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b1d1e'; ctx.stroke();
}
function drawMine(x, yy, r, rot) {
  ctx.save(); ctx.translate(x, yy); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, b = a + 0.22, c2 = a - 0.22; ctx.moveTo(Math.cos(c2) * r * 0.8, Math.sin(c2) * r * 0.8); ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); ctx.lineTo(Math.cos(b) * r * 0.8, Math.sin(b) * r * 0.8); ctx.closePath(); }
  ctx.fillStyle = '#efebe3'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b1d1e'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, 7); ctx.fillStyle = '#2b3337'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.28, r * 0.18, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
  ctx.restore();
}
function drawTomato(x, yy, r, ang, sxq, syq, fire, dead, noPack) {
  const lw = Math.max(2, r * 0.1);
  ctx.save(); ctx.translate(x, yy + (dead ? r * 0.3 * (1 - syq) : 0)); ctx.rotate(ang); ctx.scale(sxq, syq);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#1b1d1e';
  if (fire && !dead) {
    const fl = r * (0.9 + Math.random() * 0.6);
    ctx.beginPath(); ctx.moveTo(-1.16 * r, 0.86 * r); ctx.lineTo(-0.66 * r, 0.86 * r); ctx.lineTo(-0.91 * r, 0.86 * r + fl); ctx.closePath(); ctx.fillStyle = '#ff8a1f'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-1.04 * r, 0.86 * r); ctx.lineTo(-0.78 * r, 0.86 * r); ctx.lineTo(-0.91 * r, 0.86 * r + fl * 0.55); ctx.closePath(); ctx.fillStyle = '#ffe14d'; ctx.fill();
  }
  if (!noPack) {
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-1.3 * r, -0.75 * r, 0.75 * r, 1.45 * r, 0.2 * r); else ctx.rect(-1.3 * r, -0.75 * r, 0.75 * r, 1.45 * r);
    ctx.fillStyle = '#a3adb2'; ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.rect(-1.1 * r, 0.68 * r, 0.38 * r, 0.2 * r); ctx.fillStyle = '#5d676c'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.93 * r, -0.35 * r, 0.12 * r, 0, 7); ctx.fillStyle = '#f26b1d'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = '#e5322a'; ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
  ctx.save(); ctx.translate(-0.38 * r, -0.4 * r); ctx.rotate(-0.6); ctx.beginPath(); ctx.ellipse(0, 0, 0.28 * r, 0.15 * r, 0, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill(); ctx.restore();
  if (!noPack) { ctx.beginPath(); ctx.moveTo(-0.72 * r, -0.62 * r); ctx.quadraticCurveTo(-0.1 * r, -0.05 * r, -0.22 * r, 0.96 * r); ctx.lineWidth = lw * 1.3; ctx.stroke(); }
  ctx.fillStyle = '#3c9a3a'; ctx.lineWidth = lw * 0.7;
  for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(0, -0.92 * r); ctx.rotate(-Math.PI / 2 + (i - 2) * 0.55); ctx.beginPath(); ctx.ellipse(0.28 * r, 0, 0.3 * r, 0.11 * r, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
  ctx.beginPath(); ctx.rect(-0.06 * r, -1.28 * r, 0.12 * r, 0.3 * r); ctx.fill(); ctx.stroke();
  for (const [ex, ey] of [[0.22 * r, -0.12 * r], [0.6 * r, -0.1 * r]]) {
    if (dead) { ctx.lineWidth = lw * 0.9; ctx.beginPath(); ctx.moveTo(ex - 0.1 * r, ey - 0.1 * r); ctx.lineTo(ex + 0.1 * r, ey + 0.1 * r); ctx.moveTo(ex + 0.1 * r, ey - 0.1 * r); ctx.lineTo(ex - 0.1 * r, ey + 0.1 * r); ctx.stroke(); }
    else { ctx.beginPath(); ctx.ellipse(ex, ey, 0.15 * r, 0.19 * r, 0, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.stroke(); ctx.beginPath(); ctx.arc(ex + 0.05 * r, ey, 0.08 * r, 0, 7); ctx.fillStyle = '#1b1d1e'; ctx.fill(); }
  }
  ctx.lineWidth = lw * 0.7; ctx.beginPath();
  if (dead || noPack) { ctx.ellipse(0.45 * r, 0.35 * r, 0.1 * r, 0.12 * r, 0, 0, 7); ctx.fillStyle = '#1b1d1e'; ctx.fill(); }
  else { ctx.arc(0.42 * r, 0.22 * r, 0.17 * r, 0.2, Math.PI - 0.2); ctx.stroke(); }
  ctx.restore();
}

function render(now, alpha, dt) {
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.vy += 2.4 * H * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.9; if (p.life <= 0) particles.splice(i, 1); }
  if (W > 0 && H > 0) draw(now);
  if (S) {
    setDist(S.mode === 'okoa' ? C.ui.esc(t('ny_catch')) : `${Math.floor(S.f.dist)} m`);
    const b = (C.store.get('best:' + M.id, {})[`${S.mode === 'daily' ? 'daily' : 'solo'}:${run.variant}`] || {}).score;
    setSub(S.ghost ? C.ui.esc(t('ny_ghost', { name: S.ghost.name })) : b != null ? C.ui.esc(t('result_best', { best: C.catalog.formatScore(M.id, 'solo', b) })) : '');
  }
}
const loop = fixedLoop({ step, render, STEP });
loop.start();
setTier(0, false);
