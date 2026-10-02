import { Router } from 'express';
import { z } from 'zod';
import { db, escapeRegex, now, today } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole, uid } from '../lib/auth.js';
import { HttpError, parse } from '../lib/http.js';
import { authorCache, userPublic, isPremium } from '../lib/serialize.js';
import { applyAction, standing } from '../lib/enforcement.js';
import { removeContent } from '../lib/aiModeration.js';
import { presence } from '../lib/presence.js';
import { redisClient, sharedBackend } from '../lib/shared.js';
import { extendPremium } from './profile.js';

/** Admin panel API. Moderators can review and mute/suspend; admins can also ban, change roles and grant Premium. */
export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requireRole('admin', 'mod'));
const adminOnly = requireRole('admin');

const since = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

adminRouter.get('/admin/overview', async (_req, res) => {
  const day = `${today()}T00:00:00.000Z`;
  const [users, newToday, ai, posts, shouts, openReports, openFlags, premium, revenue, banned, suspended] = await Promise.all([
    db.users.countDocuments({ deletedAt: null, isAi: false }),
    db.users.countDocuments({ createdAt: { $gt: day }, isAi: false }),
    db.users.countDocuments({ isAi: true }),
    db.posts.countDocuments({ createdAt: { $gt: day } }),
    db.shouts.countDocuments({ createdAt: { $gt: day } }),
    db.reports.countDocuments({ status: { $in: ['open', 'reviewing'] } }),
    db.modFlags.countDocuments({ status: 'open' }),
    db.users.countDocuments({ 'premium.until': { $gt: now() } }),
    db.purchases
      .aggregate([
        { $match: { status: 'completed', createdAt: { $gt: since(30) } } },
        { $group: { _id: '$currency', cents: { $sum: '$amountCents' }, n: { $sum: 1 } } },
      ])
      .toArray(),
    db.users.countDocuments({ 'moderation.status': 'banned' }),
    db.users.countDocuments({ 'moderation.status': 'suspended', 'moderation.until': { $gt: now() } }),
  ]);
  res.json({
    counts: {
      users,
      newToday,
      ai,
      online: await presence.count(),
      postsToday: posts,
      shoutsToday: shouts,
      openReports,
      openFlags,
      premium,
      banned,
      suspended,
    },
    revenue30d: revenue.map((r) => ({ currency: r._id ?? 'usd', cents: r.cents ?? 0, purchases: r.n })),
    // Which integrations are configured (values live in apps/server/.env — never sent to the browser).
    integrations: {
      database: 'mongodb',
      redis: redisClient() ? 'on' : 'not used — MongoDB handles it',
      sharedState: sharedBackend(),
      smtp: !!(config.mail.host || config.mail.url),
      smtpServer: config.mail.host ? `${config.mail.host}:${config.mail.port}${config.mail.secure ? ' (TLS)' : ''}` : null,
      mailFrom: config.mail.from,
      stripe: !!config.payments.stripeSecretKey && !!config.payments.stripeWebhookSecret,
      revenueCat: !!config.payments.revenueCatWebhookAuth,
      nvidiaNim: !!config.nim.apiKey,
      safetyModel: config.nim.safetyModel || null,
      turn: config.rtc.turnUrls.length > 0,
      s3: !!config.s3.bucket,
      spotifySearch: !!config.spotify.clientId,
      push: !!config.expoAccessToken,
    },
  });
});

async function adminUser(u) {
  const [strikes, reports] = await Promise.all([
    db.modEvents.countDocuments({ userId: u._id, kind: 'strike', cleared: { $ne: true }, createdAt: { $gt: since(30) } }),
    db.reports.countDocuments({ targetType: 'user', targetId: u._id }),
  ]);
  return {
    ...(await userPublic(u)),
    email: u.email,
    emailVerified: !!u.emailVerifiedAt,
    role: u.role ?? 'user',
    gender: u.gender ?? null,
    birthdate: u.birthdate,
    sparks: u.sparks,
    gems: u.gems ?? 0,
    premiumUntil: isPremium(u) ? u.premium.until : null,
    standing: standing(u),
    strikes30d: strikes,
    reportsAgainst: reports,
    deleted: !!u.deletedAt,
  };
}

adminRouter.get('/admin/users', async (req, res) => {
  const p = parse(
    z.object({
      q: z.string().max(60).optional(),
      status: z.enum(['active', 'muted', 'suspended', 'banned']).optional(),
      role: z.enum(['user', 'mod', 'admin']).optional(),
      ai: z.enum(['0', '1']).optional(),
      cursor: z.coerce.number().optional(),
    }),
    req.query,
  );
  const f = {};
  if (p.q) {
    const re = new RegExp(escapeRegex(p.q), 'i');
    f.$or = [{ handle: re }, { displayName: re }, { email: re }, { _id: p.q }];
  }
  if (p.status && p.status !== 'active') f['moderation.status'] = p.status;
  if (p.status === 'active') f['moderation.status'] = { $nin: ['muted', 'suspended', 'banned'] };
  if (p.role) f.role = p.role === 'user' ? { $nin: ['mod', 'admin'] } : p.role;
  if (p.ai) f.isAi = p.ai === '1';
  const offset = p.cursor ?? 0;
  const rows = await db.users.find(f).sort({ createdAt: -1 }).skip(offset).limit(31).toArray();
  res.json({ items: await Promise.all(rows.slice(0, 30).map(adminUser)), nextCursor: rows.length > 30 ? String(offset + 30) : null });
});

adminRouter.get('/admin/users/:id', async (req, res) => {
  const u = await db.users.findOne({ _id: String(req.params.id) });
  if (!u) throw new HttpError(404, 'User not found');
  const author = authorCache();
  const [events, reports, posts, shouts, messages] = await Promise.all([
    db.modEvents.find({ userId: u._id }).sort({ createdAt: -1 }).limit(50).toArray(),
    db.reports
      .find({ $or: [{ targetType: 'user', targetId: u._id }, { reporterId: u._id }] })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray(),
    db.posts.find({ authorId: u._id }).sort({ createdAt: -1 }).limit(10).toArray(),
    db.shouts.find({ authorId: u._id }).sort({ createdAt: -1 }).limit(10).toArray(),
    db.messages.find({ authorId: u._id }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  const byName = async (id) => (id === 'ai' ? 'SafeShield AI' : `@${(await author(id)).handle}`);
  res.json({
    user: await adminUser(u),
    events: await Promise.all(
      events.map(async (e) => ({
        id: e._id,
        kind: e.kind,
        reason: e.reason,
        category: e.category,
        until: e.until,
        by: await byName(e.by),
        severe: !!e.severe,
        cleared: !!e.cleared,
        ref: e.ref,
        createdAt: e.createdAt,
      })),
    ),
    reports: reports.map((r) => ({
      id: r._id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      against: r.targetId === u._id,
      createdAt: r.createdAt,
    })),
    recent: [
      ...posts.map((p) => ({ type: 'post', id: p._id, text: p.body, mediaUrl: p.mediaUrl, hidden: !!p.hidden, createdAt: p.createdAt })),
      ...shouts.map((s) => ({ type: 'shout', id: s._id, text: s.body, hidden: !!s.hidden, createdAt: s.createdAt })),
      ...messages.map((m) => ({
        type: 'message',
        id: m._id,
        text: m.body,
        room: `${m.roomType}:${m.roomId}`,
        hidden: m.kind === 'removed',
        createdAt: m.createdAt,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

adminRouter.post('/admin/users/:id/action', async (req, res) => {
  const b = parse(
    z.object({
      action: z.enum(['warn', 'mute', 'unmute', 'suspend', 'unsuspend', 'ban', 'unban', 'strike_clear']),
      minutes: z
        .number()
        .int()
        .min(1)
        .max(365 * 24 * 60)
        .optional(),
      reason: z.string().trim().min(3).max(300),
    }),
    req.body,
  );
  const target = await db.users.findOne({ _id: String(req.params.id) });
  if (!target) throw new HttpError(404, 'User not found');
  if (target._id === uid(req)) throw new HttpError(400, "You can't moderate yourself");
  if (['ban', 'unban'].includes(b.action) && req.userRole !== 'admin') throw new HttpError(403, 'Only admins can terminate accounts');
  if (target.role === 'admin' && req.userRole !== 'admin') throw new HttpError(403, 'Mods cannot act on admins');
  if ((b.action === 'mute' || b.action === 'suspend') && !b.minutes) throw new HttpError(400, 'Pick a duration');
  await applyAction(target._id, { action: b.action, minutes: b.minutes ?? 0, reason: b.reason, by: uid(req) });
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

adminRouter.post('/admin/users/:id/role', adminOnly, async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(['user', 'mod', 'admin']) }), req.body);
  if (String(req.params.id) === uid(req)) throw new HttpError(400, "You can't change your own role");
  await db.users.updateOne({ _id: String(req.params.id), isAi: false }, { $set: { role } });
  res.json({ user: await adminUser(await db.users.findOne({ _id: String(req.params.id) })) });
});

adminRouter.post('/admin/users/:id/premium', adminOnly, async (req, res) => {
  const { days } = parse(z.object({ days: z.number().int().min(-365).max(365) }), req.body);
  const id = String(req.params.id);
  if (days > 0) await extendPremium(id, days);
  else await db.users.updateOne({ _id: id }, { $set: { 'premium.until': null } });
  res.json({ user: await adminUser(await db.users.findOne({ _id: id })) });
});

// ——— Review queues ———
async function excerpt(type, id) {
  const col = {
    post: 'posts',
    comment: 'comments',
    shout: 'shouts',
    thread: 'threads',
    reply: 'replies',
    wall: 'wallNotes',
    message: 'messages',
  }[type];
  if (!col) return null;
  const d = await db[col].findOne({ _id: id });
  return d
    ? {
        text: (d.title ? `${d.title} — ` : '') + (d.body ?? ''),
        mediaUrl: d.mediaUrl ?? null,
        authorId: d.authorId,
        removed: !!d.hidden || d.kind === 'removed',
      }
    : null;
}

adminRouter.get('/admin/reports', async (req, res) => {
  const status =
    req.query.status === 'all' ? null : req.query.status === 'closed' ? { $in: ['actioned', 'dismissed'] } : { $in: ['open', 'reviewing'] };
  const rows = await db.reports
    .find(status ? { status } : {})
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const author = authorCache();
  res.json({
    items: await Promise.all(
      rows.map(async (r) => {
        const content = await excerpt(r.targetType, r.targetId);
        const targetUserId = r.targetType === 'user' ? r.targetId : content?.authorId;
        return {
          id: r._id,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          status: r.status ?? 'open',
          resolvedBy: r.resolvedBy ?? null,
          reporter: await author(r.reporterId),
          target: targetUserId ? await author(targetUserId) : null,
          content,
          createdAt: r.createdAt,
        };
      }),
    ),
  });
});

adminRouter.post('/admin/reports/:id', async (req, res) => {
  const b = parse(z.object({ status: z.enum(['actioned', 'dismissed']), removeContent: z.boolean().optional() }), req.body);
  const r = await db.reports.findOne({ _id: String(req.params.id) });
  if (!r) throw new HttpError(404, 'Report not found');
  if (b.removeContent && r.targetType !== 'user') await removeContent({ type: r.targetType, id: r.targetId }, 'Removed by a moderator');
  await db.reports.updateOne({ _id: r._id }, { $set: { status: b.status, resolvedBy: uid(req), resolvedAt: now() } });
  res.json({ ok: true });
});

adminRouter.get('/admin/flags', async (req, res) => {
  const rows = await db.modFlags
    .find(req.query.status === 'all' ? {} : { status: 'open' })
    .sort({ priority: 1, createdAt: -1 })
    .limit(100)
    .toArray();
  const author = authorCache();
  res.json({
    items: await Promise.all(
      rows.map(async (f) => ({
        id: f._id,
        user: await author(f.userId),
        reason: f.reason,
        category: f.category,
        priority: f.priority,
        status: f.status,
        excerpt: f.excerpt ?? (f.ref ? (await excerpt(f.ref.type, f.ref.id))?.text : null),
        ref: f.ref,
        createdAt: f.createdAt,
      })),
    ),
  });
});

adminRouter.post('/admin/flags/:id', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['resolved', 'dismissed']) }), req.body);
  await db.modFlags.updateOne({ _id: String(req.params.id) }, { $set: { status, resolvedBy: uid(req), resolvedAt: now() } });
  res.json({ ok: true });
});

adminRouter.post('/admin/content/remove', async (req, res) => {
  const b = parse(
    z.object({ type: z.enum(['post', 'comment', 'shout', 'thread', 'reply', 'wall', 'message']), id: z.string().max(60) }),
    req.body,
  );
  await removeContent(b, 'Removed by a moderator');
  res.json({ ok: true });
});

adminRouter.get('/admin/modlog', async (_req, res) => {
  const rows = await db.modEvents.find({}).sort({ createdAt: -1 }).limit(100).toArray();
  const author = authorCache();
  res.json({
    items: await Promise.all(
      rows.map(async (e) => ({
        id: e._id,
        user: await author(e.userId),
        kind: e.kind,
        reason: e.reason,
        until: e.until,
        by: e.by === 'ai' ? 'SafeShield AI' : `@${(await author(e.by)).handle}`,
        createdAt: e.createdAt,
      })),
    ),
  });
});

// ——— AI personas: who accepts DMs ———
adminRouter.get('/admin/personas', async (_req, res) => {
  const rows = await db.users.find({ isAi: true }).sort({ handle: 1 }).toArray();
  res.json({
    items: rows.map((u) => ({
      id: u._id,
      handle: u.handle,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      dmFrom: u.settings?.dmFrom ?? 'everyone',
      active: !u.deletedAt,
    })),
  });
});

adminRouter.patch('/admin/personas/:id', adminOnly, async (req, res) => {
  const b = parse(z.object({ dmFrom: z.enum(['everyone', 'following', 'nobody']).optional(), active: z.boolean().optional() }), req.body);
  const set = {};
  if (b.dmFrom) set['settings.dmFrom'] = b.dmFrom;
  if (b.active !== undefined) set.deletedAt = b.active ? null : now();
  await db.users.updateOne({ _id: String(req.params.id), isAi: true }, { $set: set });
  res.json({ ok: true });
});
