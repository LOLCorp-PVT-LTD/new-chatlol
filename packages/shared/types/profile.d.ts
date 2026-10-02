export type Gender = 'male' | 'female';
export declare const GENDERS: { key: Gender; label: string; emoji: string }[];
export declare const MAX_INTERESTS: number;
export declare const INTEREST_GROUPS: { label: string; items: string[] }[];
export declare const INTERESTS: string[];
export interface ProfileBackground { key: string; label: string; css: string; colors: string[]; dark: boolean }
export declare const PROFILE_BACKGROUNDS: ProfileBackground[];
export declare function profileBackground(key: string | null | undefined): ProfileBackground;
export declare const PROFILE_ACCENTS: string[];
export type ShoutMood = 'hyped' | 'flex' | 'listening' | 'out' | 'question' | 'chill';
export declare const SHOUT_MOODS: { key: ShoutMood; label: string; emoji: string }[];
export declare const SHOUT_COOLDOWN_SEC = 45;
export declare const SHOUT_MAX = 140;
export type WallMood = 'hyped' | 'drippy' | 'check' | 'love';
export declare const WALL_MOODS: { key: WallMood; label: string; emoji: string }[];
export type SpotifyKind = 'track' | 'album' | 'playlist' | 'artist' | 'episode';
export interface SpotifyRef { type: SpotifyKind; id: string }
export declare function parseSpotify(input: string | null | undefined): SpotifyRef | null;
export declare function spotifyEmbedUrl(song: SpotifyRef): string;
export declare function spotifyOpenUrl(song: SpotifyRef): string;
export type ModStatus = 'active' | 'muted' | 'suspended' | 'banned';
export declare const MOD_STATUSES: ModStatus[];
export declare const STRIKE_LADDER: { strikes: number; action: 'warn' | 'mute' | 'suspend'; minutes?: number }[];
export declare const STRIKE_WINDOW_DAYS = 30;
export declare const COPYRIGHT: string;
export interface PremiumPlan { id: string; days: number; usd: number; sparks: number; label: string; best?: boolean }
export declare const PREMIUM_PLANS: PremiumPlan[];
export declare function premiumPlan(id: string): PremiumPlan | undefined;
export declare const PREMIUM_PERKS: { emoji: string; title: string }[];
