import { festivalDrop } from '@chatlol/shared';
import { db, today } from '../db.js';
import { currentFestival } from './festivals.js';

export const DROP_PROMPTS = [
  ['Your Late-Night Creative Space or Desk Setup', '🖥️'],
  ['Golden Hour Fit Check', '🌇'],
  ['What You Are Eating Right Now', '🍜'],
  ['The View From Where You Are', '🏙️'],
  ['Your Pet Being Iconic', '🐶'],
  ['Shoe Rotation', '👟'],
  ['Coffee (or Matcha) Order Aesthetic', '🧋'],
  ['Something That Made You Laugh Today', '😂'],
  ['Your Current Read or Playlist', '🎧'],
  ['Sky Right Now — No Filter', '🌤️'],
  ['Weekend Plans in One Photo', '🎟️'],
  ['Your Comfort Corner', '🛋️'],
  ['Thrift Find of the Week', '🧥'],
  ['Mirror Selfie, Main Character Energy', '🪞'],
];

export function dayIndex(day) {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

export async function ensureDrop(day = today()) {
  let d = await db.drops.findOne({ day });
  if (!d) {
    // During a festival the drop is themed for it.
    const fest = await currentFestival(Date.parse(`${day}T12:00:00Z`));
    const [prompt, emoji] = (fest && festivalDrop(fest.key, dayIndex(day))) ?? DROP_PROMPTS[dayIndex(day) % DROP_PROMPTS.length];
    const startsAt = `${day}T00:00:00.000Z`;
    const endsAt = new Date(Date.parse(startsAt) + 86_400_000 - 1).toISOString();
    await db.drops.insertIfMissing({ day }, { prompt, emoji, startsAt, endsAt, festival: fest?.key ?? null });
    d = await db.drops.findOne({ day });
  }
  return d;
}
