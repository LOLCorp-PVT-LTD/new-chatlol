import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

/** A YouTube video (privacy-enhanced embed). */
export function YouTube({ id }: { id: string }) {
  return (
    <View style={{ aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      <WebView source={{ uri: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1` }} allowsInlineMediaPlayback allowsFullscreenVideo style={{ backgroundColor: '#000' }} />
    </View>
  );
}
