<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { ProfileSong } from '@chatlol/shared';
import { spotifyOpenUrl } from '@chatlol/shared';
import Icon from './Icon.vue';

/**
 * A member's profile song.
 *  - Spotify songs play in Spotify's embed (iFrame API).
 *  - Apple Music songs (used when the server has no Spotify keys) play their 30-second preview in our own player.
 * It starts automatically when the visitor allows it (Settings → "Autoplay profile songs"). Browsers only allow
 * sound after the visitor has interacted with the site: clicking through to a profile inside ChatLOL counts, opening
 * the link fresh in a new tab doesn't. When the browser blocks it, the song starts on the visitor's first click,
 * tap or key press anywhere on the page (and the player shows a play button meanwhile).
 */
const props = defineProps<{ song: ProfileSong; autoplay?: boolean }>();
const host = ref<HTMLElement>();
const audio = ref<HTMLAudioElement>();
const playing = ref(false);
const blocked = ref(false);
const progress = ref(0);
const isApple = () => props.song.source === 'apple';

/**
 * Blocked by the browser: try again on every click, tap or key press anywhere until the song is actually playing.
 * Browsers differ in which events unlock sound (Safari wants click/touchend, not pointerdown), so listen to all of them
 * and only stop once playback has started.
 */
const unlockEvents = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;
function onFirstInteraction() {
  if (!blocked.value || playing.value) return stopWaiting();
  playNow();
}
function waitForInteraction() {
  blocked.value = true;
  stopWaiting();
  unlockEvents.forEach((e) => document.addEventListener(e, onFirstInteraction, { capture: true }));
}
function stopWaiting() {
  unlockEvents.forEach((e) => document.removeEventListener(e, onFirstInteraction, { capture: true }));
}
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

async function mountSpotify() {
  const api = await loadApi();
  if (!host.value) return;
  const el = document.createElement('div');
  host.value.replaceChildren(el);
  api.createController(el, { uri: `spotify:${props.song.type}:${props.song.id}`, height: 80, width: '100%' }, (c) => {
    controller = c;
    c.addListener('playback_update', (e) => {
      playing.value = !e.data.isPaused;
      if (playing.value) { blocked.value = false; stopWaiting(); }
    });
    // Let Spotify's player autoplay: a click on our page only unlocks sound inside an embedded frame from another
    // site if the frame is allowed to autoplay. Set it if the player came without it (and reload the frame once).
    const frame = host.value?.querySelector('iframe');
    if (frame && !/\bautoplay\b/.test(frame.getAttribute('allow') ?? '')) {
      frame.setAttribute('allow', `autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture`);
      frame.src = frame.src;
    }
    c.addListener('ready', () => {
      if (!props.autoplay) return;
      c.play();
      // If nothing is playing shortly after, the browser blocked autoplay: offer a button.
      setTimeout(() => !playing.value && waitForInteraction(), 2500);
    });
  });
}
async function mountApple() {
  if (!props.autoplay || !audio.value) return;
  try { await audio.value.play(); } catch { waitForInteraction(); }
}
function mount() {
  stopWaiting();
  blocked.value = false;
  playing.value = false;
  controller?.destroy();
  controller = null;
  if (isApple()) void mountApple();
  else void mountSpotify();
}
onMounted(mount);
watch(() => props.song.id, mount);
onUnmounted(() => { stopWaiting(); controller?.destroy(); audio.value?.pause(); });
/** Try to play; if the browser still says no, keep waiting for the next interaction. */
function playNow() {
  if (isApple()) {
    void audio.value?.play().then(() => { blocked.value = false; stopWaiting(); }).catch(() => waitForInteraction());
  } else controller?.play();
}
function play() {
  blocked.value = false;
  playNow();
}
function toggle() {
  if (!audio.value) return;
  if (audio.value.paused) play();
  else audio.value.pause();
}
function seek(e: MouseEvent) {
  const a = audio.value;
  if (!a?.duration) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
}
</script>

<template>
  <div class="rounded-md overflow-hidden relative bg-black/20">
    <template v-if="song.source === 'apple'">
      <div class="flex items-center gap-3 p-2.5 bg-[#1c1c1e] text-white">
        <img v-if="song.artUrl" :src="song.artUrl" alt="" class="w-14 h-14 rounded object-cover shrink-0" />
        <div v-else class="w-14 h-14 rounded bg-white/10 flex items-center justify-center shrink-0"><Icon name="music_note" /></div>
        <div class="min-w-0 flex-1">
          <p class="text-label-lg truncate">{{ song.title || 'Profile song' }}</p>
          <p class="text-body-sm opacity-70 truncate">{{ song.artist }}</p>
          <div class="mt-2 h-1.5 rounded-full bg-white/20 cursor-pointer" @click="seek"><div class="h-full rounded-full bg-[#fa2d48]" :style="{ width: `${progress * 100}%` }" /></div>
        </div>
        <button class="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0" :aria-label="playing ? 'Pause' : 'Play'" @click="toggle"><Icon :name="playing ? 'pause' : 'play_arrow'" fill /></button>
      </div>
      <p class="px-3 py-1 text-[11px] bg-[#1c1c1e] text-white/60 flex justify-between"><span>Preview</span><a v-if="song.linkUrl" :href="song.linkUrl" target="_blank" rel="noopener" class="hover:text-white">Listen on Apple Music ↗</a></p>
      <audio ref="audio" :src="song.previewUrl ?? undefined" preload="none" loop @play="playing = true" @pause="playing = false" @timeupdate="progress = audio?.duration ? audio.currentTime / audio.duration : 0" />
    </template>
    <div v-else ref="host" class="min-h-[80px]" />
    <button v-if="blocked" class="absolute inset-0 bg-black/55 text-white flex items-center justify-center gap-2 text-label-lg backdrop-blur-sm" @click="play">
      <Icon name="play_circle" fill /> Play {{ song.title || 'their song' }}
    </button>
    <a v-if="song.source !== 'apple'" :href="spotifyOpenUrl(song)" target="_blank" rel="noopener" class="sr-only">Open in Spotify</a>
  </div>
</template>
