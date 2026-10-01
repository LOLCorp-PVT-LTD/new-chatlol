import { createHash, randomBytes } from 'node:crypto';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { sendMail, template } from './mailer.js';

const TTL_MS = { verify: 3 * 86_400_000, reset: 60 * 60_000 };
const hash = (t) => createHash('sha256').update(t).digest('hex');

/** Creates a single-use token (only its hash is stored) and invalidates older ones of the same kind. */
export async function issueToken(userId, kind) {
  const token = randomBytes(32).toString('base64url');
  await db.run('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL', now(), userId, kind);
  await db.run(
    'INSERT INTO email_tokens (token_hash, user_id, kind, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
    hash(token),
    userId,
    kind,
    new Date(Date.now() + TTL_MS[kind]).toISOString(),
    now(),
  );
  return token;
}

/** Atomically consumes a token. Returns the user id or null if invalid/expired/used. */
export async function consumeToken(token, kind) {
  const h = hash(token);
  const r = await db.run(
    'UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?',
    now(),
    h,
    kind,
    now(),
  );
  if (!r.changes) return null;
  return (await db.one('SELECT user_id FROM email_tokens WHERE token_hash = ?', h))?.user_id ?? null;
}

export async function sendVerification(user) {
  const token = await issueToken(user.id, 'verify');
  const url = `${config.appUrl}/verify?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Confirm your ChatLOL email ✨',
    ...template({
      title: `Hey ${user.display_name}, confirm it’s you`,
      intro: 'Tap below to verify your email. Verified members can go live, buy Gems, and get +50 Sparks right now.',
      cta: 'Verify my email',
      url,
      outro: 'This link expires in 3 days.',
    }),
  });
}

export async function sendPasswordReset(user) {
  const token = await issueToken(user.id, 'reset');
  const url = `${config.appUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your ChatLOL password',
    ...template({
      title: 'Let’s get you back in',
      intro: `Someone (hopefully you, ${user.display_name}) asked to reset the password for this account.`,
      cta: 'Choose a new password',
      url,
      outro: 'This link expires in 1 hour. If you didn’t ask for this, you can ignore this email — your password won’t change.',
    }),
  });
}
