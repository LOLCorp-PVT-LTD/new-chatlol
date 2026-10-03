/**
 * YouTube link detection, so posts, shouts and chats can show a player under the text.
 * Handles youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/, m. and music. hosts, and a start time
 * (?t=90, ?t=1m30s, &start=90).
 */
const URL_RE = /(?:https?:\/\/|www\.|(?:m\.)?youtu(?:\.be|be\.com)\/)[^\s<>"]+/gi;
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function seconds(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return +t;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0) : 0;
}

/** The video in one URL, or null: { id, start, url, shorts }. */
export function youtubeLink(raw) {
  let u;
  try {
    const clean = raw.replace(/[.,!?;:'")\]]+$/, '');
    u = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  if (!id || !ID_RE.test(id)) return null;
  return { id, start: seconds(u.searchParams.get('t') ?? u.searchParams.get('start')), url: u.href, shorts: u.pathname.startsWith('/shorts/') };
}

export const isYouTubeUrl = (raw) => !!youtubeLink(raw);

/** Every distinct YouTube video in a piece of text (first `max`), in order. */
export function youtubeVideos(text, max = 3) {
  if (!text) return [];
  const out = [];
  for (const m of text.match(URL_RE) ?? []) {
    const v = youtubeLink(m);
    if (v && !out.some((o) => o.id === v.id)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** The text with its YouTube links taken out (they show as players instead). */
export function withoutVideos(text) {
  if (!text) return '';
  return text
    .replace(URL_RE, (m) => (youtubeLink(m) ? '' : m))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
