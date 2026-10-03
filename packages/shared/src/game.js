export const TIERS = [
  { key: 'meh', score: 1, label: 'Meh', emoji: '😐', xp: 10 },
  { key: 'chill', score: 2, label: 'Chill', emoji: '🙂', xp: 25 },
  { key: 'drippy', score: 3, label: 'Drippy', emoji: '💧', xp: 50 },
  { key: 'fire', score: 4, label: 'Fire', emoji: '🔥', xp: 75 },
  { key: 'god', score: 5, label: 'God Tier', emoji: '👑', xp: 100 },
];

export const tierByScore = (s) => TIERS[Math.min(4, Math.max(0, Math.round(s) - 1))];
export const tierByKey = (k) => TIERS.find((t) => t.key === k);

export const REACTIONS = [
  { key: 'fire', emoji: '🔥' },
  { key: 'heart', emoji: '🧡' },
  { key: 'lol', emoji: '😂' },
  { key: 'wow', emoji: '🤯' },
  { key: 'hundred', emoji: '💯' },
];
export const REACTION_KEYS = REACTIONS.map((r) => r.key);

export function summarizeRatings(dist) {
  const count = dist.reduce((a, b) => a + b, 0);
  const avg = count ? dist.reduce((a, n, i) => a + n * (i + 1), 0) / count : 0;
  let modal = 0;
  for (let i = 1; i < 5; i++) if (dist[i] >= dist[modal]) modal = i;
  return {
    count,
    avg: Math.round(avg * 100) / 100,
    dist,
    tier: count ? TIERS[modal].key : 'chill',
    consensusPct: count ? Math.round((dist[modal] / count) * 100) : 0,
  };
}

/** Converts avg (1..5) to the 0–10 "vibe score" shown in the UI. */
export const toTen = (avg) => (avg ? Math.round(((avg - 1) / 4) * 100) / 10 : 0);

// ——— Levels ———
export const xpForLevel = (level) => Math.round(100 * Math.pow(level - 1, 1.6));
export function levelForXp(xp) {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
}
export function levelProgress(xp) {
  const lvl = levelForXp(xp);
  const base = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  return { level: lvl, into: xp - base, needed: next - base, pct: (xp - base) / (next - base) };
}
export const LEVEL_TITLES = [
  [1, 'Fresh Spark'],
  [5, 'Golden Hour Regular'],
  [10, 'Vibe Curator'],
  [16, 'Vibe Master'],
  [25, 'Sunset Legend'],
  [40, 'God Tier Icon'],
];
export const levelTitle = (lvl) => [...LEVEL_TITLES].reverse().find(([min]) => lvl >= min)?.[1] ?? 'Fresh Spark';

// ——— Roulette combos ———
export const COMBO_STEP = 0.25;
export const COMBO_MAX = 3;
export const comboMultiplier = (combo) => Math.min(COMBO_MAX, 1 + Math.max(0, combo - 1) * COMBO_STEP);
export const ROULETTE_BASE_SPARKS = 15;
export const ROULETTE_BASE_XP = 20;

// ——— Hot Take Arena (parimutuel pools, 5% house rake burns Sparks) ———
export const ARENA_RAKE = 0.05;
export const ARENA_MIN_STAKE = 5;
export const ARENA_MAX_STAKE = 500;
export function arenaOdds(agreePool, disagreePool) {
  const a = Math.max(agreePool, 1);
  const d = Math.max(disagreePool, 1);
  const total = (a + d) * (1 - ARENA_RAKE);
  return {
    agree: Math.max(1.05, Math.round((total / a) * 100) / 100),
    disagree: Math.max(1.05, Math.round((total / d) * 100) / 100),
    agreePct: Math.round((a / (a + d)) * 100),
  };
}

// ——— Rewards table ———
export const REWARDS = {
  dailyLogin: { sparks: 10, xp: 15 },
  drop: { sparks: 120, xp: 80 },
  post: { sparks: 20, xp: 30 },
  rate: { sparks: 2, xp: 5 },
  comment: { sparks: 3, xp: 8 },
  receiveGodTier: { sparks: 5, xp: 10 },
  questDailyOracle: { sparks: 100, xp: 150, target: 20 },
  streakMilestone: (days) => ({ sparks: days * 10, xp: days * 5 }),
};

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100, 365];

// ——— Loot crate (odds are published in-app, per store guidelines) ———
export const CRATE_ODDS = { common: 0.62, rare: 0.27, epic: 0.09, legendary: 0.02 };
export function rollRarity(rand = Math.random()) {
  let acc = 0;
  for (const [r, p] of Object.entries(CRATE_ODDS)) {
    acc += p;
    if (rand < acc) return r;
  }
  return 'common';
}

export const GIFTS = [
  { id: 'gift_spark', name: 'Spark', emoji: '⚡', price: 5, rarity: 'common' },
  { id: 'gift_superlol', name: 'Super LOL', emoji: '😂', price: 20, rarity: 'common' },
  { id: 'gift_flare', name: 'Sunset Flare', emoji: '🌇', price: 50, rarity: 'rare' },
  { id: 'gift_crown', name: 'Golden Crown', emoji: '👑', price: 150, rarity: 'epic' },
  { id: 'gift_supernova', name: 'Supernova', emoji: '🌞', price: 500, rarity: 'legendary' },
];

export const MIN_AGE = 18;
export function ageFrom(birthdate, now = new Date()) {
  const b = new Date(birthdate);
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function compact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function countdown(toIso, now = Date.now()) {
  const ms = Math.max(0, new Date(toIso).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ——— Premium currency ———
/** Gems are sold for money and only buy cosmetics. Loot crates and anything wager-like stay earned-Sparks-only. */
export function gemPriceFor(kind, sparksPrice) {
  // Crates, gifts, sticker & emoji packs and unlocks are Sparks-only.
  if (['crate', 'gift', 'stickers', 'emojis', 'unlock', 'ticket', 'king'].includes(kind)) return null;
  return Math.max(1, Math.ceil(sparksPrice / 10));
}

export const GEM_PACKS = [
  { id: 'gems_80', gems: 80, bonus: 0, usd: 0.99, label: 'Pocket Glow' },
  { id: 'gems_450', gems: 400, bonus: 50, usd: 4.99, label: 'Golden Pouch' },
  { id: 'gems_1000', gems: 850, bonus: 150, usd: 9.99, label: 'Sunset Chest', best: true },
  { id: 'gems_2200', gems: 1700, bonus: 500, usd: 19.99, label: 'Solar Vault' },
];
export const gemPack = (id) => GEM_PACKS.find((p) => p.id === id);
