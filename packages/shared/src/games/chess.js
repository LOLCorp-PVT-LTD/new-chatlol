/**
 * Chess rules: legal moves (castling, en passant, promotion), check, checkmate, stalemate and insufficient
 * material. Squares are 0–63, a1 = 0, h1 = 7, a8 = 56. Pieces are 'wP', 'bK', …
 */
const BACK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
const file = (i) => i & 7;
const rank = (i) => i >> 3;
const sq = (f, r) => (f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f);
export const squareName = (i) => 'abcdefgh'[file(i)] + (rank(i) + 1);

export function initChess() {
  const board = Array(64).fill(null);
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = `w${BACK[f]}`;
    board[sq(f, 1)] = 'wP';
    board[sq(f, 6)] = 'bP';
    board[sq(f, 7)] = `b${BACK[f]}`;
  }
  return { board, turn: 'w', castling: { wK: true, wQ: true, bK: true, bQ: true }, ep: null, halfmove: 0, result: null, last: null };
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Is square `i` attacked by side `by`? */
function attacked(board, i, by) {
  const f = file(i);
  const r = rank(i);
  const at = (ff, rr) => board[sq(ff, rr)] ?? null;
  const dir = by === 'w' ? -1 : 1; // pawns of `by` sit one rank behind the square they attack
  for (const df of [-1, 1]) if (sq(f + df, r + dir) >= 0 && at(f + df, r + dir) === `${by}P`) return true;
  for (const [df, dr] of KNIGHT) if (sq(f + df, r + dr) >= 0 && at(f + df, r + dr) === `${by}N`) return true;
  for (const [df, dr] of KING) if (sq(f + df, r + dr) >= 0 && at(f + df, r + dr) === `${by}K`) return true;
  const slide = (dirs, kinds) =>
    dirs.some(([df, dr]) => {
      for (let k = 1; k < 8; k++) {
        const t = sq(f + df * k, r + dr * k);
        if (t < 0) return false;
        const p = board[t];
        if (p) return p[0] === by && kinds.includes(p[1]);
      }
      return false;
    });
  return slide(ROOK, 'RQ') || slide(BISHOP, 'BQ');
}

const kingSquare = (board, side) => board.indexOf(`${side}K`);
export const inCheck = (s, side = s.turn) => attacked(s.board, kingSquare(s.board, side), side === 'w' ? 'b' : 'w');

/** Pseudo-legal moves for the side to move (may leave the king in check). */
function pseudo(s) {
  const { board, turn } = s;
  const foe = turn === 'w' ? 'b' : 'w';
  const out = [];
  const add = (from, to, extra = {}) => {
    if (board[from][1] === 'P' && (rank(to) === 7 || rank(to) === 0)) for (const promo of 'QRBN') out.push({ from, to, promo, ...extra });
    else out.push({ from, to, ...extra });
  };
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p[0] !== turn) continue;
    const f = file(i);
    const r = rank(i);
    const kind = p[1];
    if (kind === 'P') {
      const d = turn === 'w' ? 1 : -1;
      const one = sq(f, r + d);
      if (one >= 0 && !board[one]) {
        add(i, one);
        const two = sq(f, r + 2 * d);
        if ((turn === 'w' ? r === 1 : r === 6) && !board[two]) add(i, two, { double: true });
      }
      for (const df of [-1, 1]) {
        const t = sq(f + df, r + d);
        if (t < 0) continue;
        if (board[t]?.[0] === foe) add(i, t);
        else if (t === s.ep) add(i, t, { enPassant: true });
      }
    } else if (kind === 'N' || kind === 'K') {
      for (const [df, dr] of kind === 'N' ? KNIGHT : KING) {
        const t = sq(f + df, r + dr);
        if (t >= 0 && board[t]?.[0] !== turn) add(i, t);
      }
      if (kind === 'K' && !attacked(board, i, foe)) {
        const home = turn === 'w' ? 0 : 7;
        if (r === home && f === 4) {
          if (s.castling[`${turn}K`] && !board[sq(5, home)] && !board[sq(6, home)] && board[sq(7, home)] === `${turn}R` && !attacked(board, sq(5, home), foe))
            add(i, sq(6, home), { castle: 'K' });
          if (s.castling[`${turn}Q`] && !board[sq(3, home)] && !board[sq(2, home)] && !board[sq(1, home)] && board[sq(0, home)] === `${turn}R` && !attacked(board, sq(3, home), foe))
            add(i, sq(2, home), { castle: 'Q' });
        }
      }
    } else {
      const dirs = kind === 'R' ? ROOK : kind === 'B' ? BISHOP : [...ROOK, ...BISHOP];
      for (const [df, dr] of dirs)
        for (let k = 1; k < 8; k++) {
          const t = sq(f + df * k, r + dr * k);
          if (t < 0 || board[t]?.[0] === turn) break;
          add(i, t);
          if (board[t]) break;
        }
    }
  }
  return out;
}

function apply(s, m) {
  const board = [...s.board];
  const p = board[m.from];
  const captured = m.enPassant ? board[m.to + (s.turn === 'w' ? -8 : 8)] : board[m.to];
  board[m.to] = m.promo ? `${s.turn}${m.promo}` : p;
  board[m.from] = null;
  if (m.enPassant) board[m.to + (s.turn === 'w' ? -8 : 8)] = null;
  if (m.castle) {
    const home = s.turn === 'w' ? 0 : 7;
    const [rf, rt] = m.castle === 'K' ? [7, 5] : [0, 3];
    board[sq(rt, home)] = board[sq(rf, home)];
    board[sq(rf, home)] = null;
  }
  const castling = { ...s.castling };
  if (p[1] === 'K') castling[`${s.turn}K`] = castling[`${s.turn}Q`] = false;
  for (const [corner, right] of [[0, 'wQ'], [7, 'wK'], [56, 'bQ'], [63, 'bK']]) if (m.from === corner || m.to === corner) castling[right] = false;
  return {
    ...s,
    board,
    turn: s.turn === 'w' ? 'b' : 'w',
    castling,
    ep: m.double ? (m.from + m.to) / 2 : null,
    halfmove: p[1] === 'P' || captured ? 0 : s.halfmove + 1,
    last: { from: m.from, to: m.to },
  };
}

/** Every legal move for the side to move. */
export function legalMoves(s) {
  if (s.result) return [];
  return pseudo(s).filter((m) => !inCheck(apply(s, m), s.turn));
}

function insufficient(board) {
  const left = board.filter((p) => p && p[1] !== 'K');
  return left.length === 0 || (left.length === 1 && 'BN'.includes(left[0][1]));
}

/** Plays a move ({ from, to, promo? }) for `side`. Throws on an illegal move. Sets `result` when the game ends. */
export function chessMove(s, side, move) {
  if (s.result) throw new Error('The game is over');
  if (side !== s.turn) throw new Error('Not your turn');
  const m = legalMoves(s).find((x) => x.from === move.from && x.to === move.to && (x.promo ?? null) === (x.promo ? (move.promo ?? 'Q') : null));
  if (!m) throw new Error('Illegal move');
  const next = apply(s, m);
  const replies = legalMoves(next);
  if (!replies.length) next.result = inCheck(next) ? { winner: side, reason: 'checkmate' } : { winner: null, reason: 'stalemate' };
  else if (insufficient(next.board)) next.result = { winner: null, reason: 'insufficient material' };
  else if (next.halfmove >= 100) next.result = { winner: null, reason: '50-move rule' };
  return next;
}
