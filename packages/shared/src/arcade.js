import { rng } from './games/rng.js';
import { towerX } from './games/tower.js';
import { ARCADE_MORE } from './arcade2.js';
export { brickRect } from './arcade2.js';

/**
 * Single-player arcade games. Each is a deterministic, fixed-step simulation driven by a seed and the player's
 * inputs, so the server can replay a run from { seed, inputs } and compute the real score — leaderboards can't be
 * faked by posting a number. The client runs the very same code to draw the game.
 *
 * Game API: init(seed) · step(state, input | null) (one tick) · over(state) · score(state) · TICK_MS
 * Inputs are recorded as [tick, value] pairs (2048 records one move per tick, ticks = move numbers).
 */

// ——— Snake ———
// Levels: every 5 sparks eaten. Each level the snake moves faster, and from level 3 rocks appear on the board.
const SNAKE_N = 20;
const snakeLevel = (s) => 1 + Math.floor(s.eaten / 5);
const snakeEvery = (lvl) => Math.max(4, 10 - lvl); // ticks (1/60 s) per move
const snake = {
  key: 'snake', name: 'Sunset Snake', emoji: '🐍', desc: 'Eat the sparks, don’t bite your tail. Faster every level; rocks from level 3.', TICK_MS: 1000 / 60,
  init(seed) {
    const s = { seed, r: 0, body: [[10, 10], [9, 10], [8, 10]], dir: 'right', want: null, food: null, rocks: [], wait: 0, dead: false, eaten: 0, ticks: 0 };
    placeFood(s);
    return s;
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    if (input && ['up', 'down', 'left', 'right'].includes(input)) s.want = input;
    if (++s.wait < snakeEvery(snakeLevel(s))) return s;
    s.wait = 0;
    const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (s.want && s.want !== OPP[s.dir]) s.dir = s.want;
    s.want = null;
    const [hx, hy] = s.body[0];
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[s.dir];
    const head = [hx + d[0], hy + d[1]];
    const hit = (x, y) => x === head[0] && y === head[1];
    if (head[0] < 0 || head[1] < 0 || head[0] >= SNAKE_N || head[1] >= SNAKE_N || s.body.some(([x, y]) => hit(x, y)) || s.rocks.some(([x, y]) => hit(x, y))) {
      s.dead = true;
      return s;
    }
    s.body.unshift(head);
    if (hit(...s.food)) {
      const before = snakeLevel(s);
      s.eaten++;
      if (snakeLevel(s) > before && snakeLevel(s) >= 3) addRocks(s, 2);
      placeFood(s);
    } else s.body.pop();
    if (s.ticks > 60 * 60 * 20) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.eaten * 10 + (snakeLevel(s) - 1) * 25,
  level: snakeLevel,
  N: SNAKE_N,
};
function freeCells(s) {
  const out = [];
  for (let x = 0; x < SNAKE_N; x++)
    for (let y = 0; y < SNAKE_N; y++)
      if (!s.body.some(([a, b]) => a === x && b === y) && !s.rocks.some(([a, b]) => a === x && b === y) && !(s.food && s.food[0] === x && s.food[1] === y)) out.push([x, y]);
  return out;
}
function placeFood(s) {
  const free = freeCells(s);
  s.food = free[rng(s.seed + ++s.r * 7919).int(free.length)];
}
/** Rocks never land right in front of the snake's head. */
function addRocks(s, n) {
  const [hx, hy] = s.body[0];
  for (let k = 0; k < n; k++) {
    const free = freeCells(s).filter(([x, y]) => Math.abs(x - hx) + Math.abs(y - hy) > 4);
    if (free.length) s.rocks.push(free[rng(s.seed + ++s.r * 7919).int(free.length)]);
  }
}

// ——— Spark Flight (flappy) ———
const FLY = { W: 400, H: 600, GAP: 170, PIPE_W: 64, SPACING: 230, SPEED: 2.6, GRAV: 0.42, FLAP: -7.4, X: 110, R: 16 };
const flight = {
  key: 'flight', name: 'Spark Flight', emoji: '🪽', desc: 'Tap to flap through the gaps. Every 5 pipes: faster, tighter gaps, and moving pipes from level 4.', TICK_MS: 1000 / 60,
  level: (s) => 1 + Math.floor(s.passed / 5),
  init(seed) {
    const s = { seed, y: 260, vy: 0, pipes: [], next: 0, passed: 0, dead: false, ticks: 0, started: false };
    for (let i = 0; i < 3; i++) addPipe(s, 520 + i * FLY.SPACING);
    return s;
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    if (input === 'flap') (s.vy = FLY.FLAP), (s.started = true);
    if (!s.started) return s;
    s.vy += FLY.GRAV;
    s.y += s.vy;
    const lvl = 1 + Math.floor(s.passed / 5);
    const speed = Math.min(5.2, FLY.SPEED + 0.3 * (lvl - 1));
    for (const p of s.pipes) {
      p.x -= speed;
      // From level 4 the gaps drift up and down.
      if (p.amp) p.gapY = Math.max(40, Math.min(FLY.H - p.gap - 40, p.base + Math.sin((s.ticks + p.phase) * 0.035) * p.amp));
      if (!p.scored && p.x + FLY.PIPE_W < FLY.X) (p.scored = true), s.passed++;
    }
    if (s.pipes[0].x + FLY.PIPE_W < -10) (s.pipes.shift(), addPipe(s, s.pipes.at(-1).x + FLY.SPACING));
    if (s.y < FLY.R || s.y > FLY.H - FLY.R) s.dead = true;
    for (const p of s.pipes)
      if (FLY.X + FLY.R > p.x && FLY.X - FLY.R < p.x + FLY.PIPE_W && (s.y - FLY.R < p.gapY || s.y + FLY.R > p.gapY + p.gap)) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.passed,
  C: FLY,
};
function addPipe(s, x) {
  s.next++;
  // Pipes are made ahead of time, so their difficulty comes from the level they'll be reached at (~3 pipes ahead).
  const lvl = 1 + Math.floor((s.passed + s.pipes.length) / 5);
  const gap = Math.max(118, FLY.GAP - 9 * (lvl - 1));
  const r = rng(s.seed + s.next * 104729);
  const gapY = 80 + r.int(FLY.H - gap - 160);
  s.pipes.push({ x, gapY, base: gapY, gap, amp: lvl >= 4 ? Math.min(70, 18 + 10 * (lvl - 4)) : 0, phase: r.int(400), scored: false });
}

// ——— 2048 ———
const g2048 = {
  key: '2048', name: '2048', emoji: '🔢', desc: 'Slide and merge tiles. Each new big tile is a level — and more 4s start dropping in.', TICK_MS: 0, TURN: true,
  level: (s) => lvl2048(s.grid),
  init(seed) {
    const s = { seed, r: 0, grid: Array(16).fill(0), score: 0, moves: 0, dead: false };
    spawn(s);
    spawn(s);
    return s;
  },
  /** One move per tick ('up' | 'down' | 'left' | 'right'). */
  step(s, dir) {
    if (s.dead || !dir) return s;
    const before = s.grid.join();
    const lines = [0, 1, 2, 3].map((i) =>
      [0, 1, 2, 3].map((j) => ({ left: i * 4 + j, right: i * 4 + 3 - j, up: j * 4 + i, down: (3 - j) * 4 + i })[dir]),
    );
    for (const idx of lines) {
      const vals = idx.map((k) => s.grid[k]).filter(Boolean);
      const out = [];
      for (let k = 0; k < vals.length; k++) {
        if (vals[k] === vals[k + 1]) (out.push(vals[k] * 2), (s.score += vals[k] * 2), k++);
        else out.push(vals[k]);
      }
      idx.forEach((k, n) => (s.grid[k] = out[n] ?? 0));
    }
    if (s.grid.join() !== before) (s.moves++, spawn(s));
    s.dead = !canMove2048(s.grid);
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.score,
};
function spawn(s) {
  const free = s.grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return;
  const r = rng(s.seed + ++s.r * 6151);
  // Higher levels drop more 4s, which clogs the board faster.
  const fours = Math.min(0.4, 0.1 + 0.05 * (lvl2048(s.grid) - 1));
  s.grid[free[r.int(free.length)]] = r.next() < 1 - fours ? 2 : 4;
}
/** Level from the biggest tile: 64 → 1, 128 → 2, 256 → 3 … */
function lvl2048(g) {
  const top = Math.max(2, ...g);
  return Math.max(1, Math.round(Math.log2(top)) - 5);
}
function canMove2048(g) {
  if (g.includes(0)) return true;
  for (let i = 0; i < 16; i++) if ((i % 4 < 3 && g[i] === g[i + 1]) || (i < 12 && g[i] === g[i + 4])) return true;
  return false;
}

// ——— Tower Solo ———
const towerSolo = {
  key: 'tower', name: 'Tower Solo', emoji: '🏗️', desc: 'Stack as high as you can. The block slides faster every floor; a new level every 5.', TICK_MS: 1000 / 60,
  level: (s) => 1 + Math.floor((s.stack.length - 1) / 5),
  init(seed) {
    return { seed, stack: [{ x: 170, w: 260 }], since: 0, dead: false, ticks: 0, perfects: 0 };
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    s.since++;
    if (input !== 'drop') return s;
    const top = s.stack.at(-1);
    const x = towerX(top.w, s.stack.length, s.since * this.TICK_MS);
    const left = Math.max(x, top.x);
    const w = Math.min(x + top.w, top.x + top.w) - left;
    if (w <= 1) s.dead = true;
    else if (Math.abs(x - top.x) < 3) (s.stack.push({ x: top.x, w: top.w }), s.perfects++);
    else s.stack.push({ x: left, w });
    s.since = 0;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => (s.stack.length - 1) * 10 + s.perfects * 5,
};

export const ARCADE = { snake, flight, 2048: g2048, tower: towerSolo, ...ARCADE_MORE };
export const ARCADE_KEYS = Object.keys(ARCADE);
/** Longest run the server will replay (ticks). */
export const ARCADE_MAX_TICKS = 60 * 60 * 30;

/**
 * Replays a run. `inputs` = [[tick, value], …] in tick order (2048: [[moveIndex, dir], …]).
 * Returns { score, ticks, over } — the only score the server trusts.
 */
export function replayArcade(key, seed, inputs) {
  const g = ARCADE[key];
  if (!g) throw new Error('Unknown game');
  let s = g.init(seed);
  if (g.TURN) {
    // Turn-based: one input per move, in order.
    for (const [, v] of inputs) {
      if (g.over(s)) break;
      s = g.step(s, v);
    }
    return { score: g.score(s), ticks: s.moves, over: g.over(s) };
  }
  let k = 0;
  const last = inputs.length ? inputs.at(-1)[0] : 0;
  for (let t = 0; t <= Math.min(ARCADE_MAX_TICKS, last + 60 * 60 * 5) && !g.over(s); t++) {
    let input = null;
    while (k < inputs.length && inputs[k][0] === t) input = inputs[k++][1];
    s = g.step.call(g, s, input);
  }
  return { score: g.score(s), ticks: s.ticks, over: g.over(s) };
}
