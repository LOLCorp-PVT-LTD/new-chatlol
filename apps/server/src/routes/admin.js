import { Router } from 'express';
import { z } from 'zod';
import { db, escapeRegex, newId, now, today } from '../db.js';
import { config } from '../config.js';
import { PERMISSION_KEYS, permissionsOf } from '@chatlol/shared';
import { requireAuth, requirePerm, uid } from '../lib/auth.js';
import { HttpError, parse } from '../lib/http.js';
import { authorCache, userPublic, isPremium } from '../lib/serialize.js';
import { applyAction, standing } from '../lib/enforcement.js';
import { removeContent } from '../lib/aiModeration.js';
import { presence } from '../lib/presence.js';
import { redisClient, sharedBackend } from '../lib/shared.js';
import { apnsConfigured, fcmConfigured } from '../lib/push.js';
import { extendPremium } from './profile.js';
import { refundPurchase, stripeRefund } from './payments.js';
import { closeAccount } from '../lib/accounts.js';
import { emitWallet, notify } from '../lib/rewards.js';

/**
 * Admin panel API. Every route checks a permission (see PERMISSIONS in @chatlol/shared): admins hold all of them,
 * moderators start with overview/reports/mute, and anyone with `staff` can hand out the permissions they hold.
 */
export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requirePerm(...PERMISSION_KEYS));
const RANK = { user: 0, mod: 1, admin: 2 };

/** Staff can only act on people below them; admins can act on anyone but themselves. */
function assertOutranks(req, target) {
  if (target._id === uid(req)) throw new HttpError(400, "You can't do that to yourself");
  if (req.userRole !== 'admin' && RANK[target.role ?? 'user'] >= RANK[req.userRole ?? 'user'])
    throw new HttpError(403, 'Only an admin can do that to another staff member');
}
async function findTarget(req) {
  const u = await db.users.findOne({ _id: String(req.params.id) });
  if (!u) throw new HttpError(404, 'User not found');
  return u;
}
/** Staff actions that aren't moderation (grants, boosts, roles) go in the same log, so everything is accountable. */
const audit = (userId, kind, reason, by, extra = {}) =>
  db.modEvents.insertOne({ _id: newId(), userId, kind, reason, byUserId: by, createdAt: now(), ...extra });
const boostUntil = (u) => (u.boost?.until && u.boost.until > now() ? u.boost.until : null);

const since = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

adminRouter.get('/admin/overview', requirePerm('overview'), async (req, res) => {
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
    revenue30d: !req.userPerms.includes('payments')
      ? []
      : revenue.map((r) => ({ currency: r._id ?? 'usd', cents: r.cents ?? 0, purchases: r.n })),
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
      songSearch: config.spotify.clientId ? 'Spotify (full songs)' : 'Apple Music previews (no keys needed)',
      pushIos: apnsConfigured() ? `APNs (${config.push.apns.env})` : 'not set — add APNS_* keys',
      pushAndroid: fcmConfigured() ? 'Firebase (FCM)' : 'not set — add FIREBASE_SERVICE_ACCOUNT',
      pushWeb: 'Web Push (VAPID) ✓',
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
    perms: u.perms ?? [],
    allPerms: permissionsOf(u),
    boostUntil: boostUntil(u),
  };
}

adminRouter.get('/admin/users', async (req, res) => {
  const p = parse(
    z.object({
      q: z.string().max(60).optional(),
      status: z.enum(['active', 'muted', 'suspended', 'banned']).optional(),
      role: z.enum(['user', 'mod', 'admin']).optional(),
      ai: z.enum(['0', '1']).optional(),
      staff: z.enum(['1']).optional(),
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
  if (p.staff) f.$and = [{ $or: [{ role: { $in: ['mod', 'admin'] } }, { 'perms.0': { $exists: true } }] }];
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
        by: await byName(e.byUserId ?? e.by),
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
  const target = await findTarget(req);
  assertOutranks(req, target);
  const need = ['ban', 'unban'].includes(b.action) ? 'ban' : 'mute';
  if (!req.userPerms.includes(need))
    throw new HttpError(403, need === 'ban' ? 'You don’t have permission to ban' : 'You don’t have permission to mute or suspend');
  if ((b.action === 'mute' || b.action === 'suspend') && !b.minutes) throw new HttpError(400, 'Pick a duration');
  await applyAction(target._id, { action: b.action, minutes: b.minutes ?? 0, reason: b.reason, by: uid(req) });
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

adminRouter.post('/admin/users/:id/role', requirePerm('staff'), async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(['user', 'mod', 'admin']) }), req.body);
  const target = await findTarget(req);
  if (target.isAi) throw new HttpError(400, 'AI personas can’t be staff');
  assertOutranks(req, target);
  if (role === 'admin' && req.userRole !== 'admin') throw new HttpError(403, 'Only admins can make someone an admin');
  await db.users.updateOne({ _id: target._id }, { $set: { role } });
  await audit(target._id, 'role', `Role set to ${role}`, uid(req));
  if (RANK[role] > RANK[target.role ?? 'user'])
    await notify(target._id, {
      kind: 'system',
      title: role === 'admin' ? 'You’re now a ChatLOL admin 🛡️' : 'You’re now a ChatLOL moderator 🛡️',
      body: 'The admin panel is in your account menu.',
      link: '/admin',
    });
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

/** Extra permissions on top of someone's role. You can only grant (or take away) permissions you hold yourself. */
adminRouter.post('/admin/users/:id/perms', requirePerm('staff'), async (req, res) => {
  const { perms } = parse(z.object({ perms: z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length) }), req.body);
  const target = await findTarget(req);
  if (target.isAi) throw new HttpError(400, 'AI personas can’t be staff');
  assertOutranks(req, target);
  const before = new Set(target.perms ?? []);
  const after = new Set(perms);
  const changed = [...new Set([...before, ...after])].filter((p) => before.has(p) !== after.has(p));
  const notMine = changed.filter((p) => !req.userPerms.includes(p));
  if (notMine.length) throw new HttpError(403, `You can’t grant permissions you don’t have (${notMine.join(', ')})`);
  await db.users.updateOne({ _id: target._id }, { $set: { perms: [...after] } });
  if (changed.length) await audit(target._id, 'permissions', `Permissions: ${[...after].join(', ') || 'none'}`, uid(req));
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

adminRouter.post('/admin/users/:id/premium', requirePerm('premium'), async (req, res) => {
  const { days } = parse(z.object({ days: z.number().int().min(-365).max(3650) }), req.body);
  const target = await findTarget(req);
  if (days > 0) {
    const until = await extendPremium(target._id, days);
    await notify(target._id, {
      kind: 'system',
      title: 'You’ve been given Premium 👑',
      body: `Courtesy of the ChatLOL team — active until ${new Date(until).toDateString()}.`,
      link: '/insights',
    });
  } else await db.users.updateOne({ _id: target._id }, { $set: { 'premium.until': null } });
  await audit(target._id, 'premium', days > 0 ? `+${days} days of Premium` : 'Premium removed', uid(req));
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

/** Add (or take away, with a negative number) Sparks and Gems. Balances never go below zero. */
adminRouter.post('/admin/users/:id/wallet', requirePerm('wallet'), async (req, res) => {
  const b = parse(
    z.object({
      sparks: z.number().int().min(-10_000_000).max(10_000_000).default(0),
      gems: z.number().int().min(-1_000_000).max(1_000_000).default(0),
      reason: z.string().trim().max(200).default(''),
    }),
    req.body,
  );
  if (!b.sparks && !b.gems) throw new HttpError(400, 'Enter an amount');
  const target = await findTarget(req);
  if (target.deletedAt) throw new HttpError(400, 'That account is closed');
  await db.users.updateOne({ _id: target._id }, [
    {
      $set: {
        sparks: { $max: [0, { $add: [{ $ifNull: ['$sparks', 0] }, b.sparks] }] },
        gems: { $max: [0, { $add: [{ $ifNull: ['$gems', 0] }, b.gems] }] },
      },
    },
  ]);
  const fmt = (n, what) => `${n > 0 ? '+' : ''}${n.toLocaleString()} ${what}`;
  const parts = [b.sparks && fmt(b.sparks, 'Sparks'), b.gems && fmt(b.gems, 'Gems')].filter(Boolean).join(', ');
  const gifts = [b.sparks > 0 && fmt(b.sparks, 'Sparks'), b.gems > 0 && fmt(b.gems, 'Gems')].filter(Boolean).join(' and ');
  await audit(target._id, 'wallet', `${parts}${b.reason ? ` — ${b.reason}` : ''}`, uid(req), { sparks: b.sparks, gems: b.gems });
  if (b.sparks > 0 || b.gems > 0)
    await notify(target._id, { kind: 'system', title: `🎁 ${gifts} from the ChatLOL team`, body: b.reason || 'Enjoy!', link: '/vault' });
  await emitWallet(target._id);
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

adminRouter.get('/admin/items', requirePerm('items'), async (_req, res) => {
  const rows = await db.storeItems.find({}).sort({ kind: 1, price: 1 }).toArray();
  res.json({
    items: rows.map((i) => ({ key: i.key, name: i.name, kind: i.kind, emoji: i.emoji ?? null, rarity: i.rarity ?? null, price: i.price })),
  });
});

/** Give someone a store item (sticker packs, frames, themes, boosts…) without them paying. */
adminRouter.post('/admin/users/:id/items', requirePerm('items'), async (req, res) => {
  const b = parse(z.object({ key: z.string().max(80), qty: z.number().int().min(1).max(99).default(1) }), req.body);
  const target = await findTarget(req);
  const item = await db.storeItems.findOne({ key: b.key });
  if (!item) throw new HttpError(404, 'Item not found');
  const stackable = ['streak_freeze', 'boost', 'gift', 'crate'].includes(item.kind);
  await db.inventory.updateOne(
    { userId: target._id, itemId: item._id },
    stackable ? { $inc: { qty: b.qty }, $setOnInsert: { acquiredAt: now() } } : { $set: { qty: 1 }, $setOnInsert: { acquiredAt: now() } },
    { upsert: true },
  );
  await audit(target._id, 'item', `Given ${stackable && b.qty > 1 ? `${b.qty}× ` : ''}${item.name}`, uid(req));
  await notify(target._id, {
    kind: 'system',
    title: `🎁 You got ${item.emoji ?? ''} ${item.name}`.replace('  ', ' '),
    body: 'A gift from the ChatLOL team — it’s in your locker.',
    link: '/locker',
  });
  res.json({ ok: true });
});

/** Boost: feature someone first in Browse Members and more often in Rate & Meet, for a while. 0 hours ends it. */
adminRouter.post('/admin/users/:id/boost', requirePerm('boost'), async (req, res) => {
  const { hours } = parse(
    z.object({
      hours: z
        .number()
        .int()
        .min(0)
        .max(24 * 365),
    }),
    req.body,
  );
  const target = await findTarget(req);
  if (target.deletedAt) throw new HttpError(400, 'That account is closed');
  const until = hours ? new Date(Math.max(Date.now(), Date.parse(boostUntil(target) ?? 0)) + hours * 3_600_000).toISOString() : null;
  await db.users.updateOne({ _id: target._id }, { $set: { boost: until ? { until, by: uid(req) } : null } });
  await audit(target._id, 'boost', until ? `Boosted until ${new Date(until).toUTCString()}` : 'Boost ended', uid(req), { until });
  if (until && !target.isAi)
    await notify(target._id, {
      kind: 'system',
      title: 'Your profile is boosted 🚀',
      body: 'You’re featured at the top of Browse Members and in Rate & Meet.',
      link: '/locker',
    });
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

/** Terminate: bans the account and closes it for good (personal data scrubbed). Can't be undone. */
adminRouter.post('/admin/users/:id/terminate', requirePerm('terminate'), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
  const target = await findTarget(req);
  if (target.isAi) throw new HttpError(400, 'Switch AI personas off in the Personas tab instead');
  assertOutranks(req, target);
  if (target.deletedAt) throw new HttpError(400, 'That account is already closed');
  await audit(target._id, 'terminate', reason, uid(req), { handle: target.handle, email: target.email ?? null });
  await closeAccount(target._id, { terminated: true, reason });
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

// ——— Payments: who paid what ———
adminRouter.get('/admin/payments', requirePerm('payments'), async (req, res) => {
  const p = parse(
    z.object({
      status: z.enum(['completed', 'refunded', 'pending', 'failed']).optional(),
      provider: z.string().max(40).optional(),
      user: z.string().max(60).optional(),
      days: z.coerce.number().int().min(1).max(3650).optional(),
      cursor: z.coerce.number().int().min(0).optional(),
    }),
    req.query,
  );
  const f = {};
  if (p.status) f.status = p.status;
  if (p.provider) f.provider = p.provider;
  if (p.days) f.createdAt = { $gt: since(p.days) };
  if (p.user) {
    const re = new RegExp(escapeRegex(p.user.replace(/^@/, '')), 'i');
    const ids = await db.users.distinct('_id', { $or: [{ handle: re }, { displayName: re }, { email: re }] });
    f.userId = { $in: ids };
  }
  const offset = p.cursor ?? 0;
  const [rows, totals, byProduct] = await Promise.all([
    db.purchases.find(f).sort({ createdAt: -1 }).skip(offset).limit(51).toArray(),
    db.purchases
      .aggregate([
        { $match: f },
        { $group: { _id: { currency: '$currency', status: '$status' }, cents: { $sum: '$amountCents' }, n: { $sum: 1 } } },
      ])
      .toArray(),
    db.purchases
      .aggregate([
        { $match: { ...f, status: 'completed' } },
        { $group: { _id: '$productId', cents: { $sum: '$amountCents' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 12 },
      ])
      .toArray(),
  ]);
  const author = authorCache();
  res.json({
    items: await Promise.all(
      rows.slice(0, 50).map(async (x) => ({
        id: x._id,
        user: await author(x.userId),
        provider: x.provider,
        productId: x.productId,
        gems: x.gems ?? 0,
        premiumDays: x.premiumDays ?? 0,
        amountCents: x.amountCents ?? null,
        currency: x.currency ?? null,
        status: x.status,
        providerTxId: x.providerTxId ?? null,
        createdAt: x.createdAt,
      })),
    ),
    totals: totals.map((t) => ({ currency: t._id.currency ?? 'usd', status: t._id.status, cents: t.cents ?? 0, count: t.n })),
    byProduct: byProduct.map((t) => ({ productId: t._id, cents: t.cents ?? 0, count: t.n })),
    nextCursor: rows.length > 50 ? String(offset + 50) : null,
  });
});

/** Refund: Stripe payments are refunded through Stripe; App Store / Google Play refunds happen in their consoles, so here we only take back what was credited. */
adminRouter.post('/admin/payments/:id/refund', requirePerm('payments'), async (req, res) => {
  const x = await db.purchases.findOne({ _id: String(req.params.id) });
  if (!x) throw new HttpError(404, 'Payment not found');
  if (x.status !== 'completed') throw new HttpError(400, 'Only completed payments can be refunded');
  let moneyBack = false;
  if (x.provider === 'stripe' && x.providerTxId?.startsWith('stripe:pi_')) {
    if (!config.payments.stripeSecretKey) throw new HttpError(400, 'Stripe isn’t configured on this server');
    await stripeRefund(x.providerTxId.slice('stripe:'.length));
    moneyBack = true;
  }
  await refundPurchase(x.providerTxId);
  await audit(x.userId, 'refund', `${x.productId}${moneyBack ? ' — refunded via Stripe' : ' — credit reversed'}`, uid(req));
  res.json({ ok: true, moneyBack });
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

adminRouter.get('/admin/reports', requirePerm('reports'), async (req, res) => {
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

adminRouter.post('/admin/reports/:id', requirePerm('reports'), async (req, res) => {
  const b = parse(z.object({ status: z.enum(['actioned', 'dismissed']), removeContent: z.boolean().optional() }), req.body);
  const r = await db.reports.findOne({ _id: String(req.params.id) });
  if (!r) throw new HttpError(404, 'Report not found');
  if (b.removeContent && r.targetType !== 'user') await removeContent({ type: r.targetType, id: r.targetId }, 'Removed by a moderator');
  await db.reports.updateOne({ _id: r._id }, { $set: { status: b.status, resolvedBy: uid(req), resolvedAt: now() } });
  res.json({ ok: true });
});

adminRouter.get('/admin/flags', requirePerm('reports'), async (req, res) => {
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

adminRouter.post('/admin/flags/:id', requirePerm('reports'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['resolved', 'dismissed']) }), req.body);
  await db.modFlags.updateOne({ _id: String(req.params.id) }, { $set: { status, resolvedBy: uid(req), resolvedAt: now() } });
  res.json({ ok: true });
});

adminRouter.post('/admin/content/remove', requirePerm('reports'), async (req, res) => {
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
  const byName = async (id) => (id === 'ai' ? 'SafeShield AI' : `@${(await author(id)).handle}`);
  res.json({
    items: await Promise.all(
      rows.map(async (e) => ({
        id: e._id,
        user: await author(e.userId),
        kind: e.kind,
        reason: e.reason,
        until: e.until,
        by: await byName(e.byUserId ?? e.by),
        createdAt: e.createdAt,
      })),
    ),
  });
});

// ——— AI personas: who accepts DMs ———
adminRouter.get('/admin/personas', requirePerm('personas'), async (_req, res) => {
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

adminRouter.patch('/admin/personas/:id', requirePerm('personas'), async (req, res) => {
  const b = parse(z.object({ dmFrom: z.enum(['everyone', 'following', 'nobody']).optional(), active: z.boolean().optional() }), req.body);
  const set = {};
  if (b.dmFrom) set['settings.dmFrom'] = b.dmFrom;
  if (b.active !== undefined) set.deletedAt = b.active ? null : now();
  await db.users.updateOne({ _id: String(req.params.id), isAi: true }, { $set: set });
  res.json({ ok: true });
});
