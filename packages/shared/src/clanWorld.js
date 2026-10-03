import { clanEventFor, clanLevelFor } from './clans.js';

/**
 * The clan world beyond levels. Two separate numbers drive a clan:
 *  - Clan XP (`rep` in the database): members' everyday activity; it raises the clan's level.
 *  - Clan Reputation (`reputation`): standing earned by success — wars, quests, achievements, territories, events.
 * Plus Territories on the Social Map (contested in a weekly Siege), Upgrades bought from the treasury, rotating
 * Clan Quests and one-off Achievements.
 */

/** Districts of the ChatLOL Social Map. `bonus.kind` is what it boosts for the clan holding it. */
export const TERRITORIES = [
  { key: 'neon', name: 'Neon District', emoji: '🌃', x: 22, y: 26, bonus: { kind: 'clanxp', pct: 10 }, label: '+10% Clan XP' },
  { key: 'arcade', name: 'The Arcade', emoji: '🕹️', x: 52, y: 18, bonus: { kind: 'arcade', pct: 10 }, label: '+10% arcade payouts' },
  { key: 'downtown', name: 'Downtown', emoji: '🏙️', x: 78, y: 30, bonus: { kind: 'treasury', amount: 15_000 }, label: '+15,000 Sparks to the treasury each week' },
  { key: 'plaza', name: 'LOL Plaza', emoji: '🏛️', x: 50, y: 50, bonus: { kind: 'social', pct: 10 }, label: '+10% Sparks from posts, shouts and comments' },
  { key: 'void', name: 'The Void', emoji: '🕳️', x: 18, y: 72, bonus: { kind: 'gems', amount: 3 }, label: '+3 💎 every week for every member' },
  { key: 'wasteland', name: 'Wasteland', emoji: '☢️', x: 80, y: 74, bonus: { kind: 'war', pct: 10 }, label: '+10% Clan War and Siege score' },
  { key: 'peak', name: 'Sunset Peak', emoji: '🌄', x: 38, y: 82, bonus: { kind: 'sparks', pct: 3 }, label: '+3% Sparks for every member' },
  { key: 'skyport', name: 'Skyport', emoji: '🛸', x: 64, y: 84, bonus: { kind: 'xp', pct: 5 }, label: '+5% XP for every member' },
];
export const territoryByKey = (key) => TERRITORIES.find((t) => t.key === key) ?? null;

/**
 * The Siege: every Saturday 18:00 → Sunday 18:00 UTC. Officers send their clan to attack one territory (holders
 * defend theirs automatically); Clan XP earned during the siege is the score. Defenders get +10%. Highest score holds the
 * territory until the next siege. Clans need level 3 (Clan Wars) to take part.
 */
export const SIEGE = { day: 5, hour: 18, hours: 24, defenderPct: 10, minLevel: 3, minReputation: 50, captureRep: 50, holdRep: 20 };
export function siegeFor(at = Date.now()) {
  const ev = clanEventFor(at);
  const start = Date.parse(ev.startsAt) + (SIEGE.day * 24 + SIEGE.hour) * 3_600_000;
  const end = start + SIEGE.hours * 3_600_000;
  const t = typeof at === 'number' ? at : new Date(at).getTime();
  return { week: ev.week, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), live: t >= start && t < end, over: t >= end };
}

/**
 * Upgrades: six trees, three levels each, paid from the treasury. Which trees a clan buys shapes its identity — a
 * social clan, a rich one, a fast-growing one, a big one, a war machine or a show-off.
 */
export const HQ_BUILDINGS = [
  { key: 'social', name: 'Social', emoji: '💬', desc: '+4% Sparks from posts, shouts and comments', per: 4 },
  { key: 'economy', name: 'Economy', emoji: '💰', desc: '+1% of members’ Spark rewards minted into the treasury', per: 1 },
  { key: 'growth', name: 'Growth', emoji: '🌱', desc: '+5% Clan XP', per: 5 },
  { key: 'community', name: 'Community', emoji: '🏘️', desc: '+5 member slots', per: 5 },
  { key: 'warfare', name: 'Warfare', emoji: '⚔️', desc: '+5% Clan War and Siege score', per: 5 },
  { key: 'prestige', name: 'Prestige', emoji: '✨', desc: 'Exclusive looks: glowing tag, animated badge, gilded banner', per: 1 },
];
export const HQ_LEVELS = [
  { level: 1, cost: 25_000, clanLevel: 2 },
  { level: 2, cost: 75_000, clanLevel: 4 },
  { level: 3, cost: 200_000, clanLevel: 6 },
];
export const hqLevel = (hq, key) => Math.min(HQ_LEVELS.length, Math.max(0, Number(hq?.[key]) || 0));
/** Member cap: the clan level's cap plus the Community upgrade. */
export const clanMaxMembers = (rep, hq) => clanLevelFor(rep).members + hqLevel(hq, 'community') * 5;

/** Clan Quests: three a week from this pool, rotating. `n` is the base target, scaled by the clan's tier. */
export const OBJECTIVE_POOL = [
  { key: 'sparks', name: 'Spark Grind', emoji: '⚡', desc: 'Members earn {n} Sparks', n: 20_000 },
  { key: 'arcade', name: 'Arcade Night', emoji: '🕹️', desc: 'Get paid for {n} arcade runs', n: 12 },
  { key: 'social', name: 'Town Criers', emoji: '📣', desc: 'Earn {n} rewards from posts, shouts and comments', n: 40 },
  { key: 'arena', name: 'Champions', emoji: '🏆', desc: 'Win {n} arena games or tournaments', n: 4 },
  { key: 'active', name: 'All Hands', emoji: '🙌', desc: '{n} different members earn Sparks', n: 4 },
  { key: 'donate', name: 'War Chest', emoji: '💰', desc: 'Donate {n} Sparks to the treasury', n: 10_000 },
];
/** Tier 1–4: rises every two clan levels. Targets and rewards grow with it. */
export const objectiveTier = (rep) => Math.min(4, 1 + Math.floor((clanLevelFor(rep).level - 1) / 2));
export function clanObjectives(week, tier) {
  const pool = OBJECTIVE_POOL.length;
  const picks = [0, 1, 2].map((i) => OBJECTIVE_POOL[(((week * 3 + i * 2) % pool) + pool) % pool]);
  const uniq = [...new Map(picks.map((p) => [p.key, p])).values()];
  while (uniq.length < 3) uniq.push(OBJECTIVE_POOL.find((p) => !uniq.includes(p)));
  const scale = (n) => (n >= 1000 ? Math.round((n * (1 + (tier - 1) * 0.75)) / 1000) * 1000 : Math.round(n * (1 + (tier - 1) * 0.6)));
  return uniq.map((o) => {
    const target = o.key === 'active' ? o.n + (tier - 1) * 2 : scale(o.n);
    return { ...o, target, desc: o.desc.replace('{n}', target.toLocaleString('en')), reward: { xp: 250 * tier, treasury: 5_000 * tier, reputation: 10 * tier } };
  });
}

/** One-off achievements: `stat` reaches `goal`. Each adds Reputation; rare ones add a lot. */
export const CLAN_ACHIEVEMENTS = [
  { key: 'rising', name: 'Rising Star', emoji: '🌟', desc: 'Reach clan level 3', stat: 'level', goal: 3, reputation: 20 },
  { key: 'renowned', name: 'Renowned', emoji: '🎖️', desc: 'Reach clan level 5', stat: 'level', goal: 5, reputation: 50 },
  { key: 'legendary', name: 'Legendary', emoji: '👑', desc: 'Reach clan level 8', stat: 'level', goal: 8, reputation: 150, rare: true },
  { key: 'full_house', name: 'Full House', emoji: '🏠', desc: 'Have 20 members', stat: 'members', goal: 20, reputation: 30 },
  { key: 'first_blood', name: 'First Blood', emoji: '⚔️', desc: 'Win a Clan War', stat: 'wins', goal: 1, reputation: 25 },
  { key: 'warlords', name: 'Warlords', emoji: '🐉', desc: 'Win 10 Clan Wars', stat: 'wins', goal: 10, reputation: 100, rare: true },
  { key: 'unstoppable', name: 'Unstoppable', emoji: '🔥', desc: 'Win 10 Clan Wars in a row', stat: 'bestStreak', goal: 10, reputation: 250, rare: true },
  { key: 'landlords', name: 'Landlords', emoji: '🚩', desc: 'Capture a territory', stat: 'captured', goal: 1, reputation: 50 },
  { key: 'empire', name: 'Empire', emoji: '🗺️', desc: 'Hold 3 territories at once', stat: 'held', goal: 3, reputation: 150, rare: true },
  { key: 'taskmasters', name: 'Taskmasters', emoji: '✅', desc: 'Complete 10 quests', stat: 'objectives', goal: 10, reputation: 60 },
  { key: 'builders', name: 'Master Builders', emoji: '🏗️', desc: 'Max out an upgrade tree', stat: 'hqMax', goal: 1, reputation: 60 },
  { key: 'podium', name: 'Podium', emoji: '🥇', desc: 'Place top 3 in a weekly clan event', stat: 'trophies', goal: 1, reputation: 40 },
  { key: 'renown', name: 'Household Name', emoji: '📯', desc: 'Reach 1,000 Clan Reputation', stat: 'reputation', goal: 1000, reputation: 0 },
  { key: 'icons', name: 'Icons', emoji: '🏵️', desc: 'Reach 10,000 Clan Reputation', stat: 'reputation', goal: 10_000, reputation: 0, rare: true },
  { key: 'centurions', name: 'Centurions', emoji: '💯', desc: 'Complete 100 quests', stat: 'objectives', goal: 100, reputation: 300, rare: true },
  { key: 'veterans', name: 'Old Guard', emoji: '🗓️', desc: 'Keep the clan going for a year', stat: 'ageDays', goal: 365, reputation: 200, rare: true },
  { key: 'deep_pockets', name: 'Deep Pockets', emoji: '🏦', desc: 'Hold 100,000 Sparks in the treasury', stat: 'treasury', goal: 100_000, reputation: 40 },
];

/**
 * Contribution: each member's score for what they did for the clan — Clan XP earned (1 per XP), deposits (1 per 100
 * Sparks), recruits (+50), quests completed while active (+25), war victories (+100). Counted per week, per season and
 * for life; the week's top contributor is the Clan MVP.
 */
export const CONTRIBUTION = { perDeposit: 100, recruit: 50, quest: 25, war: 100, mvpSparks: 500 };

/** Clan seasons: six weeks each. Lifetime stats, levels and achievements carry over; seasonal points reset. */
export const CLAN_SEASON = { weeks: 6 };
export function clanSeasonFor(week = clanEventFor().week) {
  const season = Math.floor(week / CLAN_SEASON.weeks);
  const startWeek = season * CLAN_SEASON.weeks;
  const start = (startWeek * 7 + 4) * 86_400_000; // weeks count from the Monday after 1 Jan 1970
  return { season, number: season - 492, startWeek, endWeek: startWeek + CLAN_SEASON.weeks - 1, startsAt: new Date(start).toISOString(), endsAt: new Date(start + CLAN_SEASON.weeks * 7 * 86_400_000).toISOString() };
}
