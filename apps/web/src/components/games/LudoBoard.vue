<script setup lang="ts">
import { computed } from 'vue';
import type { Arena } from '@chatlol/shared';
import { LUDO_HOME, LUDO_SAFE, ludoCorner } from '@chatlol/shared';
import Dice from './Dice.vue';
import PlayerStrip from './PlayerStrip.vue';

/** Ludo on a 15×15 cross board. Tokens glide square to square; movable tokens pulse on your turn. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type LudoState = { tokens: number[][]; turn: number; phase: 'roll' | 'move'; die: number | null; movable: number[]; last: { seat: number; roll?: number; note?: string } | null; n: number; rolls: number };
const st = computed(() => props.arena.state as unknown as LudoState);
const COLORS = ['#ef4444', '#22c55e', '#eab308', '#3b82f6'];
const SOFT = ['#fecaca', '#bbf7d0', '#fef08a', '#bfdbfe'];

// The 52-square track as [row, col], starting at seat 0's start square, going clockwise.
const TRACK: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];
const START = [0, 13, 26, 39];
const HOME_COL: [number, number][][] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
];
const BASE_ORIGIN: [number, number][] = [[0, 0], [0, 9], [9, 9], [9, 0]];
const BASE_SLOTS: [number, number][] = [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]];
// Seat order around the board: 2 players sit opposite each other.
const corner = (seat: number) => ludoCorner(st.value.n, seat);

function cell(seat: number, p: number, t: number): [number, number] {
  const c = corner(seat);
  if (p === -1) return [BASE_ORIGIN[c][0] + BASE_SLOTS[t][0], BASE_ORIGIN[c][1] + BASE_SLOTS[t][1]];
  if (p >= LUDO_HOME) return [7 + (t % 2) * 0.35 - 0.17, 7 + Math.floor(t / 2) * 0.35 - 0.17];
  if (p > 50) return HOME_COL[c][p - 51];
  return TRACK[(START[c] + p) % 52];
}
const squares = computed(() => {
  const out: { r: number; c: number; bg: string; star: boolean }[] = [];
  TRACK.forEach(([r, c], i) => out.push({ r, c, bg: START.includes(i) ? SOFT[START.indexOf(i)] : '#fffaf5', star: LUDO_SAFE.has(i) && !START.includes(i) }));
  HOME_COL.forEach((col, k) => col.forEach(([r, c]) => out.push({ r, c, bg: COLORS[k], star: false })));
  return out;
});
const tokens = computed(() =>
  st.value.tokens.flatMap((ts, seat) => ts.map((p, t) => ({ seat, t, p, pos: cell(seat, p, t), movable: props.myTurn && st.value.phase === 'move' && seat === st.value.turn && st.value.movable.includes(t) }))),
);
const pct = (v: number) => `${(v / 15) * 100}%`;
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <div class="card p-3">
      <div class="relative aspect-square w-full max-w-[600px] mx-auto rounded-xl overflow-hidden bg-[#fff3e6] shadow-inner select-none">
        <div v-for="k in 4" :key="'b' + k" class="absolute rounded-xl" :style="{ top: pct(BASE_ORIGIN[k - 1][0]), left: pct(BASE_ORIGIN[k - 1][1]), width: pct(6), height: pct(6), background: COLORS[k - 1] }">
          <div class="absolute inset-[16%] rounded-lg bg-white/90" />
        </div>
        <div v-for="(q, i) in squares" :key="i" class="absolute border border-black/10 flex items-center justify-center text-[10px]" :style="{ top: pct(q.r), left: pct(q.c), width: pct(1), height: pct(1), background: q.bg }">{{ q.star ? '★' : '' }}</div>
        <div class="absolute" :style="{ top: pct(6), left: pct(6), width: pct(3), height: pct(3), background: `conic-gradient(${COLORS[1]} 0 25%, ${COLORS[2]} 0 50%, ${COLORS[3]} 0 75%, ${COLORS[0]} 0)`, clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' }" />
        <button v-for="tk in tokens" :key="`${tk.seat}-${tk.t}`" type="button" class="token absolute" :class="{ movable: tk.movable }"
          :style="{ top: pct(tk.pos[0] + 0.12), left: pct(tk.pos[1] + 0.12), width: pct(0.76), height: pct(0.76), '--tk': COLORS[corner(tk.seat)] }"
          :disabled="!tk.movable" :aria-label="`Token ${tk.t + 1}`" @click="emit('move', { type: 'move', token: tk.t })" />
      </div>
      <div class="flex items-center justify-center gap-4 mt-3">
        <Dice :value="st.die ?? st.last?.roll ?? null" :roll-key="st.rolls" :size="54" />
        <button v-if="myTurn && st.phase === 'roll'" class="btn-primary h-11" @click="emit('move', { type: 'roll' })">Roll</button>
        <p v-else-if="myTurn" class="text-label-lg text-primary">Tap a glowing token</p>
        <p v-if="st.last?.note" class="text-body-sm text-on-surface-variant">{{ st.last.note }}</p>
      </div>
    </div>
    <PlayerStrip :arena="arena" :labels="arena.players.map((_, s) => ['🔴 Red', '🟢 Green', '🟡 Yellow', '🔵 Blue'][corner(s)])" :extra="(s) => `${st.tokens[s].filter((p) => p >= LUDO_HOME).length}/4 home`" />
  </div>
</template>

<style scoped>
.token {
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff 0 12%, var(--tk) 40%);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.35), inset 0 -3px 0 rgba(0, 0, 0, 0.2);
  transition: top 0.45s cubic-bezier(0.3, 0.8, 0.3, 1), left 0.45s cubic-bezier(0.3, 0.8, 0.3, 1);
  z-index: 2;
}
.token.movable { animation: pulse 1s ease-in-out infinite; cursor: pointer; z-index: 3; }
@keyframes pulse { 50% { transform: scale(1.18); box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.8), 0 4px 10px rgba(0, 0, 0, 0.4); } }
</style>
