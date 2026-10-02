import type { colors } from './tokens';

export type AppThemeKey = 'sunset' | 'ember' | 'honey' | 'rose' | 'berry' | 'lavender' | 'ocean' | 'lagoon' | 'sage' | 'mocha' | 'slate';
/** A person's app colours: a preset, or `custom` with their own colour (tamed to a comfortable saturation). */
export interface AppThemeSetting {
    preset: AppThemeKey | 'custom';
    custom: string | null;
}
export type ThemePalette = typeof colors & { selBg: string; selFg: string; selBorder: string };
export declare const APP_THEMES: { key: AppThemeKey; label: string; hue: number; sat: number }[];
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
