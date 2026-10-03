import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCADE, replayArcade } from './index.js';

/** Plays a run the way the client does (recording inputs) and checks the server's replay gets the same score. */
function play(key, seed, policy, maxTicks = 20000) {
  const g = ARCADE[key];
  let s = g.init(seed);
  const inputs = [];
  for (let t = 0; t < maxTicks && !g.over(s); t++) {
    const input = policy(s, t);
    if (input) inputs.push([t, input]);
    s = g.step.call(g, s, input);
  }
  return { score: g.score(s), inputs, over: g.over(s) };
}

test('arcade runs replay to exactly the same score', () => {
  const snake = play('snake', 11, (s, t) => (t % 7 === 0 ? ['up', 'left', 'down', 'right'][(t / 7) % 4] : null));
  assert.equal(replayArcade('snake', 11, snake.inputs).score, snake.score);
  const fly = play('flight', 5, (s) => (s.y > 300 && s.vy >= 0 ? 'flap' : null));
  assert.equal(replayArcade('flight', 5, fly.inputs).score, fly.score);
  const tw = play('tower', 3, (s, t) => (t % 50 === 49 ? 'drop' : null), 3000);
  assert.equal(replayArcade('tower', 3, tw.inputs).score, tw.score);
  const g = ARCADE['2048'];
  let s = g.init(9);
  const moves = [];
  for (let i = 0; i < 2000 && !g.over(s); i++) {
    const d = ['left', 'down', 'right', 'down'][i % 4];
    moves.push([i, d]);
    s = g.step(s, d);
  }
  assert.ok(s.score > 0);
  assert.equal(replayArcade('2048', 9, moves).score, s.score);
  // A faked input list can't produce a higher score than what it actually plays.
  assert.ok(replayArcade('snake', 11, []).score <= 10);
});
