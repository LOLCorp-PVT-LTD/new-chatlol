import { Router } from 'express';
import { z } from 'zod';
import { ageFrom, MAX_INTERESTS, MIN_AGE, REWARDS } from '@chatlol/shared';
import { db, newId, now, today, isDuplicateKey } from '../db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, uid, passwordVersion } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { userPrivate, invalidateStats, newUser } from '../lib/serialize.js';
import { grant, notify } from '../lib/rewards.js';
import { assertClean } from '../lib/moderation.js';
import { itemIdFor } from '../lib/ids.js';
import { consumeToken, sendPasswordReset, sendVerification, sendEmailChangedNotice } from '../lib/emailTokens.js';
import { config } from '../config.js';
import { assertNotBanned } from '../lib/enforcement.js';

export const authRouter = Router();

const handleRe = /^[a-zA-Z0-9_.]{3,20}$/;
const me = async (id) => userPrivate(await db.users.findOne({ _id: id }));
const session = (u) => signToken(u._id, passwordVersion(u.passwordHash));

authRouter.post('/auth/register', async (req, res) => {
  await rateLimit(`register:${req.ip}`, 5);
  const b = parse(
    z.object({
      email: z.string().email().max(200),
      password: z.string().min(8, 'at least 8 characters').max(200),
      handle: z.string().regex(handleRe, '3–20 letters, numbers, _ or .'),
      displayName: z.string().trim().min(1).max(40),
      birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      gender: z.enum(['male', 'female'], { message: 'pick Male or Female' }),
      interests: z.array(z.string().max(30)).max(MAX_INTERESTS).optional(),
    }),
    req.body,
  );
  if (ageFrom(b.birthdate) < MIN_AGE) throw new HttpError(403, `ChatLOL is for adults ${MIN_AGE}+ only.`, 'underage');
  assertClean(`${b.handle} ${b.displayName}`);
  const email = b.email.toLowerCase();
  if (await db.users.findOne({ email })) throw new HttpError(409, 'That email already has an account', 'email_taken');
  if (await db.users.findOne({ handleLower: b.handle.toLowerCase() })) throw new HttpError(409, 'That handle is taken', 'handle_taken');
  const id = newId();
  const t = now();
  const user = newUser({
    _id: id,
    email,
    passwordHash: await hashPassword(b.password),
    handle: b.handle,
    displayName: b.displayName,
    avatarUrl: `https://api.dicebear.com/9.x/notionists/png?size=256&backgroundColor=ffdbce,ffdcbd,ffd9dc&seed=${encodeURIComponent(b.handle)}`,
    birthdate: b.birthdate,
    gender: b.gender,
    role: config.adminEmails.includes(email) ? 'admin' : 'user',
    interests: b.interests ?? [],
    badges: ['early_spark'],
    lastSeenAt: t,
    createdAt: t,
  });
  try {
    await db.users.insertOne(user);
  } catch (e) {
    // The unique indexes settle a race between two signups for the same email/handle.
    if (isDuplicateKey(e))
      throw new HttpError(409, e.keyPattern?.email ? 'That email already has an account' : 'That handle is taken', 'taken');
    throw e;
  }
  // Starter social graph: follow a handful of active members so the feed is alive from minute one.
  const starters = await db.users
    .find({ _id: { $ne: id }, deletedAt: null }, { projection: { _id: 1 } })
    .sort({ xp: -1 })
    .limit(8)
    .toArray();
  if (starters.length)
    await db.follows.insertMany(
      starters.map((s) => ({ followerId: id, followeeId: s._id, createdAt: t })),
      { ordered: false },
    );
  await notify(id, {
    kind: 'system',
    title: 'Welcome to ChatLOL 🌅',
    body: 'Drop your first Sunset photo today to start a streak and earn 120 Sparks.',
    link: '/drops',
  });
  await sendVerification(user);
  res.status(201).json({ token: session(user), user: await userPrivate(user) });
});

authRouter.post('/auth/login', async (req, res) => {
  await rateLimit(`login:${req.ip}`, 10);
  const b = parse(z.object({ login: z.string().min(1).max(200), password: z.string().min(1).max(200) }), req.body);
  const login = b.login.toLowerCase();
  const u = await db.users.findOne({ $or: [{ email: login }, { handleLower: login }], deletedAt: null, isAi: false });
  if (!u || !(await verifyPassword(b.password, u.passwordHash))) throw new HttpError(401, 'Wrong login or password');
  assertNotBanned(u);
  // Addresses in ADMIN_EMAILS are promoted on login, so existing accounts can become admins.
  if (u.email && config.adminEmails.includes(u.email) && u.role !== 'admin') {
    await db.users.updateOne({ _id: u._id }, { $set: { role: 'admin' } });
    u.role = 'admin';
  }
  res.json({ token: session(u), user: await userPrivate(u) });
});

// ——— Email verification ———
authRouter.post('/auth/verify', async (req, res) => {
  await rateLimit(`verify:${req.ip}`, 20);
  const { token } = parse(z.object({ token: z.string().min(20).max(100) }), req.body);
  const userId = await consumeToken(token, 'verify');
  if (!userId) throw new HttpError(400, 'That link has expired or was already used', 'invalid_token');
  const r = await db.users.updateOne({ _id: userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: now() } });
  if (r.modifiedCount) await grant(userId, 50, 25, 'Email verified ✅');
  res.json({ ok: true });
});

authRouter.post('/auth/verify/resend', requireAuth, async (req, res) => {
  const id = uid(req);
  await rateLimit(`verify-resend:${id}`, 3);
  const u = await db.users.findOne({ _id: id });
  if (u.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
  await sendVerification(u);
  res.json({ ok: true });
});

// ——— Password reset ———
authRouter.post('/auth/password/forgot', async (req, res) => {
  await rateLimit(`forgot:${req.ip}`, 5);
  const { email } = parse(z.object({ email: z.string().email().max(200) }), req.body);
  await rateLimit(`forgot-email:${email.toLowerCase()}`, 3);
  const u = await db.users.findOne({ email: email.toLowerCase(), deletedAt: null, isAi: false });
  if (u) await sendPasswordReset(u);
  // Same response whether or not the account exists, so emails can't be enumerated.
  res.json({ ok: true });
});

authRouter.post('/auth/password/reset', async (req, res) => {
  await rateLimit(`reset:${req.ip}`, 10);
  const b = parse(
    z.object({ token: z.string().min(20).max(100), password: z.string().min(8, 'at least 8 characters').max(200) }),
    req.body,
  );
  const userId = await consumeToken(b.token, 'reset');
  if (!userId) throw new HttpError(400, 'That reset link has expired or was already used', 'invalid_token');
  // Changing the hash changes the password version, which signs out every existing session.
  // Following a link from the inbox also proves the email address.
  const u = await db.users.findOneAndUpdate(
    { _id: userId },
    [{ $set: { passwordHash: await hashPassword(b.password), emailVerifiedAt: { $ifNull: ['$emailVerifiedAt', now()] } } }],
    { returnDocument: 'after' },
  );
  res.json({ token: session(u), user: await userPrivate(u) });
});

authRouter.post('/auth/password/change', requireAuth, async (req, res) => {
  const id = uid(req);
  await rateLimit(`pwchange:${id}`, 5);
  const b = parse(z.object({ current: z.string().min(1).max(200), password: z.string().min(8).max(200) }), req.body);
  const u = await db.users.findOne({ _id: id });
  if (!(await verifyPassword(b.current, u.passwordHash))) throw new HttpError(403, 'Current password is wrong');
  const updated = await db.users.findOneAndUpdate(
    { _id: id },
    { $set: { passwordHash: await hashPassword(b.password) } },
    { returnDocument: 'after' },
  );
  res.json({ token: session(updated), user: await userPrivate(updated) });
});

// ——— Me ———
authRouter.get('/me', requireAuth, async (req, res) => {
  const id = uid(req);
  // Daily login bonus — first open of the day. The conditional UPDATE makes it race-safe across instances.
  const claimed = await db.users.updateOne({ _id: id, lastDailyClaim: { $ne: today() } }, { $set: { lastDailyClaim: today() } });
  const reward = claimed.modifiedCount
    ? await grant(id, REWARDS.dailyLogin.sparks, REWARDS.dailyLogin.xp, 'Daily check-in bonus ☀️')
    : null;
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
      interests: z.array(z.string().max(30)).max(MAX_INTERESTS).optional(),
      avatarUrl: z.string().url().max(500).optional(),
    }),
    req.body,
  );
  assertClean(`${b.displayName ?? ''} ${b.bio ?? ''}`);
  const set = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  if (Object.keys(set).length) await db.users.updateOne({ _id: id }, { $set: set });
  invalidateStats(id);
  res.json({ user: await me(id) });
});

authRouter.patch('/me/settings', requireAuth, async (req, res) => {
  const id = uid(req);
  const b = parse(
    z
      .object({
        pushEnabled: z.boolean(),
        emailDigest: z.boolean(),
        dmFrom: z.enum(['everyone', 'following', 'nobody']),
        showOnline: z.boolean(),
        safeMode: z.boolean(),
        hapticsEnabled: z.boolean(),
        soundEnabled: z.boolean(),
        darkMode: z.enum(['system', 'light', 'dark']),
        breakReminderMins: z.number().int().min(0).max(240),
        showAIPersonas: z.boolean(),
        whoCanComment: z.enum(['everyone', 'following']),
        wallFrom: z.enum(['everyone', 'following', 'nobody']),
        profileVisibility: z.enum(['everyone', 'members']),
        showGender: z.boolean(),
        showCity: z.boolean(),
        showInRoulette: z.boolean(),
        ghostMode: z.boolean(),
        notifyRatings: z.boolean(),
        notifyComments: z.boolean(),
        notifyFollows: z.boolean(),
        notifyDms: z.boolean(),
        notifyMentions: z.boolean(),
        notifyLive: z.boolean(),
        notifyArena: z.boolean(),
        autoplayMusic: z.boolean(),
        reduceMotion: z.boolean(),
        celebrateBirthday: z.boolean(),
      })
      .partial(),
    req.body,
  );
  const set = Object.fromEntries(Object.entries(b).map(([k, v]) => [`settings.${k}`, v]));
  if (Object.keys(set).length) await db.users.updateOne({ _id: id }, { $set: set });
  res.json({ user: await me(id) });
});

authRouter.post('/me/equip', requireAuth, async (req, res) => {
  const id = uid(req);
  const b = parse(
    z
      .object({ frame: z.string().nullable(), flair: z.string().nullable(), theme: z.string().nullable(), banner: z.string().nullable() })
      .partial(),
    req.body,
  );
  for (const [slot, v] of Object.entries(b)) {
    if (!v) continue;
    const owned = await db.inventory.findOne({ userId: id, itemId: itemIdFor(v), qty: { $gt: 0 } });
    if (!owned) throw new HttpError(403, "You don't own that yet — grab it in the Sparks Vault");
    if ((await db.storeItems.findOne({ key: v }))?.kind !== slot) throw new HttpError(400, `That isn't a ${slot}`);
  }
  const set = Object.fromEntries(Object.entries(b).map(([slot, v]) => [`cosmetics.${slot}`, v ?? null]));
  if (Object.keys(set).length) await db.users.updateOne({ _id: id }, { $set: set });
  res.json({ user: await me(id) });
});

authRouter.post('/me/push-token', requireAuth, async (req, res) => {
  const b = parse(z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web', 'desktop']) }), req.body);
  await db.pushTokens.updateOne({ token: b.token }, { $set: { userId: uid(req), platform: b.platform, createdAt: now() } }, { upsert: true });
  res.json({ ok: true });
});

/** Changing email needs the current password; the new address must be verified again and the old one is told. */
authRouter.post('/me/email', requireAuth, async (req, res) => {
  const id = uid(req);
  await rateLimit(`email-change:${id}`, 3);
  const b = parse(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }), req.body);
  const u = await db.users.findOne({ _id: id });
  if (!(await verifyPassword(b.password, u.passwordHash))) throw new HttpError(403, 'Password is wrong');
  const email = b.email.toLowerCase();
  if (email === u.email) return res.json({ user: await userPrivate(u) });
  if (await db.users.findOne({ email })) throw new HttpError(409, 'That email already has an account', 'email_taken');
  let updated;
  try {
    updated = await db.users.findOneAndUpdate({ _id: id }, { $set: { email, emailVerifiedAt: null } }, { returnDocument: 'after' });
  } catch (e) {
    if (isDuplicateKey(e)) throw new HttpError(409, 'That email already has an account', 'email_taken');
    throw e;
  }
  if (u.email) await sendEmailChangedNotice(u, email);
  await sendVerification(updated);
  res.json({ user: await userPrivate(updated) });
});

/** Account deletion (required by App Store guideline 5.1.1(v)). Soft-deletes and scrubs PII. */
authRouter.delete('/me', requireAuth, async (req, res) => {
  const id = uid(req);
  await db.tx(async () => {
    await db.users.updateOne(
      { _id: id },
      {
        $set: {
          deletedAt: now(),
          email: null,
          passwordHash: null,
          handle: `deleted_${id}`,
          handleLower: `deleted_${id}`,
          displayName: 'Deleted user',
          bio: '',
          avatarUrl: '',
        },
      },
    );
    await db.pushTokens.deleteMany({ userId: id });
    await db.posts.updateMany({ authorId: id }, { $set: { hidden: true } });
    await db.follows.deleteMany({ $or: [{ followerId: id }, { followeeId: id }] });
  });
  res.json({ ok: true });
});
