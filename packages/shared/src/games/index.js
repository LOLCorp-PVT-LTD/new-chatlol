import { initChess, chessMove } from './chess.js';
import { initCheckers, checkersMove, checkersMoves } from './checkers.js';
import { initPoker, pokerMove, pokerTimeout, pokerView } from './poker.js';
import { initTycoon, tycoonMove, tycoonTimeout, tycoonView } from './tycoon.js';
import { initLudo, ludoMove, ludoTimeout, ludoView } from './ludo.js';
import { initDominoes, dominoMove, dominoTimeout, dominoView } from './dominoes.js';
import { initBackgammon, bgMove, bgTimeout, bgView } from './backgammon.js';
import { initYahtzee, yahtzeeMove, yahtzeeTimeout, yahtzeeView } from './yahtzee.js';
import { initTrivia, triviaMove, triviaTimeout, triviaView } from './trivia.js';
import { initMahjong, mahjongMove, mahjongTimeout, mahjongView } from './mahjong.js';
import { initWordRace, wordMove, wordTimeout, wordView } from './wordrace.js';
import { initPool, poolMove, poolTimeout, poolView } from './pool.js';
import { initTower, towerMove, towerTimeout, towerView } from './tower.js';

export * from './chess.js';
export * from './checkers.js';
export { pokerOptions, evaluate as pokerEvaluate, START_CHIPS } from './poker.js';
export { TYCOON_BOARD, netWorth } from './tycoon.js';
export { LUDO_START, LUDO_SAFE, LUDO_HOME, ludoSquare, ludoCorner } from './ludo.js';
export { dominoPlays } from './dominoes.js';
export { bgMoves } from './backgammon.js';
export { YAHTZEE_BOXES, yahtzeeScore, yahtzeeTotal } from './yahtzee.js';
export { MAHJONG_SLOTS, mahjongFree } from './mahjong.js';
export { canMake } from './wordrace.js';
export { POOL, POCKETS, simulateShot } from './pool.js';
export { TOWER, towerX } from './tower.js';

/**
 * Every arena game behind one interface, run by the server:
 *  init(players, seed) · move(state, seat, action) (throws on illegal) · turn(state) (seat to act, or null)
 *  timeout(state) (what happens when the seat to act runs out of time) · view(state, seat) (hides secrets)
 *  outcome(state) → null while playing, else { winners: seat[] } or { shares: number[] } (pot split by share)
 * Optional: `simultaneous` (everyone acts at once; turn() is -1), deadline(state) (ms timestamp the server's
 * timer should use instead of turnSeconds), and init/move/timeout receive the server clock ({ now } / action.at).
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
  ludo: {
    key: 'ludo', name: 'Ludo', emoji: '🎲', min: 2, max: 4, turnSeconds: 30,
    desc: 'Race your four tokens home. Roll a 6 to get out; land on rivals to send them back.',
    init: (n, seed) => initLudo(n, seed), move: ludoMove, turn: (s) => (s.result ? null : s.turn), timeout: ludoTimeout, view: ludoView,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  dominoes: {
    key: 'dominoes', name: 'Dominoes', emoji: '🁫', min: 2, max: 4, turnSeconds: 40,
    desc: 'Draw dominoes, double-six. Match the ends, empty your hand first.',
    init: (n, seed) => initDominoes(n, seed), move: dominoMove, turn: (s) => (s.result ? null : s.turn), timeout: dominoTimeout, view: dominoView,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  backgammon: {
    key: 'backgammon', name: 'Backgammon', emoji: '⚪', min: 2, max: 2, turnSeconds: 60,
    desc: 'Race all 15 checkers home and off the board. Hit blots, build primes.',
    init: (n, seed) => initBackgammon(seed), move: bgMove, turn: (s) => (s.result ? null : s.turn), timeout: bgTimeout, view: bgView,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  yahtzee: {
    key: 'yahtzee', name: 'Yahtzee', emoji: '🎯', min: 2, max: 6, turnSeconds: 45,
    desc: 'Roll five dice up to three times, fill your scorecard. Highest total wins.',
    init: (n, seed) => initYahtzee(n, seed), move: yahtzeeMove, turn: (s) => (s.result ? null : s.turn), timeout: yahtzeeTimeout, view: yahtzeeView,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  trivia: {
    key: 'trivia', name: 'Trivia Blitz', emoji: '🧠', min: 2, max: 8, turnSeconds: 15, simultaneous: true,
    desc: '10 questions, everyone answers at once. Right and fast scores most.',
    init: (n, seed, o) => initTrivia(n, seed, o), move: triviaMove, turn: (s) => (s.result ? null : -1), timeout: (s, now) => triviaTimeout(s, now), view: triviaView, deadline: (s) => s.endsAt,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  mahjong: {
    key: 'mahjong', name: 'Mahjong Race', emoji: '🀄', min: 2, max: 6, turnSeconds: 300, simultaneous: true,
    desc: 'Same layout for everyone. Match free tiles; first to clear the board wins.',
    init: (n, seed, o) => initMahjong(n, seed, o), move: mahjongMove, turn: (s) => (s.result ? null : -1), timeout: mahjongTimeout, view: mahjongView, deadline: (s) => s.endsAt,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  words: {
    key: 'words', name: 'Word Race', emoji: '🔤', min: 2, max: 8, turnSeconds: 45, simultaneous: true,
    desc: 'Nine letters, 45 seconds: make the longest real word. Five rounds.',
    init: (n, seed, o) => initWordRace(n, seed, o), move: wordMove, turn: (s) => (s.result ? null : -1), timeout: (s, now) => wordTimeout(s, now), view: wordView, deadline: (s) => s.endsAt,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  pool: {
    key: 'pool', name: '8-Ball Pool', emoji: '🎱', min: 2, max: 2, turnSeconds: 45,
    desc: 'Pot your group, then the 8-ball. Aim, set power, shoot.',
    init: () => initPool(), move: poolMove, turn: (s) => (s.result ? null : s.turn), timeout: poolTimeout, view: poolView,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
  tower: {
    key: 'tower', name: 'Tower Stack', emoji: '🏗️', min: 2, max: 4, turnSeconds: 15,
    desc: 'Drop the sliding block on the tower. Miss and you fall out; last builder wins.',
    init: (n, seed, o) => initTower(n, seed, o), move: towerMove, turn: (s) => (s.result ? null : s.turn), timeout: (s, now) => towerTimeout(s, now), view: towerView,
    outcome: (s) => (s.result ? { winners: s.result.winners, reason: s.result.reason } : null),
  },
};
export const GAME_KEYS = Object.keys(GAMES);
/** Currencies an arena can be staked in. Gems and Gold need the admin switch (on by default). */
export const WAGER_CURRENCIES = ['none', 'sparks', 'gems', 'gold'];
export const ARENA_RAKE_PCT = 5;
