import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { ShoutReply, ShoutThread } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../../lib/api';
import { errorToast } from '../../lib/actions';
import { useColors } from '../../lib/theme';
import { ScreenHeader } from '../../components/chrome';
import { Avatar, UserName } from '../../components/people';
import { ChatScreen, Composer } from '../../components/Chat';
import { Card, Row, Text } from '../../components/ui';

export default function Thread() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [thread, setThread] = useState<ShoutThread | null>(null);
  const [replies, setReplies] = useState<ShoutReply[]>([]);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    const load = () => api.thread(id).then((r) => { setThread(r.thread); setReplies(r.replies); });
    void load();
    const i = setInterval(load, 20_000);
    return () => clearInterval(i);
  }, [id]);
  async function send() {
    if (!draft.trim()) return;
    try { const r = await api.replyThread(id, draft.trim()); setReplies((x) => [...x, r.reply]); setDraft(''); } catch (e) { errorToast(e); }
  }
  return (
    <ChatScreen>
      <ScreenHeader title="Forum" />
      <FlatList data={replies} keyExtractor={(r) => r.id} contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={thread ? (
          <Card style={{ padding: 18, gap: 8, marginBottom: 6 }}>
            <Row gap={10}><Avatar user={thread.author} size={40} /><View><UserName user={thread.author} /><Text variant="bodySm" color={c.onSurfaceVariant}>{timeAgo(thread.createdAt)} ago</Text></View></Row>
            <Text variant="headlineLg">{thread.title}</Text>
            <Text variant="bodyLg">{thread.body}</Text>
            <Text variant="labelMd" color={c.onSurfaceVariant}>⬆ {thread.upvotes} • 💬 {replies.length}</Text>
          </Card>
        ) : null}
        renderItem={({ item: r }) => (
          <Row gap={10} style={{ alignItems: 'flex-start' }}>
            <Avatar user={r.author} size={32} showOnline={false} />
            <View style={{ flex: 1, backgroundColor: c.surfaceContainerLowest, borderRadius: 20, padding: 12 }}>
              <Row gap={6}><UserName user={r.author} variant="bodyMd" /><Text variant="labelSm" color={c.outline}>{timeAgo(r.createdAt)}</Text></Row>
              <Text>{r.body}</Text>
            </View>
          </Row>
        )} />
      <Composer value={draft} onChange={setDraft} onSend={send} placeholder="Add to the shout…" />
    </ChatScreen>
  );
}
