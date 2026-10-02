import React, { useCallback, useState } from 'react';
import { FlatList, Modal, Switch, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import type { LiveStream } from '@chatlol/shared';
import { compact } from '@chatlol/shared';
import { api } from '../../lib/api';
import { errorToast } from '../../lib/actions';
import { useColors, shadow, WEB_THUMB } from '../../lib/theme';
import { ScreenHeader } from '../../components/chrome';
import { Avatar, UserName } from '../../components/people';
import { Button, Chip, Empty, Input, Row, Tap, Text } from '../../components/ui';

const CATS = ['Just Chatting', 'Music', 'Gaming', 'Art', 'Cooking', 'Fitness', 'Study With Me', 'IRL'];
export default function Live() {
  const c = useColors();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [going, setGoing] = useState(false);
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState(CATS[0]);
  const [video, setVideo] = useState(true);
  useFocusEffect(useCallback(() => { void api.streams().then((r) => setStreams(r.streams)); }, []));
  async function goLive() {
    try { const r = await api.goLive({ title, category: cat, video }); setGoing(false); router.push(`/live/${r.stream.id}`); } catch (e) { errorToast(e); }
  }
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Live 🔴" right={<Button small title="Go Live" icon="videocam" onPress={() => setGoing(true)} style={{ marginRight: 8 }} />} />
      <FlatList data={streams} keyExtractor={(s) => s.id} contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        ListEmptyComponent={<Empty emoji="📺" title="Nobody’s live right now" body="Be the main character — go live and get gifted." />}
        renderItem={({ item: s }) => (
          <Tap onPress={() => router.push(`/live/${s.id}`)} style={[{ borderRadius: 32, overflow: 'hidden', backgroundColor: c.surfaceContainerLowest }, shadow.warm]}>
            <View style={{ aspectRatio: 16 / 9, backgroundColor: '#3b2e25' }}>
              <Image source={s.coverUrl} style={{ width: '100%', height: '100%', opacity: 0.9 }} contentFit="cover" />
              <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: c.flame, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text variant="labelSm" color="#fff">● LIVE</Text></View>
              <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text variant="labelSm" color="#fff">{s.video ? '🎥 ' : ''}👁 {compact(s.viewers)} • 🎁 {compact(s.giftsTotal)}</Text></View>
            </View>
            <Row gap={12} style={{ padding: 14 }}>
              <Avatar user={s.host} size={40} live />
              <View style={{ flex: 1 }}><Text variant="labelLg" numberOfLines={1}>{s.title}</Text><UserName user={s.host} variant="bodyMd" link={false} /><Text variant="bodySm" color={c.secondary}>{s.category}</Text></View>
            </Row>
          </Tap>
        )} />
      <Modal visible={going} transparent animationType="slide" onRequestClose={() => setGoing(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(59,46,37,0.5)' }}>
          <View style={{ backgroundColor: c.surfaceContainerLowest, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 22, gap: 12 }}>
            <Text variant="headlineMd">Go Live</Text>
            <Input value={title} onChangeText={setTitle} placeholder="Stream title" maxLength={80} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{CATS.map((x) => <Chip key={x} label={x} active={cat === x} onPress={() => setCat(x)} />)}</View>
            <Row gap={10} style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 20, padding: 12 }}>
              <Text style={{ flex: 1 }}><Text variant="labelLg">Camera on</Text> — video for up to 12 viewers. Off = chat-only.</Text>
              <Switch value={video} onValueChange={setVideo} trackColor={{ true: c.flame, false: c.sandstone }} thumbColor="#fff" {...WEB_THUMB} />
            </Row>
            <Text variant="bodySm" color={c.onSurfaceVariant}>Followers get notified. You keep 70% of gifted Sparks. Needs a verified email.</Text>
            <Row gap={8}><Button title="Cancel" variant="ghost" onPress={() => setGoing(false)} /><Button title="Start broadcast" icon="videocam" style={{ flex: 1 }} disabled={title.length < 3} onPress={goLive} /></Row>
          </View>
        </View>
      </Modal>
    </View>
  );
}
