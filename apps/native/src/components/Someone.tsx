import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { UserPublic } from '@chatlol/shared';
import { useColors } from '../lib/theme';
import { Avatar } from './people';
import { Tap, Text } from './ui';

/** A person — or, without Premium, "Someone" with a blurred stranger photo. */
export function Someone({ user, teaser, size = 44 }: { user: UserPublic | null; teaser: string | null; size?: number }) {
  const c = useColors();
  if (user)
    return (
      <Tap onPress={() => router.push(`/u/${user.handle}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Avatar user={user} size={size} />
        <View style={{ flex: 1 }}><Text variant="labelLg" numberOfLines={1}>{user.displayName}</Text><Text variant="bodySm" color={c.onSurfaceVariant}>@{user.handle}</Text></View>
      </Tap>
    );
  return (
    <Tap onPress={() => router.push('/premium')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} accessibilityLabel="Someone — unlock with Premium">
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}><Image source={teaser ?? undefined} style={{ width: size, height: size }} blurRadius={12} contentFit="cover" /></View>
      <View style={{ flex: 1 }}><Text variant="labelLg">Someone</Text><Text variant="bodySm" color={c.flame}>👑 Unlock with Premium</Text></View>
    </Tap>
  );
}
