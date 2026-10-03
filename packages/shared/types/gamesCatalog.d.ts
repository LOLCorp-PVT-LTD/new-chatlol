export interface ProfileGame { id: string; name: string; logo: string | null; emoji: string | null; color: string | null }
export declare const EXTRA_GAMES: ProfileGame[];
export declare function gameFromSteam(appid: string | number, name: string): ProfileGame;
export declare const MAX_PROFILE_GAMES: number;
export declare function cleanGames(list: unknown): ProfileGame[];
