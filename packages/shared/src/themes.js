import { colors, darkColors } from './tokens.js';

/**
 * App-wide colour themes. Every theme is the Sunset palette turned to another hue with its saturation scaled:
 * each colour keeps its exact lightness, so contrast, light/dark mode and the soft gradients carry over and no
 * theme comes out neon. A custom colour picks the hue and (within limits) the saturation the same way.
 */

const SUNSET_HUE = 22; // the hue of Sunset's flame orange (#ff5e00)

/** `sat` scales saturation (1 = Sunset's). Swatches are the theme's gradient, worked out from the same maths. */
export const APP_THEMES = [
  { key: 'sunset', label: 'Sunset', hue: 22, sat: 1 },
  { key: 'ember', label: 'Ember', hue: 8, sat: 0.88 },
  { key: 'honey', label: 'Honey', hue: 33, sat: 0.78 },
  { key: 'rose', label: 'Rose', hue: 350, sat: 0.6 },
  { key: 'berry', label: 'Berry', hue: 326, sat: 0.58 },
  { key: 'lavender', label: 'Lavender', hue: 268, sat: 0.5 },
  { key: 'ocean', label: 'Ocean', hue: 212, sat: 0.62 },
  { key: 'lagoon', label: 'Lagoon', hue: 178, sat: 0.5 },
  { key: 'sage', label: 'Sage', hue: 138, sat: 0.42 },
  { key: 'mocha', label: 'Mocha', hue: 24, sat: 0.42 },
  { key: 'slate', label: 'Slate', hue: 214, sat: 0.24 },
];
export const DEFAULT_APP_THEME = { preset: 'sunset', custom: null };

/** Colours that mean something (errors, the online dot) never change with the theme. */
const FIXED = new Set(['error', 'onError', 'errorContainer', 'onErrorContainer', 'online']);

// ——— colour maths ———
export function hexToHsl(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
export const isHexColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** The hue + saturation scale for a setting: a preset, or a custom colour tamed into a comfortable range. */
export function themeParams(setting) {
  const t = setting ?? DEFAULT_APP_THEME;
  if (t.preset === 'custom' && isHexColor(t.custom)) {
    const [h, s] = hexToHsl(t.custom);
    // Greys stay soft greys; anything vivid is capped so the whole app doesn't glow. Yellows and greens look
    // brighter than other hues at the same saturation, so they're toned down a little more.
    const yellowGreen = h >= 48 && h <= 165 ? 0.78 : 1;
    return { hue: h, sat: Math.min(0.72, Math.max(0.12, s * 0.75)) * yellowGreen };
  }
  const p = APP_THEMES.find((x) => x.key === t.preset) ?? APP_THEMES[0];
  return { hue: p.hue, sat: p.sat };
}
export const isDefaultTheme = (setting) => {
  const { hue, sat } = themeParams(setting);
  return hue === SUNSET_HUE && sat === 1;
};

function shift(hex, dHue, satScale) {
  const [h, s, l] = hexToHsl(hex);
  if (s === 0) return hex;
  return hslToHex(h + dHue, Math.min(1, s * satScale), l);
}

/** Selected / active things (picked reaction, active chip): solid accent in light mode, deep tint with an edge in dark. */
const SELECTED = {
  light: (p) => ({ selBg: p.flame, selFg: '#ffffff', selBorder: p.flame }),
  dark: { selBg: '#3d2416', selFg: '#ffb68e', selBorder: '#c2551a' },
};

/** The full palette for a theme setting, light or dark. Sunset returns the original tokens untouched. */
export function themePalette(setting, dark = false) {
  const base = dark ? darkColors : colors;
  const { hue, sat } = themeParams(setting);
  const d = hue - SUNSET_HUE;
  const same = d === 0 && sat === 1;
  const out = {};
  for (const [k, v] of Object.entries(base)) out[k] = same || FIXED.has(k) ? v : shift(v, d, sat);
  const sel = dark
    ? Object.fromEntries(Object.entries(SELECTED.dark).map(([k, v]) => [k, same ? v : shift(v, d, sat)]))
    : SELECTED.light(out);
  return { ...out, ...sel };
}

/** Gradients for a palette (same names as `gradients` in tokens.js). */
export const themeGradients = (p) => ({
  sunset: [p.tangerine, p.flame],
  sunsetVertical: [p.flame, p.secondaryContainer],
  coral: [p.tertiaryContainer, p.coral],
  dusk: [p.flame, p.tertiary],
});

/** Swatch for the picker: the theme's main gradient (light mode). */
export const themeSwatch = (setting) => themeGradients(themePalette(setting, false)).sunset;

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
/** CSS variables for the web app (`--c-flame: 255 94 0` …), light under :root and dark under [data-theme="dark"]. */
export function themeCss(setting) {
  const block = (p) =>
    Object.entries(p)
      .map(([k, v]) => `--c-${kebab(k)}: ${rgb(v)};`)
      .join('');
  return `:root{${block(themePalette(setting, false))}}[data-theme="dark"]{${block(themePalette(setting, true))}}`;
}
