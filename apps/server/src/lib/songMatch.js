import { config } from '../config.js';
import { db } from '../db.js';
import { shared } from './shared.js';

/**
 * Full-length profile songs via YouTube. Spotify only plays whole tracks to visitors signed in to Spotify (everyone
 * else gets a 30-second preview), and Apple links are previews too, so profile songs play from a matching YouTube
 * upload when there is one: a link the member pasted, or one found here with the YouTube Data API (YOUTUBE_API_KEY).
 */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Title, channel and thumbnail for a YouTube video, without an API key (oEmbed). */
export async function youtubeInfo(videoId) {
  if (!ID_RE.test(videoId)) return null;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { title: String(j.title ?? '').slice(0, 120), author: String(j.author_name ?? '').replace(/\s*-\s*Topic$/, '').slice(0, 120) };
  } catch {
    return null;
  }
}

/** Best YouTube upload for "artist – title" (prefers official audio / Topic uploads), or null. Cached for 30 days. */
export async function findYouTube(title, artist) {
  if (!config.youtube.apiKey || !title) return null;
  const key = `ytmatch:${artist}|${title}`.toLowerCase().slice(0, 200);
  const cached = await shared().get(key);
  if (cached) return cached === '-' ? null : cached;
  let id = null;
  try {
    const q = `${artist} ${title} official audio`.trim();
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=5&q=${encodeURIComponent(q)}&key=${config.youtube.apiKey}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (r.ok) {
      const items = (await r.json()).items ?? [];
      const a = artist.toLowerCase();
      const score = (it) => {
        const ch = String(it.snippet?.channelTitle ?? '').toLowerCase();
        const t = String(it.snippet?.title ?? '').toLowerCase();
        return (ch.includes(a) || ch.endsWith(' - topic') ? 3 : 0) + (t.includes(title.toLowerCase()) ? 2 : 0) + (/official (audio|video)|lyric/.test(t) ? 1 : 0) - (/live|cover|remix|sped up|slowed|karaoke/.test(t) ? 2 : 0);
      };
      const best = [...items].sort((x, y) => score(y) - score(x))[0];
      id = best?.id?.videoId && ID_RE.test(best.id.videoId) ? best.id.videoId : null;
    } else console.warn(`[youtube] search failed (${r.status})`);
  } catch (e) {
    console.warn('[youtube] search failed', e.message);
  }
  await shared().set(key, id ?? '-', 30 * 86_400);
  return id;
}

/** After a Spotify / Apple song is saved: look for the full song on YouTube and attach it (in the background). */
export function attachFullSong(userId, song) {
  if (!song || song.source === 'youtube' || song.youtubeId || !config.youtube.apiKey) return;
  void (async () => {
    const id = await findYouTube(song.title, song.artist);
    if (id) await db.users.updateOne({ _id: userId, 'profile.song.id': song.id }, { $set: { 'profile.song.youtubeId': id } });
  })().catch(() => {});
}
