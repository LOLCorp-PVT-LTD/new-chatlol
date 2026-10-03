import { rng } from './rng.js';

/**
 * Yahtzee for 2–6 players. Each turn: roll up to three times (holding any dice), then score one empty box.
 * 13 rounds; upper section bonus 35 at 63+; extra Yahtzees +100. Highest total wins.
 */
export const YAHTZEE_BOXES = [
  { key: 'ones', label: 'Ones' }, { key: 'twos', label: 'Twos' }, { key: 'threes', label: 'Threes' },
  { key: 'fours', label: 'Fours' }, { key: 'fives', label: 'Fives' }, { key: 'sixes', label: 'Sixes' },
  { key: 'three', label: 'Three of a kind' }, { key: 'four', label: 'Four of a kind' }, { key: 'full', label: 'Full house' },
  { key: 'small', label: 'Small straight' }, { key: 'large', label: 'Large straight' }, { key: 'yahtzee', label: 'Yahtzee' }, { key: 'chance', label: 'Chance' },
];
const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

export function yahtzeeScore(box, dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const has = (seq) => seq.every((v) => counts[v] > 0);
  const i = UPPER.indexOf(box);
  if (i >= 0) return counts[i + 1] * (i + 1);
  switch (box) {
    case 'three': return counts.some((c) => c >= 3) ? sum : 0;
    case 'four': return counts.some((c) => c >= 4) ? sum : 0;
    case 'full': return counts.includes(3) && counts.includes(2) ? 25 : 0;
    case 'small': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
    case 'large': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
    case 'yahtzee': return counts.includes(5) ? 50 : 0;
    case 'chance': return sum;
    default: return 0;
  }
}
export function yahtzeeTotal(card) {
  const upper = UPPER.reduce((n, k) => n + (card[k] ?? 0), 0);
  const all = YAHTZEE_BOXES.reduce((n, b) => n + (card[b.key] ?? 0), 0);
  return all + (upper >= 63 ? 35 : 0) + (card.bonus ?? 0);
}

export function initYahtzee(n, seed) {
  return { seed, rolls: 0, n, cards: Array.from({ length: n }, () => ({})), turn: 0, dice: [1, 1, 1, 1, 1], rollsLeft: 3, round: 1, last: null, result: null };
}

/** action: { type: 'roll', hold?: boolean[5] } | { type: 'score', box } */
export function yahtzeeMove(s0, seat, a) {
  if (s0.result) throw new Error('The game is over');
  if (seat !== s0.turn) throw new Error('Not your turn');
  const s = structuredClone(s0);
  if (a.type === 'roll') {
    if (s.rollsLeft <= 0) throw new Error('No rolls left — pick a box');
    const hold = s.rollsLeft === 3 ? [false, false, false, false, false] : (a.hold ?? []).map(Boolean);
    const r = rng(s.seed + ++s.rolls * 3571);
    s.dice = s.dice.map((d, i) => (hold[i] ? d : 1 + r.int(6)));
    s.rollsLeft--;
    s.last = { seat, rolled: [...s.dice], held: hold };
    return s;
  }
  if (a.type !== 'score') throw new Error('Unknown action');
  if (s.rollsLeft === 3) throw new Error('Roll first');
  const card = s.cards[seat];
  if (!YAHTZEE_BOXES.some((b) => b.key === a.box) || card[a.box] !== undefined) throw new Error('Pick an empty box');
  if (card.yahtzee === 50 && yahtzeeScore('yahtzee', s.dice) === 50) card.bonus = (card.bonus ?? 0) + 100;
  card[a.box] = yahtzeeScore(a.box, s.dice);
  s.last = { seat, box: a.box, points: card[a.box] };
  s.turn = (s.turn + 1) % s.n;
  s.rollsLeft = 3;
  if (s.turn === 0) s.round++;
  if (s.round > 13) {
    const totals = s.cards.map(yahtzeeTotal);
    const best = Math.max(...totals);
    s.result = { winners: totals.map((t, i) => i).filter((i) => totals[i] === best), totals, reason: '13 rounds played' };
  }
  return s;
}

export function yahtzeeTimeout(s) {
  let next = s;
  if (next.rollsLeft === 3) next = yahtzeeMove(next, next.turn, { type: 'roll' });
  const card = next.cards[next.turn];
  const open = YAHTZEE_BOXES.filter((b) => card[b.key] === undefined);
  const best = open.reduce((a, b) => (yahtzeeScore(b.key, next.dice) > yahtzeeScore(a.key, next.dice) ? b : a), open[0]);
  return yahtzeeMove(next, next.turn, { type: 'score', box: best.key });
}
export const yahtzeeView = (s) => {
  const { seed, ...rest } = s;
  return { ...rest, totals: s.cards.map(yahtzeeTotal) };
};
