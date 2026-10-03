import { Router } from 'express';
import { z } from 'zod';
import { CLAN_FOUND, CLAN_JOIN_POLICIES, CLAN_TAG_RE, CLAN_WAR, clanEventFor, clanHas, clanLevelFor, levelForXp, nextClanLevel } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { authorCache } from '../lib/serialize.js';
import { emitWallet, notify } from '../lib/rewards.js';
import { assertClean } from '../lib/moderation.js';
import { track } from '../lib/activity.js';
import { forgetMember, membershipOf, syncMemberBadges } from '../lib/clans.js';

/**
 * Clans: found one (Gold), join, request / invite, roles (leader → officers → members), a shared treasury of Sparks,
 * Clan Wars and the weekly events. Rep and level-ups are handled in lib/clans.js.
 */
export const clansRouter = Router();

function clanPublic(c, memberCount) {
  const lvl = clanLevelFor(c.rep);
  return {
    id: c._id, name: c.name, tag: c.tag, emoji: c.emoji, description: c.description ?? '', color: c.color ?? null, bannerUrl: c.bannerUrl ?? null,
    policy: c.policy, rep: Math.floor(c.rep), level: lvl.level, nextLevel: nextClanLevel(c.rep), memberCount, maxMembers: lvl.members,
    wins: c.wins ?? 0, losses: c.losses ?? 0, treasury: c.treasury ?? 0, trophies: c.trophies ?? [], loungeId: c.loungeId ?? null, createdAt: c.createdAt,
  };
}
const countMembers = (clanId) => db.clanMembers.countDocuments({ clanId });
async function clanOr404(id) {
  const c = await db.clans.findOne({ _id: String(id) });
  if (!c) throw new HttpError(404, 'Clan not found');
  return c;
}
/** The caller's role in this clan (or throws). */
async function roleIn(clanId, userId, need = 'member') {
  const m = await db.clanMembers.findOne({ clanId, userId });
  const rank = { member: 0, officer: 1, leader: 2 };
  if (!m || rank[m.role] < rank[need]) throw new HttpError(403, need === 'member' ? 'You’re not in this clan' : `Only the clan’s ${need}s can do that`);
  return m;
}
async function addMember(c, userId, role = 'member') {
  if ((await countMembers(c._id)) >= clanLevelFor(c.rep).members) throw new HttpError(409, 'This clan is full — it needs a higher level for more members');
  try {
    await db.clanMembers.insertOne({ _id: newId(), clanId: c._id, userId, role, rep: 0, joinedAt: now() });
  } catch {
    throw new HttpError(409, 'You’re already in a clan — leave it first');
  }
  forgetMember(userId);
  await db.clanRequests.deleteMany({ userId });
  await syncMemberBadges(c._id);
}
async function removeMember(clanId, userId) {
  await db.clanMembers.deleteOne({ clanId, userId });
  forgetMember(userId);
  await db.users.updateOne({ _id: userId }, { $unset: { clan: '' } });
}

// ——— Browse ———
clansRouter.get('/clans', optionalAuth, async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const filter = q ? { $or: [{ nameLower: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }, { tag: q.toUpperCase() }] } : {};
  const rows = await db.clans.find(filter).sort({ rep: -1 }).limit(50).toArray();
  const mine = req.userId ? await membershipOf(req.userId) : null;
  const ev = clanEventFor();
  const week = await db.clanWeeks.find({ week: ev.week }).sort({ rep: -1 }).limit(10).toArray();
  const names = new Map((await db.clans.find({ _id: { $in: week.map((w) => w.clanId) } }, { projection: { name: 1, tag: 1, emoji: 1 } }).toArray()).map((c) => [c._id, c]));
  res.json({
    clans: await Promise.all(rows.map(async (c) => clanPublic(c, await countMembers(c._id)))),
    myClanId: mine?.clanId ?? null,
    found: CLAN_FOUND,
    event: { ...ev, standings: week.map((w, i) => ({ rank: i + 1, clanId: w.clanId, name: names.get(w.clanId)?.name, tag: names.get(w.clanId)?.tag, emoji: names.get(w.clanId)?.emoji, rep: Math.floor(w.rep) })) },
  });
});

clansRouter.get('/clans/:id', optionalAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  const author = authorCache(req.userId);
  const members = await db.clanMembers.find({ clanId: c._id }).sort({ rep: -1 }).toArray();
  const me = req.userId ? members.find((m) => m.userId === req.userId) : null;
  const officer = me && me.role !== 'member';
  const wars = await db.clanWars.find({ $or: [{ aId: c._id }, { bId: c._id }] }).sort({ createdAt: -1 }).limit(10).toArray();
  const others = new Map((await db.clans.find({ _id: { $in: wars.flatMap((w) => [w.aId, w.bId]) } }, { projection: { name: 1, tag: 1, emoji: 1 } }).toArray()).map((x) => [x._id, x]));
  const myRequest = req.userId && !me ? await db.clanRequests.findOne({ clanId: c._id, userId: req.userId }) : null;
  res.json({
    clan: clanPublic(c, members.length),
    myRole: me?.role ?? null,
    myRequest: myRequest ? { invited: !!myRequest.invited } : null,
    members: await Promise.all(members.map(async (m) => ({ user: await author(m.userId), role: m.role, rep: Math.floor(m.rep ?? 0), joinedAt: m.joinedAt }))),
    requests: officer
      ? await Promise.all((await db.clanRequests.find({ clanId: c._id, invited: { $ne: true } }).toArray()).map(async (r) => ({ user: await author(r.userId), at: r.createdAt })))
      : [],
    wars: wars.map((w) => ({
      id: w._id, status: w.status, stake: w.stake, startsAt: w.startsAt ?? null, endsAt: w.endsAt ?? null, winnerId: w.winnerId ?? null,
      a: { ...others.get(w.aId), id: w.aId, score: Math.floor(w.aScore ?? 0) }, b: { ...others.get(w.bId), id: w.bId, score: Math.floor(w.bScore ?? 0) },
      incoming: w.status === 'pending' && w.bId === c._id,
    })),
    perks: { tag: clanHas(c.rep, 'tag'), wars: clanHas(c.rep, 'wars'), lounge: clanHas(c.rep, 'lounge'), banner: clanHas(c.rep, 'banner'), bonus: clanHas(c.rep, 'bonus'), radio: clanHas(c.rep, 'radio'), legend: clanHas(c.rep, 'legend') },
  });
});

// ——— Found, edit, disband ———
const clanBody = z.object({
  name: z.string().trim().min(3).max(24),
  tag: z.string().trim().toUpperCase().regex(CLAN_TAG_RE, 'Tag: 2–5 letters or numbers'),
  emoji: z.string().trim().min(1).max(8),
  description: z.string().trim().max(300).default(''),
  policy: z.enum(CLAN_JOIN_POLICIES.map((p) => p.key)).default('open'),
});

clansRouter.post('/clans', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`clan:found:${me}`, 3);
  const b = parse(clanBody, req.body);
  assertClean(`${b.name} ${b.tag} ${b.description}`);
  const u = await db.users.findOne({ _id: me }, { projection: { xp: 1 } });
  if (levelForXp(u?.xp ?? 0) < CLAN_FOUND.minLevel) throw new HttpError(403, `Reach level ${CLAN_FOUND.minLevel} to found a clan`);
  if (await membershipOf(me)) throw new HttpError(409, 'Leave your current clan first');
  if (await db.clans.findOne({ $or: [{ nameLower: b.name.toLowerCase() }, { tag: b.tag }] })) throw new HttpError(409, 'That name or tag is taken');
  const paid = await db.users.updateOne({ _id: me, gold: { $gte: CLAN_FOUND.gold } }, { $inc: { gold: -CLAN_FOUND.gold } });
  if (!paid.modifiedCount) throw new HttpError(402, `Founding a clan costs ${CLAN_FOUND.gold} Gold`);
  const c = { _id: newId(), ...b, nameLower: b.name.toLowerCase(), rep: 0, treasury: 0, wins: 0, losses: 0, trophies: [], leaderId: me, createdAt: now() };
  try {
    await db.clans.insertOne(c);
  } catch {
    await db.users.updateOne({ _id: me }, { $inc: { gold: CLAN_FOUND.gold } });
    throw new HttpError(409, 'That name or tag is taken');
  }
  await addMember(c, me, 'leader');
  void emitWallet(me);
  track(me, 'clan');
  res.status(201).json({ clan: clanPublic(c, 1) });
});

clansRouter.patch('/clans/:id', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, uid(req), 'leader');
  const b = parse(
    clanBody.partial().extend({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), bannerUrl: z.string().url().max(600).nullable().optional() }),
    req.body,
  );
  if ((b.color !== undefined || b.bannerUrl !== undefined) && !clanHas(c.rep, 'banner')) throw new HttpError(403, 'Custom colour and banner unlock at clan level 5');
  assertClean(`${b.name ?? ''} ${b.description ?? ''}`);
  const set = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  if (set.name) set.nameLower = set.name.toLowerCase();
  try {
    await db.clans.updateOne({ _id: c._id }, { $set: set });
  } catch {
    throw new HttpError(409, 'That name or tag is taken');
  }
  await syncMemberBadges(c._id);
  res.json({ clan: clanPublic(await db.clans.findOne({ _id: c._id }), await countMembers(c._id)) });
});

clansRouter.delete('/clans/:id', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, uid(req), 'leader');
  if (await db.clanWars.findOne({ status: { $in: ['pending', 'active'] }, $or: [{ aId: c._id }, { bId: c._id }] })) throw new HttpError(409, 'Finish your clan wars first');
  for (const m of await db.clanMembers.find({ clanId: c._id }).toArray()) await removeMember(c._id, m.userId);
  await db.clanRequests.deleteMany({ clanId: c._id });
  if (c.loungeId) await db.lounges.deleteOne({ _id: c.loungeId });
  await db.clans.deleteOne({ _id: c._id });
  res.json({ ok: true });
});

// ——— Joining ———
clansRouter.post('/clans/:id/join', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  if (await membershipOf(me)) throw new HttpError(409, 'You’re already in a clan — leave it first');
  const invite = await db.clanRequests.findOne({ clanId: c._id, userId: me, invited: true });
  if (c.policy === 'open' || invite) {
    await addMember(c, me);
    track(me, 'clan');
    return res.json({ joined: true });
  }
  if (c.policy === 'invite') throw new HttpError(403, 'This clan is invite-only');
  await db.clanRequests.updateOne({ clanId: c._id, userId: me }, { $setOnInsert: { _id: newId(), createdAt: now() } }, { upsert: true });
  const officers = await db.clanMembers.find({ clanId: c._id, role: { $in: ['leader', 'officer'] } }).toArray();
  const who = await db.users.findOne({ _id: me }, { projection: { displayName: 1 } });
  for (const o of officers) await notify(o.userId, { kind: 'system', title: `${who.displayName} wants to join ${c.name}`, body: 'Approve or decline on the clan page', link: `/clans/${c._id}` });
  res.json({ requested: true });
});

clansRouter.post('/clans/:id/requests/:userId/:verdict', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, uid(req), 'officer');
  const userId = String(req.params.userId);
  const r = await db.clanRequests.findOne({ clanId: c._id, userId, invited: { $ne: true } });
  if (!r) throw new HttpError(404, 'No such request');
  if (req.params.verdict === 'accept') {
    if (await membershipOf(userId)) {
      await db.clanRequests.deleteOne({ _id: r._id });
      throw new HttpError(409, 'They joined another clan meanwhile');
    }
    await addMember(c, userId);
    await notify(userId, { kind: 'system', title: `🏰 Welcome to ${c.name}!`, body: 'Your request was accepted', link: `/clans/${c._id}` });
  } else await db.clanRequests.deleteOne({ _id: r._id });
  res.json({ ok: true });
});

clansRouter.post('/clans/:id/invite', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, me, 'officer');
  await rateLimit(`clan:invite:${me}`, 20);
  const { userId } = parse(z.object({ userId: z.string().max(40) }), req.body);
  const u = await db.users.findOne({ _id: userId, deletedAt: null, isAi: false }, { projection: { displayName: 1 } });
  if (!u) throw new HttpError(404, 'User not found');
  if (await membershipOf(userId)) throw new HttpError(409, 'They’re already in a clan');
  await db.clanRequests.updateOne({ clanId: c._id, userId }, { $set: { invited: true }, $setOnInsert: { _id: newId(), createdAt: now() } }, { upsert: true });
  await notify(userId, { kind: 'system', title: `🏰 You’re invited to join ${c.emoji} ${c.name} [${c.tag}]`, body: 'Open the clan page to join', link: `/clans/${c._id}` });
  res.json({ ok: true });
});

clansRouter.post('/clans/:id/leave', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  const m = await roleIn(c._id, me);
  if (m.role === 'leader') {
    // Hand over to the top officer (or the most active member); the last one out disbands it.
    const next = (await db.clanMembers.find({ clanId: c._id, userId: { $ne: me } }).sort({ rep: -1 }).toArray()).sort((a, b) => (b.role === 'officer') - (a.role === 'officer'))[0];
    if (!next) throw new HttpError(409, 'You’re the last member — disband the clan instead');
    await db.clanMembers.updateOne({ _id: next._id }, { $set: { role: 'leader' } });
    await db.clans.updateOne({ _id: c._id }, { $set: { leaderId: next.userId } });
    await notify(next.userId, { kind: 'system', title: `👑 You now lead ${c.name}`, body: 'The previous leader left the clan', link: `/clans/${c._id}` });
  }
  await removeMember(c._id, me);
  res.json({ ok: true });
});

// ——— Roles ———
clansRouter.post('/clans/:id/members/:userId/role', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, me, 'leader');
  const { role } = parse(z.object({ role: z.enum(['member', 'officer', 'leader']) }), req.body);
  const userId = String(req.params.userId);
  if (userId === me) throw new HttpError(400, 'Choose someone else');
  await roleIn(c._id, userId);
  if (role === 'leader') {
    await db.clanMembers.updateOne({ clanId: c._id, userId: me }, { $set: { role: 'officer' } });
    await db.clans.updateOne({ _id: c._id }, { $set: { leaderId: userId } });
  }
  await db.clanMembers.updateOne({ clanId: c._id, userId }, { $set: { role } });
  res.json({ ok: true });
});

clansRouter.post('/clans/:id/members/:userId/kick', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  const mine = await roleIn(c._id, me, 'officer');
  const target = await roleIn(c._id, String(req.params.userId));
  if (target.role === 'leader' || (target.role === 'officer' && mine.role !== 'leader')) throw new HttpError(403, 'You can’t remove them');
  await removeMember(c._id, target.userId);
  await notify(target.userId, { kind: 'system', title: `You were removed from ${c.name}`, body: '', link: '/clans' });
  res.json({ ok: true });
});

// ——— Treasury ———
clansRouter.post('/clans/:id/donate', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, me);
  const { sparks } = parse(z.object({ sparks: z.number().int().min(10).max(1_000_000) }), req.body);
  const paid = await db.users.updateOne({ _id: me, sparks: { $gte: sparks } }, { $inc: { sparks: -sparks } });
  if (!paid.modifiedCount) throw new HttpError(402, 'Not enough Sparks');
  await db.clans.updateOne({ _id: c._id }, { $inc: { treasury: sparks } });
  await db.clanMembers.updateOne({ clanId: c._id, userId: me }, { $inc: { donated: sparks } });
  void emitWallet(me);
  res.json({ treasury: (c.treasury ?? 0) + sparks });
});

// ——— Clan lounge (level 4 perk) ———
clansRouter.post('/clans/:id/lounge', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, uid(req), 'leader');
  if (!clanHas(c.rep, 'lounge')) throw new HttpError(403, 'The clan lounge unlocks at clan level 4');
  if (c.loungeId && (await db.lounges.findOne({ _id: c.loungeId }))) return res.json({ loungeId: c.loungeId });
  const l = {
    _id: newId(), slug: `clan-${c.tag.toLowerCase()}-${newId().slice(-4)}`, name: `${c.name} HQ`, emoji: c.emoji, topic: `${c.name}’s private clan lounge`, nowPlaying: '',
    coverUrl: `https://picsum.photos/seed/clan-${c._id}/800/500`, ownerId: c.leaderId, clanId: c._id, radio: clanHas(c.rep, 'radio'), position: 999, createdAt: now(),
  };
  await db.lounges.insertOne(l);
  await db.clans.updateOne({ _id: c._id }, { $set: { loungeId: l._id } });
  res.status(201).json({ loungeId: l._id });
});

// ——— Clan Wars ———
clansRouter.post('/clans/:id/wars', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  await roleIn(c._id, me, 'officer');
  const { opponentId, stake } = parse(z.object({ opponentId: z.string().max(40), stake: z.number().int().min(0).max(CLAN_WAR.maxStake).default(0) }), req.body);
  const o = await clanOr404(opponentId);
  if (o._id === c._id) throw new HttpError(400, 'Pick another clan');
  if (!clanHas(c.rep, 'wars') || !clanHas(o.rep, 'wars')) throw new HttpError(403, `Both clans need to be level ${CLAN_WAR.minLevel}+ for Clan Wars`);
  if (await db.clanWars.findOne({ status: { $in: ['pending', 'active'] }, $or: [{ aId: { $in: [c._id, o._id] } }, { bId: { $in: [c._id, o._id] } }] }))
    throw new HttpError(409, 'One of these clans is already in a war or has a challenge waiting');
  if (stake) {
    const r = await db.clans.updateOne({ _id: c._id, treasury: { $gte: stake } }, { $inc: { treasury: -stake } });
    if (!r.modifiedCount) throw new HttpError(402, 'Not enough Sparks in your clan treasury');
  }
  const w = { _id: newId(), aId: c._id, bId: o._id, stake, status: 'pending', aScore: 0, bScore: 0, createdAt: now(), by: me };
  await db.clanWars.insertOne(w);
  for (const m of await db.clanMembers.find({ clanId: o._id, role: { $in: ['leader', 'officer'] } }).toArray())
    await notify(m.userId, { kind: 'system', title: `⚔️ ${c.emoji} ${c.name} declared war on ${o.name}!`, body: stake ? `Stake: ${stake.toLocaleString()} ✦ from each treasury` : 'For glory (no stake)', link: `/clans/${o._id}` });
  res.status(201).json({ ok: true });
});

clansRouter.post('/clan-wars/:id/:verdict', requireAuth, async (req, res) => {
  const me = uid(req);
  const w = await db.clanWars.findOne({ _id: String(req.params.id), status: 'pending' });
  if (!w) throw new HttpError(404, 'That challenge is gone');
  await roleIn(w.bId, me, 'officer');
  if (req.params.verdict !== 'accept') {
    await db.clanWars.updateOne({ _id: w._id, status: 'pending' }, { $set: { status: 'declined' } });
    if (w.stake) await db.clans.updateOne({ _id: w.aId }, { $inc: { treasury: w.stake } });
    return res.json({ ok: true });
  }
  if (w.stake) {
    const r = await db.clans.updateOne({ _id: w.bId, treasury: { $gte: w.stake } }, { $inc: { treasury: -w.stake } });
    if (!r.modifiedCount) throw new HttpError(402, `Your treasury needs ${w.stake.toLocaleString()} ✦ to accept`);
  }
  const startsAt = now();
  const endsAt = new Date(Date.now() + CLAN_WAR.hours * 3_600_000).toISOString();
  const r = await db.clanWars.updateOne({ _id: w._id, status: 'pending' }, { $set: { status: 'active', startsAt, endsAt } });
  if (!r.modifiedCount) {
    if (w.stake) await db.clans.updateOne({ _id: w.bId }, { $inc: { treasury: w.stake } });
    throw new HttpError(409, 'That challenge changed — reload');
  }
  const [a, b] = await Promise.all([db.clans.findOne({ _id: w.aId }), db.clans.findOne({ _id: w.bId })]);
  for (const id of [w.aId, w.bId])
    for (const m of await db.clanMembers.find({ clanId: id }, { projection: { userId: 1 } }).toArray())
      await notify(m.userId, { kind: 'system', title: `⚔️ Clan War: ${a.name} vs ${b.name} has begun!`, body: `${CLAN_WAR.hours} hours — every Spark your clan earns scores. Go!`, link: `/clans/${id}` });
  res.json({ ok: true });
});

/** Every war that's on right now (for the Clans page). */
clansRouter.get('/clan-wars', optionalAuth, async (_req, res) => {
  const wars = await db.clanWars.find({ status: 'active' }).sort({ endsAt: 1 }).limit(20).toArray();
  const names = new Map((await db.clans.find({ _id: { $in: wars.flatMap((w) => [w.aId, w.bId]) } }, { projection: { name: 1, tag: 1, emoji: 1 } }).toArray()).map((x) => [x._id, x]));
  res.json({
    wars: wars.map((w) => ({ id: w._id, stake: w.stake, endsAt: w.endsAt, a: { ...names.get(w.aId), id: w.aId, score: Math.floor(w.aScore) }, b: { ...names.get(w.bId), id: w.bId, score: Math.floor(w.bScore) } })),
  });
});
