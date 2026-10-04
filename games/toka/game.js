// Toka: tap arrows to slide them off the board without hitting another (spec §7.5).
// Solo climbs endless generated levels; daily and head to head play one board and count bumps, then time.
// Native "Giuthi arrows": double-headed arrows reverse instead of costing a heart.
import M from './stage.json';
import { cfgFor, DAILY_CFG, generate, tapOutcome, blocker, removeArrow, levelSeed } from './logic.js';
import { reduced } from '../_lib/kit.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const TN = M.tunables;
// a challenge from a solo level is played on the same level and compared on bumps, then time
C.stage({ ...M, challengePayload: (r, res) => (r.mode === 'solo' && res && res.detail ? { level: res.detail.level, h2hScore: res.detail.bumps, h2hTiebreak: res.detail.secs } : null) });

const $ = (s) => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d');
let S = null, run = null, L = null;
let grid = false, hintId = -1, hintUntil = 0, flashes = [], focusId = -1;

function remaining() { return L.arrows.filter((a) => !a.gone && a.state !== 'exit').length; }
function paintHud() {
  if (!S) return;
  $('#lvl').textContent = S.mode === 'solo' ? t('tk_level', { n: S.level }) : C.L(M.title);
  $('#left').textContent = t('tk_left', { n: remaining() }) + (S.mode !== 'solo' ? ` · ${t('tk_bumps', { n: S.bumps })}` : '');
  $('#hearts').innerHTML = S.mode === 'solo' ? [0, 1, 2].map((i) => `<span class="${i < S.hearts ? '' : 'gone'}" aria-hidden="true">❤️</span>`).join('') : '';
  $('#hearts').setAttribute('aria-label', S.mode === 'solo' ? `${S.hearts} hearts` : t('tk_bumps', { n: S.bumps }));
  $('#hintN').textContent = S.hints;
}

/* ---------------- lifecycle ---------------- */
C.onPlay(async (ctx) => {
  run = await C.run.start(ctx);
  const native = run.variant === 'native';
  let level = C.store.get('level:toka', 1);
  const payload = run.challenge && run.challenge.payload;
  if (payload && payload.level) level = payload.level;
  S = { mode: run.mode, native, level, hearts: TN.hearts, hints: TN.hints, bumps: 0, taps: 0, t0: performance.now(), playing: true,
    seed: run.mode === 'solo' || (payload && payload.level) ? levelSeed(level) + (native ? '-g' : '') : run.seed,
    cfg: run.mode === 'solo' || (payload && payload.level) ? cfgFor(level) : DAILY_CFG };
  loadBoard();
  cv.focus({ preventScroll: true });
});
C.onQuit(() => { S = null; L = null; });
function loadBoard() {
  L = generate(S.seed, S.cfg, S.native);
  for (const a of L.arrows) { a.state = 'idle'; a.s = 0; a.gone = false; }
  S.hearts = TN.hearts; S.hints = TN.hints; S.playing = true; hintId = -1; flashes = [];
  focusId = L.arrows.length ? L.arrows[0].id : -1;
  layout(); paintHud();
}
$('#restart').onclick = () => { if (S) { C.audio.ensure(); loadBoard(); run.event('restart'); } };
$('#gridBtn').onclick = () => { grid = !grid; $('#gridBtn').setAttribute('aria-pressed', String(grid)); };
$('#hintBtn').onclick = () => {
  if (!S || !S.playing) return; C.audio.ensure();
  if (S.hints <= 0) { hintId = -1; return; }
  const free = L.arrows.filter((a) => !a.gone && a.state === 'idle' && ['exit', 'reverse'].includes(tapOutcome(L, a).kind));
  if (!free.length) return;
  free.sort((a, b) => b.cells.length - a.cells.length);
  hintId = free[0].id; hintUntil = performance.now() + 4000; S.hints--; paintHud(); C.audio.tone(880, 1320, 0.15, 'sine', 0.14);
};

/* ---------------- layout ---------------- */
let W = 0, H = 0, dpr = 1, cell = 20, ox = 0, oy = 0;
function layout() {
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!L) return;
  cell = Math.floor(Math.min((W - 24) / L.C, (H - 24) / L.R));
  ox = (W - cell * L.C) / 2; oy = (H - cell * L.R) / 2;
}
new ResizeObserver(layout).observe(cv);
const cx = (x) => ox + (x + 0.5) * cell, cy = (y) => oy + (y + 0.5) * cell;

/* ---------------- moves ---------------- */
function trajectory(a) {
  const pts = a.cells.map((c) => ({ x: c.x, y: c.y }));
  let { x, y } = a.cells[a.cells.length - 1];
  const extra = Math.max(L.C, L.R) + a.cells.length + 3;
  for (let i = 0; i < extra; i++) { x += a.dx; y += a.dy; pts.push({ x, y }); }
  return pts;
}
function reverseArrow(a) {
  a.cells = a.cells.slice().reverse();
  const h = a.cells[a.cells.length - 1], b = a.cells[a.cells.length - 2];
  a.dx = h.x - b.x; a.dy = h.y - b.y;
}
function tap(a) {
  if (!S || !S.playing || a.state !== 'idle' || a.gone) return;
  C.audio.ensure();
  S.taps++;
  run.input(`T${a.id}`, S.taps);
  if (hintId === a.id) hintId = -1;
  const o = tapOutcome(L, a);
  if (o.kind === 'reverse') { reverseArrow(a); C.ui.announce(t('tk_reverse')); C.audio.tone(420, 260, 0.12, 'triangle', 0.12); }
  if (o.kind === 'exit' || o.kind === 'reverse') {
    a.traj = trajectory(a); a.state = 'exit'; a.s = 0; a.v = 0;
    for (const c of a.cells) L.occ[c.y][c.x] = -1;
    sfx.whoosh(); paintHud(); run.firstAtom();
    C.ui.announce(t('tk_out1', { n: remaining() }));
    if (remaining() === 0) { S.playing = false; setTimeout(win, 650); }
    moveFocusAfter(a);
    return;
  }
  // bump (single-headed) or stop (double-headed, blocked both ways)
  const b = blocker(L, a);
  a.traj = trajectory(a); a.state = 'bump'; a.s = 0; a.max = Math.max(0.25, b.k - 0.62); a.phase = 0;
  const now = performance.now();
  flashes.push({ id: b.id, t0: now }, { id: a.id, t0: now });
  if (o.kind === 'stop') { C.ui.announce(t('tk_stop')); setTimeout(() => C.audio.tone(300, 260, 0.1, 'triangle', 0.08), 80); return; }
  setTimeout(() => { sfx.bonk(); loseHeart(); }, reduced() ? 0 : Math.min(260, a.max * 40 + 60));
}
function loseHeart() {
  if (!S) return;
  S.bumps++;
  C.haptic(60);
  const h = $('#hearts'); if (!reduced()) { h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake'); }
  if (S.mode !== 'solo') { paintHud(); C.ui.announce(t('tk_bumps', { n: S.bumps })); return; }
  S.hearts = Math.max(0, S.hearts - 1); paintHud();
  C.ui.announce(t('tk_bump', { n: S.hearts }));
  if (S.hearts === 0) {
    S.playing = false;
    setTimeout(() => {
      const o = C.ui.h(`<div class="overlay show" role="dialog" aria-modal="true"><div class="card"><h2>${C.ui.esc(t('tk_out'))}</h2><p class="muted">${C.ui.esc(t('tk_out_body', { n: S.level }))}</p><button class="btn wide">${C.ui.esc(t('tk_retry'))}</button></div></div>`);
      document.body.appendChild(o);
      const btn = o.querySelector('button'); btn.focus();
      btn.onclick = () => { o.remove(); loadBoard(); cv.focus({ preventScroll: true }); };
    }, 500);
  }
}
async function win() {
  sfx.win();
  const secs = Math.round((performance.now() - S.t0) / 100) / 10;
  if (S.mode === 'solo') {
    C.store.set('level:toka', S.level + 1);
    await run.finish({
      score: S.level, tiebreak: secs, detail: { level: S.level, hearts: S.hearts, bumps: S.bumps, secs },
      sub: S.hearts === TN.hearts ? t('tk_flawless') : t('tk_spare', { n: S.hearts }),
      againLabel: t('tk_next', { n: S.level + 1 }),
      share: { line: t('tk_line_lvl', { n: S.level }) },
    });
  } else {
    const day = new Date().toLocaleDateString(C.prefs.lang === 'sw' ? 'sw-KE' : 'en-KE', { day: 'numeric', month: 'short' });
    const grid = S.bumps === 0 ? '🟩🟩🟩' : '🟥'.repeat(Math.min(S.bumps, 8));
    await run.finish({
      score: S.bumps, tiebreak: secs, detail: { bumps: S.bumps, secs, taps: S.taps },
      sub: t('tk_secs', { s: secs }),
      share: { line: t('tk_line', { b: S.bumps, s: secs }), grid: run.mode === 'daily' ? `${grid} ${t('tk_secs', { s: secs })}` : undefined, head: `Toka · ${day}` },
    });
  }
}

/* ---------------- keyboard focus ---------------- */
const headOf = (a) => a.cells[a.cells.length - 1];
function moveFocusAfter(a) {
  if (focusId !== a.id) return;
  const live = L.arrows.filter((x) => !x.gone && x.state === 'idle' && x.id !== a.id);
  focusId = live.length ? live[0].id : -1;
}
function moveFocus(dx, dy) {
  const live = L.arrows.filter((x) => !x.gone && x.state === 'idle');
  if (!live.length) return;
  const cur = L.arrows[focusId] && !L.arrows[focusId].gone ? headOf(L.arrows[focusId]) : headOf(live[0]);
  let best = null, bd = Infinity;
  for (const a of live) {
    if (a.id === focusId) continue;
    const h = headOf(a), vx = h.x - cur.x, vy = h.y - cur.y;
    const along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
    if (along <= 0) continue;
    const d = along + across * 2;
    if (d < bd) { bd = d; best = a; }
  }
  if (best) focusId = best.id;
  const f = L.arrows[focusId];
  if (f) C.ui.announce(`Arrow ${['right', 'down', 'left', 'up'][[[1, 0], [0, 1], [-1, 0], [0, -1]].findIndex(([x, y]) => x === f.dx && y === f.dy)]}${f.rev ? ', double-headed' : ''}`);
}
document.addEventListener('keydown', (e) => {
  if (!S || !L || C.isPaused() || document.querySelector('.sheet-wrap,.overlay.show')) return;
  const m = { ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowUp: [0, -1] }[e.code];
  if (m) { e.preventDefault(); moveFocus(...m); }
  if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement === cv) { e.preventDefault(); const a = L.arrows[focusId]; if (a) tap(a); }
});

/* ---------------- pointer ---------------- */
cv.addEventListener('pointerdown', (e) => {
  if (!L || !S || !S.playing) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  const gx = (px - ox) / cell - 0.5, gy = (py - oy) / cell - 0.5;
  let best = -1, bd = 0.75;
  for (let y = Math.floor(gy) - 1; y <= Math.ceil(gy) + 1; y++) for (let x = Math.floor(gx) - 1; x <= Math.ceil(gx) + 1; x++) {
    if (x < 0 || y < 0 || x >= L.C || y >= L.R) continue;
    const o = L.occ[y][x]; if (o === -1) continue;
    const d = Math.hypot(x - gx, y - gy); if (d < bd) { bd = d; best = o; }
  }
  if (best >= 0) { focusId = best; tap(L.arrows[best]); }
});

// test hook for scripts/browser.mjs: taps an arrow that can leave
window.__chezAuto = () => {
  if (!S || !S.playing || !L) return;
  const a = L.arrows.find((x) => !x.gone && x.state === 'idle' && ['exit', 'reverse'].includes(tapOutcome(L, x).kind));
  if (a) tap(a);
};

/* ---------------- sound ---------------- */
const sfx = {
  whoosh() { C.audio.tone(320, 900, 0.16, 'triangle', 0.12); },
  bonk() { C.audio.tone(160, 70, 0.18, 'square', 0.12); },
  win() { C.audio.chord([523, 659, 784, 1047]); },
};

/* ---------------- drawing ---------------- */
function pointAt(tr, u) {
  const i = Math.max(0, Math.min(tr.length - 2, Math.floor(u))), f = u - i;
  return { x: tr[i].x + (tr[i + 1].x - tr[i].x) * f, y: tr[i].y + (tr[i + 1].y - tr[i].y) * f };
}
function drawArrow(a, color, width) {
  const len = a.cells.length;
  let pts, hd;
  if (a.state === 'idle') { pts = a.cells; hd = { x: a.dx, y: a.dy }; }
  else {
    const tr = a.traj, s0 = a.s, s1 = a.s + len - 1;
    const p0 = pointAt(tr, s0), p1 = pointAt(tr, s1);
    pts = [p0]; for (let i = Math.floor(s0) + 1; i <= s1 && i < tr.length; i++) if (i > s0) pts.push(tr[i]);
    pts.push(p1);
    const j = Math.min(tr.length - 2, Math.floor(s1)); hd = { x: tr[j + 1].x - tr[j].x, y: tr[j + 1].y - tr[j].y };
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(cx(p.x), cy(p.y)) : ctx.moveTo(cx(p.x), cy(p.y))));
  const h = pts[pts.length - 1], tipX = cx(h.x) + hd.x * cell * 0.32, tipY = cy(h.y) + hd.y * cell * 0.32;
  ctx.lineTo(tipX - hd.x * cell * 0.2, tipY - hd.y * cell * 0.2); ctx.stroke();
  const head = (X, Y, dx, dy) => {
    const s = Math.max(5, cell * 0.3), pX = -dy, pY = dx;
    ctx.beginPath(); ctx.moveTo(X, Y);
    ctx.lineTo(X - dx * s * 1.25 + pX * s * 0.75, Y - dy * s * 1.25 + pY * s * 0.75);
    ctx.lineTo(X - dx * s * 1.25 - pX * s * 0.75, Y - dy * s * 1.25 - pY * s * 0.75);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  head(tipX, tipY, hd.x, hd.y);
  if (a.rev && a.state === 'idle') {
    // the second head sits on the tail, pointing out the back
    const t0 = a.cells[0], t1 = a.cells[1], bx = t0.x - t1.x, by = t0.y - t1.y;
    head(cx(t0.x) + bx * cell * 0.32, cy(t0.y) + by * cell * 0.32, bx, by);
    ctx.beginPath(); ctx.moveTo(cx(t0.x), cy(t0.y)); ctx.lineTo(cx(t0.x) + bx * cell * 0.15, cy(t0.y) + by * cell * 0.15); ctx.stroke();
  }
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (L) {
    for (const a of L.arrows) {
      if (a.state === 'exit') {
        a.v = Math.min(42, a.v + 120 * dt); a.s += a.v * dt * (reduced() ? 2 : 1);
        if (a.s > a.traj.length - a.cells.length - 1) { a.gone = true; a.state = 'done'; }
      } else if (a.state === 'bump') {
        const sp = 22 * dt * (reduced() ? 3 : 1);
        if (a.phase === 0) { a.s += sp; if (a.s >= a.max) { a.s = a.max; a.phase = 1; } }
        else { a.s -= sp * 0.8; if (a.s <= 0) { a.s = 0; a.state = 'idle'; } }
      }
    }
    if (grid) { ctx.fillStyle = 'rgba(107,74,43,.22)'; for (let y = 0; y < L.R; y++) for (let x = 0; x < L.C; x++) { ctx.beginPath(); ctx.arc(cx(x), cy(y), Math.max(1.2, cell * 0.06), 0, 7); ctx.fill(); } }
    const lw = Math.max(2.5, cell * 0.15);
    if (hintId >= 0 && now > hintUntil) hintId = -1;
    for (const a of L.arrows) {
      if (a.gone) continue;
      let col = a.rev ? '#2b5d8a' : '#6b4a2b';
      // one red flash of 300 ms per bump: under 3 flashes a second (spec §9.4)
      if (flashes.find((f) => f.id === a.id && now - f.t0 < 300)) col = '#e5322a';
      if (a.id === hintId) { ctx.save(); ctx.globalAlpha = reduced() ? 0.45 : 0.35 + 0.15 * Math.sin(now / 400); drawArrow(a, '#3fbf6a', lw * 3); ctx.restore(); col = '#1f8a45'; }
      if (a.id === focusId && document.activeElement === cv && a.state === 'idle') { ctx.save(); ctx.globalAlpha = 0.9; drawArrow(a, '#FFD21F', lw * 2.6); ctx.restore(); }
      if (a.state === 'exit') { const k = Math.max(0, 1 - (a.s - (L.C + L.R) * 0.5) / (L.C + L.R)); ctx.save(); ctx.globalAlpha = Math.min(1, k + 0.3); drawArrow(a, col, lw); ctx.restore(); }
      else drawArrow(a, col, lw);
    }
    flashes = flashes.filter((f) => now - f.t0 < 300);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
