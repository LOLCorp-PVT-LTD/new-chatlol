import { useColorScheme } from 'react-native';
import { colors, darkColors, gradients, radii, spacing } from '@chatlol/shared';
import { useSession } from './store';

export type Palette = typeof colors;

/** Resolves the Sunset Citrus palette for the user's appearance preference. */
export function useColors(): Palette {
  const system = useColorScheme();
  const pref = useSession((s) => s.user?.settings.darkMode ?? 'system');
  const dark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return (dark ? darkColors : colors) as Palette;
}

export function useIsDark() {
  const c = useColors();
  return c.surface !== colors.surface;
}

export const fonts = {
  medium: 'PlusJakartaSans_500Medium',
  bold: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
};

export { gradients, radii, spacing };

export const shadow = {
  warm: { shadowColor: '#b85200', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  pop: { shadowColor: '#ff5e00', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  float: { shadowColor: '#ff5e00', shadowOpacity: 0.3, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
};
