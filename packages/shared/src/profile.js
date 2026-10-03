// ——— Profiles, shouts, moderation: constants shared by server, web and native ———

export const GENDERS = [
  { key: 'male', label: 'Male', emoji: '♂️' },
  { key: 'female', label: 'Female', emoji: '♀️' },
];

/** Interests offered at sign-up, on profiles and in member search, grouped for pickers. */
/** Most interests a profile can list (registration and profile edits). */
export const MAX_INTERESTS = 20;

export const INTEREST_GROUPS = [
  { label: 'Creative', items: ['photography', 'filmcamera', 'art', 'drawing', 'design', 'writing', 'poetry', 'diy', 'tattoos', 'makeup'] },
  { label: 'Music', items: ['music', 'lofi', 'hiphop', 'rnb', 'pop', 'kpop', 'rock', 'edm', 'jazz', 'producing', 'vinyl', 'concerts'] },
  { label: 'Style', items: ['fashion', 'thrifted', 'streetwear', 'sneakers', 'vintage', 'skincare', 'nails'] },
  { label: 'Play', items: ['gaming', 'esports', 'anime', 'manga', 'boardgames', 'cosplay', 'memes'] },
  { label: 'Screen', items: ['movies', 'tvshows', 'netflix', 'horror', 'comedy', 'podcasts', 'youtube'] },
  {
    label: 'Active',
    items: [
      'fitness',
      'gym',
      'running',
      'yoga',
      'skate',
      'surf',
      'snowboard',
      'hiking',
      'football',
      'basketball',
      'soccer',
      'cricket',
      'f1',
    ],
  },
  { label: 'Food', items: ['food', 'coffee', 'matcha', 'baking', 'cooking', 'vegan', 'streetfood'] },
  {
    label: 'Life',
    items: ['travel', 'roadtrips', 'books', 'pets', 'cats', 'dogs', 'plants', 'astrology', 'spirituality', 'nightlife', 'festivals'],
  },
  { label: 'Brain', items: ['tech', 'coding', 'ai', 'crypto', 'startups', 'science', 'space', 'history', 'languages', 'cars'] },
];
export const INTERESTS = INTEREST_GROUPS.flatMap((g) => g.items);

/** Profile page backgrounds. `css` is a CSS background; `colors` are the stops for React Native gradients. */
export const PROFILE_BACKGROUNDS = [
  {
    key: 'sunset',
    label: 'Golden Hour',
    css: 'linear-gradient(135deg,#ff5e00 0%,#ff8c42 45%,#ffd166 100%)',
    colors: ['#ff5e00', '#ff8c42', '#ffd166'],
    dark: true,
  },
  {
    key: 'peach',
    label: 'Peach Fizz',
    css: 'linear-gradient(135deg,#ffdbce 0%,#ffd9dc 50%,#fff1e0 100%)',
    colors: ['#ffdbce', '#ffd9dc', '#fff1e0'],
    dark: false,
  },
  {
    key: 'ocean',
    label: 'Ocean Drift',
    css: 'linear-gradient(135deg,#0f4c81 0%,#1fa2ff 55%,#a6ffcb 100%)',
    colors: ['#0f4c81', '#1fa2ff', '#a6ffcb'],
    dark: true,
  },
  {
    key: 'aurora',
    label: 'Aurora',
    css: 'linear-gradient(135deg,#1d2b64 0%,#5f2c82 45%,#49a09d 100%)',
    colors: ['#1d2b64', '#5f2c82', '#49a09d'],
    dark: true,
  },
  {
    key: 'midnight',
    label: 'Midnight',
    css: 'linear-gradient(160deg,#0f0c29 0%,#302b63 55%,#24243e 100%)',
    colors: ['#0f0c29', '#302b63', '#24243e'],
    dark: true,
  },
  {
    key: 'neon',
    label: 'Neon Night',
    css: 'linear-gradient(135deg,#ff0080 0%,#7928ca 55%,#2afadf 100%)',
    colors: ['#ff0080', '#7928ca', '#2afadf'],
    dark: true,
  },
  {
    key: 'forest',
    label: 'Forest Walk',
    css: 'linear-gradient(135deg,#134e5e 0%,#3a7d44 50%,#c6e377 100%)',
    colors: ['#134e5e', '#3a7d44', '#c6e377'],
    dark: true,
  },
  {
    key: 'candy',
    label: 'Cotton Candy',
    css: 'linear-gradient(135deg,#fbc2eb 0%,#a6c1ee 100%)',
    colors: ['#fbc2eb', '#a6c1ee'],
    dark: false,
  },
  {
    key: 'lava',
    label: 'Lava Lamp',
    css: 'linear-gradient(135deg,#8e0e00 0%,#e52d27 50%,#ffb347 100%)',
    colors: ['#8e0e00', '#e52d27', '#ffb347'],
    dark: true,
  },
  { key: 'mono', label: 'Studio Mono', css: 'linear-gradient(135deg,#232526 0%,#414345 100%)', colors: ['#232526', '#414345'], dark: true },
  {
    key: 'sand',
    label: 'Desert Sand',
    css: 'linear-gradient(135deg,#e6dada 0%,#c9a77c 100%)',
    colors: ['#e6dada', '#c9a77c'],
    dark: false,
  },
  { key: 'mint', label: 'Mint Chip', css: 'linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)', colors: ['#d4fc79', '#96e6a1'], dark: false },
];
export const profileBackground = (key) => PROFILE_BACKGROUNDS.find((b) => b.key === key) ?? PROFILE_BACKGROUNDS[0];

/** Accent colours members can pick for their profile (buttons, rings, highlights). */
export const PROFILE_ACCENTS = [
  '#ff5e00',
  '#e11d48',
  '#db2777',
  '#9333ea',
  '#4f46e5',
  '#0284c7',
  '#0d9488',
  '#16a34a',
  '#ca8a04',
  '#334155',
];

/** Moods on the Global Shoutbox (matches the design's "Vibe Mood" picker). */
export const SHOUT_MOODS = [
  { key: 'hyped', label: 'Hyped', emoji: '🔥' },
  { key: 'flex', label: 'Flex', emoji: '👑' },
  { key: 'listening', label: 'Listening To', emoji: '🎧' },
  { key: 'out', label: 'Skate/Out', emoji: '🛹' },
  { key: 'question', label: 'Question', emoji: '💬' },
  { key: 'chill', label: 'Chill', emoji: '🌙' },
];
export const SHOUT_COOLDOWN_SEC = 45;
export const SHOUT_MAX = 140;

/** Wall notes (guest book) moods on profiles. */
export const WALL_MOODS = [
  { key: 'hyped', label: 'Hyped', emoji: '🔥' },
  { key: 'drippy', label: 'Drippy', emoji: '✨' },
  { key: 'check', label: 'Vibe Check', emoji: '⚡' },
  { key: 'love', label: 'Love This', emoji: '🧡' },
];

/** Accepts a Spotify URL, URI or bare id. Returns { type, id } for tracks, albums, playlists, artists and episodes. */
export function parseSpotify(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m =
    s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode)\/([A-Za-z0-9]{22})/) ??
    s.match(/^spotify:(track|album|playlist|artist|episode):([A-Za-z0-9]{22})$/);
  if (m) return { type: m[1], id: m[2] };
  if (/^[A-Za-z0-9]{22}$/.test(s)) return { type: 'track', id: s };
  return null;
}
/** Apple Music preview clips only come from Apple's CDN — anything else is rejected. */
export function isApplePreviewUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && /(^|\.)(mzstatic\.com|itunes\.apple\.com|apple\.com)$/.test(x.hostname);
  } catch {
    return false;
  }
}
export const spotifyEmbedUrl = (song) => `https://open.spotify.com/embed/${song.type}/${song.id}?utm_source=generator&theme=0`;
export const spotifyOpenUrl = (song) => `https://open.spotify.com/${song.type}/${song.id}`;

// ——— Moderation ———
export const MOD_STATUSES = ['active', 'muted', 'suspended', 'banned'];
/** What happens at each strike count within the rolling window (AI LOLShield escalation ladder). */
export const STRIKE_LADDER = [
  { strikes: 1, action: 'warn' },
  { strikes: 2, action: 'mute', minutes: 60 },
  { strikes: 3, action: 'mute', minutes: 24 * 60 },
  { strikes: 4, action: 'suspend', minutes: 3 * 24 * 60 },
  { strikes: 5, action: 'suspend', minutes: 30 * 24 * 60 },
];
export const STRIKE_WINDOW_DAYS = 30;

export const COPYRIGHT = `ChatLOL 2026 - All rights reserved by LOLCorp PVT LTD.`;

// ——— ChatLOL Premium ———
/** Non-renewing passes. Real-money prices are per store listing; the Sparks price is deliberately steep. */
export const PREMIUM_PLANS = [
  { id: 'premium_7d', days: 7, usd: 4.99, sparks: 25000, label: 'Week Pass' },
  { id: 'premium_30d', days: 30, usd: 9.99, sparks: 90000, label: 'Month Pass', best: true },
  { id: 'premium_90d', days: 90, usd: 24.99, sparks: 240000, label: 'Season Pass' },
];
export const premiumPlan = (id) => PREMIUM_PLANS.find((p) => p.id === id);
export const PREMIUM_PERKS = [
  { emoji: '👀', title: 'See who viewed your profile' },
  { emoji: '⭐', title: 'See who rated you and your photos' },
  { emoji: '📣', title: 'See who mentioned you in shouts' },
  { emoji: '👑', title: 'Premium crown on your profile and shouts' },
  { emoji: '🔎', title: 'Full insights: when and how often people check you out' },
  { emoji: '💎', title: '60% chance of bonus Gems every time you earn Sparks' },
  { emoji: '🎨', title: 'All 30 app colour themes' },
  { emoji: '🎵', title: 'A profile song that plays when people visit' },
  { emoji: '🖼️', title: 'Photo and colour profile backgrounds' },
  { emoji: '🧩', title: 'Extra page layouts, fonts, box styles and sections (video, currently)' },
];
