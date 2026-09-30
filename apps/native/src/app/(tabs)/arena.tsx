import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { HotTake } from '@chatlol/shared';
import { ARENA_MIN_STAKE, arenaOdds, compact } from '@chatlol/shared';
import { api } from '../../lib/api';
import { errorToast, toast } from '../../lib/actions';
import { haptic } from '../../lib/native';
import { session, useSession } from '../../lib/store';
import { useColors, shadow, gradients } from '../../lib/theme';
import { Button, Card, Chip, Countdown, Gradient, Label, Row, Text } from '../../components/ui';

export default function Arena() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [takes, setTakes] = useState<HotTake[]>([]);
  const [pool, setPool] = useState(0);
  const [myStaked, setMyStaked] = useState(0);
  const [stake, setStake] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const r = await api.hotTakes();
    setTakes(r.takes); setPool(r.pool); setMyStaked(r.myStaked); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function place(t: HotTake, side: 'agree' | 'disagree') {
    try {
      const r = await api.stake(t.id, side, stake);
      setTakes((x) => x.map((y) => (y.id === t.id ? r.take : y)));
      session.patchUser({ sparks: r.sparks });
      setMyStaked((n) => n + stake); setPool((n) => n + stake);
      haptic.success();
      toast({ kind: 'reward', title: `Staked ${stake} on ${side.toUpperCase()}`, body: `Potential ${Math.round(stake * arenaOdds(r.take.agreePool, r.take.disagreePool)[side])} ✦` });
    } catch (e) { errorToast(e); }
  }

  return (
    <FlatList
      data={takes}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 130, maxWidth: 680, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.flame} onRefresh={() => { setRefreshing(true); void load(); }} />}
      ListHeaderComponent={
        <View style={{ gap: 14 }}>
          <View style={[{ backgroundColor: '#3b2e25', borderRadius: 32, padding: 20 }, shadow.float]}>
            <Text variant="labelMd" color="#ffede4">⭐ Midnight Mega Vault</Text>
            <Label color="rgba(255,237,228,0.6)">{'\n'}Hot Take Gauntlet Pool</Label>
            <Text variant="headlineXl" color="#ffede4">{compact(pool)} <Text variant="headlineSm" color={c.secondaryContainer}>SPARKS</Text></Text>
            <Row gap={10} style={{ marginTop: 12 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 12 }}><Label color="rgba(255,237,228,0.6)">Your staked</Label><Text variant="headlineSm" color="#fff">🪙 {myStaked}</Text></View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 12 }}><Label color="rgba(255,237,228,0.6)">Wallet</Label><Text variant="headlineSm" color="#fff">✦ {user?.sparks ?? 0}</Text></View>
            </Row>
            <Text variant="bodySm" color="rgba(255,237,228,0.65)" style={{ marginTop: 10 }}>Crowd head-count decides. Winners split the pool. Sparks can’t be cashed out.</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            <Label>Stake</Label>
            {[ARENA_MIN_STAKE, 10, 25, 50, 100].map((n) => <Chip key={n} label={`🪙 ${n}`} active={stake === n} onPress={() => setStake(n)} />)}
          </ScrollView>
        </View>
      }
      renderItem={({ item: t }) => {
        const o = arenaOdds(t.agreePool, t.disagreePool);
        return (
          <Card style={{ padding: 18, gap: 12, opacity: t.resolved ? 0.6 : 1 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: c.sunlit, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text variant="labelSm" color={c.flame}>{t.category}</Text></View>
              <Row gap={4}><Text variant="labelSm" color={c.onSurfaceVariant}>👥 {compact(t.agreeCount + t.disagreeCount)} • ⏱ </Text>{t.resolved ? <Text variant="labelSm">Done</Text> : <Countdown to={t.endsAt} variant="labelSm" color={c.onSurfaceVariant} />}</Row>
            </Row>
            <Text variant="headlineMd">{t.statement}</Text>
            <Row style={{ justifyContent: 'space-between' }}><Text variant="labelMd" color={c.flame}>AGREE {o.agreePct}%</Text><Text variant="labelMd" color={c.tertiary}>{100 - o.agreePct}% DISAGREE</Text></Row>
            <View style={{ height: 12, borderRadius: 99, backgroundColor: c.tertiaryFixed, overflow: 'hidden' }}>
              <Gradient colors={gradients.sunset} style={{ width: `${o.agreePct}%`, height: '100%', borderRadius: 99 }} />
            </View>
            {t.resolved ? (
              <Text variant="labelLg" style={{ textAlign: 'center' }}>{t.outcome === 'agree' ? '✅ AGREE won' : '❌ DISAGREE won'}</Text>
            ) : t.myStake ? (
              <View style={{ backgroundColor: c.sunlit, borderRadius: 99, padding: 12, alignItems: 'center' }}><Text variant="labelLg">🔒 {t.myStake.amount} on {t.myStake.side.toUpperCase()} • potential {Math.round(t.myStake.amount * o[t.myStake.side])} ✦</Text></View>
            ) : (
              <Row gap={8}>
                <Button title={`Agree ${o.agree}x`} style={{ flex: 1 }} onPress={() => place(t, 'agree')} disabled={!user} />
                <Button title={`Disagree ${o.disagree}x`} variant="danger" style={{ flex: 1, backgroundColor: c.tertiary }} onPress={() => place(t, 'disagree')} disabled={!user} />
              </Row>
            )}
          </Card>
        );
      }}
    />
  );
}
