import { Router } from 'express';
import { z } from 'zod';
import { CLAN_CUSTOM_ROLES, CLAN_FOUND, CONTRIBUTION, clanSeasonFor, CLAN_JOIN_POLICIES, CLAN_PERMS, CLAN_RANKS, clanCan, clanRank, normalizePolicy, CLAN_TAG_RE, CLAN_WAR, HQ_BUILDINGS, HQ_LEVELS, SIEGE, TERRITORIES, clanEventFor, clanHas, clanLevelFor, clanMaxMembers, hqLevel, levelForXp, nextClanLevel, objectiveTier, siegeFor } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { authorCache, stats as userStats } from '../lib/serialize.js';
import { emitWallet, notify } from '../lib/rewards.js';
import { assertClean } from '../lib/moderation.js';
import { track } from '../lib/activity.js';
import { forgetMember, membershipOf, syncMemberBadges } from '../lib/clans.js';
import { checkAchievements, contribute, forgetBonuses, objectivesFor, siegeTarget, topContributors, trackObjective } from '../lib/clanWorld.js';

/**
 * Clans: found one (Gold), join, request / invite, roles (leader → officers → members), a shared treasury of Sparks,
 * Clan Wars and the weekly events. Rep and level-ups are handled in lib/clans.js.
 */
export const clansRouter = Router();

function clanPublic(c, memberCount) {
  const lvl = clanLevelFor(c.rep);
  return {
    id: c._id, name: c.name, tag: c.tag, emoji: c.emoji, description: c.description ?? '', color: c.color ?? null, bannerUrl: c.bannerUrl ?? null,
    policy: normalizePolicy(c.policy), requirements: { minLevel: c.minLevel ?? 0, minAgeDays: c.minAgeDays ?? 0, minVibe: c.minVibe ?? 0 }, customRoles: c.customRoles ?? [], rep: Math.floor(c.rep), level: lvl.level, nextLevel: nextClanLevel(c.rep), memberCount, maxMembers: clanMaxMembers(c.rep, c.hq),
    reputation: Math.floor(c.reputation ?? 0), prestige: c.prestige ?? 0, minLevel: c.minLevel ?? 0,
    wins: c.wins ?? 0, losses: c.losses ?? 0, treasury: c.treasury ?? 0, trophies: c.trophies ?? [], loungeId: c.loungeId ?? null, createdAt: c.createdAt,
  };
}
const countMembers = (clanId) => db.clanMembers.countDocuments({ clanId });
async function clanOr404(id) {
  const c = await db.clans.findOne({ _id: String(id) });
  if (!c) throw new HttpError(404, 'Clan not found');
  return c;
}
/** The caller's membership (or throws). With `perm`, they must also hold that permission. */
async function roleIn(c, userId, perm = null) {
  const m = await db.clanMembers.findOne({ clanId: c._id, userId });
  if (!m) throw new HttpError(403, 'You’re not in this clan');
  if (perm && !clanCan(m.role, perm, c.customRoles)) throw new HttpError(403, `Your rank can’t ${CLAN_PERMS.find((p) => p.key === perm)?.label.toLowerCase() ?? 'do that'}`);
  return m;
}
const rankOf = (c, role) => clanRank(role, c.customRoles).rank;
const isFounder = (role) => clanRank(role).key === 'founder';
/** Members holding a permission (for notifications). */
async function membersWith(c, perm) {
  return (await db.clanMembers.find({ clanId: c._id }).toArray()).filter((m) => clanCan(m.role, perm, c.customRoles));
}
/** Does this user meet the clan's requirements? Throws with the reason if not. */
async function assertRequirements(c, userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { xp: 1, createdAt: 1 } });
  if (c.minLevel && levelForXp(u?.xp ?? 0) < c.minLevel) throw new HttpError(403, `${c.name} takes members from level ${c.minLevel}`);
  if (c.minAgeDays && (Date.now() - Date.parse(u?.createdAt ?? now())) / 86_400_000 < c.minAgeDays) throw new HttpError(403, `${c.name} takes accounts at least ${c.minAgeDays} days old`);
  if (c.minVibe) {
    const st = await userStats(userId);
    if ((st.vibeAvg ?? 0) < c.minVibe) throw new HttpError(403, `${c.name} wants a Vibe score of ${c.minVibe}+`);
  }
}
async function addMember(c, userId, role = 'recruit') {
  if ((await countMembers(c._id)) >= clanMaxMembers(c.rep, c.hq)) throw new HttpError(409, 'This clan is full — it needs a higher level for more members');
  try {
    await db.clanMembers.insertOne({ _id: newId(), clanId: c._id, userId, role, rep: 0, joinedAt: now() });
  } catch {
    throw new HttpError(409, 'You’re already in a clan — leave it first');
  }
  forgetMember(userId);
  await db.clanRequests.deleteMany({ userId });
  await syncMemberBadges(c._id);
  void checkAchievements(c._id).catch(() => {});
}
async function removeMember(clanId, userId) {
  await db.clanMembers.deleteOne({ clanId, userId });
  forgetMember(userId);
  await db.users.updateOne({ _id: userId }, { $unset: { clan: '' } });
}

/** Treasury ledger: every deposit and purchase, visible to members. */
async function logTreasury(clanId, userId, amount, what) {
  await db.clanLedger.insertOne({ _id: newId(), clanId, userId, amount, what, at: now() });
}

// ——— Browse ———
clansRouter.get('/clans', optionalAuth, async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const filter = q ? { $or: [{ nameLower: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }, { tag: q.toUpperCase() }] } : {};
  const rows = await db.clans.find(filter).sort(req.query.sort === 'reputation' ? { reputation: -1, rep: -1 } : { rep: -1 }).limit(50).toArray();
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
  const officer = me && clanCan(me.role, 'recruit', c.customRoles);
  const wars = await db.clanWars.find({ $or: [{ aId: c._id }, { bId: c._id }] }).sort({ createdAt: -1 }).limit(10).toArray();
  const others = new Map((await db.clans.find({ _id: { $in: wars.flatMap((w) => [w.aId, w.bId]) } }, { projection: { name: 1, tag: 1, emoji: 1 } }).toArray()).map((x) => [x._id, x]));
  const myRequest = req.userId && !me ? await db.clanRequests.findOne({ clanId: c._id, userId: req.userId }) : null;
  res.json({
    clan: clanPublic(c, members.length),
    myRole: me?.role ?? null,
    myPerms: me ? clanRank(me.role, c.customRoles).perms : [],
    myRequest: myRequest ? { invited: !!myRequest.invited } : null,
    members: await Promise.all(members.map(async (m) => ({ user: await author(m.userId), role: m.role, rep: Math.floor(m.rep ?? 0), joinedAt: m.joinedAt, contribution: Math.floor(m.contrib?.points ?? 0), mvpCount: m.mvpCount ?? 0 }))),
    requests: officer
      ? await Promise.all((await db.clanRequests.find({ clanId: c._id, invited: { $ne: true } }).toArray()).map(async (r) => ({ user: await author(r.userId), at: r.createdAt, message: r.message ?? '' })))
      : [],
    wars: wars.map((w) => ({
      id: w._id, status: w.status, stake: w.stake, startsAt: w.startsAt ?? null, endsAt: w.endsAt ?? null, winnerId: w.winnerId ?? null,
      a: { ...others.get(w.aId), id: w.aId, score: Math.floor(w.aScore ?? 0) }, b: { ...others.get(w.bId), id: w.bId, score: Math.floor(w.bScore ?? 0) },
      incoming: w.status === 'pending' && w.bId === c._id,
    })),
    world: {
      reputation: Math.floor(c.reputation ?? 0), hq: c.hq ?? {}, tier: objectiveTier(c.rep), objectives: me ? await objectivesFor(c) : [],
      achievements: c.achievements ?? [], territories: (await db.territories.find({ clanId: c._id }, { projection: { _id: 1 } }).toArray()).map((t) => t._id),
      siegeTarget: await siegeTarget(c._id), minLevel: c.minLevel ?? 0,
    },
    contributors: await (async () => {
      const week = clanEventFor().week;
      const ss = clanSeasonFor(week);
      const fill = async (rows) => Promise.all(rows.map(async (r) => ({ user: await author(r.userId), points: Math.floor(r.points ?? 0), xp: Math.floor(r.xp ?? 0), reputation: Math.floor(r.reputation ?? 0), quests: r.quests ?? 0, wars: r.wars ?? 0, recruits: r.recruits ?? 0, donated: r.donated ?? 0 })));
      const [wk, season, life] = await Promise.all([topContributors(c._id, week), topContributors(c._id, ss.startWeek, ss.endWeek), topContributors(c._id, null)]);
      return { week: await fill(wk), season: await fill(season), lifetime: await fill(life) };
    })(),
    mvp: await (async () => {
      const last = (c.mvps ?? []).at(-1);
      if (!last) return null;
      const [row] = await topContributors(c._id, last.week);
      return { week: last.week, user: await author(last.userId), points: last.points, quests: row?.quests ?? 0, wars: row?.wars ?? 0, reputation: Math.floor(row?.reputation ?? 0) };
    })(),
    ledger: me
      ? await Promise.all((await db.clanLedger.find({ clanId: c._id }).sort({ at: -1 }).limit(30).toArray()).map(async (l) => ({ user: l.userId ? await author(l.userId) : null, amount: l.amount, what: l.what, at: l.at })))
      : [],
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
  minLevel: z.number().int().min(0).max(100).optional(),
  minAgeDays: z.number().int().min(0).max(3650).optional(),
  minVibe: z.number().min(0).max(5).optional(),
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
  await addMember(c, me, 'founder');
  void emitWallet(me);
  track(me, 'clan');
  res.status(201).json({ clan: clanPublic(c, 1) });
});

clansRouter.patch('/clans/:id', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c, uid(req), 'settings');
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
  if (!isFounder((await roleIn(c, uid(req))).role)) throw new HttpError(403, 'Only the Founder can disband the clan');
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
  const policy = normalizePolicy(c.policy);
  if (!invite) {
    if (policy === 'closed') throw new HttpError(403, `${c.name} isn’t recruiting right now`);
    if (policy === 'invite') throw new HttpError(403, 'This clan is invite-only');
    await assertRequirements(c, me);
  }
  if (policy === 'open' || invite) {
    await addMember(c, me);
    if (invite?.invitedBy && invite.invitedBy !== me) await contribute(c._id, invite.invitedBy, { points: CONTRIBUTION.recruit, recruits: 1 });
    track(me, 'clan');
    return res.json({ joined: true });
  }
  const message = String(req.body?.message ?? '').trim().slice(0, 300);
  if (message) assertClean(message);
  await db.clanRequests.updateOne({ clanId: c._id, userId: me }, { $set: { message }, $setOnInsert: { _id: newId(), createdAt: now() } }, { upsert: true });
  const officers = await membersWith(c, 'recruit');
  const who = await db.users.findOne({ _id: me }, { projection: { displayName: 1 } });
  for (const o of officers) await notify(o.userId, { kind: 'system', actorId: me, title: `${who.displayName} wants to join ${c.name}`, body: message ? `“${message.slice(0, 120)}”` : 'Approve or decline', link: `/clans/${c._id}`, action: { type: 'clan_request', id: `${c._id}:${me}` } });
  res.json({ requested: true });
});

clansRouter.post('/clans/:id/requests/:userId/:verdict', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c, uid(req), 'recruit');
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
  await roleIn(c, me, 'invite');
  await rateLimit(`clan:invite:${me}`, 20);
  const { userId } = parse(z.object({ userId: z.string().max(40) }), req.body);
  const u = await db.users.findOne({ _id: userId, deletedAt: null, isAi: false }, { projection: { displayName: 1 } });
  if (!u) throw new HttpError(404, 'User not found');
  if (await membershipOf(userId)) throw new HttpError(409, 'They’re already in a clan');
  await db.clanRequests.updateOne({ clanId: c._id, userId }, { $set: { invited: true, invitedBy: me }, $setOnInsert: { _id: newId(), createdAt: now() } }, { upsert: true });
  await notify(userId, { kind: 'system', title: `🏰 You’re invited to join ${c.emoji} ${c.name} [${c.tag}]`, body: 'Join now, or open the clan page', link: `/clans/${c._id}`, action: { type: 'clan_invite', id: c._id } });
  res.json({ ok: true });
});

clansRouter.post('/clans/:id/leave', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  const m = await roleIn(c, me);
  if (isFounder(m.role)) {
    // Hand over to the highest rank (most active first); the last one out disbands it.
    const next = (await db.clanMembers.find({ clanId: c._id, userId: { $ne: me } }).sort({ rep: -1 }).toArray()).sort((a, b) => rankOf(c, b.role) - rankOf(c, a.role))[0];
    if (!next) throw new HttpError(409, 'You’re the last member — disband the clan instead');
    await db.clanMembers.updateOne({ _id: next._id }, { $set: { role: 'founder' } });
    await db.clans.updateOne({ _id: c._id }, { $set: { leaderId: next.userId } });
    await notify(next.userId, { kind: 'system', title: `👑 You’re now Founder of ${c.name}`, body: 'The previous Founder left the clan', link: `/clans/${c._id}` });
  }
  await removeMember(c._id, me);
  res.json({ ok: true });
});

// ——— Roles ———
clansRouter.post('/clans/:id/members/:userId/role', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  const mine = await roleIn(c, me, 'promote');
  const { role } = parse(z.object({ role: z.string().max(40) }), req.body);
  const userId = String(req.params.userId);
  if (userId === me) throw new HttpError(400, 'Choose someone else');
  const target = await roleIn(c, userId);
  const want = clanRank(role, c.customRoles);
  if (want.key !== role) throw new HttpError(400, 'No such rank');
  if (want.key === 'founder') {
    // Handing over the clan: only the Founder, who becomes a Commander.
    if (!isFounder(mine.role)) throw new HttpError(403, 'Only the Founder can hand over the clan');
    await db.clanMembers.updateOne({ clanId: c._id, userId: me }, { $set: { role: 'commander' } });
    await db.clans.updateOne({ _id: c._id }, { $set: { leaderId: userId } });
  } else if (rankOf(c, target.role) >= rankOf(c, mine.role) || want.rank >= rankOf(c, mine.role)) {
    throw new HttpError(403, 'You can only manage ranks below your own');
  }
  await db.clanMembers.updateOne({ clanId: c._id, userId }, { $set: { role: want.key } });
  forgetMember(userId);
  await notify(userId, { kind: 'system', title: `${want.emoji} You’re now ${want.name} of ${c.name}`, body: '', link: `/clans/${c._id}` });
  res.json({ ok: true });
});

/** Custom roles (clan level 5+): the Founder defines up to five, each placed between Recruit and Commander. */
clansRouter.put('/clans/:id/roles', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  if (!isFounder((await roleIn(c, uid(req))).role)) throw new HttpError(403, 'Only the Founder can edit custom roles');
  if (clanLevelFor(c.rep).level < CLAN_CUSTOM_ROLES.minLevel) throw new HttpError(403, `Custom roles unlock at clan level ${CLAN_CUSTOM_ROLES.minLevel}`);
  const { roles } = parse(
    z.object({
      roles: z.array(z.object({ key: z.string().max(20).optional(), name: z.string().trim().min(2).max(20), emoji: z.string().trim().min(1).max(8), rank: z.number().min(0.5).max(3.5), perms: z.array(z.enum(CLAN_PERMS.map((p) => p.key))).max(8) })).max(CLAN_CUSTOM_ROLES.max),
    }),
    req.body,
  );
  assertClean(roles.map((r) => r.name).join(' '));
  const custom = roles.map((r) => ({ key: r.key?.startsWith('c_') ? r.key : `c_${newId().slice(-8)}`, name: r.name, emoji: r.emoji, rank: r.rank, perms: r.perms.filter((p) => p !== 'settings' || r.rank >= 3) }));
  // Members on a role that was deleted drop back to Member.
  const keep = new Set(custom.map((r) => r.key));
  for (const old of c.customRoles ?? []) if (!keep.has(old.key)) await db.clanMembers.updateMany({ clanId: c._id, role: old.key }, { $set: { role: 'member' } });
  await db.clans.updateOne({ _id: c._id }, { $set: { customRoles: custom } });
  res.json({ customRoles: custom });
});

clansRouter.post('/clans/:id/members/:userId/kick', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  const mine = await roleIn(c, me, 'kick');
  const target = await roleIn(c, String(req.params.userId));
  if (rankOf(c, target.role) >= rankOf(c, mine.role)) throw new HttpError(403, 'You can only remove ranks below your own');
  await removeMember(c._id, target.userId);
  await notify(target.userId, { kind: 'system', title: `You were removed from ${c.name}`, body: '', link: '/clans' });
  res.json({ ok: true });
});

// ——— Treasury ———
clansRouter.post('/clans/:id/donate', requireAuth, async (req, res) => {
  const me = uid(req);
  const c = await clanOr404(req.params.id);
  await roleIn(c, me);
  const { sparks } = parse(z.object({ sparks: z.number().int().min(10).max(1_000_000) }), req.body);
  const paid = await db.users.updateOne({ _id: me, sparks: { $gte: sparks } }, { $inc: { sparks: -sparks } });
  if (!paid.modifiedCount) throw new HttpError(402, 'Not enough Sparks');
  await db.clans.updateOne({ _id: c._id }, { $inc: { treasury: sparks } });
  await db.clanMembers.updateOne({ clanId: c._id, userId: me }, { $inc: { donated: sparks } });
  void emitWallet(me);
  await logTreasury(c._id, me, sparks, 'Deposit');
  await contribute(c._id, me, { points: Math.floor(sparks / CONTRIBUTION.perDeposit), donated: sparks });
  await trackObjective(c._id, 'donate', sparks);
  await checkAchievements(c._id);
  res.json({ treasury: (c.treasury ?? 0) + sparks });
});

// ——— Clan lounge (level 4 perk) ———
clansRouter.post('/clans/:id/lounge', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c, uid(req), 'settings');
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
  await roleIn(c, me, 'wars');
  const { opponentId, stake } = parse(z.object({ opponentId: z.string().max(40), stake: z.number().int().min(0).max(CLAN_WAR.maxStake).default(0) }), req.body);
  const o = await clanOr404(opponentId);
  if (o._id === c._id) throw new HttpError(400, 'Pick another clan');
  if (!clanHas(c.rep, 'wars') || !clanHas(o.rep, 'wars')) throw new HttpError(403, `Both clans need to be level ${CLAN_WAR.minLevel}+ for Clan Wars`);
  if (await db.clanWars.findOne({ status: { $in: ['pending', 'active'] }, $or: [{ aId: { $in: [c._id, o._id] } }, { bId: { $in: [c._id, o._id] } }] }))
    throw new HttpError(409, 'One of these clans is already in a war or has a challenge waiting');
  if (stake) {
    await roleIn(c, me, 'treasury');
    const r = await db.clans.updateOne({ _id: c._id, treasury: { $gte: stake } }, { $inc: { treasury: -stake } });
    if (!r.modifiedCount) throw new HttpError(402, 'Not enough Sparks in your clan treasury');
    await logTreasury(c._id, me, -stake, `War stake vs ${o.name}`);
  }
  const w = { _id: newId(), aId: c._id, bId: o._id, stake, status: 'pending', aScore: 0, bScore: 0, createdAt: now(), by: me };
  await db.clanWars.insertOne(w);
  for (const m of await membersWith(o, 'wars'))
    await notify(m.userId, { kind: 'system', title: `⚔️ ${c.emoji} ${c.name} declared war on ${o.name}!`, body: stake ? `Stake: ${stake.toLocaleString()} ✦ from each treasury` : 'For glory (no stake)', link: `/clans/${o._id}`, action: { type: 'clan_war', id: w._id } });
  res.status(201).json({ ok: true });
});

clansRouter.post('/clan-wars/:id/:verdict', requireAuth, async (req, res) => {
  const me = uid(req);
  const w = await db.clanWars.findOne({ _id: String(req.params.id), status: 'pending' });
  if (!w) throw new HttpError(404, 'That challenge is gone');
  const bc = await clanOr404(w.bId);
  await roleIn(bc, me, 'wars');
  if (req.params.verdict !== 'accept') {
    await db.clanWars.updateOne({ _id: w._id, status: 'pending' }, { $set: { status: 'declined' } });
    if (w.stake) await db.clans.updateOne({ _id: w.aId }, { $inc: { treasury: w.stake } });
    return res.json({ ok: true });
  }
  if (w.stake) {
    await roleIn(bc, me, 'treasury');
    const r = await db.clans.updateOne({ _id: w.bId, treasury: { $gte: w.stake } }, { $inc: { treasury: -w.stake } });
    if (!r.modifiedCount) throw new HttpError(402, `Your treasury needs ${w.stake.toLocaleString()} ✦ to accept`);
    await logTreasury(w.bId, me, -w.stake, 'War stake');
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

// ——— Clan HQ: buildings bought from the treasury ———
clansRouter.post('/clans/:id/hq/:key', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c, uid(req), 'treasury');
  const b = HQ_BUILDINGS.find((x) => x.key === req.params.key);
  if (!b) throw new HttpError(404, 'No such building');
  const cur = hqLevel(c.hq, b.key);
  const next = HQ_LEVELS[cur];
  if (!next) throw new HttpError(409, `${b.name} is already fully built`);
  if (clanLevelFor(c.rep).level < next.clanLevel) throw new HttpError(403, `${b.name} level ${next.level} needs clan level ${next.clanLevel}`);
  const r = await db.clans.updateOne(
    { _id: c._id, treasury: { $gte: next.cost }, [`hq.${b.key}`]: cur ? cur : { $in: [0, null] } },
    { $inc: { treasury: -next.cost }, $set: { [`hq.${b.key}`]: next.level } },
  );
  if (!r.modifiedCount) throw new HttpError(402, `The treasury needs ${next.cost.toLocaleString()} Sparks`);
  forgetBonuses(c._id);
  await logTreasury(c._id, uid(req), -next.cost, `Upgraded ${b.name} to level ${next.level}`);
  if (b.key === 'prestige') await syncMemberBadges(c._id);
  await checkAchievements(c._id);
  res.json({ clan: clanPublic(await db.clans.findOne({ _id: c._id }), await countMembers(c._id)) });
});

// ——— Territories & the Siege ———
clansRouter.get('/clan-territories', optionalAuth, async (req, res) => {
  const s = siegeFor();
  const held = new Map((await db.territories.find({}).toArray()).map((t) => [t._id, t]));
  const entries = await db.clanSieges.find({ week: s.week }).sort({ score: -1 }).toArray();
  const ids = [...new Set([...[...held.values()].map((t) => t.clanId), ...entries.map((e) => e.clanId)])];
  const clans = new Map((await db.clans.find({ _id: { $in: ids } }, { projection: { name: 1, tag: 1, emoji: 1 } }).toArray()).map((c) => [c._id, c]));
  const mine = req.userId ? await membershipOf(req.userId) : null;
  res.json({
    siege: s,
    myClanId: mine?.clanId ?? null,
    myTarget: mine ? await siegeTarget(mine.clanId, s.week) : null,
    territories: TERRITORIES.map((t) => {
      const h = held.get(t.key);
      const hc = h && clans.get(h.clanId);
      return {
        ...t,
        holder: hc ? { id: hc._id, name: hc.name, tag: hc.tag, emoji: hc.emoji, since: h.since } : null,
        history: [...(h?.history ?? [])].reverse(),
        battles: [...(h?.battles ?? [])].reverse(),
        contenders: entries.filter((e) => e.territory === t.key).slice(0, 5).map((e) => ({ clanId: e.clanId, name: clans.get(e.clanId)?.name, tag: clans.get(e.clanId)?.tag, emoji: clans.get(e.clanId)?.emoji, score: Math.floor(e.score ?? 0), defending: h?.clanId === e.clanId })),
      };
    }),
  });
});

clansRouter.post('/clans/:id/siege', requireAuth, async (req, res) => {
  const c = await clanOr404(req.params.id);
  await roleIn(c, uid(req), 'siege');
  const { territory } = parse(z.object({ territory: z.enum(TERRITORIES.map((t) => t.key)) }), req.body);
  if (clanLevelFor(c.rep).level < SIEGE.minLevel) throw new HttpError(403, `Clans join the Siege from level ${SIEGE.minLevel}`);
  if ((c.reputation ?? 0) < SIEGE.minReputation) throw new HttpError(403, `Clans need ${SIEGE.minReputation} Reputation to join the Siege — complete quests and win wars first`);
  const s = siegeFor();
  if (s.over) throw new HttpError(409, 'This week’s Siege is over — the next one opens Monday');
  const row = await db.clanSieges.findOne({ week: s.week, clanId: c._id });
  if (row?.score > 0 && row.territory !== territory) throw new HttpError(409, 'Your clan is already fighting for another territory this Siege');
  await db.clanSieges.updateOne({ week: s.week, clanId: c._id }, { $set: { territory }, $setOnInsert: { score: 0, at: new Date().toISOString() } }, { upsert: true });
  res.json({ ok: true, territory });
});
