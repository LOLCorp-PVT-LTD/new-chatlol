import { config } from '../config.js';
import { db, newId, now } from '../db.js';
import { areFriends } from './friends.js';
import { COMMUNITY_RULES } from '@chatlol/shared';

/**
 * LOLShield oversight of moderators. Every action by a staff member who isn't an admin is reviewed:
 *  - no_reason:  missing, too short or meaningless reason ("bad", "x", "spam")
 *  - no_evidence: a ban / suspension / mute on someone with no reports, flags or strikes in the last 30 days
 *  - targeting:  4+ actions against the same member in 24 hours
 *  - mass:       20+ punitive actions in an hour
 *  - self_dealing: Sparks / Gems / Gold / items / Premium / boosts given to themselves or a friend
 *  - unjustified: the AI judge (when NVIDIA NIM is set up) finds the reason doesn't fit the evidence
 * Each finding is an oversight strike on the moderator. 1st and 2nd: a warning; 3rd within 30 days: their staff
 * role and permissions are revoked automatically. Admins are told every time and can dismiss findings or reinstate.
 * Admins themselves are never reviewed.
 */
const WINDOW_DAYS = 30;
const REVOKE_AT = 3;
const PUNITIVE = new Set(['mute', 'suspend', 'ban', 'warn', 'content_removed', 'terminate', 'profile_edit']);
const GIFTS = new Set(['wallet', 'item', 'premium', 'boost']);
const VAGUE = /^(?:bad|no|x+|spam|idk|because|reasons?|test|rule|rules|violation|tos|lol|bye|banned?|muted?|\.|-)$/i;

export async function reviewStaffAction({ staffId, kind, targetId = null, reason = '', meta = {} }) {
  try {
    if (!staffId || staffId === 'ai') return;
    const staff = await db.users.findOne({ _id: staffId }, { projection: { role: 1, perms: 1, handle: 1 } });
    if (!staff || staff.role === 'admin') return; // admins are never reviewed
    const findings = [];
    const r = String(reason ?? '').trim();
    if (PUNITIVE.has(kind) && (r.length < 8 || VAGUE.test(r.replace(/[^\w\s]/g, '').trim())))
      findings.push(['no_reason', `“${kind}” with ${r ? `a meaningless reason (“${r}”)` : 'no reason'}`]);
    if (targetId && ['ban', 'suspend', 'mute'].includes(kind)) {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const evidence =
        (await db.reports.countDocuments({ $or: [{ targetId }, { targetUserId: targetId }], createdAt: { $gt: since } })) +
        (await db.modFlags.countDocuments({ userId: targetId, createdAt: { $gt: since } })) +
        (await db.modEvents.countDocuments({ userId: targetId, kind: 'strike', createdAt: { $gt: since } }));
      if (!evidence) findings.push(['no_evidence', `${kind} on a member with no reports, flags or strikes`]);
    }
    if (targetId && PUNITIVE.has(kind)) {
      const day = new Date(Date.now() - 86_400_000).toISOString();
      const n = await db.modEvents.countDocuments({ userId: targetId, byUserId: staffId, kind: { $in: [...PUNITIVE] }, createdAt: { $gt: day } });
      if (n >= 4) findings.push(['targeting', `${n} actions against the same member in 24 hours`]);
    }
    if (PUNITIVE.has(kind)) {
      const hour = new Date(Date.now() - 3_600_000).toISOString();
      const n = await db.modEvents.countDocuments({ byUserId: staffId, kind: { $in: [...PUNITIVE] }, createdAt: { $gt: hour } });
      if (n === 20) findings.push(['mass', '20 punitive actions in an hour']);
    }
    if (targetId && GIFTS.has(kind) && (meta.positive ?? true)) {
      if (targetId === staffId) findings.push(['self_dealing', `gave themselves ${kind}`]);
      else if (await areFriends(staffId, targetId)) findings.push(['self_dealing', `gave a friend ${kind}`]);
    }
    if (!findings.length && targetId && ['ban', 'suspend', 'mute', 'content_removed'].includes(kind)) {
      const j = await judge(staff, kind, targetId, r);
      if (j && j.verdict === 'abuse') findings.push(['unjustified', j.reason || 'reason doesn’t fit the evidence']);
    }
    for (const [code, detail] of findings) await oversightStrike(staff, code, detail, { kind, targetId, reason: r });
  } catch (e) {
    console.warn('[lolshield oversight]', e.message);
  }
}

async function oversightStrike(staff, code, detail, action) {
  await db.modEvents.insertOne({ _id: newId(), userId: staff._id, kind: 'mod_violation', category: code, reason: detail, ref: action, byUserId: 'ai', createdAt: now() });
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const count = await db.modEvents.countDocuments({ userId: staff._id, kind: 'mod_violation', cleared: { $ne: true }, createdAt: { $gt: since } });
  const { notify } = await import('./rewards.js');
  const admins = await db.users.find({ role: 'admin', deletedAt: null }, { projection: { _id: 1 } }).toArray();
  if (count >= REVOKE_AT && staff.role !== 'user') {
    await db.users.updateOne({ _id: staff._id }, { $set: { role: 'user', perms: [], staffRevokedAt: now(), staffRevokedFrom: { role: staff.role, perms: staff.perms ?? [] } } });
    await db.modEvents.insertOne({ _id: newId(), userId: staff._id, kind: 'staff_revoked', reason: `LOLShield removed staff powers after ${count} oversight findings in ${WINDOW_DAYS} days`, byUserId: 'ai', createdAt: now() });
    await notify(staff._id, { kind: 'system', title: 'Your moderator powers were removed', body: `LOLShield found ${count} problems with how they were used (latest: ${detail}). An admin can review this.`, link: '/guidelines' });
    for (const a of admins) await notify(a._id, { kind: 'system', title: `🛡️ LOLShield revoked @${staff.handle}’s staff role`, body: `${count} findings in ${WINDOW_DAYS} days. Latest: ${detail}`, link: '/admin/oversight' });
  } else {
    await notify(staff._id, { kind: 'system', title: `⚠️ LOLShield oversight warning (${count}/${REVOKE_AT})`, body: `${detail}. Always give a clear reason that matches the Guidelines. At ${REVOKE_AT} your staff role is removed.`, link: '/guidelines' });
    for (const a of admins) await notify(a._id, { kind: 'system', title: `🛡️ Oversight finding for @${staff.handle}`, body: detail, link: '/admin/oversight' });
  }
}

/** Optional LLM check: does the moderator's reason fit the member's recent content and reports? */
async function judge(staff, kind, targetId, reason) {
  if (!config.nim.apiKey) return null;
  const { nimChat } = await import('../ai/nim.js');
  const [msgs, reports] = await Promise.all([
    db.messages.find({ authorId: targetId }).sort({ createdAt: -1 }).limit(15).toArray(),
    db.reports.find({ $or: [{ targetId }, { targetUserId: targetId }] }).sort({ createdAt: -1 }).limit(10).toArray(),
  ]);
  const shouts = await db.shouts.find({ authorId: targetId }).sort({ createdAt: -1 }).limit(10).toArray();
  const evidence = [
    ...reports.map((r) => `REPORT: ${r.reason}`),
    ...shouts.map((s) => `SHOUT: ${s.removedOriginal?.body ?? s.body}`),
    ...msgs.map((m) => `MESSAGE: ${m.body}`),
  ].join('\n').slice(0, 5000);
  const rules = COMMUNITY_RULES.map((r) => `- ${r.title}: ${r.summary}`).join('\n');
  const out = await nimChat(
    [
      { role: 'system', content: `You are LOLShield, auditing moderators of an adult social app. Rules:\n${rules}\nA moderator took action "${kind}" with reason "${reason}". Using the member's recent content and reports, decide if the action is justified. Only say "abuse" when the evidence clearly does not support it. Reply ONLY JSON: {"verdict":"justified|unclear|abuse","reason":"short"}` },
      { role: 'user', content: evidence || '(no recent content or reports)' },
    ],
    { model: config.nim.chatModel, maxTokens: 80, temperature: 0, retries: 1 },
  ).catch(() => null);
  try {
    return JSON.parse(out?.match(/\{[\s\S]*\}/)?.[0] ?? 'null');
  } catch {
    return null;
  }
}

/** Admin: clear a finding, or give back the role LOLShield removed. */
export async function dismissFinding(id) {
  await db.modEvents.updateOne({ _id: id, kind: 'mod_violation' }, { $set: { cleared: true } });
}
export async function reinstateStaff(userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { staffRevokedFrom: 1 } });
  if (!u?.staffRevokedFrom) return false;
  await db.users.updateOne({ _id: userId }, { $set: { role: u.staffRevokedFrom.role, perms: u.staffRevokedFrom.perms }, $unset: { staffRevokedFrom: '', staffRevokedAt: '' } });
  await db.modEvents.updateMany({ userId, kind: 'mod_violation', cleared: { $ne: true } }, { $set: { cleared: true } });
  return true;
}
