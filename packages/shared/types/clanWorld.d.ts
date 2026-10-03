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
export interface ClanAchievement { key: string; name: string; emoji: string; desc: string; stat: 'level' | 'members' | 'wins' | 'captured' | 'held' | 'objectives' | 'hqMax' | 'trophies' | 'treasury' | 'reputation' | 'ageDays' | 'bestStreak'; goal: number; reputation: number; rare?: boolean }
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
export declare const CONTRIBUTION: { perDeposit: number; recruit: number; quest: number; war: number; mvpSparks: number };
export declare const CLAN_SEASON: { weeks: number };
export declare function clanSeasonFor(week?: number): { season: number; number: number; startWeek: number; endWeek: number; startsAt: string; endsAt: string };
export interface ClanContributor { user: import('./types').UserPublic; points: number; xp: number; reputation: number; quests: number; wars: number; recruits: number; donated: number }
export declare const SEASON_POINTS: { perXp: number; quest: number; warWin: number; warLoss: number; capture: number; hold: number; bounty: number; event: number };
export declare const SEASON_PRIZES: { place: number; reputation: number; gems: number; title: string }[];
export type ClanBoardKey = 'season' | 'reputation' | 'level' | 'weekly' | 'active' | 'wins' | 'streak' | 'achievements' | 'territory' | 'prestige' | 'members' | 'alliances';
export declare const CLAN_BOARDS: { key: ClanBoardKey; name: string; emoji: string }[];
export type BountyKey = 'overtake' | 'xp' | 'quest' | 'recruit' | 'active';
export declare const CLAN_BOUNTY_POOL: { key: BountyKey; emoji: string; label: (t: { name?: string; target: number }) => string }[];
export declare const BOUNTY_REWARD: { reputation: number; treasury: number };
export interface ClanLiveEventDef { key: string; name: string; emoji: string; desc: string; xp?: number; social?: number; mint?: number; sprint?: boolean; siege?: number }
export declare const CLAN_LIVE_EVENTS: ClanLiveEventDef[];
export declare const LIVE_EVENT_HOURS: number;
export declare const SPRINT_PRIZES: { reputation: number; treasury: number }[];
export declare const CLAN_PRESTIGE: { max: number; reputation: number; minLevel: number };
export declare function prestigeStars(n: number): string;
export interface ClanBounty { key: BountyKey; emoji: string; label: string; target: number; progress: number; done: boolean }
export interface ClanLiveEvent extends ClanLiveEventDef { startsAt: string; endsAt: string }
export interface ClanBoardRow { rank: number; alliance?: { id: string; name: string; emoji: string; tags: string[] }; clan?: { id: string; name: string; tag: string; emoji: string; prestige: number }; user?: import('./types').UserPublic; value: number; sub?: string }
export interface HqStage { stage: number; name: string; emoji: string; minLevel: number; prestige?: number; desc: string }
export declare const HQ_STAGES: HqStage[];
export declare function hqStageFor(level: number, prestige?: number): HqStage;
export interface ClanCosmetic { key: string; kind: 'badge' | 'banner'; name: string; cost: number; minLevel: number; upgrade?: number; prestige?: number; css?: string }
export declare const CLAN_COSMETICS: ClanCosmetic[];
export declare function clanCosmetic(key: string | null | undefined): ClanCosmetic | null;
export declare const ALLIANCE: { maxClans: number; minLevel: number };
export interface AllianceSummary { id: string; name: string; emoji: string; leaderClanId: string; clans: { id: string; name: string; tag: string; emoji: string; reputation: number }[]; reputation: number; invites: string[] }
