import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import type { Post, ProfileLayout, ProfileRatings, Showcase, UserPublic, VibeScore, WallNote } from '@chatlol/shared';
import { SHOWCASE_TYPES, defaultProfileLayout, profileBackground } from '@chatlol/shared';
import { api, uploadUri } from '../../lib/api';
import { errorToast, toast } from '../../lib/actions';
import { pickImage } from '../../lib/native';
import { useSession } from '../../lib/store';
import type { ProfileCtx } from './Sections';

/**
 * Loads a profile and only the data its sections need (gallery, comments, friends/followers/shouts…), and
 * the actions sections can take. `layout` can be overridden (the builder's draft) — new section types load on demand.
 */
export function useProfileData(handle: string | undefined, draft?: ProfileLayout | null) {
  const me = useSession((s) => s.user);
  const [user, setUser] = useState<UserPublic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [ratings, setRatings] = useState<ProfileRatings | null>(null);
  const [gallery, setGallery] = useState<Post[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [album, setAlbumState] = useState<string | null>(null);
  const [wall, setWall] = useState<WallNote[]>([]);
  const [wallCount, setWallCount] = useState(0);
  const [showcase, setShowcase] = useState<Showcase>({});
  const loaded = useRef({ gallery: false, wall: false, showcase: new Set<string>() });
  const isMe = !!me && (!handle || handle === me.handle);
  const h = handle ?? me?.handle;
  const saved = user?.profile.layout ?? defaultProfileLayout();
  const layout = draft ?? saved;

  const reload = useCallback(async () => {
    if (!h) return;
    try {
      const r = await api.user(h);
      loaded.current = { gallery: false, wall: false, showcase: new Set() };
      setUser(r.user);
      setPosts(r.posts);
      setRatings(r.profileRatings);
      setWallCount(r.wallCount);
      setShowcase({});
    } catch (e) { errorToast(e); }
  }, [h]);
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const types = layout.sections.map((s) => s.type).join();
  useEffect(() => {
    if (!user) return;
    const l = loaded.current;
    const want = new Set(types.split(','));
    if (want.has('gallery') && !l.gallery) {
      l.gallery = true;
      void api.gallery(user.id).then((g) => { setGallery(g.photos); setAlbums(g.albums); });
    }
    if (want.has('wall') && !l.wall) {
      l.wall = true;
      void api.wall(user.id).then((w) => setWall(w.notes));
    }
    const need = SHOWCASE_TYPES.filter((t) => want.has(t) && !l.showcase.has(t));
    if (need.length) {
      need.forEach((t) => l.showcase.add(t));
      void api.showcase(user.id, need, 24).then((r) => setShowcase((s) => ({ ...s, ...r })));
    }
  }, [user, types]);

  const bg = user?.profile.background;
  const darkBg = !bg || bg.kind === 'image' ? true : bg.kind === 'preset' ? profileBackground(bg.value).dark : isDarkHex(bg.value);

  const ctx: ProfileCtx | null = user
    ? {
        user,
        layout,
        isMe,
        signedIn: !!me,
        myId: me?.id,
        accent: user.profile.accent,
        darkBg,
        autoplay: (me ? me.settings.autoplayMusic : true) && !isMe,
        posts,
        ratings,
        gallery,
        albums,
        album,
        wall,
        wallCount,
        showcase,
        rateProfile: async (score: VibeScore) => {
          if (!me) return router.push('/join');
          try { setRatings((await api.rateProfile(user.id, score)).ratings); toast({ kind: 'info', title: 'Vibe locked in ⭐' }); } catch (e) { errorToast(e); }
        },
        postNote: async (body, mood, sticker = null) => {
          try {
            const r = await api.postWall(user.id, { body, mood, sticker });
            setWall((w) => [r.note, ...w]);
            setWallCount((n) => n + 1);
            return true;
          } catch (e) { errorToast(e); return false; }
        },
        deleteNote: async (id) => {
          await api.deleteWallNote(id);
          setWall((w) => w.filter((x) => x.id !== id));
          setWallCount((n) => n - 1);
        },
        setAlbum: async (a) => {
          setAlbumState(a);
          const g = await api.gallery(user.id, a ?? undefined);
          setGallery(g.photos);
          setAlbums(g.albums);
        },
        addPhoto: async () => {
          const uri = await pickImage('library');
          if (!uri) return;
          try {
            const mediaUrl = await uploadUri(uri);
            await api.createPost({ kind: 'photo', body: '', mediaUrl, album: album ?? null, inFeed: false });
            const g = await api.gallery(user.id, album ?? undefined);
            setGallery(g.photos);
            setAlbums(g.albums);
            toast({ kind: 'info', title: 'Added to your gallery 📷' });
          } catch (e) { errorToast(e); }
        },
      }
    : null;
  return { ctx, user, setUser, reload, saved };
}

function isDarkHex(hex: string) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}
