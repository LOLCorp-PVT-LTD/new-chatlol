<script setup lang="ts">
import type { StickerInput } from '@chatlol/shared';
import EmojiButton from '../components/EmojiButton.vue';
import RichText from '../components/RichText.vue';
import StickerView from '../components/StickerView.vue';
import { insertAtCaret } from '../lib/insertAtCaret';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ChatMessage, LiveStream, ViewerState } from '@chatlol/shared';
import { GIFTS, compact, MeshHost, MeshViewer, type PeerFactory, type SignalSocket } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confetti, ding } from '../lib/fx';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';

const route = useRoute();
const router = useRouter();
const s = useSession();
const id = route.params.id as string;
const stream = ref<LiveStream | null>(null);
const chat = ref<ChatMessage[]>([]);
const viewers = ref(0);
const videoViewers = ref(0);
const draft = ref('');
const floaters = ref<{ id: number; emoji: string; x: number }[]>([]);
const video = ref<HTMLVideoElement>();
const list = ref<HTMLElement>();
const isHost = computed(() => stream.value?.host.id === s.user?.id);
const viewerState = ref<ViewerState | 'idle'>('idle');
const camOn = ref(true);
const micOn = ref(true);
const ended = ref(false);
let media: MediaStream | null = null;
let host: MeshHost | null = null;
let viewer: MeshViewer | null = null;
let fid = 0;

const makePeer: PeerFactory = (cfg) => new RTCPeerConnection(cfg) as never;
const sock = () => s.socket() as unknown as SignalSocket;

const scroll = async () => { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }); };
const onChat = (m: ChatMessage) => { if (m.roomId === id) { chat.value = [...chat.value.slice(-150), m]; void scroll(); } };
const onGift = (g: { streamId: string; emoji: string; amount: number }) => {
  if (g.streamId !== id) return;
  for (let i = 0; i < Math.min(8, Math.ceil(g.amount / 20)); i++) {
    const f = { id: ++fid, emoji: g.emoji, x: 10 + Math.random() * 80 };
    setTimeout(() => { floaters.value.push(f); setTimeout(() => (floaters.value = floaters.value.filter((x) => x.id !== f.id)), 1500); }, i * 120);
  }
  if (stream.value) stream.value.giftsTotal += g.amount;
  if (g.amount >= 150) confetti(undefined, window.innerHeight / 3);
};
const onViewers = (v: { streamId: string; viewers: number }) => { if (v.streamId === id) viewers.value = v.viewers; };
const onEnded = (e: { streamId: string }) => { if (e.streamId === id) { ended.value = true; viewer?.stop(); } };
// Re-join the room after a socket reconnect (before the mesh re-requests video).
const rejoin = () => s.socket().emit('stream:join', id);

async function startBroadcast() {
  try {
    media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    s.toast({ kind: 'info', title: 'Camera blocked — streaming in chat-only mode' });
    return;
  }
  if (video.value) { video.value.srcObject = media; void video.value.play(); }
  host = new MeshHost(id, sock(), await api.iceServers(), makePeer, media);
  host.onViewersChange = (n) => (videoViewers.value = n);
  await host.start();
}

async function startWatching() {
  viewer = new MeshViewer(id, sock(), await api.iceServers(), makePeer);
  viewer.onState = (st) => (viewerState.value = st);
  viewer.onStream = (ms) => { if (video.value) { video.value.srcObject = ms as MediaStream; void video.value.play().catch(() => {}); } };
  viewer.start();
}

onMounted(async () => {
  const r = await api.stream(id);
  stream.value = r.stream;
  chat.value = r.chat;
  viewers.value = r.stream.viewers;
  const so = s.socket();
  so.on('connect', rejoin);
  so.emit('stream:join', id);
  so.on('stream:chat', onChat);
  so.on('stream:gift', onGift);
  so.on('stream:viewers', onViewers);
  so.on('stream:ended', onEnded);
  void scroll();
  if (!r.stream.video || !s.user) return;
  if (isHost.value) await startBroadcast();
  else await startWatching();
});
onUnmounted(() => {
  const so = s.socket();
  host?.stop();
  viewer?.stop();
  so.emit('stream:leave', id);
  so.off('connect', rejoin);
  so.off('stream:chat', onChat);
  so.off('stream:gift', onGift);
  so.off('stream:viewers', onViewers);
  so.off('stream:ended', onEnded);
  media?.getTracks().forEach((t) => t.stop());
});

function toggle(kind: 'video' | 'audio') {
  media?.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = !t.enabled));
  if (kind === 'video') camOn.value = !camOn.value; else micOn.value = !micOn.value;
}
const box = ref<HTMLInputElement>();
const addEmoji = (t: string) => (draft.value = insertAtCaret(box.value, draft.value, t));
function send(sticker: StickerInput | null = null) {
  if (!draft.value.trim() && !sticker) return;
  s.socket().emit('stream:chat', { streamId: id, body: sticker ? '' : draft.value.trim(), sticker });
  if (!sticker) draft.value = '';
}
async function gift(giftId: string) {
  if (!s.user) return s.toast({ kind: 'info', title: 'Join to send gifts 🎁' });
  try {
    const r = await api.sendGift(id, giftId);
    s.user.sparks = r.sparks;
    ding('reward');
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function end() {
  await api.endLive(id);
  router.push('/live');
}
const stateText: Record<string, string> = {
  connecting: 'Connecting to the stream…', full: 'Video is full right now — chat & gifts still work 🎁', offline: 'Waiting for the host’s camera…',
  'no-video': 'Chat-only stream', failed: 'Couldn’t connect video. Check your network.', idle: '',
};
</script>

<template>
  <div v-if="stream" class="grid lg:grid-cols-[1fr_360px] gap-4 max-w-[1200px] mx-auto">
    <div class="relative rounded-lg overflow-hidden bg-inverse-surface aspect-[9/12] sm:aspect-video shadow-float">
      <video ref="video" playsinline :muted="isHost" class="w-full h-full object-cover" :class="{ '-scale-x-100': isHost, hidden: !isHost && viewerState !== 'live' }" />
      <img v-if="!isHost && viewerState !== 'live'" :src="stream.coverUrl" alt="" class="absolute inset-0 w-full h-full object-cover opacity-70" />
      <div class="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />
      <div class="absolute top-4 left-4 right-4 flex items-center gap-3">
        <Avatar :user="stream.host" :size="44" live />
        <div class="min-w-0 text-white"><UserName :user="stream.host" class="text-body-lg" /><p class="text-body-sm opacity-80 truncate">{{ stream.title }}</p></div>
        <span class="ml-auto bg-flame text-white rounded-full px-3 py-1 text-label-sm">LIVE</span>
        <span class="glass rounded-full px-3 py-1 text-label-sm flex items-center gap-1"><Icon name="visibility" :size="14" /> {{ compact(viewers) }}</span>
      </div>
      <div class="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 items-center">
        <span class="glass rounded-full px-3 py-1.5 text-label-md">🎁 {{ compact(stream.giftsTotal) }} Sparks gifted</span>
        <template v-if="isHost">
          <span v-if="stream.video" class="glass rounded-full px-3 py-1.5 text-label-md">🎥 {{ videoViewers }}/{{ stream.maxViewers }} watching video</span>
          <button v-if="stream.video" class="btn-icon w-9 h-9 bg-black/50 text-white" :aria-label="camOn ? 'Turn camera off' : 'Turn camera on'" @click="toggle('video')"><Icon :name="camOn ? 'videocam' : 'videocam_off'" :size="18" /></button>
          <button v-if="stream.video" class="btn-icon w-9 h-9 bg-black/50 text-white" :aria-label="micOn ? 'Mute' : 'Unmute'" @click="toggle('audio')"><Icon :name="micOn ? 'mic' : 'mic_off'" :size="18" /></button>
          <button class="btn h-9 bg-error text-white ml-auto" @click="end"><Icon name="stop_circle" :size="18" /> End</button>
        </template>
      </div>
      <span v-for="f in floaters" :key="f.id" class="absolute bottom-16 text-5xl animate-float-up pointer-events-none" :style="{ left: f.x + '%' }">{{ f.emoji }}</span>
      <div v-if="ended" class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white gap-3">
        <p class="text-headline-lg">Stream ended 🌙</p><RouterLink to="/live" class="btn-primary">See who else is live</RouterLink>
      </div>
      <div v-else-if="!isHost && viewerState !== 'live' && stateText[viewerState]" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span class="glass rounded-full px-4 py-2 text-label-md">{{ stateText[viewerState] }}</span>
      </div>
    </div>

    <aside class="card flex flex-col h-[70dvh] lg:h-auto overflow-hidden">
      <div v-if="stream.topGifters.length" class="p-4 border-b border-sandstone">
        <p class="label mb-2">Top gifters</p>
        <div class="flex gap-3"><div v-for="(g, i) in stream.topGifters" :key="g.user.id" class="flex items-center gap-1.5 text-label-sm">{{ ['🥇', '🥈', '🥉'][i] }}<Avatar :user="g.user" :size="26" :show-online="false" />{{ compact(g.amount) }}</div></div>
      </div>
      <div ref="list" class="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        <div v-for="m in chat" :key="m.id" class="text-body-md flex gap-2 items-start" :class="{ 'bg-sunlit rounded-md px-2 py-1': m.kind === 'gift' }">
          <Avatar :user="m.author" :size="24" :show-online="false" />
          <div class="min-w-0 break-words"><UserName :user="m.author" :link="false" class="text-primary mr-1" /> <RichText :text="m.body" /><StickerView v-if="m.sticker" :sticker="m.sticker" :size="80" class="block mt-1" /></div>
        </div>
      </div>
      <div class="p-3 border-t border-sandstone space-y-2">
        <div v-if="!isHost" class="grid grid-cols-5 gap-1.5">
          <button v-for="g in GIFTS" :key="g.id" class="rounded-md bg-surface-container-low hover:bg-sunlit py-1.5 flex flex-col items-center active:scale-90 transition" @click="gift(g.id)">
            <span class="text-2xl">{{ g.emoji }}</span><span class="text-[10px] font-bold text-primary">{{ g.price }} ✦</span>
          </button>
        </div>
        <form class="flex gap-2 items-center" @submit.prevent="send()">
          <EmojiButton v-if="s.user" stickers align="left" @insert="addEmoji" @sticker="send" />
          <input ref="box" v-model="draft" class="input h-11 text-body-md" placeholder="Say something nice…" maxlength="300" :disabled="!s.user" />
          <button class="btn-primary h-11 w-11 px-0 shrink-0" aria-label="Send" :disabled="!draft.trim()"><Icon name="send" /></button>
        </form>
      </div>
    </aside>
  </div>
</template>
