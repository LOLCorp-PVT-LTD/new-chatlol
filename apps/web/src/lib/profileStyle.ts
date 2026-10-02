import type { ProfileCustomization } from '@chatlol/shared';
import { profileBackground } from '@chatlol/shared';

/** CSS background for a member's profile (preset gradient, solid colour or uploaded image). */
export function profileBg(p?: ProfileCustomization | null): string {
  const bg = p?.background;
  if (!bg || bg.kind === 'preset') return profileBackground(bg?.value).css;
  if (bg.kind === 'color') return bg.value;
  return `center / cover no-repeat url("${bg.value.replace(/"/g, '%22')}")`;
}
/** True when text on the background should be white. */
export function bgIsDark(p?: ProfileCustomization | null): boolean {
  const bg = p?.background;
  if (!bg || bg.kind === 'preset') return profileBackground(bg?.value).dark;
  if (bg.kind === 'image') return true;
  const hex = bg.value.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}
