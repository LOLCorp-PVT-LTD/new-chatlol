import React, { useState } from 'react';
import { Linking, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { StickerInput, Post, ProfileLayout, ProfileRatings, ProfileSection, Showcase, UserPublic, VibeScore, WallNote } from '@chatlol/shared';
import {
  GENDERS, PROFILE_FONTS, SPACER_HEIGHTS, TIERS, WALL_MOODS, compact, formatDate, levelProgress, levelTitle, sectionCols, sectionDef, tierByKey, timeAgo, toTen,
} from '@chatlol/shared';
import { useColors } from '../../lib/theme';
import { Avatar } from '../people';
import { BADGES } from '../cosmetics';
import { Button, Chip, Icon, Input, Row, Tap, Text } from '../ui';
import { TierPad } from '../TierPad';
import { ProfileSong } from '../ProfileSong';
import { PostCard } from '../PostCard';
import { ShoutCard } from '../ShoutCard';
import { YouTube } from './YouTube';
import { EmojiButton } from '../emoji/EmojiSheet';
import { RichText } from '../emoji/RichText';
import { StickerView } from '../emoji/StickerView';
import { useCaretInsert } from '../emoji/useCaretInsert';

/** Everything the sections read and do, from the profile screen. */
export interface ProfileCtx {
  user: UserPublic;
  layout: ProfileLayout;
  isMe: boolean;
  signedIn: boolean;
  myId?: string;
  accent: string;
  darkBg: boolean;
  autoplay: boolean;
  posts: Post[];
  ratings: ProfileRatings | null;
  gallery: Post[];
  albums: string[];
  album: string | null;
  wall: WallNote[];
  wallCount: number;
  showcase: Showcase;
  /** In the builder: a preview — no players, forms or links. */
  preview?: boolean;
  rateProfile: (s: VibeScore) => void;
  postNote: (body: string, mood: string | null, sticker?: StickerInput | null) => Promise<boolean>;
  deleteNote: (id: string) => void;
  setAlbum: (a: string | null) => void;
  addPhoto: () => void;
  updateShout?: () => void;
}

/** The text colour and box for one section's style. */
function useBox(section: ProfileSection, ctx: ProfileCtx) {
  const c = useColors();
  const st = section.style;
  const onDark = st === 'accent' || ((st === 'glass' || st === 'plain') && ctx.darkBg);
  const themed = st === 'card' || st === 'outline';
  const fg = themed ? c.onSurface : onDark ? '#fff' : '#251911';
  const tile = themed ? c.surfaceContainerLow : onDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.06)';
  const radius = ctx.layout.corners === 'sharp' ? 6 : ctx.layout.corners === 'round' ? 28 : 18;
  const box: ViewStyle =
    st === 'card' ? { backgroundColor: c.surfaceContainerLowest, padding: 16 }
    : st === 'outline' ? { backgroundColor: c.surfaceContainerLowest, borderWidth: 2, borderColor: ctx.accent, padding: 16 }
    : st === 'glass' ? { backgroundColor: ctx.darkBg ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', padding: 16 }
    : st === 'accent' ? { backgroundColor: ctx.accent, padding: 16 }
    : { paddingVertical: 6 };
  return { fg, muted: fg, tile, box: { ...box, borderRadius: radius }, radius };
}

/** Lays sections out: side by side by width on tablets / desktop, stacked on phones. */
export function SectionGrid({ ctx, width, onSectionPress, selected }: { ctx: ProfileCtx; width: number; onSectionPress?: (id: string) => void; selected?: string | null }) {
  const wide = width >= 768;
  const gap = ctx.layout.gap === 'tight' ? 8 : ctx.layout.gap === 'airy' ? 28 : 16;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2 }}>
      {ctx.layout.sections.map((s) => (
        <View key={s.id} style={{ width: wide ? `${(sectionCols(s.size) / 12) * 100}%` : '100%', paddingHorizontal: gap / 2, paddingBottom: gap }}>
          <Tap disabled={!onSectionPress} onPress={() => onSectionPress?.(s.id)} style={selected === s.id ? { borderRadius: 22, borderWidth: 3, borderColor: '#ff5e00', padding: 2 } : undefined}>
            <SectionView section={s} ctx={ctx} />
          </Tap>
        </View>
      ))}
    </View>
  );
}

export function SectionView({ section, ctx }: { section: ProfileSection; ctx: ProfileCtx }) {
  const b = useBox(section, ctx);
  const def = sectionDef(section.type);
  const font = PROFILE_FONTS.find((f) => f.key === ctx.layout.font)?.native;
  const heading = section.title || def?.label;
  const showHeading = !['spacer', 'quote'].includes(section.type) || !!section.title;
  if (section.type === 'spacer')
    return <View style={{ height: SPACER_HEIGHTS[section.config.height ?? 'md'], borderRadius: 12, borderWidth: ctx.preview ? 2 : 0, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.5)' }} />;
  return (
    <View style={b.box}>
      {showHeading ? <Text variant="headlineSm" color={b.fg} style={{ marginBottom: 10, fontFamily: font }}>{heading}</Text> : null}
      <Body section={section} ctx={ctx} fg={b.fg} tile={b.tile} font={font} />
    </View>
  );
}

function Muted({ children, fg, center }: { children: React.ReactNode; fg: string; center?: boolean }) {
  return <Text variant="bodyMd" color={fg} style={{ opacity: 0.72, textAlign: center ? 'center' : undefined, paddingVertical: center ? 10 : 0 }}>{children}</Text>;
}

function Body({ section, ctx, fg, tile, font }: { section: ProfileSection; ctx: ProfileCtx; fg: string; tile: string; font?: string }) {
  const u = ctx.user;
  const cfg = section.config;
  const limit = cfg.limit ?? 6;
  const cols = cfg.columns ?? 3;
  const sc = ctx.showcase;
  const own = (yours: string, theirs: string) => (ctx.isMe ? yours : theirs);
  const pill = (label: string, key?: string) => (
    <View key={key ?? label} style={{ backgroundColor: tile, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 }}><Text variant="labelMd" color={fg}>{label}</Text></View>
  );

  switch (section.type) {
    case 'about':
      return (
        <View style={{ gap: 6 }}>
          {u.profile.headline ? <Text variant="headlineSm" color={fg}>{u.profile.headline}</Text> : null}
          {u.bio ? <Text variant="bodyLg" color={fg}>{u.bio}</Text> : null}
          {u.pronouns || u.city ? <Muted fg={fg}>{[u.pronouns, u.city ? `📍 ${u.city}` : ''].filter(Boolean).join('  ·  ')}</Muted> : null}
          {!u.bio && !u.profile.headline ? <Muted fg={fg}>{own('Add a headline and bio in Customize → About.', 'No bio yet.')}</Muted> : null}
          {u.isAI ? <Muted fg={fg}>✦ AI persona — it posts and chats like a regular, but it isn’t a person.</Muted> : null}
        </View>
      );
    case 'details': {
      const g = GENDERS.find((x) => x.key === u.gender);
      const prog = levelProgress(u.xp);
      const rows: [string, string][] = [
        ...(g ? ([['Gender', `${g.emoji} ${g.label}`]] as [string, string][]) : []),
        ['Level', `${prog.level} · ${levelTitle(prog.level)}`],
        ['Vibe', `${tierByKey(u.vibeTier).emoji} ${tierByKey(u.vibeTier).label}`],
        ['Member since', formatDate(u.createdAt.slice(0, 10))],
        ['Last active', u.online ? '🟢 Online now' : `${timeAgo(u.lastSeenAt)} ago`],
      ];
      return <View style={{ gap: 6 }}>{rows.map(([k, v]) => <Row key={k} style={{ justifyContent: 'space-between' }}><Muted fg={fg}>{k}</Muted><Text variant="labelLg" color={fg}>{v}</Text></Row>)}</View>;
    }
    case 'interests':
      return u.interests.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{u.interests.map((i) => pill(`#${i}`, i))}</View> : <Muted fg={fg}>No interests yet.</Muted>;
    case 'song':
      if (!u.profile.song) return <Muted fg={fg}>{own('Pick a song in Customize → Song.', 'No song picked yet.')}</Muted>;
      return ctx.preview ? <Muted fg={fg}>🎵 {u.profile.song.title || 'Your song'}{u.profile.song.artist ? ` — ${u.profile.song.artist}` : ''}</Muted> : <ProfileSong song={u.profile.song} autoplay={ctx.autoplay} />;
    case 'stats':
      return (
        <Row gap={6}>
          {[[`${tierByKey(u.vibeTier).emoji} ${u.ratingsReceived ? toTen(u.vibeAvg) : '–'}`, 'VIBE'], [compact(u.followersCount), 'FOLLOWERS'], [compact(u.friendsCount), 'FRIENDS'], [`🔥${u.streakDays}`, 'STREAK']].map(([v, l]) => (
            <View key={l} style={{ flex: 1, backgroundColor: tile, borderRadius: 16, paddingVertical: 10, alignItems: 'center' }}><Text variant="headlineSm" color={fg}>{v}</Text><Text variant="labelSm" color={fg} style={{ opacity: 0.72 }}>{l}</Text></View>
          ))}
        </Row>
      );
    case 'rating': {
      const r = ctx.ratings;
      if (!r) return null;
      return (
        <View style={{ gap: 6 }}>
          <Text variant="headlineMd" color={fg}>{r.count ? `${r.consensusPct}% ${tierByKey(r.tier).emoji} ${tierByKey(r.tier).label}` : 'No ratings yet'}</Text>
          {[...TIERS].reverse().map((t) => {
            const pct = r.count ? Math.round((r.dist[t.score - 1] / r.count) * 100) : 0;
            return (
              <View key={t.key}>
                <Row style={{ justifyContent: 'space-between' }}><Text variant="labelMd" color={fg}>{t.emoji} {t.label}</Text><Text variant="labelMd" color={fg}>{pct}%</Text></Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: tile }}><View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: ctx.accent }} /></View>
              </View>
            );
          })}
          {!ctx.isMe && !ctx.preview ? <><Text variant="labelLg" color={fg} style={{ marginTop: 6 }}>Rate {u.displayName.split(' ')[0]}’s profile vibe</Text><TierPad value={r.myRating} onRate={ctx.rateProfile} compact /></> : null}
          {ctx.isMe && !ctx.preview ? <Tap onPress={() => router.push('/insights')}><Text variant="labelLg" color={fg} style={{ textDecorationLine: 'underline' }}>See who rated you</Text></Tap> : null}
        </View>
      );
    }
    case 'wall':
      return <Wall ctx={ctx} limit={limit} fg={fg} tile={tile} />;
    case 'gallery':
      return (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label="All" active={!ctx.album} onPress={() => ctx.setAlbum(null)} />
            {ctx.albums.map((a) => <Chip key={a} label={a} active={ctx.album === a} onPress={() => ctx.setAlbum(a)} />)}
            {ctx.isMe && !ctx.preview ? <Chip label="Add photo" icon="add-a-photo" onPress={ctx.addPhoto} /> : null}
          </View>
          <Photos photos={ctx.gallery} cols={cols} fg={fg} empty={own('Add photos — people can rate each one.', 'No photos yet')} />
        </View>
      );
    case 'photos':
      return <Photos photos={(sc.photos ?? []).slice(0, limit)} cols={cols} fg={fg} empty="No photos yet" />;
    case 'topPhotos':
      return <Photos photos={(sc.topPhotos ?? []).slice(0, limit)} cols={cols} fg={fg} empty="No rated photos yet" />;
    case 'feed':
      return ctx.posts.length ? <View style={{ gap: 12 }} pointerEvents={ctx.preview ? 'none' : 'auto'}>{ctx.posts.slice(0, limit).map((p) => <PostCard key={p.id} post={p} />)}</View> : <Muted fg={fg} center>No posts yet</Muted>;
    case 'shouts':
      return (sc.shouts ?? []).length ? (
        <View style={{ gap: 8 }} pointerEvents={ctx.preview ? 'none' : 'auto'}>{(sc.shouts ?? []).slice(0, limit).map((x) => <ShoutCard key={x.id} shout={x} flat onUpdate={() => ctx.updateShout?.()} />)}</View>
      ) : <Muted fg={fg} center>No shouts yet 📣</Muted>;
    case 'friends':
      return <People people={(sc.friends ?? []).slice(0, limit)} total={u.friendsCount} fg={fg} tile={tile} empty={own('Follow people back to make friends.', 'No friends yet')} preview={ctx.preview} />;
    case 'followers':
      return <People people={(sc.followers ?? []).slice(0, limit)} total={u.followersCount} fg={fg} tile={tile} empty="No followers yet" preview={ctx.preview} />;
    case 'following':
      return <People people={(sc.following ?? []).slice(0, limit)} total={u.followingCount} fg={fg} tile={tile} empty="Not following anyone yet" preview={ctx.preview} />;
    case 'badges':
      return u.badges.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{u.badges.map((x) => pill(BADGES[x] ?? x, x))}</View> : <Muted fg={fg}>No badges yet.</Muted>;
    case 'level': {
      const prog = levelProgress(u.xp);
      return (
        <View style={{ gap: 6 }}>
          <Text variant="headlineMd" color={fg}>Level {prog.level}</Text>
          <Muted fg={fg}>{levelTitle(prog.level)} · {compact(u.xp)} XP</Muted>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: tile }}><View style={{ height: 8, borderRadius: 4, width: `${Math.round((prog.into / prog.needed) * 100)}%`, backgroundColor: ctx.accent }} /></View>
        </View>
      );
    }
    case 'threads':
      return (sc.threads ?? []).length ? (
        <View style={{ gap: 6 }}>
          {(sc.threads ?? []).slice(0, limit).map((t) => (
            <Tap key={t.id} disabled={ctx.preview} onPress={() => router.push(`/forums/${t.id}`)} style={{ backgroundColor: tile, borderRadius: 12, padding: 10 }}>
              <Text variant="labelLg" color={fg} numberOfLines={1}>{t.title}</Text>
              <Text variant="bodySm" color={fg} style={{ opacity: 0.72 }}>{t.boardName ? `${t.boardName} · ` : ''}{t.replyCount} replies · {timeAgo(t.createdAt)}</Text>
            </Tap>
          ))}
        </View>
      ) : <Muted fg={fg} center>No threads yet 🧵</Muted>;
    case 'text':
      return cfg.body ? <Text variant="bodyLg" color={fg} style={{ fontFamily: font }}>{cfg.body}</Text> : <Muted fg={fg}>{ctx.preview ? 'Write something in this box’s settings ✏️' : ''}</Muted>;
    case 'quote':
      return (
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text variant="headlineLg" color={fg} style={{ textAlign: 'center', fontFamily: font }}>“{cfg.text || (ctx.preview ? 'Your quote goes here' : '')}”</Text>
          {cfg.by ? <Muted fg={fg}>— {cfg.by}</Muted> : null}
        </View>
      );
    case 'links':
      return (cfg.items ?? []).length ? (
        <View style={{ gap: 6 }}>
          {(cfg.items ?? []).map((l, i) => (
            <Tap key={i} disabled={ctx.preview} onPress={() => l.url && Linking.openURL(l.url)} style={{ backgroundColor: tile, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="link" size={18} color={fg} /><Text variant="labelLg" color={fg} style={{ flex: 1 }} numberOfLines={1}>{l.label}</Text><Icon name="open-in-new" size={16} color={fg} />
            </Tap>
          ))}
        </View>
      ) : <Muted fg={fg}>{ctx.preview ? 'Add links in this box’s settings.' : 'No links yet.'}</Muted>;
    case 'currently':
      return (cfg.items ?? []).length ? (
        <View style={{ gap: 8 }}>{(cfg.items ?? []).map((it, i) => <View key={i}><Text variant="labelSm" color={fg} style={{ opacity: 0.72 }}>{it.label.toUpperCase()}</Text><Text variant="labelLg" color={fg}>{it.value}</Text></View>)}</View>
      ) : <Muted fg={fg}>{ctx.preview ? 'Fill this in from the box’s settings.' : 'Nothing yet.'}</Muted>;
    case 'video':
      if (!cfg.videoId) return <Muted fg={fg}>{ctx.preview ? 'Paste a YouTube link in this box’s settings.' : ''}</Muted>;
      return ctx.preview ? <Image source={`https://i.ytimg.com/vi/${cfg.videoId}/hqdefault.jpg`} style={{ aspectRatio: 16 / 9, borderRadius: 12 }} contentFit="cover" /> : <YouTube id={cfg.videoId} />;
    default:
      return null;
  }
}

function Photos({ photos, cols, fg, empty }: { photos: Post[]; cols: number; fg: string; empty: string }) {
  const [w, setW] = useState(0);
  if (!photos.length) return <Muted fg={fg} center>{empty}</Muted>;
  // Square thumbnails, never bigger than 250×250.
  const cell = w ? Math.min(250, (w - 6 * (cols - 1)) / cols) : 0;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {cell ? photos.map((p) => (
        <Tap key={p.id} onPress={() => router.push(`/p/${p.id}`)}>
          <Image source={p.mediaUrl} style={{ width: cell, height: cell, borderRadius: 10 }} contentFit="cover" recyclingKey={p.id} />
          {p.ratings.count ? <View style={{ position: 'absolute', left: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99, paddingHorizontal: 6 }}><Text variant="labelSm" color="#fff">{tierByKey(p.ratings.tier).emoji} {p.ratings.count}</Text></View> : null}
        </Tap>
      )) : null}
    </View>
  );
}

function People({ people, total, fg, tile, empty, preview }: { people: UserPublic[]; total: number; fg: string; tile: string; empty: string; preview?: boolean }) {
  if (!people.length) return <Muted fg={fg} center>{empty}</Muted>;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {people.map((p) => (
          <Tap key={p.id} disabled={preview} onPress={() => router.push(`/u/${p.handle}`)} style={{ width: 76, backgroundColor: tile, borderRadius: 12, padding: 6, alignItems: 'center' }}>
            <Avatar user={p} size={48} />
            <Text variant="labelSm" color={fg} numberOfLines={1} style={{ marginTop: 3 }}>{p.displayName.split(' ')[0]}</Text>
          </Tap>
        ))}
      </View>
      {total > people.length ? <Text variant="bodySm" color={fg} style={{ opacity: 0.72 }}>+ {total - people.length} more</Text> : null}
    </View>
  );
}

function Wall({ ctx, limit, fg, tile }: { ctx: ProfileCtx; limit: number; fg: string; tile: string }) {
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<string | null>('hyped');
  const caret = useCaretInsert(body, setBody);
  const [all, setAll] = useState(false);
  const notes = all ? ctx.wall : ctx.wall.slice(0, limit);
  return (
    <View style={{ gap: 8 }}>
      {ctx.signedIn && !ctx.preview ? (
        <View style={{ gap: 6 }}>
          <Row gap={8} style={{ alignItems: 'flex-start' }}>
            <Input value={body} onChangeText={setBody} onSelectionChange={caret.onSelectionChange} placeholder={ctx.isMe ? 'Pin a note on your own profile…' : `Leave a comment for ${ctx.user.displayName.split(' ')[0]}…`} maxLength={280} multiline style={{ flex: 1 }} />
            <EmojiButton onInsert={caret.insert} onSticker={(st) => void ctx.postNote('', mood, st)} />
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {WALL_MOODS.map((m) => <Chip key={m.key} label={`${m.emoji} ${m.label}`} active={mood === m.key} onPress={() => setMood(m.key)} />)}
            <Button small title="Post" icon="send" disabled={!body.trim()} onPress={async () => { if (await ctx.postNote(body.trim(), mood)) setBody(''); }} />
          </Row>
        </View>
      ) : null}
      {notes.map((n) => (
        <View key={n.id} style={{ backgroundColor: tile, borderRadius: 14, padding: 10, flexDirection: 'row', gap: 10 }}>
          <Tap disabled={ctx.preview} onPress={() => router.push(`/u/${n.author.handle}`)}><Avatar user={n.author} size={36} /></Tap>
          <View style={{ flex: 1 }}>
            <Text variant="labelLg" color={fg}>{n.author.displayName} <Text variant="bodySm" color={fg} style={{ opacity: 0.72 }}>{WALL_MOODS.find((m) => m.key === n.mood)?.emoji ?? ''} {timeAgo(n.createdAt)}</Text></Text>
            {n.body ? <RichText text={n.body} color={fg} /> : null}
            {n.sticker ? <StickerView sticker={n.sticker} size={96} /> : null}
          </View>
          {(ctx.isMe || n.author.id === ctx.myId) && !ctx.preview ? <Tap onPress={() => ctx.deleteNote(n.id)} accessibilityLabel="Delete comment"><Icon name="delete" size={18} color={fg} /></Tap> : null}
        </View>
      ))}
      {!ctx.wall.length ? <Muted fg={fg} center>No comments yet — be the first 💬</Muted> : null}
      {ctx.wall.length > limit && !all ? <Tap onPress={() => setAll(true)}><Text variant="labelLg" color={fg} style={{ textDecorationLine: 'underline' }}>Show all {ctx.wallCount} comments</Text></Tap> : null}
    </View>
  );
}
