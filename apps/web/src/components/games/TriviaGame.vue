<script setup lang="ts">
import { computed } from 'vue';
import type { Arena } from '@chatlol/shared';
import Avatar from '../Avatar.vue';
import { useNow } from './useServerClock';

/** Trivia Blitz: question card, four big answers, a draining timer bar, then the reveal and live scores. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type T = { round: number; total: number; phase: 'question' | 'reveal'; endsAt: number; question: { cat: string; q: string; choices: string[] }; answered: number[]; myAnswer: number | null; scores: number[]; lastRound: { answer: number; gained: number[]; picks: Record<string, number> } | null };
const st = computed(() => props.arena.state as unknown as T);
const now = useNow(10);
const left = computed(() => Math.max(0, st.value.endsAt - now.value));
const pct = computed(() => Math.min(100, (left.value / (st.value.phase === 'question' ? 15000 : 4000)) * 100));
const LETTERS = ['A', 'B', 'C', 'D'];
const COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];
function cls(i: number) {
  const r = st.value.lastRound;
  if (st.value.phase === 'reveal' && r) return i === r.answer ? 'right' : st.value.myAnswer === i ? 'wrong' : 'dim';
  return st.value.myAnswer === i ? 'picked' : '';
}
const ranked = computed(() => props.arena.players.map((p, i) => ({ p, i, score: st.value.scores[i] })).sort((a, b) => b.score - a.score));
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <section class="card p-5 space-y-4 overflow-hidden">
      <div class="flex items-center justify-between text-label-md text-on-surface-variant"><span>{{ st.question.cat }}</span><span>Question {{ st.round + 1 }}/{{ st.total }}</span></div>
      <div class="h-2 rounded-full bg-surface-container-low overflow-hidden"><div class="h-full bg-sunset transition-[width] duration-100 linear" :style="{ width: pct + '%' }" /></div>
      <Transition name="q" mode="out-in"><h2 :key="st.round" class="text-headline-md text-center py-4">{{ st.question.q }}</h2></Transition>
      <div class="grid sm:grid-cols-2 gap-3">
        <button v-for="(c, i) in st.question.choices" :key="st.round + '-' + i" type="button" class="answer" :class="cls(i)" :style="{ '--a': COLORS[i] }"
          :disabled="st.phase !== 'question' || st.myAnswer !== null || arena.mySeat == null" @click="emit('move', { type: 'answer', choice: i })">
          <span class="badge">{{ LETTERS[i] }}</span><span class="flex-1 text-left">{{ c }}</span>
          <span v-if="st.phase === 'reveal' && st.lastRound" class="text-label-sm">{{ Object.values(st.lastRound.picks).filter((x) => x === i).length || '' }}</span>
        </button>
      </div>
      <p class="text-center text-body-sm text-on-surface-variant">{{ st.phase === 'question' ? (st.myAnswer !== null ? 'Locked in — waiting for the others…' : `${Math.ceil(left / 1000)}s`) : 'Next question coming up…' }}</p>
    </section>
    <aside class="card p-4 space-y-2">
      <p class="label">Scores</p>
      <TransitionGroup name="rank" tag="div" class="space-y-2">
        <div v-for="r in ranked" :key="r.p.id" class="flex items-center gap-2">
          <Avatar :user="r.p" :size="30" :show-online="false" />
          <span class="flex-1 truncate text-label-lg">{{ r.p.displayName }}</span>
          <span v-if="st.phase === 'question' && st.answered.includes(r.i)" class="text-label-sm text-primary">✓</span>
          <span v-if="st.phase === 'reveal' && st.lastRound?.gained[r.i]" class="text-label-sm text-green-600 animate-pop">+{{ st.lastRound.gained[r.i] }}</span>
          <span class="tabular-nums font-semibold">{{ r.score }}</span>
        </div>
      </TransitionGroup>
    </aside>
  </div>
</template>

<style scoped>
.answer { display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: 18px; background: rgb(var(--c-surface-container-low)); border: 2px solid transparent; font-size: 16px; transition: transform 0.15s, background 0.3s, border-color 0.3s, opacity 0.3s; }
.answer:not(:disabled):hover { transform: translateY(-2px); border-color: var(--a); }
.answer .badge { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: #fff; background: var(--a); font-weight: 600; }
.answer.picked { border-color: var(--a); background: color-mix(in srgb, var(--a) 14%, transparent); }
.answer.right { background: #22c55e; color: #fff; animation: pop 0.4s; }
.answer.right .badge { background: #fff; color: #22c55e; }
.answer.wrong { background: #ef4444; color: #fff; animation: shake 0.4s; }
.answer.dim { opacity: 0.45; }
@keyframes pop { 50% { transform: scale(1.04); } }
@keyframes shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.q-enter-active, .q-leave-active { transition: all 0.3s; }
.q-enter-from { opacity: 0; transform: translateY(12px); }
.q-leave-to { opacity: 0; transform: translateY(-12px); }
.rank-move { transition: transform 0.4s; }
</style>
