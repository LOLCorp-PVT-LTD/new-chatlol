export declare const CLAN_FOUND: { gold: number; minLevel: number };
export declare const CLAN_JOIN_POLICIES: { key: 'open' | 'request' | 'invite'; label: string }[];
export declare const CLAN_ROLES: Record<'leader' | 'officer' | 'member', string>;
export declare const REP_PER_SPARKS: number;
export interface ClanLevel { level: number; rep: number; members: number; perk: string; key?: 'tag' | 'wars' | 'lounge' | 'banner' | 'bonus' | 'radio' | 'legend' }
export declare const CLAN_LEVELS: ClanLevel[];
export declare function clanLevelFor(rep: number): ClanLevel;
export declare function nextClanLevel(rep: number): ClanLevel | null;
export declare function clanHas(rep: number, key: NonNullable<ClanLevel['key']>): boolean;
export declare const CLAN_WAR: { hours: number; winRep: number; maxStake: number; minLevel: number };
export interface ClanEvent { key: 'rush' | 'arcade' | 'social' | 'arena'; name: string; emoji: string; desc: string }
export declare const CLAN_EVENTS: ClanEvent[];
export declare const CLAN_EVENT_PRIZES: { place: number; gems: number }[];
export declare function clanEventFor(at?: number | Date): ClanEvent & { week: number; startsAt: string; endsAt: string; weekend: boolean };
export declare const CLAN_TAG_RE: RegExp;

export interface ClanSummary {
  id: string; name: string; tag: string; emoji: string; description: string; color: string | null; bannerUrl: string | null;
  policy: 'open' | 'request' | 'invite'; rep: number; level: number; nextLevel: ClanLevel | null; memberCount: number; maxMembers: number;
  wins: number; losses: number; treasury: number; trophies: { week: number; place: number; at: string }[]; loungeId: string | null; createdAt: string;
}
export interface ClanWarSide { id: string; name?: string; tag?: string; emoji?: string; score: number }
export interface ClanWar { id: string; status: 'pending' | 'active' | 'finished' | 'declined' | 'expired'; stake: number; startsAt: string | null; endsAt: string | null; winnerId: string | null; a: ClanWarSide; b: ClanWarSide; incoming?: boolean }
