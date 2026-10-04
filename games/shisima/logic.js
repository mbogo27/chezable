// Shisima rules (Chezability §13.2): an octagon with four diameters, nine points (0-7 perimeter, 8 = centre,
// the "water"). Each player has three pieces on adjacent perimeter points. A move is one step along a
// line into an empty point. Three in a row wins, and the line must run through the centre.
// The same position repeated three times is a draw (M38). Shared by the game, the AI and the Worker.
import { rng } from '../../packages/rng/rng.js';

export const CENTRE = 8;
export const ADJ = Array.from({ length: 9 }, (_, i) =>
  i === CENTRE ? [0, 1, 2, 3, 4, 5, 6, 7] : [(i + 1) % 8, (i + 7) % 8, CENTRE]
);
// winning lines: the four diameters through the centre
export const LINES = [[0, 8, 4], [1, 8, 5], [2, 8, 6], [3, 8, 7]];
export const MAX_PLIES = 80;

const posKey = (board, toMove) => board.join('') + toMove;

/** Daily seeded starting asymmetry (spec §7.9): one piece may start pre-advanced. */
export function initialState(seed) {
  const r = rng(seed, 'shisima');
  const board = Array(9).fill(0);
  const rot = Math.floor(r() * 8);
  // player 1 on three adjacent points, player 2 opposite
  for (const k of [0, 1, 2]) { board[(rot + k) % 8] = 1; board[(rot + 4 + k) % 8] = 2; }
  // asymmetry: on most seeds one of player 2's flank pieces starts one step along the rim
  if (r() < 0.75) {
    const flank = r() < 0.5 ? (rot + 4) % 8 : (rot + 6) % 8;
    const to = flank === (rot + 4) % 8 ? (rot + 3) % 8 : (rot + 7) % 8;
    if (board[to] === 0) { board[flank] = 0; board[to] = 2; }
  }
  return { board, toMove: 1, winner: 0, plies: 0, history: [], seen: { [posKey(board, 1)]: 1 } };
}

export function legalMoves(state, who = state.toMove) {
  const out = [];
  state.board.forEach((v, i) => { if (v === who) for (const j of ADJ[i]) if (state.board[j] === 0) out.push([i, j]); });
  return out;
}

export function lineWinner(board) {
  for (const [a, b, c] of LINES) if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  return 0;
}

/** Returns a new state. Throws on an illegal move. winner: 1, 2, or 3 for a draw. */
export function applyMove(state, move, who = state.toMove) {
  if (state.winner) throw new Error('game over');
  if (who !== state.toMove) throw new Error('not your turn');
  if (!Array.isArray(move) || move.length !== 2) throw new Error('bad move');
  const [from, to] = move.map(Number);
  if (!(from >= 0 && from < 9 && to >= 0 && to < 9)) throw new Error('bad move');
  if (state.board[from] !== who || state.board[to] !== 0 || !ADJ[from].includes(to)) throw new Error('illegal move');
  const board = state.board.slice();
  board[from] = 0; board[to] = who;
  const toMove = who === 1 ? 2 : 1;
  const seen = { ...state.seen };
  const k = posKey(board, toMove);
  seen[k] = (seen[k] || 0) + 1;
  let winner = lineWinner(board);
  const plies = state.plies + 1;
  if (!winner && (seen[k] >= 3 || plies >= MAX_PLIES)) winner = 3;
  if (!winner && legalMoves({ board }, toMove).length === 0) winner = 3;
  return { board, toMove, winner, plies, history: [...state.history, [from, to]].slice(-MAX_PLIES), seen };
}

/** Minimax with alpha-beta (the tree is tiny). depth trades strength for kindness. */
export function bestMove(state, depth = 6, r = Math.random) {
  const me = state.toMove;
  function score(s, d, alpha, beta) {
    if (s.winner === me) return 100 + d;
    if (s.winner === 3) return 0;
    if (s.winner) return -100 - d;
    if (d === 0) return heuristic(s.board, me);
    const moves = legalMoves(s);
    if (s.toMove === me) {
      let v = -Infinity;
      for (const m of moves) { v = Math.max(v, score(applyMove(s, m), d - 1, alpha, beta)); alpha = Math.max(alpha, v); if (alpha >= beta) break; }
      return v;
    }
    let v = Infinity;
    for (const m of moves) { v = Math.min(v, score(applyMove(s, m), d - 1, alpha, beta)); beta = Math.min(beta, v); if (alpha >= beta) break; }
    return v;
  }
  let best = [], bv = -Infinity;
  for (const m of legalMoves(state)) {
    const v = score(applyMove(state, m), depth - 1, -Infinity, Infinity);
    if (v > bv) { bv = v; best = [m]; } else if (v === bv) best.push(m);
  }
  return best.length ? best[Math.floor(r() * best.length)] : null;
}
function heuristic(board, me) {
  const opp = me === 1 ? 2 : 1;
  let h = 0;
  if (board[CENTRE] === me) h += 6; else if (board[CENTRE] === opp) h -= 6;
  for (const [a, , c] of LINES) {
    if (board[CENTRE] === me && (board[a] === me || board[c] === me) && (board[a] === 0 || board[c] === 0)) h += 3;
    if (board[CENTRE] === opp && (board[a] === opp || board[c] === opp) && (board[a] === 0 || board[c] === 0)) h -= 3;
  }
  return h;
}
