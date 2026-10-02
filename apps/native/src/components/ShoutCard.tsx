import React from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import type { ReactionKind, Shout } from '@chatlol/shared';
import { REACTIONS, SHOUT_MOODS, timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast, toast } from '../lib/actions';
import { haptic } from '../lib/native';
import { useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { Avatar, UserName } from './people';
import { Card, Icon, Row, Tap, Text } from './ui';

/** One shout on the Global Shoutbox: mood, quoted reply, @mentions, reactions, reply and report. */
export function ShoutCard({ shout, onUpdate, onReply, onRemoved, flat }: { shout: Shout; onUpdate: (s: Shout) => void; onReply?: (s: Shout) => void; onRemoved?: (id: string) => void; flat?: boolean }) {
  const c = useColors();
  const me = useSession((s) => s.user);
  const mood = SHOUT_MOODS.find((m) => m.key === shout.mood);
  const parts = shout.body.split(/([@#][\w.]{2,30})/g).filter(Boolean);
  const canDelete = me && (me.id === shout.author.id || me.role === 'admin' || me.role === 'mod');

  async function react(kind: ReactionKind) {
    if (!me) return toast({ kind: 'info', title: 'Sign in to react' });
    haptic.tap();
    try { onUpdate((await api.reactShout(shout.id, shout.myReaction === kind ? null : kind)).shout); } catch (e) { errorToast(e); }
  }
  function more() {
    Alert.alert('Shout', undefined, [
      ...(canDelete ? [{ text: 'Delete', style: 'destructive' as const, onPress: async () => { await api.deleteShout(shout.id); onRemoved?.(shout.id); } }] : []),
      ...(!canDelete && me ? [{ text: 'Report', onPress: async () => { await api.report({ targetType: 'shout', targetId: shout.id, reason: 'Reported from the Shoutbox' }); toast({ kind: 'info', title: 'Thanks — SafeShield is reviewing it 🛡️' }); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  const body = (
    <Row gap={10} style={{ alignItems: 'flex-start' }}>
      <Tap onPress={() => router.push(`/u/${shout.author.handle}`)}><Avatar user={shout.author} size={flat ? 36 : 42} /></Tap>
      <View style={{ flex: 1, gap: 4 }}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <UserName user={shout.author} variant="labelLg" />
          {mood ? <View style={{ backgroundColor: c.sunlit, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 1 }}><Text variant="labelSm" color={c.flame}>{mood.emoji} {mood.label}</Text></View> : null}
          <Text variant="bodySm" color={c.onSurfaceVariant}>{timeAgo(shout.createdAt)}</Text>
        </Row>
        {shout.replyTo ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: c.flame, backgroundColor: c.surfaceContainerLow, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={1}>↪ @{shout.replyTo.author.handle} {shout.replyTo.body}</Text>
          </View>
        ) : null}
        <Text variant={flat ? 'bodyMd' : 'bodyLg'}>
          {parts.map((p, i) =>
            p.startsWith('@') ? <Text key={i} variant={flat ? 'bodyMd' : 'bodyLg'} color={c.primary} style={{ fontWeight: '700' }} onPress={() => router.push(`/u/${p.slice(1)}`)}>{p}</Text>
              : p.startsWith('#') ? <Text key={i} variant={flat ? 'bodyMd' : 'bodyLg'} color={c.primary}>{p}</Text> : p,
          )}
        </Text>
        <Row gap={4} style={{ flexWrap: 'wrap', marginTop: 2 }}>
          {REACTIONS.map((r) => (
            <Tap key={r.key} onPress={() => react(r.key)} accessibilityLabel={`React ${r.key}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 30, paddingHorizontal: 8, borderRadius: 99, backgroundColor: shout.myReaction === r.key ? c.flame : c.surfaceContainerLow }}>
              <Text>{r.emoji}</Text>{shout.reactions[r.key] ? <Text variant="labelSm" color={shout.myReaction === r.key ? '#fff' : c.onSurface}>{shout.reactions[r.key]}</Text> : null}
            </Tap>
          ))}
          {onReply && me ? <Tap onPress={() => onReply(shout)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 30, paddingHorizontal: 8 }}><Icon name="reply" size={18} /><Text variant="labelMd">Reply{shout.replyCount ? ` · ${shout.replyCount}` : ''}</Text></Tap> : null}
          <View style={{ flex: 1 }} />
          {me ? <Tap onPress={more} accessibilityLabel="More" style={{ padding: 4 }}><Icon name="more-horiz" size={18} /></Tap> : null}
        </Row>
      </View>
    </Row>
  );
  return flat ? <View style={{ paddingVertical: 10 }}>{body}</View> : <Card style={{ padding: 14 }}>{body}</Card>;
}
