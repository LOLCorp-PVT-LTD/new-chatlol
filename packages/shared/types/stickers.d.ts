export interface CustomEmoji { code: string; text?: string; icon?: string; face?: string; bg: [string, string]; fg: string; pack?: string }
export interface EmojiPack { key: string; name: string; description: string; price: number; emojis: CustomEmoji[] }
export interface NotoSticker { id: string; cp: string; label: string }
export interface StickerPack { key: string; name: string; description: string; price: number; stickers: NotoSticker[] }
export type RichPart = { t: 'text'; v: string } | { t: 'emoji'; code: string } | { t: 'mention'; handle: string };
/** A sticker attached to a message, comment, shout or profile comment. */
export interface Sticker { kind: 'noto' | 'giphy'; id: string; url: string; still?: string | null; w?: number | null; h?: number | null; label?: string }
/** What a client sends to use a sticker. */
export type StickerInput = { kind: 'noto'; id: string } | { kind: 'giphy'; id: string; url: string; w?: number | null; h?: number | null };
/** GET /stickers: every pack, and which ones you own. */
export interface StickerCatalog { owned: string[]; emojiPacks: EmojiPack[]; stickerPacks: StickerPack[]; giphy: { available: boolean; owned: boolean; key: string; price: number } }
export interface GiphySticker { id: string; url: string; preview: string; w: number | null; h: number | null; title: string }
export declare const EMOJI_PACKS: EmojiPack[];
export declare function customEmoji(code: string): CustomEmoji | null;
export declare function customEmojiSvg(e: CustomEmoji): string;
export declare function customEmojiUri(codeOrEmoji: string | CustomEmoji): string;
export declare function parseRich(text: string | null | undefined): RichPart[];
export declare function isJumbo(parts: RichPart[]): boolean;
export declare function customEmojiCodes(text: string): string[];
export declare function notoAnimatedUrl(cp: string): string;
export declare function notoStillUrl(cp: string): string;
export declare const STICKER_PACKS: StickerPack[];
export declare function notoSticker(id: string): { pack: StickerPack; sticker: NotoSticker; url: string; still: string } | null;
export declare const GIPHY_UNLOCK: { key: string; name: string; description: string; price: number };
export declare function isGiphyMediaUrl(u: string | null | undefined): boolean;
export declare function stickerStoreItems(): [string, string, string, string, number, string, string, string][];
