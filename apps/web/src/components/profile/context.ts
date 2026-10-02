import { inject, type InjectionKey, type Ref } from 'vue';
import type { Post, ProfileLayout, ProfileRatings, Showcase, UserPublic, VibeScore, WallNote } from '@chatlol/shared';

/** Everything the profile's sections read and do, provided once by ProfileView. */
export interface ProfileCtx {
  user: Ref<UserPublic>;
  layout: Ref<ProfileLayout>;
  isMe: Ref<boolean>;
  editing: Ref<boolean>;
  accent: Ref<string>;
  /** True when text sitting directly on the member's background should be white. */
  darkBg: Ref<boolean>;
  autoplay: Ref<boolean>;
  posts: Ref<Post[]>;
  ratings: Ref<ProfileRatings | null>;
  counts: Ref<{ wall: number; photos: number }>;
  gallery: Ref<Post[]>;
  albums: Ref<string[]>;
  album: Ref<string | null>;
  uploading: Ref<boolean>;
  wall: Ref<WallNote[]>;
  showcase: Ref<Showcase>;
  rateProfile: (score: VibeScore) => Promise<void>;
  postNote: (body: string, mood: string | null) => Promise<boolean>;
  deleteNote: (id: string) => Promise<void>;
  setAlbum: (album: string | null) => Promise<void>;
  addPhoto: (file: File) => Promise<void>;
}

export const PROFILE_CTX: InjectionKey<ProfileCtx> = Symbol('profile');

export function useProfileCtx(): ProfileCtx {
  const c = inject(PROFILE_CTX);
  if (!c) throw new Error('Profile sections must be inside a profile page');
  return c;
}
