export interface FestivalSummary { key: string; name: string; emoji: string; greeting: string; gradient: string; day: string; startsAt: string; endsAt: string }
export interface Festival { key: string; name: string; emoji: string; greeting: string; gradient: string; before: number; after: number; date(y: number): string | undefined; drops: [string, string][]; lounge: [string, string, string, string]; trivia: [string, string, string, string, string][] }
export declare const FESTIVALS: Festival[];
export declare function festivalByKey(k: string | null | undefined): Festival | null;
export declare function activeFestival(at?: number | Date, disabled?: string[]): FestivalSummary | null;
export declare function upcomingFestivals(at?: number | Date, n?: number): FestivalSummary[];
export declare function festivalDrop(key: string, dayNumber: number): [string, string] | null;
export declare function festivalTrivia(key: string): [string, string, string, string, string, string][];
