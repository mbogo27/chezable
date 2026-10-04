// Shisima: move your three water bugs to make a line through the centre (spec §7.9, Chezability S-7).
// Solo and daily play Mzee (a minimax AI); pass the phone is local; "play a friend by link" is
// correspondence play: each move goes to the Worker, which checks it with the same rules (logic.js).
import M from './stage.json';
import { ADJ, CENTRE, initialState, legalMoves, applyMove, bestMove } from './logic.js';

const C = window.Chez;
const t = (k, v) => C.t(k, v);
const esc = C.ui.esc;
C.stage(M);

const $ = (s) => document.querySelector(s);
const board = $('#board'), actions = $('#actions');
const POS = Array.from({ length: 9 }, (_, i) => (i === CENTRE ? { x: 50, y: 50 } : { x: 50 + 41 * Math.sin((i * Math.PI) / 4), y: 50 - 41 * Math.cos((i * Math.PI) / 4) }));
const COLORS = { 1: '#F26B1D', 2: '#2F8FD8' };

let S = null, run = null, pollTimer = null;

/* ---------------- board ---------------- */
function bugSvg(p) {
  return `<svg class="bug" viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="22" rx="11" ry="14" fill="${COLORS[p]}" stroke="#1B1D1E" stroke-width="3"/>
    <path d="M9 14 3 8M31 14l6-6M8 22H2M32 22h6M9 30l-5 5M31 30l5 5" stroke="#1B1D1E" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="20" cy="9" r="6" fill="#1B1D1E"/><path d="M20 12v20" stroke="rgba(0,0,0,.35)" stroke-width="2"/></svg>`;
}
function buildBoard() {
  const lines = [];
  for (let i = 0; i < 8; i++) lines.push(`<line x1="${POS[i].x}" y1="${POS[i].y}" x2="${POS[(i + 1) % 8].x}" y2="${POS[(i + 1) % 8].y}"/>`);
  for (let i = 0; i < 4; i++) lines.push(`<line x1="${POS[i].x}" y1="${POS[i].y}" x2="${POS[i + 4].x}" y2="${POS[i + 4].y}"/>`);
  board.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="${POS.slice(0, 8).map((p) => `${p.x},${p.y}`).join(' ')}" fill="#F7EBD3" stroke="#1B1D1E" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="12" fill="#BFE3F7" stroke="#2F8FD8" stroke-width="1.6"/>
    <g stroke="#1B1D1E" stroke-width="1.6" stroke-linecap="round">${lines.join('')}</g></svg>`
    + POS.map((p, i) => `<button class="pt" data-i="${i}" aria-label="${i === CENTRE ? t('sh_centre') : t('sh_point', { p: i + 1 })}" style="left:${p.x}%;top:${p.y}%"></button>`).join('');
}
buildBoard();
function paint() {
  if (!S) return;
  const st = S.state, sel = S.sel;
  const targets = sel >= 0 ? ADJ[sel].filter((j) => st.board[j] === 0) : [];
  const last = st.history[st.history.length - 1] || [];
  board.querySelectorAll('.pt').forEach((b) => {
    const i = +b.dataset.i, v = st.board[i];
    b.className = `pt${v ? ' p' + v : ''}${i === sel ? ' sel' : ''}${targets.includes(i) ? ' target' : ''}${i === last[1] ? ' last' : ''}`;
    b.innerHTML = v ? bugSvg(v) : '';
    const owner = v === 0 ? t('sh_empty') : v === S.me ? t('sh_mine') : t('sh_theirs');
    b.setAttribute('aria-label', `${i === CENTRE ? t('sh_centre') : t('sh_point', { p: i + 1 })}: ${owner}`);
    b.setAttribute('aria-pressed', String(i === sel));
  });
  const myTurn = !st.winner && isMyTurn();
  $('#turn').textContent = st.winner ? '' : myTurn ? t('sh_your_move') : t('sh_turn_of', { name: nameOf(st.toMove) });
  $('#sub').textContent = t('sh_moves', { n: st.plies });
  $('#who').innerHTML = `<span style="color:${COLORS[S.me]}">●</span> ${esc(nameOf(S.me))}`;
}
const nameOf = (p) => (S.mode === 'pass' ? S.names[p - 1] : p === S.me ? t('sh_you') : S.mode === 'turn' ? S.oppName || t('anon') : t('sh_ai'));
const isMyTurn = () => S.mode === 'pass' || S.state.toMove === S.me;

board.addEventListener('click', (e) => {
  const b = e.target.closest('.pt');
  if (!b || !S || S.state.winner || S.busy || !isMyTurn()) return;
  C.audio.ensure();
  const i = +b.dataset.i, st = S.state, who = st.toMove;
  if (st.board[i] === who) { S.sel = S.sel === i ? -1 : i; paint(); C.ui.announce(S.sel >= 0 ? t('sh_where') : t('sh_pick')); b.focus(); return; }
  if (S.sel >= 0 && st.board[i] === 0 && ADJ[S.sel].includes(i)) makeMove([S.sel, i]);
});

/* ---------------- moves ---------------- */
async function makeMove(mv) {
  const who = S.state.toMove;
  S.state = applyMove(S.state, mv, who);
  S.sel = -1;
  C.audio.tone(520, 380, 0.08, 'triangle', 0.12);
  if (run) { run.input(`${mv[0]}>${mv[1]}`, S.state.plies); if (S.state.plies === 1) run.firstAtom(); }
  paint();
  C.ui.announce(`${nameOf(who)}: ${mv[0] + 1} → ${mv[1] === CENTRE ? t('sh_centre') : mv[1] + 1}`);
  if (S.mode === 'turn') return sendTurn(mv);
  if (S.state.winner) return end();
  if (S.mode !== 'pass') {
    S.busy = true; paint();
    await new Promise((r) => setTimeout(r, window.__chezFast ? 10 : 550));
    if (!S) return;
    const ai = bestMove(S.state, M.tunables.aiDepth, S.aiRng);
    S.busy = false;
    if (ai) { S.state = applyMove(S.state, ai, S.state.toMove); C.audio.tone(380, 300, 0.08, 'triangle', 0.1); paint(); C.ui.announce(`${t('sh_ai')}: ${ai[0] + 1} → ${ai[1] === CENTRE ? t('sh_centre') : ai[1] + 1}`); }
    if (S.state.winner) return end();
  }
  focusFirst();
}
function focusFirst() {
  const mine = board.querySelector(`.pt.p${S.state.toMove}`);
  if (mine && document.activeElement && !board.contains(document.activeElement)) mine.focus({ preventScroll: true });
}
async function end() {
  const w = S.state.winner;
  const head = w === 3 ? t('sh_draw') : S.mode === 'pass' ? t('wins', { name: nameOf(w) }) : w === S.me ? t('sh_win') : t('sh_lose', { name: nameOf(w) });
  C.ui.announce(head);
  if (w === S.me) C.audio.chord([523, 659, 784, 1047]);
  if (S.mode === 'turn') {
    actions.innerHTML = `<p><b>${esc(head)}</b></p><a class="btn" href="/g/shisima/">${esc(t('sh_again'))}</a>`;
    return;
  }
  if (S.mode === 'pass') {
    const pts = (p) => (w === 3 ? 1 : w === p ? 3 : 0);
    return run.finish({ score: Math.max(pts(1), pts(2)), detail: { players: [{ name: S.names[0], score: pts(1) }, { name: S.names[1], score: pts(2) }], plies: S.state.plies } });
  }
  const score = w === 3 ? 1 : w === S.me ? 3 : 0;
  await run.finish({
    score, tiebreak: S.state.plies, display: head,
    detail: { result: w === 3 ? 'draw' : w === S.me ? 'win' : 'loss', plies: S.state.plies },
    sub: t('sh_moves', { n: S.state.plies }),
    share: { line: w === S.me ? t('sh_line_win', { n: S.state.plies }) : t('sh_line'), grid: run.mode === 'daily' ? (w === S.me ? '💧💧💧' : w === 3 ? '💧〰️💧' : '🪲') + ` ${S.state.plies}` : undefined, head: 'Shisima' },
  });
}

/* ---------------- correspondence play ---------------- */
async function sendTurn(mv) {
  S.busy = true; paint();
  try {
    const res = await C.api('POST', `/challenge/${S.cid}/move`, { move: mv });
    S.state = res.state; S.busy = false; paint();
    if (S.state.winner) return end();
    showWaiting(true);
  } catch (e) {
    S.busy = false;
    C.ui.toast(e.offline ? t('challenge_need_net') : t('error_generic'));
    await refreshTurn();
  }
}
function showWaiting(justMoved) {
  actions.innerHTML = `<p>${esc(t('sh_waiting', { name: S.oppName || t('anon') }))}</p>
    <button class="btn blue" data-share>${esc(t('sh_send'))}</button><button class="btn alt" data-refresh>${esc(t('sh_refresh'))}</button>`;
  actions.querySelector('[data-share]').onclick = () => C.share({ text: `${t('sh_share_turn')}`, url: S.url, game: M.id, kind: 'turn' });
  actions.querySelector('[data-refresh]').onclick = refreshTurn;
  if (justMoved && S.state.plies <= 1) C.share({ text: t('sh_share_turn'), url: S.url, game: M.id, kind: 'turn' });
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden) refreshTurn(); }, 8000);
}
async function refreshTurn() {
  if (!S || S.mode !== 'turn') return;
  try {
    const c = await C.api('GET', '/challenge/' + S.cid);
    S.state = c.state; S.oppName = S.me === 1 ? (c.opponent && c.opponent.name) : (c.creator && c.creator.name);
    paint();
    if (S.state.winner) { clearInterval(pollTimer); return end(); }
    if (c.yourTurn) { clearInterval(pollTimer); actions.innerHTML = `<p><b>${esc(t('sh_your_move'))}</b></p>`; C.ui.announce(t('sh_your_move')); C.audio.chord([660, 880], 0.08, 0.15); focusFirst(); }
  } catch (e) {}
}
async function startTurn(ctx) {
  clearInterval(pollTimer);
  actions.innerHTML = '';
  let c = ctx.challenge;
  if (!c) {
    try {
      const made = await C.api('POST', '/challenge', { kind: 'turn', game: M.id });
      C.track('challenge.create', { kind: 'turn' }, M.id);
      c = { id: made.id, url: made.url, state: made.state, youAre: 1, yourTurn: true, creator: { id: C.player().id, name: C.player().name }, opponent: null };
      actions.innerHTML = `<p>${esc(t('sh_created'))}</p>`;
    } catch (e) { C.ui.toast(e.offline ? t('challenge_need_net') : t('error_generic')); C.showMenu(); return; }
  } else {
    C.track('challenge.accept', { kind: 'turn' }, M.id);
  }
  const me = c.youAre || (c.creator && c.creator.id === C.player().id ? 1 : 2);
  S = { mode: 'turn', state: c.state, me, sel: -1, cid: c.id, url: c.url, oppName: me === 1 ? c.opponent && c.opponent.name : c.creator && c.creator.name, busy: false };
  paint();
  if (S.state.winner) return end();
  if (c.yourTurn || (S.state.toMove === me && me === 1)) { if (!actions.innerHTML) actions.innerHTML = `<p><b>${esc(t('sh_your_move'))}</b></p>`; focusFirst(); }
  else showWaiting(false);
}

/* ---------------- lifecycle ---------------- */
C.onPlay(async (ctx) => {
  clearInterval(pollTimer);
  actions.innerHTML = '';
  if (ctx.mode === 'turn') { run = null; return startTurn(ctx); }
  run = await C.run.start(ctx);
  S = { mode: run.mode, state: initialState(run.seed), me: 1, sel: -1, aiRng: run.stream('ai'), busy: false, names: run.players || [t('player_n', { n: 1 }), t('player_n', { n: 2 })] };
  paint(); focusFirst();
});
C.onQuit(() => { clearInterval(pollTimer); S = null; });

// test hook for scripts/browser.mjs: plays a sensible move for whoever is to move
window.__chezAuto = () => {
  window.__chezFast = true;
  if (!S || S.busy || S.state.winner || !isMyTurn()) return;
  const mv = bestMove(S.state, 2) || legalMoves(S.state)[0];
  if (mv) makeMove(mv);
};
