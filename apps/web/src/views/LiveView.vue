<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { LiveStream } from '@chatlol/shared';
import { compact } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import Empty from '../components/Empty.vue';

const s = useSession();
const router = useRouter();
const streams = ref<LiveStream[]>([]);
const going = ref(false);
const form = ref({ title: '', category: 'Just Chatting', video: true });
const CATS = ['Just Chatting', 'Music', 'Gaming', 'Art', 'Cooking', 'Fitness', 'Study With Me', 'IRL'];
onMounted(async () => { streams.value = (await api.streams()).streams; });
async function goLive() {
  try {
    const r = await api.goLive(form.value);
    router.push(`/live/${r.stream.id}?host=1`);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>
<template>
  <div class="max-w-[960px] mx-auto space-y-5">
    <div class="flex items-end justify-between gap-3">
      <div><h1 class="text-headline-xl">Live 🔴</h1><p class="text-body-md text-on-surface-variant">Hangout broadcasts with interactive gifts.</p></div>
      <button v-if="s.user" class="btn-primary" @click="going = true"><Icon name="videocam" /> Go Live</button>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <RouterLink v-for="st in streams" :key="st.id" :to="`/live/${st.id}`" class="card overflow-hidden group">
        <div class="relative aspect-video bg-inverse-surface">
          <img :src="st.coverUrl" alt="" class="w-full h-full object-cover opacity-90 group-hover:scale-105 transition duration-500" />
          <span class="absolute top-3 left-3 bg-flame text-white rounded-full px-2.5 py-1 text-label-sm flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE</span>
          <span v-if="st.video" class="absolute bottom-3 left-3 bg-black/50 text-white rounded-full px-2.5 py-1 text-label-sm">🎥 video</span>
          <span class="absolute top-3 right-3 glass rounded-full px-2.5 py-1 text-label-sm flex items-center gap-1"><Icon name="visibility" :size="14" /> {{ compact(st.viewers) }}</span>
          <span class="absolute bottom-3 right-3 bg-black/50 text-white rounded-full px-2.5 py-1 text-label-sm">🎁 {{ compact(st.giftsTotal) }}</span>
        </div>
        <div class="p-4 flex gap-3">
          <Avatar :user="st.host" :size="40" live />
          <div class="min-w-0"><p class="text-label-lg truncate">{{ st.title }}</p><UserName :user="st.host" :link="false" class="text-body-sm text-on-surface-variant" /><p class="text-body-sm text-secondary">{{ st.category }}</p></div>
        </div>
      </RouterLink>
    </div>
    <Empty v-if="!streams.length" emoji="📺" title="Nobody’s live right now" body="Be the main character — go live and get gifted." />
    <Modal v-if="going" title="Go Live" @close="going = false">
      <div class="px-6 pb-6 space-y-3">
        <input v-model="form.title" class="input" placeholder="Stream title" maxlength="80" />
        <div class="flex flex-wrap gap-2"><button v-for="c in CATS" :key="c" class="chip" :class="{ 'chip-active': form.category === c }" @click="form.category = c">{{ c }}</button></div>
        <label class="flex items-center gap-3 rounded-md bg-surface-container-low p-3 cursor-pointer">
          <input v-model="form.video" type="checkbox" class="w-5 h-5 accent-flame" />
          <span class="text-body-md flex-1"><b>Camera on</b> — stream video to up to 12 viewers. Off = chat-only stream.</span>
        </label>
        <p class="text-body-sm text-on-surface-variant">Your followers get a notification. You keep 70% of gifted Sparks. You need a verified email to go live.</p>
        <button class="btn-primary w-full" :disabled="form.title.length < 3" @click="goLive"><Icon name="videocam" /> Start broadcast</button>
      </div>
    </Modal>
  </div>
</template>
