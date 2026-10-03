<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { MusicTrack, RadioState } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { claimAudio, fmtTime, loadYouTube, releaseAudio, ytVars, type YTPlayer } from '../lib/yt';
import Icon from './Icon.vue';
import MusicPicker from './MusicPicker.vue';

/**
 * Live radio for a lounge or the shoutbox. Everyone hears the same song at the same moment: the player seeks to
 * "server now − startedAt" and re-syncs if it drifts. Listeners suggest songs and vote for what's next; when the
 * song ends the most-voted one plays (the server decides). Browsers only allow sound after a tap, so each
 * listener presses "Tune in" once (remembered).
 */
const props = defineProps<{ station: string; title?: string }>();
const s = useSession();
const st = ref<RadioState | null>(null);
const offset = ref(0); // server clock − our clock (ms)
const tuned = ref(false);
const playing = ref(false);
const open = ref(true);
const picking = ref(false);
const nowMs = ref(Date.now());
const host = ref<HTMLElement>();
const me = Symbol('radio');
let yt: YTPlayer | null = null;
let ytReady = false;
let loadedId: string | null = null;
let tick: ReturnType<typeof setInterval> | undefined;

const KEY = 'chatlol:radio-tuned';
const remembered = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const remember = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ } };

function apply(next: RadioState) {
  offset.value = Date.parse(next.serverTime) - Date.now();
  const wasHost = st.value?.host;
  st.value = { ...next, host: next.host ?? wasHost };
}
/** Seconds into the current song, by the server's clock. */
const elapsed = computed(() => (st.value?.now ? Math.max(0, (nowMs.value + offset.value - Date.parse(st.value.now.startedAt)) / 1000) : 0));
const length = computed(() => st.value?.now?.track.duration || 0);

async function ensurePlayer() {
  if (yt) return;
  const YT = await loadYouTube();
  if (!host.value) return;
  const el = document.createElement('div');
  host.value.replaceChildren(el);
  await new Promise<void>((resolve) => {
    yt = new YT.Player(el, {
      host: 'https://www.youtube-nocookie.com',
      width: '100%',
      height: '100%',
      playerVars: ytVars({ autoplay: 1 }),
      events: {
        onReady: () => { ytReady = true; resolve(); },
        onStateChange: (e: { data: number }) => {
          playing.value = e.data === YT.PlayerState.PLAYING;
          if (playing.value) claimAudio(me, () => tuneOut());
          if (e.data === YT.PlayerState.ENDED && st.value?.now) void api.radioEnded(props.station, st.value.now.track.id).catch(() => {});
        },
      },
    });
  });
}
/** Load the song everyone's on, at the right spot. */
async function sync(force = false) {
  if (!tuned.value) return;
  const n = st.value?.now;
  await ensurePlayer();
  if (!yt || !ytReady) return;
  if (!n) { yt.stopVideo(); loadedId = null; return; }
  const id = n.track.youtubeId ?? n.track.id;
  if (loadedId !== id || force) {
    loadedId = id;
    yt.loadVideoById({ videoId: id, startSeconds: elapsed.value });
    return;
  }
  const drift = Math.abs((yt.getCurrentTime?.() ?? 0) - elapsed.value);
  if (drift > 3) yt.seekTo(elapsed.value, true);
}
async function tuneIn() {
  tuned.value = true;
  remember(true);
  await sync(true);
  yt?.unMute();
  yt?.playVideo();
  // Blocked by the browser (no tap on the page yet): show the Tune in button again.
  setTimeout(() => { if (tuned.value && !playing.value && st.value?.now) tuned.value = false; }, 2500);
}
function tuneOut() {
  tuned.value = false;
  remember(false);
  yt?.pauseVideo();
  playing.value = false;
  releaseAudio(me);
}

const onState = (next: RadioState) => { if (next.station === props.station) apply(next); };
watch(() => st.value?.now?.track.id, () => void sync());

onMounted(async () => {
  try { apply(await api.radio(props.station)); } catch { st.value = null; return; }
  const sock = s.socket();
  sock.emit('radio:watch', props.station);
  sock.on('radio:state', onState);
  sock.on('connect', rewatch);
  tick = setInterval(() => {
    nowMs.value = Date.now();
    if (tuned.value && playing.value) void sync();
  }, 1000);
  // Came back to a radio you had on: try to resume (works when the browser already allowed sound on this site).
  if (remembered()) void tuneIn();
});
const rewatch = () => { s.socket().emit('radio:watch', props.station); void api.radio(props.station).then(apply).catch(() => {}); };
onUnmounted(() => {
  const sock = s.socket();
  sock.emit('radio:unwatch', props.station);
  sock.off('radio:state', onState);
  sock.off('connect', rewatch);
  clearInterval(tick);
  releaseAudio(me);
  yt?.destroy();
});

async function act(p: Promise<RadioState>, ok?: string) {
  try { apply(await p); if (ok) s.toast({ kind: 'info', title: ok }); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function suggest(t: MusicTrack) {
  picking.value = false;
  await act(api.radioSuggest(props.station, t.youtubeId ?? t.id), `🎵 ${t.title} added — get people to vote for it!`);
}
</script>

<template>
  <section v-if="st" class="rounded-md overflow-hidden bg-[#141414] text-white">
    <div class="flex items-center gap-3 p-2.5">
      <div class="relative w-[96px] h-[54px] rounded overflow-hidden shrink-0 bg-black">
        <img v-if="st.now && !tuned" :src="st.now.track.artUrl ?? ''" alt="" class="absolute inset-0 w-full h-full object-cover opacity-80" />
        <div ref="host" class="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" :class="tuned ? '' : 'invisible'" />
        <span v-if="!st.now" class="absolute inset-0 flex items-center justify-center text-2xl">📻</span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[10px] uppercase tracking-widest font-bold text-[#ff4d6d] flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#ff4d6d]" :class="{ 'animate-pulse': st.now }" />{{ title ?? 'Radio' }} · live</p>
        <template v-if="st.now">
          <p class="text-label-lg truncate">{{ st.now.track.title }}</p>
          <p class="text-[11px] opacity-70 truncate">{{ st.now.track.artist }}<template v-if="length"> · {{ fmtTime(Math.min(elapsed, length)) }} / {{ fmtTime(length) }}</template></p>
          <div v-if="length" class="mt-1 h-1 rounded-full bg-white/15"><div class="h-full rounded-full bg-[#ff0033]" :style="{ width: `${Math.min(100, (elapsed / length) * 100)}%` }" /></div>
        </template>
        <p v-else class="text-body-sm opacity-80">Nothing playing — suggest the first song!</p>
      </div>
      <button v-if="st.now && !tuned" class="btn h-10 px-4 bg-white text-black shrink-0" @click="tuneIn"><Icon name="play_arrow" fill :size="18" /> Tune in</button>
      <button v-else-if="st.now" class="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0" aria-label="Tune out" @click="tuneOut"><Icon name="volume_off" :size="18" /></button>
      <button class="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0" :aria-label="open ? 'Hide queue' : 'Show queue'" @click="open = !open"><Icon :name="open ? 'expand_less' : 'expand_more'" :size="20" /></button>
    </div>
    <div v-if="open" class="px-2.5 pb-2.5 space-y-1.5">
      <div class="flex items-center gap-2">
        <p class="text-[11px] uppercase tracking-wider opacity-60 flex-1">Up next · most votes plays next</p>
        <button v-if="st.host && st.now" class="text-[11px] font-bold opacity-80 hover:opacity-100" @click="act(api.radioSkip(station), 'Skipped')">⏭ Skip</button>
        <button v-if="s.user" class="btn h-8 px-3 text-label-sm bg-[#ff0033] text-white" @click="picking = true"><Icon name="add" :size="16" /> Suggest</button>
      </div>
      <p v-if="!st.queue.length" class="text-body-sm opacity-60 py-1">No suggestions yet — the radio picks something random when this song ends.</p>
      <div v-for="q in st.queue.slice(0, 8)" :key="q.id" class="flex items-center gap-2 rounded bg-white/5 p-1.5">
        <img :src="q.track.artUrl ?? ''" alt="" class="w-12 h-[27px] rounded object-cover shrink-0 bg-black" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
        <div class="min-w-0 flex-1"><p class="text-label-sm truncate">{{ q.track.title }}</p><p class="text-[10px] opacity-60 truncate">{{ q.track.artist }}</p></div>
        <button v-if="q.mine || st.host" class="opacity-50 hover:opacity-100 px-1" aria-label="Remove" @click="act(api.radioRemove(station, q.id))"><Icon name="close" :size="14" /></button>
        <button class="h-8 px-2.5 rounded-full text-label-sm font-bold flex items-center gap-1 shrink-0" :class="q.voted ? 'bg-[#ff0033] text-white' : 'bg-white/10'" :disabled="!s.user" :aria-label="q.voted ? 'Remove vote' : 'Vote'" @click="act(api.radioVote(station, q.id))">▲ {{ q.votes }}</button>
      </div>
      <p v-if="st.queue.length > 8" class="text-[11px] opacity-60">+{{ st.queue.length - 8 }} more</p>
    </div>
    <MusicPicker v-if="picking" title="📻 Suggest a song for the radio" @close="picking = false" @pick="suggest" />
  </section>
</template>
