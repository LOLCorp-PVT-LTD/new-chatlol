import type { RatingSummary, TierKey, VibeScore, StoreItem, Rarity } from './types';
export declare const TIERS: {
    key: TierKey;
    score: VibeScore;
    label: string;
    emoji: string;
    xp: number;
}[];
export declare const tierByScore: (s: number) => {
    key: TierKey;
    score: VibeScore;
    label: string;
    emoji: string;
    xp: number;
};
export declare const tierByKey: (k: TierKey) => {
    key: TierKey;
    score: VibeScore;
    label: string;
    emoji: string;
    xp: number;
};
export declare const REACTIONS: readonly [{
    readonly key: "fire";
    readonly emoji: "🔥";
}, {
    readonly key: "heart";
    readonly emoji: "🧡";
}, {
    readonly key: "lol";
    readonly emoji: "😂";
}, {
    readonly key: "wow";
    readonly emoji: "🤯";
}, {
    readonly key: "hundred";
    readonly emoji: "💯";
}];
export declare function summarizeRatings(dist: [number, number, number, number, number]): RatingSummary;
/** Converts avg (1..5) to the 0–10 "vibe score" shown in the UI. */
export declare const toTen: (avg: number) => number;
export declare const xpForLevel: (level: number) => number;
export declare function levelForXp(xp: number): number;
export declare function levelProgress(xp: number): {
    level: number;
    into: number;
    needed: number;
    pct: number;
};
export declare const LEVEL_TITLES: readonly [readonly [1, "Fresh Spark"], readonly [5, "Golden Hour Regular"], readonly [10, "Vibe Curator"], readonly [16, "Vibe Master"], readonly [25, "Sunset Legend"], readonly [40, "God Tier Icon"]];
export declare const levelTitle: (lvl: number) => "Fresh Spark" | "Golden Hour Regular" | "Vibe Curator" | "Vibe Master" | "Sunset Legend" | "God Tier Icon";
export declare const COMBO_STEP = 0.25;
export declare const COMBO_MAX = 3;
export declare const comboMultiplier: (combo: number) => number;
export declare const ROULETTE_BASE_SPARKS = 15;
export declare const ROULETTE_BASE_XP = 20;
export declare const ARENA_RAKE = 0.05;
export declare const ARENA_MIN_STAKE = 5;
export declare const ARENA_MAX_STAKE = 500;
export declare function arenaOdds(agreePool: number, disagreePool: number): {
    agree: number;
    disagree: number;
    agreePct: number;
};
export declare const REWARDS: {
    readonly dailyLogin: {
        readonly sparks: 10;
        readonly xp: 15;
    };
    readonly drop: {
        readonly sparks: 120;
        readonly xp: 80;
    };
    readonly post: {
        readonly sparks: 20;
        readonly xp: 30;
    };
    readonly rate: {
        readonly sparks: 2;
        readonly xp: 5;
    };
    readonly comment: {
        readonly sparks: 3;
        readonly xp: 8;
    };
    readonly receiveGodTier: {
        readonly sparks: 5;
        readonly xp: 10;
    };
    readonly questDailyOracle: {
        readonly sparks: 100;
        readonly xp: 150;
        readonly target: 20;
    };
    readonly streakMilestone: (days: number) => {
        sparks: number;
        xp: number;
    };
};
export declare const STREAK_MILESTONES: number[];
export declare const CRATE_ODDS: Record<Rarity, number>;
export declare function rollRarity(rand?: number): Rarity;
export declare const GIFTS: Pick<StoreItem, 'id' | 'name' | 'emoji' | 'price' | 'rarity'>[];
export declare const MIN_AGE = 18;
export declare function ageFrom(birthdate: string, now?: Date): number;
export declare function compact(n: number): string;
export declare function timeAgo(iso: string, now?: number): string;
export declare function countdown(toIso: string, now?: number): string;
/** Gems are sold for money and only buy cosmetics. Loot crates and anything wager-like stay earned-Sparks-only. */
export declare function gemPriceFor(kind: string, sparksPrice: number): number | null;
export declare const GEM_PACKS: import('./types').GemPack[];
export declare const gemPack: (id: string) => import("./types").GemPack | undefined;

export declare const REACTION_KEYS: import('./types').ReactionKind[];
