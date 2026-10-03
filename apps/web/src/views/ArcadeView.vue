<script setup lang="ts">
import AdSlot from '../components/AdSlot.vue';
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import Avatar from '../components/Avatar.vue';

/** Arcade lobby: every single-player game with your best and the top three. */
const data = ref<Awaited<ReturnType<typeof api.arcade>> | null>(null);
onMounted(async () => (data.value = await api.arcade()));
const BG: Record<string, string> = { snake: 'linear-gradient(135deg,#0f172a,#16a34a)', flight: 'linear-gradient(135deg,#ff9a6b,#7c3aed)', '2048': 'linear-gradient(135deg,#ffd166,#ff5e00)', tower: 'linear-gradient(135deg,#1e1b4b,#ec4899)' };
</script>

<template>
  <div class="max-w-[960px] mx-auto space-y-5">
    <section class="rounded-lg p-6 text-white shadow-float bg-[linear-gradient(135deg,#7c3aed,#ff5e00)] relative overflow-hidden">
      <div class="absolute -right-6 -bottom-10 text-[150px] opacity-20 rotate-12 select-none">🕹️</div>
      <p class="label !text-white/80">Arcade</p>
      <h1 class="text-headline-lg">Beat the high scores</h1>
      <p class="text-body-md opacity-90 max-w-lg">Quick solo games. Every score is replayed and checked on our side, so the leaderboards are real. Earn up to {{ data?.sparksPerDay ?? 100 }} ✦ a day.</p>
    </section>
    <AdSlot placement="arcade_lobby" />
    <div v-if="data" class="grid sm:grid-cols-2 gap-4">
      <RouterLink v-for="g in data.games" :key="g.key" :to="`/arcade/${g.key}`" class="card overflow-hidden hover:shadow-pop hover:-translate-y-0.5 transition">
        <div class="h-32 flex items-center justify-center text-6xl relative" :style="{ background: BG[g.key] }"><span class="drop-shadow-xl">{{ g.emoji }}</span>
          <span v-if="g.myBest !== null" class="absolute top-3 right-3 rounded-full bg-black/40 text-white px-3 py-1 text-label-sm backdrop-blur">Your best {{ g.myBest.toLocaleString() }}</span></div>
        <div class="p-4">
          <p class="text-headline-sm">{{ g.name }}</p><p class="text-body-sm text-on-surface-variant">{{ g.desc }}</p>
          <div v-if="g.top.length" class="flex items-center gap-3 mt-3">
            <div v-for="t in g.top" :key="t.user.id" class="flex items-center gap-1.5 text-label-sm"><span>{{ ['🥇', '🥈', '🥉'][t.rank - 1] }}</span><Avatar :user="t.user" :size="22" :show-online="false" /><span class="tabular-nums">{{ t.score.toLocaleString() }}</span></div>
          </div>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
