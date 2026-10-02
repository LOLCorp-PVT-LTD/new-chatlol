import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { Insights as Data } from '@chatlol/shared';
import { tierByScore, timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast } from '../lib/actions';
import { gradients, shadow, useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Someone } from '../components/Someone';
import { Card, Chip, Empty, Gradient, Row, Tap, Text } from '../components/ui';

/** Who viewed, rated and mentioned you — names are a Premium perk. */
export default function Insights() {
  const c = useColors();
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<'views' | 'raters' | 'mentions'>('views');
  useEffect(() => { void api.insights().then(setD).catch(errorToast); }, []);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Who viewed me" />
      {d ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
          {!d.premium ? (
            <Tap onPress={() => router.push('/premium')}>
              <Gradient colors={gradients.sunset} style={[{ borderRadius: 28, padding: 18, gap: 4 }, shadow.float]}>
                <Text variant="headlineMd" color="#fff">👑 {d.viewCount} {d.viewCount === 1 ? 'person' : 'people'} viewed you this month</Text>
                <Text variant="bodyMd" color="rgba(255,255,255,0.92)">Go Premium to see exactly who viewed, rated and mentioned you.</Text>
              </Gradient>
            </Tap>
          ) : null}
          <Row gap={8}>
            {[[d.viewCount, 'VIEWS (30D)'], [d.ratings.count, 'RATINGS'], [d.mentions.length, 'MENTIONS']].map(([v, l]) => (
              <Card key={String(l)} style={{ flex: 1, padding: 12, alignItems: 'center' }}><Text variant="headlineLg">{v}</Text><Text variant="labelSm" color={c.onSurfaceVariant}>{l}</Text></Card>
            ))}
          </Row>
          <Row gap={8}>
            <Chip label="👀 Viewed" active={tab === 'views'} onPress={() => setTab('views')} />
            <Chip label="⭐ Rated" active={tab === 'raters'} onPress={() => setTab('raters')} />
            <Chip label="📣 Mentioned" active={tab === 'mentions'} onPress={() => setTab('mentions')} />
          </Row>
          <Card style={{ paddingVertical: 4 }}>
            {tab === 'views' ? (d.views.length ? d.views.map((v, i) => <Row key={i} gap={8} style={{ paddingHorizontal: 14, paddingVertical: 10 }}><Someone user={v.user} teaser={v.teaserAvatar} /><Text variant="bodySm" color={c.onSurfaceVariant}>{timeAgo(v.at)}</Text></Row>) : <Empty emoji="👀" title="No views yet" />)
              : tab === 'raters' ? (d.raters.length ? d.raters.map((r, i) => <Row key={i} gap={8} style={{ paddingHorizontal: 14, paddingVertical: 10 }}><Someone user={r.user} teaser={r.teaserAvatar} /><Text variant="labelLg">{tierByScore(r.score).emoji} {tierByScore(r.score).label}</Text></Row>) : <Empty emoji="⭐" title="No profile ratings yet" />)
              : (d.mentions.length ? d.mentions.map((m, i) => <Row key={i} gap={8} style={{ paddingHorizontal: 14, paddingVertical: 10 }}><Someone user={m.user} teaser={m.teaserAvatar} /><Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={2} style={{ maxWidth: '45%' }}>{m.body ?? 'mentioned you'} • {timeAgo(m.at)}</Text></Row>) : <Empty emoji="📣" title="No mentions yet" />)}
          </Card>
        </ScrollView>
      ) : null}
    </View>
  );
}
