export declare const MONTHS: string[];
export declare const WEEKDAYS: string[];
export declare function toIsoDate(y: number, m: number, d: number): string;
export declare function parseIsoDate(s: string | null | undefined): { y: number; m: number; d: number } | null;
export declare function daysInMonth(y: number, m: number): number;
export interface CalendarCell { y: number; m: number; d: number; inMonth: boolean; iso: string }
export declare function monthGrid(y: number, m: number): CalendarCell[];
export declare function formatDate(iso: string | null | undefined): string;
