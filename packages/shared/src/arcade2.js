import { rng, shuffle } from './games/rng.js';

/**
 * More arcade games, same contract as arcade.js: deterministic, seeded, replayed by the server from the inputs.
 * Real-time games (TICK_MS > 0) take one optional input per tick; turn games (TURN: true) take one input per move.
 * Every game has levels (`level(state)`) that keep getting harder, and every game ends on its own (lives, a clock,
 * a fail condition or a hard cap), so a replay always terminates.
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
// Levels: clear the wall to go up. Each level adds rows, tougher bricks (2–3 hits), a faster ball and a shorter paddle.
const BR = { W: 400, H: 500, PY: 468, R: 6, COLS: 8, BW: 46, BH: 16, TOP: 60, GAP: 3 };
const brPaddle = (lvl) => Math.max(44, 76 - 5 * (lvl - 1));
const breakout = {
  key: 'breakout', name: 'Brick Smash', emoji: '🧱', desc: 'Smash every brick. Each wall has more rows, tougher bricks, a faster ball and a smaller paddle.', TICK_MS: 1000 / 60, C: BR,
  controls: 'steer', level: (s) => s.level,
  init(seed) {
    const s = { seed, r: 0, x: BR.W / 2, vel: 0, target: null, lives: 3, level: 1, points: 0, ticks: 0, dead: false, bricks: [], ball: null, wait: 60, pw: brPaddle(1) };
    wall(s);
    return s;
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    steer(s, input, 7, s.pw / 2, BR.W - s.pw / 2);
    if (s.ticks > MINUTES(15)) return ((s.dead = true), s);
    if (s.wait > 0) {
      s.wait--;
      s.ball = { x: s.x, y: BR.PY - 14, vx: 0, vy: 0 };
      if (!s.wait) {
        const sp = Math.min(8, 4 + (s.level - 1) * 0.55);
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
    if (b.vy > 0 && b.y + BR.R >= BR.PY && b.y + BR.R <= BR.PY + 12 && Math.abs(b.x - s.x) <= s.pw / 2 + BR.R) {
      const sp = Math.hypot(b.vx, b.vy);
      const off = clamp((b.x - s.x) / (s.pw / 2), -1, 1);
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
    if (!s.bricks.some(Boolean)) {
      s.points += 50 * s.level; // wall-clear bonus
      s.level++;
      s.pw = brPaddle(s.level);
      wall(s);
      s.wait = 75;
    }
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};
/** A wall for the current level: more rows each level; the top rows take 2 or 3 hits later on. */
function wall(s) {
  const rows = Math.min(9, 3 + s.level);
  s.bricks = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < BR.COLS; c++) s.bricks.push(1 + (s.level >= 2 && r === 0 ? 1 : 0) + (s.level >= 4 && r <= 1 ? 1 : 0) + (s.level >= 6 && r <= 3 ? 1 : 0));
  for (let i = 0; i < s.bricks.length; i++) s.bricks[i] = Math.min(3, s.bricks[i]);
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
      s.bricks[i]--;
      s.points += Math.max(1, 9 - k.row); // top rows are worth more
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 9) (b.vx *= 1.01), (b.vy *= 1.01);
      return true;
    }
  }
  return false;
}

// ——— Meteor Dodge ———
// Levels: every 15 seconds. Rocks fall faster and more often; from level 3 they drift sideways, from 5 they come in pairs.
const MD = { W: 400, H: 600, SY: 540, SR: 14, LEVEL_TICKS: 15 * 60 };
const mdLevel = (s) => 1 + Math.floor(s.ticks / MD.LEVEL_TICKS);
const meteor = {
  key: 'meteor', name: 'Meteor Dodge', emoji: '☄️', desc: 'Dodge the rocks. Every 15 s: faster, thicker, then drifting rocks and doubles.', TICK_MS: 1000 / 60, C: MD,
  controls: 'steer', level: mdLevel,
  init(seed) {
    return { seed, r: 0, x: MD.W / 2, vel: 0, target: null, rocks: [], next: 30, points: 0, ticks: 0, dead: false };
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    const lvl = mdLevel(s);
    steer(s, input, 6.5, MD.SR, MD.W - MD.SR);
    if (s.ticks % 6 === 0) s.points += lvl;
    if (--s.next <= 0) {
      const r = rnd(s);
      const count = lvl >= 5 && r.next() < 0.5 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const rad = 10 + r.int(10 + Math.min(10, lvl * 2));
        s.rocks.push({
          x: rad + r.int(MD.W - rad * 2), y: -rad - k * 40, rad,
          v: 2.6 + 0.65 * (lvl - 1) + r.next() * 1.5,
          vx: lvl >= 3 ? (r.next() - 0.5) * Math.min(3, 0.8 + 0.4 * (lvl - 3)) : 0,
          spin: r.next() * 6,
        });
      }
      s.next = Math.max(7, 36 - 4 * (lvl - 1));
    }
    for (const k of s.rocks) {
      k.y += k.v;
      k.x += k.vx;
      if (k.x < k.rad || k.x > MD.W - k.rad) k.vx = -k.vx;
    }
    s.rocks = s.rocks.filter((k) => k.y - k.rad < MD.H);
    if (s.rocks.some((k) => Math.hypot(k.x - s.x, k.y - MD.SY) < k.rad + MD.SR - 3)) s.dead = true;
    if (s.ticks > MINUTES(15)) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};

// ——— Sunset Run ———
// Levels: every 2,500 px. Faster each level; double cacti from 2, birds (don't jump into them!) from 3, tighter gaps from 4.
const RN = { W: 600, H: 260, GY: 210, X: 80, PW: 30, PH: 38, LEVEL_DIST: 2500 };
const rnLevel = (s) => 1 + Math.floor(s.dist / RN.LEVEL_DIST);
const runner = {
  key: 'runner', name: 'Sunset Run', emoji: '🏃', desc: 'Jump the cacti, duck under the birds. Faster every level.', TICK_MS: 1000 / 60, C: RN,
  controls: 'tap', tapInput: 'j', level: rnLevel,
  init(seed) {
    return { seed, r: 0, y: 0, vy: 0, obs: [], gap: 260, dist: 0, points: 0, ticks: 0, dead: false };
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    const lvl = rnLevel(s);
    const speed = Math.min(16, 6 + 1.1 * (lvl - 1) + (s.dist % RN.LEVEL_DIST) / RN.LEVEL_DIST);
    if (input === 'j' && s.y === 0) s.vy = 12.5;
    s.y = Math.max(0, s.y + s.vy);
    s.vy = s.y === 0 ? 0 : s.vy - 0.65;
    const before = Math.floor(s.dist / 25);
    s.dist += speed;
    s.points += (Math.floor(s.dist / 25) - before) * (1 + Math.floor((lvl - 1) / 2));
    s.gap -= speed;
    if (s.gap <= 0) {
      const r = rnd(s);
      if (lvl >= 3 && r.next() < 0.3) {
        // A bird at head height: running underneath is safe, jumping into it isn't.
        s.obs.push({ x: RN.W + 20, w: 34, h: 18, fly: 46 + r.int(14) });
      } else {
        const w = 18 + r.int(3) * 10;
        const h = 30 + r.int(3) * 14;
        s.obs.push({ x: RN.W + 20, w, h, fly: 0 });
        if (lvl >= 2 && r.next() < 0.3) s.obs.push({ x: RN.W + 20 + w + 6, w: 18, h: 30 + r.int(2) * 14, fly: 0 });
      }
      const tight = lvl >= 4 ? Math.min(90, (lvl - 3) * 30) : 0;
      s.gap = 250 - tight + r.int(220) + speed * 10;
    }
    for (const o of s.obs) o.x -= speed;
    s.obs = s.obs.filter((o) => o.x + o.w > -10);
    for (const o of s.obs) {
      const overlapX = RN.X + RN.PW - 6 > o.x && RN.X + 6 < o.x + o.w;
      if (!overlapX) continue;
      if (o.fly) {
        if (s.y + RN.PH - 4 > o.fly && s.y + 4 < o.fly + o.h) s.dead = true;
      } else if (s.y < o.h - 4) s.dead = true;
    }
    if (s.ticks > MINUTES(15)) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};

// ——— Whack-a-Spark ———
// Levels: 20 seconds each with a hit target. Make the target to go up a level; miss it and the run ends. Sparks get
// quicker and more numerous, and bombs appear from level 3 (hitting one costs points and hits).
const WH = { HOLES: 9, LEVEL_TICKS: 20 * 60 };
const whGoal = (lvl) => 8 + 4 * (lvl - 1);
const whack = {
  key: 'whack', name: 'Whack-a-Spark', emoji: '🔨', desc: 'Hit the target in 20 s to level up. Faster sparks every level — and bombs from level 3.', TICK_MS: 1000 / 60, C: WH,
  controls: 'grid', cols: 3, rows: 3, gridInput: (i) => `h${i}`, level: (s) => s.level,
  init(seed) {
    return { seed, r: 0, level: 1, levelHits: 0, clock: 0, up: Array(WH.HOLES).fill(null), next: 20, points: 0, hits: 0, misses: 0, ticks: 0, dead: false, flash: Array(WH.HOLES).fill(0) };
  },
  step(s, input) {
    if (s.dead) return s;
    s.ticks++;
    s.clock++;
    for (let i = 0; i < WH.HOLES; i++) {
      if (s.flash[i]) s.flash[i]--;
      if (s.up[i] && --s.up[i].left <= 0) s.up[i] = null;
    }
    if (input && input[0] === 'h') {
      const i = +input.slice(1);
      if (i >= 0 && i < WH.HOLES) {
        const u = s.up[i];
        if (u?.bomb) (s.points = Math.max(0, s.points - 25)), (s.levelHits = Math.max(0, s.levelHits - 2)), (s.up[i] = null), (s.flash[i] = -12);
        else if (u) (s.points += (u.gold ? 3 : 1) * (10 + 2 * (s.level - 1))), s.hits++, s.levelHits++, (s.up[i] = null), (s.flash[i] = 12);
        else (s.points = Math.max(0, s.points - 5)), s.misses++;
      }
    }
    if (--s.next <= 0) {
      const r = rnd(s);
      const free = s.up.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0);
      const live = WH.HOLES - free.length;
      if (free.length && live < Math.min(5, 1 + s.level)) {
        const life = Math.max(20, 70 - 8 * (s.level - 1));
        const bomb = s.level >= 3 && r.next() < Math.min(0.3, 0.1 * (s.level - 2));
        s.up[free[r.int(free.length)]] = { left: life, life, gold: !bomb && r.next() < 0.1, bomb };
      }
      s.next = Math.max(6, 30 - 4 * (s.level - 1));
    }
    if (s.clock >= WH.LEVEL_TICKS) {
      if (s.levelHits >= whGoal(s.level)) {
        s.points += 40 * s.level;
        s.level++;
        s.levelHits = 0;
        s.clock = 0;
        s.up = Array(WH.HOLES).fill(null);
        s.next = 45;
      } else s.dead = true;
    }
    if (s.ticks > MINUTES(15)) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
  goal: (s) => whGoal(s.level),
};

// ——— Memory Match (turn-based) ———
// Levels: a bigger board each time (6 → 8 → 10 → 12 → 15 → 18 pairs) with fewer misses allowed. Run out of misses
// and the run ends.
const MEM_FACES = ['🌅', '🔥', '🧡', '👑', '✨', '🎧', '🍉', '🌴', '🚀', '🦄', '🍕', '🎲', '🌈', '🐙', '🍩', '⚡', '🎸', '🌙'];
const MEM_SIZES = [[4, 3], [4, 4], [5, 4], [6, 4], [6, 5], [6, 6]];
const memSize = (lvl) => MEM_SIZES[Math.min(MEM_SIZES.length - 1, lvl - 1)];
const memAllowed = (lvl, pairs) => Math.max(Math.ceil(pairs * 0.6), Math.ceil(pairs * (1.6 - 0.15 * (lvl - 1))));
const memory = {
  key: 'memory', name: 'Memory Match', emoji: '🃏', desc: 'Find every pair. Each level: a bigger board and fewer misses allowed.', TICK_MS: 0, TURN: true,
  controls: 'grid', grid: (s) => memSize(s.level), gridInput: (i) => `f${i}`, faces: MEM_FACES, level: (s) => s.level,
  init(seed) {
    const s = { seed, r: 0, level: 1, points: 0, moves: 0, dead: false };
    deal(s);
    return s;
  },
  step(s, input) {
    if (s.dead || !input || input[0] !== 'f') return s;
    const i = +input.slice(1);
    if (!(i >= 0 && i < s.cards.length) || s.matched[i] || s.open.includes(i)) return s;
    s.moves++;
    if (s.open.length === 2) s.open = []; // the last unmatched pair turns back over
    s.open.push(i);
    if (s.open.length === 2) {
      const [a, b] = s.open;
      if (s.cards[a] === s.cards[b]) (s.matched[a] = s.matched[b] = true), s.pairs++, (s.open = []), (s.points += 10 + 2 * (s.level - 1));
      else if (++s.misses > s.allowed) s.dead = true;
    }
    if (s.pairs === s.cards.length / 2) {
      s.points += Math.max(0, s.allowed - s.misses) * 5 * s.level + 50 * s.level;
      s.level++;
      deal(s);
    }
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};
function deal(s) {
  const [c, r] = memSize(s.level);
  const pairs = (c * r) / 2;
  const faces = [...Array(pairs).keys()];
  s.cards = shuffle([...faces, ...faces], rng(s.seed + s.level * 4099));
  s.matched = Array(c * r).fill(false);
  s.open = [];
  s.pairs = 0;
  s.misses = 0;
  s.allowed = memAllowed(s.level, pairs);
}

// ——— Minesweeper (turn-based) ———
// Levels: clear a field to get a bigger, denser one (8×8/8 → 16×16/52). Hit a mine and the run ends.
const MS_LEVELS = [[8, 8], [9, 12], [10, 17], [12, 26], [14, 38], [16, 52]];
const msLevel = (lvl) => MS_LEVELS[Math.min(MS_LEVELS.length - 1, lvl - 1)];
const mines = {
  key: 'mines', name: 'Minesweeper', emoji: '💣', desc: 'Clear the field to reach a bigger, deadlier one. Long-press or right-click to flag.', TICK_MS: 0, TURN: true,
  controls: 'grid', grid: (s) => [s.n, s.n], gridInput: (i, alt) => `${alt ? 'f' : 'o'}${i}`, level: (s) => s.level,
  init(seed) {
    const s = { seed, r: 0, level: 1, points: 0, moves: 0, won: false, boom: -1, dead: false };
    field(s);
    return s;
  },
  step(s, input) {
    if (s.dead || !input) return s;
    const i = +input.slice(1);
    const n = s.n * s.n;
    if (!(i >= 0 && i < n)) return s;
    s.moves++;
    if (input[0] === 'f') {
      if (!s.open[i]) s.flag[i] = !s.flag[i];
      return s;
    }
    if (input[0] !== 'o' || s.open[i] || s.flag[i]) return s;
    if (!s.mine) layMines(s, i); // the first tap on each field is always safe
    if (s.mine[i]) return ((s.boom = i), (s.dead = true), s);
    const stack = [i];
    while (stack.length) {
      const k = stack.pop();
      if (s.open[k] || s.mine[k]) continue;
      s.open[k] = true;
      s.flag[k] = false;
      s.revealed++;
      s.points += 1 + Math.floor((s.level - 1) / 2);
      if (s.count[k] === 0) for (const m of around(s.n, k)) if (!s.open[m]) stack.push(m);
    }
    if (s.revealed === n - s.mines) {
      s.points += 120 * s.level;
      s.level++;
      field(s);
    }
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};
function field(s) {
  const [n, m] = msLevel(s.level);
  s.n = n;
  s.mines = m;
  s.mine = null;
  s.open = Array(n * n).fill(false);
  s.flag = Array(n * n).fill(false);
  s.count = Array(n * n).fill(0);
  s.revealed = 0;
}
function around(N, k) {
  const out = [];
  const x = k % N;
  const y = Math.floor(k / N);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N) out.push(ny * N + nx);
    }
  return out;
}
function layMines(s, first) {
  const n = s.n * s.n;
  const safe = new Set([first, ...around(s.n, first)]);
  const spots = shuffle([...Array(n).keys()].filter((k) => !safe.has(k)), rng(s.seed + s.level * 3571));
  s.mine = Array(n).fill(false);
  for (const k of spots.slice(0, s.mines)) s.mine[k] = true;
  for (let k = 0; k < n; k++) s.count[k] = around(s.n, k).filter((m) => s.mine[m]).length;
}

// ——— Echo (Simon) ———
// Levels: every 5 rounds. The pattern plays back faster, and the board grows: 4 pads → 6 (level 3) → 9 (level 5),
// with a brand-new pattern each time the board grows.
const echoLevel = (round) => 1 + Math.floor((round - 1) / 5);
const echoPads = (lvl) => (lvl >= 5 ? 9 : lvl >= 3 ? 6 : 4);
const ECHO_GRID = { 4: [2, 2], 6: [3, 2], 9: [3, 3] };
const echo = {
  key: 'echo', name: 'Echo', emoji: '🎵', desc: 'Repeat the pattern. Every 5 rounds it plays faster — and the board grows to 6, then 9 pads.', TICK_MS: 0, TURN: true,
  controls: 'grid', grid: (s) => ECHO_GRID[echoPads(echoLevel(s.round))], gridInput: (i) => `c${i}`, level: (s) => echoLevel(s.round),
  /** Playback speed for the client (ms per pad). */
  stepMs: (s) => Math.max(240, 560 - 45 * (echoLevel(s.round) - 1)),
  init(seed) {
    const s = { seed, r: 0, seq: [], round: 1, pos: 0, moves: 0, points: 0, wrong: -1, dead: false };
    pattern(s);
    return s;
  },
  step(s, input) {
    if (s.dead || !input || input[0] !== 'c') return s;
    const c = +input.slice(1);
    if (!(c >= 0 && c < echoPads(echoLevel(s.round)))) return s;
    s.moves++;
    if (s.seq[s.pos] !== c) return ((s.wrong = c), (s.dead = true), s);
    s.pos++;
    if (s.pos === s.round) {
      s.points += s.round * 5 + 10 * (echoLevel(s.round) - 1);
      const before = echoPads(echoLevel(s.round));
      s.round++;
      s.pos = 0;
      if (echoPads(echoLevel(s.round)) !== before) pattern(s);
      if (s.round > 99) s.dead = true;
    }
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};
function pattern(s) {
  const pads = echoPads(echoLevel(s.round));
  const r = rng(s.seed + pads * 6007);
  s.seq = Array.from({ length: 100 }, () => r.int(pads));
}

// ——— Slide Puzzle (turn-based) ———
// Levels: solve one to get the next — 3×3, 4×4, then 5×5 and 6×6, shuffled deeper each time.
const SL_LEVELS = [[3, 60], [4, 140], [4, 260], [5, 320], [5, 480], [6, 640]];
const slLevel = (lvl) => SL_LEVELS[Math.min(SL_LEVELS.length - 1, lvl - 1)];
const slide = {
  key: 'slide', name: 'Slide Puzzle', emoji: '🧩', desc: 'Put the tiles in order. Each level: a bigger, more scrambled board.', TICK_MS: 0, TURN: true,
  controls: 'grid', grid: (s) => [s.n, s.n], gridInput: (i) => `t${i}`, level: (s) => s.level,
  init(seed) {
    const s = { seed, r: 0, level: 1, points: 0, moves: 0, levelMoves: 0, dead: false };
    scramble(s);
    return s;
  },
  step(s, input) {
    if (s.dead || !input || input[0] !== 't') return s;
    const N = s.n;
    const i = +input.slice(1);
    const b = s.tiles.indexOf(0);
    if (!(i >= 0 && i < N * N) || i === b) return s;
    const [ix, iy, bx, by] = [i % N, Math.floor(i / N), b % N, Math.floor(b / N)];
    if (ix !== bx && iy !== by) return s;
    // Tapping a tile in line with the gap slides the whole run of tiles.
    const step = ix === bx ? (iy < by ? -N : N) : ix < bx ? -1 : 1;
    let k = b;
    while (k !== i) {
      s.tiles[k] = s.tiles[k + step];
      k += step;
      s.moves++;
      s.levelMoves++;
    }
    s.tiles[i] = 0;
    if (solvedN(s.tiles)) {
      s.points += Math.max(50 * s.level, 300 * s.level - s.levelMoves * 2);
      s.level++;
      scramble(s);
    }
    if (s.moves > 20000) s.dead = true;
    return s;
  },
  over: (s) => s.dead,
  score: (s) => s.points,
};
function scramble(s) {
  const [N, depth] = slLevel(s.level);
  const r = rng(s.seed + s.level * 2711);
  const t = [...Array(N * N - 1).keys()].map((k) => k + 1).concat(0);
  let blank = N * N - 1;
  let prev = -1;
  for (let k = 0; k < depth; k++) {
    const opts = neighbours(N, blank).filter((m) => m !== prev);
    const m = opts[r.int(opts.length)];
    [t[blank], t[m]] = [t[m], t[blank]];
    prev = blank;
    blank = m;
  }
  if (solvedN(t)) [t[0], t[1]] = [t[1], t[0]], ([t[N], t[N + 1]] = [t[N + 1], t[N]]);
  s.n = N;
  s.tiles = t;
  s.levelMoves = 0;
}
function neighbours(N, b) {
  const out = [];
  if (b % N > 0) out.push(b - 1);
  if (b % N < N - 1) out.push(b + 1);
  if (b >= N) out.push(b - N);
  if (b < N * N - N) out.push(b + N);
  return out;
}
const solvedN = (t) => t.every((v, k) => v === (k === t.length - 1 ? 0 : k + 1));

export const ARCADE_MORE = { breakout, meteor, runner, whack, memory, mines, echo, slide };
