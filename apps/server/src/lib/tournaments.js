import { db, newId, now } from '../db.js';
import { HttpError } from './http.js';
import { emitWallet, notify, ticker } from './rewards.js';
import { itemIdFor } from './ids.js';
import { extendPremium } from '../routes/profile.js';
import { levelForXp, isStaff } from '@chatlol/shared';

/**
 * Tournaments, run by staff. Two formats:
 *  - arcade: best verified score in one arcade game between startsAt and endsAt
 *  - arena: most arena wins in one arena game in that window
 * Entry needs a minimum level (default 15) and, optionally, a Gold fee. Prizes per place are paid automatically when
 * it ends (Gold, Gems, Sparks, Premium days, a Vault item). A cash prize is only allowed on free-entry tournaments
 * and is recorded for staff to pay out by hand.
 */
export const status = (t, at = now()) => (t.cancelled ? 'cancelled' : t.finishedAt ? 'ended' : at < t.startsAt ? 'upcoming' : at < t.endsAt ? 'live' : 'ending');

export async function joinTournament(t, userId) {
  const st = status(t);
  if (st !== 'upcoming' && st !== 'live') throw new HttpError(409, 'Entries are closed');
  const u = await db.users.findOne({ _id: userId }, { projection: { xp: 1, role: 1, perms: 1 } });
  if (!isStaff(u) && levelForXp(u.xp ?? 0) < t.minLevel) throw new HttpError(403, `You need to be level ${t.minLevel} to enter`, 'level_required');
  if (t.maxEntrants && (await db.tournamentEntries.countDocuments({ tournamentId: t._id })) >= t.maxEntrants) throw new HttpError(409, 'This tournament is full');
  if (await db.tournamentEntries.findOne({ tournamentId: t._id, userId })) return;
  if (t.entryGold > 0) {
    const paid = await db.users.updateOne({ _id: userId, gold: { $gte: t.entryGold } }, { $inc: { gold: -t.entryGold } });
    if (!paid.modifiedCount) throw new HttpError(402, `Entry costs 🪙 ${t.entryGold} Gold`, 'insufficient_gold');
    void emitWallet(userId);
  }
  await db.tournamentEntries.insertOne({ _id: newId(), tournamentId: t._id, userId, score: 0, joinedAt: now(), paidGold: t.entryGold });
}

/** Live tournaments this result counts toward: arcade scores (best) or arena wins (+1). */
export async function recordTournamentResult(kind, game, userIds, value) {
  const at = now();
  const live = await db.tournaments.find({ kind, game, cancelled: { $ne: true }, finishedAt: null, startsAt: { $lte: at }, endsAt: { $gt: at } }, { projection: { _id: 1 } }).toArray();
  for (const t of live)
    for (const userId of userIds) {
      if (kind === 'arcade') await db.tournamentEntries.updateOne({ tournamentId: t._id, userId, score: { $lt: value } }, { $set: { score: value, scoredAt: at } });
      else await db.tournamentEntries.updateOne({ tournamentId: t._id, userId }, { $inc: { score: value }, $set: { scoredAt: at } });
    }
}

export const standings = (tournamentId, limit = 100) =>
  db.tournamentEntries.find({ tournamentId, score: { $gt: 0 } }).sort({ score: -1, scoredAt: 1 }).limit(limit).toArray();

/** Worker: pays out tournaments whose window has closed. */
export async function finishDueTournaments() {
  const due = await db.tournaments.find({ cancelled: { $ne: true }, finishedAt: null, endsAt: { $lte: now() } }).limit(10).toArray();
  for (const t of due) await finishTournament(t);
}

export async function finishTournament(t) {
  const claimed = await db.tournaments.updateOne({ _id: t._id, finishedAt: null }, { $set: { finishedAt: now() } });
  if (!claimed.modifiedCount) return;
  const top = await standings(t._id, t.prizes.length);
  const results = [];
  for (const [i, e] of top.entries()) {
    const p = t.prizes[i];
    if (!p) break;
    const inc = {};
    if (p.gold) inc.gold = p.gold;
    if (p.gems) inc.gems = p.gems;
    if (p.sparks) inc.sparks = p.sparks;
    if (Object.keys(inc).length) await db.users.updateOne({ _id: e.userId }, { $inc: inc });
    if (p.premiumDays) await extendPremium(e.userId, p.premiumDays);
    if (p.item) await db.inventory.updateOne({ userId: e.userId, itemId: itemIdFor(p.item) }, { $inc: { qty: 1 }, $set: { via: 'admin' }, $setOnInsert: { acquiredAt: now() } }, { upsert: true });
    results.push({ place: i + 1, userId: e.userId, score: e.score, prize: p, cashStatus: p.cash ? 'to_pay' : null });
    await notify(e.userId, {
      kind: 'system',
      title: `🏆 You placed #${i + 1} in ${t.title}!`,
      body: prizeText(p) + (p.cash ? ' The team will contact you about your cash prize.' : ''),
      link: `/tournaments/${t._id}`,
    });
    void emitWallet(e.userId);
  }
  await db.tournaments.updateOne({ _id: t._id }, { $set: { results } });
  if (results[0]) {
    const w = await db.users.findOne({ _id: results[0].userId }, { projection: { handle: 1 } });
    void ticker(`🏆 @${w?.handle} won ${t.title}!`, results[0].userId);
  }
}

/** Cancelled: everyone gets their Gold entry back. */
export async function cancelTournament(t) {
  await db.tournaments.updateOne({ _id: t._id }, { $set: { cancelled: true } });
  for (const e of await db.tournamentEntries.find({ tournamentId: t._id, paidGold: { $gt: 0 } }).toArray()) {
    await db.users.updateOne({ _id: e.userId }, { $inc: { gold: e.paidGold } });
    await notify(e.userId, { kind: 'system', title: `${t.title} was cancelled`, body: `Your 🪙 ${e.paidGold} Gold entry was refunded.`, link: '/tournaments' });
  }
}

export function prizeText(p) {
  return [p.gold && `🪙 ${p.gold} Gold`, p.gems && `💎 ${p.gems} Gems`, p.sparks && `✦ ${p.sparks} Sparks`, p.premiumDays && `👑 ${p.premiumDays} days Premium`, p.item && `🎁 ${p.item}`, p.cash && `💵 ${p.cash}`]
    .filter(Boolean)
    .join(' + ');
}
