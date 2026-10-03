import { config } from '../config.js';
import { shared } from './shared.js';
import { youtubeInfo } from './songMatch.js';

/**
 * YouTube Data API v3 (YOUTUBE_API_KEY): song search for profiles, posts, shouts and the radio, plus track lengths
 * (the radio needs them to know when a song ends). Results are cached so the daily quota goes a long way:
 * a search costs 100 units of the free 10,000/day, a details lookup 1.
 */
const API = 'https://www.googleapis.com/youtube/v3';
export const youtubeEnabled = () => !!config.youtube.apiKey;

/** "PT3M42S" → 222 */
export function isoSeconds(iso) {
  const m = String(iso ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0) : 0;
}
const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&#39;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const cleanArtist = (ch) => decode(ch).replace(/\s*-\s*Topic$/, '').replace(/VEVO$/i, '').trim();

/** A track as the apps use it (same shape as a profile song). */
export const track = (id, title, artist, duration = 0) => ({
  source: 'youtube', type: 'track', id, youtubeId: id, title: decode(title).slice(0, 120), artist: cleanArtist(artist).slice(0, 120),
  artUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, duration,
});

async function get(path, params) {
  const qs = new URLSearchParams({ ...params, key: config.youtube.apiKey });
  const r = await fetch(`${API}/${path}?${qs}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) {
    console.warn(`[youtube] ${path} failed (${r.status}): ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return null;
  }
  return r.json();
}

/** Lengths and titles for up to 50 videos: { [id]: { title, channel, duration, embeddable } }. */
export async function videoDetails(ids) {
  const out = {};
  const want = [...new Set(ids)].filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id));
  const missing = [];
  for (const id of want) {
    const c = await shared().get(`ytvid:${id}`);
    if (c) out[id] = JSON.parse(c);
    else missing.push(id);
  }
  if (missing.length && youtubeEnabled()) {
    const j = await get('videos', { part: 'snippet,contentDetails,status', id: missing.slice(0, 50).join(',') });
    for (const v of j?.items ?? []) {
      const d = { title: decode(v.snippet?.title), channel: cleanArtist(v.snippet?.channelTitle), duration: isoSeconds(v.contentDetails?.duration), embeddable: v.status?.embeddable !== false };
      out[v.id] = d;
      await shared().set(`ytvid:${v.id}`, JSON.stringify(d), 7 * 86_400);
    }
  }
  return out;
}

/** Song search (music category, embeddable videos only). Null when no API key is set. */
export async function searchYouTube(q, limit = 12) {
  if (!youtubeEnabled()) return null;
  const key = `ytsearch:${q.toLowerCase()}`;
  const cached = await shared().get(key);
  if (cached) return JSON.parse(cached);
  const j = await get('search', { part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true', maxResults: String(limit), q });
  if (!j) return [];
  const items = (j.items ?? []).filter((it) => it.id?.videoId);
  const details = await videoDetails(items.map((it) => it.id.videoId));
  const tracks = items
    .map((it) => track(it.id.videoId, it.snippet?.title, it.snippet?.channelTitle, details[it.id.videoId]?.duration ?? 0))
    .filter((t) => t.duration === 0 || (t.duration >= 30 && t.duration <= 15 * 60)); // songs, not hour-long mixes
  await shared().set(key, JSON.stringify(tracks), 86_400);
  return tracks;
}

/** One video as a track (title/length from the API when set up, else from oEmbed with no length). */
export async function resolveTrack(id) {
  const d = (await videoDetails([id]))[id];
  if (d) return d.embeddable ? track(id, d.title, d.channel, d.duration) : null;
  const info = await youtubeInfo(id);
  return info ? track(id, info.title, info.author, 0) : null;
}
