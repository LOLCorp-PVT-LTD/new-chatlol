<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { ProfileSong } from '@chatlol/shared';
import { spotifyOpenUrl } from '@chatlol/shared';
import Icon from './Icon.vue';

/**
 * A member's profile song, played with Spotify's embed (iFrame API).
 * It starts automatically when the visitor allows it (Settings → "Autoplay profile songs"). Browsers only allow
 * sound after the visitor has interacted with the site — arriving by clicking a link counts — so if a browser
 * still blocks it, the player shows a play button instead.
 */
const props = defineProps<{ song: ProfileSong; autoplay?: boolean }>();
const host = ref<HTMLElement>();
const playing = ref(false);
const blocked = ref(false);
let controller: { play: () => void; pause: () => void; destroy: () => void; loadUri: (u: string) => void; addListener: (e: string, fn: (ev: { data: { isPaused: boolean } }) => void) => void } | null = null;

type IFrameAPI = { createController: (el: HTMLElement, o: object, cb: (c: NonNullable<typeof controller>) => void) => void };
const w = window as unknown as { onSpotifyIframeApiReady?: (api: IFrameAPI) => void; __spotifyApi?: Promise<IFrameAPI> };

function loadApi(): Promise<IFrameAPI> {
  w.__spotifyApi ??= new Promise((resolve) => {
    w.onSpotifyIframeApiReady = resolve;
    const sc = document.createElement('script');
    sc.src = 'https://open.spotify.com/embed/iframe-api/v1';
    sc.async = true;
    document.head.appendChild(sc);
  });
  return w.__spotifyApi;
}

async function mount() {
  const api = await loadApi();
  if (!host.value) return;
  const el = document.createElement('div');
  host.value.replaceChildren(el);
  api.createController(el, { uri: `spotify:${props.song.type}:${props.song.id}`, height: 80, width: '100%' }, (c) => {
    controller = c;
    c.addListener('playback_update', (e) => (playing.value = !e.data.isPaused));
    c.addListener('ready', () => {
      if (!props.autoplay) return;
      c.play();
      // If nothing is playing shortly after, the browser blocked autoplay: offer a button.
      setTimeout(() => (blocked.value = !playing.value), 2500);
    });
  });
}
onMounted(mount);
watch(() => props.song.id, mount);
onUnmounted(() => controller?.destroy());
function play() { controller?.play(); blocked.value = false; }
</script>

<template>
  <div class="rounded-md overflow-hidden relative bg-black/20">
    <div ref="host" class="min-h-[80px]" />
    <button v-if="blocked" class="absolute inset-0 bg-black/55 text-white flex items-center justify-center gap-2 text-label-lg backdrop-blur-sm" @click="play">
      <Icon name="play_circle" fill /> Play {{ song.title || 'their song' }}
    </button>
    <a :href="spotifyOpenUrl(song)" target="_blank" rel="noopener" class="sr-only">Open in Spotify</a>
  </div>
</template>
