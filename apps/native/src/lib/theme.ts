import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemePalette } from '@chatlol/shared';
import { radii, spacing, themeGradients, themePalette } from '@chatlol/shared';
import { useSession } from './store';

export type Palette = ThemePalette;

/**
 * Gradients and shadows tinted with the person's colour theme. They're plain objects (used in style props all
 * over the app), so they're updated in place whenever the theme changes; every screen re-renders then anyway,
 * because it reads useColors().
 */
export const gradients = { ...themeGradients(themePalette(null)) } as Record<'sunset' | 'sunsetVertical' | 'coral' | 'dusk', [string, string]>;
export const shadow = {
  warm: { shadowColor: '#b85200', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  pop: { shadowColor: '#ff5e00', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  float: { shadowColor: '#ff5e00', shadowOpacity: 0.3, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
};
function tintShared(p: Palette) {
  Object.assign(gradients, themeGradients(p));
  shadow.warm.shadowColor = p.primary;
  shadow.pop.shadowColor = p.flame;
  shadow.float.shadowColor = p.flame;
}

/** Whether the app is in dark mode (the person's choice, or the phone's when set to System). */
export function useIsDark() {
  const system = useColorScheme();
  const pref = useSession((s) => s.user?.settings.darkMode ?? s.themeOverride ?? 'system');
  return pref === 'dark' || (pref === 'system' && system === 'dark');
}

/** The palette for the person's colour theme (Settings → Appearance) and light/dark preference. */
export function useColors(): Palette {
  const dark = useIsDark();
  const theme = useSession((s) => s.user?.settings.appTheme ?? null);
  const key = `${dark}:${theme?.preset}:${theme?.custom}`;
  const p = useMemo(() => themePalette(theme, dark), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (gradients.sunset[1] !== themeGradients(p).sunset[1] || shadow.pop.shadowColor !== p.flame) tintShared(p);
  return p;
}

export const fonts = {
  medium: 'PlusJakartaSans_500Medium',
  bold: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
};

export { radii, spacing };


/**
 * Colours for a selected / active thing (picked reaction, active chip): the theme's accent in light mode; in dark
 * mode a deep tint with an accent edge so the emoji or label on it stays readable.
 */
export function useSelectedColors() {
  const c = useColors();
  return { bg: c.selBg, fg: c.selFg, border: c.selBorder };
}

/** Spread onto <Switch>: the web/desktop renderer ignores thumbColor when on and draws a teal knob otherwise. */
export const WEB_THUMB = { activeThumbColor: '#fff' } as object;
