import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Drop, Post } from '@chatlol/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/store';
import { useColors, shadow } from '../../lib/theme';
import { PostCard } from '../../components/PostCard';
import { Button, Chip, Countdown, Empty, Label, Row, Text } from '../../components/ui';

export default function Drops() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [entries, setEntries] = useState<Post[]>([]);
  const [sort, setSort] = useState<'fire' | 'new'>('fire');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const r = await api.drop();
    setDrop(r.drop); setEntries(r.entries); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const data = sort === 'new' ? [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : entries;
  const atRisk = !!user && user.streakDays > 0 && !drop?.myEntryId;

  return (
    <FlatList
      data={data}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PostCard post={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 130, maxWidth: 680, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.flame} onRefresh={() => { setRefreshing(true); void load(); }} />}
      ListEmptyComponent={drop ? <Empty emoji="📸" title="No drops yet today" body="Early drops get the most eyes." /> : null}
      ListHeaderComponent={drop ? (
        <View style={{ gap: 14, marginBottom: 16 }}>
          <View style={[{ backgroundColor: '#3b2e25', borderRadius: 32, padding: 20, overflow: 'hidden' }, shadow.float]}>
            <View style={{ position: 'absolute', right: -60, bottom: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,94,0,0.55)' }} />
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><Text variant="labelMd" color="#ffede4">🌅 Sunset Ritual</Text></View>
              <Row gap={4} style={{ backgroundColor: c.flame, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><Text variant="labelMd" color="#fff">⏱ </Text><Countdown to={drop.endsAt} color="#fff" /></Row>
            </Row>
            <Label color="rgba(255,237,228,0.7)">{'\n'}Today’s prompt</Label>
            <Text variant="headlineXl" color="#ffede4">“{drop.prompt}” {drop.emoji}</Text>
            {atRisk ? (
              <Row gap={10} style={{ marginTop: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 12 }}>
                <Text style={{ fontSize: 28, lineHeight: 34 }}>🔥</Text>
                <View style={{ flex: 1 }}><Text variant="labelLg" color="#fff">{user!.streakDays}-Day Streak at risk!</Text><Text variant="bodySm" color="rgba(255,255,255,0.8)">Drop before twilight to keep it.</Text></View>
              </Row>
            ) : null}
            {!drop.myEntryId ? (
              <Button title="Snap & Lock In Drop  +120 ✦" icon="photo-camera" style={{ marginTop: 16 }} onPress={() => router.push({ pathname: '/compose', params: { mode: 'drop', prompt: drop.prompt } })} />
            ) : (
              <View style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 99, padding: 12, alignItems: 'center' }}><Text variant="labelLg" color="#fff">✅ Dropped! 🔥 {user?.streakDays} — rate the crew below</Text></View>
            )}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="headlineLg">Today’s Drops <Text color={c.onSurfaceVariant}>{drop.entries}</Text></Text>
            <Row gap={6}><Chip label="🔥 Fire" active={sort === 'fire'} onPress={() => setSort('fire')} /><Chip label="New" active={sort === 'new'} onPress={() => setSort('new')} /></Row>
          </Row>
        </View>
      ) : null}
    />
  );
}
