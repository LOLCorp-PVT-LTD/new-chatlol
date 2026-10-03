<script setup lang="ts">
import { computed } from 'vue';
import type { Tournament } from '@chatlol/shared';
import { ARCADE, GAMES } from '@chatlol/shared';
import { useNow } from './games/useServerClock';

/** Tournament card / banner: uploaded banner art, game, prize for 1st, countdown. `wide` = home-page banner. */
const props = defineProps<{ t: Tournament; wide?: boolean }>();
const now = useNow(1);
const game = computed(() => (props.t.kind === 'arcade' ? (ARCADE as Record<string, { name: string; emoji: string }>)[props.t.game] : (GAMES as Record<string, { name: string; emoji: string }>)[props.t.game]));
const target = computed(() => (props.t.status === 'upcoming' ? props.t.startsAt : props.t.endsAt));
const left = computed(() => {
  const ms = Math.max(0, Date.parse(target.value) - now.value);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return d ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
});
</script>

<template>
  <RouterLink :to="`/tournaments/${t.id}`" class="block rounded-lg overflow-hidden shadow-float relative group text-white" :class="wide ? 'h-44 sm:h-52' : 'h-48'">
    <img v-if="t.bannerUrl" :src="t.bannerUrl" alt="" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500" />
    <div v-else class="absolute inset-0 bg-[linear-gradient(135deg,#7c3aed,#ff5e00)]" />
    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
    <div class="absolute top-3 left-3 flex gap-2">
      <span class="rounded-full px-3 py-1 text-label-sm backdrop-blur" :class="t.status === 'live' ? 'bg-red-500/90' : 'bg-black/45'">{{ t.status === 'live' ? '● LIVE' : t.status === 'upcoming' ? 'Starts in' : 'Ended' }}<template v-if="t.status !== 'ended' && t.status !== 'ending'"> {{ t.status === 'live' ? '· ends in' : '' }} {{ left }}</template></span>
      <span class="rounded-full px-3 py-1 text-label-sm bg-black/45 backdrop-blur">{{ game?.emoji }} {{ game?.name }}</span>
    </div>
    <div class="absolute bottom-0 inset-x-0 p-4">
      <p class="text-headline-md leading-tight drop-shadow">{{ t.title }}</p>
      <p class="text-body-sm opacity-90 mt-1">🥇 {{ t.prizes[0]?.text }} · Lv {{ t.minLevel }}+ · {{ t.entryGold ? `🪙 ${t.entryGold} entry` : 'Free entry' }} · {{ t.entrants }} in</p>
    </div>
  </RouterLink>
</template>
