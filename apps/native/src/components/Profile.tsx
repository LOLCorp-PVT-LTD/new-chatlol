import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import type { Post, StoreItem, UserPublic } from '@chatlol/shared';
import { compact, levelProgress, levelTitle, tierByKey, toTen } from '@chatlol/shared';
import { api, uploadUri } from '../lib/api';
import { errorToast } from '../lib/actions';
import { pickImage, shareLink } from '../lib/native';
import { session, useSession } from '../lib/store';
import { useColors, gradients } from '../lib/theme';
import { Avatar, AiBadge, UserName } from './people';
import { BANNERS, BADGES } from './cosmetics';
import { Button, Chip, Empty, Gradient, IconButton, Progress, Row, Tap, Text } from './ui';

export function ProfileView({ handle }: { handle?: string }) {
  const c = useColors();
  const me = useSession((s) => s.user);
  const { width } = useWindowDimensions();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [locker, setLocker] = useState<StoreItem[]>([]);
  const [tab, setTab] = useState<'grid' | 'locker'>('grid');
  const isMe = !handle || handle === me?.handle;
  const h = handle ?? me?.handle;

  useFocusEffect(useCallback(() => {
    if (!h) return;
    void api.user(h).then((r) => { setUser(r.user); setPosts(r.posts); });
    if (isMe) void api.inventory().then((r) => setLocker(r.items));
  }, [h, isMe]));

  if (!user) return <View style={{ flex: 1 }} />;
  const prog = levelProgress(user.xp);
  const bannerKey = user.cosmetics.banner ?? user.cosmetics.theme;
  const photos = posts.filter((p) => p.mediaUrl);
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
        <Gradient colors={bannerKey && BANNERS[bannerKey] ? BANNERS[bannerKey] : gradients.dusk} style={{ height: 130 }}>
          {user.isAI ? <View style={{ position: 'absolute', right: 14, top: 14 }}><AiBadge /></View> : null}
        </Gradient>
        <View style={{ padding: 18, marginTop: -56, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Tap onPress={isMe ? changeAvatar : undefined}><Avatar user={user} size={104} /></Tap>
            <Row gap={6}>
              {isMe ? (
                <><Button small title="Edit" icon="edit" variant="secondary" onPress={() => router.push('/settings')} /><IconButton name="settings" label="Settings" bg={c.surfaceContainer} onPress={() => router.push('/settings')} /></>
              ) : (
                <><Button small title={user.isFollowing ? 'Following' : 'Follow'} variant={user.isFollowing ? 'secondary' : 'primary'} onPress={follow} />
                  <IconButton name="chat" label="Message" bg={c.sunlit} color={c.flame} onPress={dm} />
                  <IconButton name="more-horiz" label="More" onPress={more} /></>
              )}
            </Row>
          </Row>
          <UserName user={user} variant="headlineLg" link={false} />
          <Text color={c.onSurfaceVariant}>@{user.handle}{user.pronouns ? ` • ${user.pronouns}` : ''}{user.city ? ` • 📍 ${user.city}` : ''}</Text>
          {user.bio ? <Text variant="bodyLg">{user.bio}</Text> : null}
          {user.isAI ? <Text variant="bodySm" color={c.onSurfaceVariant}>✦ AI persona powered by free NVIDIA NIM models — not a real person.</Text> : null}
          <Row gap={8} style={{ marginTop: 8 }}>
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
      <Row gap={8}>
        <Chip label="Photos" icon="grid-view" active={tab === 'grid'} onPress={() => setTab('grid')} />
        {isMe ? <Chip label="Sparks Locker" icon="inventory-2" active={tab === 'locker'} onPress={() => setTab('locker')} /> : null}
      </Row>
    </View>
  );

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
