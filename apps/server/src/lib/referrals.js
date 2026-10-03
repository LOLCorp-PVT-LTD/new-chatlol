import { randomBytes } from 'node:crypto';
import { REFERRAL, levelForXp } from '@chatlol/shared';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { HttpError } from './http.js';
import { sendMail, template } from './mailer.js';
import { emitWallet, notify } from './rewards.js';
import { track } from './activity.js';

/**
 * Referrals: every member has a personal invite link. A friend who signs up through it is linked to them; once
 * that friend has verified their email and reached REFERRAL.minLevel, the inviter earns REFERRAL.gold Gold.
 * (Paying on sign-up alone would let anyone farm Gold with throwaway accounts.)
 */
export async function referralCode(userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { refCode: 1 } });
  if (u?.refCode) return u.refCode;
  for (;;) {
    const code = randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 7).toUpperCase();
    if (code.length < 6 || (await db.users.findOne({ refCode: code }, { projection: { _id: 1 } }))) continue;
    await db.users.updateOne({ _id: userId, refCode: null }, { $set: { refCode: code } });
    return (await db.users.findOne({ _id: userId }, { projection: { refCode: 1 } })).refCode;
  }
}
export const referralLink = (code) => `${config.appUrl}/join?ref=${code}`;

/** At sign-up: links the new account to whoever invited them. */
export async function attachReferrer(newUserId, code) {
  if (!code) return;
  const inviter = await db.users.findOne({ refCode: String(code).toUpperCase(), deletedAt: null }, { projection: { _id: 1 } });
  if (!inviter || inviter._id === newUserId) return;
  await db.users.updateOne({ _id: newUserId }, { $set: { referredById: inviter._id, referralPaid: false } });
  await notify(inviter._id, {
    kind: 'system',
    actorId: newUserId,
    title: '🎉 A friend joined with your invite link!',
    body: `You get 🪙 ${REFERRAL.gold} Gold once they verify their email and reach level ${REFERRAL.minLevel}.`,
    link: '/invite',
  });
}

/** Pays the inviter once the friend qualifies. Safe to call any number of times (pays once). */
export async function maybePayReferral(userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { referredById: 1, referralPaid: 1, emailVerifiedAt: 1, xp: 1, displayName: 1 } });
  if (!u?.referredById || u.referralPaid || !u.emailVerifiedAt || levelForXp(u.xp ?? 0) < REFERRAL.minLevel) return false;
  const claimed = await db.users.updateOne({ _id: userId, referralPaid: false }, { $set: { referralPaid: true, referralPaidAt: now() } });
  if (!claimed.modifiedCount) return false;
  await db.users.updateOne({ _id: u.referredById }, { $inc: { gold: REFERRAL.gold, referralCount: 1 } });
  track(u.referredById, 'referral');
  await notify(u.referredById, { kind: 'system', actorId: userId, title: `🪙 +${REFERRAL.gold} Gold — ${u.displayName} is all set up!`, body: 'Thanks for growing ChatLOL. Keep inviting!', link: '/invite' });
  await emitWallet(u.referredById);
  return true;
}

export async function referralStats(userId) {
  const code = await referralCode(userId);
  const [joined, paid] = await Promise.all([
    db.users.countDocuments({ referredById: userId }),
    db.users.countDocuments({ referredById: userId, referralPaid: true }),
  ]);
  const recent = await db.users
    .find({ referredById: userId }, { projection: { displayName: 1, handle: 1, avatarUrl: 1, referralPaid: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  return {
    code,
    link: referralLink(code),
    joined,
    paid,
    goldEarned: paid * REFERRAL.gold,
    friends: recent.map((r) => ({ id: r._id, displayName: r.displayName, handle: r.handle, avatarUrl: r.avatarUrl, paid: !!r.referralPaid, joinedAt: r.createdAt })),
  };
}

/** Email invites (rate-limited by the route). Addresses that already have an account are skipped. */
export async function emailInvites(userId, emails) {
  const u = await db.users.findOne({ _id: userId }, { projection: { displayName: 1 } });
  const link = referralLink(await referralCode(userId));
  let sent = 0;
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (await db.users.findOne({ email }, { projection: { _id: 1 } })) continue;
    await sendMail({
      to: email,
      subject: `${u.displayName} invited you to ChatLOL`,
      ...template({
        title: `${u.displayName} wants you on ChatLOL 🌅`,
        intro: 'Chat, rate, play games for Sparks and Gold, and meet people. Join with this link and you both get rewards.',
        cta: 'Join ChatLOL',
        url: link,
        outro: 'If you don’t know them, just ignore this email.',
      }),
    }).catch(() => {});
    sent++;
  }
  if (!sent) throw new HttpError(400, 'Those people are already on ChatLOL');
  return sent;
}
