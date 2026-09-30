import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import type { LeaderboardEntry } from '@chatlol/shared';
import { compact } from '@chatlol/shared';
import { api } from '../lib/api';
import { useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Avatar, UserName } from '../components/people';
import { Chip, Row, Tap, Text } from '../components/ui';

export default function Leaderboard() {
  const c = useColors();
  const [kind, setKind] = useState<'vibe' | 'streak' | 'xp'>('vibe');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  useEffect(() => { void api.leaderboard(kind).then((r) => setEntries(r.entries)); }, [kind]);
  const fmt = (n: number) => (kind === 'vibe' ? `⭐ ${n}` : kind === 'streak' ? `🔥 ${n}` : `${compact(n)} XP`);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Hall of Fame 🏆" />
      <FlatList data={entries} keyExtractor={(e) => e.user.id} contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={<Row gap={8} style={{ marginBottom: 8 }}>{([['vibe', '⭐ Vibe'], ['streak', '🔥 Streak'], ['xp', '⚡ XP']] as const).map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}</Row>}
        renderItem={({ item: e }) => (
          <Tap onPress={() => router.push(`/u/${e.user.handle}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 24, backgroundColor: e.rank <= 3 ? c.sunlit : c.surfaceContainerLowest }}>
            <Text variant="headlineSm" style={{ width: 34 }}>{e.rank <= 3 ? ['👑', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}</Text>
            <Avatar user={e.user} size={44} />
            <View style={{ flex: 1 }}><UserName user={e.user} link={false} /></View>
            <Text variant="labelLg" color={c.primary}>{fmt(e.score)}</Text>
          </Tap>
        )} />
    </View>
  );
}
