import { CLAN_EVENT_PRIZES, CLAN_WAR, RECRUIT_DAYS, REP_PER_SPARKS, clanEventFor, clanLevelFor } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { addReputation, awardMvps, checkAchievements, clanBonuses, clanBoost, contribute, isArenaWin, isSocial, scoreSiege, trackReward } from './clanWorld.js';
import { warTrack } from './clanWars.js';
import { addSeasonPoints, checkBounties, countDay, eventBoost } from './clanSeason.js';
import { CONTRIBUTION, warModeFor, warScore } from '@chatlol/shared';

/**
 * Clans on the server: membership lookups (cached briefly), Rep from members' activity, level-ups, the Clan Wars
 * lifecycle and the weekly event payouts. Routes live in routes/clans.js.
 */
const memberCache = new Map(); // userId → { at, m }
export async function membershipOf(userId) {
  const c = memberCache.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.m;
  const m = await db.clanMembers.findOne({ userId });
  memberCache.set(userId, { at: Date.now(), m });
  return m;
}
export const forgetMember = (userId) => memberCache.delete(userId);

/** Clan boosts on a member's reward: the level-6 perk, the HQ Workshop, territories. Called from grant(). */
export async function clanRewardBonus(userId, sparks, xp, reason) {
  const m = await membershipOf(userId);
  return m ? clanBoost(m.clanId, sparks, xp, reason) : { sparks, xp };
}

/** How much this reward counts this week (weekend double Rep, plus the week's themed bonus). */
function multiplier(reason = '') {
  const ev = clanEventFor();
  let x = ev.weekend ? 2 : 1;
  const r = reason.toLowerCase();
  if (ev.key === 'arcade' && /arcade|points/.test(r)) x *= 2;
  if (ev.key === 'social' && /post|shout|comment|vibe/.test(r)) x *= 1.5;
  if (ev.key === 'arena' && /won|win|arena|tournament|pot/.test(r)) x *= 2;
  return x;
}

/** A member earned Sparks: their clan earns Rep (and war score, and this week's event score). */
export async function addRepFromSparks(userId, sparks, reason) {
  if (sparks <= 0) return;
  const m = await membershipOf(userId);
  if (!m) return;
  // Recruits graduate to Member after a few days of being around.
  if (m.role === 'recruit' && Date.now() - Date.parse(m.joinedAt) > RECRUIT_DAYS * 86_400_000) {
    await db.clanMembers.updateOne({ _id: m._id, role: 'recruit' }, { $set: { role: 'member' } });
    forgetMember(userId);
  }
  const b = await clanBonuses(m.clanId);
  const rep = await eventBoost(m.clanId, (sparks / REP_PER_SPARKS) * multiplier(reason) * (1 + b.clanxp / 100), sparks, isSocial(reason));
  await addClanRep(m.clanId, rep, userId);
  await contribute(m.clanId, userId, { points: rep, xp: rep });
  await addSeasonPoints(m.clanId, rep);
  await countDay(m.clanId, { xp: rep }, userId);
  await scoreSiege(m.clanId, rep);
  await warTrack(m.clanId, userId, { xp: rep * (1 + b.war / 100), social: isSocial(reason) ? 1 : 0, wins: isArenaWin(reason) ? 1 : 0 });
  await trackReward(m.clanId, userId, sparks, reason);
  await checkBounties(m.clanId);
}

export async function addClanRep(clanId, rep, userId = null) {
  if (!rep) return;
  const before = await db.clans.findOneAndUpdate({ _id: clanId }, { $inc: { rep } }, { returnDocument: 'before', projection: { rep: 1, name: 1 } });
  if (!before) return;
  if (userId) await db.clanMembers.updateOne({ clanId, userId }, { $inc: { rep } });
  const week = clanEventFor().week;
  await db.clanWeeks.updateOne({ week, clanId }, { $inc: { rep }, $setOnInsert: { at: now() } }, { upsert: true });
  const from = clanLevelFor(before.rep);
  const to = clanLevelFor(before.rep + rep);
  if (to.level > from.level) await onLevelUp(clanId, before.name, to);
}

async function onLevelUp(clanId, name, lvl) {
  await syncMemberBadges(clanId);
  await checkAchievements(clanId);
  const { notify } = await import('./rewards.js');
  for (const m of await db.clanMembers.find({ clanId }, { projection: { userId: 1 } }).toArray())
    await notify(m.userId, { kind: 'system', title: `🏰 ${name} reached level ${lvl.level}!`, body: `Unlocked: ${lvl.perk}`, link: `/clans/${clanId}` });
}

/** Copies the clan's tag / level / colour onto members' profiles (shown next to their names). */
export async function syncMemberBadges(clanId) {
  const c = await db.clans.findOne({ _id: clanId });
  if (!c) return;
  const ids = (await db.clanMembers.find({ clanId }, { projection: { userId: 1 } }).toArray()).map((m) => m.userId);
  await db.users.updateMany({ _id: { $in: ids } }, { $set: { clan: { id: c._id, tag: c.tag, name: c.name, emoji: c.emoji, color: c.color ?? null, level: clanLevelFor(c.rep).level, glow: c.hq?.prestige ?? 0, prestige: c.prestige ?? 0, badge: c.equipped?.badge ?? null } } });
}

// ——— Clan Wars ———

/** Ends wars whose time is up (pot to the winner, Rep bonus) and expires challenges nobody accepted in 24 h. */
export async function resolveClanWars() {
  const { notify } = await import('./rewards.js');
  for (const w of await db.clanWars.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 86_400_000).toISOString() } }).toArray()) {
    const r = await db.clanWars.updateOne({ _id: w._id, status: 'pending' }, { $set: { status: 'expired' } });
    if (r.modifiedCount && w.stake) await db.clans.updateOne({ _id: w.aId }, { $inc: { treasury: w.stake } });
  }
  for (const w of await db.clanWars.find({ status: 'active', endsAt: { $lte: now() } }).toArray()) {
    const r = await db.clanWars.updateOne({ _id: w._id, status: 'active' }, { $set: { status: 'finished', finishedAt: now() } });
    if (!r.modifiedCount) continue;
    const pts = warScore(w, Date.parse(w.endsAt));
    const winner = pts.a === pts.b ? null : pts.a > pts.b ? w.aId : w.bId;
    await db.clanWars.updateOne({ _id: w._id }, { $set: { winnerId: winner, points: { a: pts.a, b: pts.b } } });
    if (!winner) {
      if (w.stake) for (const id of [w.aId, w.bId]) await db.clans.updateOne({ _id: id }, { $inc: { treasury: w.stake } });
    } else {
      const loser = winner === w.aId ? w.bId : w.aId;
      await db.clans.updateOne({ _id: winner }, { $inc: { treasury: w.stake * 2, wins: 1, streak: 1 } });
      await db.clans.updateOne({ _id: winner }, [{ $set: { bestStreak: { $max: ['$bestStreak', '$streak'] } } }]);
      await db.clans.updateOne({ _id: loser }, { $inc: { losses: 1, reputation: 5 }, $set: { streak: 0 } });
      await addSeasonPoints(winner, 250);
      await addSeasonPoints(loser, 50);
      await addClanRep(winner, CLAN_WAR.winRep);
      await addReputation(winner, 20);
      // Everyone who pitched in during the war gets the victory on their record.
      for (const userId of w[winner === w.aId ? 'a' : 'b']?.users ?? [])
        await contribute(winner, userId, { points: CONTRIBUTION.war, wars: 1 });
      await checkAchievements(winner);
    }
    const [a, b] = await Promise.all([db.clans.findOne({ _id: w.aId }), db.clans.findOne({ _id: w.bId })]);
    const title = winner ? `⚔️ ${(winner === w.aId ? a : b)?.name} won the war!` : '⚔️ The war ended in a draw';
    for (const id of [w.aId, w.bId])
      for (const m of await db.clanMembers.find({ clanId: id }, { projection: { userId: 1 } }).toArray())
        await notify(m.userId, { kind: 'system', title, body: `${warModeFor(w.mode).name}: ${a?.name} ${Math.floor(pts.a)} – ${Math.floor(pts.b)} ${b?.name} War Points`, link: `/clans/${id}` });
  }
}

// ——— Weekly events ———

/** Once a week: the top three clans of last week's event share Gems (every member gets them). */
export async function payClanWeek() {
  const last = clanEventFor().week - 1;
  const done = await db.settings.findOne({ _id: 'clanWeekPaid' });
  if ((done?.week ?? -1) >= last) return;
  const r = await db.settings.updateOne({ _id: 'clanWeekPaid', $or: [{ week: { $lt: last } }, { week: { $exists: false } }] }, { $set: { week: last, at: now() } }, { upsert: true }).catch(() => null);
  if (!r?.modifiedCount && !r?.upsertedCount) return; // another server is paying
  const top = await db.clanWeeks.find({ week: last }).sort({ rep: -1 }).limit(CLAN_EVENT_PRIZES.length).toArray();
  const { notify } = await import('./rewards.js');
  for (const [i, row] of top.entries()) {
    const prize = CLAN_EVENT_PRIZES[i];
    const clan = await db.clans.findOne({ _id: row.clanId });
    if (!clan) continue;
    await db.clans.updateOne({ _id: clan._id }, { $push: { trophies: { week: last, place: prize.place, at: now() } }, $inc: { reputation: 40 - i * 15 } });
    await checkAchievements(clan._id);
    for (const m of await db.clanMembers.find({ clanId: clan._id }, { projection: { userId: 1 } }).toArray()) {
      await db.users.updateOne({ _id: m.userId }, { $inc: { gems: prize.gems } });
      await notify(m.userId, { kind: 'system', title: `🏆 ${clan.name} placed #${prize.place} in last week’s clan event!`, body: `+${prize.gems} 💎 for every member`, link: `/clans/${clan._id}` });
    }
  }
  await awardMvps(last);
}

export const newClanId = newId;
