import { activeFestival, festivalByKey, festivalTrivia, upcomingFestivals } from '@chatlol/shared';
import { db, newId, now } from '../db.js';

/**
 * Festival seasons, server side: which festival is on (staff can switch individual festivals off in the admin
 * panel), and the seasonal lounge that opens for it.
 */
let cache = { at: 0, disabled: [] };
export async function festivalSettings() {
  if (Date.now() - cache.at > 60_000) {
    const doc = await db.settings.findOne({ _id: 'festivals' });
    cache = { at: Date.now(), disabled: doc?.disabled ?? [] };
  }
  return cache;
}
export async function setFestivalDisabled(disabled) {
  await db.settings.updateOne({ _id: 'festivals' }, { $set: { disabled } }, { upsert: true });
  cache = { at: 0, disabled: [] };
}

/** The festival running now (or at `at`), honouring staff switches. */
export async function currentFestival(at = Date.now()) {
  return activeFestival(at, (await festivalSettings()).disabled);
}
export async function festivalCalendar(n = 10) {
  const { disabled } = await festivalSettings();
  return upcomingFestivals(Date.now(), n).map((f) => ({ ...f, enabled: !disabled.includes(f.key) }));
}

/** Opens the festival's seasonal lounge if it isn't open yet; it closes itself when the festival ends. */
export async function ensureFestivalLounge(f) {
  if (!f) return null;
  const existing = await db.lounges.findOne({ festival: f.key, expiresAt: { $gt: now() } });
  if (existing) return existing;
  const def = festivalByKey(f.key);
  const [emoji, name, topic, nowPlaying] = def.lounge;
  const doc = {
    _id: newId(), slug: `${f.key}-${f.day.slice(0, 4)}`, name, emoji, topic, nowPlaying,
    coverUrl: `https://picsum.photos/seed/${f.key}-festival/800/500`,
    ownerId: null, festival: f.key, expiresAt: f.endsAt, position: -1, createdAt: now(), radio: true,
  };
  try {
    await db.lounges.insertOne(doc);
  } catch {
    return db.lounges.findOne({ festival: f.key, expiresAt: { $gt: now() } }); // another server got there first
  }
  return doc;
}

/** Today's 5-question festival quiz (same for everyone today). Answers stay on the server. */
export function festivalQuiz(key, day) {
  const qs = festivalTrivia(key);
  if (!qs.length) return [];
  const seed = [...`${key}:${day}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = [...qs].sort((a, b) => hash(a[1] + seed) - hash(b[1] + seed)).slice(0, 5);
  return pick.map(([, q, right, ...wrong]) => {
    const choices = [right, ...wrong].sort((a, b) => hash(a + seed) - hash(b + seed));
    return { q, choices, answer: choices.indexOf(right) };
  });
}
const hash = (s) => [...String(s)].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
