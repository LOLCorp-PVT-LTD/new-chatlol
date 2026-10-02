import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../lib/store';
import { gradients, shadow, useColors, useIsDark } from '../lib/theme';
import { Gradient, Row, Text } from './ui';

export function Toasts() {
  const toasts = useSession((s) => s.toasts);
  const insets = useSafeAreaInsets();
  const c = useColors();
  const dark = useIsDark();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 8, zIndex: 999, alignItems: 'center' }}>
      {toasts.map((t) => {
        // Dark theme: info and reward toasts are white cards with dark text, so they stand out.
        const light = dark && t.kind !== 'error';
        const fg = light ? '#251911' : '#fff';
        const body = (
          <Row gap={10} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 18 }}>{t.kind === 'reward' ? '⚡' : t.kind === 'error' ? '⚠️' : '🔔'}</Text>
            <View style={{ flex: 1 }}>
              <Text variant="labelLg" color={fg} numberOfLines={1}>{t.title}</Text>
              {t.body ? <Text variant="bodySm" color={light ? '#5b4137' : 'rgba(255,255,255,0.9)'} numberOfLines={1}>{t.body}</Text> : null}
            </View>
            {t.sparks || t.xp ? <View style={{ alignItems: 'flex-end' }}>{t.sparks ? <Text variant="labelLg" color={light ? c.flame : '#fff'}>+{t.sparks} ✦</Text> : null}{t.xp ? <Text variant="labelSm" color={fg}>+{t.xp} XP</Text> : null}</View> : null}
          </Row>
        );
        return (
          <View key={t.id} style={[{ width: '100%', maxWidth: 420, borderRadius: 999, overflow: 'hidden' }, shadow.float]}>
            {light ? <View style={{ backgroundColor: '#ffffff' }}>{body}</View> : t.kind === 'reward' ? <Gradient colors={gradients.sunset}>{body}</Gradient> : <View style={{ backgroundColor: t.kind === 'error' ? c.error : c.inverseSurface }}>{body}</View>}
          </View>
        );
      })}
    </View>
  );
}
