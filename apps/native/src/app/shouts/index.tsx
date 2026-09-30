import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { ShoutThread } from '@chatlol/shared';
import { compact, timeAgo } from '@chatlol/shared';
import { api } from '../../lib/api';
import { errorToast, reward } from '../../lib/actions';
import { useColors } from '../../lib/theme';
import { ScreenHeader } from '../../components/chrome';
import { Avatar, UserName } from '../../components/people';
import { Button, Card, Chip, IconButton, Input, Row, Tap, Text } from '../../components/ui';

type Board = { id: string; name: string; emoji: string; threads: number };
export default function Shouts() {
  const c = useColors();
  const [boards, setBoards] = useState<Board[]>([]);
  const [board, setBoard] = useState<string | undefined>();
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');
  const [threads, setThreads] = useState<ShoutThread[]>([]);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ board: 'daily', title: '', body: '' });
  useEffect(() => { void api.boards().then((r) => setBoards(r.boards)); }, []);
  const load = useCallback(async () => setThreads((await api.threads({ board, sort })).items), [board, sort]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function vote(t: ShoutThread, v: 1 | -1) {
    const r = await api.voteThread(t.id, t.myVote === v ? 0 : v);
    setThreads((x) => x.map((y) => (y.id === t.id ? r.thread : y)));
  }
  async function create() {
    try { const r = await api.createThread(draft); reward(r.reward); setComposing(false); router.push(`/shouts/${r.thread.id}`); } catch (e) { errorToast(e); }
  }
  const b = (id: string) => boards.find((x) => x.id === id);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Shouts 📣" right={<Button small title="New" icon="campaign" style={{ marginRight: 8 }} onPress={() => { setDraft((d) => ({ ...d, board: board ?? 'daily' })); setComposing(true); }} />} />
      <FlatList data={threads} keyExtractor={(t) => t.id} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="🌐 All" active={!board} onPress={() => setBoard(undefined)} />
              {boards.map((x) => <Chip key={x.id} label={`${x.emoji} ${x.name}`} active={board === x.id} onPress={() => setBoard(x.id)} />)}
            </ScrollView>
            <Row gap={8}>{(['hot', 'new', 'top'] as const).map((s) => <Chip key={s} label={s === 'hot' ? '🔥 Hot' : s === 'new' ? '✨ New' : '🏆 Top'} active={sort === s} onPress={() => setSort(s)} />)}</Row>
          </View>
        }
        renderItem={({ item: t }) => (
          <Card style={{ padding: 14, flexDirection: 'row', gap: 10 }}>
            <View style={{ alignItems: 'center' }}>
              <IconButton name="arrow-upward" label="Upvote" size={34} color={t.myVote === 1 ? c.flame : undefined} onPress={() => vote(t, 1)} />
              <Text variant="labelLg">{compact(t.upvotes)}</Text>
              <IconButton name="arrow-downward" label="Downvote" size={34} color={t.myVote === -1 ? c.tertiary : undefined} onPress={() => vote(t, -1)} />
            </View>
            <Tap onPress={() => router.push(`/shouts/${t.id}`)} style={{ flex: 1, gap: 4 }}>
              <Text variant="labelSm" color={c.onSurfaceVariant}>{t.pinned ? '📌 ' : ''}{b(t.board)?.emoji} {b(t.board)?.name} • {timeAgo(t.lastActivityAt)}</Text>
              <Text variant="headlineSm">{t.title}</Text>
              <Text color={c.onSurfaceVariant} numberOfLines={2}>{t.body}</Text>
              <Row gap={6} style={{ marginTop: 4 }}><Avatar user={t.author} size={22} showOnline={false} /><UserName user={t.author} variant="bodyMd" link={false} /><View style={{ flex: 1 }} /><Text variant="labelMd" color={c.onSurfaceVariant}>💬 {t.replyCount}</Text></Row>
            </Tap>
          </Card>
        )} />
      <Modal visible={composing} transparent animationType="slide" onRequestClose={() => setComposing(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(59,46,37,0.5)' }}>
          <View style={{ backgroundColor: c.surfaceContainerLowest, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 22, gap: 12 }}>
            <Text variant="headlineMd">New Shout</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{boards.map((x) => <Chip key={x.id} label={`${x.emoji} ${x.name}`} active={draft.board === x.id} onPress={() => setDraft({ ...draft, board: x.id })} />)}</ScrollView>
            <Input value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="Title" maxLength={120} />
            <Input value={draft.body} onChangeText={(body) => setDraft({ ...draft, body })} placeholder="What’s on your mind?" multiline style={{ minHeight: 120 }} maxLength={4000} />
            <Row gap={8}><Button title="Cancel" variant="ghost" onPress={() => setComposing(false)} /><Button title="Post Shout (+20 ✦)" style={{ flex: 1 }} disabled={draft.title.length < 4 || !draft.body.trim()} onPress={create} /></Row>
          </View>
        </View>
      </Modal>
    </View>
  );
}
