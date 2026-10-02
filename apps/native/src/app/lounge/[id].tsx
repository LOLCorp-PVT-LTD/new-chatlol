import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import type { StickerInput } from '@chatlol/shared';
import { useLocalSearchParams } from 'expo-router';
import type { ChatMessage, Lounge } from '@chatlol/shared';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { haptic } from '../../lib/native';
import { useColors } from '../../lib/theme';
import { ScreenHeader } from '../../components/chrome';
import { ChatList, ChatScreen, Composer } from '../../components/Chat';
import { Row, Tap, Text } from '../../components/ui';

const EMOJI = ['🔥', '😂', '🧡', '💀', '👑', '✨'];
export default function LoungeRoom() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lounge, setLounge] = useState<Lounge | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    void api.lounge(id).then((r) => { setLounge(r.lounge); setOnline(r.lounge.onlineCount); });
    const s = getSocket();
    s.emit('lounge:join', id, (h) => setMessages(h));
    const onMsg = (m: ChatMessage) => { if (m.roomId === id) setMessages((x) => [...x.slice(-200), m]); };
    const onPresence = (p: { loungeId: string; onlineCount: number }) => { if (p.loungeId === id) setOnline((n) => Math.max(n, p.onlineCount)); };
    s.on('lounge:message', onMsg);
    s.on('lounge:presence', onPresence);
    return () => { s.emit('lounge:leave', id); s.off('lounge:message', onMsg); s.off('lounge:presence', onPresence); };
  }, [id]);
  const send = (text = draft, sticker: StickerInput | null = null) => {
    if (!text.trim() && !sticker) return;
    haptic.tap();
    getSocket().emit('lounge:send', { loungeId: id, body: sticker ? '' : text.trim(), sticker });
    if (!sticker) setDraft('');
  };
  return (
    <ChatScreen>
      <ScreenHeader title={lounge ? `${lounge.emoji} ${lounge.name}` : 'Lounge'} />
      {lounge ? <Row style={{ paddingHorizontal: 16, paddingBottom: 8 }} gap={6}><Text variant="bodySm" color={c.online}>●</Text><Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={1}>{online} here • 🎵 {lounge.nowPlaying}</Text></Row> : null}
      <ChatList messages={messages} />
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 10, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
        {EMOJI.map((e) => <Tap key={e} onPress={() => send(e)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, lineHeight: 26 }}>{e}</Text></Tap>)}
      </ScrollView>
      <Composer value={draft} onChange={setDraft} onSend={() => send()} onSticker={(st) => send('', st)} placeholder="Say something… (@mention people)" />
    </ChatScreen>
  );
}
