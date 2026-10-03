export type WarFront = 'xp' | 'social' | 'wins' | 'active' | 'participation' | 'missions';
export declare const WAR_FRONTS: Record<WarFront, string>;
export type WarModeKey = 'total' | 'rep' | 'social' | 'activity' | 'game' | 'mission' | 'bounty' | 'koth' | 'chaos';
export interface WarMode { key: WarModeKey; name: string; emoji: string; desc: string; cats?: Partial<Record<WarFront, number>>; race?: boolean; koth?: boolean; chaos?: boolean }
export declare const CLAN_WAR_MODES: WarMode[];
export declare function warModeFor(key: string | null | undefined): WarMode;
export declare const WAR_HOURS: number[];
export interface WarMission { kind: 'xp' | 'social' | 'wins' | 'active'; label: string; target: number }
export declare function warMissions(hours: number): WarMission[];
export interface WarRace extends WarMission { id: number; points: number; at: number; claimedBy?: 'a' | 'b' | null; a?: number; b?: number }
export declare function warRaces(mode: string, hours: number, seed?: number): WarRace[];
export interface WarSideStats { xp?: number; social?: number; wins?: number; active?: number; members?: number; missions?: number; done?: string[]; progress?: Record<string, number> }
export declare function warScore(
  w: { mode?: string; a?: WarSideStats; b?: WarSideStats; races?: WarRace[]; koth?: { a?: number; b?: number; lead?: 'a' | 'b' | null; since?: number }; endsAt?: string | null },
  at?: number,
): { a: number; b: number; fronts: { key: string; label: string; weight: number; a: number; b: number; winner?: 'a' | 'b' | null }[] };
