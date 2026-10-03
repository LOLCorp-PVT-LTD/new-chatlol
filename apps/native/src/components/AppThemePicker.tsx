import React from 'react';
import { View } from 'react-native';
import type { AppThemeSetting } from '@chatlol/shared';
import { APP_THEMES, themeSwatch } from '@chatlol/shared';
import { useColors } from '../lib/theme';
import { haptic } from '../lib/native';
import { Gradient, Icon, Tap, Text } from './ui';

/**
 * App colours: 30 fixed themes. Sunset, Ocean and Berry are free; the rest need Premium or a Gold unlock (locked ones
 * show a 🔒). Saved to your account, so every device matches.
 */
export function AppThemePicker({ value, onChange, isAllowed = () => true }: { value: AppThemeSetting; onChange: (t: AppThemeSetting) => void; isAllowed?: (key: string) => boolean }) {
  const c = useColors();
  const pick = (t: AppThemeSetting) => { haptic.tap(); onChange(t); };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {APP_THEMES.map((t) => {
          const on = value.preset === t.key;
          return (
            <Tap key={t.key} onPress={() => pick({ preset: t.key, custom: null })} accessibilityLabel={`${t.label} colours`} accessibilityState={{ selected: on }} style={{ width: 74, alignItems: 'center', gap: 4 }}>
              <View style={{ borderRadius: 16, padding: 2, borderWidth: 2, borderColor: on ? c.flame : 'transparent' }}>
                <Gradient colors={themeSwatch({ preset: t.key, custom: null })} style={{ width: 62, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={20} color="#fff" /> : !isAllowed(t.key) ? <Text variant="labelSm" color="#fff">🔒</Text> : null}
                </Gradient>
              </View>
              <Text variant="labelSm">{t.label}</Text>
            </Tap>
          );
        })}
      </View>
      <Text variant="bodySm" color={c.onSurfaceVariant}>Sunset, Ocean and Berry are free. The rest come with Premium, or unlock one for good for 1 Gold. Your colours apply on every device.</Text>
    </View>
  );
}
