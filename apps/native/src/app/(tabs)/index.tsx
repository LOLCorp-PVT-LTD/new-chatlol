import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Drop, Post } from '@chatlol/shared';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useSession } from '../../lib/store';
import { useColors, gradients, shadow } from '../../lib/theme';
import { PostCard } from '../../components/PostCard';
import { VerifyBanner } from '../../components/VerifyBanner';
import { Avatar } from '../../components/people';
import { Button, Card, Chip, Countdown, Empty, Gradient, Icon, IconButton, Row, Tap, Text } from '../../components/ui';

type Tab = 'foryou' | 'following' | 'top';

export default function Stream() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [tab, setTab] = useState<Tab>('foryou');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fresh, setFresh] = useState<Post[]>([]);
  const [drop, setDrop] = useState<Drop | null>(null);
  const list = useRef<FlatList<Post>>(null);

  const load = useCallback(async (reset = false) => {
    if (loading && !reset) return;
    setLoading(true);
    try {
      const r = await api.feed({ tab, cursor: reset ? undefined : cursor ?? undefined });
      setPosts((p) => (reset ? r.items : [...p, ...r.items.filter((x) => !p.some((y) => y.id === x.id))]));
      setCursor(r.nextCursor);
      if (reset) setFresh([]);
    } finally { setLoading(false); setRefreshing(false); }
  }, [tab, cursor, loading]);

  useEffect(() => { void load(true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void api.drop().then((r) => setDrop(r.drop)); }, []));
  useEffect(() => {
    const s = getSocket();
    const onNew = (p: Post) => { if (p.author.id !== user?.id) setFresh((f) => [p, ...f].slice(0, 20)); };
    s.on('feed:new', onNew);
    return () => { s.off('feed:new', onNew); };
  }, [user?.id]);

  const header = (
    <View style={{ gap: 14, paddingBottom: 14 }}>
      <VerifyBanner />
      {drop ? (
        <Tap onPress={() => router.push('/drops')}>
          <Gradient colors={gradients.sunset} style={[{ borderRadius: 32, padding: 18 }, shadow.float]}>
            <Row gap={6}><Icon name="timer" size={16} color="#fff" /><Text variant="labelSm" color="#fff">DAILY SUNSET DROP • </Text><Countdown to={drop.endsAt} color="#fff" variant="labelSm" /></Row>
            <Text variant="headlineMd" color="#fff" style={{ marginTop: 4, paddingRight: 50 }}>“{drop.prompt}”</Text>
            <Text variant="bodySm" color="rgba(255,255,255,0.9)">{drop.myEntryId ? '✅ You dropped today — go rate others' : `${drop.entries} drops so far • +120 Sparks`}</Text>
            <Text style={{ position: 'absolute', right: 16, top: 22, fontSize: 44, lineHeight: 52, opacity: 0.4 }}>{drop.emoji}</Text>
          </Gradient>
        </Tap>
      ) : null}
      {user ? (
        <Card style={{ padding: 12 }}>
          <Row gap={10}>
            <Avatar user={user} size={40} showOnline={false} />
            <Tap onPress={() => router.push('/compose')} style={{ flex: 1, height: 44, borderRadius: 99, borderWidth: 1, borderColor: c.sandstone, justifyContent: 'center', paddingHorizontal: 16 }}>
              <Text color={c.outline}>Drop a photo or start a vibe…</Text>
            </Tap>
            <IconButton name="photo-camera" label="Post photo" bg={c.sunlit} color={c.flame} onPress={() => router.push('/compose')} />
          </Row>
        </Card>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {([['foryou', 'For You'], ['following', 'Following'], ['top', 'Top Rated']] as const).map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} onDeleted={(id) => setPosts((p) => p.filter((x) => x.id !== id))} />}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? null : <Empty emoji="📸" title="Nothing here yet" body="Be the first to drop a vibe." />}
        ListFooterComponent={loading && posts.length ? <Text style={{ textAlign: 'center', padding: 16 }} color={c.onSurfaceVariant}>Loading more vibes…</Text> : null}
        contentContainerStyle={{ padding: 16, paddingBottom: 130, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        onEndReached={() => cursor && load()}
        onEndReachedThreshold={1.5}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.flame} colors={[c.flame]} onRefresh={() => { setRefreshing(true); void load(true); }} />}
        removeClippedSubviews
        windowSize={7}
      />
      {fresh.length ? (
        <View style={{ position: 'absolute', top: 12, alignSelf: 'center' }}>
          <Button small title={`${fresh.length} new vibe${fresh.length > 1 ? 's' : ''}`} icon="arrow-upward"
            onPress={() => { setPosts((p) => [...fresh, ...p]); setFresh([]); list.current?.scrollToOffset({ offset: 0, animated: true }); }} />
        </View>
      ) : null}
    </View>
  );
}
