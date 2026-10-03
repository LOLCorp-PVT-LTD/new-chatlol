type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
interface ShopCosmetic { key: string; label: string; price: number; rarity: Rarity; gold: number | null }
export declare const PROFILE_COVERS: (ShopCosmetic & { css: string })[];
export declare const BUTTON_STYLES: (ShopCosmetic & { css: Record<string, string> })[];
export declare const SHOP_FONTS: (ShopCosmetic & { family: string; css: string })[];
export declare const coverByKey: (k: string | null | undefined) => (ShopCosmetic & { css: string }) | undefined;
export declare const buttonStyleByKey: (k: string | null | undefined) => (ShopCosmetic & { css: Record<string, string> }) | undefined;
export declare const shopFontByKey: (k: string | null | undefined) => (ShopCosmetic & { family: string; css: string }) | undefined;
export declare const googleFontUrl: (family: string) => string;
