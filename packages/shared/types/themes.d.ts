import type { colors } from './tokens';

export type AppThemeKey = 'sunset' | 'ocean' | 'berry' | 'ember' | 'honey' | 'rose' | 'lavender' | 'lagoon' | 'sage' | 'mocha' | 'slate' | 'crimson' | 'tangerine' | 'gold' | 'lime' | 'emerald' | 'mint' | 'teal' | 'sky' | 'cobalt' | 'indigo' | 'violet' | 'grape' | 'orchid' | 'magenta' | 'bubblegum' | 'coral' | 'rust' | 'olive' | 'storm';
/** A person's app colours: one of the fixed themes. (`custom` only exists on old saved settings and is shown as Sunset.) */
export interface AppThemeSetting {
    preset: AppThemeKey | 'custom';
    custom: string | null;
}
export type ThemePalette = typeof colors & { selBg: string; selFg: string; selBorder: string };
export declare const APP_THEMES: { key: AppThemeKey; label: string; hue: number; sat: number; free?: boolean }[];
export declare const THEME_UNLOCK_GOLD: number;
export declare const appThemeByKey: (key: string) => (typeof APP_THEMES)[number] | undefined;
export declare const themeAllowed: (key: string, who?: { premium?: boolean; unlocked?: string[] }) => boolean;
export declare function themeColor(hex: string, setting: AppThemeSetting | null | undefined): string;
export declare const DEFAULT_APP_THEME: AppThemeSetting;
export declare function hexToHsl(hex: string): [number, number, number];
export declare function hslToHex(h: number, s: number, l: number): string;
export declare function isHexColor(v: unknown): v is string;
export declare function themeParams(setting: AppThemeSetting | null | undefined): { hue: number; sat: number };
export declare function isDefaultTheme(setting: AppThemeSetting | null | undefined): boolean;
export declare function themePalette(setting: AppThemeSetting | null | undefined, dark?: boolean): ThemePalette;
export declare function themeGradients(p: ThemePalette): { sunset: [string, string]; sunsetVertical: [string, string]; coral: [string, string]; dusk: [string, string] };
export declare function themeSwatch(setting: AppThemeSetting | null | undefined): [string, string];
export declare function themeCss(setting: AppThemeSetting | null | undefined): string;
