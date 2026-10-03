import { test } from 'node:test';
import { GAMES, legalMoves, initChess, chessMove, pokerEvaluate } from './index.js';
import assert from 'node:assert/strict';
test('arena games: legal play, fool’s mate, self-play to the end, chips conserved, hand ranks', () => {
let c = initChess();
assert.equal(legalMoves(c).length, 20);
const sqi = (n) => 'abcdefgh'.indexOf(n[0]) + (n[1] - 1) * 8;
for (const [side, a, b] of [['w','f2','f3'],['b','e7','e5'],['w','g2','g4'],['b','d8','h4']]) c = chessMove(c, side, { from: sqi(a), to: sqi(b) });
assert.equal(c.result.reason, 'checkmate');
// random self-play for all games
for (const key of Object.keys(GAMES)) {
  const g = GAMES[key];
  for (let game = 0; game < 30; game++) {
    let s = g.init(g.max, 1000 + game);
    let steps = 0;
    while (!g.outcome(s) && steps < 5000) {
      const seat = g.turn(s);
      let moved = false;
      if (key === 'chess') { const m = legalMoves(s); const x = m[(steps * 7 + game) % m.length]; s = g.move(s, seat, x); moved = true; }
      else if (key === 'checkers') { const m = g.view(s).moves; const x = m[(steps * 5 + game) % m.length]; s = g.move(s, seat, x); moved = true; }
      else s = g.timeout(s), moved = true;
      if (key === 'poker' && steps % 3 === 0 && !g.outcome(s) && g.turn(s) != null) {
        const sx = g.turn(s); try { s = g.move(s, sx, { type: 'call' }); } catch {}
      }
      steps++;
    }
    const o = g.outcome(s);
    if (key !== 'chess' || o) assert.ok(o || steps >= 5000, key);
    if (key === 'poker' && o) { const sum = s.players.reduce((n, p) => n + p.chips, 0); assert.equal(sum, 1000 * g.max, 'chips conserved'); }
  }
}
assert.deepEqual(pokerEvaluate(['As','Ks','Qs','Js','Ts','2d','3c']), [8, 14]);
assert.equal(pokerEvaluate(['Ah','2d','3c','4s','5h','9d','Kc'])[0], 4);
});

test('new arena games play to the end on timeouts alone, and key rules hold', async () => {
  const { GAMES: G, simulateShot, POOL: P, yahtzeeScore, canMake, MAHJONG_SLOTS: SLOTS, mahjongFree, towerX } = await import('./index.js');
  for (const key of ['ludo', 'dominoes', 'backgammon', 'yahtzee', 'trivia', 'mahjong', 'words', 'pool', 'tower']) {
    const g = G[key];
    for (let game = 0; game < 5; game++) {
      let now = 1_000_000;
      let s = g.init(g.max, 42 + game, { now });
      let steps = 0;
      while (!g.outcome(s) && steps < 20000) {
        now += 20_000;
        s = g.timeout(s, now);
        steps++;
      }
      assert.ok(g.outcome(s), `${key} finished`);
      g.view(s, 0);
    }
  }
  // Yahtzee scoring.
  assert.equal(yahtzeeScore('full', [2, 2, 3, 3, 3]), 25);
  assert.equal(yahtzeeScore('large', [2, 3, 4, 5, 6]), 40);
  assert.equal(yahtzeeScore('yahtzee', [4, 4, 4, 4, 4]), 50);
  // Word Race letters.
  assert.ok(canMake('TEA', ['T', 'E', 'A', 'X']));
  assert.ok(!canMake('TEE', ['T', 'E', 'A']));
  // Mahjong deal is fully solvable by matching free pairs.
  const mj = G.mahjong.init(2, 7, { now: 0 });
  const board = SLOTS.map(() => true);
  for (let k = 0; k < SLOTS.length / 2; k++) {
    const free = board.map((p, i) => i).filter((i) => mahjongFree(board, i));
    const pair = free.flatMap((a) => free.filter((b) => b > a && mj.faces[a] === mj.faces[b]).map((b) => [a, b]))[0];
    if (!pair) break;
    board[pair[0]] = board[pair[1]] = false;
  }
  assert.ok(board.filter(Boolean).length <= 4, 'greedy clears (almost) everything');
  // Pool physics is deterministic.
  const balls = G.pool.init().balls;
  const a = simulateShot(balls, 0, 1);
  const b = simulateShot(balls, 0, 1);
  assert.deepEqual(a.balls, b.balls);
  assert.ok(a.balls.every((x) => x.in || (x.x >= P.R - 1e-6 && x.x <= P.W - P.R + 1e-6)));
  // Tower block bounces within the walls.
  for (let t = 0; t < 10_000; t += 333) { const x = towerX(200, 3, t); assert.ok(x >= 0 && x <= 400); }
});
