import React, { memo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { CustomEmoji as Emoji } from '@chatlol/shared';
import { customEmoji, customEmojiSvg } from '@chatlol/shared';

/** A ChatLOL custom emoji tile (drawn from SVG, so it's sharp at any size). */
export const CustomEmoji = memo(function CustomEmoji({ code, emoji, size = 20 }: { code?: string; emoji?: Emoji; size?: number }) {
  const e = emoji ?? (code ? customEmoji(code) : null);
  if (!e) return null;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`:${e.code}:`}>
      <SvgXml xml={customEmojiSvg(e)} width={size} height={size} />
    </View>
  );
});
