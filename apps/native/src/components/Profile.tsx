import React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { actionSheet, confirmDialog, reportDialog } from '../lib/dialog';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ProfileCustomization, UserPublic } from '@chatlol/shared';
import { GENDERS, PAGE_WIDTHS, profileBackground, tierByKey, timeAgo } from '@chatlol/shared';
import { api, uploadUri } from '../lib/api';
import { errorToast, toast } from '../lib/actions';
import { pickImage, shareLink } from '../lib/native';
import { session } from '../lib/store';
import { Avatar, AiBadge } from './people';
import { Button, Empty, Gradient, IconButton, Row, Tap, Text } from './ui';
import { ProfileSong } from './ProfileSong';
import { SectionGrid, type ProfileCtx } from './profile/Sections';
import { useProfileData } from './profile/useProfileData';

/** The member's background, filling the screen behind their page. */
export function ProfileBackdrop({ profile }: { profile: ProfileCustomization }) {
  const bg = profile.background;
  const fill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
  if (bg.kind === 'image') return <Image source={bg.value} style={fill} contentFit="cover" />;
  if (bg.kind === 'color') return <View style={[fill, { backgroundColor: bg.value }]} />;
  return <Gradient colors={profileBackground(bg.value).colors as [string, string, ...string[]]} style={fill} />;
}

/** A profile, laid out the way its owner built it (header style + sections). */
export function ProfileView({ handle }: { handle?: string }) {
  const { width } = useWindowDimensions();
  const { ctx, user, setUser } = useProfileData(handle);
  if (!ctx || !user) return <View style={{ flex: 1 }} />;
  const maxWidth = PAGE_WIDTHS.find((w) => w.key === ctx.layout.width)?.px ?? 1040;
  const inner = Math.min(width, maxWidth) - 32;
  const songOutside = !!user.profile.song && !ctx.layout.sections.some((s) => s.type === 'song');
  return (
    <View style={{ flex: 1 }}>
      <ProfileBackdrop profile={user.profile} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16, maxWidth, width: '100%', alignSelf: 'center' }}>
        <ProfileHeader ctx={ctx} onUser={setUser} />
        {songOutside ? <ProfileSong song={user.profile.song!} autoplay={ctx.autoplay} /> : null}
        <SectionGrid ctx={ctx} width={inner} />
        {!ctx.layout.sections.length ? (
          <Empty emoji="🧩" title={ctx.isMe ? 'Your page is empty' : 'Nothing here yet'}>{ctx.isMe ? <Button title="Build your page" onPress={() => router.push('/page-builder')} /> : null}</Empty>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function ProfileHeader({ ctx, onUser, preview }: { ctx: ProfileCtx; onUser?: (u: UserPublic) => void; preview?: boolean }) {
  const u = ctx.user;
  const style = ctx.layout.header;
  const fg = style === 'split' || ctx.darkBg ? '#fff' : '#251911';
  const gender = GENDERS.find((g) => g.key === u.gender);
  const tier = tierByKey(u.vibeTier);
  const radius = ctx.layout.corners === 'sharp' ? 6 : ctx.layout.corners === 'round' ? 28 : 18;
  const centered = style === 'centered';
  const avatar = style === 'compact' ? 64 : style === 'split' ? 120 : 104;

  async function changeAvatar() {
    const uri = await pickImage('library');
    if (!uri) return;
    const url = await uploadUri(uri);
    const r = await api.updateMe({ avatarUrl: url });
    session.set({ user: r.user });
    onUser?.({ ...u, avatarUrl: url });
  }
  async function follow() {
    if (!ctx.signedIn) return router.push('/join');
    const r = await api.follow(u.id);
    onUser?.({ ...u, isFollowing: r.following, followersCount: u.followersCount + (r.following ? 1 : -1) });
  }
  async function dm() {
    if (!ctx.signedIn) return router.push('/join');
    try { router.push(`/messages/${(await api.openConversation(u.id)).conversation.id}`); } catch (e) { errorToast(e); }
  }
  function more() {
    void actionSheet(`@${u.handle}`, [
      { label: 'Share profile', icon: 'ios-share', onPress: () => shareLink(`/u/${u.handle}`) },
      { label: 'Report', icon: 'flag', onPress: async () => {
        const reason = await reportDialog(`@${u.handle}`);
        if (!reason) return;
        await api.report({ targetType: 'user', targetId: u.id, reason });
        toast({ kind: 'info', title: 'Thanks — SafeShield is reviewing it 🛡️' });
      } },
      { label: 'Block', icon: 'block', danger: true, onPress: async () => {
        if (!(await confirmDialog({ title: `Block @${u.handle}?`, body: 'They won’t be able to message you or see you in feeds.', icon: 'block', danger: true, confirmText: 'Block' }))) return;
        await api.block(u.id); router.back();
      } },
    ]);
  }

  const cover = (h: number | undefined) => (
    <View style={h ? { height: h } : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {u.profile.coverUrl ? <Image source={u.profile.coverUrl} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
        : <Gradient colors={[`${ctx.accent}cc`, 'transparent']} style={{ flex: 1 }} />}
      {style === 'split' ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} /> : null}
      {h ? (
        <Row gap={6} style={{ position: 'absolute', right: 12, top: 12 }}>
          {u.premium ? <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text variant="labelSm" color="#fff">👑 Premium</Text></View> : null}
          {u.isAI ? <AiBadge /> : null}
        </Row>
      ) : null}
    </View>
  );
  const actions = preview ? null : ctx.isMe ? (
    <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: centered ? 'center' : 'flex-start' }}>
      <Tap onPress={() => router.push('/page-builder')} style={{ height: 38, borderRadius: 19, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: ctx.accent }}><Text variant="labelLg" color="#fff">✏️ Edit page</Text></Tap>
      <Button small title="Look & song" icon="palette" variant="white" onPress={() => router.push('/customize')} />
      <IconButton name="inventory-2" label="Sparks Locker" bg="#fff" color="#251911" size={38} onPress={() => router.push('/locker')} />
      <IconButton name="visibility" label="Who viewed me" bg="#fff" color="#251911" size={38} onPress={() => router.push('/insights')} />
    </Row>
  ) : (
    <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: centered ? 'center' : 'flex-start' }}>
      <Tap onPress={follow} style={{ height: 38, borderRadius: 19, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: u.isFollowing ? 'rgba(0,0,0,0.4)' : ctx.accent }}><Text variant="labelLg" color="#fff">{u.isFollowing ? 'Following ✓' : 'Follow'}</Text></Tap>
      <Button small title="Message" icon="chat" variant="white" onPress={dm} />
      <IconButton name="more-horiz" label="More" bg="#fff" color="#251911" size={38} onPress={more} />
    </Row>
  );
  const info = (
    <View style={{ gap: 3, alignItems: centered ? 'center' : 'flex-start', flexShrink: 1 }}>
      <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: centered ? 'center' : 'flex-start' }}>
        <Text variant={style === 'compact' ? 'headlineMd' : 'headlineLg'} color={fg}>{u.displayName}</Text>
        {gender ? <Text variant="headlineSm" color={fg}>{gender.emoji}</Text> : null}
        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 2 }}><Text variant="labelSm" color={fg}>{tier.emoji} {tier.label.toUpperCase()}</Text></View>
      </Row>
      <Text variant="bodyMd" color={fg} style={{ opacity: 0.9 }}>@{u.handle} · {u.online ? '🟢 Online' : `Active ${timeAgo(u.lastSeenAt)} ago`}</Text>
      {u.profile.headline && style !== 'compact' ? <Text variant="headlineSm" color={fg} style={{ textAlign: centered ? 'center' : 'left' }}>{u.profile.headline}</Text> : null}
    </View>
  );
  const av = <Tap disabled={!ctx.isMe || preview} onPress={changeAvatar}><Avatar user={u} size={avatar} /></Tap>;
  const panel = { backgroundColor: ctx.darkBg ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.62)', borderRadius: radius, overflow: 'hidden' as const };

  if (style === 'compact')
    return <View style={[panel, { padding: 16, gap: 12 }]}><Row gap={12}>{av}{info}</Row>{actions}</View>;
  if (style === 'split')
    return (
      <View style={{ borderRadius: radius, overflow: 'hidden', minHeight: 220, justifyContent: 'flex-end' }}>
        {cover(undefined)}
        <View style={{ padding: 18, gap: 12 }}><Row gap={14} style={{ alignItems: 'flex-end' }}>{av}{info}</Row>{actions}</View>
      </View>
    );
  return (
    <View style={panel}>
      {cover(130)}
      <View style={{ paddingHorizontal: 18, paddingBottom: 18, marginTop: -52, gap: 10, alignItems: centered ? 'center' : 'flex-start' }}>
        {av}{info}{actions}
      </View>
    </View>
  );
}
