import { rng } from './rng.js';

/**
 * Sunset Tycoon: a property-trading board game for 2–4 players. Roll, move, buy streets, charge rent, build
 * houses on full colour sets. Ends when one player is left or after `maxRounds`; richest net worth wins.
 */
const P = (name, group, price, rent) => ({ kind: 'property', name, group, price, rent });
export const TYCOON_BOARD = [
  { kind: 'go', name: 'Go — collect 200' },
  P('Palm Lane', 'sand', 60, 6),
  P('Beach Walk', 'sand', 80, 8),
  { kind: 'chance', name: 'Chance' },
  P('Taco Row', 'coral', 100, 10),
  P('Mango Street', 'coral', 120, 12),
  { kind: 'jail', name: 'Just visiting' },
  P('Vinyl Alley', 'violet', 140, 14),
  P('Neon Arcade', 'violet', 160, 16),
  { kind: 'tax', name: 'Vibe tax — pay 100', amount: 100 },
  { kind: 'rail', name: 'Sunset Express', price: 200, rent: 25 },
  P('Skate Park', 'lagoon', 180, 18),
  P('Rooftop Bar', 'lagoon', 200, 20),
  { kind: 'chance', name: 'Chance' },
  P('Golden Pier', 'gold', 220, 22),
  P('Marina Bay', 'gold', 240, 24),
  { kind: 'parking', name: 'Free parking' },
  P('Hollywood Hills', 'flame', 280, 28),
  P('Sunset Boulevard', 'flame', 320, 32),
  { kind: 'gotojail', name: 'Go to jail — pay 50' },
  { kind: 'rail', name: 'Midnight Line', price: 200, rent: 25 },
];
const HOUSE_COST = 100;
const MAX_HOUSES = 3;
const CHANCE = [
  { text: 'Your post went viral! Collect 150', money: 150 },
  { text: 'Festival tickets: pay 80', money: -80 },
  { text: 'Advance to Go', goto: 0 },
  { text: 'Lucky find: collect 50', money: 50 },
  { text: 'Phone screen cracked: pay 60', money: -60 },
  { text: 'Birthday! Everyone gives you 20', each: 20 },
];

export function initTycoon(n, seed, { maxRounds = 15 } = {}) {
  return {
    seed,
    rolls: 0,
    players: Array.from({ length: n }, () => ({ pos: 0, cash: 1500, out: false })),
    owner: TYCOON_BOARD.map(() => null),
    houses: TYCOON_BOARD.map(() => 0),
    turn: 0,
    round: 1,
    maxRounds,
    phase: 'roll', // roll → (buy) → end
    pending: null, // tile index the player may buy
    lastRoll: null,
    log: [],
    result: null,
  };
}

const groupTiles = (g) => TYCOON_BOARD.map((t, i) => (t.group === g ? i : -1)).filter((i) => i >= 0);
const ownsSet = (s, seat, g) => groupTiles(g).every((i) => s.owner[i] === seat);
function rentFor(s, i) {
  const t = TYCOON_BOARD[i];
  if (t.kind === 'rail') return t.rent * TYCOON_BOARD.filter((x, k) => x.kind === 'rail' && s.owner[k] === s.owner[i]).length;
  const base = ownsSet(s, s.owner[i], t.group) ? t.rent * 2 : t.rent;
  return base * [1, 3, 6, 10][s.houses[i]];
}
export function netWorth(s, seat) {
  const p = s.players[seat];
  if (p.out) return 0;
  return p.cash + TYCOON_BOARD.reduce((n, t, i) => n + (s.owner[i] === seat ? (t.price ?? 0) + s.houses[i] * HOUSE_COST : 0), 0);
}
const log = (s, text) => (s.log = [...s.log.slice(-11), text]);

function pay(s, from, to, amt) {
  s.players[from].cash -= amt;
  if (to != null) s.players[to].cash += amt;
  if (s.players[from].cash < 0) bankrupt(s, from);
}
function bankrupt(s, seat) {
  s.players[seat].out = true;
  s.players[seat].cash = 0;
  s.owner = s.owner.map((o) => (o === seat ? null : o));
  s.houses = s.houses.map((h, i) => (s.owner[i] == null ? 0 : h));
  log(s, `Player ${seat + 1} went bankrupt 💸`);
}

/** action: { type: 'roll' | 'buy' | 'pass' | 'build', tile? } then { type: 'end' }. */
export function tycoonMove(s0, seat, action) {
  if (s0.result) throw new Error('The game is over');
  if (s0.turn !== seat) throw new Error('Not your turn');
  const s = structuredClone(s0);
  const p = s.players[seat];
  if (action.type === 'roll') {
    if (s.phase !== 'roll') throw new Error('You already rolled');
    const r = rng(s.seed + ++s.rolls * 104729);
    const d = [1 + r.int(6), 1 + r.int(6)];
    s.lastRoll = d;
    const to = (p.pos + d[0] + d[1]) % TYCOON_BOARD.length;
    if (to < p.pos) (p.cash += 200), log(s, `Player ${seat + 1} passed Go (+200)`);
    p.pos = to;
    land(s, seat, r);
    if (p.out) nextTurn(s); // went bankrupt on their own roll
    else if (s.phase === 'roll') s.phase = 'end';
  } else if (action.type === 'buy') {
    if (s.phase !== 'buy' || s.pending == null) throw new Error('Nothing to buy');
    const t = TYCOON_BOARD[s.pending];
    if (p.cash < t.price) throw new Error('Not enough cash');
    p.cash -= t.price;
    s.owner[s.pending] = seat;
    log(s, `Player ${seat + 1} bought ${t.name}`);
    s.pending = null;
    s.phase = 'end';
  } else if (action.type === 'pass') {
    if (s.phase !== 'buy') throw new Error('Nothing to pass on');
    s.pending = null;
    s.phase = 'end';
  } else if (action.type === 'build') {
    const i = Number(action.tile);
    const t = TYCOON_BOARD[i];
    if (s.phase === 'roll' || !t || t.kind !== 'property' || s.owner[i] !== seat || !ownsSet(s, seat, t.group)) throw new Error('You can only build on a full colour set you own');
    if (s.houses[i] >= MAX_HOUSES) throw new Error('That street is fully built');
    if (p.cash < HOUSE_COST) throw new Error('Not enough cash');
    p.cash -= HOUSE_COST;
    s.houses[i]++;
    log(s, `Player ${seat + 1} built a house on ${t.name}`);
  } else if (action.type === 'end') {
    if (s.phase === 'roll') throw new Error('Roll first');
    s.pending = null;
    nextTurn(s);
  } else throw new Error('Unknown action');
  return checkEnd(s);
}

function land(s, seat, r) {
  const p = s.players[seat];
  const t = TYCOON_BOARD[p.pos];
  if (t.kind === 'property' || t.kind === 'rail') {
    const o = s.owner[p.pos];
    if (o == null) {
      if (p.cash >= t.price) (s.phase = 'buy'), (s.pending = p.pos);
    } else if (o !== seat && !s.players[o].out) {
      const rent = rentFor(s, p.pos);
      log(s, `Player ${seat + 1} paid ${rent} rent to Player ${o + 1}`);
      pay(s, seat, o, rent);
    }
  } else if (t.kind === 'tax') {
    log(s, `Player ${seat + 1} paid ${t.amount} vibe tax`);
    pay(s, seat, null, t.amount);
  } else if (t.kind === 'gotojail') {
    p.pos = TYCOON_BOARD.findIndex((x) => x.kind === 'jail');
    log(s, `Player ${seat + 1} went to jail (-50)`);
    pay(s, seat, null, 50);
  } else if (t.kind === 'chance') {
    const c = CHANCE[r.int(CHANCE.length)];
    log(s, `Player ${seat + 1}: ${c.text}`);
    if (c.money) c.money > 0 ? (p.cash += c.money) : pay(s, seat, null, -c.money);
    if (c.goto != null) (p.pos = c.goto), (p.cash += 200);
    if (c.each) s.players.forEach((q, i) => i !== seat && !q.out && pay(s, i, seat, c.each));
  }
}

function nextTurn(s) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.turn + k) % n;
    if (!s.players[i].out) {
      if (i <= s.turn) s.round++;
      s.turn = i;
      break;
    }
  }
  s.phase = 'roll';
}

function checkEnd(s) {
  const alive = s.players.map((p, i) => i).filter((i) => !s.players[i].out);
  if (alive.length <= 1 || s.round > s.maxRounds) {
    const worth = s.players.map((p, i) => netWorth(s, i));
    const best = Math.max(...worth);
    s.result = { winners: worth.map((w, i) => i).filter((i) => worth[i] === best), worth, reason: alive.length <= 1 ? 'everyone else went bankrupt' : `${s.maxRounds} rounds played` };
  }
  return s;
}

/** Timeout: roll if needed, skip buying, end the turn. */
export function tycoonTimeout(s) {
  let next = s;
  if (next.phase === 'roll') next = tycoonMove(next, next.turn, { type: 'roll' });
  if (!next.result && next.phase === 'buy') next = tycoonMove(next, next.turn, { type: 'pass' });
  if (!next.result) next = tycoonMove(next, next.turn, { type: 'end' });
  return next;
}

/** The dice seed stays on the server so rolls can't be predicted. */
export const tycoonView = (s) => {
  const { seed, ...rest } = s;
  return rest;
};
