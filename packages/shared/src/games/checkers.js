/**
 * English draughts (8×8): dark squares only, captures are compulsory, multi-jumps continue with the same piece,
 * men reaching the far row become kings (and the turn ends). Red ('r') moves first, up the board.
 * Squares are 0–63 (row*8 + col, row 0 at red's side). Pieces: 'r', 'R' (king), 'b', 'B'.
 */
const dark = (i) => ((i >> 3) + (i & 7)) % 2 === 1;
const at = (r, c) => (r < 0 || r > 7 || c < 0 || c > 7 ? -1 : r * 8 + c);

export function initCheckers() {
  const board = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    if (!dark(i)) continue;
    if (i >> 3 <= 2) board[i] = 'r';
    else if (i >> 3 >= 5) board[i] = 'b';
  }
  return { board, turn: 'r', chain: null, result: null, sinceCapture: 0, last: null };
}

const side = (p) => p?.toLowerCase();
const dirsFor = (p) => (p === 'R' || p === 'B' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : p === 'r' ? [[1, 1], [1, -1]] : [[-1, 1], [-1, -1]]);

function jumpsFrom(board, i) {
  const p = board[i];
  const out = [];
  for (const [dr, dc] of dirsFor(p)) {
    const mid = at((i >> 3) + dr, (i & 7) + dc);
    const to = at((i >> 3) + 2 * dr, (i & 7) + 2 * dc);
    if (mid >= 0 && to >= 0 && board[mid] && side(board[mid]) !== side(p) && !board[to]) out.push({ from: i, to, capture: mid });
  }
  return out;
}

/** Legal moves for the side to move ({ from, to, capture? }). Captures are compulsory. */
export function checkersMoves(s) {
  if (s.result) return [];
  if (s.chain != null) return jumpsFrom(s.board, s.chain);
  const mine = [...s.board.keys()].filter((i) => side(s.board[i]) === s.turn);
  const jumps = mine.flatMap((i) => jumpsFrom(s.board, i));
  if (jumps.length) return jumps;
  return mine.flatMap((i) =>
    dirsFor(s.board[i])
      .map(([dr, dc]) => at((i >> 3) + dr, (i & 7) + dc))
      .filter((to) => to >= 0 && !s.board[to])
      .map((to) => ({ from: i, to })),
  );
}

export function checkersMove(s, who, move) {
  if (s.result) throw new Error('The game is over');
  if (who !== s.turn) throw new Error('Not your turn');
  const m = checkersMoves(s).find((x) => x.from === move.from && x.to === move.to);
  if (!m) throw new Error('Illegal move');
  const board = [...s.board];
  let p = board[m.from];
  board[m.from] = null;
  if (m.capture != null) board[m.capture] = null;
  const crowned = (p === 'r' && m.to >> 3 === 7) || (p === 'b' && m.to >> 3 === 0);
  if (crowned) p = p.toUpperCase();
  board[m.to] = p;
  const next = { ...s, board, last: { from: m.from, to: m.to }, sinceCapture: m.capture != null ? 0 : s.sinceCapture + 1, chain: null };
  // Keep jumping with the same piece if it can (unless it was just crowned).
  if (m.capture != null && !crowned && jumpsFrom(board, m.to).length) next.chain = m.to;
  else next.turn = s.turn === 'r' ? 'b' : 'r';
  if (next.chain == null) {
    if (!checkersMoves(next).length) next.result = { winner: s.turn, reason: 'no moves left' };
    else if (next.sinceCapture >= 80) next.result = { winner: null, reason: '40 moves without a capture' };
  }
  return next;
}
