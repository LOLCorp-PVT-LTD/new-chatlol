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
  if (song.source === 'apple') return <ApplePreview song={song} autoplay={autoplay} />;
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

const esc = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Apple Music 30-second preview (used when the server has no Spotify keys), in a small player page. */
function ApplePreview({ song, autoplay }: { song: Song; autoplay?: boolean }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;background:#1c1c1e;color:#fff;font-family:-apple-system,system-ui,sans-serif}
.w{display:flex;align-items:center;gap:10px;padding:10px}img{width:56px;height:56px;border-radius:6px;object-fit:cover}
.t{flex:1;min-width:0}.n{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.a{opacity:.7;font-size:12px}
.bar{height:5px;border-radius:3px;background:rgba(255,255,255,.2);margin-top:8px}.f{height:100%;width:0;border-radius:3px;background:#fa2d48}
button{width:42px;height:42px;border-radius:21px;border:0;background:#fff;font-size:18px}</style></head><body>
<div class="w">${song.artUrl ? `<img src="${esc(song.artUrl)}">` : ''}<div class="t"><div class="n">${esc(song.title || 'Profile song')}</div><div class="a">${esc(song.artist)} · Preview</div><div class="bar"><div class="f" id="f"></div></div></div><button id="b">▶</button></div>
<audio id="au" src="${esc(song.previewUrl ?? '')}" loop ${autoplay ? 'autoplay' : ''}></audio>
<script>var a=document.getElementById('au'),b=document.getElementById('b'),f=document.getElementById('f');
b.onclick=function(){a.paused?a.play():a.pause()};a.onplay=function(){b.textContent='❚❚'};a.onpause=function(){b.textContent='▶'};
a.ontimeupdate=function(){f.style.width=(a.duration?a.currentTime/a.duration*100:0)+'%'};</script></body></html>`;
  return (
    <View style={{ height: 76, borderRadius: 14, overflow: 'hidden' }}>
      <WebView source={{ html }} originWhitelist={['*']} mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback scrollEnabled={false} style={{ backgroundColor: '#1c1c1e' }} accessibilityLabel={`Profile song${song.title ? `: ${song.title}` : ''}`} />
    </View>
  );
}
