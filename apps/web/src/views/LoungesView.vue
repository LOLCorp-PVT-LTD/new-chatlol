<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { Lounge } from '@chatlol/shared';
import { api } from '../lib/api';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';

const lounges = ref<Lounge[]>([]);
const load = async () => { lounges.value = (await api.lounges()).lounges; };
let t: ReturnType<typeof setInterval>;
onMounted(() => { void load(); t = setInterval(load, 15_000); });
onUnmounted(() => clearInterval(t));
</script>
<template>
  <div class="max-w-[900px] mx-auto space-y-5">
    <div><h1 class="text-headline-xl">Hangout Lounges 🛋️</h1><p class="text-body-md text-on-surface-variant">Drop into a room. Real-time chat, shared soundtrack, zero pressure.</p></div>
    <div class="grid sm:grid-cols-2 gap-4">
      <RouterLink v-for="l in lounges" :key="l.id" :to="`/lounges/${l.id}`" class="rounded-lg bg-sunlit overflow-hidden shadow-warm hover:shadow-pop transition group">
        <div class="relative h-36 overflow-hidden">
          <img :src="l.coverUrl" alt="" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <span v-if="l.isLive" class="absolute top-3 left-3 bg-flame text-white rounded-full px-2.5 py-1 text-label-sm flex items-center gap-1"><span class="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE</span>
          <span class="absolute bottom-3 left-3 text-white text-headline-md drop-shadow">{{ l.emoji }} {{ l.name }}</span>
        </div>
        <div class="p-4">
          <p class="text-body-md text-on-surface-variant">{{ l.topic }}</p>
          <p class="text-body-sm mt-2 flex items-center gap-1.5 text-secondary"><Icon name="graphic_eq" :size="16" /> {{ l.nowPlaying }}</p>
          <div class="flex items-center mt-3">
            <div class="flex -space-x-2"><Avatar v-for="m in l.memberPreview" :key="m.id" :user="m" :size="30" :show-online="false" class="ring-2 ring-sunlit rounded-full" /></div>
            <span class="text-label-md ml-3">{{ l.onlineCount }} here</span>
            <span class="btn-primary h-9 px-4 ml-auto text-label-md">Jump In</span>
          </div>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
