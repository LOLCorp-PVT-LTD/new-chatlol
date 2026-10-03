import { warMissions, warModeFor } from '@chatlol/shared';
import { db } from '../db.js';

/**
 * Live Clan War tracking: every reward a member earns during a war feeds their side's fronts (Clan XP, social actions,
 * game wins, who took part), completes war missions, claims Bounty / Chaos races and moves the King of the Hill lead.
 * Scoring itself is shared (warScore) so the page and the result always agree.
 */
export async function warTrack(clanId, userId, { xp = 0, social = 0, wins = 0 }) {
  const w = await db.clanWars.findOne({ status: 'active', $or: [{ aId: clanId }, { bId: clanId }] });
  if (!w) return;
  const side = w.aId === clanId ? 'a' : 'b';
  const inc = { [`${side}.xp`]: xp, [`${side}.social`]: social, [`${side}.wins`]: wins, [side === 'a' ? 'aScore' : 'bScore']: xp };
  const after = await db.clanWars.findOneAndUpdate(
    { _id: w._id, status: 'active' },
    { $inc: Object.fromEntries(Object.entries(inc).filter(([, v]) => v)), $addToSet: { [`${side}.users`]: userId } },
    { returnDocument: 'after' },
  );
  if (!after) return;
  const s = after[side] ?? {};
  const active = (s.users ?? []).length;
  const set = { [`${side}.active`]: active };
  const value = (kind) => (kind === 'active' ? active : s[kind] ?? 0);

  // War missions (each side its own).
  const done = new Set(s.done ?? []);
  const fresh = warMissions(after.hours ?? 48).filter((m) => !done.has(m.kind) && value(m.kind) >= m.target);
  const upd = { $set: set };
  if (fresh.length) {
    upd.$push = { [`${side}.done`]: { $each: fresh.map((m) => m.kind) } };
    upd.$inc = { [`${side}.missions`]: fresh.length };
  }
  await db.clanWars.updateOne({ _id: w._id }, upd);

  // Races (Bounty / Chaos): progress counts from when the challenge dropped; first to the target claims it.
  const mode = warModeFor(after.mode);
  if (mode.race) {
    const elapsed = Date.now() - Date.parse(after.startsAt);
    for (const r of after.races ?? []) {
      if (r.claimedBy || r.at > elapsed) continue;
      const add = r.kind === 'xp' ? xp : r.kind === 'social' ? social : r.kind === 'wins' ? wins : 0;
      let progress;
      if (r.kind === 'active') {
        await db.clanWars.updateOne({ _id: w._id }, { $addToSet: { [`races.${r.id}.${side}Users`]: userId } });
        progress = new Set([...(r[`${side}Users`] ?? []), userId]).size;
        await db.clanWars.updateOne({ _id: w._id }, { $set: { [`races.${r.id}.${side}`]: progress } });
      } else {
        if (!add) continue;
        progress = (r[side] ?? 0) + add;
        await db.clanWars.updateOne({ _id: w._id }, { $inc: { [`races.${r.id}.${side}`]: add } });
      }
      if (progress >= r.target) await db.clanWars.updateOne({ _id: w._id, [`races.${r.id}.claimedBy`]: null }, { $set: { [`races.${r.id}.claimedBy`]: side, [`races.${r.id}.claimedAt`]: Date.now() } });
    }
  }

  // King of the Hill: bank the time the old leader held the top when the lead changes.
  if (mode.koth) {
    const ax = after.a?.xp ?? 0;
    const bx = after.b?.xp ?? 0;
    const lead = ax === bx ? after.koth?.lead ?? null : ax > bx ? 'a' : 'b';
    const k = after.koth ?? {};
    if (lead !== (k.lead ?? null)) {
      const t = Date.now();
      const held = k.lead && k.since ? t - k.since : 0;
      await db.clanWars.updateOne({ _id: w._id }, { $set: { 'koth.lead': lead, 'koth.since': t }, ...(k.lead ? { $inc: { [`koth.${k.lead}`]: held } } : {}) });
    }
  }
}
