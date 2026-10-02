import React from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useColors } from '../lib/theme';
import { Icon, Row, Tap, Text, type IconName } from './ui';

/** Section title with an arrow button that opens the section's full page. */
export function SectionHead({ title, icon, to, hint }: { title: string; icon: IconName; to?: string; hint?: string }) {
  const c = useColors();
  return (
    <Row gap={10} style={{ marginBottom: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.sunlit, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} color={c.flame} /></View>
      <View style={{ flex: 1 }}>
        <Text variant="headlineSm" numberOfLines={1}>{title}</Text>
        {hint ? <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={1}>{hint}</Text> : null}
      </View>
      {to ? (
        <Tap onPress={() => router.push(to as Href)} accessibilityRole="link" accessibilityLabel={`Open ${title}`}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrow-forward" color={c.onSurface} />
        </Tap>
      ) : null}
    </Row>
  );
}
