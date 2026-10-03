import { rng } from './rng.js';

/**
 * Mahjong Race: everyone gets the same solitaire layout (80 tiles in three layers) and races to clear it.
 * Match two identical free tiles (nothing on top, and a free left or right side). The deal is built by removing
 * free pairs in reverse, so it's always solvable. First to clear wins; when the 5 minutes run out, most pairs wins.
 */
const RACE_MS = 5 * 60_000;
export const MAHJONG_FACES = [
  '🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏', '🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡',
  '🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘', '🀀', '🀁', '🀂', '🀃', '🀄', '🀅', '🀆',
];

/** Tile slots: { x, y, z } on a half-tile grid (x, y in tile units). */
function layout() {
  const out = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) out.push({ x, y, z: 0 });
  for (let y = 1; y < 5; y++) for (let x = 1; x < 7; x++) out.push({ x, y, z: 1 });
  for (let y = 2; y < 4; y++) for (let x = 2; x < 6; x++) out.push({ x, y, z: 2 });
  return out; // 48 + 24 + 8 = 80
}
export const MAHJONG_SLOTS = layout();

/** Is tile i free, given which tiles are still present? */
export function mahjongFree(present, i) {
  if (!present[i]) return false;
  const t = MAHJONG_SLOTS[i];
  const at = (x, y, z) => MAHJONG_SLOTS.findIndex((u, k) => present[k] && u.x === x && u.y === y && u.z === z) >= 0;
  if (at(t.x, t.y, t.z + 1)) return false;
  return !at(t.x - 1, t.y, t.z) || !at(t.x + 1, t.y, t.z);
}

function deal(seed) {
  for (let attempt = 0; ; attempt++) {
    const faces = tryDeal(seed + attempt * 7919);
    if (faces) return faces;
  }
}
function tryDeal(seed) {
  const r = rng(seed);
  const present = MAHJONG_SLOTS.map(() => true);
  const faces = Array(MAHJONG_SLOTS.length).fill(null);
  // Remove random free pairs; the order reversed is a guaranteed solution.
  for (let k = 0; k < MAHJONG_SLOTS.length / 2; k++) {
    const free = present.map((p, i) => i).filter((i) => mahjongFree(present, i));
    const a = free.splice(r.int(free.length), 1)[0];
    present[a] = false;
    const free2 = present.map((p, i) => i).filter((i) => mahjongFree(present, i));
    if (!free2.length) return null; // painted into a corner: deal again
    const b = free2[r.int(free2.length)];
    present[b] = false;
    const face = MAHJONG_FACES[k % MAHJONG_FACES.length];
    faces[a] = face;
    faces[b] = face;
  }
  return faces;
}

export function initMahjong(n, seed, { now = Date.now() } = {}) {
  return { n, faces: deal(seed), boards: Array.from({ length: n }, () => MAHJONG_SLOTS.map(() => true)), pairs: Array(n).fill(0), endsAt: now + RACE_MS, finishedAt: Array(n).fill(null), result: null };
}

/** action: { type: 'pair', a, b } */
export function mahjongMove(s0, seat, act) {
  if (s0.result) throw new Error('The game is over');
  const a = Number(act.a);
  const b = Number(act.b);
  const board = s0.boards[seat];
  if (a === b || !mahjongFree(board, a) || !mahjongFree(board, b)) throw new Error('Both tiles must be free');
  if (s0.faces[a] !== s0.faces[b]) throw new Error('Those don’t match');
  const s = structuredClone(s0);
  s.boards[seat][a] = false;
  s.boards[seat][b] = false;
  s.pairs[seat]++;
  if (s.pairs[seat] === MAHJONG_SLOTS.length / 2) {
    s.finishedAt[seat] = act.at ?? Date.now();
    s.result = { winners: [seat], pairs: s.pairs, reason: 'cleared the board first' };
  }
  return s;
}

export function mahjongTimeout(s0) {
  const s = structuredClone(s0);
  const best = Math.max(...s.pairs);
  s.result = { winners: s.pairs.map((p, i) => i).filter((i) => s.pairs[i] === best), pairs: s.pairs, reason: 'time’s up — most pairs wins' };
  return s;
}

/** Each player sees their own board; opponents' progress as pair counts. */
export function mahjongView(s, seat) {
  return { n: s.n, faces: s.faces, board: seat >= 0 ? s.boards[seat] : s.boards[0], pairs: s.pairs, endsAt: s.endsAt, result: s.result };
}
