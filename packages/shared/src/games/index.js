import { initChess, chessMove } from './chess.js';
import { initCheckers, checkersMove, checkersMoves } from './checkers.js';
import { initPoker, pokerMove, pokerTimeout, pokerView } from './poker.js';
import { initTycoon, tycoonMove, tycoonTimeout, tycoonView } from './tycoon.js';

export * from './chess.js';
export * from './checkers.js';
export { pokerOptions, evaluate as pokerEvaluate, START_CHIPS } from './poker.js';
export { TYCOON_BOARD, netWorth } from './tycoon.js';

/**
 * Every arena game behind one interface, run by the server:
 *  init(players, seed) · move(state, seat, action) (throws on illegal) · turn(state) (seat to act, or null)
 *  timeout(state) (what happens when the seat to act runs out of time) · view(state, seat) (hides secrets)
 *  outcome(state) → null while playing, else { winners: seat[] } or { shares: number[] } (pot split by share)
 * A resign / leave is { type: 'resign' } for every game and handled by the server.
 */
const CHESS_SIDES = ['w', 'b'];
const CHECKER_SIDES = ['r', 'b'];
export const GAMES = {
  chess: {
    key: 'chess', name: 'Chess', emoji: '♟️', min: 2, max: 2, turnSeconds: 120,
    desc: 'Classic chess. Checkmate wins the pot; stalemate refunds it.',
    init: () => initChess(),
    move: (s, seat, a) => chessMove(s, CHESS_SIDES[seat], a),
    turn: (s) => (s.result ? null : CHESS_SIDES.indexOf(s.turn)),
    timeout: (s) => ({ ...s, result: { winner: s.turn === 'w' ? 'b' : 'w', reason: 'ran out of time' } }),
    view: (s) => s,
    outcome: (s) => (s.result ? { winners: s.result.winner ? [CHESS_SIDES.indexOf(s.result.winner)] : [], reason: s.result.reason } : null),
  },
  checkers: {
    key: 'checkers', name: 'Checkers', emoji: '🔴', min: 2, max: 2, turnSeconds: 90,
    desc: 'English draughts. Captures are compulsory; jump them all.',
    init: () => initCheckers(),
    move: (s, seat, a) => checkersMove(s, CHECKER_SIDES[seat], a),
    turn: (s) => (s.result ? null : CHECKER_SIDES.indexOf(s.turn)),
    timeout: (s) => ({ ...s, result: { winner: s.turn === 'r' ? 'b' : 'r', reason: 'ran out of time' } }),
    view: (s) => ({ ...s, moves: checkersMoves(s) }),
    outcome: (s) => (s.result ? { winners: s.result.winner ? [CHECKER_SIDES.indexOf(s.result.winner)] : [], reason: s.result.reason } : null),
  },
  poker: {
    key: 'poker', name: "Texas Hold'em", emoji: '🃏', min: 2, max: 6, turnSeconds: 45,
    desc: 'No-limit poker. Everyone buys in for the stake; the pot is shared out by chips at the end.',
    init: (n, seed) => initPoker(n, seed),
    move: pokerMove,
    turn: (s) => (s.result ? null : s.toAct),
    timeout: pokerTimeout,
    view: pokerView,
    outcome: (s) => (s.result ? { shares: s.result.shares, reason: s.result.reason } : null),
  },
  tycoon: {
    key: 'tycoon', name: 'Sunset Tycoon', emoji: '🏙️', min: 2, max: 4, turnSeconds: 60,
    desc: 'Buy streets, charge rent, build houses. Richest after 15 rounds takes the pot.',
    init: (n, seed) => initTycoon(n, seed),
    move: tycoonMove,
    turn: (s) => (s.result ? null : s.turn),
    timeout: tycoonTimeout,
    view: (s) => tycoonView(s),
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
};
export const GAME_KEYS = Object.keys(GAMES);
/** Currencies an arena can be staked in. Gems and Gold need the admin switch (on by default). */
export const WAGER_CURRENCIES = ['none', 'sparks', 'gems', 'gold'];
export const ARENA_RAKE_PCT = 5;
