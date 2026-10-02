import React, { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { loadNotifications, syncBadge } from '../lib/actions';
import { session, useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Avatar } from '../components/people';
import { Empty, Gradient, Icon, Tap, Text, type IconName } from '../components/ui';

const ICONS: Record<string, IconName> = { rating: 'star', gift: 'redeem', invite: 'live-tv', consensus: 'verified', drop: 'wb-twilight', follow: 'person-add', comment: 'chat-bubble', dm: 'mail', arena: 'sports-kabaddi', level: 'military-tech', system: 'campaign', mention: 'alternate-email', profile_view: 'visibility', profile_rating: 'star', wall: 'sticky-note-2' };
export default function Notifications() {
  const c = useColors();
  const items = useSession((s) => s.notifications);
  useEffect(() => {
    void loadNotifications().then(async () => { await api.markNotificationsRead(); session.set({ unread: 0 }); syncBadge(); });
  }, []);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Notifications" />
      <FlatList data={items} keyExtractor={(n) => n.id} contentContainerStyle={{ paddingVertical: 8, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        ListEmptyComponent={<Empty emoji="🔔" title="All caught up" body="Ratings, gifts and invites land here." />}
        renderItem={({ item: n }) => (
          <Tap onPress={() => n.link && router.push(n.link as never)} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: n.read ? 'transparent' : c.sunlit }}>
            {n.actor ? <Avatar user={n.actor} size={46} showOnline={false} /> : n.anonymous ? (
              <View style={{ width: 46, height: 46, borderRadius: 23, overflow: 'hidden' }}><Image source={n.teaserAvatar ?? undefined} style={{ width: 46, height: 46 }} blurRadius={12} /></View>
            ) : (
              <Gradient style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}><Icon name={ICONS[n.kind] ?? 'bolt'} color="#fff" /></Gradient>
            )}
            <View style={{ flex: 1 }}>
              <Text variant="labelLg">{n.title}</Text>
              {n.anonymous ? <Text variant="labelSm" color={c.flame}>👑 See who with Premium</Text> : null}
              <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={2}>{n.body}</Text>
              <Text variant="labelSm" color={c.outline}>{timeAgo(n.createdAt)}</Text>
            </View>
          </Tap>
        )} />
    </View>
  );
}
