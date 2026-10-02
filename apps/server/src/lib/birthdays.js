import { db, newId, now, today } from '../db.js';
import { grant, notify } from './rewards.js';
import { shared } from './shared.js';
import { io, room } from './io.js';
import { bus } from './events.js';

/**
 * System birthday posts. Once a day (UTC) the worker posts a 🎂 card for everyone whose birthday it is,
 * gives them a Sparks gift and tells their followers. Friends leave wishes as comments.
 * Members can opt out with Settings → Privacy → "Celebrate my birthday".
 * Feb 29 birthdays are celebrated on Feb 28 in non-leap years.
 */
const BIRTHDAY_SPARKS = 100;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The "-MM-DD" birthdate suffixes that count as a birthday on `day` (YYYY-MM-DD). */
export function birthdaySuffixes(day) {
  const md = day.slice(4); // -MM-DD
  const year = Number(day.slice(0, 4));
  return md === '-02-28' && !isLeap(year) ? ['-02-28', '-02-29'] : [md];
}

export async function runBirthdays(day = today()) {
  // One instance, once a day (the worker lease already makes this single-instance; the flag stops re-runs).
  if (!(await shared().setNx(`birthdays:${day}`, '1', 26 * 3_600_000))) return 0;
  const year = day.slice(0, 4);
  const pattern = new RegExp(
    `(${birthdaySuffixes(day)
      .map((s) => s.replace(/-/g, '\\-'))
      .join('|')})$`,
  );
  const people = await db.users
    .find({ birthdate: pattern, deletedAt: null, 'moderation.status': { $ne: 'banned' }, 'settings.celebrateBirthday': { $ne: false } })
    .toArray();
  let posted = 0;
  for (const u of people) {
    // One birthday post per member per year: systemKey is unique, so repeated runs and other instances can't double-post.
    const systemKey = birthdayKey(u._id, year);
    const _id = newId();
    const fresh = await db.posts.insertIfMissing(
      { systemKey },
      {
        _id,
        authorId: u._id,
        kind: 'birthday',
        system: true,
        body: `🎂 It’s @${u.handle}’s birthday today! Drop your wishes below 🎉`,
        mediaUrl: null,
        tags: ['birthday'],
        dropId: null,
        soundtrack: null,
        album: null,
        inFeed: true,
        battle: null,
        r1: 0,
        r2: 0,
        r3: 0,
        r4: 0,
        r5: 0,
        commentCount: 0,
        hidden: false,
        createdAt: now(),
      },
    );
    if (!fresh) continue;
    posted++;
    bus.emitEvent('birthday:posted', { postId: _id, userId: u._id });
    if (!u.isAi) {
      await grant(u._id, BIRTHDAY_SPARKS, 50, 'Happy birthday from ChatLOL 🎂');
      await notify(u._id, {
        kind: 'system',
        title: `Happy birthday, ${u.displayName.split(' ')[0]}! 🎂`,
        body: `Here’s ${BIRTHDAY_SPARKS} Sparks on us. Your friends can leave wishes on your birthday post.`,
        link: `/p/${_id}`,
      });
    }
    const followers = await db.follows
      .find({ followeeId: u._id }, { projection: { followerId: 1 } })
      .limit(1000)
      .toArray();
    for (const f of followers) {
      await notify(f.followerId, {
        kind: 'birthday',
        actorId: u._id,
        title: `It’s ${u.displayName}’s birthday 🎂`,
        body: 'Leave them a birthday wish!',
        link: `/p/${_id}`,
      });
    }
    const { serializePost } = await import('./serialize.js');
    io()
      ?.to(room.global)
      .emit('feed:new', await serializePost(await db.posts.findOne({ _id }), null));
  }
  return posted;
}

/** The unique key of a member's birthday post for a year. */
export const birthdayKey = (userId, year) => `birthday:${userId}:${year}`;

/** Members (in good standing, opted in) whose birthday is today — for the Home page. */
export async function birthdaysToday(day = today()) {
  const pattern = new RegExp(
    `(${birthdaySuffixes(day)
      .map((s) => s.replace(/-/g, '\\-'))
      .join('|')})$`,
  );
  return db.users
    .find({ birthdate: pattern, deletedAt: null, 'moderation.status': { $ne: 'banned' }, 'settings.celebrateBirthday': { $ne: false } })
    .limit(20)
    .toArray();
}
