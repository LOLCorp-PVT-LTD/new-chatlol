<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Arena } from '@chatlol/shared';
import Domino from './Domino.vue';
import PlayerStrip from './PlayerStrip.vue';

/** Dominoes table: the line of play (new tiles pop in at the ends), your hand, draw / pass. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type DState = { line: [number, number][]; ends: [number, number] | null; hand: [number, number][]; handCounts: number[]; boneyardCount: number; plays: { tile: number; side: 'left' | 'right' }[]; turn: number; last: { seat: number; played?: [number, number]; drew?: boolean; passed?: boolean } | null; result: unknown };
const st = computed(() => props.arena.state as unknown as DState);
const sel = ref<number | null>(null);
const playable = computed(() => new Set(st.value.plays.map((p) => p.tile)));
const sidesFor = (t: number) => st.value.plays.filter((p) => p.tile === t).map((p) => p.side);
function pick(t: number) {
  if (!props.myTurn || !playable.value.has(t)) return;
  const sides = sidesFor(t);
  if (sides.length === 1 || !st.value.ends) return play(t, sides[0] ?? 'right');
  sel.value = t;
}
function play(tile: number, side: 'left' | 'right') {
  sel.value = null;
  emit('move', { type: 'play', tile, side });
}
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <div class="space-y-4">
      <section class="rounded-[28px] p-5 min-h-[200px] bg-[radial-gradient(circle_at_50%_40%,#2f6b4f,#173d2c)] shadow-float overflow-x-auto">
        <div class="flex items-center gap-1 min-w-max mx-auto w-fit">
          <button v-if="sel != null" class="end-btn" @click="play(sel, 'left')">⬅ here</button>
          <TransitionGroup name="tile">
            <Domino v-for="(t, i) in st.line" :key="`${t[0]}-${t[1]}-${i === 0 ? 'l' : i}`" :a="t[0]" :b="t[1]" :vertical="t[0] === t[1]" :size="30" />
          </TransitionGroup>
          <button v-if="sel != null" class="end-btn" @click="play(sel, 'right')">here ➡</button>
        </div>
        <p v-if="!st.line.length" class="text-center text-white/70 text-body-md mt-12">The first tile starts the line.</p>
        <p class="text-white/70 text-label-sm text-center mt-4">Boneyard: {{ st.boneyardCount }} tiles</p>
      </section>
      <section v-if="arena.mySeat != null" class="card p-4">
        <p class="label mb-2">Your hand</p>
        <div class="flex flex-wrap gap-2">
          <button v-for="(t, i) in st.hand" :key="`${t[0]}${t[1]}`" type="button" class="transition hover:-translate-y-1" :class="{ 'opacity-40': myTurn && !playable.has(i) }" @click="pick(i)">
            <Domino :a="t[0]" :b="t[1]" vertical :size="30" :glow="myTurn && playable.has(i)" />
          </button>
        </div>
        <div v-if="myTurn && !st.plays.length" class="mt-3">
          <button v-if="st.boneyardCount" class="btn-primary h-10" @click="emit('move', { type: 'draw' })">Draw a tile</button>
          <button v-else class="btn-secondary h-10" @click="emit('move', { type: 'pass' })">Pass</button>
        </div>
      </section>
    </div>
    <PlayerStrip :arena="arena" :extra="(s) => `${st.handCounts[s]} tiles`" />
  </div>
</template>

<style scoped>
.end-btn { color: #fff; background: rgba(255, 255, 255, 0.18); border-radius: 999px; padding: 6px 10px; font-size: 12px; animation: bob 1s ease-in-out infinite; }
@keyframes bob { 50% { transform: translateY(-3px); } }
.tile-enter-active { transition: all 0.35s cubic-bezier(0.3, 1.4, 0.5, 1); }
.tile-enter-from { opacity: 0; transform: scale(0.4) rotate(-20deg); }
</style>
