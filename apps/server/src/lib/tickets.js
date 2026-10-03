import { EXCHANGE, isStaff, ticketByKey } from '@chatlol/shared';
import { db, newId, now, today } from '../db.js';
import { HttpError } from './http.js';
import { itemIdFor } from './ids.js';
import { io, room } from './io.js';
import { shared } from './shared.js';
import { applyAction, standing } from './enforcement.js';
import { notify, emitWallet } from './rewards.js';
import { isKing } from './king.js';

export const kickKey = (loungeId, userId) => `lounge:kick:${loungeId}:${userId}`;

/** One-way exchange: earned Sparks → Gems → Gold. `amount` is how many of the target currency to get. */
export async function exchange(userId, to, amount) {
  const [from, rate] = to === 'gems' ? ['sparks', EXCHANGE.sparksPerGem] : ['gems', EXCHANGE.gemsPerGold];
  const cost = amount * rate;
  const paid = await db.users.updateOne({ _id: userId, [from]: { $gte: cost } }, { $inc: { [from]: -cost, [to]: amount } });
  if (!paid.modifiedCount)
    throw new HttpError(402, `You need ${cost.toLocaleString()} ${from === 'sparks' ? 'Sparks' : 'Gems'} for that`, `insufficient_${from}`);
  await emitWallet(userId);
  return db.users.findOne({ _id: userId }, { projection: { sparks: 1, gems: 1, gold: 1 } });
}

/**
 * Uses a ticket from `userId`'s locker on `targetId`. The reigning King gets one free ban, mute and kick a day.
 * Every use is logged (modEvents, category `ticket_*`) so staff can see and reverse it.
 */
export async function useTicket(userId, key, { targetId, loungeId } = {}) {
  const t = ticketByKey(key);
  if (!t) throw new HttpError(404, 'That isn’t a ticket');
  if (!targetId || targetId === userId) throw new HttpError(400, 'Pick someone else to use it on');
  const [me, target] = await Promise.all([
    db.users.findOne({ _id: userId }, { projection: { handle: 1 } }),
    db.users.findOne(
      { _id: targetId, deletedAt: null },
      { projection: { handle: 1, isAi: 1, role: 1, perms: 1, moderation: 1, premium: 1 } },
    ),
  ]);
  if (!target) throw new HttpError(404, 'User not found');
  const hostile = key !== 'premium_gift';
  if (hostile) {
    if (target.isAi) throw new HttpError(400, 'AI personas can’t be targeted');
    if (isStaff(target)) throw new HttpError(403, 'Staff can’t be targeted by tickets', 'ticket_protected');
    if (await isKing(targetId)) throw new HttpError(403, 'The King of ChatLOL is untouchable 👑', 'ticket_protected');
  }
  if (t.immunityHours) {
    const since = new Date(Date.now() - t.immunityHours * 3_600_000).toISOString();
    if (await db.modEvents.findOne({ userId: targetId, category: `ticket_${key}`, createdAt: { $gt: since } }))
      throw new HttpError(409, `@${target.handle} was hit by a ${t.name} recently and is protected for now`, 'ticket_immune');
  }
  if (key === 'kick_ticket') {
    if (!loungeId || !(await db.lounges.findOne({ _id: loungeId }))) throw new HttpError(400, 'Use it inside a lounge: tap their name');
  }
  if (hostile && key !== 'kick_ticket') {
    // Never shortens a stricter standing a moderator already set.
    const s = standing(target);
    if (s.status === 'banned' || s.status === 'suspended' || (key === 'mute_ticket' && s.status === 'muted'))
      throw new HttpError(409, `@${target.handle} is already ${s.status}`, 'ticket_redundant');
  }

  // Pay: the King's daily freebie, else one ticket from the locker.
  const free =
    hostile &&
    (await isKing(userId)) &&
    (await db.dailyCounters.insertIfMissing({ userId, day: today(), key: `king_${key}` }, { n: 1, at: new Date() }));
  if (!free) {
    const used = await db.inventory.updateOne({ userId, itemId: itemIdFor(key), qty: { $gt: 0 } }, { $inc: { qty: -1 } });
    if (!used.modifiedCount)
      throw new HttpError(402, `You don’t have a ${t.name}. Get one in the Vault for 🪙 ${t.gold} Gold.`, 'ticket_missing');
  }

  const by = `@${me.handle}`;
  const reason = `${t.name} used by ${by}`;
  if (key === 'ban_ticket')
    await applyAction(targetId, { action: 'suspend', minutes: t.minutes, reason, by: userId, category: `ticket_${key}` });
  else if (key === 'mute_ticket')
    await applyAction(targetId, { action: 'mute', minutes: t.minutes, reason, by: userId, category: `ticket_${key}` });
  else if (key === 'kick_ticket') {
    await shared().set(kickKey(loungeId, targetId), userId, t.minutes * 60);
    await db.modEvents.insertOne({
      _id: newId(),
      userId: targetId,
      kind: 'kick',
      minutes: t.minutes,
      reason,
      category: `ticket_${key}`,
      ref: { type: 'lounge', id: loungeId },
      byUserId: userId,
      createdAt: now(),
    });
    io()?.in(room.user(targetId)).socketsLeave(room.lounge(loungeId));
    io()?.to(room.user(targetId)).emit('lounge:kicked', { loungeId, by: me.handle, minutes: t.minutes });
    await notify(targetId, {
      kind: 'system',
      title: `🥾 ${by} kicked you from a lounge`,
      body: `You can go back in ${t.minutes} minutes.`,
      link: '/lounges',
    });
  } else if (key === 'premium_gift') {
    const from = Math.max(Date.now(), Date.parse(target.premium?.until ?? '') || 0);
    await db.users.updateOne({ _id: targetId }, { $set: { 'premium.until': new Date(from + t.minutes * 60_000).toISOString() } });
    await notify(targetId, {
      kind: 'system',
      actorId: userId,
      title: `🎁 ${by} gifted you a day of Premium!`,
      body: 'Enjoy the crown 👑',
      link: '/premium',
    });
  }
  return { used: key, free: !!free, target: { id: targetId, handle: target.handle } };
}
