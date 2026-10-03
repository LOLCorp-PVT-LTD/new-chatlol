export type TerritoryBonusKind = 'sparks' | 'clanxp' | 'arcade' | 'treasury' | 'gems' | 'war' | 'social' | 'xp';
export interface Territory { key: string; name: string; emoji: string; x: number; y: number; bonus: { kind: TerritoryBonusKind; pct?: number; amount?: number }; label: string }
export declare const TERRITORIES: Territory[];
export declare function territoryByKey(key: string): Territory | null;
export declare const SIEGE: { day: number; hour: number; hours: number; defenderPct: number; minLevel: number; minReputation: number; captureRep: number; holdRep: number };
export declare function siegeFor(at?: number | Date): { week: number; startsAt: string; endsAt: string; live: boolean; over: boolean };
export type HqKey = 'social' | 'economy' | 'growth' | 'community' | 'warfare' | 'prestige';
export interface HqBuilding { key: HqKey; name: string; emoji: string; desc: string; per: number }
export declare const HQ_BUILDINGS: HqBuilding[];
export declare const HQ_LEVELS: { level: number; cost: number; clanLevel: number }[];
export declare function hqLevel(hq: Partial<Record<HqKey, number>> | null | undefined, key: HqKey): number;
export declare function clanMaxMembers(rep: number, hq: Partial<Record<HqKey, number>> | null | undefined): number;
export type ObjectiveKey = 'sparks' | 'arcade' | 'social' | 'arena' | 'active' | 'donate';
export interface ClanObjective { key: ObjectiveKey; name: string; emoji: string; desc: string; n: number; target: number; reward: { xp: number; treasury: number; reputation: number } }
export declare const OBJECTIVE_POOL: Omit<ClanObjective, 'target' | 'reward'>[];
export declare function objectiveTier(rep: number): number;
export declare function clanObjectives(week: number, tier: number): ClanObjective[];
export interface ClanAchievement { key: string; name: string; emoji: string; desc: string; stat: 'level' | 'members' | 'wins' | 'captured' | 'held' | 'objectives' | 'hqMax' | 'trophies' | 'treasury' | 'reputation' | 'ageDays'; goal: number; reputation: number; rare?: boolean }
export declare const CLAN_ACHIEVEMENTS: ClanAchievement[];

/** API shapes. */
export interface TerritoryState extends Territory {
  holder: { id: string; name: string; tag: string; emoji: string; since: string } | null;
  history: { clanId: string; name: string; tag: string; emoji: string; from: string; to: string | null }[];
  battles: { week: number; winnerId: string | null; top: { clanId: string; name?: string; tag?: string; score: number }[] }[];
  contenders: { clanId: string; name?: string; tag?: string; emoji?: string; score: number; defending: boolean }[];
}
export interface ClanWorldInfo {
  reputation: number;
  hq: Partial<Record<HqKey, number>>;
  tier: number;
  objectives: (ClanObjective & { progress: number; done: boolean })[];
  achievements: { key: string; at: string }[];
  territories: string[];
  siegeTarget: string | null;
  minLevel: number;
}
