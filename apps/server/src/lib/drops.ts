import { db, today, type Row } from '../db';

export const DROP_PROMPTS: [string, string][] = [
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

export function dayIndex(day: string) {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

export async function ensureDrop(day = today()): Promise<Row> {
  let d = await db.one('SELECT * FROM drops WHERE id = ?', day);
  if (!d) {
    const [prompt, emoji] = DROP_PROMPTS[dayIndex(day) % DROP_PROMPTS.length];
    const starts = `${day}T00:00:00.000Z`;
    const ends = new Date(Date.parse(starts) + 86_400_000 - 1).toISOString();
    await db.run('INSERT INTO drops (id, prompt, emoji, starts_at, ends_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', day, prompt, emoji, starts, ends);
    d = (await db.one('SELECT * FROM drops WHERE id = ?', day))!;
  }
  return d;
}
