export type ClanPolicy = 'open' | 'application' | 'invite' | 'closed';
export declare const CLAN_JOIN_POLICIES: { key: ClanPolicy; label: string }[];
export declare function normalizePolicy(p: string | null | undefined): ClanPolicy;
export type ClanPerm = 'invite' | 'recruit' | 'kick' | 'promote' | 'treasury' | 'wars' | 'siege' | 'settings';
export declare const CLAN_PERMS: { key: ClanPerm; label: string }[];
export interface ClanRank { key: string; name: string; emoji: string; rank: number; perms: ClanPerm[] }
export declare const CLAN_RANKS: ClanRank[];
export declare const CLAN_CUSTOM_ROLES: { minLevel: number; max: number };
export declare const RECRUIT_DAYS: number;
export declare function clanRank(role: string, customRoles?: ClanRank[]): ClanRank;
export declare function clanCan(role: string, perm: ClanPerm, customRoles?: ClanRank[]): boolean;
export declare const CLAN_ROLES: Record<string, string>;
export declare const CLAN_FOUND: { gold: number; minLevel: number };
export declare const REP_PER_SPARKS: number;
export interface ClanLevel { level: number; rep: number; members: number; perk: string; key?: 'tag' | 'wars' | 'lounge' | 'banner' | 'bonus' | 'radio' | 'legend' }
export declare const CLAN_LEVELS: ClanLevel[];
export declare function clanLevelFor(rep: number): ClanLevel;
export declare function nextClanLevel(rep: number): ClanLevel | null;
export declare function clanHas(rep: number, key: NonNullable<ClanLevel['key']>, prestige?: number): boolean;
export declare const CLAN_WAR: { hours: number; winRep: number; maxStake: number; minLevel: number };
export interface ClanEvent { key: 'rush' | 'arcade' | 'social' | 'arena'; name: string; emoji: string; desc: string }
export declare const CLAN_EVENTS: ClanEvent[];
export declare const CLAN_EVENT_PRIZES: { place: number; gems: number }[];
export declare function clanEventFor(at?: number | Date): ClanEvent & { week: number; startsAt: string; endsAt: string; weekend: boolean };
export declare const CLAN_TAG_RE: RegExp;

export interface ClanSummary {
  id: string; name: string; tag: string; emoji: string; description: string; color: string | null; bannerUrl: string | null;
  policy: ClanPolicy; requirements: { minLevel: number; minAgeDays: number; minVibe: number }; customRoles: ClanRank[]; rep: number; level: number; nextLevel: ClanLevel | null; memberCount: number; maxMembers: number; reputation: number; prestige: number; minLevel: number;
  wins: number; losses: number; treasury: number; trophies: { week: number; place: number; at: string }[]; loungeId: string | null; createdAt: string;
}
/** `score` is War Points; `xp` the Clan XP earned; `done` the war missions completed. */
export interface ClanWarSide { id: string; name?: string; tag?: string; emoji?: string; score: number; xp: number; active: number; done: string[] }
export interface ClanWar {
  id: string; status: 'pending' | 'active' | 'finished' | 'declined' | 'expired'; stake: number; startsAt: string | null; endsAt: string | null; winnerId: string | null;
  mode: import('./clanWars').WarModeKey; hours: number; a: ClanWarSide; b: ClanWarSide; incoming?: boolean;
  fronts: { key: string; label: string; weight: number; a: number; b: number; winner?: 'a' | 'b' | null }[];
  missions: import('./clanWars').WarMission[];
  races: { id: number; kind: string; label: string; target: number; points: number; claimedBy: 'a' | 'b' | null; a: number; b: number }[];
  nextDropAt: string | null; kothLead: 'a' | 'b' | null;
}
export interface ClanRecord { clan: { id: string; name: string; tag: string; emoji: string }; wins: number; losses: number; draws: number }
