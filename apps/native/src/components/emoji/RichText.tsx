import React from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import { isJumbo, parseRich } from '@chatlol/shared';
import { Text } from '../ui';
import { useColors } from '../../lib/theme';
import { CustomEmoji } from './CustomEmoji';

/**
 * User text with ChatLOL custom emoji (:code:) drawn inline, @mentions that open the profile and, optionally,
 * #tags highlighted. Text that's only 1–3 custom emoji is shown big.
 */
export function RichText({ text, color, linkColor: linkColorProp, variant = 'bodyMd', style, tags, numberOfLines }: { text: string | null | undefined; color?: string; linkColor?: string; variant?: React.ComponentProps<typeof Text>['variant']; style?: StyleProp<TextStyle>; tags?: boolean; numberOfLines?: number }) {
  const c = useColors();
  const linkColor = linkColorProp ?? c.flame;
  const parts = parseRich(text);
  if (!parts.length) return null;
  if (isJumbo(parts))
    return (
      <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 2 }}>
        {parts.filter((p) => p.t === 'emoji').map((p, i) => <CustomEmoji key={i} code={(p as { code: string }).code} size={52} />)}
      </View>
    );
  return (
    <Text variant={variant} color={color} style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) => {
        if (p.t === 'emoji')
          return (
            <View key={i} style={{ paddingHorizontal: 1, transform: [{ translateY: 4 }] }}>
              <CustomEmoji code={p.code} size={20} />
            </View>
          );
        if (p.t === 'mention')
          return <Text key={i} variant={variant} color={linkColor} style={{ fontWeight: '800' }} onPress={() => router.push(`/u/${p.handle}`)}>@{p.handle}</Text>;
        if (!tags) return p.v;
        return p.v.split(/(#[\p{L}\p{N}_]+)/u).map((seg, j) =>
          seg.startsWith('#') ? <Text key={`${i}-${j}`} variant={variant} color={linkColor} style={{ fontWeight: '800' }}>{seg}</Text> : seg,
        );
      })}
    </Text>
  );
}
