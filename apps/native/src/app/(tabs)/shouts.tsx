import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import type { Shout } from '@chatlol/shared';
import { SHOUT_MOODS } from '@chatlol/shared';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useColors, gradients, shadow } from '../../lib/theme';
import { ShoutCard } from '../../components/ShoutCard';
import { ShoutComposer } from '../../components/ShoutComposer';
import { Chip, Empty, Gradient, Text } from '../../components/ui';

/** The Global Shoutbox: one live board for everyone. */
export default function Shoutbox() {
  const c = useColors();
  const [items, setItems] = useState<Shout[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextShoutAt, setNextShoutAt] = useState<string | null>(null);
  const [mood, setMood] = useState<string | undefined>();
  const [replyTo, setReplyTo] = useState<Shout | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    const r = await api.shouts({ before: reset ? undefined : cursor ?? undefined, mood });
    setItems((x) => (reset ? r.items : [...x, ...r.items.filter((y) => !x.some((z) => z.id === y.id))]));
    setCursor(r.nextCursor);
    setNextShoutAt(r.nextShoutAt);
    setRefreshing(false);
  }, [cursor, mood]);
  useEffect(() => { void load(true); }, [mood]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsert = useCallback((s: Shout) => setItems((x) => (x.some((y) => y.id === s.id) ? x.map((y) => (y.id === s.id ? s : y)) : [s, ...x])), []);
  useEffect(() => {
    const sock = getSocket();
    const onNew = (s: Shout) => { if (!mood || s.mood === mood) upsert(s); };
    const onReact = (p: { id: string; reactions: Shout['reactions'] }) => setItems((x) => x.map((y) => (y.id === p.id ? { ...y, reactions: p.reactions } : y)));
    const onRemoved = (p: { type: string; id: string }) => { if (p.type === 'shout') setItems((x) => x.filter((y) => y.id !== p.id)); };
    sock.on('shout:new', onNew);
    sock.on('shout:reactions', onReact);
    sock.on('content:removed', onRemoved);
    return () => { sock.off('shout:new', onNew); sock.off('shout:reactions', onReact); sock.off('content:removed', onRemoved); };
  }, [mood, upsert]);

  return (
    <FlatList
      data={items}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 12, maxWidth: 680, width: '100%', alignSelf: 'center' }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <Gradient colors={gradients.sunset} style={[{ borderRadius: 28, padding: 18 }, shadow.float]}>
            <Text variant="labelSm" color="#fff">● LIVE • UPDATES INSTANTLY</Text>
            <Text variant="headlineLg" color="#fff">📣 The Global Shoutbox</Text>
            <Text variant="bodySm" color="rgba(255,255,255,0.92)">One message to everyone. React, reply with your own shout, tag friends with @handle.</Text>
          </Gradient>
          <ShoutComposer replyTo={replyTo} nextShoutAt={nextShoutAt} onCancelReply={() => setReplyTo(null)} onPosted={(s, at) => { upsert(s); setNextShoutAt(at); setReplyTo(null); }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="All" active={!mood} onPress={() => setMood(undefined)} />
            {SHOUT_MOODS.map((m) => <Chip key={m.key} label={`${m.emoji} ${m.label}`} active={mood === m.key} onPress={() => setMood(m.key)} />)}
          </ScrollView>
        </View>
      }
      renderItem={({ item }) => <ShoutCard shout={item} onUpdate={upsert} onReply={setReplyTo} onRemoved={(id) => setItems((x) => x.filter((y) => y.id !== id))} />}
      ListEmptyComponent={<Empty emoji="📣" title="It’s quiet… too quiet" body="Be the first to shout." />}
      onEndReached={() => cursor && load(false)}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.flame} colors={[c.flame]} onRefresh={() => { setRefreshing(true); void load(true); }} />}
    />
  );
}
