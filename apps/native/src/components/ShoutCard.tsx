import React from 'react';
import { View } from 'react-native';
import { RichText } from './emoji/RichText';
import { StickerView } from './emoji/StickerView';
import { actionSheet, confirmDialog, reportDialog } from '../lib/dialog';
import { router } from 'expo-router';
import type { ReactionKind, Shout } from '@chatlol/shared';
import { REACTIONS, SHOUT_MOODS, timeAgo, can } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast, toast } from '../lib/actions';
import { haptic } from '../lib/native';
import { useSession } from '../lib/store';
import { useColors, useSelectedColors } from '../lib/theme';
import { Avatar, UserName } from './people';
import { Card, Icon, Row, Tap, Text } from './ui';

/** One shout on the Global Shoutbox: mood, quoted reply, @mentions, reactions, reply and report. */
export function ShoutCard({ shout, onUpdate, onReply, onRemoved, flat }: { shout: Shout; onUpdate: (s: Shout) => void; onReply?: (s: Shout) => void; onRemoved?: (id: string) => void; flat?: boolean }) {
  const c = useColors();
  const me = useSession((s) => s.user);
  const sel = useSelectedColors();
  const mood = SHOUT_MOODS.find((m) => m.key === shout.mood);
  const canDelete = me && (me.id === shout.author.id || can(me, 'reports'));

  async function react(kind: ReactionKind) {
    if (!me) return toast({ kind: 'info', title: 'Sign in to react' });
    haptic.tap();
    try { onUpdate((await api.reactShout(shout.id, shout.myReaction === kind ? null : kind)).shout); } catch (e) { errorToast(e); }
  }
  function more() {
    void actionSheet(undefined, [
      ...(canDelete ? [{ label: 'Delete shout', icon: 'delete' as const, danger: true, onPress: async () => {
        if (!(await confirmDialog({ title: 'Delete this shout?', body: 'It disappears from the Shoutbox for everyone.', icon: 'delete', danger: true, confirmText: 'Delete' }))) return;
        await api.deleteShout(shout.id); onRemoved?.(shout.id);
      } }] : []),
      ...(!canDelete && me ? [{ label: 'Report', icon: 'flag' as const, danger: true, onPress: async () => {
        const reason = await reportDialog('this shout');
        if (!reason) return;
        await api.report({ targetType: 'shout', targetId: shout.id, reason }); toast({ kind: 'info', title: 'Thanks — LOLShield is reviewing it 🛡️' });
      } }] : []),
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
        {shout.body ? <RichText text={shout.body} variant={flat ? 'bodyMd' : 'bodyLg'} linkColor={c.primary} tags /> : null}
        {shout.sticker ? <StickerView sticker={shout.sticker} size={flat ? 96 : 128} /> : null}
        <Row gap={4} style={{ flexWrap: 'wrap', marginTop: 2 }}>
          {REACTIONS.map((r) => (
            <Tap key={r.key} onPress={() => react(r.key)} accessibilityLabel={`React ${r.key}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 30, paddingHorizontal: 8, borderRadius: 99, backgroundColor: shout.myReaction === r.key ? sel.bg : c.surfaceContainerLow, borderWidth: shout.myReaction === r.key ? 1.5 : 0, borderColor: sel.border }}>
              <Text>{r.emoji}</Text>{shout.reactions[r.key] ? <Text variant="labelSm" color={shout.myReaction === r.key ? sel.fg : c.onSurface}>{shout.reactions[r.key]}</Text> : null}
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
