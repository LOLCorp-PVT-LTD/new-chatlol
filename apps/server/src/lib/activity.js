import { db, today } from '../db.js';
import { bumpCounter } from './rewards.js';

/**
 * Feature usage log: one counter per person, feature and day (in dailyCounters, key `feat:<name>`), so admins can
 * see who uses what and how adoption of each feature moves day to day.
 */
export const FEATURES = [
  'post', 'shout', 'comment', 'dm', 'reaction', 'forum', 'live', 'checkin', 'power', 'ticket', 'exchange', 'theme_unlock',
  'arena_create', 'arena_play', 'king', 'store_buy', 'username_change', 'referral', 'arcade', 'tournament', 'lounge', 'festival_quiz',
];
export function track(userId, feature, by = 1) {
  if (!userId) return;
  void bumpCounter(userId, `feat:${feature}`, by).catch(() => {});
}

/** Per-user totals + last used day for each feature. */
export async function userFeatureUse(userId) {
  const rows = await db.dailyCounters
    .aggregate([
      { $match: { userId, key: { $regex: '^feat:' } } },
      { $group: { _id: '$key', total: { $sum: '$n' }, last: { $max: '$day' }, days: { $sum: 1 } } },
      { $sort: { last: -1 } },
    ])
    .toArray();
  return rows.map((r) => ({ feature: r._id.slice(5), total: r.total, days: r.days, last: r.last }));
}

/** Network-wide: uses and distinct users per feature over the last `days` days, plus today's numbers. */
export async function featureTotals(days = 7) {
  const since = today(new Date(Date.now() - days * 86_400_000));
  const rows = await db.dailyCounters
    .aggregate([
      { $match: { key: { $regex: '^feat:' }, day: { $gte: since } } },
      { $group: { _id: '$key', uses: { $sum: '$n' }, users: { $addToSet: '$userId' }, today: { $sum: { $cond: [{ $eq: ['$day', today()] }, '$n', 0] } } } },
      { $project: { uses: 1, today: 1, users: { $size: '$users' } } },
      { $sort: { uses: -1 } },
    ])
    .toArray();
  return rows.map((r) => ({ feature: r._id.slice(5), uses: r.uses, users: r.users, today: r.today }));
}
