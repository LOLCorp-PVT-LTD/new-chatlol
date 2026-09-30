<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { LeaderboardEntry } from '@chatlol/shared';
import { compact } from '@chatlol/shared';
import { api } from '../lib/api';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';

const kind = ref<'vibe' | 'streak' | 'xp'>('vibe');
const entries = ref<LeaderboardEntry[]>([]);
const load = async () => { entries.value = (await api.leaderboard(kind.value)).entries; };
onMounted(load);
watch(kind, load);
const fmt = (n: number) => (kind.value === 'vibe' ? `⭐ ${n}` : kind.value === 'streak' ? `🔥 ${n} days` : `${compact(n)} XP`);
</script>
<template>
  <div class="max-w-[720px] mx-auto space-y-5">
    <div><h1 class="text-headline-xl">Top 100 Hall of Fame 🏆</h1><p class="text-body-md text-on-surface-variant">Updated live. Climb by dropping daily and earning crowns.</p></div>
    <div class="flex gap-2">
      <button v-for="k in ([['vibe', '⭐ Vibe score'], ['streak', '🔥 Streaks'], ['xp', '⚡ XP']] as const)" :key="k[0]" class="chip" :class="{ 'chip-active': kind === k[0] }" @click="kind = k[0]">{{ k[1] }}</button>
    </div>
    <div v-if="entries.length >= 3" class="grid grid-cols-3 gap-3 items-end">
      <RouterLink v-for="i in [1, 0, 2]" :key="i" :to="`/u/${entries[i].user.handle}`" class="card p-4 text-center" :class="i === 0 ? 'bg-sunset text-white pb-8 shadow-float' : ''">
        <p class="text-3xl">{{ ['👑', '🥈', '🥉'][i] }}</p>
        <Avatar :user="entries[i].user" :size="i === 0 ? 80 : 60" class="mx-auto mt-2" />
        <p class="text-label-lg mt-2 truncate">{{ entries[i].user.displayName }}</p>
        <p class="text-label-md" :class="i === 0 ? 'opacity-90' : 'text-primary'">{{ fmt(entries[i].score) }}</p>
      </RouterLink>
    </div>
    <div class="card divide-y divide-sandstone">
      <RouterLink v-for="e in entries.slice(3)" :key="e.user.id" :to="`/u/${e.user.handle}`" class="flex items-center gap-4 px-5 py-3 hover:bg-surface-container-low">
        <span class="w-8 text-label-lg text-on-surface-variant">#{{ e.rank }}</span>
        <Avatar :user="e.user" :size="40" />
        <UserName :user="e.user" :link="false" class="flex-1 min-w-0" />
        <span class="text-label-lg text-primary">{{ fmt(e.score) }}</span>
      </RouterLink>
    </div>
  </div>
</template>
