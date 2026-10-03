import { rng, shuffle } from './rng.js';

/**
 * No-limit Texas Hold'em for 2–6 players. Everyone starts with the same chips; hands are dealt until one player
 * has every chip or `maxHands` is reached. The wager pot is then shared out in proportion to chips (`shares`).
 * Cards are 'As', 'Td', '7h' … Hidden information (deck, other players' hole cards) is removed by `pokerView`.
 */
const RANKS = '23456789TJQKA';
const DECK = [...RANKS].flatMap((r) => [...'shdc'].map((s) => r + s));
const rv = (c) => RANKS.indexOf(c[0]) + 2;
export const START_CHIPS = 1000;

export function initPoker(n, seed, { maxHands = 30 } = {}) {
  const s = {
    players: Array.from({ length: n }, () => ({ chips: START_CHIPS, hole: [], bet: 0, totalIn: 0, folded: false, allIn: false, out: false, acted: false })),
    seed,
    deck: [],
    board: [],
    dealer: -1,
    toAct: null,
    street: 'preflop',
    currentBet: 0,
    minRaise: 0,
    handNo: 0,
    maxHands,
    blinds: { sb: 10, bb: 20 },
    lastHand: null,
    result: null,
  };
  return startHand(s);
}

const live = (s) => s.players.map((p, i) => i).filter((i) => !s.players[i].out);
const inHand = (s) => s.players.map((p, i) => i).filter((i) => !s.players[i].out && !s.players[i].folded);
const nextSeat = (s, from, ok) => {
  for (let k = 1; k <= s.players.length; k++) {
    const i = (from + k) % s.players.length;
    if (ok(i)) return i;
  }
  return null;
};

function startHand(s0) {
  const s = structuredClone(s0);
  if (live(s).length < 2 || s.handNo >= s.maxHands) return finish(s);
  s.handNo++;
  if (s.handNo > 1 && (s.handNo - 1) % 5 === 0) s.blinds = { sb: Math.round(s.blinds.sb * 1.5), bb: Math.round(s.blinds.bb * 1.5) };
  const r = rng(s.seed + s.handNo * 7919);
  s.deck = shuffle(DECK, r);
  s.board = [];
  s.street = 'preflop';
  for (const p of s.players) Object.assign(p, { hole: [], bet: 0, totalIn: 0, folded: p.out, allIn: false, acted: false });
  s.dealer = nextSeat(s, s.dealer, (i) => !s.players[i].out);
  for (const i of live(s)) s.players[i].hole = [s.deck.pop(), s.deck.pop()];
  const headsUp = live(s).length === 2;
  const sb = headsUp ? s.dealer : nextSeat(s, s.dealer, (i) => !s.players[i].out);
  const bb = nextSeat(s, sb, (i) => !s.players[i].out);
  post(s, sb, s.blinds.sb);
  post(s, bb, s.blinds.bb);
  s.currentBet = s.blinds.bb;
  s.minRaise = s.blinds.bb;
  s.toAct = nextSeat(s, bb, (i) => canAct(s, i));
  if (s.toAct == null) return runOut(s);
  return s;
}

function post(s, i, amt) {
  const p = s.players[i];
  const a = Math.min(amt, p.chips);
  p.chips -= a;
  p.bet += a;
  p.totalIn += a;
  if (!p.chips) p.allIn = true;
}
const canAct = (s, i) => !s.players[i].out && !s.players[i].folded && !s.players[i].allIn;

/** What the seat to act may do: check/call/raise/fold with amounts. */
export function pokerOptions(s, seat) {
  if (s.result || s.toAct !== seat) return null;
  const p = s.players[seat];
  const toCall = Math.min(s.currentBet - p.bet, p.chips);
  return {
    toCall,
    canCheck: toCall === 0,
    minRaiseTo: Math.min(s.currentBet + s.minRaise, p.bet + p.chips),
    maxRaiseTo: p.bet + p.chips,
  };
}

/** action: { type: 'fold' | 'check' | 'call' | 'raise', to?: number } (raise `to` = total bet this street). */
export function pokerMove(s0, seat, action) {
  if (s0.result) throw new Error('The game is over');
  if (s0.toAct !== seat) throw new Error('Not your turn');
  const s = structuredClone(s0);
  const p = s.players[seat];
  const toCall = s.currentBet - p.bet;
  switch (action.type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      if (toCall > 0) throw new Error('You can’t check — call or fold');
      break;
    case 'call':
      post(s, seat, toCall);
      break;
    case 'raise': {
      const to = Math.floor(Number(action.to));
      const max = p.bet + p.chips;
      if (!Number.isFinite(to) || to <= s.currentBet) throw new Error('Raise more than the current bet');
      if (to > max) throw new Error('Not enough chips');
      if (to < s.currentBet + s.minRaise && to !== max) throw new Error(`Minimum raise is to ${s.currentBet + s.minRaise}`);
      const raiseBy = to - s.currentBet;
      post(s, seat, to - p.bet);
      if (raiseBy >= s.minRaise) {
        s.minRaise = raiseBy;
        for (const q of s.players) q.acted = false; // a full raise re-opens the action
      }
      s.currentBet = Math.max(s.currentBet, p.bet);
      break;
    }
    default:
      throw new Error('Unknown action');
  }
  p.acted = true;
  return advance(s);
}

/** Timeout: check if free, otherwise fold. */
export const pokerTimeout = (s) => pokerMove(s, s.toAct, { type: pokerOptions(s, s.toAct)?.canCheck ? 'check' : 'fold' });

function advance(s) {
  if (inHand(s).length === 1) return settle(s);
  const pending = live(s).filter((i) => canAct(s, i) && (!s.players[i].acted || s.players[i].bet < s.currentBet));
  if (pending.length) {
    s.toAct = nextSeat(s, s.toAct, (i) => pending.includes(i));
    return s;
  }
  // Betting round over.
  if (inHand(s).filter((i) => canAct(s, i)).length <= 1) return runOut(s);
  return nextStreet(s);
}

function nextStreet(s) {
  for (const p of s.players) Object.assign(p, { bet: 0, acted: false });
  s.currentBet = 0;
  s.minRaise = s.blinds.bb;
  if (s.street === 'preflop') (s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()), (s.street = 'flop'));
  else if (s.street === 'flop') (s.board.push(s.deck.pop()), (s.street = 'turn'));
  else if (s.street === 'turn') (s.board.push(s.deck.pop()), (s.street = 'river'));
  else return settle(s);
  s.toAct = nextSeat(s, s.dealer, (i) => canAct(s, i));
  return s;
}

/** Nobody can bet any more: deal the rest of the board and show down. */
function runOut(s) {
  while (s.board.length < 5) s.board.push(s.deck.pop());
  return settle(s);
}

function settle(s) {
  const contenders = inHand(s);
  const scores = new Map(contenders.map((i) => [i, s.board.length === 5 || contenders.length > 1 ? evaluate([...s.players[i].hole, ...s.board]) : [0]]));
  // Side pots: each layer of contributions is won by the best hand among those who paid into it.
  const levels = [...new Set(s.players.map((p) => p.totalIn).filter(Boolean))].sort((a, b) => a - b);
  const won = s.players.map(() => 0);
  let prev = 0;
  for (const lvl of levels) {
    const payers = s.players.filter((p) => p.totalIn >= lvl).length;
    const pot = (lvl - prev) * payers;
    const eligible = contenders.filter((i) => s.players[i].totalIn >= lvl);
    if (eligible.length) {
      const best = eligible.reduce((a, b) => (compare(scores.get(a), scores.get(b)) >= 0 ? a : b));
      const winners = eligible.filter((i) => compare(scores.get(i), scores.get(best)) === 0);
      winners.forEach((i, k) => (won[i] += Math.floor(pot / winners.length) + (k === 0 ? pot % winners.length : 0)));
    } else {
      // Everyone who paid this layer folded: it goes to the remaining player(s).
      contenders.forEach((i, k) => (won[i] += Math.floor(pot / contenders.length) + (k === 0 ? pot % contenders.length : 0)));
    }
    prev = lvl;
  }
  won.forEach((w, i) => (s.players[i].chips += w));
  s.lastHand = {
    board: [...s.board],
    shown: contenders.length > 1 ? Object.fromEntries(contenders.map((i) => [i, { hole: s.players[i].hole, hand: handName(scores.get(i)) }])) : {},
    won: won.map((w, i) => ({ seat: i, amount: w })).filter((w) => w.amount),
  };
  for (const p of s.players) if (!p.chips) p.out = true;
  s.toAct = null;
  return startHand(s);
}

function finish(s) {
  const total = s.players.reduce((n, p) => n + p.chips, 0);
  s.toAct = null;
  s.result = { shares: s.players.map((p) => p.chips / total), reason: live(s).length < 2 ? 'last player standing' : `${s.maxHands} hands played` };
  return s;
}

// ——— hand evaluation ———
const CATS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const handName = (score) => CATS[score?.[0]] ?? '';
function straightHigh(values) {
  const v = [...new Set(values)].sort((a, b) => b - a);
  if (v.includes(14)) v.push(1);
  for (let i = 0; i + 4 < v.length; i++) if (v[i] - v[i + 4] === 4) return v[i];
  return 0;
}
/** Best 5-card score from 5–7 cards: [category, tiebreakers…] — bigger is better. */
export function evaluate(cards) {
  const values = cards.map(rv);
  const bySuit = {};
  for (const c of cards) (bySuit[c[1]] ??= []).push(rv(c));
  const flush = Object.values(bySuit).find((v) => v.length >= 5);
  if (flush) {
    const sf = straightHigh(flush);
    if (sf) return [8, sf];
  }
  const counts = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, n]) => [n, +v])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kick = (excl, n) => values.filter((v) => !excl.includes(v)).sort((a, b) => b - a).filter((v, i, a) => a.indexOf(v) === i).slice(0, n);
  if (groups[0][0] === 4) return [7, groups[0][1], ...kick([groups[0][1]], 1)];
  if (groups[0][0] === 3 && groups[1]?.[0] >= 2) return [6, groups[0][1], groups[1][1]];
  if (flush) return [5, ...flush.sort((a, b) => b - a).slice(0, 5)];
  const st = straightHigh(values);
  if (st) return [4, st];
  if (groups[0][0] === 3) return [3, groups[0][1], ...kick([groups[0][1]], 2)];
  if (groups[0][0] === 2 && groups[1]?.[0] === 2) return [2, groups[0][1], groups[1][1], ...kick([groups[0][1], groups[1][1]], 1)];
  if (groups[0][0] === 2) return [1, groups[0][1], ...kick([groups[0][1]], 3)];
  return [0, ...kick([], 5)];
}
export function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

/** What one seat may see: their own hole cards only; no deck, no seed. Spectators (seat -1) see no hole cards. */
export function pokerView(s, seat) {
  const { deck, seed, ...rest } = s;
  return {
    ...rest,
    players: s.players.map((p, i) => ({ ...p, hole: i === seat || s.result ? p.hole : p.hole.length ? ['??', '??'] : [] })),
  };
}
