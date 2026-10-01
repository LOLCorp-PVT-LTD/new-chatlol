/**
 * Sunset Citrus design tokens — single source of truth for web (Tailwind) and native (StyleSheet).
 * Mirrors design/sunset_citrus/DESIGN.md.
 */
export declare const colors: {
    readonly surface: "#fff8f5";
    readonly surfaceDim: "#edd6c8";
    readonly surfaceBright: "#fff8f5";
    readonly surfaceContainerLowest: "#ffffff";
    readonly surfaceContainerLow: "#fff1ea";
    readonly surfaceContainer: "#ffeade";
    readonly surfaceContainerHigh: "#fbe4d6";
    readonly surfaceContainerHighest: "#f5ded1";
    readonly onSurface: "#251911";
    readonly onSurfaceVariant: "#5b4137";
    readonly inverseSurface: "#3b2e25";
    readonly inverseOnSurface: "#ffede4";
    readonly outline: "#8f7065";
    readonly outlineVariant: "#e4bfb1";
    readonly primary: "#a63b00";
    readonly onPrimary: "#ffffff";
    readonly primaryContainer: "#ff5e00";
    readonly onPrimaryContainer: "#531900";
    readonly inversePrimary: "#ffb599";
    readonly secondary: "#8a5100";
    readonly onSecondary: "#ffffff";
    readonly secondaryContainer: "#fe9800";
    readonly onSecondaryContainer: "#643900";
    readonly tertiary: "#bd0042";
    readonly onTertiary: "#ffffff";
    readonly tertiaryContainer: "#ff5676";
    readonly onTertiaryContainer: "#5f001d";
    readonly error: "#ba1a1a";
    readonly onError: "#ffffff";
    readonly errorContainer: "#ffdad6";
    readonly onErrorContainer: "#93000a";
    readonly primaryFixed: "#ffdbce";
    readonly primaryFixedDim: "#ffb599";
    readonly onPrimaryFixed: "#370e00";
    readonly secondaryFixed: "#ffdcbd";
    readonly secondaryFixedDim: "#ffb86f";
    readonly tertiaryFixed: "#ffd9dc";
    readonly tertiaryFixedDim: "#ffb2ba";
    readonly surfaceVariant: "#f5ded1";
    readonly flame: "#ff5e00";
    readonly tangerine: "#ff9900";
    readonly coral: "#ff3366";
    readonly umber: "#261a12";
    readonly cream: "#fffbf7";
    readonly sunlit: "#fff4ea";
    readonly sandstone: "#f3e7dc";
    readonly online: "#22c55e";
};
/** Dark "Midnight Sunset" variant used by native dark mode & the desktop app at night. */
export declare const darkColors: Record<keyof typeof colors, string>;
export declare const gradients: {
    sunset: readonly ["#ff9900", "#ff5e00"];
    sunsetVertical: readonly ["#ff5e00", "#ffa800"];
    coral: readonly ["#ff5676", "#ff3366"];
    dusk: readonly ["#ff5e00", "#bd0042"];
};
export declare const radii: {
    readonly sm: 8;
    readonly DEFAULT: 16;
    readonly md: 24;
    readonly lg: 32;
    readonly xl: 48;
    readonly full: 9999;
};
export declare const spacing: {
    readonly xs: 4;
    readonly sm: 8;
    readonly md: 16;
    readonly lg: 24;
    readonly xl: 36;
    readonly '2xl': 56;
    readonly gutter: 16;
    readonly gutterDesktop: 24;
};
export declare const typography: {
    readonly displayLg: {
        readonly fontSize: 48;
        readonly lineHeight: 56;
        readonly fontWeight: "800";
        readonly letterSpacing: -1.44;
    };
    readonly displayLgMobile: {
        readonly fontSize: 36;
        readonly lineHeight: 42;
        readonly fontWeight: "800";
        readonly letterSpacing: -0.9;
    };
    readonly headlineXl: {
        readonly fontSize: 32;
        readonly lineHeight: 40;
        readonly fontWeight: "800";
        readonly letterSpacing: -0.64;
    };
    readonly headlineLg: {
        readonly fontSize: 24;
        readonly lineHeight: 32;
        readonly fontWeight: "700";
        readonly letterSpacing: -0.36;
    };
    readonly headlineMd: {
        readonly fontSize: 20;
        readonly lineHeight: 28;
        readonly fontWeight: "700";
        readonly letterSpacing: -0.2;
    };
    readonly headlineSm: {
        readonly fontSize: 18;
        readonly lineHeight: 24;
        readonly fontWeight: "700";
        readonly letterSpacing: 0;
    };
    readonly bodyLg: {
        readonly fontSize: 16;
        readonly lineHeight: 24;
        readonly fontWeight: "500";
        readonly letterSpacing: -0.08;
    };
    readonly bodyMd: {
        readonly fontSize: 14;
        readonly lineHeight: 20;
        readonly fontWeight: "500";
        readonly letterSpacing: 0;
    };
    readonly bodySm: {
        readonly fontSize: 12;
        readonly lineHeight: 16;
        readonly fontWeight: "500";
        readonly letterSpacing: 0.12;
    };
    readonly labelLg: {
        readonly fontSize: 14;
        readonly lineHeight: 18;
        readonly fontWeight: "700";
        readonly letterSpacing: 0.14;
    };
    readonly labelMd: {
        readonly fontSize: 12;
        readonly lineHeight: 16;
        readonly fontWeight: "700";
        readonly letterSpacing: 0.24;
    };
    readonly labelSm: {
        readonly fontSize: 11;
        readonly lineHeight: 14;
        readonly fontWeight: "700";
        readonly letterSpacing: 0.44;
    };
};
export declare const shadows: {
    readonly level1: "0px 4px 20px -2px rgba(184, 82, 0, 0.06), 0px 1px 3px 0px rgba(71, 32, 0, 0.04)";
    readonly level2: "0px 12px 28px -4px rgba(255, 94, 0, 0.14), 0px 4px 10px -1px rgba(71, 32, 0, 0.05)";
    readonly level3: "0px 20px 40px -8px rgba(255, 94, 0, 0.28)";
    readonly glow: "0 0 16px rgba(255, 94, 0, 0.45)";
};
export declare const fontFamily = "Plus Jakarta Sans";
