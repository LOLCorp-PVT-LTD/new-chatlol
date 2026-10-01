import type { Config } from 'tailwindcss';
import { colors, radii } from '../../packages/shared/src/tokens.js';

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const palette = Object.fromEntries(Object.keys(colors).map((k) => [kebab(k), `rgb(var(--c-${kebab(k)}) / <alpha-value>)`]));

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: palette,
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      borderRadius: { DEFAULT: `${radii.DEFAULT}px`, md: `${radii.md}px`, lg: `${radii.lg}px`, xl: `${radii.xl}px` },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-sm': ['36px', { lineHeight: '42px', letterSpacing: '-0.025em', fontWeight: '800' }],
        'headline-xl': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '700' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '500' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '500' }],
        'body-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'label-lg': ['14px', { lineHeight: '18px', letterSpacing: '0.01em', fontWeight: '700' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '700' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.04em', fontWeight: '700' }],
      },
      boxShadow: {
        warm: '0px 4px 20px -2px rgba(184, 82, 0, 0.06), 0px 1px 3px 0px rgba(71, 32, 0, 0.04)',
        pop: '0px 12px 28px -4px rgba(255, 94, 0, 0.14), 0px 4px 10px -1px rgba(71, 32, 0, 0.05)',
        float: '0px 20px 40px -8px rgba(255, 94, 0, 0.28)',
        glow: '0 0 16px rgba(255, 94, 0, 0.45)',
      },
      backgroundImage: {
        sunset: 'linear-gradient(135deg, #ff9900 0%, #ff5e00 100%)',
        'sunset-v': 'linear-gradient(180deg, #ff5e00 0%, #ffa800 100%)',
        dusk: 'linear-gradient(135deg, #ff5e00 0%, #bd0042 100%)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.6)', opacity: '0' }, '60%': { transform: 'scale(1.08)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        floatUp: { '0%': { transform: 'translateY(0)', opacity: '1' }, '100%': { transform: 'translateY(-80px)', opacity: '0' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(255,94,0,.45)' }, '100%': { boxShadow: '0 0 0 12px rgba(255,94,0,0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        wiggle: { '0%,100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-8deg)' }, '75%': { transform: 'rotate(8deg)' } },
        ticker: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      animation: {
        pop: 'pop .35s cubic-bezier(.2,.9,.3,1.4) both',
        'float-up': 'floatUp 1.4s ease-out forwards',
        'pulse-ring': 'pulseRing 1.6s ease-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        wiggle: 'wiggle .5s ease-in-out',
        ticker: 'ticker 40s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
