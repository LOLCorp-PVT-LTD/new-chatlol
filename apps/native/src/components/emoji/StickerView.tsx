import React, { useState } from 'react';
import { Image } from 'expo-image';
import type { Sticker } from '@chatlol/shared';

/** An animated sticker (animated WebP / GIF). Falls back to the still image if the animation can't load. */
export function StickerView({ sticker, size = 128 }: { sticker: Sticker; size?: number }) {
  const [src, setSrc] = useState(sticker.url);
  const h = sticker.kind === 'giphy' && sticker.w && sticker.h ? Math.round((size * sticker.h) / sticker.w) : size;
  return (
    <Image
      source={src}
      style={{ width: size, height: h }}
      contentFit="contain"
      autoplay
      accessibilityLabel={sticker.label || 'Sticker'}
      onError={() => sticker.still && src !== sticker.still && setSrc(sticker.still)}
    />
  );
}
