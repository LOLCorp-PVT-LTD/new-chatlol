<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { StoreItem, StoreItemKind } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confetti, ding } from '../lib/fx';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';

const s = useSession();
const items = ref<StoreItem[]>([]);
const odds = ref<Record<string, number>>({});
const tab = ref<StoreItemKind | 'all'>('all');
const won = ref<StoreItem | null>(null);
const buying = ref<string | null>(null);
const chest = ref<{ claimed: boolean; nextAt: string } | null>(null);
const TABS: [StoreItemKind | 'all', string][] = [['all', '✨ All'], ['frame', '⭕ Frames'], ['flair', '🔥 Flairs'], ['theme', '🎨 Themes'], ['banner', '🏙️ Banners'], ['crate', '🎁 Crates'], ['streak_freeze', '🧊 Boosts']];
const rarityStyle: Record<string, string> = { common: 'bg-surface-container text-on-surface-variant', rare: 'bg-sky-100 text-sky-700', epic: 'bg-violet-100 text-violet-700', legendary: 'bg-sunset text-white' };
const shown = computed(() => items.value.filter((i) => tab.value === 'all' || i.kind === tab.value || (tab.value === 'streak_freeze' && i.kind === 'boost')));

async function load() {
  const r = await api.store();
  items.value = r.items;
  odds.value = r.crateOdds;
}
onMounted(load);

async function buy(i: StoreItem) {
  if (!s.user) return;
  buying.value = i.id;
  try {
    const r = await api.buy(i.id);
    s.user.sparks = r.sparks;
    if (r.won) { won.value = r.won; confetti(); ding('level'); } else { ding('reward'); s.toast({ kind: 'reward', title: `${i.emoji} ${i.name} unlocked!` }); }
    await load();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { buying.value = null; }
}
async function equip(i: StoreItem) {
  const key = i.kind as 'frame' | 'flair' | 'theme' | 'banner';
  const r = await api.equip({ [key]: i.equipped ? null : i.id });
  s.applyUser(r.user);
  await load();
}
async function claim() {
  const r = await api.claimDaily();
  chest.value = r;
  if (r.claimed) { s.reward(r.reward); confetti(); } else s.toast({ kind: 'info', title: 'Chest already opened — back tomorrow 🌅' });
}
</script>

<template>
  <div class="max-w-[960px] mx-auto space-y-5">
    <section class="rounded-lg bg-sunset text-white p-6 shadow-float relative overflow-hidden">
      <div class="absolute -right-8 -bottom-12 text-[160px] opacity-20 rotate-12">💎</div>
      <p class="label !text-white/80">Sparks Vault</p>
      <h1 class="text-headline-xl">✦ {{ s.user?.sparks.toLocaleString() ?? 0 }}</h1>
      <p class="text-body-md opacity-90 max-w-md">Earn Sparks by dropping daily, matching the crowd in Roulette and winning Hot Takes. Spend them on flex.</p>
      <button class="btn bg-white text-flame mt-4 shadow-float" @click="claim"><Icon name="redeem" /> Open Daily Sunset Chest</button>
    </section>
    <div class="flex gap-2 overflow-x-auto scrollbar-none pb-1">
      <button v-for="t in TABS" :key="t[0]" class="chip" :class="{ 'chip-active': tab === t[0] }" @click="tab = t[0]">{{ t[1] }}</button>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <div v-for="i in shown" :key="i.id" class="card overflow-hidden flex flex-col">
        <div class="h-28 flex items-center justify-center text-5xl relative" :style="{ background: i.preview }">
          <span class="drop-shadow">{{ i.emoji }}</span>
          <span class="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" :class="rarityStyle[i.rarity]">{{ i.rarity }}</span>
          <span v-if="i.limited" class="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold bg-black/60 text-white">LIMITED</span>
        </div>
        <div class="p-3 flex-1 flex flex-col">
          <p class="text-label-lg">{{ i.name }}</p>
          <p class="text-body-sm text-on-surface-variant flex-1">{{ i.description }}</p>
          <button v-if="i.owned && ['frame', 'flair', 'theme', 'banner'].includes(i.kind)" class="mt-3 h-9" :class="i.equipped ? 'btn-secondary' : 'btn-primary'" @click="equip(i)">{{ i.equipped ? 'Equipped ✓' : 'Equip' }}</button>
          <button v-else class="btn-primary mt-3 h-9" :disabled="!s.user || buying === i.id || (s.user && s.user.sparks < i.price)" @click="buy(i)">✦ {{ i.price.toLocaleString() }}</button>
        </div>
      </div>
    </div>
    <p class="text-body-sm text-on-surface-variant text-center">Loot crate odds: <template v-for="(p, r) in odds" :key="r">{{ r }} {{ Math.round(p * 100) }}% · </template>duplicates convert to 40% Sparks back. Sparks have no cash value.</p>
    <Modal v-if="won" @close="won = null">
      <div class="p-8 text-center">
        <p class="label">You pulled a</p>
        <p class="text-headline-lg uppercase text-gradient">{{ won.rarity }}</p>
        <div class="mx-auto mt-4 w-32 h-32 rounded-lg flex items-center justify-center text-6xl shadow-float animate-pop" :style="{ background: won.preview }">{{ won.emoji }}</div>
        <p class="text-headline-md mt-4">{{ won.name }}</p>
        <button class="btn-primary w-full mt-6" @click="won = null">Nice!</button>
      </div>
    </Modal>
  </div>
</template>
