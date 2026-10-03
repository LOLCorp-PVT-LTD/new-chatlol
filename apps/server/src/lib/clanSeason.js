import {
  BOUNTY_REWARD, CLAN_BOUNTY_POOL, CLAN_LIVE_EVENTS, LIVE_EVENT_HOURS, SEASON_PRIZES, SPRINT_PRIZES, clanEventFor, clanLevelFor, clanSeasonFor, siegeFor,
} from '@chatlol/shared';
import { db, newId, now } from '../db.js';

/**
 * Seasons, live server events, daily bounties and the clan leaderboards. Lifetime progress lives on the clan; this file
 * handles everything that runs on a clock.
 */
const today = () => new Date().toISOString().slice(0, 10);

// ——— Seasons ———
export async function addSeasonPoints(clanId, n) {
  if (!n) return;
  const { season } = clanSeasonFor();
  await db.clanSeasons.updateOne({ season, clanId }, { $inc: { points: n }, $setOnInsert: { at: now() } }, { upsert: true });
}

/** When a season ends: top 10 get trophies, Reputation and Gems for every member. */
export async function paySeason() {
  const last = clanSeasonFor().season - 1;
  const done = await db.settings.findOne({ _id: 'clanSeasonPaid' });
  if ((done?.season ?? -1) >= last) return;
  const r = await db.settings.updateOne({ _id: 'clanSeasonPaid', $or: [{ season: { $lt: last } }, { season: { $exists: false } }] }, { $set: { season: last, at: now() } }, { upsert: true }).catch(() => null);
  if (!r?.modifiedCount && !r?.upsertedCount) return;
  const { notify } = await import('./rewards.js');
  const number = clanSeasonFor(last * 6).number;
  const top = await db.clanSeasons.find({ season: last, points: { $gt: 0 } }).sort({ points: -1 }).limit(SEASON_PRIZES.length).toArray();
  for (const [i, row] of top.entries()) {
    const prize = SEASON_PRIZES[i];
    const clan = await db.clans.findOne({ _id: row.clanId }, { projection: { name: 1 } });
    if (!clan) continue;
    await db.clans.updateOne({ _id: row.clanId }, { $inc: { reputation: prize.reputation }, $push: { seasonTrophies: { season: number, place: prize.place, title: prize.title, points: Math.floor(row.points), at: now() } } });
    const ids = (await db.clanMembers.find({ clanId: row.clanId }, { projection: { userId: 1 } }).toArray()).map((m) => m.userId);
    await db.users.updateMany({ _id: { $in: ids } }, { $inc: { gems: prize.gems } });
    for (const id of ids) await notify(id, { kind: 'reward', title: `🏆 ${clan.name}: #${prize.place} in Clan Season ${number}!`, body: `${prize.title} · +${prize.reputation} Reputation · +${prize.gems} 💎 for you`, link: `/clans/${row.clanId}` });
  }
}

// ——— Live server events ———
let evCache = { at: 0, ev: null };
/** The live event right now (or null). Cached briefly — it's read on every reward. */
export async function liveEvent() {
  if (Date.now() - evCache.at < 15_000) return evCache.ev;
  const s = await db.settings.findOne({ _id: 'clanLiveEvent' });
  const ev = s?.key && s.endsAt > now() && s.startsAt <= now() ? { ...CLAN_LIVE_EVENTS.find((e) => e.key === s.key), id: s.id, startsAt: s.startsAt, endsAt: s.endsAt } : null;
  evCache = { at: Date.now(), ev };
  return ev;
}

export async function startLiveEvent(key, hours = LIVE_EVENT_HOURS) {
  const def = CLAN_LIVE_EVENTS.find((e) => e.key === key);
  if (!def) return null;
  const startsAt = now();
  const endsAt = new Date(Date.now() + hours * 3_600_000).toISOString();
  const id = newId();
  await db.settings.updateOne({ _id: 'clanLiveEvent' }, { $set: { key, id, startsAt, endsAt, paid: false, next: new Date(Date.now() + (hours + 4 + Math.random() * 6) * 3_600_000).toISOString() } }, { upsert: true });
  evCache = { at: 0, ev: null };
  const { io, room } = await import('./io.js');
  io()?.to(room.global).emit('clan:event', { ...def, startsAt, endsAt });
  return { ...def, id, startsAt, endsAt };
}

/** Worker: pays out finished sprints and starts a random event every few hours. */
export async function runLiveEvents() {
  const s = await db.settings.findOne({ _id: 'clanLiveEvent' });
  if (s?.key && s.endsAt <= now() && !s.paid) {
    const r = await db.settings.updateOne({ _id: 'clanLiveEvent', paid: false }, { $set: { paid: true } });
    if (r.modifiedCount && CLAN_LIVE_EVENTS.find((e) => e.key === s.key)?.sprint) await paySprint(s.id);
  }
  if (s?.key && s.endsAt > now()) return;
  if (s?.next && s.next > now()) return;
  // Neon War only while a Siege is on; otherwise any of the others.
  const pool = CLAN_LIVE_EVENTS.filter((e) => (e.siege ? siegeFor().live : true));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (!s?.next) {
    // First run: schedule rather than fire straight away.
    await db.settings.updateOne({ _id: 'clanLiveEvent' }, { $set: { next: new Date(Date.now() + (1 + Math.random() * 4) * 3_600_000).toISOString() } }, { upsert: true });
    return;
  }
  await startLiveEvent(pick.key);
}

async function paySprint(eventId) {
  const { notify } = await import('./rewards.js');
  const top = await db.clanSprints.find({ eventId }).sort({ xp: -1 }).limit(SPRINT_PRIZES.length).toArray();
  for (const [i, row] of top.entries()) {
    const p = SPRINT_PRIZES[i];
    await db.clans.updateOne({ _id: row.clanId }, { $inc: { reputation: p.reputation, treasury: p.treasury } });
    await addSeasonPoints(row.clanId, 150 - i * 50);
    for (const m of await db.clanMembers.find({ clanId: row.clanId }, { projection: { userId: 1 } }).toArray())
      await notify(m.userId, { kind: 'reward', title: `🏁 Your clan placed #${i + 1} in LAST CLAN STANDING!`, body: `+${p.reputation} Reputation · ✦ ${p.treasury.toLocaleString()} to the treasury`, link: `/clans/${row.clanId}` });
  }
}

/** Applies the live event to a member's Clan XP (called from addRepFromSparks); returns the boosted amount. */
export async function eventBoost(clanId, rep, sparks, social) {
  const ev = await liveEvent();
  if (!ev) return rep;
  let x = rep * (ev.xp ?? 1) * (social && ev.social ? ev.social : 1);
  if (ev.mint && sparks > 0) await db.clans.updateOne({ _id: clanId }, { $inc: { treasury: Math.floor((sparks * ev.mint) / 100) } });
  if (ev.sprint) await db.clanSprints.updateOne({ eventId: ev.id, clanId }, { $inc: { xp: x } }, { upsert: true });
  return x;
}
export const siegeEventMult = async () => (await liveEvent())?.siege ?? 1;

// ——— Daily activity counters & bounties ———
export async function countDay(clanId, inc, userId = null) {
  const upd = { $setOnInsert: { at: now() } };
  const clean = Object.fromEntries(Object.entries(inc).filter(([, v]) => v));
  if (Object.keys(clean).length) upd.$inc = clean;
  if (userId) upd.$addToSet = { users: userId };
  await db.clanDays.updateOne({ day: today(), clanId }, upd, { upsert: true });
}

function pickBounties(clanId, day, hasAbove) {
  const seed = [...`${clanId}${day}`].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, 5381);
  const pool = CLAN_BOUNTY_POOL.filter((b) => b.key !== 'overtake' || hasAbove);
  const first = pool[seed % pool.length];
  const rest = pool.filter((b) => b !== first);
  return [first, rest[(seed >>> 8) % rest.length]];
}

/** Today's two bounties for a clan, with progress; completing one pays Reputation, treasury and season points. */
export async function bountiesFor(c) {
  const day = today();
  const week = clanEventFor().week;
  let doc = await db.clanBounties.findOne({ day, clanId: c._id });
  if (!doc) {
    // Who's just above us this week (for "overtake")?
    const mine = (await db.clanWeeks.findOne({ week, clanId: c._id }))?.rep ?? 0;
    const above = await db.clanWeeks.find({ week, rep: { $gt: mine } }).sort({ rep: 1 }).limit(1).toArray();
    const aboveClan = above[0] ? await db.clans.findOne({ _id: above[0].clanId }, { projection: { name: 1 } }) : null;
    const level = clanLevelFor(c.rep).level;
    const list = pickBounties(c._id, day, !!aboveClan).map((b) => ({
      key: b.key, emoji: b.emoji, done: false,
      target: b.key === 'xp' ? 300 * level : b.key === 'active' ? Math.min(3 + level, 12) : 1,
      ...(b.key === 'overtake' ? { targetClanId: aboveClan._id, name: aboveClan.name } : {}),
    }));
    await db.clanBounties.updateOne({ day, clanId: c._id }, { $setOnInsert: { bounties: list, at: now() } }, { upsert: true });
    doc = await db.clanBounties.findOne({ day, clanId: c._id });
  }
  const d = await db.clanDays.findOne({ day, clanId: c._id });
  const out = [];
  for (const [i, b] of doc.bounties.entries()) {
    let progress = 0;
    if (b.key === 'xp') progress = Math.floor(d?.xp ?? 0);
    else if (b.key === 'quest') progress = d?.quests ?? 0;
    else if (b.key === 'recruit') progress = d?.recruits ?? 0;
    else if (b.key === 'active') progress = (d?.users ?? []).length;
    else if (b.key === 'overtake') {
      const [me, them] = await Promise.all([db.clanWeeks.findOne({ week, clanId: c._id }), db.clanWeeks.findOne({ week, clanId: b.targetClanId })]);
      progress = (me?.rep ?? 0) > (them?.rep ?? 0) ? 1 : 0;
    }
    const def = CLAN_BOUNTY_POOL.find((x) => x.key === b.key);
    if (!b.done && progress >= b.target) {
      const r = await db.clanBounties.updateOne({ _id: doc._id, [`bounties.${i}.done`]: false }, { $set: { [`bounties.${i}.done`]: true } });
      if (r.modifiedCount) {
        b.done = true;
        await db.clans.updateOne({ _id: c._id }, { $inc: { reputation: BOUNTY_REWARD.reputation, treasury: BOUNTY_REWARD.treasury } });
        await addSeasonPoints(c._id, 150);
        const { notify } = await import('./rewards.js');
        for (const m of await db.clanMembers.find({ clanId: c._id }, { projection: { userId: 1 } }).toArray())
          await notify(m.userId, { kind: 'reward', title: `${b.emoji} Bounty claimed: ${def.label(b)}`, body: `+${BOUNTY_REWARD.reputation} Reputation · ✦ ${BOUNTY_REWARD.treasury.toLocaleString()} to the treasury`, link: `/clans/${c._id}` });
      }
    }
    out.push({ key: b.key, emoji: b.emoji, label: def.label(b), target: b.target, progress: Math.min(progress, b.target), done: b.done });
  }
  return out;
}

const bountyCheckedAt = new Map();
/** Checks a clan's bounties at most once a minute (called after rewards). */
export async function checkBounties(clanId) {
  const t = Date.now();
  if (t - (bountyCheckedAt.get(clanId) ?? 0) < 60_000) return;
  bountyCheckedAt.set(clanId, t);
  if (bountyCheckedAt.size > 5000) bountyCheckedAt.clear();
  const c = await db.clans.findOne({ _id: clanId }, { projection: { rep: 1 } });
  if (c) await bountiesFor(c);
}

// ——— Leaderboards ———
const brief = (c) => ({ id: c._id, name: c.name, tag: c.tag, emoji: c.emoji, prestige: c.prestige ?? 0 });
export async function clanBoard(board, author) {
  const limit = 25;
  const fromIds = async (rows, value, sub) => {
    const clans = new Map((await db.clans.find({ _id: { $in: rows.map((r) => r.clanId) } }).toArray()).map((c) => [c._id, c]));
    return rows.filter((r) => clans.has(r.clanId)).map((r, i) => ({ rank: i + 1, clan: brief(clans.get(r.clanId)), value: Math.floor(value(r)), sub: sub?.(r, clans.get(r.clanId)) }));
  };
  const sorted = async (sort, value, sub, filter = {}) =>
    (await db.clans.find(filter).sort(sort).limit(limit).toArray()).map((c, i) => ({ rank: i + 1, clan: brief(c), value: Math.floor(value(c)), sub: sub?.(c) }));
  switch (board) {
    case 'season': {
      const { season } = clanSeasonFor();
      return fromIds(await db.clanSeasons.find({ season }).sort({ points: -1 }).limit(limit).toArray(), (r) => r.points, () => 'season points');
    }
    case 'reputation': return sorted({ reputation: -1 }, (c) => c.reputation ?? 0, () => 'Reputation');
    case 'level': return sorted({ prestige: -1, rep: -1 }, (c) => clanLevelFor(c.rep).level, (c) => `${Math.floor(c.rep).toLocaleString()} Clan XP`);
    case 'weekly': return fromIds(await db.clanWeeks.find({ week: clanEventFor().week }).sort({ rep: -1 }).limit(limit).toArray(), (r) => r.rep, () => 'Clan XP this week');
    case 'active': {
      const week = clanEventFor().week;
      const rows = await db.clanContrib.aggregate([{ $match: { week, points: { $gt: 0 } } }, { $group: { _id: '$clanId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: limit }]).toArray();
      return fromIds(rows.map((r) => ({ clanId: r._id, n: r.n })), (r) => r.n, () => 'active members this week');
    }
    case 'wins': return sorted({ wins: -1 }, (c) => c.wins ?? 0, (c) => `${c.wins ?? 0}W ${c.losses ?? 0}L`);
    case 'streak': return sorted({ bestStreak: -1 }, (c) => c.bestStreak ?? 0, (c) => `best streak · now ${c.streak ?? 0}`, { bestStreak: { $gt: 0 } });
    case 'achievements': {
      const rows = await db.clans.aggregate([{ $project: { n: { $size: { $ifNull: ['$achievements', []] } } } }, { $match: { n: { $gt: 0 } } }, { $sort: { n: -1 } }, { $limit: limit }]).toArray();
      return fromIds(rows.map((r) => ({ clanId: r._id, n: r.n })), (r) => r.n, () => 'achievements');
    }
    case 'territory': {
      const rows = await db.territories.aggregate([{ $match: { clanId: { $ne: null } } }, { $group: { _id: '$clanId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: limit }]).toArray();
      return fromIds(rows.map((r) => ({ clanId: r._id, n: r.n })), (r) => r.n, () => 'districts held');
    }
    case 'prestige': return sorted({ prestige: -1, reputation: -1 }, (c) => c.prestige ?? 0, (c) => `${(c.reputation ?? 0).toLocaleString()} Reputation`, { prestige: { $gt: 0 } });
    case 'members': {
      const rows = await db.clanMembers.find({ 'contrib.points': { $gt: 0 } }).sort({ 'contrib.points': -1 }).limit(limit).toArray();
      const clans = new Map((await db.clans.find({ _id: { $in: rows.map((r) => r.clanId) } }).toArray()).map((c) => [c._id, c]));
      return Promise.all(rows.map(async (m, i) => ({ rank: i + 1, user: await author(m.userId), clan: clans.has(m.clanId) ? brief(clans.get(m.clanId)) : undefined, value: Math.floor(m.contrib.points), sub: 'contribution' })));
    }
    default: return [];
  }
}
