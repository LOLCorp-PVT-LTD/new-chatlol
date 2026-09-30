import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { UserPublic } from '@chatlol/shared';
import { useColors } from '../lib/theme';
import { Text, Tap } from './ui';
import { FRAMES, FLAIRS } from './cosmetics';

type AvatarUser = Pick<UserPublic, 'avatarUrl' | 'displayName' | 'online' | 'cosmetics'>;

export function Avatar({ user, size = 40, live, showOnline = true }: { user: AvatarUser; size?: number; live?: boolean; showOnline?: boolean }) {
  const c = useColors();
  const frame = live ? FRAMES.frame_sunset : user.cosmetics?.frame ? FRAMES[user.cosmetics.frame] : null;
  const pad = frame ? Math.max(2, Math.round(size / 18)) : 0;
  const inner = (
    <View style={{ width: size - pad * 2, height: size - pad * 2, borderRadius: size, overflow: 'hidden', backgroundColor: c.primaryFixed, borderWidth: frame ? 2 : 0, borderColor: c.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center' }}>
      {user.avatarUrl ? <Image source={user.avatarUrl} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
        : <Text variant="labelLg" color={c.onPrimaryFixed}>{user.displayName.slice(0, 1)}</Text>}
    </View>
  );
  return (
    <View style={{ width: size, height: size }}>
      {frame ? <LinearGradient colors={frame} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size, padding: pad }}>{inner}</LinearGradient> : inner}
      {showOnline && user.online ? (
        <View style={{ position: 'absolute', right: 0, bottom: 0, width: Math.max(10, size / 4.5), height: Math.max(10, size / 4.5), borderRadius: 99, backgroundColor: c.online, borderWidth: 2, borderColor: c.surfaceContainerLowest }} />
      ) : null}
    </View>
  );
}

export function AiBadge() {
  return (
    <View accessibilityLabel="AI persona" style={{ backgroundColor: 'rgba(59,46,37,0.9)', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Text variant="labelSm" color="#ffede4" style={{ fontSize: 9 }}>✦ AI</Text>
    </View>
  );
}

export function UserName({ user, color, variant = 'labelLg', link = true }: { user: UserPublic; color?: string; variant?: 'labelLg' | 'headlineSm' | 'headlineLg' | 'bodyMd'; link?: boolean }) {
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
      <Text variant={variant} color={color} numberOfLines={1} style={{ flexShrink: 1 }}>{user.displayName}</Text>
      {user.cosmetics.flair ? <Text>{FLAIRS[user.cosmetics.flair]}</Text> : null}
      {user.isAI ? <AiBadge /> : null}
    </View>
  );
  return link ? <Tap onPress={() => router.push(`/u/${user.handle}`)} style={{ flexShrink: 1 }}>{content}</Tap> : content;
}
