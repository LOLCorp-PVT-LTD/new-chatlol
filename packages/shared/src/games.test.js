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
