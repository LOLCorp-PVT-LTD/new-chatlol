import { CLAN_ACHIEVEMENTS, CONTRIBUTION, HQ_BUILDINGS, HQ_LEVELS, SIEGE, TERRITORIES, clanEventFor, clanHas, clanLevelFor, clanObjectives, hqLevel, objectiveTier, siegeFor, territoryByKey } from '@chatlol/shared';
import { db, now } from '../db.js';

/**
 * Server side of the clan world (see shared clanWorld.js): bonuses from territories and the HQ, weekly objective
 * progress, Siege scoring and resolution, achievements and Reputation.
 */

// ——— Bonuses ———
const bonusCache = new Map(); // clanId → { at, b }
export const forgetBonuses = (clanId) => bonusCache.delete(clanId);
/** Percent boosts this clan's members get right now. */
export async function clanBonuses(clanId) {
  const c0 = bonusCache.get(clanId);
  if (c0 && Date.now() - c0.at < 60_000) return c0.b;
  const c = await db.clans.findOne({ _id: clanId }, { projection: { rep: 1, hq: 1 } });
  const held = await db.territories.find({ clanId }, { projection: { _id: 1 } }).toArray();
  const b = { sparks: 0, clanxp: 0, arcade: 0, social: 0, war: 0, xp: 0, economy: 0 };
  if (c) {
    if (clanHas(c.rep, 'bonus')) b.sparks += 5;
    b.social += hqLevel(c.hq, 'social') * 4;
    b.economy += hqLevel(c.hq, 'economy');
    b.clanxp += hqLevel(c.hq, 'growth') * 5;
    b.war += hqLevel(c.hq, 'warfare') * 5;
    for (const t of held) {
      const bonus = territoryByKey(t._id)?.bonus;
      if (bonus?.pct && bonus.kind in b) b[bonus.kind] += bonus.pct;
    }
  }
  bonusCache.set(clanId, { at: Date.now(), b });
  return b;
}

export const isArcade = (reason = '') => /arcade|points/i.test(reason);
export const isSocial = (reason = '') => /post|shout|comment|vibe/i.test(reason);
export const isArenaWin = (reason = '') => /won|win|tournament|pot/i.test(reason);

/** Applies a member's clan bonuses to a reward (called from grant()); the Economy upgrade mints a cut into the treasury. */
export async function clanBoost(clanId, sparks, xp, reason) {
  const b = await clanBonuses(clanId);
  if (b.economy && sparks > 0) {
    const cut = Math.floor((sparks * b.economy) / 100);
    if (cut > 0) await db.clans.updateOne({ _id: clanId }, { $inc: { treasury: cut } });
  }
  const pct = b.sparks + (isArcade(reason) ? b.arcade : 0) + (isSocial(reason) ? b.social : 0);
  return { sparks: sparks > 0 ? Math.round(sparks * (1 + pct / 100)) : sparks, xp: xp > 0 && b.xp ? Math.round(xp * (1 + b.xp / 100)) : xp };
}

// ——— Contribution & MVP ———
/** Adds to a member's contribution (this week's row and their lifetime totals). `inc`: points, xp, reputation, quests, wars, recruits, donated. */
export async function contribute(clanId, userId, inc) {
  const clean = Object.fromEntries(Object.entries(inc).filter(([, v]) => v));
  if (!Object.keys(clean).length) return;
  const week = clanEventFor().week;
  await db.clanContrib.updateOne({ week, clanId, userId }, { $inc: clean, $setOnInsert: { at: now() } }, { upsert: true });
  await db.clanMembers.updateOne({ clanId, userId }, { $inc: Object.fromEntries(Object.entries(clean).map(([k, v]) => [`contrib.${k}`, v])) });
}

/** Top contributors of a clan for a range of weeks (one week, a season, or null for lifetime). */
export async function topContributors(clanId, fromWeek = null, toWeek = fromWeek, limit = 10) {
  if (fromWeek == null) {
    const rows = await db.clanMembers.find({ clanId, 'contrib.points': { $gt: 0 } }).sort({ 'contrib.points': -1 }).limit(limit).toArray();
    return rows.map((m) => ({ userId: m.userId, ...m.contrib }));
  }
  return db.clanContrib
    .aggregate([
      { $match: { clanId, week: { $gte: fromWeek, $lte: toWeek } } },
      { $group: { _id: '$userId', points: { $sum: '$points' }, xp: { $sum: '$xp' }, reputation: { $sum: '$reputation' }, quests: { $sum: '$quests' }, wars: { $sum: '$wars' }, recruits: { $sum: '$recruits' }, donated: { $sum: '$donated' } } },
      { $sort: { points: -1 } },
      { $limit: limit },
    ])
    .toArray()
    .then((r) => r.map((x) => ({ userId: x._id, ...x, _id: undefined })));
}

/** Once a week: each clan's top contributor of last week becomes its Clan MVP (badge + Sparks). */
export async function awardMvps(week) {
  const { grant, notify } = await import('./rewards.js');
  const tops = await db.clanContrib.aggregate([{ $match: { week, points: { $gt: 0 } } }, { $sort: { points: -1 } }, { $group: { _id: '$clanId', userId: { $first: '$userId' }, points: { $first: '$points' } } }]).toArray();
  for (const t of tops) {
    const clan = await db.clans.findOne({ _id: t._id }, { projection: { name: 1, emoji: 1 } });
    if (!clan || !(await db.clanMembers.findOne({ clanId: t._id, userId: t.userId }))) continue;
    await db.clans.updateOne({ _id: t._id }, { $push: { mvps: { $each: [{ week, userId: t.userId, points: Math.floor(t.points) }], $slice: -52 } } });
    await db.clanMembers.updateOne({ clanId: t._id, userId: t.userId }, { $inc: { mvpCount: 1 } });
    await db.users.updateOne({ _id: t.userId }, { $set: { clanMvp: { week, clanId: t._id, clan: clan.name } } });
    await grant(t.userId, CONTRIBUTION.mvpSparks, 50, `Clan MVP of ${clan.name}`, true, { boost: false });
    await notify(t.userId, { kind: 'reward', title: `🏅 You’re ${clan.emoji} ${clan.name}’s Clan MVP!`, body: `Top contributor last week (${Math.floor(t.points).toLocaleString()} points) · +${CONTRIBUTION.mvpSparks} ✦`, link: `/clans/${t._id}` });
  }
}

// ——— Reputation & achievements ———
export async function addReputation(clanId, n) {
  if (n) await db.clans.updateOne({ _id: clanId }, { $inc: { reputation: n } });
}

/** Unlocks any achievements the clan now qualifies for (idempotent). */
export async function checkAchievements(clanId) {
  const c = await db.clans.findOne({ _id: clanId });
  if (!c) return;
  const have = new Set((c.achievements ?? []).map((a) => a.key));
  const todo = CLAN_ACHIEVEMENTS.filter((a) => !have.has(a.key));
  if (!todo.length) return;
  const stats = {
    level: clanLevelFor(c.rep).level,
    members: await db.clanMembers.countDocuments({ clanId }),
    wins: c.wins ?? 0,
    captured: c.captured ?? 0,
    held: await db.territories.countDocuments({ clanId }),
    objectives: c.objectivesDone ?? 0,
    hqMax: HQ_BUILDINGS.filter((h) => hqLevel(c.hq, h.key) >= HQ_LEVELS.length).length,
    trophies: (c.trophies ?? []).length,
    treasury: c.treasury ?? 0,
    reputation: c.reputation ?? 0,
    ageDays: (Date.now() - Date.parse(c.createdAt)) / 86_400_000,
  };
  const { notify } = await import('./rewards.js');
  for (const a of todo) {
    if (stats[a.stat] < a.goal) continue;
    const r = await db.clans.updateOne({ _id: clanId, 'achievements.key': { $ne: a.key } }, { $push: { achievements: { key: a.key, at: now() } }, $inc: { reputation: a.reputation } });
    if (!r.modifiedCount) continue;
    for (const m of await db.clanMembers.find({ clanId }, { projection: { userId: 1 } }).toArray())
      await notify(m.userId, { kind: 'system', title: `${a.emoji} Clan achievement: ${a.name}`, body: `${a.desc}${a.reputation ? ` · +${a.reputation} Reputation` : ''}`, link: `/clans/${clanId}` });
  }
}

// ——— Clan Quests ———
/** This week's objectives for a clan with their progress. */
export async function objectivesFor(c) {
  const week = clanEventFor().week;
  const list = clanObjectives(week, objectiveTier(c.rep));
  const row = await db.clanObjectives.findOne({ week, clanId: c._id });
  return list.map((o) => {
    const progress = o.key === 'active' ? (row?.active ?? []).length : Math.floor(row?.progress?.[o.key] ?? 0);
    return { ...o, progress: Math.min(progress, o.target), done: (row?.done ?? []).includes(o.key) };
  });
}

/** Counts a member's activity toward this week's objectives; pays out any that just completed. */
export async function trackObjective(clanId, kind, amount, userId = null) {
  const week = clanEventFor().week;
  const c = await db.clans.findOne({ _id: clanId }, { projection: { rep: 1, hq: 1, name: 1 } });
  if (!c) return;
  const list = clanObjectives(week, objectiveTier(c.rep));
  const relevant = list.filter((o) => o.key === kind || (o.key === 'active' && userId && kind === 'sparks'));
  if (!relevant.length && !(userId && kind === 'sparks')) return;
  const update = { $setOnInsert: { at: now() } };
  if (list.some((o) => o.key === kind) && kind !== 'active') update.$inc = { [`progress.${kind}`]: amount };
  if (userId && kind === 'sparks') update.$addToSet = { active: userId };
  if (!update.$inc && !update.$addToSet) return;
  const row = await db.clanObjectives.findOneAndUpdate({ week, clanId }, update, { upsert: true, returnDocument: 'after' });
  for (const o of relevant) {
    const progress = o.key === 'active' ? (row?.active ?? []).length : row?.progress?.[o.key] ?? 0;
    if (progress < o.target || (row?.done ?? []).includes(o.key)) continue;
    const r = await db.clanObjectives.updateOne({ week, clanId, done: { $ne: o.key } }, { $push: { done: o.key } });
    if (!r.modifiedCount) continue;
    await db.clans.updateOne({ _id: clanId }, { $inc: { treasury: o.reward.treasury, reputation: o.reward.reputation, objectivesDone: 1 } });
    const { addClanRep } = await import('./clans.js');
    await addClanRep(clanId, o.reward.xp);
    for (const u of row?.active ?? []) await contribute(clanId, u, { points: CONTRIBUTION.quest, quests: 1 });
    const { notify } = await import('./rewards.js');
    for (const m of await db.clanMembers.find({ clanId }, { projection: { userId: 1 } }).toArray())
      await notify(m.userId, { kind: 'reward', title: `${o.emoji} Clan Quest complete: ${o.name}`, body: `+${o.reward.xp} Clan XP · +${o.reward.treasury.toLocaleString()} ✦ treasury · +${o.reward.reputation} Reputation`, link: `/clans/${clanId}` });
    await checkAchievements(clanId);
  }
}

/** A member earned a reward: feeds the objectives it counts toward. */
export async function trackReward(clanId, userId, sparks, reason) {
  if (sparks <= 0) return;
  await trackObjective(clanId, 'sparks', sparks, userId);
  if (isArcade(reason)) await trackObjective(clanId, 'arcade', 1);
  if (isSocial(reason)) {
    await trackObjective(clanId, 'social', 1);
    await db.clans.updateOne({ _id: clanId }, { $inc: { reputation: 0.2 } }); // good social activity builds standing
    await contribute(clanId, userId, { reputation: 0.2 });
  }
  if (isArenaWin(reason)) await trackObjective(clanId, 'arena', 1);
}

// ——— Siege ———
/** The territory this clan fights for in this week's siege: the one it chose, else the one it holds. */
export async function siegeTarget(clanId, week = siegeFor().week) {
  const row = await db.clanSieges.findOne({ week, clanId });
  if (row) return row.territory;
  return (await db.territories.findOne({ clanId }))?._id ?? null;
}

/** Clan XP earned during a live siege counts as siege score (holders defend automatically). */
export async function scoreSiege(clanId, rep) {
  const s = siegeFor();
  if (!s.live || rep <= 0) return;
  const target = await siegeTarget(clanId, s.week);
  if (!target) return;
  const b = await clanBonuses(clanId);
  const holder = await db.territories.findOne({ _id: target }, { projection: { clanId: 1 } });
  const mult = (1 + b.war / 100) * (holder?.clanId === clanId ? 1 + SIEGE.defenderPct / 100 : 1);
  await db.clanSieges.updateOne({ week: s.week, clanId }, { $inc: { score: rep * mult }, $setOnInsert: { territory: target, at: now() } }, { upsert: true });
}

/** After the siege: the top scorer of each territory holds it; holders get their weekly payouts. */
export async function resolveSiege() {
  const s = siegeFor();
  if (!s.over) return;
  const done = await db.settings.findOne({ _id: 'siegeResolved' });
  if ((done?.week ?? -1) >= s.week) return;
  const r = await db.settings.updateOne({ _id: 'siegeResolved', $or: [{ week: { $lt: s.week } }, { week: { $exists: false } }] }, { $set: { week: s.week, at: now() } }, { upsert: true }).catch(() => null);
  if (!r?.modifiedCount && !r?.upsertedCount) return;
  const { notify } = await import('./rewards.js');
  const tell = async (clanId, n) => {
    for (const m of await db.clanMembers.find({ clanId }, { projection: { userId: 1 } }).toArray()) await notify(m.userId, { kind: 'system', link: `/clans/${clanId}`, ...n });
  };
  const touched = new Set();
  for (const t of TERRITORIES) {
    const top = await db.clanSieges.find({ week: s.week, territory: t.key, score: { $gt: 0 } }).sort({ score: -1 }).limit(1).toArray();
    const prev = await db.territories.findOne({ _id: t.key });
    const winner = top[0]?.clanId ?? prev?.clanId ?? null;
    const podium = await db.clanSieges.find({ week: s.week, territory: t.key, score: { $gt: 0 } }).sort({ score: -1 }).limit(3).toArray();
    if (podium.length) {
      const names = new Map((await db.clans.find({ _id: { $in: podium.map((p) => p.clanId) } }, { projection: { name: 1, tag: 1 } }).toArray()).map((c) => [c._id, c]));
      const battle = { week: s.week, winnerId: winner, top: podium.map((p) => ({ clanId: p.clanId, name: names.get(p.clanId)?.name, tag: names.get(p.clanId)?.tag, score: Math.floor(p.score) })) };
      await db.territories.updateOne({ _id: t.key }, { $push: { battles: { $each: [battle], $slice: -10 } }, $setOnInsert: { clanId: null } }, { upsert: true });
    }
    if (!winner || !(await db.clans.findOne({ _id: winner }, { projection: { _id: 1 } }))) continue;
    touched.add(winner);
    if (prev?.clanId !== winner) {
      const wc = await db.clans.findOne({ _id: winner }, { projection: { name: 1, tag: 1, emoji: 1 } });
      if (prev?.clanId) await db.territories.updateOne({ _id: t.key, 'history.to': null }, { $set: { 'history.$.to': now() } });
      await db.territories.updateOne(
        { _id: t.key },
        { $set: { clanId: winner, since: now(), week: s.week }, $push: { history: { $each: [{ clanId: winner, name: wc.name, tag: wc.tag, emoji: wc.emoji, from: now(), to: null }], $slice: -20 } } },
        { upsert: true },
      );
      await db.clans.updateOne({ _id: winner }, { $inc: { captured: 1, reputation: SIEGE.captureRep } });
      await tell(winner, { title: `🚩 Your clan captured ${t.emoji} ${t.name}!`, body: `${t.label} · +${SIEGE.captureRep} Reputation` });
      if (prev?.clanId) {
        touched.add(prev.clanId);
        await tell(prev.clanId, { title: `💥 Your clan lost ${t.emoji} ${t.name}`, body: 'Win it back at the next Siege, Saturday 18:00 UTC' });
      }
    } else {
      await db.clans.updateOne({ _id: winner }, { $inc: { reputation: SIEGE.holdRep } });
      await tell(winner, { title: `🛡️ Your clan held ${t.emoji} ${t.name}`, body: `+${SIEGE.holdRep} Reputation` });
    }
    // Weekly holder payouts.
    if (t.bonus.kind === 'treasury') await db.clans.updateOne({ _id: winner }, { $inc: { treasury: t.bonus.amount } });
    if (t.bonus.kind === 'gems') {
      const ids = (await db.clanMembers.find({ clanId: winner }, { projection: { userId: 1 } }).toArray()).map((m) => m.userId);
      await db.users.updateMany({ _id: { $in: ids } }, { $inc: { gems: t.bonus.amount } });
    }
  }
  for (const id of touched) {
    forgetBonuses(id);
    await checkAchievements(id);
  }
}
