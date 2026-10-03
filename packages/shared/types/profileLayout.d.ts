export type SectionType =
  | 'about' | 'details' | 'interests' | 'song' | 'stats' | 'rating' | 'wall' | 'gallery' | 'photos' | 'topPhotos'
  | 'feed' | 'shouts' | 'friends' | 'followers' | 'following' | 'badges' | 'level' | 'threads' | 'text' | 'quote'
  | 'links' | 'games' | 'currently' | 'video' | 'spacer';
export type SectionSize = 'third' | 'half' | 'twothirds' | 'full';
export type SectionStyle = 'card' | 'glass' | 'accent' | 'outline' | 'plain';
export type HeaderStyle = 'cover' | 'centered' | 'split' | 'compact';
export type PageWidth = 'narrow' | 'normal' | 'wide';
export type SectionGap = 'tight' | 'normal' | 'airy';
export type CornerStyle = 'sharp' | 'soft' | 'round';
export type ProfileFont = 'default' | 'serif' | 'mono' | 'rounded' | 'condensed' | `font_${string}`;
export interface SectionConfig {
  limit?: number;
  columns?: number;
  body?: string;
  text?: string;
  by?: string;
  videoId?: string;
  height?: 'sm' | 'md' | 'lg';
  /** Links, Currently… rows, or games (Games I play). */
  items?: { label?: string; url?: string; value?: string; id?: string; name?: string; logo?: string | null; emoji?: string | null; color?: string | null }[];
}
export interface ProfileSection { id: string; type: SectionType; size: SectionSize; style: SectionStyle; title: string; config: SectionConfig }
export interface ProfileLayout { header: HeaderStyle; width: PageWidth; gap: SectionGap; corners: CornerStyle; font: ProfileFont; sections: ProfileSection[] }
export interface SectionDef {
  key: SectionType;
  label: string;
  emoji: string;
  desc: string;
  sizes: SectionSize[];
  size: SectionSize;
  multi?: boolean;
  config?: Record<string, { min?: number; max?: number; def: unknown }>;
}
interface Opt<K extends string> { key: K; label: string; desc?: string }
export declare const SECTION_SIZES: (Opt<SectionSize> & { cols: number })[];
export declare function sectionCols(size: SectionSize): number;
export declare const SECTION_STYLES: Opt<SectionStyle>[];
export declare const HEADER_STYLES: Opt<HeaderStyle>[];
export declare const PAGE_WIDTHS: (Opt<PageWidth> & { px: number })[];
export declare const SECTION_GAPS: (Opt<SectionGap> & { px: number })[];
export declare const CORNER_STYLES: (Opt<CornerStyle> & { px: number })[];
export declare const PROFILE_FONTS: (Opt<ProfileFont> & { css: string; native?: string; item?: string; family?: string })[];
export declare const PROFILE_SECTIONS: SectionDef[];
export declare function sectionDef(type: string): SectionDef | undefined;
export declare const MAX_PROFILE_SECTIONS: number;
export declare const CURRENTLY_LABELS: string[];
export declare const SPACER_HEIGHTS: Record<'sm' | 'md' | 'lg', number>;
export declare function parseYouTube(input: string | null | undefined): string | null;
export declare function newSectionId(): string;
export declare function makeSection(type: SectionType, overrides?: Partial<ProfileSection>): ProfileSection;
export declare const LAYOUT_PRESETS: { key: string; label: string; desc: string; build: () => ProfileLayout }[];
export declare function defaultProfileLayout(): ProfileLayout;
export declare function normalizeLayout(raw: unknown): ProfileLayout;
export declare function layoutText(layout: ProfileLayout): string;
export declare const SHOWCASE_TYPES: SectionType[];
