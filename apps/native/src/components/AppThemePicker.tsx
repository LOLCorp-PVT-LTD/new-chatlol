import React from 'react';
import { View } from 'react-native';
import type { AppThemeSetting } from '@chatlol/shared';
import { APP_THEMES, themeSwatch } from '@chatlol/shared';
import { useColors } from '../lib/theme';
import { haptic } from '../lib/native';
import { Gradient, Icon, Tap, Text } from './ui';

/** "Your colour" choices: phones have no built-in colour picker, so a spread of hues (softened like the presets). */
const CUSTOM = ['#e8505b', '#f0884f', '#d9b440', '#7cc46d', '#38b2a3', '#3fa7e0', '#5470e8', '#8f63e8', '#c95ed6', '#e86aa0', '#8c8c8c', '#6b5a4e'];

/** App colours: preset gradients close to Sunset, or your own colour. Saved to your account, so every device matches. */
export function AppThemePicker({ value, onChange }: { value: AppThemeSetting; onChange: (t: AppThemeSetting) => void }) {
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
                  {on ? <Icon name="check" size={20} color="#fff" /> : null}
                </Gradient>
              </View>
              <Text variant="labelSm">{t.label}</Text>
            </Tap>
          );
        })}
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="labelMd" color={c.onSurfaceVariant}>Your colour</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CUSTOM.map((hex) => {
            const on = value.preset === 'custom' && value.custom?.toLowerCase() === hex;
            return (
              <Tap key={hex} onPress={() => pick({ preset: 'custom', custom: hex })} accessibilityLabel={`Custom colour ${hex}`} accessibilityState={{ selected: on }} style={{ borderRadius: 20, padding: 2, borderWidth: 2, borderColor: on ? c.onSurface : 'transparent' }}>
                <Gradient colors={themeSwatch({ preset: 'custom', custom: hex })} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={16} color="#fff" /> : null}
                </Gradient>
              </Tap>
            );
          })}
        </View>
      </View>
      <Text variant="bodySm" color={c.onSurfaceVariant}>Your colours apply everywhere in ChatLOL, on every device you sign in on. Profile pages keep the look their owner picked.</Text>
    </View>
  );
}
