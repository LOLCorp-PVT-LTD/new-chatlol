<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Arena } from '@chatlol/shared';
import Avatar from '../Avatar.vue';
import { useNow } from './useServerClock';

/** Word Race: tap letter tiles (or type) to build a word, submit, beat it before the timer runs out. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type W = { round: number; total: number; phase: 'play' | 'reveal'; endsAt: number; letters: string[]; myWord: string | null; submitted: number[]; scores: number[]; lastRound: { words: Record<string, string>; gained: number[] } | null };
const st = computed(() => props.arena.state as unknown as W);
const now = useNow(10);
const picked = ref<number[]>([]);
watch(() => st.value.round, () => (picked.value = []));
const word = computed(() => picked.value.map((i) => st.value.letters[i]).join(''));
const left = computed(() => Math.max(0, st.value.endsAt - now.value));
function tap(i: number) {
  if (st.value.phase !== 'play') return;
  const k = picked.value.indexOf(i);
  if (k >= 0) picked.value.splice(k, 1);
  else picked.value.push(i);
}
function submit() {
  if (word.value.length < 3) return;
  emit('move', { type: 'word', word: word.value });
  picked.value = [];
}
function shuffle() {
  picked.value = [];
  st.value.letters.sort(() => Math.random() - 0.5);
}
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <section class="card p-5 space-y-4 text-center">
      <p class="text-label-md text-on-surface-variant">Round {{ st.round + 1 }}/{{ st.total }} · {{ st.phase === 'play' ? `${Math.ceil(left / 1000)}s` : 'Results' }}</p>
      <div class="h-2 rounded-full bg-surface-container-low overflow-hidden"><div class="h-full bg-sunset" :style="{ width: `${Math.min(100, (left / (st.phase === 'play' ? 45000 : 5000)) * 100)}%` }" /></div>
      <div class="min-h-[64px] flex justify-center gap-1.5 flex-wrap">
        <TransitionGroup name="ltr"><span v-for="(i, k) in picked" :key="i" class="tile picked" @click="picked.splice(k, 1)">{{ st.letters[i] }}</span></TransitionGroup>
      </div>
      <div class="flex justify-center gap-2 flex-wrap">
        <button v-for="(l, i) in st.letters" :key="st.round + '-' + i" type="button" class="tile" :class="{ used: picked.includes(i) }" :disabled="st.phase !== 'play' || arena.mySeat == null" @click="tap(i)">{{ l }}</button>
      </div>
      <div v-if="st.phase === 'play' && arena.mySeat != null" class="flex justify-center gap-2">
        <button class="btn-secondary h-11" @click="shuffle">Shuffle</button>
        <button class="btn-primary h-11" :disabled="word.length < 3" @click="submit">Submit {{ word || 'word' }}</button>
      </div>
      <p v-if="st.myWord" class="text-body-md">Your best: <b class="tracking-widest">{{ st.myWord }}</b> ({{ st.myWord.length }})</p>
      <div v-if="st.phase === 'reveal' && st.lastRound" class="grid sm:grid-cols-2 gap-2 text-left">
        <div v-for="(p, i) in arena.players" :key="p.id" class="rounded-md bg-surface-container-low p-2 flex items-center gap-2 animate-pop">
          <Avatar :user="p" :size="26" :show-online="false" /><span class="flex-1 truncate text-label-md">{{ p.displayName }}</span>
          <b class="tracking-widest">{{ st.lastRound.words[i] ?? '—' }}</b><span class="text-label-sm text-primary">+{{ st.lastRound.gained[i] }}</span>
        </div>
      </div>
    </section>
    <aside class="card p-4 space-y-2">
      <p class="label">Scores</p>
      <div v-for="(p, i) in arena.players" :key="p.id" class="flex items-center gap-2"><Avatar :user="p" :size="28" :show-online="false" /><span class="flex-1 truncate text-label-lg">{{ p.displayName }}</span>
        <span v-if="st.phase === 'play' && st.submitted.includes(i)" class="text-label-sm text-primary">✓</span><span class="font-semibold tabular-nums">{{ st.scores[i] }}</span></div>
    </aside>
  </div>
</template>

<style scoped>
.tile { width: 52px; height: 56px; border-radius: 12px; display: grid; place-items: center; font-size: 26px; font-weight: 600; background: linear-gradient(180deg, #fff7e0, #f6d48a); color: #3b2a00; box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.15); transition: transform 0.15s, opacity 0.2s; }
.tile:not(:disabled):hover { transform: translateY(-3px); }
.tile.used { opacity: 0.3; transform: scale(0.9); }
.tile.picked { background: linear-gradient(180deg, rgb(var(--c-tangerine)), rgb(var(--c-flame))); color: #fff; cursor: pointer; }
.ltr-enter-active { transition: all 0.25s cubic-bezier(0.3, 1.5, 0.5, 1); }
.ltr-enter-from { opacity: 0; transform: translateY(20px) scale(0.6); }
</style>
