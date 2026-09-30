import { Router } from 'express';
import { z } from 'zod';
import { ageFrom, MIN_AGE, REWARDS } from '@chatlol/shared';
import { db, newId, now, today, json, type Row } from '../db';
import { hashPassword, verifyPassword, signToken, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { userPrivate, DEFAULT_SETTINGS, invalidateStats } from '../lib/serialize';
import { grant, notify } from '../lib/rewards';
import { assertClean } from '../lib/moderation';

export const authRouter = Router();

const handleRe = /^[a-zA-Z0-9_.]{3,20}$/;

authRouter.post('/auth/register', async (req, res) => {
  rateLimit(`register:${req.ip}`, 5);
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
  if (db.one('SELECT 1 FROM users WHERE email = ?', b.email.toLowerCase())) throw new HttpError(409, 'That email already has an account', 'email_taken');
  if (db.one('SELECT 1 FROM users WHERE handle = ?', b.handle)) throw new HttpError(409, 'That handle is taken', 'handle_taken');
  const id = newId('u');
  const t = now();
  db.run(
    `INSERT INTO users (id, email, password_hash, handle, display_name, avatar_url, birthdate, interests, settings, last_seen_at, created_at, badges)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, b.email.toLowerCase(), await hashPassword(b.password), b.handle, b.displayName,
    `https://api.dicebear.com/9.x/notionists/png?size=256&backgroundColor=ffdbce,ffdcbd,ffd9dc&seed=${encodeURIComponent(b.handle)}`,
    b.birthdate, JSON.stringify(b.interests ?? []), JSON.stringify(DEFAULT_SETTINGS), t, t, JSON.stringify(['early_spark']));
  // Starter social graph: follow a handful of active members so the feed is alive from minute one.
  const starters = db.all<Row>(`SELECT id FROM users WHERE id != ? AND deleted_at IS NULL ORDER BY xp DESC LIMIT 8`, id);
  for (const s of starters) db.run('INSERT OR IGNORE INTO follows VALUES (?, ?, ?)', id, s.id, t);
  notify(id, { kind: 'system', title: 'Welcome to ChatLOL 🌅', body: 'Drop your first Sunset photo today to start a streak and earn 120 Sparks.', link: '/drops' });
  const row = db.one<Row>('SELECT * FROM users WHERE id = ?', id)!;
  res.status(201).json({ token: signToken(id), user: userPrivate(row) });
});

authRouter.post('/auth/login', async (req, res) => {
  rateLimit(`login:${req.ip}`, 10);
  const b = parse(z.object({ login: z.string().min(1).max(200), password: z.string().min(1).max(200) }), req.body);
  const row = db.one<Row>('SELECT * FROM users WHERE (email = ? OR handle = ?) AND deleted_at IS NULL AND is_ai = 0', b.login.toLowerCase(), b.login);
  if (!row || !(await verifyPassword(b.password, row.password_hash))) throw new HttpError(401, 'Wrong login or password');
  res.json({ token: signToken(row.id), user: userPrivate(row) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const id = uid(req);
  let row = db.one<Row>('SELECT * FROM users WHERE id = ?', id)!;
  let reward = null;
  // Daily login bonus — first open of the day.
  if (row.last_daily_claim !== today()) {
    db.run('UPDATE users SET last_daily_claim = ? WHERE id = ?', today(), id);
    reward = grant(id, REWARDS.dailyLogin.sparks, REWARDS.dailyLogin.xp, 'Daily check-in bonus ☀️');
    row = db.one<Row>('SELECT * FROM users WHERE id = ?', id)!;
  }
  res.json({ user: userPrivate(row), reward });
});

authRouter.patch('/me', requireAuth, (req, res) => {
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
    if (v !== undefined) db.run(`UPDATE users SET ${col} = ? WHERE id = ?`, v as string, id);
  }
  if (b.interests) db.run('UPDATE users SET interests = ? WHERE id = ?', JSON.stringify(b.interests), id);
  invalidateStats(id);
  res.json({ user: userPrivate(db.one<Row>('SELECT * FROM users WHERE id = ?', id)!) });
});

authRouter.patch('/me/settings', requireAuth, (req, res) => {
  const id = uid(req);
  const b = parse(
    z.object({
      pushEnabled: z.boolean(), emailDigest: z.boolean(), dmFrom: z.enum(['everyone', 'following', 'nobody']),
      showOnline: z.boolean(), safeMode: z.boolean(), hapticsEnabled: z.boolean(), soundEnabled: z.boolean(),
      darkMode: z.enum(['system', 'light', 'dark']), breakReminderMins: z.number().int().min(0).max(240), showAIPersonas: z.boolean(),
    }).partial(),
    req.body,
  );
  const row = db.one<Row>('SELECT settings FROM users WHERE id = ?', id)!;
  const merged = { ...DEFAULT_SETTINGS, ...json(row.settings, {}), ...b };
  db.run('UPDATE users SET settings = ? WHERE id = ?', JSON.stringify(merged), id);
  res.json({ user: userPrivate(db.one<Row>('SELECT * FROM users WHERE id = ?', id)!) });
});

authRouter.post('/me/equip', requireAuth, (req, res) => {
  const id = uid(req);
  const b = parse(z.object({ frame: z.string().nullable(), flair: z.string().nullable(), theme: z.string().nullable(), banner: z.string().nullable() }).partial(), req.body);
  for (const v of Object.values(b)) {
    if (v && !db.one('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?', id, v)) throw new HttpError(403, "You don't own that yet — grab it in the Sparks Vault");
  }
  const row = db.one<Row>('SELECT cosmetics FROM users WHERE id = ?', id)!;
  db.run('UPDATE users SET cosmetics = ? WHERE id = ?', JSON.stringify({ ...json(row.cosmetics, {}), ...b }), id);
  res.json({ user: userPrivate(db.one<Row>('SELECT * FROM users WHERE id = ?', id)!) });
});

authRouter.post('/me/push-token', requireAuth, (req, res) => {
  const b = parse(z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web', 'desktop']) }), req.body);
  db.run('INSERT OR REPLACE INTO push_tokens (token, user_id, platform, created_at) VALUES (?, ?, ?, ?)', b.token, uid(req), b.platform, now());
  res.json({ ok: true });
});

/** Account deletion (required by App Store guideline 5.1.1(v)). Soft-deletes and scrubs PII. */
authRouter.delete('/me', requireAuth, (req, res) => {
  const id = uid(req);
  db.tx(() => {
    db.run(
      `UPDATE users SET deleted_at = ?, email = NULL, password_hash = NULL, handle = ?, display_name = 'Deleted user', bio = '', avatar_url = '' WHERE id = ?`,
      now(), `deleted_${id}`, id);
    db.run('DELETE FROM push_tokens WHERE user_id = ?', id);
    db.run('UPDATE posts SET hidden = 1 WHERE author_id = ?', id);
    db.run('DELETE FROM follows WHERE follower_id = ? OR followee_id = ?', id, id);
  });
  res.json({ ok: true });
});
