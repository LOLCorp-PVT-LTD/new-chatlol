import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ChatMessage, Conversation } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api, uploadUri } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { errorToast } from '../../lib/actions';
import { pickImage, haptic } from '../../lib/native';
import { useSession } from '../../lib/store';
import { useColors } from '../../lib/theme';
import { ScreenHeader } from '../../components/chrome';
import { Avatar } from '../../components/people';
import { ChatList, ChatScreen, Composer } from '../../components/Chat';
import { Row, Tap, Text } from '../../components/ui';

export default function DM() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.user?.id);
  const typingUser = useSession((s) => s.typing[id]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const lastTyping = useRef(0);
  const other = conv?.members[0];

  useEffect(() => {
    void api.messages(id).then((r) => { setConv(r.conversation); setMessages(r.messages); });
    const s = getSocket();
    const onMsg = (m: ChatMessage) => {
      if (m.roomId !== id) return;
      setMessages((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
      if (m.author.id !== me) { s.emit('dm:read', { conversationId: id }); haptic.light(); }
    };
    const onRead = (p: { conversationId: string; userId: string; at: string }) => { if (p.conversationId === id && p.userId !== me) setSeenAt(p.at); };
    s.on('dm:message', onMsg);
    s.on('dm:read', onRead);
    return () => { s.off('dm:message', onMsg); s.off('dm:read', onRead); };
  }, [id, me]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      const r = await api.sendMessage(id, { body });
      setMessages((x) => (x.some((y) => y.id === r.message.id) ? x : [...x, r.message]));
      setSeenAt(null);
    } catch (e) { setDraft(body); errorToast(e); }
  }
  async function attach() {
    const uri = await pickImage('library');
    if (!uri) return;
    try {
      const url = await uploadUri(uri);
      const r = await api.sendMessage(id, { body: '', mediaUrl: url, kind: 'image' });
      setMessages((x) => [...x, r.message]);
    } catch (e) { errorToast(e); }
  }
  const typing = () => {
    if (Date.now() - lastTyping.current < 2000) return;
    lastTyping.current = Date.now();
    getSocket().emit('dm:typing', { conversationId: id, typing: true });
  };
  const lastMine = [...messages].reverse().find((m) => m.author.id === me);
  const seen = !!seenAt || (!!lastMine && messages.some((m) => m.author.id !== me && m.createdAt > lastMine.createdAt));

  return (
    <ChatScreen>
      <ScreenHeader title={other?.displayName ?? 'Chat'} right={other ? <Tap onPress={() => router.push(`/u/${other.handle}`)} style={{ paddingRight: 8 }}><Avatar user={other} size={36} /></Tap> : null} />
      {other ? <Text variant="bodySm" color={c.onSurfaceVariant} style={{ paddingHorizontal: 20, marginTop: -8 }}>{typingUser ? 'typing…' : other.online ? 'Active now' : `Active ${timeAgo(other.lastSeenAt)} ago`}</Text> : null}
      {other?.isAI ? (
        <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: c.surfaceContainerLow, borderRadius: 99, padding: 8 }}>
          <Text variant="bodySm" color={c.onSurfaceVariant} style={{ textAlign: 'center' }}>✦ {other.displayName} is an AI persona powered by NVIDIA NIM. Don’t share private info.</Text>
        </View>
      ) : null}
      <ChatList messages={messages} showNames={false} footer={
        <View>
          {lastMine ? <Text variant="labelSm" color={c.outline} style={{ textAlign: 'right', marginTop: 2 }}>{seen ? 'Seen' : 'Sent'}</Text> : null}
          {typingUser ? <Row gap={4} style={{ backgroundColor: c.surfaceContainerLow, alignSelf: 'flex-start', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 }}><Text color={c.outline}>• • •</Text></Row> : null}
        </View>
      } />
      <Composer value={draft} onChange={setDraft} onSend={send} placeholder="Message…" onAttach={attach} onTyping={typing} />
    </ChatScreen>
  );
}
