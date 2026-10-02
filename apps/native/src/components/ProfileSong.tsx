import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ProfileSong as Song } from '@chatlol/shared';


/**
 * A member's profile song in Spotify's embedded player. With `autoplay` the page starts it as soon as it loads
 * (allowed in-app because media playback doesn't wait for a tap). Spotify plays a preview unless the
 * viewer is signed in to Spotify.
 */
export function ProfileSong({ song, autoplay }: { song: Song; autoplay?: boolean }) {
  const uri = `spotify:${song.type}:${song.id}`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:transparent}</style></head>
<body><div id="p"></div><script src="https://open.spotify.com/embed/iframe-api/v1" async></script>
<script>window.onSpotifyIframeApiReady=function(api){api.createController(document.getElementById('p'),{uri:${JSON.stringify(uri)},height:80,width:'100%'},function(c){${autoplay ? "c.addListener('ready',function(){c.play()});" : ''}});};</script></body></html>`;
  return (
    <View style={{ height: 80, borderRadius: 14, overflow: 'hidden' }}>
      <WebView
        source={{ html, baseUrl: 'https://open.spotify.com' }}
        originWhitelist={['*']}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        scrollEnabled={false}
        style={{ backgroundColor: 'transparent' }}
        // Fallback when the iFrame API can't load: the plain embed still works.
        onError={() => undefined}
        accessibilityLabel={`Profile song${song.title ? `: ${song.title}` : ''}`}
      />
    </View>
  );
}
