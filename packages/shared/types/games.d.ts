export type GameKey = 'chess' | 'checkers' | 'poker' | 'tycoon' | 'ludo' | 'dominoes' | 'backgammon' | 'yahtzee' | 'trivia' | 'mahjong' | 'words' | 'pool' | 'tower';
export type StakeCurrency = 'none' | 'sparks' | 'gems' | 'gold';
export interface GameInfo { key: GameKey; name: string; emoji: string; min: number; max: number; desc: string; turnSeconds: number }
export interface ChessMove { from: number; to: number; promo?: 'Q' | 'R' | 'B' | 'N'; castle?: 'K' | 'Q'; enPassant?: boolean; double?: boolean }
export interface ChessState { board: (string | null)[]; turn: 'w' | 'b'; castling: Record<string, boolean>; ep: number | null; halfmove: number; result: { winner: 'w' | 'b' | null; reason: string } | null; last: { from: number; to: number } | null }
export declare function initChess(): ChessState;
export declare function legalMoves(s: ChessState): ChessMove[];
export declare function chessMove(s: ChessState, side: 'w' | 'b', m: { from: number; to: number; promo?: string }): ChessState;
export declare function inCheck(s: ChessState, side?: 'w' | 'b'): boolean;
export declare const squareName: (i: number) => string;
export interface CheckersMove { from: number; to: number; capture?: number }
export interface CheckersState { board: (string | null)[]; turn: 'r' | 'b'; chain: number | null; result: { winner: 'r' | 'b' | null; reason: string } | null; last: { from: number; to: number } | null; moves?: CheckersMove[] }
export declare function initCheckers(): CheckersState;
export declare function checkersMoves(s: CheckersState): CheckersMove[];
export declare function checkersMove(s: CheckersState, who: 'r' | 'b', m: { from: number; to: number }): CheckersState;
export interface PokerPlayer { chips: number; hole: string[]; bet: number; totalIn: number; folded: boolean; allIn: boolean; out: boolean; acted: boolean }
export interface PokerState {
    players: PokerPlayer[]; board: string[]; dealer: number; toAct: number | null; street: 'preflop' | 'flop' | 'turn' | 'river';
    currentBet: number; minRaise: number; handNo: number; maxHands: number; blinds: { sb: number; bb: number };
    lastHand: { board: string[]; shown: Record<string, { hole: string[]; hand: string }>; won: { seat: number; amount: number }[] } | null;
    result: { shares: number[]; reason: string } | null;
}
export declare function pokerOptions(s: PokerState, seat: number): { toCall: number; canCheck: boolean; minRaiseTo: number; maxRaiseTo: number } | null;
export declare function pokerEvaluate(cards: string[]): number[];
export declare const START_CHIPS: number;
export interface TycoonTile { kind: 'go' | 'property' | 'chance' | 'jail' | 'tax' | 'rail' | 'parking' | 'gotojail'; name: string; group?: string; price?: number; rent?: number; amount?: number }
export interface TycoonState {
    players: { pos: number; cash: number; out: boolean }[]; owner: (number | null)[]; houses: number[]; turn: number; round: number; maxRounds: number;
    phase: 'roll' | 'buy' | 'end'; pending: number | null; lastRoll: [number, number] | null; log: string[];
    result: { winners: number[]; worth: number[]; reason: string } | null;
}
export declare const TYCOON_BOARD: TycoonTile[];
export declare function netWorth(s: TycoonState, seat: number): number;
export declare const GAMES: Record<GameKey, GameInfo & Record<string, unknown>>;
export declare const GAME_KEYS: GameKey[];
export declare const WAGER_CURRENCIES: StakeCurrency[];
export declare const ARENA_RAKE_PCT: number;
export interface Arena {
    id: string; name: string; game: GameKey; hostId: string; visibility: 'public' | 'private'; code: string | null;
    playerIds: string[]; invitedIds: string[]; forfeitIds: string[]; stake: { currency: StakeCurrency; amount: number };
    status: 'lobby' | 'playing' | 'finished' | 'closed'; version: number; turnDeadline: string | null; turnSeat: number | null; mySeat: number | null;
    state: ChessState | CheckersState | PokerState | TycoonState | null;
    outcome: { winners?: number[]; shares?: number[]; reason?: string } | null; payouts: { userId: string; amount: number }[];
    players: import('./types').UserPublic[]; host: import('./types').UserPublic; createdAt: string;
}
export declare const LUDO_START: number[];
export declare const LUDO_SAFE: Set<number>;
export declare const LUDO_HOME: number;
export declare function ludoSquare(seat: number, p: number, n?: number): number;
export declare function ludoCorner(n: number, seat: number): number;
export declare function dominoPlays(s: unknown, seat?: number): { tile: number; side: 'left' | 'right' }[];
export declare function bgMoves(s: unknown, seat?: number): { from: 'bar' | number; die: number; to: number | 'off' }[];
export declare const YAHTZEE_BOXES: { key: string; label: string }[];
export declare function yahtzeeScore(box: string, dice: number[]): number;
export declare function yahtzeeTotal(card: Record<string, number>): number;
export declare const MAHJONG_SLOTS: { x: number; y: number; z: number }[];
export declare function mahjongFree(present: boolean[], i: number): boolean;
export declare function canMake(word: string, tiles: string[]): boolean;
export declare const POOL: { W: number; H: number; R: number; POCKET: number };
export declare const POCKETS: [number, number][];
export declare function simulateShot(balls: { id: number; x: number; y: number; in: boolean }[], angle: number, power: number, opts?: { frames?: boolean }): { balls: { id: number; x: number; y: number; in: boolean }[]; potted: number[]; firstHit: number | null; frames: number[][][] };
export declare const TOWER: { W: number; BASE: number; FLOORS: number };
export declare function towerX(width: number, floor: number, ms: number): number;
