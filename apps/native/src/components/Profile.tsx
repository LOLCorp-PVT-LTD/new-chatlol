import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import type { Post, ProfileRatings, StoreItem, UserPublic, VibeScore, WallNote } from '@chatlol/shared';
import { GENDERS, TIERS, WALL_MOODS, compact, levelProgress, levelTitle, profileBackground, tierByKey, toTen, timeAgo } from '@chatlol/shared';
import { api, uploadUri } from '../lib/api';
import { errorToast } from '../lib/actions';
import { pickImage, shareLink } from '../lib/native';
import { session, useSession } from '../lib/store';
import { useColors, gradients } from '../lib/theme';
import { Avatar, AiBadge, UserName } from './people';
import { BANNERS, BADGES } from './cosmetics';
import { Button, Chip, Empty, Gradient, IconButton, Input, Progress, Row, Tap, Text } from './ui';
import { TierPad } from './TierPad';
import { ProfileSong } from './ProfileSong';
import { toast } from '../lib/actions';

export function ProfileView({ handle }: { handle?: string }) {
  const c = useColors();
  const me = useSession((s) => s.user);
  const { width } = useWindowDimensions();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [locker, setLocker] = useState<StoreItem[]>([]);
  const [tab, setTab] = useState<'grid' | 'wall' | 'locker'>('grid');
  const [ratings, setRatings] = useState<ProfileRatings | null>(null);
  const [gallery, setGallery] = useState<Post[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [album, setAlbum] = useState<string | null>(null);
  const [wall, setWall] = useState<WallNote[]>([]);
  const [note, setNote] = useState('');
  const [mood, setMood] = useState<string | null>('hyped');
  const isMe = !handle || handle === me?.handle;
  const h = handle ?? me?.handle;

  useFocusEffect(useCallback(() => {
    if (!h) return;
    void api.user(h).then(async (r) => {
      setUser(r.user); setPosts(r.posts); setRatings(r.profileRatings);
      const [g, w] = await Promise.all([api.gallery(r.user.id), api.wall(r.user.id)]);
      setGallery(g.photos); setAlbums(g.albums); setWall(w.notes);
    }).catch(errorToast);
    if (isMe) void api.inventory().then((r) => setLocker(r.items));
  }, [h, isMe]));

  if (!user) return <View style={{ flex: 1 }} />;
  const prog = levelProgress(user.xp);
  const bannerKey = user.cosmetics.banner ?? user.cosmetics.theme;
  const photos = (album ? gallery.filter((p) => p.album === album) : gallery).length ? (album ? gallery.filter((p) => p.album === album) : gallery) : posts.filter((p) => p.mediaUrl);
  const bg = user.profile.background;
  const preset = profileBackground(bg.kind === 'preset' ? bg.value : undefined);
  const onBg = bg.kind === 'preset' ? (preset.dark ? '#fff' : '#251911') : '#fff';
  const accent = user.profile.accent;
  const gender = GENDERS.find((g) => g.key === user.gender);
  const autoplay = (me ? me.settings.autoplayMusic : true) && !isMe;
  async function rateProfile(score: VibeScore) {
    if (!me) return router.push('/join');
    try { setRatings((await api.rateProfile(user!.id, score)).ratings); toast({ kind: 'info', title: 'Vibe locked in ⭐' }); } catch (e) { errorToast(e); }
  }
  async function postNote() {
    if (!note.trim()) return;
    try { const r = await api.postWall(user!.id, { body: note.trim(), mood }); setWall((w) => [r.note, ...w]); setNote(''); } catch (e) { errorToast(e); }
  }
  const cell = (Math.min(width, 680) - 32 - 8) / 3;

  async function follow() {
    const r = await api.follow(user!.id);
    setUser({ ...user!, isFollowing: r.following, followersCount: user!.followersCount + (r.following ? 1 : -1) });
  }
  async function dm() {
    try { router.push(`/messages/${(await api.openConversation(user!.id)).conversation.id}`); } catch (e) { errorToast(e); }
  }
  function more() {
    Alert.alert(`@${user!.handle}`, undefined, [
      { text: 'Share profile', onPress: () => shareLink(`/u/${user!.handle}`) },
      { text: 'Report', onPress: () => api.report({ targetType: 'user', targetId: user!.id, reason: 'Reported from profile' }) },
      { text: 'Block', style: 'destructive', onPress: async () => { await api.block(user!.id); router.back(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  async function changeAvatar() {
    const uri = await pickImage('library');
    if (!uri) return;
    const url = await uploadUri(uri);
    const r = await api.updateMe({ avatarUrl: url });
    session.set({ user: r.user });
    setUser({ ...user!, avatarUrl: url });
  }
  async function equip(i: StoreItem) {
    const r = await api.equip({ [i.kind]: i.equipped ? null : i.id });
    session.set({ user: r.user });
    setUser({ ...user!, cosmetics: r.user.cosmetics });
    setLocker((await api.inventory()).items);
  }

  const header = (
    <View style={{ gap: 14, marginBottom: 12 }}>
      <View style={{ borderRadius: 32, overflow: 'hidden', backgroundColor: c.surfaceContainerLowest }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {bg.kind === 'image' ? <Image source={bg.value} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
            : bg.kind === 'color' ? <View style={{ flex: 1, backgroundColor: bg.value }} />
            : <Gradient colors={preset.colors as [string, string, ...string[]]} style={{ flex: 1 }} />}
        </View>
        <View style={{ height: 130 }}>
          {user.profile.coverUrl ? <Image source={user.profile.coverUrl} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
            : bannerKey && BANNERS[bannerKey] ? <Gradient colors={BANNERS[bannerKey]} style={{ flex: 1, opacity: 0.6 }} /> : null}
          <Row gap={6} style={{ position: 'absolute', right: 14, top: 14 }}>
            {user.premium ? <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text variant="labelSm" color="#fff">👑 Premium</Text></View> : null}
            {user.isAI ? <AiBadge /> : null}
          </Row>
        </View>
        <View style={{ padding: 18, marginTop: -56, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Tap onPress={isMe ? changeAvatar : undefined}><Avatar user={user} size={104} /></Tap>
            <Row gap={6}>
              {isMe ? (
                <><Button small title="Customize" icon="palette" variant="white" onPress={() => router.push('/customize')} /><IconButton name="visibility" label="Who viewed me" bg="#fff" color="#251911" onPress={() => router.push('/insights')} /><IconButton name="settings" label="Settings" bg="#fff" color="#251911" onPress={() => router.push('/settings')} /></>
              ) : (
                <><Tap onPress={follow} style={{ height: 38, borderRadius: 19, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: user.isFollowing ? 'rgba(0,0,0,0.35)' : accent }}><Text variant="labelLg" color="#fff">{user.isFollowing ? 'Following ✓' : 'Follow'}</Text></Tap>
                  <IconButton name="chat" label="Message" bg={c.sunlit} color={c.flame} onPress={dm} />
                  <IconButton name="more-horiz" label="More" onPress={more} /></>
              )}
            </Row>
          </Row>
          <Row gap={6}><UserName user={user} variant="headlineLg" link={false} color={onBg} />{gender ? <Text variant="headlineSm" color={onBg}>{gender.emoji}</Text> : null}</Row>
          <Text color={onBg} style={{ opacity: 0.9 }}>@{user.handle}{user.pronouns ? ` • ${user.pronouns}` : ''}{user.city ? ` • 📍 ${user.city}` : ''}</Text>
          {user.profile.headline ? <Text variant="headlineSm" color={onBg}>{user.profile.headline}</Text> : null}
          {user.bio ? <Text variant="bodyLg" color={onBg}>{user.bio}</Text> : null}
          {user.profile.song ? <View style={{ marginTop: 6 }}><ProfileSong song={user.profile.song} autoplay={autoplay} /></View> : null}
          {user.isAI ? <Text variant="bodySm" color={onBg} style={{ opacity: 0.9 }}>✦ AI persona — it posts and chats like a regular, but it isn’t a person.</Text> : null}
          <View style={{ backgroundColor: c.surfaceContainerLowest, borderRadius: 24, padding: 12, marginTop: 10, gap: 8 }}>
          <Row gap={8}>
            {[[`${tierByKey(user.vibeTier).emoji} ${user.ratingsReceived ? toTen(user.vibeAvg) : '–'}`, 'VIBE'], [compact(user.friendsCount), 'FRIENDS'], [compact(user.followersCount), 'FOLLOWERS'], [`🔥${user.streakDays}`, 'STREAK']].map(([v, l], i) => (
              <View key={l} style={{ flex: 1, backgroundColor: i === 0 ? c.sunlit : c.surfaceContainerLow, borderRadius: 20, paddingVertical: 10, alignItems: 'center' }}>
                <Text variant="headlineSm">{v}</Text><Text variant="labelSm" color={c.onSurfaceVariant}>{l}</Text>
              </View>
            ))}
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 8 }}><Text variant="labelMd">Level {prog.level} • {levelTitle(prog.level)}</Text><Text variant="labelSm" color={c.onSurfaceVariant}>{prog.into}/{prog.needed} XP</Text></Row>
          <Progress value={prog.into} max={prog.needed} />
          {user.badges.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{user.badges.map((b) => <View key={b} style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><Text variant="labelSm">{BADGES[b] ?? b}</Text></View>)}</View> : null}
          </View>
        </View>
      </View>
      {ratings ? (
        <View style={{ backgroundColor: c.surfaceContainerLowest, borderRadius: 28, padding: 16, gap: 8 }}>
          <Text variant="labelSm" color={c.onSurfaceVariant}>COMMUNITY VIBE CONSENSUS</Text>
          <Text variant="headlineMd">{ratings.count ? `${ratings.consensusPct}% ${tierByKey(ratings.tier).label}` : 'No profile ratings yet'}</Text>
          {[...TIERS].reverse().map((t) => {
            const pct = ratings.count ? Math.round((ratings.dist[t.score - 1] / ratings.count) * 100) : 0;
            return (
              <View key={t.key}>
                <Row style={{ justifyContent: 'space-between' }}><Text variant="labelMd">{t.emoji} {t.label}</Text><Text variant="labelMd" color={c.primary}>{pct}%</Text></Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceContainer }}><View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: accent }} /></View>
              </View>
            );
          })}
          {!isMe ? <><Text variant="labelLg" style={{ marginTop: 6 }}>Rate {user.displayName.split(' ')[0]}’s profile vibe</Text><TierPad value={ratings.myRating} onRate={rateProfile} compact /></> : null}
        </View>
      ) : null}
      <Row gap={8}>
        <Chip label="Photos" icon="grid-view" active={tab === 'grid'} onPress={() => setTab('grid')} />
        <Chip label={`Wall ${wall.length}`} icon="sticky-note-2" active={tab === 'wall'} onPress={() => setTab('wall')} />
        {isMe ? <Chip label="Sparks Locker" icon="inventory-2" active={tab === 'locker'} onPress={() => setTab('locker')} /> : null}
      </Row>
      {tab === 'grid' && albums.length ? (
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <Chip label="All" active={!album} onPress={() => setAlbum(null)} />
          {albums.map((a) => <Chip key={a} label={a} active={album === a} onPress={() => setAlbum(a)} />)}
        </Row>
      ) : null}
      {tab === 'wall' && me ? (
        <View style={{ gap: 8 }}>
          <Input value={note} onChangeText={setNote} placeholder={isMe ? 'Pin a note on your wall…' : 'Leave a note on their wall…'} maxLength={280} multiline />
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {WALL_MOODS.map((m) => <Chip key={m.key} label={`${m.emoji} ${m.label}`} active={mood === m.key} onPress={() => setMood(m.key)} />)}
            <Button small title="Post note" icon="send" disabled={!note.trim()} onPress={postNote} />
          </Row>
        </View>
      ) : null}
    </View>
  );

  if (tab === 'wall') {
    return (
      <FlatList data={wall} key="wall" keyExtractor={(n) => n.id} ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 10, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        ListEmptyComponent={<Empty emoji="📝" title="The wall is empty" body="Leave the first note!" />}
        renderItem={({ item: n }) => (
          <View style={{ backgroundColor: c.surfaceContainerLowest, borderRadius: 22, padding: 14, flexDirection: 'row', gap: 10 }}>
            <Avatar user={n.author} size={38} />
            <View style={{ flex: 1 }}>
              <Row gap={6}><UserName user={n.author} /><Text variant="bodySm" color={c.onSurfaceVariant}>{WALL_MOODS.find((m) => m.key === n.mood)?.emoji ?? ''} {timeAgo(n.createdAt)}</Text></Row>
              <Text variant="bodyLg">{n.body}</Text>
            </View>
            {isMe || n.author.id === me?.id ? <IconButton name="delete" label="Delete note" size={34} onPress={async () => { await api.deleteWallNote(n.id); setWall((w) => w.filter((x) => x.id !== n.id)); }} /> : null}
          </View>
        )} />
    );
  }

  if (tab === 'locker') {
    const items = locker.filter((x) => ['frame', 'flair', 'theme', 'banner'].includes(x.kind));
    return (
      <FlatList data={items} key="locker" numColumns={2} keyExtractor={(x) => x.id} ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }} columnWrapperStyle={{ gap: 10 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={<Button title="Get more in the Sparks Vault" icon="diamond" variant="secondary" style={{ marginTop: 12 }} onPress={() => router.push('/vault')} />}
        renderItem={({ item: i }) => (
          <Pressable onPress={() => equip(i)} style={{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: c.surfaceContainerLowest, borderWidth: 2, borderColor: i.equipped ? c.flame : 'transparent' }}>
            <View style={{ height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunlit }}><Text style={{ fontSize: 32, lineHeight: 40 }}>{i.emoji}</Text></View>
            <View style={{ padding: 10 }}><Text variant="labelLg">{i.name}</Text><Text variant="bodySm" color={i.equipped ? c.flame : c.onSurfaceVariant}>{i.equipped ? 'Equipped ✓' : `Tap to equip ${i.kind}`}</Text></View>
          </Pressable>
        )} />
    );
  }
  return (
    <FlatList data={photos} key="grid" numColumns={3} keyExtractor={(p) => p.id} ListHeaderComponent={header}
      contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }} columnWrapperStyle={{ gap: 4 }}
      ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
      ListEmptyComponent={<Empty emoji="📷" title="No photos yet" />}
      renderItem={({ item: p }) => (
        <Tap onPress={() => router.push(`/p/${p.id}`)}>
          <Image source={p.mediaUrl} style={{ width: cell, height: cell, borderRadius: 16 }} contentFit="cover" recyclingKey={p.id} />
          {p.ratings.count ? <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(255,248,245,0.9)', borderRadius: 99, paddingHorizontal: 6 }}><Text variant="labelSm" color="#251911">{tierByKey(p.ratings.tier).emoji} {p.ratings.count}</Text></View> : null}
        </Tap>
      )} />
  );
}
