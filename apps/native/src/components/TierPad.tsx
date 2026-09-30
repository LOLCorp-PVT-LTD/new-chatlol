import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { VibeScore } from '@chatlol/shared';
import { TIERS } from '@chatlol/shared';
import { useColors, gradients, shadow } from '../lib/theme';
import { haptic } from '../lib/native';
import { Text } from './ui';

export function TierPad({ value, onRate, disabled, compact }: { value: VibeScore | null; onRate: (v: VibeScore) => void; disabled?: boolean; compact?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
      {TIERS.map((t) => {
        const active = value === t.score;
        const god = t.score === 5;
        const content = (
          <View style={{ alignItems: 'center', paddingVertical: compact ? 8 : 12 }}>
            <Text style={{ fontSize: compact ? 20 : 24, lineHeight: compact ? 26 : 30 }}>{t.emoji}</Text>
            <Text variant="labelSm" color={active || god ? '#fff' : c.onSurface} style={{ fontSize: 10 }} numberOfLines={1}>{t.label}</Text>
          </View>
        );
        return (
          <Pressable key={t.key} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={t.label} disabled={disabled}
            onPress={() => { god ? haptic.heavy() : haptic.light(); onRate(t.score); }}
            style={({ pressed }) => [{ flex: 1, borderRadius: 20, overflow: 'hidden', transform: [{ scale: pressed ? 0.9 : active ? 1.05 : 1 }] },
              active && shadow.pop, !god && { backgroundColor: active ? c.coral : c.surfaceContainerLow }]}>
            {god ? <LinearGradient colors={active ? gradients.sunset : ['#ffb86f', '#ff8a4c']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>{content}</LinearGradient> : content}
          </Pressable>
        );
      })}
    </View>
  );
}
