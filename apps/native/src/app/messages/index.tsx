import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Conversation } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../../lib/api';
import { session, useSession } from '../../lib/store';
import { syncBadge } from '../../lib/actions';
import { useColors } from '../../lib/theme';
import { ScreenHeader } from '../../components/chrome';
import { Avatar, UserName } from '../../components/people';
import { Button, Empty, Row, Tap, Text } from '../../components/ui';

export default function Messages() {
  const c = useColors();
  const me = useSession((s) => s.user?.id);
  const typing = useSession((s) => s.typing);
  const [convos, setConvos] = useState<Conversation[]>([]);
  useFocusEffect(useCallback(() => {
    void api.conversations().then((r) => {
      setConvos(r.conversations);
      session.set({ unreadDms: r.conversations.reduce((a, x) => a + x.unread, 0) });
      syncBadge();
    });
  }, []));
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Messages" />
      <FlatList
        data={convos}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={<Empty emoji="💌" title="No DMs yet" body="Find someone and say hi."><Button title="Browse Members" onPress={() => router.push('/members')} /></Empty>}
        renderItem={({ item: cv }) => {
          const other = cv.members[0];
          if (!other) return null;
          return (
            <Tap onPress={() => router.push(`/messages/${cv.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Avatar user={other} size={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row style={{ justifyContent: 'space-between' }}><UserName user={other} link={false} /><Text variant="labelSm" color={c.outline}>{cv.lastMessage ? timeAgo(cv.lastMessage.createdAt) : ''}</Text></Row>
                <Text variant="bodySm" numberOfLines={1} color={typing[cv.id] ? c.flame : cv.unread ? c.onSurface : c.onSurfaceVariant}>
                  {typing[cv.id] ? 'typing…' : `${cv.lastMessage?.author.id === me ? 'You: ' : ''}${cv.lastMessage?.kind === 'image' ? '📷 Photo' : cv.lastMessage?.body ?? ''}`}
                </Text>
              </View>
              {cv.unread ? <View style={{ backgroundColor: c.flame, borderRadius: 99, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><Text variant="labelSm" color="#fff">{cv.unread}</Text></View> : null}
            </Tap>
          );
        }}
      />
    </View>
  );
}
