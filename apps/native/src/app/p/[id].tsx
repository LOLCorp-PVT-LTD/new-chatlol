import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Comment, Post } from '@chatlol/shared';
import { TIERS, timeAgo } from '@chatlol/shared';
import { api } from '../../lib/api';
import { errorToast, reward } from '../../lib/actions';
import { useSession } from '../../lib/store';
import { useColors } from '../../lib/theme';
import { PostCard } from '../../components/PostCard';
import { ScreenHeader } from '../../components/chrome';
import { Avatar, UserName } from '../../components/people';
import { ChatScreen, Composer } from '../../components/Chat';
import { Empty, Row, Text } from '../../components/ui';

export default function PostScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useSession((s) => s.user);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => { api.post(id).then((r) => { setPost(r.post); setComments(r.comments); }).catch(() => setMissing(true)); }, [id]);
  async function send() {
    if (!draft.trim()) return;
    try {
      const r = await api.comment(id, draft.trim());
      setComments((x) => [...x, r.comment]); setDraft(''); reward(r.reward);
    } catch (e) { errorToast(e); }
  }
  return (
    <ChatScreen>
      <ScreenHeader title="Post" />
      {missing ? <Empty emoji="🌫️" title="That post vanished" /> : (
        <FlatList
          data={comments}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 680, width: '100%', alignSelf: 'center' }}
          ListHeaderComponent={post ? <View style={{ marginBottom: 8 }}><PostCard post={post} /></View> : null}
          renderItem={({ item }) => (
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              <Avatar user={item.author} size={32} showOnline={false} />
              <View style={{ flex: 1, backgroundColor: c.surfaceContainerLow, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Row gap={6}><UserName user={item.author} variant="bodyMd" />{item.rating ? <Text variant="labelSm" color={c.primary}>{TIERS[item.rating - 1].emoji}</Text> : null}<Text variant="labelSm" color={c.outline}>{timeAgo(item.createdAt)}</Text></Row>
                <Text>{item.body}</Text>
              </View>
            </Row>
          )}
        />
      )}
      {user && post ? <Composer value={draft} onChange={setDraft} onSend={send} placeholder="Add your take or a sweet compliment…" /> : null}
    </ChatScreen>
  );
}
