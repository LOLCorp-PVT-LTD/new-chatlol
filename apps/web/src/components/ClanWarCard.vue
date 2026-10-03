<script setup lang="ts">
import { computed } from 'vue';
import { warModeFor, type ClanWar } from '@chatlol/shared';
import Countdown from './Countdown.vue';

/** One Clan War: the mode, War Points, each front, war missions, races (Bounty / Chaos) and the King of the Hill lead. */
const props = defineProps<{ war: ClanWar; me?: string | null }>();
const mode = computed(() => warModeFor(props.war.mode));
const w = computed(() => props.war);
const side = (id: string) => (id === w.value.a.id ? 'a' : 'b');
const fmt = (key: string, v: number) => (key === 'participation' ? `${Math.round(v * 100)}%` : Math.floor(v).toLocaleString());
const pct = computed(() => {
  const t = w.value.a.score + w.value.b.score;
  return t ? (w.value.a.score / t) * 100 : 50;
});
</script>

<template>
  <div class="rounded-md bg-surface-container-low p-3 space-y-2">
    <div class="flex items-center gap-2 text-label-md text-on-surface-variant">
      <span class="chip h-7">{{ mode.emoji }} {{ mode.name }}</span><span>{{ w.hours }}h</span>
      <span v-if="w.stake">· ✦ {{ w.stake.toLocaleString() }} each</span>
      <span class="flex-1" />
      <template v-if="w.status === 'active'">Ends in <Countdown :to="w.endsAt!" /></template>
      <template v-else-if="w.status === 'pending'">{{ w.incoming ? 'They challenged you' : 'Waiting for them to accept' }}</template>
      <template v-else-if="w.status === 'finished'">{{ w.winnerId ? (me ? (w.winnerId === me ? '🏆 Victory' : 'Defeat') : 'Finished') : 'Draw' }}</template>
      <template v-else>{{ w.status }}</template>
    </div>
    <div class="flex items-center gap-3">
      <RouterLink :to="`/clans/${w.a.id}`" class="flex-1 text-right truncate text-label-lg">{{ w.a.emoji }} {{ w.a.name }} <span v-if="w.kothLead === 'a'">👑</span></RouterLink>
      <span class="tabular-nums font-bold text-headline-sm">{{ w.a.score.toLocaleString() }} – {{ w.b.score.toLocaleString() }}</span>
      <RouterLink :to="`/clans/${w.b.id}`" class="flex-1 truncate text-label-lg"><span v-if="w.kothLead === 'b'">👑</span> {{ w.b.emoji }} {{ w.b.name }}</RouterLink>
    </div>
    <div v-if="w.status !== 'pending'" class="h-2 rounded-full overflow-hidden flex bg-surface-container-high">
      <div class="h-full bg-primary transition-all" :style="{ width: `${pct}%` }" /><div class="h-full flex-1 bg-[#7c3aed]" />
    </div>
    <p class="text-body-sm text-on-surface-variant text-center">{{ mode.desc }} <template v-if="mode.koth">Score = minutes in the lead.</template><template v-else-if="!mode.race">War Points</template></p>

    <!-- Fronts -->
    <div v-if="w.fronts.length && !mode.koth && w.status !== 'pending'" class="space-y-1">
      <div v-for="f in w.fronts" :key="f.key" class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-body-sm">
        <span class="text-right tabular-nums" :class="{ 'font-bold text-primary': f.winner === 'a' }">{{ fmt(f.key, f.a) }}</span>
        <span class="text-center text-label-sm text-on-surface-variant">{{ f.label }}<template v-if="f.weight"> · {{ f.weight }}</template></span>
        <span class="tabular-nums" :class="{ 'font-bold text-[#7c3aed]': f.winner === 'b' }">{{ fmt(f.key, f.b) }}</span>
      </div>
    </div>

    <!-- War missions -->
    <details v-if="mode.cats?.missions && w.status !== 'pending'" class="text-body-sm">
      <summary class="cursor-pointer text-label-md">📜 War missions</summary>
      <p v-for="m in w.missions" :key="m.kind" class="flex gap-2 mt-1"><span class="w-5">{{ w.a.done.includes(m.kind) ? '✅' : '·' }}</span><span class="flex-1 text-center">{{ m.label }}</span><span class="w-5 text-right">{{ w.b.done.includes(m.kind) ? '✅' : '·' }}</span></p>
    </details>

    <!-- Races -->
    <div v-if="mode.race && w.status !== 'pending'" class="space-y-1">
      <div v-for="r in w.races" :key="r.id" class="flex items-center gap-2 text-body-sm rounded-md px-2 py-1" :class="r.claimedBy ? 'bg-surface-container-high' : ''">
        <span class="w-14 text-right tabular-nums" :class="{ 'font-bold text-primary': r.claimedBy === 'a' }">{{ r.claimedBy === 'a' ? '🏁' : Math.min(r.a, r.target) }}</span>
        <span class="flex-1 text-center">{{ r.label }} · <b>{{ r.points }}</b></span>
        <span class="w-14 tabular-nums" :class="{ 'font-bold text-[#7c3aed]': r.claimedBy === 'b' }">{{ r.claimedBy === 'b' ? '🏁' : Math.min(r.b, r.target) }}</span>
      </div>
      <p v-if="w.nextDropAt" class="text-label-sm text-center text-on-surface-variant">🌀 Next objective drops in <Countdown :to="w.nextDropAt" /></p>
    </div>
  </div>
</template>
