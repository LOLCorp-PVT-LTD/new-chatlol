<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Tournament } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confirmDialog } from '../lib/dialog';
import { confetti } from '../lib/fx';
import TournamentCard from '../components/TournamentCard.vue';
import Avatar from '../components/Avatar.vue';

/** One tournament: banner, rules, prizes, join, and the live leaderboard (refreshes every 15s). */
const route = useRoute();
const s = useSession();
const t = ref<Tournament | null>(null);
const load = async () => (t.value = (await api.tournament(route.params.id as string)).tournament);
let timer: ReturnType<typeof setInterval>;
onMounted(async () => {
  await load();
  timer = setInterval(() => void load(), 15_000);
});
onUnmounted(() => clearInterval(timer));
async function join() {
  if (!t.value) return;
  if (t.value.entryGold && !(await confirmDialog({ title: `Enter ${t.value.title}?`, body: `Entry costs 🪙 ${t.value.entryGold} Gold.`, confirmText: 'Enter' }))) return;
  try {
    t.value = (await api.joinTournament(t.value.id)).tournament;
    confetti();
    s.toast({ kind: 'reward', title: '🏆 You’re in! Good luck' });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
const playLink = computed(() => (t.value?.kind === 'arcade' ? `/arcade/${t.value.game}` : '/games'));
</script>

<template>
  <div v-if="t" class="max-w-[960px] mx-auto space-y-5">
    <TournamentCard :t="t" wide />
    <div class="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
      <section class="card p-5 space-y-4">
        <p v-if="t.description" class="text-body-lg whitespace-pre-line">{{ t.description }}</p>
        <p class="text-body-md text-on-surface-variant">{{ t.kind === 'arcade' ? 'Your best verified score in the game while the tournament is live counts.' : 'Every arena win in this game while the tournament is live counts.' }} Level {{ t.minLevel }}+ to enter.</p>
        <div><p class="label mb-2">Prizes</p>
          <div v-for="p in t.prizes" :key="p.place" class="flex items-center gap-3 py-1.5"><span class="w-8 text-center text-xl">{{ p.place <= 3 ? ['🥇', '🥈', '🥉'][p.place - 1] : `#${p.place}` }}</span><span class="text-body-md">{{ p.text }}</span></div></div>
        <div class="flex gap-2 flex-wrap">
          <button v-if="!t.joined && (t.status === 'live' || t.status === 'upcoming')" class="btn-primary" @click="join">{{ t.entryGold ? `Enter for 🪙 ${t.entryGold}` : 'Enter free' }}</button>
          <RouterLink v-if="t.joined && t.status === 'live'" :to="playLink" class="btn-primary">Play now</RouterLink>
          <span v-if="t.joined" class="chip chip-active">You’re in{{ t.myScore ? ` · ${t.myScore.toLocaleString()}` : '' }}</span>
        </div>
      </section>
      <aside class="card p-4 space-y-2">
        <p class="label">{{ t.status === 'ended' ? 'Final standings' : 'Live leaderboard' }}</p>
        <TransitionGroup name="rank" tag="ol" class="space-y-1.5">
          <li v-for="e in t.board ?? []" :key="e.user.id" class="flex items-center gap-2 rounded-md px-2 py-1.5" :class="e.user.id === s.user?.id ? 'bg-sunlit' : ''">
            <span class="w-6 text-center font-semibold">{{ e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank }}</span>
            <Avatar :user="e.user" :size="28" :show-online="false" /><span class="flex-1 truncate text-label-md">{{ e.user.displayName }}</span>
            <span class="tabular-nums font-semibold">{{ e.score.toLocaleString() }}</span>
          </li>
        </TransitionGroup>
        <p v-if="!t.board?.length" class="text-body-sm text-on-surface-variant">No scores yet.</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.rank-move { transition: transform 0.4s; }
</style>
