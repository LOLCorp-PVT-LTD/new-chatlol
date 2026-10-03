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

// ——— Referrals ———
/** Gold for each friend who joins with your link, paid once they've verified their email and reached minLevel. */
export const REFERRAL = { gold: 1, minLevel: 3 };

// ——— Username changes ———
/** Members can change their @handle for Gold (staff can change it for free from the admin panel). */
export const HANDLE_CHANGE_GOLD = 1;

// ——— Messaging cost ———
/** Each DM to a real person costs Sparks (AI personas are free). Premium members message for free. */
export const DM_SPARK_COST = 5;

// ——— Premium Gem drops ———
/** Gems aren't sold. Premium members get a chance of bonus Gems every time a reward pays them Sparks. */
export const PREMIUM_GEM_DROP = { chance: 0.6, perSparks: 10 };
export const gemDropFor = (sparks) => Math.max(1, Math.round(sparks / PREMIUM_GEM_DROP.perSparks));

// ——— Currencies: Sparks (earned) → Gems → Gold ———
/** One-way exchange rates. Gold is the top currency: tickets and the King's crown cost Gold. */
export const EXCHANGE = { sparksPerGem: 10_000, gemsPerGold: 1_000 };

/**
 * Power tickets: used on another member. Staff and the reigning King can't be targeted, and a member who was just
 * hit is protected for a while (`immunityHours`) so tickets can't be chained to keep someone out.
 */
export const TICKETS = [
  {
    key: 'ban_ticket',
    name: 'Ban Ticket',
    emoji: '🔨',
    desc: 'Ban one member from ChatLOL for 24 hours. Single use.',
    gold: 100,
    minutes: 24 * 60,
    immunityHours: 7 * 24,
    rarity: 'legendary',
  },
  {
    key: 'mute_ticket',
    name: 'Mute Ticket',
    emoji: '🔇',
    desc: 'Mute one member for 1 hour — they can read but not post or chat.',
    gold: 100,
    minutes: 60,
    immunityHours: 24,
    rarity: 'epic',
  },
  {
    key: 'kick_ticket',
    name: 'Kick Ticket',
    emoji: '🥾',
    desc: 'Kick someone out of a lounge for 1 hour. Use it from the lounge: tap their name.',
    gold: 100,
    minutes: 60,
    immunityHours: 0,
    rarity: 'epic',
  },
  {
    key: 'premium_gift',
    name: 'Premium Gift',
    emoji: '🎁',
    desc: 'Gift a member 1 day of Premium. Stack them: every ticket adds another day.',
    gold: 10,
    minutes: 24 * 60,
    immunityHours: 0,
    rarity: 'rare',
  },
];
export const ticketByKey = (key) => TICKETS.find((t) => t.key === key);

/** King of ChatLOL: one reigning King at a time; buying the crown dethrones the current King. */
export const KING = { key: 'king_crown', name: 'King of ChatLOL', emoji: '👑', gold: 10_000, reignDays: 30 };

// ——— Status ranks ———
/** Prestige by level. Each rank multiplies the daily check-in bonus; Noble and up show a badge by their name. */
export const STATUS_RANKS = [
  { key: 'commoner', label: 'Commoner', emoji: '🪵', minLevel: 1, checkInBoost: 1, color: '#8c7b6b' },
  { key: 'squire', label: 'Squire', emoji: '🛡️', minLevel: 5, checkInBoost: 1.1, color: '#6b8fb3' },
  { key: 'knight', label: 'Knight', emoji: '⚔️', minLevel: 10, checkInBoost: 1.25, color: '#5470e8' },
  { key: 'noble', label: 'Noble', emoji: '🎩', minLevel: 18, checkInBoost: 1.5, color: '#8f63e8', badge: true },
  { key: 'royalty', label: 'Royalty', emoji: '💍', minLevel: 28, checkInBoost: 1.75, color: '#d4a017', badge: true },
  { key: 'legendary', label: 'Legendary', emoji: '🌟', minLevel: 40, checkInBoost: 2, color: '#ff5e00', badge: true },
];
export const statusFor = (level) => [...STATUS_RANKS].reverse().find((r) => level >= r.minLevel) ?? STATUS_RANKS[0];
