<script setup lang="ts">
import AdSlot from '../components/AdSlot.vue';
import { computed, onMounted, ref } from 'vue';
import type { Tournament } from '@chatlol/shared';
import { api } from '../lib/api';
import TournamentCard from '../components/TournamentCard.vue';

/** All live, upcoming and recently finished tournaments. */
const list = ref<Tournament[]>([]);
onMounted(async () => (list.value = (await api.tournaments()).tournaments));
const groups = computed(() => [
  ['🔴 Live now', list.value.filter((t) => t.status === 'live')],
  ['⏳ Coming up', list.value.filter((t) => t.status === 'upcoming')],
  ['🏁 Finished', list.value.filter((t) => t.status === 'ended' || t.status === 'ending')],
] as const);
</script>

<template>
  <div class="max-w-[960px] mx-auto space-y-6">
    <section class="rounded-lg p-6 text-white shadow-float bg-[linear-gradient(135deg,#d4a017,#ff5e00_55%,#7c3aed)] relative overflow-hidden">
      <div class="absolute -right-6 -bottom-10 text-[150px] opacity-20 rotate-12 select-none">🏆</div>
      <p class="label !text-white/80">Tournaments</p>
      <h1 class="text-headline-lg">Compete for real prizes</h1>
      <p class="text-body-md opacity-90 max-w-lg">Top the leaderboard before the clock runs out. Gold, Gems, Premium and more for the winners.</p>
    </section>
    <AdSlot placement="tournaments" />
    <template v-for="[label, items] in groups" :key="label">
      <section v-if="items.length" class="space-y-3">
        <h2 class="text-headline-sm">{{ label }}</h2>
        <div class="grid sm:grid-cols-2 gap-4"><TournamentCard v-for="t in items" :key="t.id" :t="t" /></div>
      </section>
    </template>
    <p v-if="!list.length" class="card p-6 text-center text-body-md text-on-surface-variant">No tournaments right now — check back soon.</p>
  </div>
</template>
