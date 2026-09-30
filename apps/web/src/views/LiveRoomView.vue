<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ChatMessage, LiveStream } from '@chatlol/shared';
import { GIFTS, compact } from '@chatlol/shared';
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
const draft = ref('');
const floaters = ref<{ id: number; emoji: string; x: number }[]>([]);
const video = ref<HTMLVideoElement>();
const list = ref<HTMLElement>();
const isHost = computed(() => stream.value?.host.id === s.user?.id);
let media: MediaStream | null = null;
let fid = 0;

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

onMounted(async () => {
  const r = await api.stream(id);
  stream.value = r.stream;
  chat.value = r.chat;
  viewers.value = r.stream.viewers;
  const sock = s.socket();
  sock.emit('stream:join', id);
  sock.on('stream:chat', onChat);
  sock.on('stream:gift', onGift);
  sock.on('stream:viewers', onViewers);
  void scroll();
  // Host preview: local camera via getUserMedia. Plug a WebRTC SFU (e.g. LiveKit) into this MediaStream to broadcast.
  if (isHost.value && navigator.mediaDevices) {
    try {
      media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      if (video.value) { video.value.srcObject = media; void video.value.play(); }
    } catch { s.toast({ kind: 'info', title: 'Camera blocked — streaming in chat-only mode' }); }
  }
});
onUnmounted(() => {
  const sock = s.socket();
  sock.emit('stream:leave', id);
  sock.off('stream:chat', onChat);
  sock.off('stream:gift', onGift);
  sock.off('stream:viewers', onViewers);
  media?.getTracks().forEach((t) => t.stop());
});

function send() {
  if (!draft.value.trim()) return;
  s.socket().emit('stream:chat', { streamId: id, body: draft.value.trim() });
  draft.value = '';
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
</script>

<template>
  <div v-if="stream" class="grid lg:grid-cols-[1fr_360px] gap-4 max-w-[1200px] mx-auto">
    <div class="relative rounded-lg overflow-hidden bg-inverse-surface aspect-[9/12] sm:aspect-video shadow-float">
      <video v-if="isHost" ref="video" muted playsinline class="w-full h-full object-cover -scale-x-100" />
      <img v-else :src="stream.coverUrl" alt="" class="w-full h-full object-cover opacity-80" />
      <div class="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      <div class="absolute top-4 left-4 right-4 flex items-center gap-3">
        <Avatar :user="stream.host" :size="44" live />
        <div class="min-w-0 text-white"><UserName :user="stream.host" class="text-body-lg" /><p class="text-body-sm opacity-80 truncate">{{ stream.title }}</p></div>
        <span class="ml-auto bg-flame text-white rounded-full px-3 py-1 text-label-sm">LIVE</span>
        <span class="glass rounded-full px-3 py-1 text-label-sm flex items-center gap-1"><Icon name="visibility" :size="14" /> {{ compact(viewers) }}</span>
      </div>
      <div class="absolute bottom-4 left-4 flex gap-2">
        <span class="glass rounded-full px-3 py-1.5 text-label-md">🎁 {{ compact(stream.giftsTotal) }} Sparks gifted</span>
        <button v-if="isHost" class="btn h-9 bg-error text-white" @click="end"><Icon name="stop_circle" :size="18" /> End</button>
      </div>
      <span v-for="f in floaters" :key="f.id" class="absolute bottom-16 text-5xl animate-float-up pointer-events-none" :style="{ left: f.x + '%' }">{{ f.emoji }}</span>
      <div v-if="!isHost" class="absolute inset-0 flex items-center justify-center pointer-events-none"><span class="glass rounded-full px-4 py-2 text-label-md">🎧 Audio/video relay connects via your media server</span></div>
    </div>

    <aside class="card flex flex-col h-[70dvh] lg:h-auto overflow-hidden">
      <div v-if="stream.topGifters.length" class="p-4 border-b border-sandstone">
        <p class="label mb-2">Top gifters</p>
        <div class="flex gap-3"><div v-for="(g, i) in stream.topGifters" :key="g.user.id" class="flex items-center gap-1.5 text-label-sm">{{ ['🥇', '🥈', '🥉'][i] }}<Avatar :user="g.user" :size="26" :show-online="false" />{{ compact(g.amount) }}</div></div>
      </div>
      <div ref="list" class="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        <div v-for="m in chat" :key="m.id" class="text-body-md flex gap-2 items-start" :class="{ 'bg-sunlit rounded-md px-2 py-1': m.kind === 'gift' }">
          <Avatar :user="m.author" :size="24" :show-online="false" />
          <p class="min-w-0 break-words"><UserName :user="m.author" :link="false" class="text-primary mr-1" /> {{ m.body }}</p>
        </div>
      </div>
      <div class="p-3 border-t border-sandstone space-y-2">
        <div v-if="!isHost" class="grid grid-cols-5 gap-1.5">
          <button v-for="g in GIFTS" :key="g.id" class="rounded-md bg-surface-container-low hover:bg-sunlit py-1.5 flex flex-col items-center active:scale-90 transition" @click="gift(g.id)">
            <span class="text-2xl">{{ g.emoji }}</span><span class="text-[10px] font-bold text-primary">{{ g.price }} ✦</span>
          </button>
        </div>
        <form class="flex gap-2" @submit.prevent="send">
          <input v-model="draft" class="input h-11 text-body-md" placeholder="Say something nice…" maxlength="300" :disabled="!s.user" />
          <button class="btn-primary h-11 w-11 px-0 shrink-0" aria-label="Send" :disabled="!draft.trim()"><Icon name="send" /></button>
        </form>
      </div>
    </aside>
  </div>
</template>
