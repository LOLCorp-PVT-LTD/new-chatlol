import React, { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { RichText } from './emoji/RichText';
import { actionSheet, confirmDialog, reportDialog } from '../lib/dialog';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Post, ReactionKind, VibeScore } from '@chatlol/shared';
import { REACTIONS, compact, tierByKey, timeAgo, toTen } from '@chatlol/shared';
import { api } from '../lib/api';
import { reward, errorToast, toast } from '../lib/actions';
import { useSession } from '../lib/store';
import { haptic, shareLink } from '../lib/native';
import { useColors } from '../lib/theme';
import { Avatar, UserName } from './people';
import { TierPad } from './TierPad';
import { Button, Card, Gradient, Icon, IconButton, Row, Tap, Text } from './ui';

function PostCardImpl({ post: initial, onDeleted }: { post: Post; onDeleted?: (id: string) => void }) {
  const c = useColors();
  const me = useSession((s) => s.user?.id);
  const [post, setPost] = useState(initial);
  const [crown, setCrown] = useState(false);
  const mine = me === post.author.id;
  const revealed = mine || !!post.myRating;
  const tier = tierByKey(post.ratings.tier);
  const total = Object.values(post.reactions).reduce((a, b) => a + b, 0);
  const battleTotal = post.battle?.reduce((a, o) => a + o.votes, 0) ?? 0;

  const guard = () => { if (!me) { router.push('/welcome'); return false; } return true; };

  async function rate(v: VibeScore) {
    if (!guard() || mine) return;
    const prev = post.myRating;
    setPost({ ...post, myRating: v });
    try {
      const r = await api.rate(post.id, v);
      setPost(r.post);
      reward(r.reward);
      if (v === 5 && !prev) { setCrown(true); setTimeout(() => setCrown(false), 900); }
    } catch (e) { setPost({ ...post, myRating: prev }); errorToast(e); }
  }
  async function react(k: ReactionKind) {
    if (!guard()) return;
    haptic.light();
    setPost((await api.react(post.id, post.myReaction === k ? null : k)).post);
  }
  async function vote(id: string) {
    if (!guard() || post.myBattleVote) return;
    haptic.light();
    setPost((await api.voteBattle(post.id, id)).post);
  }
  function more() {
    void actionSheet(undefined, [
      { label: 'Share', icon: 'ios-share', onPress: () => shareLink(`/p/${post.id}`, post.body) },
      mine
        ? { label: 'Delete post', icon: 'delete', danger: true, onPress: async () => {
            if (!(await confirmDialog({ title: 'Delete this post?', body: 'Its ratings and comments go with it.', icon: 'delete', danger: true, confirmText: 'Delete' }))) return;
            await api.deletePost(post.id); onDeleted?.(post.id);
          } }
        : { label: 'Report', icon: 'flag', danger: true, onPress: async () => {
            const reason = await reportDialog('this post');
            if (!reason) return;
            await api.report({ targetType: 'post', targetId: post.id, reason }); toast({ kind: 'info', title: 'Thanks — SafeShield will review it 🛡️' });
          } },
    ]);
  }

  return (
    <Card style={{ overflow: 'hidden' }}>
      <Row style={{ padding: 16, paddingBottom: 10 }} gap={12}>
        <Tap onPress={() => router.push(`/u/${post.author.handle}`)}><Avatar user={post.author} size={44} /></Tap>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row gap={6}><UserName user={post.author} /><View style={{ backgroundColor: c.surfaceContainer, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 1 }}><Text variant="labelSm" color={c.onSurfaceVariant}>Lv {post.author.level}</Text></View></Row>
          <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={1}>@{post.author.handle} • {timeAgo(post.createdAt)}{post.kind === 'drop' ? ' • 🌅 Sunset Drop' : post.kind === 'birthday' ? ' • 🎂 Birthday' : post.author.streakDays > 2 ? ` • 🔥 ${post.author.streakDays}` : ''}</Text>
        </View>
        <IconButton name="more-horiz" label="More" onPress={more} size={38} />
      </Row>

      {post.kind === 'birthday' ? (
        <Gradient colors={['#ff5e00', '#ff8c42', '#ffd166']} style={{ marginHorizontal: 12, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 18, alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 30, lineHeight: 38 }}>🎈 🎂 🎉</Text>
          <Avatar user={post.author} size={80} />
          <Text variant="headlineMd" color="#fff" style={{ textAlign: 'center' }}>Happy birthday, {post.author.displayName.split(' ')[0]}! 🎂</Text>
          <Text variant="bodyMd" color="rgba(255,255,255,0.95)">Leave a wish below — it means a lot 🧡</Text>
          {!mine ? <Button small variant="white" title="🎉 Send a birthday wish" onPress={() => router.push(`/p/${post.id}`)} style={{ marginTop: 6 }} /> : null}
        </Gradient>
      ) : post.body ? <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}><RichText text={post.body} variant="bodyLg" tags /></View> : null}

      {post.mediaUrl ? (
        <Pressable onPress={() => router.push(`/p/${post.id}`)} onLongPress={() => rate(5)} delayLongPress={350} style={{ marginHorizontal: 10, borderRadius: 24, overflow: 'hidden', backgroundColor: c.surfaceContainer }}>
          <Image source={post.mediaUrl} style={{ width: '100%', aspectRatio: 4 / 5 }} contentFit="cover" transition={200} recyclingKey={post.id} />
          {post.soundtrack ? <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(255,248,245,0.85)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}><Text variant="labelSm">🎵 {post.soundtrack}</Text></View> : null}
          {revealed && post.ratings.count ? (
            <View style={{ position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(255,248,245,0.92)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 18 }}>{tier.emoji}</Text><Text variant="labelLg" color={c.primary}>{tier.label.toUpperCase()}</Text>
              <Text variant="labelSm" color={c.onSurfaceVariant}>{post.ratings.consensusPct}% • {compact(post.ratings.count)}</Text>
            </View>
          ) : post.ratings.count ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,234,222,0.94)', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="labelSm">🔒 Rate to unveil the consensus</Text><Text variant="labelSm" color={c.primary}>BLIND VERDICT</Text>
            </View>
          ) : null}
          {crown ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' } as never}><Text style={{ fontSize: 96, lineHeight: 110 }}>👑</Text></View> : null}
        </Pressable>
      ) : null}

      {post.battle ? (
        <Row style={{ paddingHorizontal: 16 }} gap={8}>
          {post.battle.map((o) => {
            const pct = battleTotal ? Math.round((o.votes / battleTotal) * 100) : 0;
            const chosen = post.myBattleVote === o.id;
            return (
              <Pressable key={o.id} onPress={() => vote(o.id)} style={{ flex: 1, borderRadius: 24, borderWidth: 2, borderColor: chosen ? c.flame : c.sandstone, padding: 14, overflow: 'hidden', backgroundColor: chosen ? c.sunlit : 'transparent' }}>
                {post.myBattleVote ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: 'rgba(255,94,0,0.1)' }} /> : null}
                <Text variant="headlineSm">{o.label}</Text>
                <Text variant="labelSm" color={post.myBattleVote ? c.primary : c.onSurfaceVariant}>{post.myBattleVote ? `${pct}% • ${compact(o.votes)} votes` : 'Tap to vote'}</Text>
              </Pressable>
            );
          })}
        </Row>
      ) : null}

      {post.kind !== 'text' && post.kind !== 'battle' && post.kind !== 'birthday' && !mine ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}><TierPad value={post.myRating} onRate={rate} compact /></View>
      ) : mine && post.ratings.count ? (
        <Text variant="bodySm" color={c.onSurfaceVariant} style={{ paddingHorizontal: 16, paddingTop: 12 }}>Your vibe score: <Text variant="labelMd" color={c.primary}>{toTen(post.ratings.avg)}/10</Text> from {post.ratings.count} ratings</Text>
      ) : null}

      <Row style={{ padding: 10, paddingTop: 12 }} gap={4}>
        <Row gap={0} style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 99, padding: 3 }}>
          {REACTIONS.map((r) => (
            <Pressable key={r.key} onPress={() => react(r.key)} accessibilityLabel={r.key}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: post.myReaction === r.key ? 'rgba(255,94,0,0.15)' : 'transparent' }}>
              <Text style={{ fontSize: 17, lineHeight: 22 }}>{r.emoji}</Text>
            </Pressable>
          ))}
          {total ? <Text variant="labelMd" color={c.onSurfaceVariant} style={{ paddingHorizontal: 6 }}>{compact(total)}</Text> : null}
        </Row>
        <Tap onPress={() => router.push(`/p/${post.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 }}>
          <Icon name="chat-bubble-outline" size={20} /><Text variant="labelMd" color={c.onSurfaceVariant}>{post.commentCount || ''}</Text>
        </Tap>
        <View style={{ flex: 1 }} />
        <IconButton name="send" label="Share" onPress={() => shareLink(`/p/${post.id}`, post.body)} size={40} />
      </Row>
    </Card>
  );
}

export const PostCard = memo(PostCardImpl);
