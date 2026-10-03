export type PowerKey = 'xp_surge' | 'boost_2x' | 'spotlight' | 'gate_pass' | 'ghost_mode' | 'shout_storm' | 'overdrive' | 'free_talk' | 'wipe_shield' | 'arena_shield';
export interface Power {
  key: PowerKey;
  name: string;
  emoji: string;
  desc: string;
  /** How long one use lasts; null = used up automatically when needed. */
  minutes: number | null;
  /** Works on its own; can't be activated by hand. */
  auto?: boolean;
  price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}
export declare const POWERS: Power[];
export declare const POWER_KEYS: PowerKey[];
export declare const powerByKey: (key: string) => Power | undefined;
export declare function activePowers(
  user: { powers?: Record<string, string | null> } | null | undefined,
  at?: Date,
): Partial<Record<PowerKey, string>>;
export declare const hasPower: (user: { powers?: Record<string, string | null> } | null | undefined, key: PowerKey, at?: Date) => boolean;
export type LevelGateKey = 'dm' | 'forum' | 'live' | 'arena';
export interface LevelGate {
  key: LevelGateKey;
  label: string;
  level: number;
}
export declare const LEVEL_GATES: LevelGate[];
export declare const DEFAULT_LEVEL_GATES: Record<LevelGateKey, number>;
export declare const levelGate: (key: string) => LevelGate | undefined;
export declare const INACTIVITY_RESET_DAYS: number;
export declare const INACTIVITY_WARN_DAYS: number[];
export declare function checkInReward(streak: number): { sparks: number; xp: number };
export declare const LOGIN_STREAK_MILESTONES: number[];
export declare const PREMIUM_PROFILE: {
  backgroundKinds: string[];
  song: boolean;
  headerStyles: string[];
  fonts: string[];
  sectionStyles: string[];
  sections: string[];
  pageWidths: string[];
};
export declare function stripPremiumLayout<
  L extends { header: string; font: string; width: string; sections: { type: string; style: string }[] },
>(layout: L): { layout: L; removed: string[] };
export declare const REFERRAL: { gold: number; minLevel: number };
export declare const HANDLE_CHANGE_GOLD: number;
export declare const DM_SPARK_COST: number;
export declare const PREMIUM_GEM_DROP: { chance: number; perSparks: number };
export declare const gemDropFor: (sparks: number) => number;
export declare const EXCHANGE: { sparksPerGem: number; gemsPerGold: number };
export type TicketKey = 'ban_ticket' | 'mute_ticket' | 'kick_ticket' | 'premium_gift';
export interface Ticket {
    key: TicketKey;
    name: string;
    emoji: string;
    desc: string;
    gold: number;
    minutes: number;
    immunityHours: number;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
}
export declare const TICKETS: Ticket[];
export declare const ticketByKey: (key: string) => Ticket | undefined;
export declare const KING: { key: string; name: string; emoji: string; gold: number; reignDays: number };
export interface StatusRank {
    key: 'commoner' | 'squire' | 'knight' | 'noble' | 'royalty' | 'legendary';
    label: string;
    emoji: string;
    minLevel: number;
    checkInBoost: number;
    color: string;
    badge?: boolean;
}
export declare const STATUS_RANKS: StatusRank[];
export declare const statusFor: (level: number) => StatusRank;
export declare const AD_SLOTS: { key: string; label: string; size: string; every?: number }[];
export declare const ARCADE_ECONOMY: { entry: number; perPoint: number; perPointPremium: number };
export declare const LOUNGE_LIMIT: { member: number; premium: number };
