// Cap Drop: slide the caps until the gold cap drops down the chute into the glass (spec §7.6).
// Solo plays the level ladder; daily and head to head play one seeded mid-difficulty board.
// Native "Through the Water" (from Shisima): on odd boards the gold cap must pass through the centre first.
// Also the branded-minigame template (§12.1): /b/<brand>/cap-drop/ loads skins/<brand>.json.
import M from './stage.json';
import { neighbors, solve, cfgFor, DAILY_CFG, generate, levelSeed, starsFor, centreOf } from './logic.js';
import { reduced, covered } from '../_lib/kit.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
// a challenge from a solo level is played on the same level and compared on moves, then time
C.stage({ ...M, challengePayload: (r, res) => (r.mode === 'solo' && res && res.detail ? { level: res.detail.level, h2hScore: res.detail.moves, h2hTiebreak: res.detail.secs } : null) });

const $ = (s) => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d');
const DEFAULT = { frame: '#2bb3a3', piece: '#1f4fa8', pieceHi: '#8fb8ff', special: '#d99a12', specialHi: '#fff1a8', drink: '#e8731a', drinkHi: '#ffb347' };
let PAL = { ...DEFAULT }, specialImg = null;

let S = null, run = null, P = null, pieces = [], cells = [];
let drop = null, fill = 0, bubbles = [], hintMove = null, hintUntil = 0, focus = 0;

function paintHud() {
  if (!S) return;
  $('#lvl').textContent = S.mode === 'solo' ? t('kf_level', { n: S.level }) : C.L(M.title);
  $('#par').textContent = t('kf_par', { n: P.par }) + (S.native && centreOf(P.n) >= 0 && !S.visited ? ` · ${t('kf_water')}` : '');
  $('#moves').textContent = S.moves;
  $('#movesLbl').textContent = t('kf_moves', { n: '' }).trim();
  $('#hintN').textContent = S.hints;
}

/* ---------------- lifecycle ---------------- */
C.onPlay(async (ctx) => {
  run = await C.run.start(ctx);
  if (run.skin && run.skin.palette) {
    const p = run.skin.palette;
    PAL = { ...DEFAULT, frame: p.frame || DEFAULT.frame, piece: p.piece || DEFAULT.piece, pieceHi: p.piece ? shade(p.piece, 0.45) : DEFAULT.pieceHi, special: p.special || DEFAULT.special, specialHi: p.special ? shade(p.special, 0.6) : DEFAULT.specialHi, drink: p.drink || DEFAULT.drink, drinkHi: p.drink ? shade(p.drink, 0.4) : DEFAULT.drinkHi };
    if (run.skin.specialIcon && !specialImg) { specialImg = new Image(); specialImg.src = `/g/cap-drop/skins/${run.skin.specialIcon}`; }
  }
  const native = run.variant === 'native';
  let level = C.store.get('level:cap-drop', 1);
  const payload = run.challenge && run.challenge.payload;
  if (run.mode === 'solo') P = generate(levelSeed(level) + (native ? '-n' : ''), cfgFor(level), native);
  else if (payload && payload.level) { level = payload.level; P = generate(levelSeed(level) + (native ? '-n' : ''), cfgFor(level), native); }
  else P = generate(run.seed, native ? { ...DAILY_CFG, n: 5, lo: 12 } : DAILY_CFG, native);
  S = { mode: run.mode, level, native, moves: 0, hints: M.tunables.hints, visited: false, t0: performance.now(), playing: true, startS: P.s };
  loadBoard();
  $('#tip').textContent = level === 1 && run.mode === 'solo' ? t('kf_first') : '';
  cv.focus({ preventScroll: true });
});
C.onQuit(() => { S = null; });
// spec 2 §4 forceEnd: time's up before the gold cap dropped: not solved (0 stars)
C.onForceEnd(() => { if (S && S.playing && !drop) unsolved(); });
function loadBoard() {
  const N = P.n * P.n;
  cells = new Array(N).fill(-1); pieces = [];
  for (let i = 0; i < N; i++) {
    if (P.E.includes(i)) continue;
    const id = pieces.length;
    pieces.push({ id, cell: i, gold: i === P.s, ax: i % P.n, ay: (i / P.n) | 0 });
    cells[i] = id;
  }
  S.visited = P.s === centreOf(P.n);
  S.moves = 0; drop = null; fill = 0; bubbles = []; hintMove = null; S.playing = true;
  focus = pieces.find((p) => p.gold).cell;
  layout(); paintHud();
}
$('#restart').onclick = () => { if (S && !drop) { C.audio.ensure(); S.hints = M.tunables.hints; loadBoard(); run.event('restart'); } };
$('#hintBtn').onclick = () => {
  if (!S || !S.playing || drop) return;
  C.audio.ensure();
  if (S.hints <= 0) { $('#tip').textContent = t('kf_nohint'); return; }
  const s = solve(P.n, goldCell(), emptyCells(), { native: S.native, visited: S.visited });
  if (!s.first) return;
  hintMove = s.first; hintUntil = performance.now() + 3500; S.hints--; paintHud(); C.audio.tone(880, 1320, 0.14, 'sine', 0.13);
  $('#tip').textContent = t('kf_away', { n: s.dist });
};

/* ---------------- layout ---------------- */
let W = 0, H = 0, dpr = 1, cell = 80, bx = 0, by = 0, TT = 12, pad = 10, glass = {};
function layout() {
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!P) return;
  const n = P.n;
  const size = Math.min(W * 0.84, 400, (H - 40) / (1 + 1.75 / n));
  cell = size / n; TT = Math.max(8, cell * 0.15); pad = TT * 0.75;
  bx = (W - size) / 2; by = Math.max(16, (H - size - cell * 1.75 - 10) / 2);
  const ex = bx + (n - 0.5) * cell, chuteBot = by + size + pad + cell * 0.35;
  const gh = Math.min(cell * 1.25, H - chuteBot - 12), gw = Math.min(cell * 0.95, gh * 0.85);
  glass = { x: ex, top: chuteBot + 4, h: gh, w: gw };
}
new ResizeObserver(layout).observe(cv);
const px = (i) => bx + ((i % P.n) + 0.5) * cell, py = (i) => by + (((i / P.n) | 0) + 0.5) * cell;
const goldCell = () => pieces.find((p) => p.gold).cell;
const emptyCells = () => cells.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);

/* ---------------- moves ---------------- */
function tryMove(id, dir) {
  if (!S || !S.playing || drop) return;
  const p = pieces[id], n = P.n, opts = neighbors(p.cell, n).filter((c) => cells[c] === -1);
  if (!opts.length) { sfx.bonk(); p.shake = performance.now(); return; }
  let to = null;
  if (dir) {
    const x = p.cell % n, y = (p.cell / n) | 0;
    const tt = dir === 'l' ? (x > 0 ? p.cell - 1 : -1) : dir === 'r' ? (x < n - 1 ? p.cell + 1 : -1) : dir === 'u' ? (y > 0 ? p.cell - n : -1) : y < n - 1 ? p.cell + n : -1;
    if (tt >= 0 && cells[tt] === -1) to = tt;
  }
  if (to === null) {
    if (dir && opts.length > 1) { sfx.bonk(); p.shake = performance.now(); return; }
    const exit = n * n - 1;
    to = p.gold && opts.includes(exit) && (!needsWater() || S.visited) ? exit : opts[0];
    if (opts.length > 1 && !dir) {
      const best = solve(n, goldCell(), emptyCells(), { native: S.native, visited: S.visited }).first;
      if (best && best.from === p.cell && opts.includes(best.to)) to = best.to;
    }
  }
  const from = p.cell;
  cells[p.cell] = -1; cells[to] = id; p.cell = to; S.moves++; hintMove = null; focus = to;
  run.input(`${from}>${to}`, S.moves);
  if (S.moves === 1) run.firstAtom();
  sfx.slide(); $('#tip').textContent = '';
  if (p.gold && to === centreOf(n) && S.native && !S.visited) { S.visited = true; $('#tip').textContent = t('kf_wet'); C.audio.chord([520, 780], 0.06, 0.15); }
  paintHud();
  C.ui.announce(t('kf_slid', { n: S.moves }));
  if (p.gold && to === n * n - 1 && (!needsWater() || S.visited)) {
    S.playing = false;
    setTimeout(() => { drop = { t0: performance.now(), id }; sfx.drop(); }, 170);
  }
}
const needsWater = () => S.native && centreOf(P.n) >= 0;

async function win() {
  const secs = Math.round((performance.now() - S.t0) / 100) / 10;
  const stars = starsFor(S.moves, P.par);
  sfx.win();
  const solvedTxt = S.moves <= P.par ? t('kf_perfect', { p: P.par }) : t('kf_solved', { m: S.moves, p: P.par });
  const label = S.moves === 1 ? t('kf_one_move') : t('kf_moves', { n: S.moves });
  const level = run.challenge && run.challenge.payload && run.challenge.payload.level;
  if (S.mode === 'solo') {
    const prev = C.store.get('stars:cap-drop', {});
    if ((prev[S.level] || 0) < stars) { prev[S.level] = stars; C.store.set('stars:cap-drop', prev); }
    C.store.set('level:cap-drop', S.level + 1);
    await run.finish({
      score: S.level, tiebreak: secs, detail: { level: S.level, moves: S.moves, par: P.par, secs, solved: true },
      scoreLabel: run.skin && run.skin.copy && run.skin.copy.win ? run.skin.copy.win : label, bestPossible: P.par,
      sub: `${t('kf_level', { n: S.level })} · ${solvedTxt}`,
    });
  } else {
    await run.finish({
      score: S.moves, tiebreak: secs, detail: { moves: S.moves, par: P.par, secs, solved: true, level: level || undefined },
      scoreLabel: label, bestPossible: P.par, sub: solvedTxt,
    });
  }
}
/** Not solved in time: 0 stars. A solo run scores the last level passed; a seeded board scores the worst. */
async function unsolved() {
  S.playing = false;
  const secs = Math.round((performance.now() - S.t0) / 100) / 10;
  const level = run.challenge && run.challenge.payload && run.challenge.payload.level;
  await run.finish(S.mode === 'solo'
    ? { score: Math.max(0, S.level - 1), tiebreak: secs, detail: { level: S.level, moves: S.moves, par: P.par, secs, solved: false }, scoreLabel: t('kf_unsolved'), sub: t('kf_level', { n: S.level }) }
    : { score: 999, tiebreak: secs, detail: { moves: S.moves, par: P.par, secs, solved: false, level: level || undefined }, scoreLabel: t('kf_unsolved'), sub: t('kf_unsolved_sub', { p: P.par }) });
}

/* ---------------- input ---------------- */
let down = null;
function cellAt(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const cx = Math.floor((x - bx) / cell), cy = Math.floor((y - by) / cell);
  if (!P || cx < 0 || cy < 0 || cx >= P.n || cy >= P.n) return -1;
  return cy * P.n + cx;
}
cv.addEventListener('pointerdown', (e) => { C.audio.ensure(); const c = cellAt(e); down = { c, x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('pointerup', (e) => {
  if (!down) return; const d = down; down = null;
  if (d.c < 0 || cells[d.c] === -1) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y; let dir = null;
  if (Math.hypot(dx, dy) > 22) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u';
  tryMove(cells[d.c], dir);
});
cv.addEventListener('pointercancel', () => { down = null; });
document.addEventListener('keydown', (e) => {
  if (!S || !P || C.isPaused() || document.querySelector('.sheet-wrap,.overlay.show')) return;
  const dirs = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
  const n = P.n;
  if (dirs[e.code]) {
    e.preventDefault();
    if (e.shiftKey) { if (cells[focus] >= 0) tryMove(cells[focus], dirs[e.code]); return; }
    const x = focus % n, y = (focus / n) | 0;
    const nx = Math.max(0, Math.min(n - 1, x + (e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : 0)));
    const ny = Math.max(0, Math.min(n - 1, y + (e.code === 'ArrowUp' ? -1 : e.code === 'ArrowDown' ? 1 : 0)));
    focus = ny * n + nx;
    const pc = cells[focus];
    C.ui.announce(pc === -1 ? 'Empty' : pieces[pc].gold ? 'Gold cap' : 'Cap');
  }
  if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement === cv) { e.preventDefault(); if (cells[focus] >= 0) tryMove(cells[focus], null); }
});

/* ---------------- sound ---------------- */
const sfx = {
  slide() { C.audio.tone(520, 380, 0.08, 'triangle', 0.12); },
  bonk() { C.audio.tone(150, 90, 0.12, 'square', 0.08); },
  drop() { C.audio.tone(900, 200, 0.35, 'sine', 0.14); C.audio.tone(400, 800, 0.2, 'triangle', 0.08, 0.3); },
  win() { C.audio.chord([523, 659, 784, 1047]); },
};

/* ---------------- drawing ---------------- */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (255 - c) * k);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function framePath() {
  const n = P.n, size = n * cell, L = bx - pad, R = bx + size + pad, Tp = by - pad, B = by + size + pad;
  const gl = bx + (n - 1) * cell - pad * 0.2, chute = cell * 0.35;
  ctx.beginPath(); ctx.moveTo(gl, B + chute); ctx.lineTo(gl, B); ctx.lineTo(L, B); ctx.lineTo(L, Tp); ctx.lineTo(R, Tp); ctx.lineTo(R, B + chute);
}
function drawFrame(now) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  framePath(); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = TT + 6; ctx.stroke();
  framePath(); ctx.strokeStyle = PAL.frame; ctx.lineWidth = TT; ctx.stroke();
  framePath(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = TT * 0.25; ctx.stroke();
  const n = P.n, centre = centreOf(n);
  for (let i = 0; i < n * n; i++) { ctx.beginPath(); ctx.arc(px(i), py(i), cell * 0.4, 0, 7); ctx.fillStyle = i === n * n - 1 ? 'rgba(255,204,51,.22)' : 'rgba(27,29,30,.07)'; ctx.fill(); }
  if (S && needsWater()) {
    const pulse = S.visited || reduced() ? 0 : 0.15 * Math.sin(now / 300);
    ctx.beginPath(); ctx.arc(px(centre), py(centre), cell * (0.46 + pulse * 0.1), 0, 7);
    ctx.strokeStyle = S.visited ? '#3FBF6A' : '#2f8fd8'; ctx.lineWidth = 4; ctx.setLineDash(S.visited ? [] : [6, 5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(47,143,216,.14)'; ctx.fill();
  }
  const e = n * n - 1; ctx.save(); ctx.strokeStyle = 'rgba(27,29,30,.35)'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.arc(px(e), py(e), cell * 0.4, 0, 7); ctx.stroke(); ctx.restore();
  ctx.fillStyle = 'rgba(27,29,30,.35)'; ctx.beginPath(); const ax = px(e), ay = py(e) + cell * 0.12, s = cell * 0.11;
  ctx.moveTo(ax - s, ay - s * 0.6); ctx.lineTo(ax + s, ay - s * 0.6); ctx.lineTo(ax, ay + s * 0.7); ctx.closePath(); ctx.fill();
}
function drawCap(x, y, r, gold, glow, wet) {
  ctx.save(); ctx.translate(x, y);
  if (glow) { ctx.beginPath(); ctx.arc(0, 0, r * 1.18, 0, 7); ctx.fillStyle = `rgba(63,191,106,${glow})`; ctx.fill(); }
  ctx.beginPath(); const teeth = 21;
  for (let i = 0; i < teeth * 2; i++) { const a = i / (teeth * 2) * Math.PI * 2, rr = i % 2 ? r * 0.93 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath();
  ctx.fillStyle = gold ? PAL.special : PAL.piece; ctx.fill(); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = Math.max(1.5, r * 0.05); ctx.stroke();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 0.82);
  if (gold) { g.addColorStop(0, PAL.specialHi); g.addColorStop(1, PAL.special); } else { g.addColorStop(0, PAL.pieceHi); g.addColorStop(1, PAL.piece); }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 7); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, 7); ctx.strokeStyle = wet ? 'rgba(47,143,216,.9)' : 'rgba(255,255,255,.45)'; ctx.lineWidth = r * (wet ? 0.1 : 0.06); ctx.stroke();
  if (gold) {
    if (specialImg && specialImg.complete && specialImg.naturalWidth) ctx.drawImage(specialImg, -r * 0.5, -r * 0.5, r, r);
    else {
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.18 : r * 0.42; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#b97c0a'; ctx.lineWidth = r * 0.05; ctx.stroke();
    }
  } else { ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.22, r * 0.1, -0.6, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill(); }
  ctx.restore();
}
function drawGlass(now) {
  const { x, top, h, w } = glass, bw = w * 0.78, bot = top + h;
  const xl = (y) => x - (w / 2 + (bw / 2 - w / 2) * ((y - top) / h)), xr = (y) => x + (w / 2 + (bw / 2 - w / 2) * ((y - top) / h));
  ctx.beginPath(); ctx.moveTo(xl(top), top); ctx.lineTo(xr(top), top); ctx.lineTo(xr(bot), bot); ctx.lineTo(xl(bot), bot); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fill();
  const inBot = bot - h * 0.08;
  if (fill > 0.002) {
    const ly = inBot - fill * (inBot - top - h * 0.08), wob = Math.sin(now / 170) * 1.5;
    ctx.beginPath(); ctx.moveTo(xl(ly) + 4, ly + wob); ctx.lineTo(xr(ly) - 4, ly - wob); ctx.lineTo(xr(inBot) - 4, inBot); ctx.lineTo(xl(inBot) + 4, inBot); ctx.closePath();
    const gr = ctx.createLinearGradient(0, ly, 0, inBot); gr.addColorStop(0, PAL.drinkHi); gr.addColorStop(1, PAL.drink); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const b of bubbles) if (b.y > ly) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(xl(top) + 8, top + 10); ctx.lineTo(xl(bot) + 8, bot - 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xl(top), top); ctx.lineTo(xl(bot), bot); ctx.lineTo(xr(bot), bot); ctx.lineTo(xr(top), top);
  ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, top, w / 2, 3.5, 0, 0, 7); ctx.lineWidth = 2.5; ctx.stroke();
}
// test hook for scripts/browser.mjs: plays one optimal move
window.__chezAuto = () => {
  if (!S || !S.playing || drop) return;
  const s = solve(P.n, goldCell(), emptyCells(), { native: S.native, visited: S.visited });
  if (s.first) tryMove(cells[s.first.from], null);
};

let last = performance.now();
function frame(now) {
  if (covered()) { last = now; requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (P && S) {
    drawGlass(now); drawFrame(now);
    const n = P.n, r = cell * 0.4;
    if (hintMove && now > hintUntil) hintMove = null;
    for (const p of pieces) {
      const tx = p.cell % n, ty = (p.cell / n) | 0, k = Math.min(1, dt * (reduced() ? 60 : 18));
      p.ax += (tx - p.ax) * k; p.ay += (ty - p.ay) * k;
      let x = bx + (p.ax + 0.5) * cell, y = by + (p.ay + 0.5) * cell;
      if (p.shake && now - p.shake < 260 && !reduced()) x += Math.sin((now - p.shake) / 20) * 4;
      if (drop && drop.id === p.id) {
        const tt = (now - drop.t0) / 1000, tgt = glass.top + glass.h * 0.5, y0 = py(n * n - 1), g = tt * tt * 1400;
        y = Math.min(y0 + g, tgt); const sc = y >= tgt ? Math.max(0, 1 - (tt - Math.sqrt((tgt - y0) / 1400)) * 4) : 1;
        if (sc <= 0) { if (!drop.done) { drop.done = true; drop.fillT = now; } continue; }
        drawCap(x, y, r * Math.max(0.35, Math.min(1, glass.w / (2 * r) * 0.9)) * sc, true, 0, S.visited && needsWater()); continue;
      }
      const glow = hintMove && hintMove.from === p.cell ? 0.35 + 0.25 * Math.sin(now / 140) : 0;
      drawCap(x, y, r, p.gold, glow, p.gold && S.visited && needsWater());
    }
    if (document.activeElement === cv && !drop) {
      ctx.strokeStyle = '#FFD21F'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px(focus), py(focus), cell * 0.47, 0, 7); ctx.stroke();
    }
    if (hintMove) {
      const a = { x: px(hintMove.from), y: py(hintMove.from) }, b = { x: px(hintMove.to), y: py(hintMove.to) };
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y), s = cell * 0.13;
      ctx.beginPath(); ctx.moveTo(mx + dx * s * 1.3, my + dy * s * 1.3); ctx.lineTo(mx - dx * s + dy * s, my - dy * s - dx * s); ctx.lineTo(mx - dx * s - dy * s, my - dy * s + dx * s); ctx.closePath();
      ctx.fillStyle = '#3fbf6a'; ctx.fill(); ctx.strokeStyle = '#1b1d1e'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (drop && drop.done) {
      const k = Math.min(1, (now - drop.fillT) / (reduced() ? 200 : 1100)); fill = 0.85 * (1 - Math.pow(1 - k, 3));
      if (bubbles.length < 26 && Math.random() < 0.6) bubbles.push({ x: glass.x + (Math.random() - 0.5) * glass.w * 0.6, y: glass.top + glass.h * 0.9, r: 1 + Math.random() * 2.2, v: 20 + Math.random() * 40 });
      if (k >= 1 && !drop.won) { drop.won = true; setTimeout(win, 350); }
    }
    for (const b of bubbles) { b.y -= b.v * dt; if (b.y < glass.top + glass.h * (0.92 - fill)) b.y = glass.top + glass.h * 0.9; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
