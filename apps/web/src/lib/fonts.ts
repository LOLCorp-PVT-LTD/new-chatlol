import { googleFontUrl } from '@chatlol/shared';

/** Loads a Google Fonts family once (Vault profile fonts are only fetched when someone actually uses them). */
const loaded = new Set<string>();
export function loadFont(family: string | undefined) {
  if (!family || loaded.has(family)) return;
  loaded.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = googleFontUrl(family);
  document.head.appendChild(link);
}
