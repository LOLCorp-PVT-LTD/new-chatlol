import { rng } from './rng.js';

/**
 * Backgammon (no doubling cube). `points[1..24]`: positive = white checkers, negative = black. White (seat 0)
 * moves 24 → 1 and bears off below 1; black (seat 1) moves 1 → 24 and bears off past 24. Roll, then move one
 * checker per die (doubles = four moves). Entering from the bar comes first. When no die can be used the turn
 * passes. First to bear off all 15 wins.
 */
export function initBackgammon(seed) {
  const points = Array(25).fill(0);
  Object.assign(points, { 24: 2, 13: 5, 8: 3, 6: 5, 1: -2, 12: -5, 17: -3, 19: -5 });
  return { seed, rolls: 0, points, bar: [0, 0], off: [0, 0], turn: 0, dice: [], rolled: null, last: null, result: null };
}

const sign = (seat) => (seat === 0 ? 1 : -1);
const mine = (s, seat, p) => s.points[p] * sign(seat) > 0;
const homeAll = (s, seat) => s.bar[seat] === 0 && s.points.every((v, p) => p === 0 || v * sign(seat) <= 0 || (seat === 0 ? p <= 6 : p >= 19));
const entry = (seat, die) => (seat === 0 ? 25 - die : die);
const dest = (seat, from, die) => (seat === 0 ? from - die : from + die);
const open = (s, seat, p) => s.points[p] * sign(seat) >= -1;

/** Legal single moves for the current dice: { from: 'bar' | 1..24, die, to: 1..24 | 'off' }. */
export function bgMoves(s, seat = s.turn) {
  if (s.result || !s.dice.length) return [];
  const out = [];
  for (const die of [...new Set(s.dice)]) {
    if (s.bar[seat] > 0) {
      const to = entry(seat, die);
      if (open(s, seat, to)) out.push({ from: 'bar', die, to });
      continue;
    }
    for (let p = 1; p <= 24; p++) {
      if (!mine(s, seat, p)) continue;
      const to = dest(seat, p, die);
      if (to >= 1 && to <= 24) {
        if (open(s, seat, to)) out.push({ from: p, die, to });
      } else if (homeAll(s, seat)) {
        // Bearing off: exact, or with a bigger die when no checker sits further back.
        const exact = seat === 0 ? p === die : 25 - p === die;
        const furthest = seat === 0 ? !s.points.some((v, q) => q > p && q <= 6 && v > 0) : !s.points.some((v, q) => q < p && q >= 19 && v < 0);
        if (exact || furthest) out.push({ from: p, die, to: 'off' });
      }
    }
  }
  return out;
}

function endTurn(s) {
  s.turn = 1 - s.turn;
  s.dice = [];
  s.rolled = null;
}

export function bgMove(s0, seat, a) {
  if (s0.result) throw new Error('The game is over');
  if (seat !== s0.turn) throw new Error('Not your turn');
  const s = structuredClone(s0);
  if (a.type === 'roll') {
    if (s.dice.length) throw new Error('Move first');
    const r = rng(s.seed + ++s.rolls * 6151);
    const d = [1 + r.int(6), 1 + r.int(6)];
    s.rolled = d;
    s.dice = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : d;
    s.last = { seat, roll: d };
    if (!bgMoves(s).length) (s.last.note = 'No legal moves'), endTurn(s);
    return s;
  }
  if (a.type !== 'move') throw new Error('Unknown action');
  const from = a.from === 'bar' ? 'bar' : Number(a.from);
  const m = bgMoves(s).find((x) => x.from === from && x.die === Number(a.die));
  if (!m) throw new Error('Illegal move');
  const sg = sign(seat);
  if (from === 'bar') s.bar[seat]--;
  else s.points[from] -= sg;
  if (m.to === 'off') s.off[seat]++;
  else {
    if (s.points[m.to] === -sg) (s.points[m.to] = 0), s.bar[1 - seat]++; // hit
    s.points[m.to] += sg;
  }
  s.dice.splice(s.dice.indexOf(m.die), 1);
  s.last = { seat, from, to: m.to, die: m.die };
  if (s.off[seat] === 15) {
    s.result = { winners: [seat], reason: s.off[1 - seat] === 0 ? 'gammon!' : 'all checkers borne off' };
    return s;
  }
  if (!s.dice.length || !bgMoves(s).length) endTurn(s);
  return s;
}

export function bgTimeout(s) {
  let next = s;
  if (!next.dice.length) next = bgMove(next, next.turn, { type: 'roll' });
  const seat = s.turn;
  for (let guard = 0; guard < 6 && !next.result && next.turn === seat && next.dice.length; guard++) {
    const m = bgMoves(next)[0];
    if (!m) break;
    next = bgMove(next, seat, { type: 'move', from: m.from, die: m.die });
  }
  return next;
}
export const bgView = (s) => {
  const { seed, ...rest } = s;
  return { ...rest, moves: bgMoves(s) };
};
