export interface ArcadeGame<S = any> { key: string; name: string; emoji: string; desc: string; TICK_MS: number; init(seed: number): S; step(s: S, input: string | null): S; over(s: S): boolean; score(s: S): number; N?: number; C?: Record<string, number> }
export declare const ARCADE: Record<'snake' | 'flight' | '2048' | 'tower', ArcadeGame>;
export declare const ARCADE_KEYS: string[];
export declare const ARCADE_MAX_TICKS: number;
export declare function replayArcade(key: string, seed: number, inputs: [number, string][]): { score: number; ticks: number; over: boolean };
