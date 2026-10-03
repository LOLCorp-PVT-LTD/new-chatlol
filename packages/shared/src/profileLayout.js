import { cleanGames } from './gamesCatalog.js';
import { SHOP_FONTS } from './cosmetics.js';
/**
 * Profile page builder: a member arranges sections on a 12-column grid and picks the page's overall look.
 * Shared by the server (validation), web (drag-and-drop editor) and native (renderer + editor).
 *
 * A layout is { header, width, gap, corners, font, sections: Section[] }.
 * A section is { id, type, size, style, title, config } — `size` is its width on the grid; on phones every
 * section is full width, in the saved order.
 */

/** Section widths, as columns of a 12-column grid. */
export const SECTION_SIZES = [
  { key: 'third', label: '⅓', cols: 4 },
  { key: 'half', label: '½', cols: 6 },
  { key: 'twothirds', label: '⅔', cols: 8 },
  { key: 'full', label: 'Full', cols: 12 },
];
export const sectionCols = (size) => SECTION_SIZES.find((s) => s.key === size)?.cols ?? 12;

/** How a section's box looks. */
export const SECTION_STYLES = [
  { key: 'card', label: 'Card' },
  { key: 'glass', label: 'Glass' },
  { key: 'accent', label: 'Accent' },
  { key: 'outline', label: 'Outline' },
  { key: 'plain', label: 'No box' },
];

/** Page-level layout choices. */
export const HEADER_STYLES = [
  { key: 'cover', label: 'Cover banner', desc: 'Big cover photo with your picture overlapping it' },
  { key: 'centered', label: 'Centered', desc: 'Everything centered under the cover' },
  { key: 'split', label: 'Split', desc: 'Picture on one side, details on the other' },
  { key: 'compact', label: 'Compact', desc: 'A slim bar — your sections take the stage' },
];
export const PAGE_WIDTHS = [
  { key: 'narrow', label: 'Narrow', px: 760 },
  { key: 'normal', label: 'Normal', px: 1040 },
  { key: 'wide', label: 'Wide', px: 1320 },
];
export const SECTION_GAPS = [
  { key: 'tight', label: 'Tight', px: 8 },
  { key: 'normal', label: 'Normal', px: 20 },
  { key: 'airy', label: 'Airy', px: 32 },
];
export const CORNER_STYLES = [
  { key: 'sharp', label: 'Sharp', px: 4 },
  { key: 'soft', label: 'Soft', px: 16 },
  { key: 'round', label: 'Round', px: 28 },
];
/** Font stacks need no downloads — they use what every device already has. */
export const PROFILE_FONTS = [
  { key: 'default', label: 'Default', css: "Manrope, system-ui, sans-serif", native: undefined },
  { key: 'serif', label: 'Classic serif', css: "Georgia, 'Times New Roman', serif", native: 'serif' },
  { key: 'mono', label: 'Typewriter', css: "'Courier New', ui-monospace, monospace", native: 'monospace' },
  { key: 'rounded', label: 'Rounded', css: "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif", native: undefined },
  { key: 'condensed', label: 'Condensed', css: "'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif", native: 'sans-serif-condensed' },
  // Vault fonts: usable once the member owns the item (`item`), loaded from Google Fonts (`family`).
  ...SHOP_FONTS.map((f) => ({ key: f.key, label: f.label, css: f.css, native: undefined, item: f.key, family: f.family })),
];

const LIMIT = (min, max, def) => ({ limit: { min, max, def } });

/**
 * Everything that can go on a profile.
 *  multi: can be added more than once · sizes: widths it can take · config: its settings (with defaults)
 */
export const PROFILE_SECTIONS = [
  { key: 'about', label: 'About me', emoji: '👋', desc: 'Headline, bio and city', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half' },
  { key: 'details', label: 'Details', emoji: '📇', desc: 'Gender, level, member since, last active', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third' },
  { key: 'interests', label: 'Interests', emoji: '🏷️', desc: 'Your interest tags', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half' },
  { key: 'song', label: 'Profile song', emoji: '🎵', desc: 'Your song, playing when people visit', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half' },
  { key: 'stats', label: 'Stats', emoji: '📊', desc: 'Vibe score, followers, friends and streak', sizes: ['third', 'half', 'twothirds', 'full'], size: 'full' },
  { key: 'rating', label: 'Rate my profile', emoji: '⭐', desc: 'Visitors rate your profile vibe', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half' },
  { key: 'wall', label: 'Comments', emoji: '💬', desc: 'Visitors leave comments on your profile', sizes: ['half', 'twothirds', 'full'], size: 'half', config: LIMIT(3, 30, 8) },
  { key: 'gallery', label: 'Gallery', emoji: '🖼️', desc: 'Your photo albums', sizes: ['half', 'twothirds', 'full'], size: 'full', config: { columns: { min: 2, max: 5, def: 3 } } },
  { key: 'photos', label: 'Latest photos', emoji: '📷', desc: 'Your newest photos', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half', config: { ...LIMIT(3, 24, 6), columns: { min: 2, max: 5, def: 3 } } },
  { key: 'topPhotos', label: 'Top rated photos', emoji: '🏆', desc: 'Your best rated photos', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half', config: { ...LIMIT(3, 24, 6), columns: { min: 2, max: 5, def: 3 } } },
  { key: 'feed', label: 'Posts', emoji: '📰', desc: 'Your recent posts from the news feed', sizes: ['half', 'twothirds', 'full'], size: 'twothirds', config: LIMIT(1, 20, 3) },
  { key: 'shouts', label: 'Recent shouts', emoji: '📣', desc: 'What you shouted lately', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third', config: LIMIT(1, 20, 5) },
  { key: 'friends', label: 'Friends', emoji: '🤝', desc: 'People you follow who follow you back', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third', config: LIMIT(3, 24, 9) },
  { key: 'followers', label: 'Followers', emoji: '👥', desc: 'People following you', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third', config: LIMIT(3, 24, 9) },
  { key: 'following', label: 'Following', emoji: '➡️', desc: 'People you follow', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third', config: LIMIT(3, 24, 9) },
  { key: 'badges', label: 'Badges', emoji: '🏅', desc: 'Badges you’ve earned', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third' },
  { key: 'level', label: 'Level & XP', emoji: '⚡', desc: 'Your level and progress to the next', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third' },
  { key: 'threads', label: 'Forum threads', emoji: '🧵', desc: 'Threads you started', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half', config: LIMIT(1, 15, 5) },
  { key: 'text', label: 'Text box', emoji: '📝', desc: 'Write anything you like', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half', multi: true, config: { body: { max: 1500, def: '' } } },
  { key: 'quote', label: 'Quote', emoji: '❝', desc: 'A big quote or motto', sizes: ['third', 'half', 'twothirds', 'full'], size: 'full', multi: true, config: { text: { max: 200, def: '' }, by: { max: 60, def: '' } } },
  { key: 'links', label: 'Links', emoji: '🔗', desc: 'Your other socials and sites', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third', multi: true, config: { items: { max: 8, def: [] } } },
  { key: 'games', label: 'Games I play', emoji: '🎮', desc: 'Games you play or want to try, with their logos', sizes: ['third', 'half', 'twothirds', 'full'], size: 'half', config: { items: { max: 24, def: [] } } },
  { key: 'currently', label: 'Currently', emoji: '🎧', desc: 'What you’re watching, reading, playing…', sizes: ['third', 'half', 'twothirds', 'full'], size: 'third', config: { items: { max: 6, def: [] } } },
  { key: 'video', label: 'YouTube video', emoji: '▶️', desc: 'Show a YouTube video', sizes: ['half', 'twothirds', 'full'], size: 'half', multi: true, config: { videoId: { def: '' } } },
  { key: 'spacer', label: 'Spacer', emoji: '↕️', desc: 'Empty space to shape your layout', sizes: ['third', 'half', 'twothirds', 'full'], size: 'full', multi: true, config: { height: { def: 'md' } } },
];
export const sectionDef = (type) => PROFILE_SECTIONS.find((s) => s.key === type);
export const MAX_PROFILE_SECTIONS = 30;
export const CURRENTLY_LABELS = ['Watching', 'Reading', 'Playing', 'Listening to', 'Eating', 'Learning', 'Wearing', 'Mood'];
export const SPACER_HEIGHTS = { sm: 16, md: 40, lg: 96 };

/** Pulls the video id out of any YouTube link (or a bare id). */
export function parseYouTube(input) {
  const s = String(input ?? '').trim();
  const m =
    s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) ?? s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

let seq = 0;
/** A short id for a new section (unique within a layout). */
export const newSectionId = () => `s${Date.now().toString(36)}${(seq++ % 1296).toString(36)}`;

/** A new section of a type, with that type's defaults. */
export function makeSection(type, overrides = {}) {
  const def = sectionDef(type);
  const config = {};
  for (const [k, v] of Object.entries(def?.config ?? {})) config[k] = Array.isArray(v.def) ? [...v.def] : v.def;
  return { id: newSectionId(), type, size: def?.size ?? 'full', style: 'card', title: '', config, ...overrides };
}

const L = (header, width, sections, extra = {}) => ({
  header,
  width,
  gap: 'normal',
  corners: 'soft',
  font: 'default',
  ...extra,
  sections: sections.map(([type, size, more]) => makeSection(type, { size, ...more })),
});

/** Ready-made layouts to start from. */
export const LAYOUT_PRESETS = [
  {
    key: 'classic',
    label: 'Classic',
    desc: 'Everything at a glance',
    build: () =>
      L('cover', 'normal', [
        ['stats', 'full'],
        ['about', 'half'],
        ['rating', 'half'],
        ['interests', 'half'],
        ['song', 'half'],
        ['gallery', 'full'],
        ['friends', 'third'],
        ['shouts', 'third'],
        ['badges', 'third'],
        ['feed', 'twothirds'],
        ['followers', 'third'],
        ['wall', 'full'],
      ]),
  },
  {
    key: 'social',
    label: 'Social butterfly',
    desc: 'Friends, comments and shouts first',
    build: () =>
      L('centered', 'normal', [
        ['about', 'full'],
        ['friends', 'half'],
        ['followers', 'half'],
        ['wall', 'twothirds'],
        ['shouts', 'third'],
        ['rating', 'half'],
        ['currently', 'half'],
        ['photos', 'full'],
      ]),
  },
  {
    key: 'photographer',
    label: 'Photographer',
    desc: 'A wide gallery that does the talking',
    build: () =>
      L(
        'compact',
        'wide',
        [
          ['topPhotos', 'full', { config: { limit: 8, columns: 4 } }],
          ['gallery', 'twothirds', { config: { columns: 3 } }],
          ['about', 'third'],
          ['rating', 'third'],
          ['wall', 'twothirds'],
        ],
        { gap: 'tight', corners: 'sharp' },
      ),
  },
  {
    key: 'music',
    label: 'Music lover',
    desc: 'Your song and what you’re into',
    build: () =>
      L(
        'split',
        'normal',
        [
          ['song', 'full'],
          ['quote', 'full'],
          ['currently', 'third'],
          ['about', 'third'],
          ['interests', 'third'],
          ['video', 'half'],
          ['shouts', 'half'],
          ['wall', 'full'],
        ],
        { corners: 'round' },
      ),
  },
  {
    key: 'minimal',
    label: 'Minimal',
    desc: 'Just the essentials, lots of air',
    build: () =>
      L(
        'centered',
        'narrow',
        [
          ['about', 'full', { style: 'plain' }],
          ['photos', 'full', { style: 'plain', config: { limit: 6, columns: 3 } }],
          ['wall', 'full', { style: 'plain' }],
        ],
        { gap: 'airy', font: 'serif' },
      ),
  },
];
export const defaultProfileLayout = () => LAYOUT_PRESETS[0].build();

const pickKey = (list, v, def) => (list.some((x) => x.key === v) ? v : def);
const clampInt = (v, { min, max, def }) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : def);
const str = (v, max) => String(v ?? '').slice(0, max);
const httpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u ?? '')) && String(u).length <= 300;

/** Cleans one section's settings to what its type allows. */
function cleanConfig(type, raw = {}) {
  const def = sectionDef(type)?.config ?? {};
  const c = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [k, spec] of Object.entries(def)) {
    if ('min' in spec) out[k] = clampInt(c[k], spec);
    else if (k === 'body' || k === 'text' || k === 'by') out[k] = str(c[k] ?? spec.def, spec.max);
    else if (k === 'videoId') out[k] = parseYouTube(c[k]) ?? '';
    else if (k === 'height') out[k] = c[k] in SPACER_HEIGHTS ? c[k] : 'md';
    else if (k === 'items' && type === 'links')
      out.items = (Array.isArray(c.items) ? c.items : [])
        .filter((i) => i && httpUrl(i.url))
        .slice(0, spec.max)
        .map((i) => ({ label: str(i.label, 40) || String(i.url).replace(/^https?:\/\//, '').slice(0, 40), url: String(i.url) }));
    else if (k === 'items' && type === 'games') out.items = cleanGames(c.items);
    else if (k === 'items' && type === 'currently')
      out.items = (Array.isArray(c.items) ? c.items : [])
        .filter((i) => i && String(i.value ?? '').trim())
        .slice(0, spec.max)
        .map((i) => ({ label: str(i.label, 24) || 'Currently', value: str(i.value, 80) }));
  }
  return out;
}

/**
 * Normalises any stored or submitted layout: unknown types dropped, sizes/styles snapped to allowed values,
 * single-use sections de-duplicated, ids made unique. Missing layout → the default one.
 */
export function normalizeLayout(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) return defaultProfileLayout();
  const seenTypes = new Set();
  const seenIds = new Set();
  const sections = [];
  for (const s of raw.sections) {
    const def = s && sectionDef(s.type);
    if (!def) continue;
    if (!def.multi && seenTypes.has(def.key)) continue;
    seenTypes.add(def.key);
    let id = typeof s.id === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(s.id) ? s.id : newSectionId();
    while (seenIds.has(id)) id = newSectionId();
    seenIds.add(id);
    sections.push({
      id,
      type: def.key,
      size: def.sizes.includes(s.size) ? s.size : def.size,
      style: pickKey(SECTION_STYLES, s.style, 'card'),
      title: str(s.title, 40).trim(),
      config: cleanConfig(def.key, s.config),
    });
    if (sections.length >= MAX_PROFILE_SECTIONS) break;
  }
  return {
    header: pickKey(HEADER_STYLES, raw.header, 'cover'),
    width: pickKey(PAGE_WIDTHS, raw.width, 'normal'),
    gap: pickKey(SECTION_GAPS, raw.gap, 'normal'),
    corners: pickKey(CORNER_STYLES, raw.corners, 'soft'),
    font: pickKey(PROFILE_FONTS, raw.font, 'default'),
    sections,
  };
}

/** All user-written text in a layout (for moderation). */
export function layoutText(layout) {
  const parts = [];
  for (const s of layout.sections) {
    if (s.title) parts.push(s.title);
    const c = s.config ?? {};
    for (const k of ['body', 'text', 'by']) if (c[k]) parts.push(c[k]);
    for (const i of c.items ?? []) parts.push(i.label, i.value ?? '');
  }
  return parts.filter(Boolean).join('\n');
}

/** Which sections need data from GET /users/:id/showcase. */
export const SHOWCASE_TYPES = ['friends', 'followers', 'following', 'shouts', 'photos', 'topPhotos', 'threads'];
