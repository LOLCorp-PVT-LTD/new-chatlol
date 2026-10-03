/**
 * 8-ball pool for 2 players with deterministic physics: the server and every client run `simulateShot` on the same
 * input and get the same result, so clients animate the exact shot the server decided.
 * Balls: 0 = cue, 1–7 solids, 8 = black, 9–15 stripes. Table 1000 × 500, ball radius 12.
 */
export const POOL = { W: 1000, H: 500, R: 12, POCKET: 26 };
export const POCKETS = [
  [0, 0], [POOL.W / 2, -6], [POOL.W, 0],
  [0, POOL.H], [POOL.W / 2, POOL.H + 6], [POOL.W, POOL.H],
];
const FRICTION = 0.988; // per step
const STOP = 0.02;
const MAX_SPEED = 26;
const HEAD = { x: 250, y: 250 };
const group = (b) => (b === 0 || b === 8 ? null : b < 8 ? 'solids' : 'stripes');

export function rack() {
  const balls = [{ id: 0, x: HEAD.x, y: HEAD.y, in: false }];
  // Triangle with the 8 in the middle, a solid and a stripe in the back corners.
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let k = 0;
  const d = POOL.R * 2 + 0.5;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++) balls.push({ id: order[k++], x: 700 + row * d * 0.87, y: 250 + (i - row / 2) * d, in: false });
  return balls.sort((a, b) => a.id - b.id);
}

/**
 * Runs one shot. Returns { balls, potted, firstHit, frames } — frames (positions every few steps) are only
 * collected when `frames` is true (clients animating).
 */
export function simulateShot(balls0, angle, power, { frames: wantFrames = false } = {}) {
  const balls = balls0.map((b) => ({ ...b, vx: 0, vy: 0 }));
  const cue = balls.find((b) => b.id === 0);
  const sp = Math.max(0.05, Math.min(1, power)) * MAX_SPEED;
  cue.vx = Math.cos(angle) * sp;
  cue.vy = Math.sin(angle) * sp;
  const potted = [];
  let firstHit = null;
  const frames = [];
  const R = POOL.R;
  for (let step = 0; step < 4000; step++) {
    let moving = false;
    for (const b of balls) {
      if (b.in) continue;
      b.x += b.vx;
      b.y += b.vy;
      // Pockets.
      if (POCKETS.some(([px, py]) => (b.x - px) ** 2 + (b.y - py) ** 2 < POOL.POCKET ** 2)) {
        b.in = true;
        b.vx = b.vy = 0;
        potted.push(b.id);
        continue;
      }
      // Cushions.
      if (b.x < R) (b.x = R), (b.vx = -b.vx * 0.85);
      if (b.x > POOL.W - R) (b.x = POOL.W - R), (b.vx = -b.vx * 0.85);
      if (b.y < R) (b.y = R), (b.vy = -b.vy * 0.85);
      if (b.y > POOL.H - R) (b.y = POOL.H - R), (b.vy = -b.vy * 0.85);
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      if (Math.abs(b.vx) < STOP && Math.abs(b.vy) < STOP) b.vx = b.vy = 0;
      else moving = true;
    }
    // Ball–ball collisions (equal masses, elastic).
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.in) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.in) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= 2 * R) continue;
        if (firstHit === null && (a.id === 0 || b.id === 0)) firstHit = a.id === 0 ? b.id : a.id;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = 2 * R - dist;
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;
        const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (p <= 0) continue;
        a.vx -= p * nx;
        a.vy -= p * ny;
        b.vx += p * nx;
        b.vy += p * ny;
      }
    }
    if (wantFrames && step % 2 === 0) frames.push(balls.map((b) => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.in ? 1 : 0]));
    if (!moving) break;
  }
  return { balls: balls.map(({ vx, vy, ...b }) => b), potted, firstHit, frames };
}

export function initPool() {
  return { balls: rack(), turn: 0, groups: [null, null], ballInHand: false, broke: false, shot: null, lastShot: null, log: [], result: null };
}

function spotCue(balls, at = HEAD) {
  const cue = balls.find((b) => b.id === 0);
  let { x, y } = at;
  for (let tries = 0; tries < 50 && balls.some((b) => b.id !== 0 && !b.in && Math.hypot(b.x - x, b.y - y) < POOL.R * 2); tries++) x -= 6;
  Object.assign(cue, { x, y, in: false });
}

/** action: { type: 'shoot', angle, power, cueX?, cueY? } (cue position only with ball in hand, behind the head line). */
export function poolMove(s0, seat, a) {
  if (s0.result) throw new Error('The game is over');
  if (seat !== s0.turn) throw new Error('Not your turn');
  if (a.type !== 'shoot') throw new Error('Unknown action');
  const angle = Number(a.angle);
  const power = Number(a.power);
  if (!Number.isFinite(angle) || !Number.isFinite(power)) throw new Error('Aim first');
  const s = structuredClone(s0);
  if (s.ballInHand && Number.isFinite(Number(a.cueX))) spotCue(s.balls, { x: Math.min(POOL.W / 4, Math.max(POOL.R, Number(a.cueX))), y: Math.min(POOL.H - POOL.R, Math.max(POOL.R, Number(a.cueY))) });
  const before = s.balls.map((b) => ({ ...b }));
  const r = simulateShot(s.balls, angle, power);
  s.balls = r.balls;
  s.lastShot = { seat, before, angle, power, potted: r.potted };
  const mineG = s.groups[seat];
  const objPotted = r.potted.filter((id) => id !== 0);
  let foul = r.potted.includes(0) || r.firstHit === null || (mineG && group(r.firstHit) !== mineG && !(r.firstHit === 8 && left(s, seat) === 0)) || (!mineG && r.firstHit === 8);
  // Groups are decided by the first legal pot after the break.
  if (!mineG && s.broke && !foul) {
    const g = objPotted.map(group).filter(Boolean);
    if (g.length && g.every((x) => x === g[0])) (s.groups[seat] = g[0]), (s.groups[1 - seat] = g[0] === 'solids' ? 'stripes' : 'solids');
  }
  s.broke = true;
  if (objPotted.includes(8)) {
    const cleared = s.groups[seat] && left(s, seat) === 0;
    s.result = { winners: [cleared && !foul ? seat : 1 - seat], reason: cleared && !foul ? 'potted the 8-ball' : 'potted the 8-ball too early' };
    return s;
  }
  const own = s.groups[seat] ? objPotted.some((id) => group(id) === s.groups[seat]) : objPotted.length > 0;
  s.ballInHand = !!foul;
  if (foul) spotCue(s.balls);
  s.log = [...s.log.slice(-5), foul ? `Foul by player ${seat + 1}` : objPotted.length ? `Player ${seat + 1} potted ${objPotted.join(', ')}` : `Player ${seat + 1} missed`];
  if (foul || !own) s.turn = 1 - seat;
  return s;
}
const left = (s, seat) => s.balls.filter((b) => !b.in && group(b.id) === s.groups[seat]).length;

/** Timeout: a gentle shot at the nearest legal ball. */
export function poolTimeout(s) {
  const cue = s.balls.find((b) => b.id === 0);
  const g = s.groups[s.turn];
  const targets = s.balls.filter((b) => !b.in && b.id !== 0 && (g ? group(b.id) === g || (left(s, s.turn) === 0 && b.id === 8) : b.id !== 8));
  const t = targets.sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0] ?? s.balls.find((b) => b.id === 8);
  return poolMove(s, s.turn, { type: 'shoot', angle: Math.atan2(t.y - cue.y, t.x - cue.x), power: 0.55 });
}
export const poolView = (s) => s;
