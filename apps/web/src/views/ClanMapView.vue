<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { SIEGE, type TerritoryState } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Countdown from '../components/Countdown.vue';

/**
 * The ChatLOL Social Map: the districts clans fight over. Each shows its holder; tap one for its bonus, past owners,
 * recent battles and this Siege's contenders — and officers can send their clan to fight for it.
 */
const s = useSession();
const d = ref<Awaited<ReturnType<typeof api.clanTerritories>> | null>(null);
const picked = ref<string | null>(null);
const load = async () => (d.value = await api.clanTerritories());
onMounted(load);
const sel = computed<TerritoryState | null>(() => d.value?.territories.find((t) => t.key === picked.value) ?? null);
const hue = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
async function fight(key: string) {
  if (!d.value?.myClanId) return;
  try {
    await api.joinSiege(d.value.myClanId, key);
    s.toast({ kind: 'info', title: '🚩 Your clan will fight for this district at the Siege' });
    await load();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>

<template>
  <div class="max-w-[1100px] mx-auto space-y-4">
    <section class="rounded-lg p-5 text-white shadow-float bg-[linear-gradient(135deg,#0b1026,#3b0764_60%,#ff5e00)]">
      <p class="label !text-white/80">Clans</p>
      <h1 class="text-headline-xl">🗺️ The Social Map</h1>
      <p class="text-body-md opacity-90 max-w-2xl mt-1">Districts of ChatLOL, held by clans. Every Saturday 18:00 → Sunday 18:00 UTC is the <b>Siege</b>: the clan earning the most Clan XP at a district takes it (defenders get +{{ SIEGE.defenderPct }}%). Holders get the district’s bonus all week.</p>
      <p v-if="d" class="mt-3 text-label-lg">{{ d.siege.live ? '🔥 Siege live — ends in' : '⏳ Next Siege in' }} <Countdown :to="d.siege.live ? d.siege.endsAt : d.siege.startsAt" /></p>
    </section>

    <div v-if="d" class="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <section class="card p-3">
        <div class="map relative w-full aspect-[16/11] rounded-[22px] overflow-hidden">
          <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path v-for="(t, i) in d.territories" :key="`r${t.key}`" :d="`M50 50 L${t.x} ${t.y}`" stroke="rgba(255,255,255,.12)" stroke-width=".4" stroke-dasharray="1.5 1.5" />
            <circle v-for="(t, i) in d.territories" :key="`g${i}`" :cx="t.x" :cy="t.y" r="13" :fill="t.holder ? `hsl(${hue(t.holder.id)} 80% 55% / .22)` : 'rgba(255,255,255,.04)'" />
          </svg>
          <button v-for="t in d.territories" :key="t.key" type="button" class="district absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1" :class="{ picked: picked === t.key, mine: t.holder?.id === d.myClanId, target: d.myTarget === t.key }" :style="{ left: `${t.x}%`, top: `${t.y}%`, '--h': t.holder ? hue(t.holder.id) : 260 }" @click="picked = t.key">
            <span class="pin text-3xl sm:text-4xl">{{ t.emoji }}</span>
            <span class="tag">{{ t.name }}</span>
            <span class="owner">{{ t.holder ? `${t.holder.emoji} [${t.holder.tag}]` : 'Unclaimed' }}</span>
          </button>
        </div>
        <p class="text-body-sm text-on-surface-variant text-center mt-2">🟣 your clan’s districts glow · 🚩 marks your Siege target</p>
      </section>

      <aside class="card p-5 space-y-3">
        <template v-if="sel">
          <p class="text-headline-md">{{ sel.emoji }} {{ sel.name }}</p>
          <p class="rounded-md bg-surface-container-low px-3 py-2 text-label-md">🎁 {{ sel.label }}</p>
          <div>
            <p class="label">Held by</p>
            <RouterLink v-if="sel.holder" :to="`/clans/${sel.holder.id}`" class="text-label-lg text-primary">{{ sel.holder.emoji }} {{ sel.holder.name }} [{{ sel.holder.tag }}]</RouterLink>
            <p v-else class="text-body-md">Nobody yet — take it at the Siege!</p>
            <p v-if="sel.holder" class="text-body-sm text-on-surface-variant">since {{ new Date(sel.holder.since).toLocaleDateString() }}</p>
          </div>
          <div v-if="sel.contenders.length">
            <p class="label">This Siege</p>
            <p v-for="(x, i) in sel.contenders" :key="x.clanId" class="text-body-md flex gap-2"><span class="w-5">{{ i + 1 }}.</span><RouterLink :to="`/clans/${x.clanId}`" class="flex-1 truncate">{{ x.emoji }} {{ x.name }} <span v-if="x.defending">🛡️</span></RouterLink><span class="tabular-nums">{{ x.score.toLocaleString() }}</span></p>
          </div>
          <button v-if="d.myClanId && d.myTarget !== sel.key && !d.siege.over" class="btn-primary w-full" @click="fight(sel.key)">🚩 Fight for {{ sel.name }}</button>
          <p v-else-if="d.myTarget === sel.key" class="text-label-lg text-primary">🚩 Your clan fights here this Siege</p>
          <p v-else-if="!d.myClanId" class="text-body-sm text-on-surface-variant">Join a clan to fight for districts.</p>
          <div v-if="sel.battles.length">
            <p class="label">Recent battles</p>
            <p v-for="b in sel.battles" :key="b.week" class="text-body-sm">Week {{ b.week }}: <template v-for="(x, i) in b.top" :key="x.clanId">{{ i ? ' · ' : '' }}<b v-if="x.clanId === b.winnerId">🏆 {{ x.tag }}</b><span v-else>{{ x.tag }}</span> {{ x.score.toLocaleString() }}</template></p>
          </div>
          <div v-if="sel.history.length">
            <p class="label">Owners</p>
            <p v-for="(h, i) in sel.history" :key="i" class="text-body-sm"><RouterLink :to="`/clans/${h.clanId}`" class="text-primary">{{ h.emoji }} {{ h.name }}</RouterLink> · {{ new Date(h.from).toLocaleDateString() }} → {{ h.to ? new Date(h.to).toLocaleDateString() : 'now' }}</p>
          </div>
        </template>
        <template v-else>
          <p class="text-headline-sm">Pick a district</p>
          <p v-for="t in d.territories" :key="t.key" class="text-body-sm flex gap-2 cursor-pointer" @click="picked = t.key"><span>{{ t.emoji }}</span><span class="flex-1"><b>{{ t.name }}</b> · {{ t.label }}</span><span class="text-on-surface-variant">{{ t.holder?.tag ?? '—' }}</span></p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.map {
  background:
    radial-gradient(circle at 50% 50%, rgb(255 94 0 / 0.18), transparent 35%),
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px) 0 0 / 6% 8.7%,
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px) 0 0 / 6% 8.7%,
    linear-gradient(160deg, #0b1026, #1b1036 55%, #2a0f2e);
}
.district { color: #fff; transition: transform 0.2s; }
.district:hover, .district.picked { transform: translate(-50%, -50%) scale(1.08); }
.pin { filter: drop-shadow(0 0 10px hsl(var(--h) 90% 60% / 0.7)); }
.tag { font-size: 0.72rem; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: rgb(0 0 0 / 0.45); white-space: nowrap; }
.owner { font-size: 0.66rem; opacity: 0.85; white-space: nowrap; }
.district.mine .tag { background: #7c3aed; box-shadow: 0 0 14px #a855f7; }
.district.target .tag::before { content: '🚩 '; }
.district.picked .tag { outline: 2px solid #fff; }
</style>
