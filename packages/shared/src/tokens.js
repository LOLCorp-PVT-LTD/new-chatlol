/**
 * Sunset Citrus design tokens — single source of truth for web (Tailwind) and native (StyleSheet).
 * Mirrors design/sunset_citrus/DESIGN.md.
 */
export const colors = {
  surface: '#fff8f5',
  surfaceDim: '#edd6c8',
  surfaceBright: '#fff8f5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#fff1ea',
  surfaceContainer: '#ffeade',
  surfaceContainerHigh: '#fbe4d6',
  surfaceContainerHighest: '#f5ded1',
  onSurface: '#251911',
  onSurfaceVariant: '#5b4137',
  inverseSurface: '#3b2e25',
  inverseOnSurface: '#ffede4',
  outline: '#8f7065',
  outlineVariant: '#e4bfb1',
  primary: '#a63b00',
  onPrimary: '#ffffff',
  primaryContainer: '#ff5e00',
  onPrimaryContainer: '#531900',
  inversePrimary: '#ffb599',
  secondary: '#8a5100',
  onSecondary: '#ffffff',
  secondaryContainer: '#fe9800',
  onSecondaryContainer: '#643900',
  tertiary: '#bd0042',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ff5676',
  onTertiaryContainer: '#5f001d',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  primaryFixed: '#ffdbce',
  primaryFixedDim: '#ffb599',
  onPrimaryFixed: '#370e00',
  secondaryFixed: '#ffdcbd',
  secondaryFixedDim: '#ffb86f',
  tertiaryFixed: '#ffd9dc',
  tertiaryFixedDim: '#ffb2ba',
  surfaceVariant: '#f5ded1',
  // Brand accents from the design narrative
  flame: '#ff5e00',
  tangerine: '#ff9900',
  coral: '#ff3366',
  umber: '#261a12',
  cream: '#fffbf7',
  sunlit: '#fff4ea',
  sandstone: '#f3e7dc',
  online: '#22c55e',
};

/** Dark "Midnight Sunset" variant used by native dark mode & the desktop app at night. */
export const darkColors = {
  ...colors,
  surface: '#1a110c',
  surfaceDim: '#1a110c',
  surfaceBright: '#42362e',
  surfaceContainerLowest: '#140c08',
  surfaceContainerLow: '#231913',
  surfaceContainer: '#281d16',
  surfaceContainerHigh: '#332720',
  surfaceContainerHighest: '#3e322a',
  onSurface: '#f5ded1',
  onSurfaceVariant: '#e4bfb1',
  outline: '#ab897d',
  outlineVariant: '#5b4137',
  primary: '#ffb599',
  cream: '#1a110c',
  sunlit: '#281d16',
  sandstone: '#3e322a',
  umber: '#f5ded1',
};

export const gradients = {
  sunset: ['#ff9900', '#ff5e00'],
  sunsetVertical: ['#ff5e00', '#ffa800'],
  coral: ['#ff5676', '#ff3366'],
  dusk: ['#ff5e00', '#bd0042'],
};

export const radii = { sm: 8, DEFAULT: 16, md: 24, lg: 32, xl: 48, full: 9999 };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 36, '2xl': 56, gutter: 16, gutterDesktop: 24 };

export const typography = {
  displayLg: { fontSize: 48, lineHeight: 56, fontWeight: '800', letterSpacing: -1.44 },
  displayLgMobile: { fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -0.9 },
  headlineXl: { fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.64 },
  headlineLg: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.36 },
  headlineMd: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  headlineSm: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: 0 },
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: -0.08 },
  bodyMd: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0 },
  bodySm: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.12 },
  labelLg: { fontSize: 14, lineHeight: 18, fontWeight: '700', letterSpacing: 0.14 },
  labelMd: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.24 },
  labelSm: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.44 },
};

export const shadows = {
  level1: '0px 4px 20px -2px rgba(184, 82, 0, 0.06), 0px 1px 3px 0px rgba(71, 32, 0, 0.04)',
  level2: '0px 12px 28px -4px rgba(255, 94, 0, 0.14), 0px 4px 10px -1px rgba(71, 32, 0, 0.05)',
  level3: '0px 20px 40px -8px rgba(255, 94, 0, 0.28)',
  glow: '0 0 16px rgba(255, 94, 0, 0.45)',
};

export const fontFamily = 'Manrope';
