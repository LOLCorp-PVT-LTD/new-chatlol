import { rng, shuffle } from './games/rng.js';

/**
 * More arcade games, same contract as arcade.js: deterministic, seeded, replayed by the server from the inputs.
 * Real-time games (TICK_MS > 0) take one optional input per tick; turn games (TURN: true) take one input per move.
 * Every game ends on its own (lives, a clock, or a hard cap), so a replay always terminates.
 */
const rnd = (s) => rng(s.seed + ++s.r * 7919);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MINUTES = (m) => m * 60 * 60; // ticks at 60/s

/** Shared paddle / ship steering: 'p<x>' = follow a pointer x, 'l' / 'r' = move, 's' = stop. */
function steer(s, input, speed, min, max) {
  if (input) {
    if (input[0] === 'p') (s.target = clamp(+input.slice(1) || 0, min, max)), (s.vel = 0);
    else if (input === 'l') (s.vel = -speed), (s.target = null);
    else if (input === 'r') (s.vel = speed), (s.target = null);
    else if (input === 's') s.vel = 0;
  }
  if (s.target != null) s.x += clamp(s.target - s.x, -speed * 1.4, speed * 1.4);
  else s.x += s.vel;
  s.x = clamp(s.x, min, max);
}

// ——— Brick Smash ———
const BR = { W: 400, H: 500, PW: 72, PY: 468, R: 6, COLS: 8, ROWS: 6, BW: 46, BH: 16, TOP: 60, GAP: 3 };
const breakout = {
  key: 'breakout', name: 'Brick Smash', emoji: '🧱', desc: 'Bounce the ball, smash every brick. Three lives.', TICK_MS: 1000 / 60, C: BR,
  controls: 'steer',
  init(seed) {
    const s = { seed, r: 0, x: BR.W / 2, vel: 0, target: null, lives: 3, level: 1, points: 0, ticks: 0, dead: false, bricks: [], ball: null, wait: 60 };
    wall(s);
    return s;
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    steer(s, input, 7, BR.PW / 2, BR.W - BR.PW / 2);
    if (s.ticks > MINUTES(10)) return ((s.dead = true), s);
    if (s.wait > 0) {
      s.wait--;
      s.ball = { x: s.x, y: BR.PY - 14, vx: 0, vy: 0 };
      if (!s.wait) {
        const sp = 4 + s.level * 0.4;
        const a = -Math.PI / 2 + (rnd(s).next() - 0.5) * 0.9;
        s.ball.vx = Math.cos(a) * sp;
        s.ball.vy = Math.sin(a) * sp;
      }
      return s;
    }
    const b = s.ball;
    // Move one axis at a time so brick hits bounce the right way.
    b.x += b.vx;
    if (b.x < BR.R || b.x > BR.W - BR.R) (b.vx = -b.vx), (b.x = clamp(b.x, BR.R, BR.W - BR.R));
    if (hitBrick(s, b)) b.vx = -b.vx;
    b.y += b.vy;
    if (b.y < BR.R) (b.vy = Math.abs(b.vy)), (b.y = BR.R);
    if (hitBrick(s, b)) b.vy = -b.vy;
    if (b.vy > 0 && b.y + BR.R >= BR.PY && b.y + BR.R <= BR.PY + 12 && Math.abs(b.x - s.x) <= BR.PW / 2 + BR.R) {
      const sp = Math.hypot(b.vx, b.vy);
      const off = clamp((b.x - s.x) / (BR.PW / 2), -1, 1);
      const a = -Math.PI / 2 + off * 1.05;
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
      b.y = BR.PY - BR.R;
    }
    if (b.y > BR.H + 20) {
      s.lives--;
      if (s.lives <= 0) s.dead = true;
      else s.wait = 60;
    }
    if (!s.bricks.some(Boolean)) (s.level++, wall(s), (s.wait = 60));
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};
function wall(s) {
  s.bricks = Array(BR.COLS * BR.ROWS).fill(1);
}
/** Brick rectangle for index i. */
export function brickRect(i) {
  const c = i % BR.COLS;
  const r = Math.floor(i / BR.COLS);
  const x0 = (BR.W - BR.COLS * (BR.BW + BR.GAP) + BR.GAP) / 2;
  return { x: x0 + c * (BR.BW + BR.GAP), y: BR.TOP + r * (BR.BH + BR.GAP), w: BR.BW, h: BR.BH, row: r };
}
function hitBrick(s, b) {
  for (let i = 0; i < s.bricks.length; i++) {
    if (!s.bricks[i]) continue;
    const k = brickRect(i);
    if (b.x + BR.R > k.x && b.x - BR.R < k.x + k.w && b.y + BR.R > k.y && b.y - BR.R < k.y + k.h) {
      s.bricks[i] = 0;
      s.points += BR.ROWS - k.row; // top rows are worth more
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 9) (b.vx *= 1.01), (b.vy *= 1.01);
      return true;
    }
  }
  return false;
}

// ——— Meteor Dodge ———
const MD = { W: 400, H: 600, SY: 540, SR: 14 };
const meteor = {
  key: 'meteor', name: 'Meteor Dodge', emoji: '☄️', desc: 'Slide left and right. Don’t get hit. It gets faster.', TICK_MS: 1000 / 60, C: MD,
  controls: 'steer',
  init(seed) {
    return { seed, r: 0, x: MD.W / 2, vel: 0, target: null, rocks: [], next: 30, ticks: 0, dead: false };
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    steer(s, input, 6.5, MD.SR, MD.W - MD.SR);
    const t = s.ticks / 60;
    if (--s.next <= 0) {
      const r = rnd(s);
      const rad = 10 + r.int(17);
      s.rocks.push({ x: rad + r.int(MD.W - rad * 2), y: -rad, rad, v: 2.6 + Math.min(5, t / 12) + r.next() * 1.5, spin: r.next() * 6 });
      s.next = Math.max(10, 38 - Math.floor(t / 2.5));
    }
    for (const k of s.rocks) k.y += k.v;
    s.rocks = s.rocks.filter((k) => k.y - k.rad < MD.H);
    if (s.rocks.some((k) => Math.hypot(k.x - s.x, k.y - MD.SY) < k.rad + MD.SR - 3)) s.dead = true;
    if (s.ticks > MINUTES(10)) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => Math.floor(s.ticks / 6),
};

// ——— Sunset Run ———
const RN = { W: 600, H: 260, GY: 210, X: 80, PW: 30, PH: 38 };
const runner = {
  key: 'runner', name: 'Sunset Run', emoji: '🏃', desc: 'Jump the cacti. Tap, click or Space to jump.', TICK_MS: 1000 / 60, C: RN,
  controls: 'tap', tapInput: 'j',
  init(seed) {
    return { seed, r: 0, y: 0, vy: 0, obs: [], gap: 260, dist: 0, ticks: 0, dead: false };
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    const speed = Math.min(13, 6 + s.ticks / 600);
    if (input === 'j' && s.y === 0) s.vy = 12.5;
    s.y = Math.max(0, s.y + s.vy);
    s.vy = s.y === 0 ? 0 : s.vy - 0.65;
    s.dist += speed;
    s.gap -= speed;
    if (s.gap <= 0) {
      const r = rnd(s);
      const tall = r.int(3);
      s.obs.push({ x: RN.W + 20, w: 18 + r.int(3) * 10, h: 30 + tall * 14 });
      s.gap = 240 + r.int(220) + speed * 10;
    }
    for (const o of s.obs) o.x -= speed;
    s.obs = s.obs.filter((o) => o.x + o.w > -10);
    for (const o of s.obs)
      if (RN.X + RN.PW - 6 > o.x && RN.X + 6 < o.x + o.w && s.y < o.h - 4) s.dead = true;
    if (s.ticks > MINUTES(10)) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => Math.floor(s.dist / 25),
};

// ——— Whack-a-Spark ———
const WH = { HOLES: 9, TIME: 45 * 60 };
const whack = {
  key: 'whack', name: 'Whack-a-Spark', emoji: '🔨', desc: '45 seconds. Tap the sparks as they pop up — golden ones are worth triple. Misses cost.', TICK_MS: 1000 / 60, C: WH,
  controls: 'grid', cols: 3, rows: 3, gridInput: (i) => `h${i}`,
  init(seed) {
    return { seed, r: 0, up: Array(WH.HOLES).fill(null), next: 20, points: 0, hits: 0, misses: 0, ticks: 0, dead: false, flash: Array(WH.HOLES).fill(0) };
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    for (let i = 0; i < WH.HOLES; i++) {
      if (s.flash[i]) s.flash[i]--;
      if (s.up[i] && --s.up[i].left <= 0) s.up[i] = null;
    }
    if (input && input[0] === 'h') {
      const i = +input.slice(1);
      if (i >= 0 && i < WH.HOLES) {
        if (s.up[i]) (s.points += s.up[i].gold ? 30 : 10), s.hits++, (s.up[i] = null), (s.flash[i] = 12);
        else (s.points = Math.max(0, s.points - 5)), s.misses++;
      }
    }
    if (--s.next <= 0) {
      const r = rnd(s);
      const free = s.up.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0);
      if (free.length) {
        const life = Math.max(28, 75 - Math.floor(s.ticks / 60) * 1.2);
        s.up[free[r.int(free.length)]] = { left: life, life, gold: r.next() < 0.1 };
      }
      s.next = Math.max(10, 34 - Math.floor(s.ticks / 120));
    }
    if (s.ticks >= WH.TIME) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};

// ——— Memory Match (turn-based) ———
const MEM_FACES = ['🌅', '🔥', '🧡', '👑', '✨', '🎧', '🍉', '🌴'];
const memory = {
  key: 'memory', name: 'Memory Match', emoji: '🃏', desc: 'Flip two cards at a time and find all 8 pairs. Fewer misses, bigger score.', TICK_MS: 0, TURN: true,
  controls: 'grid', cols: 4, rows: 4, gridInput: (i) => `f${i}`, faces: MEM_FACES,
  init(seed) {
    const r = rng(seed);
    return { seed, r: 0, cards: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7], r), matched: Array(16).fill(false), open: [], misses: 0, pairs: 0, moves: 0, dead: false };
  },
  step(s, input) {
    if (s.dead || !input || input[0] !== 'f') return s;
    const i = +input.slice(1);
    if (!(i >= 0 && i < 16) || s.matched[i] || s.open.includes(i)) return s;
    s.moves++;
    if (s.open.length === 2) s.open = []; // the last unmatched pair turns back over
    s.open.push(i);
    if (s.open.length === 2) {
      const [a, b] = s.open;
      if (s.cards[a] === s.cards[b]) (s.matched[a] = s.matched[b] = true), s.pairs++, (s.open = []);
      else s.misses++;
    }
    if (s.pairs === 8) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.pairs * 25 + (s.pairs === 8 ? Math.max(0, 300 - s.misses * 15) : 0),
};

// ——— Minesweeper (turn-based) ———
const MS = { N: 9, MINES: 10 };
const mines = {
  key: 'mines', name: 'Minesweeper', emoji: '💣', desc: 'Clear the field without hitting a mine. Long-press or right-click to flag.', TICK_MS: 0, TURN: true, C: MS,
  controls: 'grid', cols: MS.N, rows: MS.N, gridInput: (i, alt) => `${alt ? 'f' : 'o'}${i}`,
  init(seed) {
    const n = MS.N * MS.N;
    return { seed, r: 0, mine: null, open: Array(n).fill(false), flag: Array(n).fill(false), count: Array(n).fill(0), revealed: 0, won: false, boom: -1, moves: 0, dead: false };
  },
  step(s, input) {
    if (s.dead || !input) return s;
    const i = +input.slice(1);
    const n = MS.N * MS.N;
    if (!(i >= 0 && i < n)) return s;
    s.moves++;
    if (input[0] === 'f') {
      if (!s.open[i]) s.flag[i] = !s.flag[i];
      return s;
    }
    if (input[0] !== 'o' || s.open[i] || s.flag[i]) return s;
    if (!s.mine) layMines(s, i); // the first tap is always safe
    if (s.mine[i]) return ((s.boom = i), (s.dead = true), s);
    const stack = [i];
    while (stack.length) {
      const k = stack.pop();
      if (s.open[k] || s.mine[k]) continue;
      s.open[k] = true;
      s.flag[k] = false;
      s.revealed++;
      if (s.count[k] === 0) for (const m of around(k)) if (!s.open[m]) stack.push(m);
    }
    if (s.revealed === n - MS.MINES) (s.won = true), (s.dead = true);
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.revealed * 3 + (s.won ? 250 : 0),
};
function around(k) {
  const out = [];
  const x = k % MS.N;
  const y = Math.floor(k / MS.N);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < MS.N && ny < MS.N) out.push(ny * MS.N + nx);
    }
  return out;
}
function layMines(s, first) {
  const n = MS.N * MS.N;
  const safe = new Set([first, ...around(first)]);
  const spots = shuffle([...Array(n).keys()].filter((k) => !safe.has(k)), rng(s.seed));
  s.mine = Array(n).fill(false);
  for (const k of spots.slice(0, MS.MINES)) s.mine[k] = true;
  for (let k = 0; k < n; k++) s.count[k] = around(k).filter((m) => s.mine[m]).length;
}

// ——— Echo (Simon) ———
const echo = {
  key: 'echo', name: 'Echo', emoji: '🎵', desc: 'Watch the pads light up, then repeat the pattern. It grows by one each round.', TICK_MS: 0, TURN: true,
  controls: 'grid', cols: 2, rows: 2, gridInput: (i) => `c${i}`,
  init(seed) {
    const r = rng(seed);
    return { seed, r: 0, seq: Array.from({ length: 60 }, () => r.int(4)), round: 1, pos: 0, moves: 0, wrong: -1, dead: false };
  },
  step(s, input) {
    if (s.dead || !input || input[0] !== 'c') return s;
    const c = +input.slice(1);
    if (!(c >= 0 && c < 4)) return s;
    s.moves++;
    if (s.seq[s.pos] !== c) return ((s.wrong = c), (s.dead = true), s);
    s.pos++;
    if (s.pos === s.round) {
      s.round++;
      s.pos = 0;
      if (s.round > s.seq.length) s.dead = true;
    }
    return s;
  },
  over: (s) => s.dead,
  score: (s) => ((s.round - 1) * s.round) / 2 * 5,
};

// ——— 15 Puzzle (turn-based) ———
const slide = {
  key: 'slide', name: '15 Puzzle', emoji: '🧩', desc: 'Slide the tiles into order, 1 to 15. Fewer moves, bigger score.', TICK_MS: 0, TURN: true,
  controls: 'grid', cols: 4, rows: 4, gridInput: (i) => `t${i}`,
  init(seed) {
    const r = rng(seed);
    const t = [...Array(15).keys()].map((k) => k + 1).concat(0);
    let blank = 15;
    let prev = -1;
    for (let k = 0; k < 220; k++) {
      const opts = slideNeighbours(blank).filter((m) => m !== prev);
      const m = opts[r.int(opts.length)];
      [t[blank], t[m]] = [t[m], t[blank]];
      prev = blank;
      blank = m;
    }
    if (solved(t)) [t[0], t[1], t[4], t[5]] = [t[4], t[0], t[5], t[1]];
    return { seed, r: 0, tiles: t, moves: 0, done: false, dead: false };
  },
  step(s, input) {
    if (s.dead || !input || input[0] !== 't') return s;
    const i = +input.slice(1);
    const b = s.tiles.indexOf(0);
    if (!(i >= 0 && i < 16) || i === b) return s;
    const [ix, iy, bx, by] = [i % 4, Math.floor(i / 4), b % 4, Math.floor(b / 4)];
    if (ix !== bx && iy !== by) return s;
    // Tapping a tile in line with the gap slides the whole run of tiles.
    const step = ix === bx ? (iy < by ? -4 : 4) : ix < bx ? -1 : 1;
    let k = b;
    while (k !== i) {
      s.tiles[k] = s.tiles[k + step];
      k += step;
      s.moves++;
    }
    s.tiles[i] = 0;
    if (solved(s.tiles)) (s.done = true), (s.dead = true);
    return s;
  },
  over: (s) => s.dead,
  score: (s) => (s.done ? Math.max(100, 1200 - s.moves * 4) : 0),
};
function slideNeighbours(b) {
  const out = [];
  if (b % 4 > 0) out.push(b - 1);
  if (b % 4 < 3) out.push(b + 1);
  if (b >= 4) out.push(b - 4);
  if (b < 12) out.push(b + 4);
  return out;
}
const solved = (t) => t.every((v, k) => v === (k === 15 ? 0 : k + 1));

export const ARCADE_MORE = { breakout, meteor, runner, whack, memory, mines, echo, slide };
