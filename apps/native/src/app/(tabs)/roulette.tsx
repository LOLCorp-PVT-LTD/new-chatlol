import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { RouletteCard, RouletteResult, VibeScore } from '@chatlol/shared';
import { TIERS, comboMultiplier, tierByKey } from '@chatlol/shared';
import { api } from '../../lib/api';
import { reward, errorToast } from '../../lib/actions';
import { haptic } from '../../lib/native';
import { session, useSession } from '../../lib/store';
import { useColors, shadow, gradients } from '../../lib/theme';
import { TierPad } from '../../components/TierPad';
import { Avatar, UserName } from '../../components/people';
import { Button, Empty, Gradient, Icon, Label, Progress, Row, Text } from '../../components/ui';

export default function Roulette() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [card, setCard] = useState<RouletteCard | null>(null);
  const [result, setResult] = useState<RouletteResult | null>(null);
  const [vote, setVote] = useState<VibeScore | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const combo = user?.comboCount ?? 0;

  const next = useCallback(async () => {
    clearTimeout(timer.current);
    setLoading(true); setResult(null); setVote(null);
    setCard(await api.rouletteNext());
    setLoading(false);
  }, []);
  useEffect(() => { void next(); return () => clearTimeout(timer.current); }, [next]);

  async function rate(v: VibeScore) {
    if (!card || result) return;
    setVote(v);
    try {
      const r = await api.rouletteVote(card.post.id, v);
      setResult(r);
      const u = session.get().user;
      if (u) session.patchUser({ comboCount: r.comboCount, dailyGoal: { ...u.dailyGoal, done: Math.min(u.dailyGoal.target, u.dailyGoal.done + 1) } });
      r.match ? haptic.success() : haptic.light();
      reward(r.reward);
      timer.current = setTimeout(next, r.match ? 2200 : 1800);
    } catch (e) { errorToast(e); void next(); }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 130, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <View style={[{ backgroundColor: c.surfaceContainerLow, borderRadius: 32, padding: 16, gap: 10 }, shadow.warm]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6} style={{ backgroundColor: c.flame, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Icon name="local-fire-department" size={16} color="#fff" /><Text variant="labelSm" color="#fff">COMBO {combo}x • {comboMultiplier(combo).toFixed(2).replace(/\.?0+$/, '')}x</Text>
          </Row>
          <Text variant="labelSm" color={c.secondary}>Match the crowd to stack</Text>
        </Row>
        {user ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="labelMd">🏅 Solo Quest: Daily Oracle</Text>
              <Text variant="labelSm" color={c.secondary}><Text variant="headlineSm" color={c.primary}>{user.dailyGoal.done}</Text>/{user.dailyGoal.target} (+100 ✦)</Text>
            </Row>
            <Progress value={user.dailyGoal.done} max={user.dailyGoal.target} />
          </>
        ) : null}
      </View>

      {loading && !card ? <View style={{ aspectRatio: 4 / 5, borderRadius: 48, backgroundColor: c.surfaceContainer }} /> : null}
      {!loading && !card ? <Empty emoji="🎰" title="You’ve rated everything!" body="Fresh vibes drop every few minutes."><Button title="Check again" onPress={next} /></Empty> : null}

      {card ? (
        <>
          <View style={[{ borderRadius: 48, overflow: 'hidden', backgroundColor: c.surfaceContainer }, shadow.pop]}>
            <Image source={card.post.mediaUrl} style={{ width: '100%', aspectRatio: 4 / 5 }} contentFit="cover" transition={250} />
            <LinearGradient colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(59,46,37,0.9)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: 60, gap: 4 }}>
              <Row gap={8}><Avatar user={card.post.author} size={34} /><UserName user={card.post.author} color="#fff" /></Row>
              <Text color="#fff" numberOfLines={2}>{card.post.body}</Text>
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,234,222,0.95)', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
              {result ? (
                <><Text variant="labelLg" color="#251911">{tierByKey(result.ratings.tier).emoji} Crowd says {tierByKey(result.communityTier).label}</Text><Text variant="labelSm" color="#5b4137">{result.ratings.count} votes</Text></>
              ) : (
                <><Text variant="labelSm" color="#251911">🔒 Rate to unveil consensus & Sparks</Text><Text variant="labelSm" color="#a63b00">BLIND VERDICT</Text></>
              )}
            </View>
          </View>
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <Label>Lock in your vibe</Label>
            <Text variant="labelSm" color={c.primary}>⚡ Match: +{Math.round(15 * comboMultiplier(combo + 1))} ✦</Text>
          </Row>
          <TierPad value={vote} onRate={rate} disabled={!!result} />
          {result ? (
            result.match ? (
              <Gradient colors={gradients.sunset} style={[{ borderRadius: 32, padding: 16 }, shadow.float]}>
                <ResultBody result={result} light />
              </Gradient>
            ) : (
              <View style={{ borderRadius: 32, padding: 16, backgroundColor: c.surfaceContainerHigh }}><ResultBody result={result} vote={vote} /></View>
            )
          ) : (
            <Button title="Skip" icon="skip-next" variant="ghost" onPress={next} />
          )}
          {result ? <Row gap={8}><Button title="Comment" icon="chat-bubble-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => router.push(`/p/${card.post.id}`)} /><Button title="Next" icon="skip-next" small style={{ flex: 1 }} onPress={next} /></Row> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function ResultBody({ result, light, vote }: { result: RouletteResult; light?: boolean; vote?: VibeScore | null }) {
  const c = useColors();
  const fg = light ? '#fff' : c.onSurface;
  const t = tierByKey(result.communityTier);
  return (
    <Row gap={12}>
      <Text style={{ fontSize: 34, lineHeight: 40 }}>{result.match ? '🎯' : vote ? TIERS[vote - 1].emoji : '🤔'}</Text>
      <View style={{ flex: 1 }}>
        <Text variant="headlineMd" color={fg}>{result.match ? `Match! ${result.comboCount}x combo` : 'Bold take!'}</Text>
        <Text variant="bodySm" color={fg}>Community verdict: {result.consensusPct}% {t.label} {t.emoji}</Text>
      </View>
      <View style={{ backgroundColor: light ? '#fff' : c.primaryFixed, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Text variant="labelLg" color={light ? c.flame : c.onPrimaryFixed}>+{result.sparksEarned} ✦</Text>
      </View>
    </Row>
  );
}
