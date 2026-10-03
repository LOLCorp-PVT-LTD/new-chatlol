<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import type { MusicTrack } from '@chatlol/shared';
import { claimAudio, fmtTime, loadYouTube, releaseAudio, ytVars, type YTPlayer } from '../lib/yt';
import Icon from './Icon.vue';

/**
 * A song attached to a post or shout. Shows the cover until played; then a small (visible) YouTube player plays
 * the full song with our controls. `autoplay`: start on its own (the single-post page) when the browser allows.
 */
const props = defineProps<{ track: MusicTrack; autoplay?: boolean; compact?: boolean }>();
const host = ref<HTMLElement>();
const started = ref(false);
const playing = ref(false);
const pos = ref(0);
const dur = ref(props.track.duration ?? 0);
const me = Symbol('music');
let yt: YTPlayer | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const pct = computed(() => (dur.value ? Math.min(100, (pos.value / dur.value) * 100) : 0));

async function start() {
  started.value = true;
  if (yt) return yt.playVideo();
  const YT = await loadYouTube();
  if (!host.value) return;
  const el = document.createElement('div');
  host.value.replaceChildren(el);
  yt = new YT.Player(el, {
    videoId: props.track.youtubeId ?? props.track.id,
    host: 'https://www.youtube-nocookie.com',
    width: '100%',
    height: '100%',
    playerVars: ytVars({ autoplay: 1 }),
    events: {
      onReady: () => yt?.playVideo(),
      onStateChange: (e: { data: number }) => {
        playing.value = e.data === YT.PlayerState.PLAYING;
        if (playing.value) claimAudio(me, () => yt?.pauseVideo());
      },
    },
  });
  clearInterval(timer);
  timer = setInterval(() => {
    pos.value = yt?.getCurrentTime?.() ?? 0;
    dur.value = yt?.getDuration?.() || dur.value;
  }, 500);
}
function toggle() {
  if (!started.value || !yt) return void start();
  playing.value ? yt.pauseVideo() : yt.playVideo();
}
function seek(e: MouseEvent) {
  if (!yt || !dur.value) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  yt.seekTo(((e.clientX - r.left) / r.width) * dur.value, true);
}
if (props.autoplay) setTimeout(() => void start(), 300);
onUnmounted(() => { clearInterval(timer); releaseAudio(me); yt?.destroy(); });
</script>

<template>
  <div class="flex items-center gap-3 rounded-md p-2 bg-[#141414] text-white" :class="compact ? 'max-w-[360px]' : ''" @click.stop>
    <div class="relative shrink-0 rounded overflow-hidden bg-black" :class="compact ? 'w-[88px] h-[50px]' : 'w-[112px] h-[63px]'">
      <img v-if="!started" :src="track.artUrl ?? ''" alt="" class="absolute inset-0 w-full h-full object-cover" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
      <div ref="host" class="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-label-md truncate">🎵 {{ track.title }}</p>
      <p class="text-[11px] opacity-70 truncate">{{ track.artist }}</p>
      <div class="mt-1.5 flex items-center gap-2">
        <div class="flex-1 h-1 rounded-full bg-white/20 cursor-pointer" @click="seek"><div class="h-full rounded-full bg-[#ff0033]" :style="{ width: `${pct}%` }" /></div>
        <span v-if="dur" class="text-[10px] tabular-nums opacity-60">{{ fmtTime(pos) }} / {{ fmtTime(dur) }}</span>
      </div>
    </div>
    <button type="button" class="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shrink-0" :aria-label="playing ? 'Pause' : 'Play'" @click="toggle"><Icon :name="playing ? 'pause' : 'play_arrow'" fill :size="20" /></button>
  </div>
</template>
