<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Lounge, LeaderboardEntry, LiveStream } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';

const s = useSession();
const lounges = ref<Lounge[]>([]);
const top = ref<LeaderboardEntry[]>([]);
const streams = ref<LiveStream[]>([]);
onMounted(async () => {
  const [l, t, st] = await Promise.all([api.lounges(), api.trending(), api.streams()]);
  lounges.value = l.lounges.slice(0, 3);
  top.value = t.top;
  streams.value = st.streams.slice(0, 2);
});
</script>

<template>
  <aside class="w-[300px] 2xl:w-[320px] shrink-0 space-y-4">
    <div class="card p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-headline-sm flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-online animate-pulse" />Live Raters</h3>
        <span class="text-label-sm text-on-surface-variant">real-time</span>
      </div>
      <TransitionGroup name="fade" tag="div" class="space-y-2">
        <div v-for="t in s.ticker.slice(0, 5)" :key="t.id" class="flex items-center gap-2.5 rounded-md bg-surface-container-low p-2.5">
          <Avatar v-if="t.actor" :user="t.actor" :size="30" :show-online="false" />
          <div class="min-w-0"><p class="text-body-sm font-bold line-clamp-2">{{ t.text }}</p><p class="text-[11px] text-on-surface-variant">{{ timeAgo(t.at) }}</p></div>
        </div>
      </TransitionGroup>
      <p v-if="!s.ticker.length" class="text-body-sm text-on-surface-variant">Crowns, streaks and legendary pulls show up here live 👑</p>
    </div>

    <div v-if="streams.length" class="card p-5">
      <h3 class="text-headline-sm mb-3 flex items-center gap-2"><Icon name="live_tv" class="text-flame" /> Live now</h3>
      <RouterLink v-for="st in streams" :key="st.id" :to="`/live/${st.id}`" class="flex items-center gap-3 p-2 -mx-2 rounded-md hover:bg-surface-container-low">
        <Avatar :user="st.host" :size="40" live />
        <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ st.title }}</p><p class="text-body-sm text-on-surface-variant">{{ st.host.displayName }} • {{ st.viewers }} watching</p></div>
      </RouterLink>
    </div>

    <div class="card p-5">
      <div class="flex items-center justify-between mb-3"><h3 class="text-headline-sm">Top Rated Today</h3><RouterLink to="/leaderboard" class="text-label-md text-primary">View 50</RouterLink></div>
      <div v-for="e in top" :key="e.user.id" class="flex items-center gap-3 py-2">
        <span class="w-5 text-label-lg text-primary">{{ e.rank }}</span>
        <RouterLink :to="`/u/${e.user.handle}`"><Avatar :user="e.user" :size="38" /></RouterLink>
        <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ e.user.displayName }}</p><p class="text-body-sm text-on-surface-variant">⭐ {{ e.score }}</p></div>
      </div>
    </div>

    <div class="space-y-2">
      <RouterLink v-for="l in lounges" :key="l.id" :to="`/lounges/${l.id}`" class="flex items-center gap-3 rounded-lg bg-sunlit p-4 hover:shadow-pop transition">
        <span class="w-11 h-11 rounded-full bg-surface-container-lowest flex items-center justify-center text-xl">{{ l.emoji }}</span>
        <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ l.name }}</p><p class="text-body-sm text-on-surface-variant">{{ l.onlineCount }} vibing right now</p></div>
        <span class="btn-primary h-8 px-3 text-label-sm">Join</span>
      </RouterLink>
    </div>
  </aside>
</template>
