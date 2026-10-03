export interface YouTubeVideo { id: string; start: number; url: string; shorts: boolean }
export declare function youtubeLink(raw: string): YouTubeVideo | null;
export declare function isYouTubeUrl(raw: string): boolean;
export declare function youtubeVideos(text: string | null | undefined, max?: number): YouTubeVideo[];
export declare function withoutVideos(text: string | null | undefined): string;
