import { rng } from './rng.js';

/**
 * Ludo for 2–4 players. Each player has 4 tokens. Token progress: -1 = in base, 0–50 = on the shared track
 * (relative to their own start), 51–55 = their home column, 56 = home. Roll a 6 to leave base; a 6 (or a capture,
 * or getting a token home) earns another roll; three 6s in a row forfeit the turn. Captures send tokens to base,
 * except on safe squares (every start square and the star 8 steps after it). First to get all four home wins.
 */
export const LUDO_START = [0, 13, 26, 39];
export const LUDO_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const LUDO_HOME = 56;
/** Two players sit opposite each other (corners 0 and 2); 3–4 players take the corners in order. */
export const ludoCorner = (n, seat) => (n === 2 ? [0, 2][seat] : seat);
/** Absolute track square for a seat's token progress (only for 0–50). */
export const ludoSquare = (seat, p, n = 4) => (LUDO_START[ludoCorner(n, seat)] + p) % 52;

export function initLudo(n, seed) {
  return { seed, rolls: 0, n, tokens: Array.from({ length: n }, () => [-1, -1, -1, -1]), turn: 0, phase: 'roll', die: null, sixes: 0, last: null, result: null };
}

/** Which of the seat's tokens can move with the current die. */
export function ludoMovable(s, seat = s.turn) {
  if (s.phase !== 'move' || s.die == null) return [];
  return s.tokens[seat]
    .map((p, i) => [p, i])
    .filter(([p]) => (p === -1 ? s.die === 6 : p !== LUDO_HOME && p + s.die <= LUDO_HOME))
    .map(([, i]) => i);
}

function nextTurn(s) {
  s.turn = (s.turn + 1) % s.n;
  s.sixes = 0;
  s.phase = 'roll';
  s.die = null;
}

export function ludoMove(s0, seat, a) {
  if (s0.result) throw new Error('The game is over');
  if (seat !== s0.turn) throw new Error('Not your turn');
  const s = structuredClone(s0);
  if (a.type === 'roll') {
    if (s.phase !== 'roll') throw new Error('Move a token first');
    s.die = 1 + rng(s.seed + ++s.rolls * 7349).int(6);
    s.sixes = s.die === 6 ? s.sixes + 1 : 0;
    s.last = { seat, roll: s.die };
    if (s.sixes === 3) {
      s.last.note = 'Three 6s — turn lost';
      nextTurn(s);
      return s;
    }
    s.phase = 'move';
    if (!ludoMovable(s).length) {
      s.last.note = 'No moves';
      if (s.die === 6) (s.phase = 'roll'), (s.die = null);
      else nextTurn(s);
    }
    return s;
  }
  if (a.type !== 'move') throw new Error('Unknown action');
  const t = Number(a.token);
  if (!ludoMovable(s).includes(t)) throw new Error('That token can’t move');
  const from = s.tokens[seat][t];
  const to = from === -1 ? 0 : from + s.die;
  s.tokens[seat][t] = to;
  let bonus = s.die === 6 || to === LUDO_HOME;
  s.last = { seat, token: t, from, to, roll: s.die };
  if (to <= 50) {
    const sq = ludoSquare(seat, to, s.n);
    if (!LUDO_SAFE.has(sq))
      for (let o = 0; o < s.n; o++) {
        if (o === seat) continue;
        s.tokens[o] = s.tokens[o].map((p) => {
          if (p >= 0 && p <= 50 && ludoSquare(o, p, s.n) === sq) {
            bonus = true;
            s.last.captured = [...(s.last.captured ?? []), o];
            return -1;
          }
          return p;
        });
      }
  }
  if (s.tokens[seat].every((p) => p === LUDO_HOME)) {
    s.result = { winners: [seat], reason: 'all four tokens home' };
    return s;
  }
  if (bonus) (s.phase = 'roll'), (s.die = null);
  else nextTurn(s);
  return s;
}

export function ludoTimeout(s) {
  if (s.phase === 'roll') return ludoMove(s, s.turn, { type: 'roll' });
  const m = ludoMovable(s);
  return ludoMove(s, s.turn, { type: 'move', token: m.sort((a, b) => s.tokens[s.turn][b] - s.tokens[s.turn][a])[0] });
}
export const ludoView = (s) => {
  const { seed, ...rest } = s;
  return { ...rest, movable: ludoMovable(s) };
};
