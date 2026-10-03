import {
  DEFAULT_LEVEL_GATES,
  INACTIVITY_RESET_DAYS,
  INACTIVITY_WARN_DAYS,
  LEVEL_GATES,
  checkInReward,
  LOGIN_STREAK_MILESTONES,
  gemPriceFor,
  hasPower,
  isStaff,
  levelForXp,
  levelGate,
  powerByKey,
  statusFor,
} from '@chatlol/shared';
import { db, now, today } from '../db.js';
import { HttpError } from './http.js';
import { itemIdFor } from './ids.js';
import { shared } from './shared.js';
import { grant, notify, emitWallet } from './rewards.js';
import { track } from './activity.js';

const DAY = 86_400_000;

// ——— Level gates (admin-adjustable) ———
let gatesCache = null;
let gatesAt = 0;
export async function getLevelGates() {
  if (gatesCache && Date.now() - gatesAt < 30_000) return gatesCache;
  const doc = await db.settings.findOne({ _id: 'levelGates' });
  gatesCache = { ...DEFAULT_LEVEL_GATES, ...(doc?.values ?? {}) };
  gatesAt = Date.now();
  return gatesCache;
}
export async function setLevelGates(values) {
  const clean = Object.fromEntries(
    LEVEL_GATES.filter((g) => Number.isInteger(values[g.key])).map((g) => [g.key, Math.min(100, Math.max(1, values[g.key]))]),
  );
  await db.settings.updateOne({ _id: 'levelGates' }, { $set: { values: { ...(await getLevelGates()), ...clean } } }, { upsert: true });
  gatesCache = null;
  return getLevelGates();
}

/** Throws 403 `level_required` unless the user meets the gate. Staff and All-Access Pass holders always pass. */
export async function assertLevel(userId, key) {
  const u = await db.users.findOne({ _id: userId }, { projection: { xp: 1, role: 1, perms: 1, powers: 1 } });
  if (!u || isStaff(u) || hasPower(u, 'gate_pass')) return;
  const need = (await getLevelGates())[key] ?? 1;
  const lvl = levelForXp(u.xp ?? 0);
  if (lvl >= need) return;
  const label = levelGate(key)?.label ?? 'do that';
  throw new HttpError(
    403,
    `Reach level ${need} to ${label.charAt(0).toLowerCase()}${label.slice(1)} (you're level ${lvl}). An All-Access Pass skips this.`,
    'level_required',
  );
}

// ——— Power-ups ———
/** Activates one power-up from the user's inventory. Returns the user's running powers. */
export async function usePower(userId, key) {
  const p = powerByKey(key);
  if (!p) throw new HttpError(404, 'That isn’t a power-up');
  if (p.auto) throw new HttpError(400, `${p.name} works on its own when you need it`, 'power_auto');
  const used = await db.inventory.updateOne({ userId, itemId: itemIdFor(key), qty: { $gt: 0 } }, { $inc: { qty: -1 } });
  if (!used.modifiedCount) throw new HttpError(402, `You don’t have a ${p.name}. Grab one in the Vault.`, 'power_missing');
  const u = await db.users.findOne({ _id: userId }, { projection: { powers: 1, boost: 1 } });
  const from = Math.max(Date.now(), Date.parse(u?.powers?.[key] ?? 0) || 0);
  const until = new Date(from + p.minutes * 60_000).toISOString();
  const set = { [`powers.${key}`]: until };
  if (key === 'spotlight') {
    const boostFrom = Math.max(Date.now(), Date.parse(u?.boost?.until ?? 0) || 0);
    set.boost = { until: new Date(boostFrom + p.minutes * 60_000).toISOString(), by: userId };
  }
  await db.users.updateOne({ _id: userId }, { $set: set });
  return { key, until };
}

/** Uses up one auto power-up (Comeback Shield, Hot Take Insurance) if the user has one. */
export async function consumeAutoPower(userId, key) {
  const r = await db.inventory.updateOne({ userId, itemId: itemIdFor(key), qty: { $gt: 0 } }, { $inc: { qty: -1 } });
  return r.modifiedCount > 0;
}

// ——— Daily check-in ———
/** First visit of the day: extends the login streak and pays a bonus that grows with it. */
export async function dailyCheckIn(userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { lastDailyClaim: 1, loginStreak: 1, xp: 1 } });
  const t = today();
  if (!u || u.lastDailyClaim === t) return null;
  const streak = u.lastDailyClaim === today(new Date(Date.now() - DAY)) ? (u.loginStreak ?? 0) + 1 : 1;
  // The conditional update keeps this race-safe across tabs and instances.
  const claimed = await db.users.updateOne(
    { _id: userId, lastDailyClaim: { $ne: t } },
    { $set: { lastDailyClaim: t, loginStreak: streak, inactivityWarned: [], inactivityWarnedAt: null } },
  );
  if (!claimed.modifiedCount) return null;
  const base = checkInReward(streak);
  // Higher status ranks earn a bigger check-in bonus.
  const rank = statusFor(levelForXp(u.xp ?? 0));
  const r = { sparks: Math.round(base.sparks * rank.checkInBoost), xp: Math.round(base.xp * rank.checkInBoost) };
  const reward = await grant(userId, r.sparks, r.xp, `Day ${streak} check-in ☀️${rank.checkInBoost > 1 ? ` (${rank.emoji} ${rank.label} ×${rank.checkInBoost})` : ''}`);
  reward.loginStreak = streak;
  track(userId, 'checkin');
  if (LOGIN_STREAK_MILESTONES.includes(streak)) {
    await db.users.updateOne({ _id: userId }, { $addToSet: { badges: `login_${streak}` } });
    await grant(userId, streak * 10, streak * 5, `${streak}-day check-in streak! 🔥`);
  }
  return reward;
}

// ——— Inactivity reset ———
/** Items that were paid for with earned Sparks (or won from Sparks crates). Gem and staff-given items are kept. */
function isEarnedItem(row, item) {
  if (row.via) return row.via === 'sparks' || row.via === 'crate';
  return gemPriceFor(item.kind, item.price) === null; // older rows: only Sparks-only kinds are certainly earned
}

/** Resets one user's earned progress. Gems, Gem-bought items and Premium are kept. */
export async function resetProgress(userId) {
  const rows = await db.inventory.find({ userId, qty: { $gt: 0 } }).toArray();
  const items = new Map((await db.storeItems.find({ _id: { $in: rows.map((r) => r.itemId) } }).toArray()).map((i) => [i._id, i]));
  const gone = rows.filter((r) => items.get(r.itemId) && isEarnedItem(r, items.get(r.itemId)));
  if (gone.length) await db.inventory.deleteMany({ _id: { $in: gone.map((r) => r._id) } });
  const goneKeys = new Set(gone.map((r) => items.get(r.itemId).key));
  const u = await db.users.findOne({ _id: userId }, { projection: { cosmetics: 1 } });
  const unequip = Object.entries(u?.cosmetics ?? {})
    .filter(([, k]) => goneKeys.has(k))
    .map(([slot]) => [`cosmetics.${slot}`, null]);
  await db.users.updateOne(
    { _id: userId },
    {
      $set: {
        xp: 0,
        sparks: 0,
        streakDays: 0,
        lastDropDay: null,
        loginStreak: 0,
        powers: {},
        progressResetAt: now(),
        inactivityWarned: [],
        inactivityWarnedAt: null,
        ...Object.fromEntries(unequip),
      },
    },
  );
  return { itemsRemoved: gone.length };
}

/** Hourly: warns people who've been away, then resets anyone gone INACTIVITY_RESET_DAYS (unless a shield saves them). */
export async function runInactivity({ force = false } = {}) {
  if (!force && !(await shared().setNx('job:inactivity', '1', 3_600_000))) return { warned: 0, reset: 0, shielded: 0 };
  const firstWarn = Math.min(...INACTIVITY_WARN_DAYS);
  const cutoff = (days) => new Date(Date.now() - days * DAY).toISOString();
  const out = { warned: 0, reset: 0, shielded: 0 };
  const cursor = db.users.find(
    {
      isAi: { $ne: true },
      deletedAt: null,
      lastSeenAt: { $lt: cutoff(firstWarn) },
      // Already reset since their last visit: nothing left to do.
      $expr: { $or: [{ $not: ['$progressResetAt'] }, { $lt: ['$progressResetAt', '$lastSeenAt'] }] },
      $or: [{ wipeGraceUntil: null }, { wipeGraceUntil: { $lt: now() } }],
    },
    { projection: { lastSeenAt: 1, inactivityWarned: 1, inactivityWarnedAt: 1, xp: 1, sparks: 1 } },
  );
  for await (const u of cursor.limit(2000)) {
    const away = Math.floor((Date.now() - Date.parse(u.lastSeenAt)) / DAY);
    // Nobody is reset without a warning at least ~a day before (covers people already away when this shipped).
    const warnedLongEnough = u.inactivityWarnedAt && Date.now() - Date.parse(u.inactivityWarnedAt) >= 20 * 3_600_000;
    if (away >= INACTIVITY_RESET_DAYS && !u.xp && !u.sparks) {
      await db.users.updateOne({ _id: u._id }, { $set: { progressResetAt: now() } });
    } else if (away >= INACTIVITY_RESET_DAYS && !warnedLongEnough) {
      if (u.inactivityWarned?.includes('final')) continue;
      await db.users.updateOne({ _id: u._id }, { $addToSet: { inactivityWarned: 'final' }, $set: { inactivityWarnedAt: now() } });
      await notify(u._id, {
        kind: 'system',
        title: 'Your progress resets in 24 hours ⏳',
        body: 'Check in to keep your level, Sparks and items.',
        link: '/',
      });
      out.warned++;
    } else if (away >= INACTIVITY_RESET_DAYS) {
      if (await consumeAutoPower(u._id, 'wipe_shield')) {
        // Fresh grace period, and a fresh warning before it runs out.
        await db.users.updateOne(
          { _id: u._id },
          {
            $set: {
              wipeGraceUntil: new Date(Date.now() + INACTIVITY_RESET_DAYS * DAY).toISOString(),
              inactivityWarned: [],
              inactivityWarnedAt: null,
            },
          },
        );
        await notify(u._id, {
          kind: 'system',
          title: 'Your Comeback Shield saved you 🛡️',
          body: `Your level and Sparks are safe — for ${INACTIVITY_RESET_DAYS} more days. Pop in to keep them!`,
          link: '/',
        });
        out.shielded++;
        continue;
      }
      await resetProgress(u._id);
      await notify(u._id, {
        kind: 'system',
        title: 'Your progress was reset 💤',
        body: `You were away ${INACTIVITY_RESET_DAYS} days, so your level, Sparks and Spark items reset. Gems, Gem items and Premium are safe.`,
        link: '/',
      });
      await emitWallet(u._id);
      out.reset++;
    } else {
      const day = [...INACTIVITY_WARN_DAYS].reverse().find((d) => away >= d);
      if (!day || (u.inactivityWarned ?? []).includes(day)) continue;
      const left = INACTIVITY_RESET_DAYS - day;
      await db.users.updateOne({ _id: u._id }, { $addToSet: { inactivityWarned: day }, $set: { inactivityWarnedAt: now() } });
      await notify(u._id, {
        kind: 'system',
        title: `${left} day${left === 1 ? '' : 's'} until your progress resets ⏳`,
        body: 'Check in to keep your level, Sparks and items.',
        link: '/',
      });
      out.warned++;
    }
  }
  return out;
}
