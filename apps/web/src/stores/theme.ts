import { ref, watchEffect } from 'vue';
import type { AppThemeSetting } from '@chatlol/shared';
import { DEFAULT_APP_THEME, isDefaultTheme, themeCss, themePalette } from '@chatlol/shared';

type Mode = 'system' | 'light' | 'dark';
const KEY = 'chatlol.theme';
const THEME_KEY = 'chatlol.appTheme';
const read = (): Mode => { try { return (localStorage.getItem(KEY) as Mode) || 'system'; } catch { return 'system'; } };
const readTheme = (): AppThemeSetting => {
  try { return { ...DEFAULT_APP_THEME, ...JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null') }; } catch { return DEFAULT_APP_THEME; }
};

/** Light / dark / follow the system. */
export const themeMode = ref<Mode>(read());
/**
 * App colours (Settings → Appearance). Kept on this device too, so the page paints in your colours straight away
 * instead of flashing orange until your account loads.
 */
export const appTheme = ref<AppThemeSetting>(readTheme());

const mq = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => themeMode.value === 'dark' || (themeMode.value === 'system' && mq.matches);

/** Swaps the colour variables (`--c-*`) the whole app is drawn with. The built-in Sunset needs none. */
function applyColours() {
  let el = document.getElementById('app-theme') as HTMLStyleElement | null;
  if (isDefaultTheme(appTheme.value)) return el?.remove();
  if (!el) {
    el = document.createElement('style');
    el.id = 'app-theme';
    document.head.appendChild(el);
  }
  el.textContent = themeCss(appTheme.value);
}
const apply = () => {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? themePalette(appTheme.value, true).surface : themePalette(appTheme.value).flame);
};
mq.addEventListener('change', apply);
watchEffect(() => {
  applyColours();
  apply();
  try {
    localStorage.setItem(KEY, themeMode.value);
    localStorage.setItem(THEME_KEY, JSON.stringify(appTheme.value));
  } catch { /* ignore */ }
});
