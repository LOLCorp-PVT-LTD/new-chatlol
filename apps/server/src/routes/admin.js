import { Router } from 'express';
import { z } from 'zod';
import { db, escapeRegex, newId, now, today } from '../db.js';
import { config } from '../config.js';
import { LEVEL_GATES, PERMISSION_KEYS, activePowers, levelForXp, permissionsOf } from '@chatlol/shared';
import { featureTotals, userFeatureUse } from '../lib/activity.js';
import { dismissFinding, reinstateStaff, reviewStaffAction } from '../lib/oversight.js';
import { getLevelGates, setLevelGates } from '../lib/progression.js';
import { gemGoldWagers, setGemGoldWagers } from '../lib/arenas.js';
import { requireAuth, requirePerm, uid } from '../lib/auth.js';
import { HttpError, parse } from '../lib/http.js';
import { authorCache, userPublic, isPremium } from '../lib/serialize.js';
import { applyAction, standing } from '../lib/enforcement.js';
import { removeByStaff } from '../lib/aiModeration.js';
import { io, room } from '../lib/io.js';
import { presence } from '../lib/presence.js';
import { redisClient, shared, sharedBackend } from '../lib/shared.js';
import { apnsConfigured, fcmConfigured } from '../lib/push.js';
import { extendPremium } from './profile.js';
import { refundPurchase, stripeRefund } from './payments.js';
import { closeAccount } from '../lib/accounts.js';
import { emitWallet, notify } from '../lib/rewards.js';
import { generatePersonas } from '../ai/personaFactory.js';
import { nimEnabled } from '../ai/nim.js';

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
export const audit = async (userId, kind, reason, by, { review, ...extra } = {}) => {
  await db.modEvents.insertOne({ _id: newId(), userId, kind, reason, byUserId: by, createdAt: now(), ...extra });
  // LOLShield oversight: non-admin staff actions are checked for missing reasons, missing evidence and self-dealing.
  void reviewStaffAction({ staffId: by, kind, targetId: userId, reason: review?.reason ?? reason, meta: review ?? {} });
};
/** Staff removal: leaves a "removed by Admin" card, logs it on the author's record and tells them. */
async function staffRemove(ref, reason, staffId) {
  const doc = await removeByStaff(ref, reason, staffId);
  if (!doc) throw new HttpError(404, 'Content not found');
  if (doc.authorId) {
    await audit(doc.authorId, 'content_removed', `${ref.type} removed: ${reason}`, staffId, { ref, review: { reason } });
    await notify(doc.authorId, { kind: 'system', title: `🛡️ Your ${ref.type} was removed by an Admin`, body: `Reason: ${reason}`, link: '/settings' });
  }
  io()?.to(room.global).emit('content:removed', { type: ref.type, id: ref.id, reason });
}
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
      songSearch: config.spotify.clientId && config.spotify.clientSecret ? 'Spotify' : 'not set: add SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET',
      fullSongs: config.youtube.apiKey ? 'YouTube matching ✓' : 'not set: add YOUTUBE_API_KEY for full-length profile songs',
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
    gold: u.gold ?? 0,
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
      .find({ $or: [{ targetType: 'user', targetId: u._id }, { targetUserId: u._id }, { reporterId: u._id }] })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray(),
    db.posts.find({ authorId: u._id }).sort({ createdAt: -1 }).limit(10).toArray(),
    db.shouts.find({ authorId: u._id }).sort({ createdAt: -1 }).limit(10).toArray(),
    db.messages.find({ authorId: u._id }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  const byName = async (id) => (id === 'ai' ? 'LOLShield AI' : `@${(await author(id)).handle}`);
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
      against: r.targetId === u._id || r.targetUserId === u._id,
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
  await audit(target._id, 'premium', days > 0 ? `+${days} days of Premium` : 'Premium removed', uid(req), { review: { positive: days > 0 } });
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

/** Add (or take away, with a negative number) Sparks and Gems. Balances never go below zero. */
adminRouter.post('/admin/users/:id/wallet', requirePerm('wallet'), async (req, res) => {
  const b = parse(
    z.object({
      sparks: z.number().int().min(-10_000_000).max(10_000_000).default(0),
      gems: z.number().int().min(-1_000_000).max(1_000_000).default(0),
      gold: z.number().int().min(-100_000).max(100_000).default(0),
      reason: z.string().trim().max(200).default(''),
    }),
    req.body,
  );
  if (!b.sparks && !b.gems && !b.gold) throw new HttpError(400, 'Enter an amount');
  const target = await findTarget(req);
  if (target.deletedAt) throw new HttpError(400, 'That account is closed');
  await db.users.updateOne({ _id: target._id }, [
    {
      $set: {
        sparks: { $max: [0, { $add: [{ $ifNull: ['$sparks', 0] }, b.sparks] }] },
        gems: { $max: [0, { $add: [{ $ifNull: ['$gems', 0] }, b.gems] }] },
        gold: { $max: [0, { $add: [{ $ifNull: ['$gold', 0] }, b.gold] }] },
      },
    },
  ]);
  const fmt = (n, what) => `${n > 0 ? '+' : ''}${n.toLocaleString()} ${what}`;
  const parts = [b.sparks && fmt(b.sparks, 'Sparks'), b.gems && fmt(b.gems, 'Gems'), b.gold && fmt(b.gold, 'Gold')].filter(Boolean).join(', ');
  const gifts = [b.sparks > 0 && fmt(b.sparks, 'Sparks'), b.gems > 0 && fmt(b.gems, 'Gems'), b.gold > 0 && fmt(b.gold, 'Gold')].filter(Boolean).join(' and ');
  await audit(target._id, 'wallet', `${parts}${b.reason ? ` — ${b.reason}` : ''}`, uid(req), { sparks: b.sparks, gems: b.gems, gold: b.gold, review: { positive: b.sparks > 0 || b.gems > 0 || b.gold > 0 } });
  if (b.sparks > 0 || b.gems > 0 || b.gold > 0)
    await notify(target._id, { kind: 'system', title: `🎁 ${gifts} from the ChatLOL team`, body: b.reason || 'Enjoy!', link: '/vault' });
  await emitWallet(target._id);
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

adminRouter.get('/admin/items', requirePerm('items'), async (_req, res) => {
  const rows = await db.storeItems.find({}).sort({ kind: 1, price: 1 }).toArray();
  res.json({
    items: rows.map((i) => ({ key: i.key, name: i.name, kind: i.kind, emoji: i.emoji ?? null, rarity: i.rarity ?? null, price: i.price, goldPrice: i.goldPrice ?? null, preview: i.preview ?? null, description: i.description ?? '' })),
  });
});

/** Give someone a store item (sticker packs, frames, themes, boosts…) without them paying. */
adminRouter.post('/admin/users/:id/items', requirePerm('items'), async (req, res) => {
  const b = parse(z.object({ key: z.string().max(80), qty: z.number().int().min(1).max(99).default(1) }), req.body);
  const target = await findTarget(req);
  const item = await db.storeItems.findOne({ key: b.key });
  if (!item) throw new HttpError(404, 'Item not found');
  const stackable = ['streak_freeze', 'boost', 'gift', 'crate', 'power'].includes(item.kind);
  await db.inventory.updateOne(
    { userId: target._id, itemId: item._id },
    stackable
      ? { $inc: { qty: b.qty }, $set: { via: 'admin' }, $setOnInsert: { acquiredAt: now() } }
      : { $set: { qty: 1, via: 'admin' }, $setOnInsert: { acquiredAt: now() } },
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

/** Edit someone's profile, or remove their picture / cover / background. Every change is logged. */
adminRouter.patch('/admin/users/:id/profile', requirePerm('profiles'), async (req, res) => {
  const b = parse(
    z.object({
      displayName: z.string().trim().min(1).max(40).optional(),
      handle: z.string().regex(/^[a-zA-Z0-9_.]{3,20}$/, '3–20 letters, numbers, _ or .').optional(),
      bio: z.string().max(280).optional(),
      pronouns: z.string().max(24).optional(),
      city: z.string().max(60).optional(),
      headline: z.string().max(80).optional(),
      removeAvatar: z.boolean().optional(),
      removeCover: z.boolean().optional(),
      removeBackground: z.boolean().optional(),
      removeSong: z.boolean().optional(),
      reason: z.string().trim().max(200).default(''),
    }),
    req.body,
  );
  const target = await findTarget(req);
  assertOutranks(req, target);
  const set = {};
  const changed = [];
  for (const k of ['displayName', 'bio', 'pronouns', 'city']) if (b[k] !== undefined && b[k] !== target[k]) (set[k] = b[k]), changed.push(k);
  if (b.headline !== undefined) (set['profile.headline'] = b.headline), changed.push('headline');
  if (b.handle && b.handle !== target.handle) {
    if (await db.users.findOne({ handleLower: b.handle.toLowerCase(), _id: { $ne: target._id } })) throw new HttpError(409, 'That handle is taken');
    Object.assign(set, { handle: b.handle, handleLower: b.handle.toLowerCase() });
    changed.push(`handle @${target.handle} → @${b.handle}`);
  }
  if (b.removeAvatar) (set.avatarUrl = null), changed.push('picture removed');
  if (b.removeCover) (set['profile.coverUrl'] = null), changed.push('cover removed');
  if (b.removeBackground) (set['profile.background'] = { kind: 'preset', value: 'sunset' }), changed.push('background reset');
  if (b.removeSong) (set['profile.song'] = null), changed.push('song removed');
  if (!changed.length) throw new HttpError(400, 'Nothing changed');
  await db.users.updateOne({ _id: target._id }, { $set: set });
  await audit(target._id, 'profile_edit', `${changed.join(', ')}${b.reason ? ` — ${b.reason}` : ''}`, uid(req), { review: { reason: b.reason } });
  if (b.removeAvatar || b.removeCover || b.handle)
    await notify(target._id, { kind: 'system', title: '🛡️ An Admin updated your profile', body: `${changed.join(', ')}${b.reason ? ` — ${b.reason}` : ''}`, link: '/settings' });
  res.json({ user: await adminUser(await db.users.findOne({ _id: target._id })) });
});

/** Everything someone has posted, removed and hidden items included (with the original text), newest first. */
const CONTENT = {
  posts: ['posts', {}],
  photos: ['posts', { mediaUrl: { $ne: null } }],
  shouts: ['shouts', {}],
  comments: ['comments', {}],
  threads: ['threads', {}],
  replies: ['replies', {}],
  wall: ['wallNotes', {}],
  messages: ['messages', {}],
};
adminRouter.get('/admin/users/:id/content', requirePerm('reports'), async (req, res) => {
  const kind = String(req.query.kind ?? 'posts');
  if (!CONTENT[kind]) throw new HttpError(400, 'Unknown content type');
  const [col, extra] = CONTENT[kind];
  const before = req.query.before ? { createdAt: { $lt: String(req.query.before) } } : {};
  const rows = await db[col].find({ authorId: String(req.params.id), ...extra, ...before }).sort({ createdAt: -1 }).limit(40).toArray();
  const type = { posts: 'post', photos: 'post', shouts: 'shout', comments: 'comment', threads: 'thread', replies: 'reply', wall: 'wall', messages: 'message' }[kind];
  res.json({
    items: rows.map((r) => ({
      type,
      id: r._id,
      text: r.removedOriginal?.body ?? r.body ?? '',
      title: r.removedOriginal?.title ?? r.title ?? null,
      mediaUrl: r.removedOriginal?.mediaUrl ?? r.mediaUrl ?? null,
      where: r.roomId ?? r.postId ?? r.threadId ?? r.profileId ?? null,
      hidden: !!r.hidden,
      removed: r.removed ?? (r.kind === 'removed' ? { by: 'LOLShield', reason: r.removedReason ?? '' } : null),
      reactions: r.reactions ?? null,
      createdAt: r.createdAt,
    })),
    nextBefore: rows.length === 40 ? rows.at(-1).createdAt : null,
  });
});

/** Feature usage, wallet, progression and game history for one person. */
adminRouter.get('/admin/users/:id/activity', async (req, res) => {
  const u = await findTarget(req);
  const [features, inventory, arenas, ticketsOn, ticketsBy] = await Promise.all([
    userFeatureUse(u._id),
    db.inventory.find({ userId: u._id, qty: { $gt: 0 } }).toArray(),
    db.arenas.find({ playerIds: u._id }).sort({ createdAt: -1 }).limit(20).toArray(),
    db.modEvents.find({ userId: u._id, category: { $regex: '^ticket_' } }).sort({ createdAt: -1 }).limit(20).toArray(),
    db.modEvents.find({ byUserId: u._id, category: { $regex: '^ticket_' } }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  const items = new Map((await db.storeItems.find({ _id: { $in: inventory.map((i) => i.itemId) } }).toArray()).map((i) => [i._id, i]));
  res.json({
    features,
    progression: {
      level: levelForXp(u.xp ?? 0),
      xp: u.xp ?? 0,
      loginStreak: u.loginStreak ?? 0,
      lastDailyClaim: u.lastDailyClaim ?? null,
      lastSeenAt: u.lastSeenAt,
      progressResetAt: u.progressResetAt ?? null,
      powers: activePowers(u),
      unlockedThemes: u.unlockedThemes ?? [],
      handleHistory: u.handleHistory ?? [],
      gameStats: u.gameStats ?? { played: 0, wins: 0 },
    },
    inventory: inventory.map((i) => ({ key: items.get(i.itemId)?.key, name: items.get(i.itemId)?.name, emoji: items.get(i.itemId)?.emoji, kind: items.get(i.itemId)?.kind, qty: i.qty, via: i.via ?? null, acquiredAt: i.acquiredAt })),
    arenas: arenas.map((a) => ({ id: a._id, name: a.name, game: a.game, status: a.status, stake: a.stake, payout: a.payouts?.find((p) => p.userId === u._id)?.amount ?? 0, createdAt: a.createdAt })),
    tickets: {
      against: ticketsOn.map((e) => ({ kind: e.category.slice(7), reason: e.reason, at: e.createdAt })),
      used: ticketsBy.map((e) => ({ kind: e.category.slice(7), targetId: e.userId, at: e.createdAt })),
    },
  });
});

/** Network-wide feature adoption (last 7 and 30 days). */
adminRouter.get('/admin/features', requirePerm('overview'), async (_req, res) => {
  res.json({ week: await featureTotals(7), month: await featureTotals(30) });
});

// ——— LOLShield oversight of moderators ———
adminRouter.get('/admin/oversight', requirePerm('staff'), async (_req, res) => {
  const author = authorCache();
  const rows = await db.modEvents.find({ kind: { $in: ['mod_violation', 'staff_revoked'] } }).sort({ createdAt: -1 }).limit(200).toArray();
  const revoked = await db.users.find({ staffRevokedFrom: { $exists: true } }, { projection: { _id: 1, staffRevokedFrom: 1, staffRevokedAt: 1 } }).toArray();
  res.json({
    items: await Promise.all(rows.map(async (e) => ({ id: e._id, kind: e.kind, code: e.category ?? null, reason: e.reason, action: e.ref ?? null, cleared: !!e.cleared, staff: await author(e.userId), createdAt: e.createdAt }))),
    revoked: await Promise.all(revoked.map(async (u) => ({ user: await author(u._id), from: u.staffRevokedFrom, at: u.staffRevokedAt }))),
  });
});
adminRouter.post('/admin/oversight/:id/dismiss', requirePerm('staff'), async (req, res) => {
  if (req.userRole !== 'admin') throw new HttpError(403, 'Only admins can dismiss oversight findings');
  await dismissFinding(String(req.params.id));
  await audit(uid(req), 'settings', 'Dismissed a LOLShield oversight finding', uid(req));
  res.json({ ok: true });
});
adminRouter.post('/admin/oversight/reinstate/:userId', requirePerm('staff'), async (req, res) => {
  if (req.userRole !== 'admin') throw new HttpError(403, 'Only admins can reinstate staff');
  if (!(await reinstateStaff(String(req.params.userId)))) throw new HttpError(404, 'Nothing to reinstate');
  await audit(String(req.params.userId), 'role', 'Staff role reinstated after LOLShield revoked it', uid(req));
  res.json({ ok: true });
});

/** Level gates: the level members need before they can DM non-friends, post in forums, go live, make arenas. */
adminRouter.get('/admin/level-gates', requirePerm('staff'), async (_req, res) => {
  res.json({ gates: LEVEL_GATES, values: await getLevelGates() });
});
adminRouter.put('/admin/level-gates', requirePerm('staff'), async (req, res) => {
  const values = parse(z.record(z.string(), z.number().int().min(1).max(100)), req.body ?? {});
  const saved = await setLevelGates(values);
  await audit(uid(req), 'settings', `Level gates: ${LEVEL_GATES.map((g) => `${g.key} ${saved[g.key]}`).join(', ')}`, uid(req));
  res.json({ gates: LEVEL_GATES, values: saved });
});

/** Arenas: the Gem/Gold wager switch, and every recent game with its stakes and payouts. */
adminRouter.get('/admin/arenas', requirePerm('overview'), async (_req, res) => {
  const rows = await db.arenas.find({}).sort({ createdAt: -1 }).limit(100).toArray();
  res.json({
    gemsGold: await gemGoldWagers(),
    items: rows.map((a) => ({ id: a._id, name: a.name, game: a.game, status: a.status, hostId: a.hostId, playerIds: a.playerIds, stake: a.stake, payouts: a.payouts, outcome: a.outcome, createdAt: a.createdAt, endedAt: a.endedAt })),
  });
});
adminRouter.put('/admin/arenas/wagers', requirePerm('staff'), async (req, res) => {
  const { gemsGold } = parse(z.object({ gemsGold: z.boolean() }), req.body);
  await setGemGoldWagers(gemsGold);
  await audit(uid(req), 'settings', `Gem/Gold arena stakes ${gemsGold ? 'on' : 'off'}`, uid(req));
  res.json({ gemsGold });
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
  await audit(target._id, 'boost', until ? `Boosted until ${new Date(until).toUTCString()}` : 'Boost ended', uid(req), { until, review: { positive: !!until } });
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
  if (b.removeContent && r.targetType !== 'user') await staffRemove({ type: r.targetType, id: r.targetId }, r.reason || 'breaking the Community Guidelines', uid(req));
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
    z.object({
      type: z.enum(['post', 'comment', 'shout', 'thread', 'reply', 'wall', 'message']),
      id: z.string().max(60),
      reason: z.string().trim().min(3).max(200).default('breaking the Community Guidelines'),
    }),
    req.body,
  );
  await staffRemove(b, b.reason, uid(req));
  res.json({ ok: true });
});

adminRouter.get('/admin/modlog', async (_req, res) => {
  const rows = await db.modEvents.find({}).sort({ createdAt: -1 }).limit(100).toArray();
  const author = authorCache();
  const byName = async (id) => (id === 'ai' ? 'LOLShield AI' : `@${(await author(id)).handle}`);
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
      generated: !!u.personaDef,
    })),
  });
});

/** Invents new personas with the AI model and creates their accounts. Runs in the background (it takes a minute). */
adminRouter.post('/admin/personas/generate', requirePerm('personas'), async (req, res) => {
  const b = parse(z.object({ count: z.number().int().min(1).max(5).default(1), hint: z.string().trim().max(300).default('') }), req.body);
  if (!nimEnabled()) throw new HttpError(400, 'Set NVIDIA_API_KEY first: personas are generated by the AI model');
  if (!(await shared().setNx('admin:personas:generating', '1', 10 * 60_000))) throw new HttpError(409, 'Already generating personas — try again in a minute');
  res.status(202).json({ started: true });
  void generatePersonas(b)
    .catch((e) => console.warn('[personas] generation failed:', e.message))
    .finally(() => void shared().del('admin:personas:generating'));
});

adminRouter.patch('/admin/personas/:id', requirePerm('personas'), async (req, res) => {
  const b = parse(z.object({ dmFrom: z.enum(['everyone', 'following', 'nobody']).optional(), active: z.boolean().optional() }), req.body);
  const set = {};
  if (b.dmFrom) set['settings.dmFrom'] = b.dmFrom;
  if (b.active !== undefined) set.deletedAt = b.active ? null : now();
  await db.users.updateOne({ _id: String(req.params.id), isAi: true }, { $set: set });
  res.json({ ok: true });
});
