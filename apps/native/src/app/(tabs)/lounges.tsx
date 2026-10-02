import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import type { Lounge } from '@chatlol/shared';
import { api } from '../../lib/api';
import { useColors, shadow } from '../../lib/theme';
import { Avatar } from '../../components/people';
import { Button, Row, Tap, Text } from '../../components/ui';

export default function Lounges() {
  const c = useColors();
  const [lounges, setLounges] = useState<Lounge[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { setLounges((await api.lounges()).lounges); setRefreshing(false); }, []);
  useFocusEffect(useCallback(() => { void load(); const i = setInterval(load, 15_000); return () => clearInterval(i); }, [load]));
  return (
    <FlatList
      data={lounges}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 130, maxWidth: 680, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.flame} onRefresh={() => { setRefreshing(true); void load(); }} />}
      ListHeaderComponent={
        <View style={{ gap: 4, marginBottom: 4 }}>
          <Text variant="headlineXl">Hangout Lounges 🛋️</Text>
          <Text color={c.onSurfaceVariant}>Real-time rooms with a shared soundtrack.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            <Button small title="Live" icon="live-tv" variant="secondary" onPress={() => router.push('/live')} />
            <Button small title="Shouts" icon="campaign" variant="secondary" onPress={() => router.push('/forums')} />
            <Button small title="Members" icon="group" variant="secondary" onPress={() => router.push('/members')} />
            <Button small title="Hall of Fame" icon="emoji-events" variant="secondary" onPress={() => router.push('/leaderboard')} />
            <Button small title="Vault" icon="diamond" variant="secondary" onPress={() => router.push('/vault')} />
          </ScrollView>
        </View>
      }
      renderItem={({ item: l }) => (
        <Tap onPress={() => router.push(`/lounge/${l.id}`)} style={[{ borderRadius: 32, overflow: 'hidden', backgroundColor: c.sunlit }, shadow.warm]}>
          <View style={{ height: 130 }}>
            <Image source={l.coverUrl} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            {l.isLive ? <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: c.flame, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text variant="labelSm" color="#fff">● LIVE</Text></View> : null}
            <Text variant="headlineMd" color="#fff" style={{ position: 'absolute', left: 14, bottom: 10 }}>{l.emoji} {l.name}</Text>
          </View>
          <View style={{ padding: 14, gap: 6 }}>
            <Text color={c.onSurfaceVariant}>{l.topic}</Text>
            <Text variant="bodySm" color={c.secondary}>🎵 {l.nowPlaying}</Text>
            <Row>
              <Row gap={0}>{l.memberPreview.map((m, i) => <View key={m.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 99, borderWidth: 2, borderColor: c.sunlit }}><Avatar user={m} size={28} showOnline={false} /></View>)}</Row>
              <Text variant="labelMd" style={{ marginLeft: 8, flex: 1 }}>{l.onlineCount} here</Text>
              <Button small title="Jump In" onPress={() => router.push(`/lounge/${l.id}`)} />
            </Row>
          </View>
        </Tap>
      )}
    />
  );
}
