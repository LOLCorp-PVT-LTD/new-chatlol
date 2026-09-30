import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import type { ChatMessage, LiveStream } from '@chatlol/shared';
import { GIFTS, compact } from '@chatlol/shared';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { errorToast } from '../../lib/actions';
import { haptic } from '../../lib/native';
import { session, useSession } from '../../lib/store';
import { useColors } from '../../lib/theme';
import { ScreenHeader } from '../../components/chrome';
import { Avatar } from '../../components/people';
import { ChatList, ChatScreen, Composer } from '../../components/Chat';
import { Button, Row, Tap, Text } from '../../components/ui';

export default function LiveRoom() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.user?.id);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [viewers, setViewers] = useState(0);
  const [burst, setBurst] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const isHost = stream?.host.id === me;

  useEffect(() => {
    void api.stream(id).then((r) => { setStream(r.stream); setChat(r.chat); setViewers(r.stream.viewers); });
    const s = getSocket();
    s.emit('stream:join', id);
    const onChat = (m: ChatMessage) => { if (m.roomId === id) setChat((x) => [...x.slice(-150), m]); };
    const onGift = (g: { streamId: string; emoji: string; amount: number }) => {
      if (g.streamId !== id) return;
      setBurst(g.emoji); haptic.light(); setTimeout(() => setBurst(null), 1200);
      setStream((st) => (st ? { ...st, giftsTotal: st.giftsTotal + g.amount } : st));
    };
    const onViewers = (v: { streamId: string; viewers: number }) => { if (v.streamId === id) setViewers(v.viewers); };
    s.on('stream:chat', onChat); s.on('stream:gift', onGift); s.on('stream:viewers', onViewers);
    return () => { s.emit('stream:leave', id); s.off('stream:chat', onChat); s.off('stream:gift', onGift); s.off('stream:viewers', onViewers); };
  }, [id]);

  async function gift(giftId: string) {
    try { const r = await api.sendGift(id, giftId); session.patchUser({ sparks: r.sparks }); haptic.success(); } catch (e) { errorToast(e); }
  }
  const send = () => { if (!draft.trim()) return; getSocket().emit('stream:chat', { streamId: id, body: draft.trim() }); setDraft(''); };

  return (
    <ChatScreen>
      <ScreenHeader title={stream?.title ?? 'Live'} right={isHost ? <Button small title="End" variant="danger" onPress={async () => { await api.endLive(id); router.back(); }} style={{ marginRight: 8 }} /> : null} />
      {stream ? (
        <View style={{ marginHorizontal: 16, borderRadius: 32, overflow: 'hidden', aspectRatio: 16 / 10, backgroundColor: '#3b2e25' }}>
          <Image source={stream.coverUrl} style={{ width: '100%', height: '100%', opacity: 0.85 }} contentFit="cover" />
          <Row gap={8} style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
            <Avatar user={stream.host} size={36} live />
            <Text variant="labelLg" color="#fff" style={{ flex: 1 }} numberOfLines={1}>{stream.host.displayName}</Text>
            <View style={{ backgroundColor: c.flame, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text variant="labelSm" color="#fff">LIVE</Text></View>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text variant="labelSm" color="#fff">👁 {compact(viewers)}</Text></View>
          </Row>
          <View style={{ position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><Text variant="labelSm" color="#fff">🎁 {compact(stream.giftsTotal)} gifted</Text></View>
          {burst ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 90, lineHeight: 104 }}>{burst}</Text></View> : null}
        </View>
      ) : null}
      <ChatList messages={chat} />
      {!isHost ? (
        <Row gap={6} style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
          {GIFTS.map((g) => (
            <Tap key={g.id} onPress={() => gift(g.id)} style={{ flex: 1, alignItems: 'center', backgroundColor: c.surfaceContainerLow, borderRadius: 18, paddingVertical: 6 }}>
              <Text style={{ fontSize: 22, lineHeight: 28 }}>{g.emoji}</Text><Text variant="labelSm" color={c.primary} style={{ fontSize: 10 }}>{g.price} ✦</Text>
            </Tap>
          ))}
        </Row>
      ) : null}
      <Composer value={draft} onChange={setDraft} onSend={send} placeholder="Say something nice…" />
    </ChatScreen>
  );
}
