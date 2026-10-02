import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import type { HomeData, Post, RatingSummary, Shout, VibeScore } from '@chatlol/shared';
import { TIERS, compact, tierByKey, toTen, timeAgo } from '@chatlol/shared';
import { api } from '../../lib/api';
import { errorToast, reward, toast } from '../../lib/actions';
import { getSocket } from '../../lib/socket';
import { useSession } from '../../lib/store';
import { gradients, shadow, useColors } from '../../lib/theme';
import { VerifyBanner } from '../../components/VerifyBanner';
import { SectionHead } from '../../components/SectionHead';
import { ShoutCard } from '../../components/ShoutCard';
import { ShoutComposer } from '../../components/ShoutComposer';
import { TierPad } from '../../components/TierPad';
import { Avatar, UserName } from '../../components/people';
import { Button, Card, Countdown, Gradient, Row, Tap, Text } from '../../components/ui';

/** Home: a slice of every part of ChatLOL, each with an arrow to its full screen. */
export default function Home() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [h, setH] = useState<HomeData | null>(null);
  const [shouts, setShouts] = useState<Shout[]>([]);
  const [rateCard, setRateCard] = useState<Post | null>(null);
  const [rated, setRated] = useState<RatingSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.home();
      setH(d); setShouts(d.shouts); setRateCard(d.rate); setRated(null);
    } catch (e) { errorToast(e); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const s = getSocket();
    const onNew = (sh: Shout) => setShouts((x) => [sh, ...x.filter((y) => y.id !== sh.id)].slice(0, 5));
    s.on('shout:new', onNew);
    return () => { s.off('shout:new', onNew); };
  }, []);

  async function rate(score: VibeScore) {
    if (!rateCard) return;
    if (!user) return toast({ kind: 'info', title: 'Sign in to rate' });
    try { const r = await api.rate(rateCard.id, score); setRated(r.post.ratings); reward(r.reward); } catch (e) { errorToast(e); }
  }
  async function nextRate() { setRated(null); setRateCard((await api.rouletteNext().catch(() => null))?.post ?? null); }

  if (!h) return <View style={{ flex: 1 }} />;
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 130, maxWidth: 680, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.flame} colors={[c.flame]} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <VerifyBanner />
      <Gradient colors={gradients.sunset} style={[{ borderRadius: 30, padding: 18, gap: 10 }, shadow.float]}>
        <Text variant="labelSm" color="#fff">{compact(h.stats.members)} MEMBERS • ● {compact(h.stats.online)} ONLINE NOW</Text>
        <Text variant="headlineLg" color="#fff">{greet}{user ? `, ${user.displayName.split(' ')[0]}` : ''} 🌅</Text>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Button small variant="white" title="Shout" icon="campaign" onPress={() => router.push('/shouts')} />
          <Button small variant="white" title="Today’s Drop" icon="wb-twilight" onPress={() => router.push('/drops')} />
          <Button small variant="white" title="Arena" icon="sports-kabaddi" onPress={() => router.push('/arena')} />
        </Row>
      </Gradient>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Popular Members" icon="local-fire-department" to="/members" hint="Best-rated this week" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          {h.popularMembers.map((u) => (
            <Tap key={u.id} onPress={() => router.push(`/u/${u.handle}`)} style={{ width: 76, alignItems: 'center', gap: 4 }}>
              <Avatar user={u} size={68} />
              <Text variant="labelSm" numberOfLines={1}>{u.displayName}</Text>
              <Text variant="labelSm" color={c.flame}>{tierByKey(u.vibeTier).emoji} {toTen(u.vibeAvg)}</Text>
            </Tap>
          ))}
        </ScrollView>
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Rate & Meet" icon="star" to="/roulette" hint="Pick a vibe tier" />
        {rateCard ? (
          <View style={{ gap: 10 }}>
            <Row gap={8}><Avatar user={rateCard.author} size={30} /><UserName user={rateCard.author} /></Row>
            <Image source={rateCard.mediaUrl} style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: 22 }} contentFit="cover" />
            {rated ? (
              <View style={{ gap: 6 }}>
                {[...TIERS].reverse().map((t) => {
                  const pct = rated.count ? Math.round((rated.dist[t.score - 1] / rated.count) * 100) : 0;
                  return (
                    <View key={t.key}>
                      <Row style={{ justifyContent: 'space-between' }}><Text variant="labelMd">{t.emoji} {t.label}</Text><Text variant="labelMd" color={c.primary}>{pct}%</Text></Row>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceContainer }}><View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: c.flame }} /></View>
                    </View>
                  );
                })}
                <Button title="Next photo" icon="arrow-forward" onPress={nextRate} />
              </View>
            ) : <TierPad value={null} onRate={rate} compact />}
          </View>
        ) : <Text color={c.onSurfaceVariant}>You’ve rated everything new 🙌</Text>}
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Shoutbox" icon="campaign" to="/shouts" hint="Live notice board for everyone" />
        <ShoutComposer compact onPosted={(sh) => setShouts((x) => [sh, ...x].slice(0, 5))} />
        {shouts.slice(0, 5).map((sh) => <ShoutCard key={sh.id} shout={sh} flat onUpdate={(x) => setShouts((y) => y.map((z) => (z.id === x.id ? x : z)))} />)}
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Forums" icon="groups" to="/forums" hint="Hot discussions" />
        {h.forums.map((t) => (
          <Tap key={t.id} onPress={() => router.push(`/forums/${t.id}`)} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8 }}>
            <Avatar user={t.author} size={34} />
            <View style={{ flex: 1 }}><Text variant="labelLg" numberOfLines={1}>{t.title}</Text><Text variant="bodySm" color={c.onSurfaceVariant}>▲ {t.upvotes} • 💬 {t.replyCount} • {timeAgo(t.lastActivityAt)}</Text></View>
          </Tap>
        ))}
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Popular Streams" icon="live-tv" to="/live" hint={h.streams.length ? `${h.streams.length} live now` : 'Nobody’s live — be the first'} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {h.streams.map((st) => (
            <Tap key={st.id} onPress={() => router.push(`/live/${st.id}`)} style={{ width: 140 }}>
              <Image source={st.coverUrl} style={{ width: 140, height: 186, borderRadius: 18 }} contentFit="cover" />
              <Text variant="labelMd" numberOfLines={1} style={{ marginTop: 4 }}>{st.title}</Text>
              <Text variant="bodySm" color={c.onSurfaceVariant}>🔴 {st.viewers} • {st.host.displayName}</Text>
            </Tap>
          ))}
        </ScrollView>
        {!h.streams.length ? <Button small variant="secondary" title="Go live" icon="videocam" onPress={() => router.push('/live')} /> : null}
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Hall of Fame" icon="emoji-events" to="/leaderboard" hint="All-time top vibes" />
        {h.hallOfFame.map((e) => (
          <Tap key={e.user.id} onPress={() => router.push(`/u/${e.user.handle}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            <Text variant="labelLg" style={{ width: 26, textAlign: 'center' }}>{e.rank === 1 ? '👑' : e.rank}</Text>
            <Avatar user={e.user} size={36} /><View style={{ flex: 1 }}><UserName user={e.user} link={false} /></View>
            <Text variant="labelLg" color={c.flame}>{e.score}/10</Text>
          </Tap>
        ))}
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Today’s Sunset Drop" icon="wb-twilight" to="/drops" />
        <Text variant="headlineSm">{h.drop.emoji} “{h.drop.prompt}”</Text>
        <Row gap={4}><Countdown to={h.drop.endsAt} color={c.onSurfaceVariant} variant="bodySm" /><Text variant="bodySm" color={c.onSurfaceVariant}>left</Text></Row>
        <Row gap={6} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {h.drop.entries.slice(0, 6).map((p) => <Tap key={p.id} onPress={() => router.push(`/p/${p.id}`)}><Image source={p.mediaUrl} style={{ width: 96, height: 96, borderRadius: 14 }} contentFit="cover" /></Tap>)}
        </Row>
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Hot Take Arena" icon="sports-kabaddi" to="/arena" hint="Stake Sparks on the crowd" />
        {h.arena.map((t) => (
          <Tap key={t.id} onPress={() => router.push('/arena')} style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 18, padding: 12, marginBottom: 8 }}>
            <Text variant="labelSm" color={c.flame}>{t.category}</Text><Text variant="labelLg">{t.statement}</Text>
            <Text variant="bodySm" color={c.onSurfaceVariant}>{t.agreeCount} agree • {t.disagreeCount} disagree</Text>
          </Tap>
        ))}
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Hangout Lounges" icon="forum" to="/lounges" hint="Drop in and chat" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {h.lounges.map((l) => (
            <Tap key={l.id} onPress={() => router.push(`/lounge/${l.id}`)} style={{ width: 150 }}>
              <Image source={l.coverUrl} style={{ width: 150, height: 90, borderRadius: 16 }} contentFit="cover" />
              <Text variant="labelMd" numberOfLines={1} style={{ marginTop: 4 }}>{l.emoji} {l.name}</Text>
              <Text variant="bodySm" color={c.onSurfaceVariant}>{l.onlineCount} here</Text>
            </Tap>
          ))}
        </ScrollView>
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionHead title="Say Hi to New Members" icon="waving-hand" to="/members" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {h.newMembers.map((u) => (
            <Tap key={u.id} onPress={() => router.push(`/u/${u.handle}`)} style={{ width: 66, alignItems: 'center', gap: 4 }}>
              <Avatar user={u} size={58} /><Text variant="labelSm" numberOfLines={1}>{u.displayName}</Text>
            </Tap>
          ))}
        </ScrollView>
      </Card>
      <Text variant="bodySm" color={c.onSurfaceVariant} style={{ textAlign: 'center' }}>ChatLOL 2026 - All rights reserved by LOLCorp PVT LTD.</Text>
    </ScrollView>
  );
}
