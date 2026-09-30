<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ChatMessage, Lounge } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';

const route = useRoute();
const s = useSession();
const id = route.params.id as string;
const lounge = ref<Lounge | null>(null);
const messages = ref<ChatMessage[]>([]);
const online = ref(0);
const draft = ref('');
const list = ref<HTMLElement>();
const EMOJI = ['🔥', '😂', '🧡', '💀', '👑', '✨'];

const scroll = async () => { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }); };
const onMsg = (m: ChatMessage) => { if (m.roomId === id) { messages.value.push(m); void scroll(); } };
const onPresence = (p: { loungeId: string; onlineCount: number }) => { if (p.loungeId === id) online.value = Math.max(online.value, p.onlineCount); };

onMounted(async () => {
  const r = await api.lounge(id);
  lounge.value = r.lounge;
  online.value = r.lounge.onlineCount;
  const sock = s.socket();
  sock.emit('lounge:join', id, (history) => { messages.value = history; void scroll(); });
  sock.on('lounge:message', onMsg);
  sock.on('lounge:presence', onPresence);
});
onUnmounted(() => {
  const sock = s.socket();
  sock.emit('lounge:leave', id);
  sock.off('lounge:message', onMsg);
  sock.off('lounge:presence', onPresence);
});
function send(text = draft.value) {
  if (!text.trim() || !s.user) return;
  s.socket().emit('lounge:send', { loungeId: id, body: text.trim() });
  draft.value = '';
}
</script>

<template>
  <div class="max-w-[900px] mx-auto card overflow-hidden flex flex-col h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-10rem)]">
    <header v-if="lounge" class="flex items-center gap-3 px-5 py-4 bg-sunlit">
      <RouterLink to="/lounges" class="btn-icon -ml-2" aria-label="Back"><Icon name="arrow_back" /></RouterLink>
      <span class="text-3xl">{{ lounge.emoji }}</span>
      <div class="min-w-0 flex-1"><h1 class="text-headline-sm truncate">{{ lounge.name }}</h1>
        <p class="text-body-sm text-on-surface-variant truncate flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-online" /> {{ online }} here • <Icon name="graphic_eq" :size="14" class="text-flame" /> {{ lounge.nowPlaying }}</p></div>
    </header>
    <div ref="list" class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
      <div v-for="m in messages" :key="m.id" class="flex gap-2.5" :class="{ 'flex-row-reverse': m.author.id === s.user?.id }">
        <RouterLink :to="`/u/${m.author.handle}`"><Avatar :user="m.author" :size="34" /></RouterLink>
        <div class="max-w-[75%]">
          <div class="flex items-center gap-1.5 text-label-sm text-on-surface-variant mb-0.5" :class="{ 'justify-end': m.author.id === s.user?.id }">
            <UserName :user="m.author" :link="false" /><span>{{ timeAgo(m.createdAt) }}</span></div>
          <p class="px-4 py-2 rounded-[20px] text-body-md break-words"
            :class="m.author.id === s.user?.id ? 'bg-sunset text-white rounded-tr-md' : 'bg-surface-container-low rounded-tl-md'">{{ m.body }}</p>
        </div>
      </div>
    </div>
    <form v-if="s.user" class="border-t border-sandstone p-3 space-y-2" @submit.prevent="send()">
      <div class="flex gap-1.5"><button v-for="e in EMOJI" :key="e" type="button" class="w-9 h-9 rounded-full bg-surface-container-low hover:scale-110 transition" @click="send(e)">{{ e }}</button></div>
      <div class="flex gap-2">
        <input v-model="draft" class="input h-12 text-body-md" placeholder="Say something to the lounge… (@mention people)" maxlength="500" />
        <button class="btn-primary h-12 w-12 px-0 shrink-0" aria-label="Send" :disabled="!draft.trim()"><Icon name="send" /></button>
      </div>
    </form>
    <RouterLink v-else to="/join" class="btn-primary m-3">Join to chat</RouterLink>
  </div>
</template>
