import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { Friendship, UserPublic } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast } from '../lib/actions';
import { useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Avatar, UserName } from '../components/people';
import { FriendButton } from '../components/FriendButton';
import { Button, Card, Chip, Empty, IconButton, Row, Tap, Text } from '../components/ui';

type Tab = 'requests' | 'sent' | 'friends';
type Req = { user: UserPublic; at: string };

/** Friend requests you've received, ones you've sent, and your friends. */
export default function Friends() {
  const c = useColors();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab | null>(params.tab ?? null);
  const [incoming, setIncoming] = useState<Req[]>([]);
  const [outgoing, setOutgoing] = useState<Req[]>([]);
  const [friends, setFriends] = useState<{ user: UserPublic; since: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([api.friendRequests(), api.friends()]);
      setIncoming(r.incoming);
      setOutgoing(r.outgoing);
      setFriends(f.items);
      setTab((t) => t ?? (r.incoming.length ? 'requests' : 'friends'));
    } catch (e) { errorToast(e); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const update = (set: React.Dispatch<React.SetStateAction<Req[]>>, id: string) => (f: Friendship) => {
    set((list) => list.map((x) => (x.user.id === id ? { ...x, user: { ...x.user, friendship: f } } : x)));
    if (f === 'friends' || f === 'none') setTimeout(() => void load(), 600);
  };
  const row = (r: Req, sub: string, set: React.Dispatch<React.SetStateAction<Req[]>>) => (
    <Card key={r.user.id} style={{ padding: 12, gap: 10 }}>
      <Row gap={10}>
        <Tap onPress={() => router.push(`/u/${r.user.handle}`)}><Avatar user={r.user} size={48} /></Tap>
        <View style={{ flex: 1 }}><UserName user={r.user} /><Text variant="bodySm" color={c.onSurfaceVariant}>{sub}</Text></View>
      </Row>
      <FriendButton user={r.user} onChange={update(set, r.user.id)} />
    </Card>
  );

  const current = tab ?? 'requests';
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Friends" right={<IconButton name="person-search" label="Find people" onPress={() => router.push('/members')} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Row gap={8}>
          <Chip label={`Requests${incoming.length ? ` · ${incoming.length}` : ''}`} active={current === 'requests'} onPress={() => setTab('requests')} />
          <Chip label={`Sent${outgoing.length ? ` · ${outgoing.length}` : ''}`} active={current === 'sent'} onPress={() => setTab('sent')} />
          <Chip label={`Friends${friends.length ? ` · ${friends.length}` : ''}`} active={current === 'friends'} onPress={() => setTab('friends')} />
        </Row>
        {loading ? null : current === 'requests' ? (
          incoming.length ? incoming.map((r) => row(r, `@${r.user.handle} · ${timeAgo(r.at)} ago`, setIncoming)) : <Empty emoji="🤝" title="No friend requests" body="When someone wants to be friends, it shows up here." />
        ) : current === 'sent' ? (
          outgoing.length ? outgoing.map((r) => row(r, `Sent ${timeAgo(r.at)} ago`, setOutgoing)) : <Empty emoji="📨" title="No pending requests" />
        ) : friends.length ? (
          friends.map((f) => (
            <Card key={f.user.id} style={{ padding: 12 }}>
              <Row gap={10}>
                <Tap onPress={() => router.push(`/u/${f.user.handle}`)}><Avatar user={f.user} size={44} /></Tap>
                <View style={{ flex: 1 }}><UserName user={f.user} /><Text variant="bodySm" color={c.onSurfaceVariant}>Friends since {new Date(f.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</Text></View>
                <IconButton name="chat" label="Message" onPress={() => void api.openConversation(f.user.id).then((r) => router.push(`/messages/${r.conversation.id}`)).catch(errorToast)} />
              </Row>
            </Card>
          ))
        ) : (
          <Empty emoji="🫶" title="No friends yet" body="Send a friend request from anyone’s profile."><Button small title="Find people" onPress={() => router.push('/members')} /></Empty>
        )}
      </ScrollView>
    </View>
  );
}
