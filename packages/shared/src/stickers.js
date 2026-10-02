/**
 * Custom emoji and stickers. Both are bought with Sparks in the Vault (a free starter pack of each comes with
 * every account); the server checks ownership whenever someone uses one.
 *
 *  - Custom emoji: ChatLOL's own rounded-square tiles, typed as :code: in any text. They're drawn as SVG
 *    (customEmojiSvg), so they're crisp at any size and need no image hosting.
 *  - Sticker packs: animated stickers from Google's Noto Animated Emoji (free, CC BY 4.0), served by Google Fonts.
 *  - GIPHY sticker search: a one-time Sparks unlock for searching GIPHY's animated stickers (needs a free
 *    GIPHY_API_KEY on the server).
 */

// ——— Custom emoji ———
const T = (code, text, bg, fg = '#fff') => ({ code, text, bg, fg });
const SUN = ['#ff9900', '#ff5e00'];
const CORAL = ['#ff6b8b', '#bd0042'];
const BLUE = ['#38bdf8', '#2563eb'];
const MINT = ['#34d399', '#059669'];
const GRAPE = ['#a78bfa', '#7c3aed'];
const INK = ['#3b2e25', '#1a110c'];
const GOLD = ['#fde047', '#f59e0b'];

/** Drawn icons for the Golden Hour pack: SVG path data on a 128×128 tile (white). */
const ICONS = {
  sunset: '<circle cx="64" cy="74" r="26" fill="#fff"/><rect x="18" y="74" width="92" height="40" fill="url(#g)"/><rect x="24" y="82" width="80" height="6" rx="3" fill="#fff" opacity=".85"/><rect x="36" y="94" width="56" height="6" rx="3" fill="#fff" opacity=".6"/>',
  heart: '<path d="M64 104 C26 80 22 58 34 44 C46 30 60 36 64 48 C68 36 82 30 94 44 C106 58 102 80 64 104Z" fill="#fff"/>',
  star: '<path d="M64 22 L76 52 L108 54 L83 74 L92 106 L64 88 L36 106 L45 74 L20 54 L52 52Z" fill="#fff"/>',
  sparkle: '<path d="M64 18 C68 48 80 60 110 64 C80 68 68 80 64 110 C60 80 48 68 18 64 C48 60 60 48 64 18Z" fill="#fff"/>',
  moon: '<path d="M80 22 A44 44 0 1 0 106 86 A36 36 0 1 1 80 22Z" fill="#fff"/>',
  bolt: '<path d="M72 16 L34 72 L60 72 L52 112 L94 52 L66 52Z" fill="#fff"/>',
  crown: '<path d="M22 92 L26 44 L48 66 L64 36 L80 66 L102 44 L106 92Z" fill="#fff"/><rect x="22" y="96" width="84" height="12" rx="4" fill="#fff"/>',
  check: '<path d="M30 66 L54 90 L100 40" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  cross: '<path d="M38 38 L90 90 M90 38 L38 90" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round"/>',
  flame: '<path d="M64 112 C38 112 28 92 34 72 C38 58 50 50 50 30 C64 40 72 52 70 66 C76 60 78 54 78 48 C92 60 98 76 94 90 C90 104 78 112 64 112Z" fill="#fff"/>',
};
/** Simple faces for the Mood Tiles pack. */
const FACE = {
  happy: '<circle cx="44" cy="54" r="8" fill="#fff"/><circle cx="84" cy="54" r="8" fill="#fff"/><path d="M38 76 Q64 104 90 76" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>',
  sad: '<circle cx="44" cy="56" r="8" fill="#fff"/><circle cx="84" cy="56" r="8" fill="#fff"/><path d="M40 96 Q64 72 88 96" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>',
  wow: '<circle cx="44" cy="50" r="9" fill="#fff"/><circle cx="84" cy="50" r="9" fill="#fff"/><ellipse cx="64" cy="88" rx="12" ry="15" fill="#fff"/>',
  mad: '<path d="M32 42 L54 52 M96 42 L74 52" stroke="#fff" stroke-width="8" stroke-linecap="round"/><circle cx="46" cy="62" r="7" fill="#fff"/><circle cx="82" cy="62" r="7" fill="#fff"/><path d="M42 96 Q64 80 86 96" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>',
  wink: '<path d="M34 54 Q44 46 54 54" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="84" cy="54" r="8" fill="#fff"/><path d="M38 76 Q64 102 90 76" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>',
  love: '<path d="M44 66 C30 56 30 44 38 40 C42 38 44 42 44 46 C44 42 46 38 50 40 C58 44 58 56 44 66Z M84 66 C70 56 70 44 78 40 C82 38 84 42 84 46 C84 42 86 38 90 40 C98 44 98 56 84 66Z" fill="#fff"/><path d="M40 82 Q64 106 88 82" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>',
  cool: '<rect x="26" y="44" width="34" height="20" rx="8" fill="#fff"/><rect x="68" y="44" width="34" height="20" rx="8" fill="#fff"/><rect x="56" y="48" width="16" height="6" fill="#fff"/><path d="M44 86 Q64 98 84 86" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/>',
  dead: '<path d="M34 44 L54 64 M54 44 L34 64 M74 44 L94 64 M94 44 L74 64" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M44 92 L84 92" stroke="#fff" stroke-width="9" stroke-linecap="round"/>',
  sleepy: '<path d="M34 58 Q44 64 54 58 M74 58 Q84 64 94 58" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="64" cy="90" r="8" fill="#fff"/><text x="96" y="36" font-size="22" font-weight="900" fill="#fff" font-family="Arial, sans-serif">z</text>',
  cry: '<circle cx="44" cy="52" r="8" fill="#fff"/><circle cx="84" cy="52" r="8" fill="#fff"/><path d="M40 70 Q36 84 40 92 Q46 84 40 70Z M88 70 Q84 84 88 92 Q94 84 88 70Z" fill="#bfe9ff"/><path d="M46 98 Q64 84 82 98" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/>',
};
const I = (code, icon, bg) => ({ code, icon, bg, fg: '#fff' });

export const EMOJI_PACKS = [
  {
    key: 'emoji_basics',
    name: 'ChatLOL Basics',
    description: 'Free with every account',
    price: 0,
    emojis: [
      T('lol', 'LOL', SUN),
      T('lmao', 'LMAO', CORAL),
      T('w', 'W', MINT),
      T('l', 'L', INK),
      T('gg', 'GG', BLUE),
      T('fr', 'FR', GRAPE),
      T('ngl', 'NGL', INK),
      T('omg', 'OMG', CORAL),
      T('brb', 'BRB', BLUE),
      T('ty', 'TY', MINT),
      T('ily', 'ILY', CORAL),
      T('gm', 'GM', GOLD, '#3b2e25'),
      T('gn', 'GN', GRAPE),
      T('hbd', 'HBD', SUN),
    ],
  },
  {
    key: 'emoji_slang',
    name: 'Slang Pack',
    description: 'Say it like you mean it',
    price: 250,
    emojis: [
      T('rizz', 'RIZZ', CORAL),
      T('mid', 'MID', INK),
      T('bet', 'BET', MINT),
      T('cap', 'CAP', CORAL),
      T('nocap', 'NO CAP', BLUE),
      T('slay', 'SLAY', GRAPE),
      T('sus', 'SUS', CORAL),
      T('goat', 'GOAT', GOLD, '#3b2e25'),
      T('based', 'BASED', BLUE),
      T('iykyk', 'IYKYK', GRAPE),
      T('ate', 'ATE', SUN),
      T('real', 'REAL', MINT),
      T('hype', 'HYPE', SUN),
      T('vibe', 'VIBE', GRAPE),
    ],
  },
  {
    key: 'emoji_golden',
    name: 'Golden Hour',
    description: 'Hand-drawn sunset icons',
    price: 350,
    emojis: [
      I('sunset', 'sunset', SUN),
      I('glowheart', 'heart', CORAL),
      I('goldstar', 'star', GOLD),
      I('sparkle', 'sparkle', GRAPE),
      I('moon', 'moon', INK),
      I('bolt', 'bolt', SUN),
      I('crown', 'crown', GOLD),
      I('yes', 'check', MINT),
      I('nope', 'cross', CORAL),
      I('lit', 'flame', SUN),
    ],
  },
  {
    key: 'emoji_moods',
    name: 'Mood Tiles',
    description: 'Little faces for every feeling',
    price: 300,
    emojis: [
      { code: 'happytile', face: 'happy', bg: SUN, fg: '#fff' },
      { code: 'sadtile', face: 'sad', bg: BLUE, fg: '#fff' },
      { code: 'wowtile', face: 'wow', bg: GRAPE, fg: '#fff' },
      { code: 'madtile', face: 'mad', bg: CORAL, fg: '#fff' },
      { code: 'winktile', face: 'wink', bg: MINT, fg: '#fff' },
      { code: 'lovetile', face: 'love', bg: CORAL, fg: '#fff' },
      { code: 'cooltile', face: 'cool', bg: INK, fg: '#fff' },
      { code: 'deadtile', face: 'dead', bg: INK, fg: '#fff' },
      { code: 'sleepytile', face: 'sleepy', bg: GRAPE, fg: '#fff' },
      { code: 'crytile', face: 'cry', bg: BLUE, fg: '#fff' },
    ],
  },
];
const EMOJI_INDEX = new Map(EMOJI_PACKS.flatMap((p) => p.emojis.map((e) => [e.code, { ...e, pack: p.key }])));
export const customEmoji = (code) => EMOJI_INDEX.get(String(code).toLowerCase()) ?? null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** The SVG for a custom emoji: a rounded square with a soft shine and the label, icon or face. */
export function customEmojiSvg(e) {
  const [a, b] = e.bg;
  let art = '';
  if (e.icon) art = ICONS[e.icon] ?? '';
  else if (e.face) art = FACE[e.face] ?? '';
  else {
    const len = e.text.length;
    const size = len <= 1 ? 76 : len === 2 ? 60 : len === 3 ? 48 : len === 4 ? 38 : len === 5 ? 31 : 25;
    art = `<text x="64" y="66" text-anchor="middle" dominant-baseline="central" font-family="'Plus Jakarta Sans','Arial Black',Arial,sans-serif" font-weight="900" font-size="${size}" letter-spacing="-1" fill="${esc(e.fg)}">${esc(e.text)}</text>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></linearGradient>` +
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="128" height="128" rx="30" fill="url(#g)"/><rect x="6" y="6" width="116" height="56" rx="26" fill="url(#s)"/>${art}</svg>`
  );
}
/** A data URI for a custom emoji, usable as an image source everywhere (no network). */
export const customEmojiUri = (codeOrEmoji) => {
  const e = typeof codeOrEmoji === 'string' ? customEmoji(codeOrEmoji) : codeOrEmoji;
  return e ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(customEmojiSvg(e))}` : '';
};

/**
 * Splits text into plain runs, :custom_emoji: and @mentions for rendering.
 * Unknown :codes: stay as text.
 */
export function parseRich(text) {
  const out = [];
  const re = /:([a-z0-9_]{1,24}):|@([a-zA-Z0-9_.]{3,20})/g;
  let last = 0;
  let m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m[1] && !customEmoji(m[1])) continue;
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    out.push(m[1] ? { t: 'emoji', code: m[1].toLowerCase() } : { t: 'mention', handle: m[2].replace(/\.$/, '') });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}
/** Text that's only 1–3 custom emoji (and spaces) is shown big. */
export const isJumbo = (parts) => {
  const em = parts.filter((p) => p.t === 'emoji').length;
  return em > 0 && em <= 3 && parts.every((p) => p.t === 'emoji' || (p.t === 'text' && !p.v.trim()));
};
/** The custom emoji codes used in a text. */
export const customEmojiCodes = (text) => [...new Set(parseRich(text).filter((p) => p.t === 'emoji').map((p) => p.code))];

// ——— Animated sticker packs (Google Noto Animated Emoji — free, CC BY 4.0) ———
export const notoAnimatedUrl = (cp) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.webp`;
/** Still image fallback for a sticker (every emoji has one). */
export const notoStillUrl = (cp) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/emoji.svg`;
const S = (id, cp, label) => ({ id, cp, label });

export const STICKER_PACKS = [
  {
    key: 'stickers_feels',
    name: 'Starter Feels',
    description: 'Free with every account',
    price: 0,
    stickers: [
      S('joy', '1f602', 'Tears of joy'),
      S('rofl', '1f923', 'Rolling on the floor'),
      S('hearteyes', '1f60d', 'Heart eyes'),
      S('sob', '1f62d', 'Sobbing'),
      S('cool', '1f60e', 'Cool'),
      S('thinking', '1f914', 'Thinking'),
      S('thumbsup', '1f44d', 'Thumbs up'),
      S('heart', '2764_fe0f', 'Heart'),
      S('fire', '1f525', 'Fire'),
      S('party', '1f389', 'Party popper'),
    ],
  },
  {
    key: 'stickers_love',
    name: 'Love Bomb',
    description: 'Hearts that actually beat',
    price: 300,
    stickers: [
      S('hearts', '1f970', 'Smiling with hearts'),
      S('kiss', '1f618', 'Blowing a kiss'),
      S('kissing', '1f61a', 'Kissing'),
      S('sparkleheart', '1f496', 'Sparkling heart'),
      S('growing', '1f497', 'Growing heart'),
      S('beating', '1f493', 'Beating heart'),
      S('twohearts', '1f495', 'Two hearts'),
      S('cupid', '1f498', 'Heart with arrow'),
      S('revolving', '1f49e', 'Revolving hearts'),
      S('broken', '1f494', 'Broken heart'),
    ],
  },
  {
    key: 'stickers_party',
    name: 'Party Mode',
    description: 'For every W',
    price: 400,
    stickers: [
      S('partyface', '1f973', 'Party face'),
      S('popper', '1f389', 'Party popper'),
      S('confetti', '1f38a', 'Confetti'),
      S('sparkles', '2728', 'Sparkles'),
      S('hundred', '1f4af', '100'),
      S('clap', '1f44f', 'Clapping'),
      S('raise', '1f64c', 'Raising hands'),
      S('dance', '1f483', 'Dancing'),
      S('rocket', '1f680', 'Rocket'),
      S('boom', '1f4a5', 'Boom'),
    ],
  },
  {
    key: 'stickers_drama',
    name: 'Drama Club',
    description: 'For when it’s giving main character',
    price: 400,
    stickers: [
      S('scream', '1f631', 'Screaming'),
      S('cry', '1f62d', 'Crying'),
      S('rage', '1f621', 'Rage'),
      S('mindblown', '1f92f', 'Mind blown'),
      S('eyeroll', '1f644', 'Eye roll'),
      S('grimace', '1f62c', 'Grimacing'),
      S('skull', '1f480', 'Dead'),
      S('pleading', '1f97a', 'Pleading'),
      S('hot', '1f975', 'Hot'),
      S('cold', '1f976', 'Cold'),
      S('eyebrow', '1f928', 'Raised eyebrow'),
    ],
  },
  {
    key: 'stickers_spooky',
    name: 'Spooky Squad',
    description: 'Ghosts, aliens and other weirdos',
    price: 500,
    stickers: [
      S('ghost', '1f47b', 'Ghost'),
      S('alien', '1f47d', 'Alien'),
      S('robot', '1f916', 'Robot'),
      S('skull', '1f480', 'Skull'),
      S('clown', '1f921', 'Clown'),
      S('poop', '1f4a9', 'Poop'),
      S('imp', '1f608', 'Smiling devil'),
      S('invader', '1f47e', 'Space invader'),
    ],
  },
];
/** Sticker ids are "<pack>/<sticker>", e.g. "stickers_party/confetti". */
export function notoSticker(id) {
  const [packKey, sid] = String(id).split('/');
  const pack = STICKER_PACKS.find((p) => p.key === packKey);
  const s = pack?.stickers.find((x) => x.id === sid);
  return s ? { pack, sticker: s, url: notoAnimatedUrl(s.cp), still: notoStillUrl(s.cp) } : null;
}

export const GIPHY_UNLOCK = { key: 'giphy_stickers', name: 'GIPHY Sticker Search', description: 'Search millions of animated stickers from GIPHY', price: 1500 };
export const isGiphyMediaUrl = (u) => /^https:\/\/(media\d*|i)\.giphy\.com\/[A-Za-z0-9/_.-]+$/.test(String(u ?? ''));

/** Vault catalog rows for the packs: [key, kind, name, description, price, rarity, emoji, preview]. */
export function stickerStoreItems() {
  const rarity = (price) => (price >= 500 ? 'epic' : price >= 300 ? 'rare' : 'common');
  return [
    ...EMOJI_PACKS.filter((p) => p.price > 0).map((p) => [p.key, 'emojis', p.name, `${p.emojis.length} custom emoji · ${p.description}`, p.price, rarity(p.price), '🔤', `linear-gradient(135deg,${p.emojis[0].bg[0]},${p.emojis[0].bg[1]})`]),
    ...STICKER_PACKS.filter((p) => p.price > 0).map((p) => [p.key, 'stickers', p.name, `${p.stickers.length} animated stickers · ${p.description}`, p.price, rarity(p.price), '✨', 'linear-gradient(135deg,#ffdcbd,#ff9900)']),
    [GIPHY_UNLOCK.key, 'unlock', GIPHY_UNLOCK.name, GIPHY_UNLOCK.description, GIPHY_UNLOCK.price, 'legendary', '🔍', 'linear-gradient(135deg,#7c3aed,#ff6b8b)'],
  ];
}
