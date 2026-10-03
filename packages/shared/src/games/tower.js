/**
 * Tower Stack for 2–4 players, turn by turn: a block slides back and forth above the tower; drop it to stack it.
 * Only the part that overlaps the block below stays. Miss completely and you're out. The block's position comes
 * from the server's clock (time since the turn started), so the drop can't be faked. Last player standing wins;
 * if the tower reaches 30 floors, the most successful drops wins.
 */
export const TOWER = { W: 600, BASE: 260, FLOORS: 30 };
const speedAt = (floor) => 220 + floor * 18; // px per second

/** Where the sliding block is `ms` after its turn began (bounces between the walls). */
export function towerX(width, floor, ms) {
  const span = TOWER.W - width;
  if (span <= 0) return 0;
  const d = (speedAt(floor) * ms) / 1000;
  const m = d % (2 * span);
  return m <= span ? m : 2 * span - m;
}

export function initTower(n, seed, { now = Date.now() } = {}) {
  return { n, stack: [{ x: (TOWER.W - TOWER.BASE) / 2, w: TOWER.BASE, seat: null }], turn: 0, out: Array(n).fill(false), drops: Array(n).fill(0), turnStartedAt: now, last: null, result: null };
}

function nextSeat(s) {
  for (let k = 1; k <= s.n; k++) {
    const i = (s.turn + k) % s.n;
    if (!s.out[i]) return i;
  }
  return s.turn;
}

/** action: { type: 'drop', at } — `at` is the server's receive time. */
export function towerMove(s0, seat, a) {
  if (s0.result) throw new Error('The game is over');
  if (seat !== s0.turn) throw new Error('Not your turn');
  const s = structuredClone(s0);
  const top = s.stack.at(-1);
  const floor = s.stack.length;
  const at = Number(a.at ?? Date.now());
  const x = towerX(top.w, floor, Math.max(0, at - s.turnStartedAt));
  const left = Math.max(x, top.x);
  const right = Math.min(x + top.w, top.x + top.w);
  const w = right - left;
  if (w <= 1) {
    s.out[seat] = true;
    s.last = { seat, x, w: top.w, miss: true };
  } else {
    const perfect = Math.abs(x - top.x) < 3; // near-perfect drops snap and keep their full width
    s.stack.push(perfect ? { x: top.x, w: top.w, seat } : { x: left, w, seat });
    s.drops[seat]++;
    s.last = { seat, x, w: top.w, kept: perfect ? top.w : w, perfect };
  }
  const alive = s.out.map((o, i) => i).filter((i) => !s.out[i]);
  if (alive.length <= 1 || s.stack.length > TOWER.FLOORS) {
    const best = Math.max(...s.drops);
    const winners = alive.length === 1 ? alive : s.drops.map((d, i) => i).filter((i) => s.drops[i] === best && (alive.length ? !s.out[i] : true));
    s.result = { winners, drops: s.drops, reason: alive.length <= 1 ? 'last builder standing' : `${TOWER.FLOORS} floors built` };
    return s;
  }
  s.turn = nextSeat(s);
  s.turnStartedAt = at;
  return s;
}

/** Timeout: the block drops wherever it is. */
export const towerTimeout = (s, now = Date.now()) => towerMove(s, s.turn, { type: 'drop', at: now });
export const towerView = (s) => s;
