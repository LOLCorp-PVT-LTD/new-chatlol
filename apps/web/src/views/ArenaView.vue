<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { HotTake } from '@chatlol/shared';
import { arenaOdds, compact, ARENA_MIN_STAKE } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { buzz, ding } from '../lib/fx';
import Countdown from '../components/Countdown.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import Empty from '../components/Empty.vue';

const s = useSession();
const takes = ref<HotTake[]>([]);
const pool = ref(0);
const myStaked = ref(0);
const stake = ref(10);
const busy = ref<string | null>(null);
const proposing = ref(false);
const draft = ref({ category: 'LIFESTYLE', statement: '' });
const CATS = ['LIFESTYLE', 'FOOD', 'MUSIC', 'GAMING', 'TECH', 'STREETWEAR', 'MOVIES', 'SPORTS'];

async function load() {
  const r = await api.hotTakes();
  takes.value = r.takes;
  pool.value = r.pool;
  myStaked.value = r.myStaked;
}
onMounted(load);

async function place(t: HotTake, side: 'agree' | 'disagree') {
  if (!s.user) return s.toast({ kind: 'info', title: 'Join to stake Sparks 🔥' });
  busy.value = t.id + side;
  try {
    const r = await api.stake(t.id, side, stake.value);
    takes.value = takes.value.map((x) => (x.id === t.id ? r.take : x));
    s.user.sparks = r.sparks;
    myStaked.value += stake.value;
    pool.value += stake.value;
    ding('reward'); buzz(20);
    s.toast({ kind: 'reward', title: `Staked ${stake.value} on ${side.toUpperCase()}`, body: `Potential ${Math.round(stake.value * arenaOdds(r.take.agreePool, r.take.disagreePool)[side])} ✦` });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = null; }
}

async function propose() {
  try {
    const r = await api.proposeTake(draft.value);
    takes.value.unshift(r.take);
    proposing.value = false;
    draft.value.statement = '';
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>

<template>
  <div class="max-w-[640px] mx-auto space-y-5">
    <section class="rounded-lg bg-inverse-surface text-inverse-on-surface p-6 shadow-float relative overflow-hidden">
      <div class="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-flame/40 blur-3xl" />
      <p class="text-label-md flex items-center gap-2"><Icon name="stars" class="text-secondary-container" fill /> Midnight Mega Vault</p>
      <p class="label !text-inverse-on-surface/60 mt-4">Hot Take Gauntlet Pool</p>
      <p class="text-headline-xl">{{ compact(pool) }} <span class="text-headline-sm text-secondary-container">SPARKS</span></p>
      <div class="grid grid-cols-2 gap-3 mt-4">
        <div class="rounded-md bg-white/10 p-3"><p class="text-label-sm opacity-70">YOUR STAKED</p><p class="text-headline-sm">🪙 {{ myStaked }}</p></div>
        <div class="rounded-md bg-white/10 p-3"><p class="text-label-sm opacity-70">WALLET</p><p class="text-headline-sm">✦ {{ s.user?.sparks ?? 0 }}</p></div>
      </div>
      <p class="text-body-sm opacity-70 mt-4">The crowd (by head-count) decides the winner when the timer hits zero. Winners split the pool. Sparks are for fun — they can’t be cashed out.</p>
    </section>

    <div class="flex items-center gap-2 overflow-x-auto scrollbar-none">
      <span class="label shrink-0">Stake</span>
      <button v-for="n in [ARENA_MIN_STAKE, 10, 25, 50, 100]" :key="n" class="chip" :class="{ 'chip-active': stake === n }" @click="stake = n">🪙 {{ n }}</button>
      <button class="chip ml-auto shrink-0 border-flame text-flame" @click="proposing = true"><Icon name="add" :size="18" /> Propose</button>
    </div>

    <article v-for="t in takes" :key="t.id" class="card p-5" :class="{ 'opacity-60': t.resolved }">
      <div class="flex items-center justify-between text-label-sm">
        <span class="bg-sunlit text-flame rounded-full px-2.5 py-1">{{ t.category }}</span>
        <span class="text-on-surface-variant flex items-center gap-1"><Icon name="group" :size="16" />{{ compact(t.agreeCount + t.disagreeCount) }} locked •
          <template v-if="!t.resolved"><Icon name="timer" :size="16" /><Countdown :to="t.endsAt" /></template><template v-else>Resolved</template></span>
      </div>
      <h3 class="text-headline-md mt-3">{{ t.statement }}</h3>
      <div class="mt-4">
        <div class="flex justify-between text-label-md mb-1.5"><span class="text-flame">AGREE {{ arenaOdds(t.agreePool, t.disagreePool).agreePct }}%</span><span class="text-tertiary">{{ 100 - arenaOdds(t.agreePool, t.disagreePool).agreePct }}% DISAGREE</span></div>
        <div class="h-3 rounded-full bg-tertiary-container/40 overflow-hidden"><div class="h-full bg-sunset rounded-full transition-[width] duration-700" :style="{ width: arenaOdds(t.agreePool, t.disagreePool).agreePct + '%' }" /></div>
      </div>
      <div v-if="t.resolved" class="mt-4 text-center text-label-lg">{{ t.outcome === 'agree' ? '✅ AGREE won' : '❌ DISAGREE won' }}<span v-if="t.myStake"> — you picked {{ t.myStake.side.toUpperCase() }}</span></div>
      <div v-else-if="t.myStake" class="mt-4 rounded-full bg-sunlit text-center py-3 text-label-lg">🔒 {{ t.myStake.amount }} on {{ t.myStake.side.toUpperCase() }} • potential {{ Math.round(t.myStake.amount * arenaOdds(t.agreePool, t.disagreePool)[t.myStake.side]) }} ✦</div>
      <div v-else class="grid grid-cols-2 gap-2 mt-4">
        <button class="btn-primary h-12" :disabled="!!busy" @click="place(t, 'agree')">Agree <span class="opacity-80 text-label-sm">{{ arenaOdds(t.agreePool, t.disagreePool).agree }}x</span></button>
        <button class="btn h-12 bg-tertiary text-white" :disabled="!!busy" @click="place(t, 'disagree')">Disagree <span class="opacity-80 text-label-sm">{{ arenaOdds(t.agreePool, t.disagreePool).disagree }}x</span></button>
      </div>
    </article>
    <Empty v-if="!takes.length" emoji="🌶️" title="No takes on the table" body="Propose the first spicy (but kind) opinion." />

    <Modal v-if="proposing" title="Propose a Hot Take" @close="proposing = false">
      <div class="px-6 pb-6 space-y-3">
        <div class="flex flex-wrap gap-2"><button v-for="c in CATS" :key="c" class="chip" :class="{ 'chip-active': draft.category === c }" @click="draft.category = c">{{ c }}</button></div>
        <textarea v-model="draft.statement" class="textarea" rows="3" maxlength="160" placeholder="e.g. Breakfast for dinner beats dinner for dinner" />
        <p class="text-body-sm text-on-surface-variant">Keep it fun and harmless — no politics or people. Runs for 12 hours.</p>
        <button class="btn-primary w-full" :disabled="draft.statement.length < 10" @click="propose">Throw it in the Arena</button>
      </div>
    </Modal>
  </div>
</template>
