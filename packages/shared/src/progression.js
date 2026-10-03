/**
 * Progression rules shared by server and clients: power-up items, level gates, the daily check-in streak,
 * the inactivity reset and which profile options need Premium.
 */

// ——— Power-ups ———
/**
 * Consumable Vault items with a real effect. `minutes`: how long one use lasts (null = used up automatically
 * when it's needed, like the Streak Freeze). `auto`: can't be activated by hand.
 */
export const POWERS = [
  {
    key: 'xp_surge',
    name: 'XP Surge',
    emoji: '🚀',
    desc: 'Double XP from everything for 1 hour — level up twice as fast',
    minutes: 60,
    price: 400,
    rarity: 'rare',
  },
  {
    key: 'boost_2x',
    name: 'Spark Surge',
    emoji: '⚡',
    desc: 'Double Sparks from every reward for 1 hour',
    minutes: 60,
    price: 350,
    rarity: 'rare',
  },
  {
    key: 'spotlight',
    name: 'Spotlight',
    emoji: '🔦',
    desc: 'Pin your profile to the top of Browse Members and Rate & Meet for 1 hour',
    minutes: 60,
    price: 500,
    rarity: 'epic',
  },
  {
    key: 'gate_pass',
    name: 'All-Access Pass',
    emoji: '🎟️',
    desc: 'Skip every level requirement for 24 hours: DM anyone, post in forums, go live',
    minutes: 24 * 60,
    price: 600,
    rarity: 'epic',
  },
  {
    key: 'ghost_mode',
    name: 'Ghost Mode',
    emoji: '👻',
    desc: 'Visit profiles without showing up in their viewers for 2 hours',
    minutes: 120,
    price: 300,
    rarity: 'rare',
  },
  {
    key: 'wipe_shield',
    name: 'Comeback Shield',
    emoji: '🛡️',
    desc: 'Away for 7 days? Saves your level, Sparks and items once and gives you 7 more days',
    minutes: null,
    auto: true,
    price: 900,
    rarity: 'epic',
  },
  {
    key: 'arena_shield',
    name: 'Hot Take Insurance',
    emoji: '🪂',
    desc: 'Get half your stake back the next time you lose a Hot Take',
    minutes: null,
    auto: true,
    price: 250,
    rarity: 'common',
  },
];
export const POWER_KEYS = POWERS.map((p) => p.key);
export const powerByKey = (key) => POWERS.find((p) => p.key === key);

/** The effects running on a user right now: { [powerKey]: untilIso }. */
export function activePowers(user, at = new Date()) {
  const out = {};
  for (const [k, until] of Object.entries(user?.powers ?? {})) if (until && until > at.toISOString()) out[k] = until;
  return out;
}
export const hasPower = (user, key, at = new Date()) => !!activePowers(user, at)[key];

// ——— Level gates ———
/** Minimum level for each network feature. Admins can change these; these are the defaults. */
export const LEVEL_GATES = [
  { key: 'dm', label: 'Message people who aren’t your friends', level: 3 },
  { key: 'forum', label: 'Start forum threads and reply', level: 5 },
  { key: 'live', label: 'Go live', level: 5 },
  { key: 'arena', label: 'Create game arenas', level: 8 },
];
export const DEFAULT_LEVEL_GATES = Object.fromEntries(LEVEL_GATES.map((g) => [g.key, g.level]));
export const levelGate = (key) => LEVEL_GATES.find((g) => g.key === key);

// ——— Daily check-in & the inactivity reset ———
/** Days away before earned progress resets. Warnings go out on the days listed. */
export const INACTIVITY_RESET_DAYS = 7;
export const INACTIVITY_WARN_DAYS = [5, 6];
/** Check-in bonus grows with the login streak: day 1 = 10 Sparks, +5 a day, capped at 100. */
export function checkInReward(streak) {
  const d = Math.max(1, streak);
  return { sparks: Math.min(100, 10 + (d - 1) * 5), xp: Math.min(120, 15 + (d - 1) * 5) };
}
export const LOGIN_STREAK_MILESTONES = [7, 30, 100, 365];

// ——— Premium profile options ———
/** Profile editor options only Premium members can use. Presets, default font and the basic styles stay free. */
export const PREMIUM_PROFILE = {
  backgroundKinds: ['image', 'color'],
  song: true,
  headerStyles: ['split', 'compact'],
  fonts: ['serif', 'mono', 'rounded', 'condensed'],
  sectionStyles: ['glass', 'accent'],
  sections: ['song', 'video', 'currently'],
  pageWidths: ['wide'],
};

/** Removes Premium-only choices from a normalized layout. Returns the cleaned layout and what was removed. */
export function stripPremiumLayout(layout) {
  const P = PREMIUM_PROFILE;
  const removed = new Set();
  const out = { ...layout };
  if (P.headerStyles.includes(out.header)) ((out.header = 'cover'), removed.add('header'));
  if (P.fonts.includes(out.font)) ((out.font = 'default'), removed.add('font'));
  if (P.pageWidths.includes(out.width)) ((out.width = 'normal'), removed.add('width'));
  out.sections = (layout.sections ?? [])
    .filter((s) => !P.sections.includes(s.type) || (removed.add(`section:${s.type}`), false))
    .map((s) => (P.sectionStyles.includes(s.style) ? (removed.add('style'), { ...s, style: 'card' }) : s));
  return { layout: out, removed: [...removed] };
}
