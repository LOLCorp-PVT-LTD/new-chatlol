import type { AppThemeSetting } from '@chatlol/shared';
import { themeColor, themeParams } from '@chatlol/shared';
import raw from '../brand/chatlol-logo.svg?raw';

/**
 * The CHATLOL wordmark, recoloured for the app theme. The artwork is drawn in Sunset oranges; every colour in it
 * (letter gradients, the mascot's shading, the drop and inner shadows) goes through the same hue/saturation shift
 * as the app palette, so the logo always matches the theme exactly.
 */
const W = 2619;
const H = 446;
/** The mascot (the "O") on its own, for small screens. */
const MASCOT = { x: 1822, w: 470 };

// Unique ids so several logos (and other inline SVGs) can share a page.
const body = raw
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/id="([^"]+)"/g, 'id="clg-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#clg-$1)');

const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const full = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toLowerCase();
/** feColorMatrix shadows carry their colour as 0–1 channel values. */
const MATRIX = /values="0 0 0 0 ([\d.]+) 0 0 0 0 ([\d.]+) 0 0 0 0 ([\d.]+) 0 0 0 ([\d.]+) 0"/g;
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
const channels = (hex: string) => [1, 3, 5].map((i) => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));

const cache = new Map<string, string>();
function recolour(setting: AppThemeSetting | null | undefined) {
  const { hue, sat } = themeParams(setting);
  const key = `${hue}:${sat}`;
  let out = cache.get(key);
  if (!out) {
    out = body
      .replace(HEX, (m) => themeColor(full(m), setting))
      .replace(MATRIX, (_m, r, g, b, a) => {
        const [nr, ng, nb] = channels(themeColor(toHex(+r, +g, +b), setting));
        return `values="0 0 0 0 ${nr} 0 0 0 0 ${ng} 0 0 0 0 ${nb} 0 0 0 ${a} 0"`;
      });
    cache.set(key, out);
  }
  return out;
}

let seq = 0;
/** A fresh id prefix for each logo on the page. */
export const logoUid = () => `l${++seq}`;

/**
 * SVG markup for the wordmark or the mascot alone, in the given theme. `uid` keeps gradient / filter ids unique per
 * logo: with shared ids, `url(#…)` resolves to the first copy in the page, and if that copy is hidden (the mascot
 * on desktop, a closed drawer) Chrome paints the letters with nothing, so only the mascot shows.
 */
export function logoSvg(setting: AppThemeSetting | null | undefined, part: 'wordmark' | 'mascot' = 'wordmark', uid = '') {
  const box = part === 'mascot' ? `${MASCOT.x} 0 ${MASCOT.w} ${H}` : `0 0 ${W} ${H}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" preserveAspectRatio="xMidYMid meet" fill="none" role="img" aria-label="ChatLOL" style="display:block;width:100%;height:100%">${uid ? recolour(setting).replace(/clg-/g, `clg${uid}${part[0]}-`) : recolour(setting)}</svg>`;
}
export const LOGO_RATIO = W / H;
export const MASCOT_RATIO = MASCOT.w / H;
