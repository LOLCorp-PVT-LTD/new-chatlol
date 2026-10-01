import { Router } from 'express';
import { z } from 'zod';
import { ageFrom, MIN_AGE, REWARDS } from '@chatlol/shared';
import { db, newId, now, today, json, type Row } from '../db';
import { hashPassword, verifyPassword, signToken, requireAuth, uid, passwordVersion } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { userPrivate, DEFAULT_SETTINGS, invalidateStats } from '../lib/serialize';
import { grant, notify } from '../lib/rewards';
import { assertClean } from '../lib/moderation';
import { consumeToken, sendPasswordReset, sendVerification } from '../lib/emailTokens';

export const authRouter = Router();

const handleRe = /^[a-zA-Z0-9_.]{3,20}$/;
const me = async (id: string) => userPrivate((await db.one<Row>('SELECT * FROM users WHERE id = ?', id))!);
const session = (row: Row) => signToken(row.id, passwordVersion(row.password_hash));

authRouter.post('/auth/register', async (req, res) => {
  await rateLimit(`register:${req.ip}`, 5);
  const b = parse(
    z.object({
      email: z.string().email().max(200),
      password: z.string().min(8, 'at least 8 characters').max(200),
      handle: z.string().regex(handleRe, '3–20 letters, numbers, _ or .'),
      displayName: z.string().trim().min(1).max(40),
      birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      interests: z.array(z.string().max(30)).max(12).optional(),
    }),
    req.body,
  );
  if (ageFrom(b.birthdate) < MIN_AGE) throw new HttpError(403, `ChatLOL is for adults ${MIN_AGE}+ only.`, 'underage');
  assertClean(`${b.handle} ${b.displayName}`);
  const email = b.email.toLowerCase();
  if (await db.one('SELECT 1 AS x FROM users WHERE email = ?', email)) throw new HttpError(409, 'That email already has an account', 'email_taken');
  if (await db.one('SELECT 1 AS x FROM users WHERE LOWER(handle) = LOWER(?)', b.handle)) throw new HttpError(409, 'That handle is taken', 'handle_taken');
  const id = newId('u');
  const t = now();
  await db.run(
    `INSERT INTO users (id, email, password_hash, handle, display_name, avatar_url, birthdate, interests, settings, last_seen_at, created_at, badges)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, email, await hashPassword(b.password), b.handle, b.displayName,
    `https://api.dicebear.com/9.x/notionists/png?size=256&backgroundColor=ffdbce,ffdcbd,ffd9dc&seed=${encodeURIComponent(b.handle)}`,
    b.birthdate, JSON.stringify(b.interests ?? []), JSON.stringify(DEFAULT_SETTINGS), t, t, JSON.stringify(['early_spark']));
  // Starter social graph: follow a handful of active members so the feed is alive from minute one.
  for (const s of await db.all<Row>(`SELECT id FROM users WHERE id != ? AND deleted_at IS NULL ORDER BY xp DESC LIMIT 8`, id)) {
    await db.run('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', id, s.id, t);
  }
  await notify(id, { kind: 'system', title: 'Welcome to ChatLOL 🌅', body: 'Drop your first Sunset photo today to start a streak and earn 120 Sparks.', link: '/drops' });
  const row = (await db.one<Row>('SELECT * FROM users WHERE id = ?', id))!;
  await sendVerification({ id, email, display_name: b.displayName });
  res.status(201).json({ token: session(row), user: await userPrivate(row) });
});

authRouter.post('/auth/login', async (req, res) => {
  await rateLimit(`login:${req.ip}`, 10);
  const b = parse(z.object({ login: z.string().min(1).max(200), password: z.string().min(1).max(200) }), req.body);
  const row = await db.one<Row>('SELECT * FROM users WHERE (email = ? OR LOWER(handle) = LOWER(?)) AND deleted_at IS NULL AND is_ai = 0', b.login.toLowerCase(), b.login);
  if (!row || !(await verifyPassword(b.password, row.password_hash))) throw new HttpError(401, 'Wrong login or password');
  res.json({ token: session(row), user: await userPrivate(row) });
});

// ——— Email verification ———
authRouter.post('/auth/verify', async (req, res) => {
  await rateLimit(`verify:${req.ip}`, 20);
  const { token } = parse(z.object({ token: z.string().min(20).max(100) }), req.body);
  const userId = await consumeToken(token, 'verify');
  if (!userId) throw new HttpError(400, 'That link has expired or was already used', 'invalid_token');
  const r = await db.run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL', now(), userId);
  if (r.changes) await grant(userId, 50, 25, 'Email verified ✅');
  res.json({ ok: true });
});

authRouter.post('/auth/verify/resend', requireAuth, async (req, res) => {
  const id = uid(req);
  await rateLimit(`verify-resend:${id}`, 3);
  const u = (await db.one<Row>('SELECT id, email, display_name, email_verified_at FROM users WHERE id = ?', id))!;
  if (u.email_verified_at) return res.json({ ok: true, alreadyVerified: true });
  await sendVerification({ id, email: u.email, display_name: u.display_name });
  res.json({ ok: true });
});

// ——— Password reset ———
authRouter.post('/auth/password/forgot', async (req, res) => {
  await rateLimit(`forgot:${req.ip}`, 5);
  const { email } = parse(z.object({ email: z.string().email().max(200) }), req.body);
  await rateLimit(`forgot-email:${email.toLowerCase()}`, 3);
  const u = await db.one<Row>('SELECT id, email, display_name FROM users WHERE email = ? AND deleted_at IS NULL AND is_ai = 0', email.toLowerCase());
  if (u) await sendPasswordReset({ id: u.id, email: u.email, display_name: u.display_name });
  // Same response whether or not the account exists, so emails can't be enumerated.
  res.json({ ok: true });
});

authRouter.post('/auth/password/reset', async (req, res) => {
  await rateLimit(`reset:${req.ip}`, 10);
  const b = parse(z.object({ token: z.string().min(20).max(100), password: z.string().min(8, 'at least 8 characters').max(200) }), req.body);
  const userId = await consumeToken(b.token, 'reset');
  if (!userId) throw new HttpError(400, 'That reset link has expired or was already used', 'invalid_token');
  // Changing the hash changes the password version, which signs out every existing session.
  await db.run('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', await hashPassword(b.password), now(), userId);
  const row = (await db.one<Row>('SELECT * FROM users WHERE id = ?', userId))!;
  res.json({ token: session(row), user: await userPrivate(row) });
});

authRouter.post('/auth/password/change', requireAuth, async (req, res) => {
  const id = uid(req);
  await rateLimit(`pwchange:${id}`, 5);
  const b = parse(z.object({ current: z.string().min(1).max(200), password: z.string().min(8).max(200) }), req.body);
  const row = (await db.one<Row>('SELECT * FROM users WHERE id = ?', id))!;
  if (!(await verifyPassword(b.current, row.password_hash))) throw new HttpError(403, 'Current password is wrong');
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(b.password), id);
  const updated = (await db.one<Row>('SELECT * FROM users WHERE id = ?', id))!;
  res.json({ token: session(updated), user: await userPrivate(updated) });
});

// ——— Me ———
authRouter.get('/me', requireAuth, async (req, res) => {
  const id = uid(req);
  // Daily login bonus — first open of the day. The conditional UPDATE makes it race-safe across instances.
  const claimed = await db.run('UPDATE users SET last_daily_claim = ? WHERE id = ? AND (last_daily_claim IS NULL OR last_daily_claim != ?)', today(), id, today());
  const reward = claimed.changes ? await grant(id, REWARDS.dailyLogin.sparks, REWARDS.dailyLogin.xp, 'Daily check-in bonus ☀️') : null;
  res.json({ user: await me(id), reward });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const id = uid(req);
  const b = parse(
    z.object({
      displayName: z.string().trim().min(1).max(40).optional(),
      bio: z.string().max(280).optional(),
      pronouns: z.string().max(24).optional(),
      city: z.string().max(60).optional(),
      interests: z.array(z.string().max(30)).max(12).optional(),
      avatarUrl: z.string().url().max(500).optional(),
    }),
    req.body,
  );
  assertClean(`${b.displayName ?? ''} ${b.bio ?? ''}`);
  const map: Record<string, string> = { displayName: 'display_name', bio: 'bio', pronouns: 'pronouns', city: 'city', avatarUrl: 'avatar_url' };
  for (const [k, col] of Object.entries(map)) {
    const v = (b as Record<string, unknown>)[k];
    if (v !== undefined) await db.run(`UPDATE users SET ${col} = ? WHERE id = ?`, v as string, id);
  }
  if (b.interests) await db.run('UPDATE users SET interests = ? WHERE id = ?', JSON.stringify(b.interests), id);
  invalidateStats(id);
  res.json({ user: await me(id) });
});

authRouter.patch('/me/settings', requireAuth, async (req, res) => {
  const id = uid(req);
  const b = parse(
    z.object({
      pushEnabled: z.boolean(), emailDigest: z.boolean(), dmFrom: z.enum(['everyone', 'following', 'nobody']),
      showOnline: z.boolean(), safeMode: z.boolean(), hapticsEnabled: z.boolean(), soundEnabled: z.boolean(),
      darkMode: z.enum(['system', 'light', 'dark']), breakReminderMins: z.number().int().min(0).max(240), showAIPersonas: z.boolean(),
    }).partial(),
    req.body,
  );
  const row = (await db.one<Row>('SELECT settings FROM users WHERE id = ?', id))!;
  await db.run('UPDATE users SET settings = ? WHERE id = ?', JSON.stringify({ ...DEFAULT_SETTINGS, ...json(row.settings, {}), ...b }), id);
  res.json({ user: await me(id) });
});

authRouter.post('/me/equip', requireAuth, async (req, res) => {
  const id = uid(req);
  const b = parse(z.object({ frame: z.string().nullable(), flair: z.string().nullable(), theme: z.string().nullable(), banner: z.string().nullable() }).partial(), req.body);
  for (const [slot, v] of Object.entries(b)) {
    if (!v) continue;
    const owned = await db.one<Row>('SELECT s.kind FROM inventory i JOIN store_items s ON s.id = i.item_id WHERE i.user_id = ? AND i.item_id = ?', id, v);
    if (!owned) throw new HttpError(403, "You don't own that yet — grab it in the Sparks Vault");
    if (owned.kind !== slot) throw new HttpError(400, `That isn't a ${slot}`);
  }
  const row = (await db.one<Row>('SELECT cosmetics FROM users WHERE id = ?', id))!;
  await db.run('UPDATE users SET cosmetics = ? WHERE id = ?', JSON.stringify({ ...json(row.cosmetics, {}), ...b }), id);
  res.json({ user: await me(id) });
});

authRouter.post('/me/push-token', requireAuth, async (req, res) => {
  const b = parse(z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web', 'desktop']) }), req.body);
  await db.run(
    `INSERT INTO push_tokens (token, user_id, platform, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, created_at = excluded.created_at`,
    b.token, uid(req), b.platform, now());
  res.json({ ok: true });
});

/** Account deletion (required by App Store guideline 5.1.1(v)). Soft-deletes and scrubs PII. */
authRouter.delete('/me', requireAuth, async (req, res) => {
  const id = uid(req);
  await db.tx(async () => {
    await db.run(
      `UPDATE users SET deleted_at = ?, email = NULL, password_hash = NULL, handle = ?, display_name = 'Deleted user', bio = '', avatar_url = '' WHERE id = ?`,
      now(), `deleted_${id}`, id);
    await db.run('DELETE FROM push_tokens WHERE user_id = ?', id);
    await db.run('UPDATE posts SET hidden = 1 WHERE author_id = ?', id);
    await db.run('DELETE FROM follows WHERE follower_id = ? OR followee_id = ?', id, id);
  });
  res.json({ ok: true });
});
