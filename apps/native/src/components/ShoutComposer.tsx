import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { StickerInput } from '@chatlol/shared';
import { EmojiButton } from './emoji/EmojiSheet';
import { useCaretInsert } from './emoji/useCaretInsert';
import type { Shout } from '@chatlol/shared';
import { SHOUT_MAX, SHOUT_MOODS } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast, reward } from '../lib/actions';
import { haptic } from '../lib/native';
import { useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { Button, Card, Chip, Input, Row, Text } from './ui';

/** 140 characters to everyone, optional mood, one shout every 45 seconds. */
export function ShoutComposer({ replyTo, nextShoutAt, onPosted, onCancelReply, compact }: { replyTo?: Shout | null; nextShoutAt?: string | null; onPosted: (s: Shout, nextAt: string) => void; onCancelReply?: () => void; compact?: boolean }) {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [body, setBody] = useState('');
  const caret = useCaretInsert(body, setBody);
  const [mood, setMood] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextAt, setNextAt] = useState<string | null>(nextShoutAt ?? null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => setNextAt(nextShoutAt ?? null), [nextShoutAt]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => { if (replyTo && !body.includes(`@${replyTo.author.handle}`)) setBody((b) => `@${replyTo.author.handle} ${b}`); }, [replyTo?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const wait = nextAt ? Math.max(0, Math.ceil((Date.parse(nextAt) - now) / 1000)) : 0;
  if (!user) return null;

  async function send(sticker: StickerInput | null = null) {
    if ((!body.trim() && !sticker) || busy || wait) return;
    setBusy(true);
    try {
      const r = await api.shout({ body: sticker ? '' : body.trim(), mood, replyToId: replyTo?.id ?? null, sticker });
      haptic.success();
      setBody(''); setMood(null); setNextAt(r.nextShoutAt);
      onPosted(r.shout, r.nextShoutAt);
      reward(r.reward);
    } catch (e) { errorToast(e); } finally { setBusy(false); }
  }
  return (
    <Card style={{ padding: 12, gap: 10 }}>
      {replyTo ? <Row gap={6}><Text variant="bodySm" color={c.onSurfaceVariant}>↪ Replying to @{replyTo.author.handle}</Text><Text variant="labelMd" color={c.primary} onPress={onCancelReply}>cancel</Text></Row> : null}
      <Row gap={8} style={{ alignItems: 'flex-start' }}>
        <Input value={body} onChangeText={setBody} onSelectionChange={caret.onSelectionChange} placeholder="Shout to everyone… tag people with @handle" maxLength={SHOUT_MAX} multiline style={{ flex: 1, minHeight: compact ? 48 : 64 }} />
        <EmojiButton onInsert={caret.insert} onSticker={(st) => void send(st)} />
      </Row>
      {!compact ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {SHOUT_MOODS.map((m) => <Chip key={m.key} label={`${m.emoji} ${m.label}`} active={mood === m.key} onPress={() => setMood(mood === m.key ? null : m.key)} />)}
        </ScrollView>
      ) : null}
      <Row>
        <Text variant="labelMd" color={SHOUT_MAX - body.length < 15 ? c.error : c.onSurfaceVariant}>{SHOUT_MAX - body.length}</Text>
        <View style={{ flex: 1 }} />
        <Button small title={wait ? `${wait}s` : 'Shout'} icon={wait ? 'hourglass-top' : 'campaign'} disabled={!body.trim() || busy || wait > 0} onPress={() => send()} />
      </Row>
    </Card>
  );
}
