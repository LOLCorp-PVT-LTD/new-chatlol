/**
 * Clans. Anyone with enough Gold can found one (level 8+), others join (open, by request, or invite-only).
 * Clans earn Rep from what their members do (every 10 Sparks a member earns = 1 Rep, doubled on event weekends),
 * from wars they win and from weekly events. Rep raises the clan's level, and each level unlocks a perk.
 */
export const CLAN_FOUND = { gold: 5, minLevel: 8 };
export const CLAN_JOIN_POLICIES = [
  { key: 'open', label: 'Open — anyone can join' },
  { key: 'request', label: 'Request — officers approve' },
  { key: 'invite', label: 'Invite only' },
];
export const CLAN_ROLES = { leader: 'Leader', officer: 'Officer', member: 'Member' };
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
/** Does a clan with this much Rep have this perk? */
export const clanHas = (rep, key) => CLAN_LEVELS.some((l) => l.key === key && rep >= l.rep);

/** Clan Wars: 48 hours; the clan whose members earn more Rep in that time wins the pot (both stakes) and bonus Rep. */
export const CLAN_WAR = { hours: 48, winRep: 750, maxStake: 50_000, minLevel: 3 };

/**
 * Weekly clan events (they rotate each week, Monday–Sunday UTC). Every event doubles Rep at the weekend; the top
 * three clans of the week by Rep earned share a Gem prize, paid to every member.
 */
export const CLAN_EVENTS = [
  { key: 'rush', name: 'Spark Rush', emoji: '⚡', desc: 'Every Spark your members earn counts. Double Rep all weekend.' },
  { key: 'arcade', name: 'Arcade Clash', emoji: '🕹️', desc: 'Arcade points count double toward clan Rep this week.' },
  { key: 'social', name: 'Social Surge', emoji: '📣', desc: 'Posts, shouts and comments earn extra clan Rep this week.' },
  { key: 'arena', name: 'Arena Week', emoji: '⚔️', desc: 'Arena and tournament wins earn bonus clan Rep this week.' },
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
