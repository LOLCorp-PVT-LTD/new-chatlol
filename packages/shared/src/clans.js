/**
 * Clans. Anyone with enough Gold can found one (level 8+), others join (open, by request, or invite-only).
 * Clans earn Rep from what their members do (every 10 Sparks a member earns = 1 Rep, doubled on event weekends),
 * from wars they win and from weekly events. Rep raises the clan's level, and each level unlocks a perk.
 */
export const CLAN_FOUND = { gold: 5, minLevel: 8 };
/** Recruitment modes. ('request' is the old name for 'application'.) */
export const CLAN_JOIN_POLICIES = [
  { key: 'open', label: 'Open — anyone who meets the requirements joins' },
  { key: 'application', label: 'Application — write why you want in, officers decide' },
  { key: 'invite', label: 'Invite only' },
  { key: 'closed', label: 'Closed — not recruiting' },
];
export const normalizePolicy = (p) => (p === 'request' ? 'application' : p ?? 'open');

/**
 * Ranks, highest first. `perms` are what each rank can do by default. From clan level 5 the Founder can add custom
 * roles (a name, an emoji, a place in the ladder and their own permissions).
 */
export const CLAN_PERMS = [
  { key: 'invite', label: 'Invite people' },
  { key: 'recruit', label: 'Accept or decline applications' },
  { key: 'kick', label: 'Remove lower ranks' },
  { key: 'promote', label: 'Promote and demote lower ranks' },
  { key: 'treasury', label: 'Spend the treasury (upgrades, war stakes)' },
  { key: 'wars', label: 'Declare and accept Clan Wars' },
  { key: 'siege', label: 'Choose the Siege target' },
  { key: 'settings', label: 'Edit the clan profile and recruitment' },
];
export const CLAN_RANKS = [
  { key: 'founder', name: 'Founder', emoji: '👑', rank: 5, perms: CLAN_PERMS.map((p) => p.key) },
  { key: 'commander', name: 'Commander', emoji: '🎖️', rank: 4, perms: ['invite', 'recruit', 'kick', 'promote', 'treasury', 'wars', 'siege', 'settings'] },
  { key: 'officer', name: 'Officer', emoji: '🛡️', rank: 3, perms: ['invite', 'recruit', 'kick', 'wars', 'siege'] },
  { key: 'veteran', name: 'Veteran', emoji: '⚔️', rank: 2, perms: ['invite'] },
  { key: 'member', name: 'Member', emoji: '🙂', rank: 1, perms: [] },
  { key: 'recruit', name: 'Recruit', emoji: '🌱', rank: 0, perms: [] },
];
/** Custom roles unlock at this clan level; at most this many. */
export const CLAN_CUSTOM_ROLES = { minLevel: 5, max: 5 };
/** Recruits become Members automatically after this many days. */
export const RECRUIT_DAYS = 3;
/** Old role names → ranks. */
const LEGACY = { leader: 'founder' };
/** The rank (built-in or one of the clan's custom roles) a member holds. */
export function clanRank(role, customRoles = []) {
  const key = LEGACY[role] ?? role;
  return CLAN_RANKS.find((r) => r.key === key) ?? customRoles.find((r) => r.key === key) ?? CLAN_RANKS.find((r) => r.key === 'member');
}
export const clanCan = (role, perm, customRoles = []) => clanRank(role, customRoles).perms.includes(perm);
/** Kept for older code: name per role key. */
export const CLAN_ROLES = Object.fromEntries([...CLAN_RANKS.map((r) => [r.key, r.name]), ['leader', 'Founder']]);
/** Sparks a member earns per 1 Rep for their clan. */
export const REP_PER_SPARKS = 10;

/** Levels: Rep needed, member cap, and the perk each level unlocks. */
export const CLAN_LEVELS = [
  { level: 1, rep: 0, members: 10, perk: 'Clan page, leaderboard spot and a treasury' },
  { level: 2, rep: 500, members: 15, perk: 'Clan tag next to every member’s name', key: 'tag' },
  { level: 3, rep: 1500, members: 20, perk: 'Clan Wars: challenge other clans', key: 'wars' },
  { level: 4, rep: 4000, members: 25, perk: 'Private clan lounge (members-only chat)', key: 'lounge' },
  { level: 5, rep: 9000, members: 35, perk: 'Custom clan colour and banner', key: 'banner' },
  { level: 6, rep: 18000, members: 45, perk: 'Clan bonus: members earn +5% Sparks', key: 'bonus' },
  { level: 7, rep: 35000, members: 60, perk: 'Radio in the clan lounge', key: 'radio' },
  { level: 8, rep: 60000, members: 80, perk: 'Legendary clan: shining tag', key: 'legend' },
];
export const clanLevelFor = (rep) => [...CLAN_LEVELS].reverse().find((l) => rep >= l.rep) ?? CLAN_LEVELS[0];
export const nextClanLevel = (rep) => CLAN_LEVELS.find((l) => l.rep > rep) ?? null;
/** Does a clan with this much Clan XP have this perk? Prestiged clans keep every perk while they climb again. */
export const clanHas = (rep, key, prestige = 0) => prestige > 0 || CLAN_LEVELS.some((l) => l.key === key && rep >= l.rep);

/** Clan Wars: 48 hours; the clan whose members earn more Rep in that time wins the pot (both stakes) and bonus Rep. */
export const CLAN_WAR = { hours: 48, winRep: 750, maxStake: 50_000, minLevel: 3 };

/**
 * Weekly clan events (they rotate each week, Monday–Sunday UTC). Every event doubles Rep at the weekend; the top
 * three clans of the week by Rep earned share a Gem prize, paid to every member.
 */
export const CLAN_EVENTS = [
  { key: 'rush', name: 'Spark Rush', emoji: '⚡', desc: 'Every Spark your members earn counts. Double Clan XP all weekend.' },
  { key: 'arcade', name: 'Arcade Clash', emoji: '🕹️', desc: 'Arcade points count double toward Clan XP this week.' },
  { key: 'social', name: 'Social Surge', emoji: '📣', desc: 'Posts, shouts and comments earn extra Clan XP this week.' },
  { key: 'arena', name: 'Arena Week', emoji: '⚔️', desc: 'Arena and tournament wins earn bonus Clan XP this week.' },
];
export const CLAN_EVENT_PRIZES = [{ place: 1, gems: 30 }, { place: 2, gems: 15 }, { place: 3, gems: 8 }];

/** This week's event and its Monday start (UTC). */
export function clanEventFor(at = Date.now()) {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const week = Math.floor(start / (7 * 86_400_000));
  const ev = CLAN_EVENTS[((week % CLAN_EVENTS.length) + CLAN_EVENTS.length) % CLAN_EVENTS.length];
  return { ...ev, week, startsAt: new Date(start).toISOString(), endsAt: new Date(start + 7 * 86_400_000).toISOString(), weekend: day >= 5 };
}

export const CLAN_TAG_RE = /^[A-Z0-9]{2,5}$/;
