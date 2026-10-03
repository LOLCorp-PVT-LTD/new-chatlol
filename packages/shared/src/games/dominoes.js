import { rng, shuffle } from './rng.js';

/**
 * Draw dominoes (double-six) for 2–4 players. Seven tiles each; the rest is the boneyard. Play a tile matching
 * either end of the line; if you can't, draw until you can (or the boneyard is empty), then pass. First to empty
 * their hand wins; if everyone is stuck, the lowest pip count wins. Hands and the boneyard are hidden.
 */
const SET = [];
for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) SET.push([a, b]);
const pips = (hand) => hand.reduce((n, [a, b]) => n + a + b, 0);

export function initDominoes(n, seed) {
  const deck = shuffle(SET, rng(seed));
  const hands = Array.from({ length: n }, () => deck.splice(0, 7));
  // Highest double starts (else the highest tile).
  let start = 0;
  let best = -1;
  hands.forEach((h, i) => h.forEach(([a, b]) => { const v = a === b ? 100 + a : a + b; if (v > best) (best = v), (start = i); }));
  return { n, hands, boneyard: deck, line: [], ends: null, turn: start, passes: 0, last: null, result: null };
}

/** Plays possible for a seat: [{ tile, side }]. */
export function dominoPlays(s, seat = s.turn) {
  const out = [];
  s.hands[seat].forEach(([a, b], i) => {
    if (!s.ends) return out.push({ tile: i, side: 'right' });
    if (a === s.ends[0] || b === s.ends[0]) out.push({ tile: i, side: 'left' });
    if (a === s.ends[1] || b === s.ends[1]) out.push({ tile: i, side: 'right' });
  });
  return out;
}

function advance(s) {
  s.turn = (s.turn + 1) % s.n;
}
function finish(s, reason) {
  const counts = s.hands.map(pips);
  const best = Math.min(...counts);
  s.result = { winners: counts.map((c, i) => i).filter((i) => counts[i] === best), pips: counts, reason };
}

/** action: { type: 'play', tile, side } | { type: 'draw' } | { type: 'pass' } */
export function dominoMove(s0, seat, a) {
  if (s0.result) throw new Error('The game is over');
  if (seat !== s0.turn) throw new Error('Not your turn');
  const s = structuredClone(s0);
  if (a.type === 'play') {
    const p = dominoPlays(s, seat).find((x) => x.tile === Number(a.tile) && x.side === a.side) ?? (!s.ends ? dominoPlays(s, seat).find((x) => x.tile === Number(a.tile)) : null);
    if (!p) throw new Error('That tile doesn’t fit');
    let [x, y] = s.hands[seat].splice(p.tile, 1)[0];
    if (!s.ends) {
      s.line.push([x, y]);
      s.ends = [x, y];
    } else if (p.side === 'left') {
      if (y !== s.ends[0]) [x, y] = [y, x];
      s.line.unshift([x, y]);
      s.ends[0] = x;
    } else {
      if (x !== s.ends[1]) [x, y] = [y, x];
      s.line.push([x, y]);
      s.ends[1] = y;
    }
    s.passes = 0;
    s.last = { seat, played: [x, y], side: p.side };
    if (!s.hands[seat].length) return finish(s, 'domino!'), s;
    advance(s);
    return s;
  }
  if (a.type === 'draw') {
    if (dominoPlays(s, seat).length) throw new Error('You can play a tile');
    if (!s.boneyard.length) throw new Error('The boneyard is empty — pass');
    s.hands[seat].push(s.boneyard.pop());
    s.last = { seat, drew: true };
    return s;
  }
  if (a.type === 'pass') {
    if (dominoPlays(s, seat).length || s.boneyard.length) throw new Error('You can still play or draw');
    s.passes++;
    s.last = { seat, passed: true };
    if (s.passes >= s.n) return finish(s, 'blocked — lowest pips wins'), s;
    advance(s);
    return s;
  }
  throw new Error('Unknown action');
}

export function dominoTimeout(s) {
  let next = s;
  for (let guard = 0; guard < 30 && !next.result && next.turn === s.turn; guard++) {
    const plays = dominoPlays(next);
    if (plays.length) return dominoMove(next, next.turn, { type: 'play', ...plays[0] });
    next = next.boneyard.length ? dominoMove(next, next.turn, { type: 'draw' }) : dominoMove(next, next.turn, { type: 'pass' });
  }
  return next;
}

export function dominoView(s, seat) {
  const { boneyard, hands, ...rest } = s;
  return {
    ...rest,
    boneyardCount: boneyard.length,
    handCounts: hands.map((h) => h.length),
    hand: seat >= 0 ? hands[seat] : [],
    hands: s.result ? hands : undefined,
    plays: seat >= 0 && seat === s.turn ? dominoPlays(s, seat) : [],
  };
}
