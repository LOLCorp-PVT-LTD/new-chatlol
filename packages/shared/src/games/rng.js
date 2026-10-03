/** Small seeded PRNG (mulberry32): games keep their seed in state, so a replay is deterministic on the server. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n), get seed() { return a; } };
}

export function shuffle(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
