import { createHash, randomBytes } from 'node:crypto';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { sendMail, template } from './mailer.js';

const TTL_MS = { verify: 3 * 86_400_000, reset: 60 * 60_000 };
const hash = (t) => createHash('sha256').update(t).digest('hex');

/** Creates a single-use token (only its hash is stored) and invalidates older ones of the same kind. */
export async function issueToken(userId, kind) {
  const token = randomBytes(32).toString('base64url');
  await db.emailTokens.updateMany({ userId, kind, usedAt: null }, { $set: { usedAt: now() } });
  const expires = new Date(Date.now() + TTL_MS[kind]);
  await db.emailTokens.insertOne({
    tokenHash: hash(token),
    userId,
    kind,
    expiresAt: expires.toISOString(),
    expiresAtDate: expires, // TTL index removes the document a week after expiry
    usedAt: null,
    createdAt: now(),
  });
  return token;
}

/** Atomically consumes a token. Returns the user id or null if invalid/expired/used. */
export async function consumeToken(token, kind) {
  const t = await db.emailTokens.findOneAndUpdate(
    { tokenHash: hash(token), kind, usedAt: null, expiresAt: { $gt: now() } },
    { $set: { usedAt: now() } },
  );
  return t?.userId ?? null;
}

export async function sendVerification(user) {
  const token = await issueToken(user._id, 'verify');
  const url = `${config.appUrl}/verify?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Confirm your ChatLOL email ✨',
    ...template({
      title: `Hey ${user.displayName}, confirm it’s you`,
      intro: 'Tap below to verify your email. Verified members can go live, buy Gems, and get +50 Sparks right now.',
      cta: 'Verify my email',
      url,
      outro: 'This link expires in 3 days.',
    }),
  });
}

export async function sendPasswordReset(user) {
  const token = await issueToken(user._id, 'reset');
  const url = `${config.appUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your ChatLOL password',
    ...template({
      title: 'Let’s get you back in',
      intro: `Someone (hopefully you, ${user.displayName}) asked to reset the password for this account.`,
      cta: 'Choose a new password',
      url,
      outro: 'This link expires in 1 hour. If you didn’t ask for this, you can ignore this email — your password won’t change.',
    }),
  });
}

/** Tells the old address that the account email changed (so a hijack can't go unnoticed). */
export async function sendEmailChangedNotice(user, newEmail) {
  const masked = newEmail.replace(/^(.).*(@.*)$/, '$1•••$2');
  await sendMail({
    to: user.email,
    subject: 'Your ChatLOL email was changed',
    ...template({
      title: 'Your email was changed',
      intro: `Hi ${user.displayName}, the email on your ChatLOL account was just changed to ${masked}.`,
      cta: 'Reset my password',
      url: `${config.appUrl}/forgot`,
      outro: 'If this was you, you can ignore this. If not, reset your password right away and contact support.',
    }),
  });
}
