export interface ArcadeGame<S = any> {
  key: string; name: string; emoji: string; desc: string; TICK_MS: number;
  /** Turn-based: one input per move instead of per tick. */
  TURN?: boolean;
  /** How the play view feeds inputs: steer (pointer x / arrows), tap (one action), grid (tap a cell). */
  controls?: 'steer' | 'tap' | 'grid';
  tapInput?: string;
  cols?: number; rows?: number;
  gridInput?(i: number, alt?: boolean): string;
  faces?: string[];
  init(seed: number): S; step(s: S, input: string | null): S; over(s: S): boolean; score(s: S): number; N?: number; C?: Record<string, number>;
}
export type ArcadeKey = 'snake' | 'flight' | '2048' | 'tower' | 'breakout' | 'meteor' | 'runner' | 'whack' | 'memory' | 'mines' | 'echo' | 'slide';
export declare const ARCADE: Record<ArcadeKey, ArcadeGame>;
export declare const ARCADE_KEYS: string[];
export declare const ARCADE_MAX_TICKS: number;
export declare function replayArcade(key: string, seed: number, inputs: [number, string][]): { score: number; ticks: number; over: boolean };
export declare function brickRect(i: number): { x: number; y: number; w: number; h: number; row: number };
