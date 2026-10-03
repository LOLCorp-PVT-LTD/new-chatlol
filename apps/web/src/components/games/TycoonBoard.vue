<script setup lang="ts">
import { computed } from 'vue';
import type { Arena, TycoonState } from '@chatlol/shared';
import { TYCOON_BOARD, netWorth } from '@chatlol/shared';
import PlayerStrip from './PlayerStrip.vue';

/** Sunset Tycoon: the 21 tiles around a ring, tokens, owners and houses; roll / buy / build / end turn. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
const st = computed(() => props.arena.state as TycoonState);
const COLORS = ['#ff5e00', '#3fa7e0', '#8f63e8', '#22c55e'];
const GROUP: Record<string, string> = { sand: '#e9c46a', coral: '#ff7f6e', violet: '#9b72e8', lagoon: '#2fb5a7', gold: '#d4a017', flame: '#ff5e00' };
// Lay the tiles around the edge of a 7×6 grid (clockwise from the bottom-right corner). The ring has 22 slots;
// every tile must get one, or the board fails to render at all.
const POS = (() => {
  const out: [number, number][] = [];
  for (let c = 6; c >= 0; c--) out.push([5, c]);
  for (let r = 4; r >= 1; r--) out.push([r, 0]);
  for (let c = 0; c <= 6; c++) out.push([0, c]);
  for (let r = 1; r <= 4; r++) out.push([r, 6]);
  return out.slice(0, TYCOON_BOARD.length);
})();
const me = computed(() => props.arena.mySeat);
const buildable = computed(() =>
  me.value == null ? [] : TYCOON_BOARD.map((t, i) => i).filter((i) => {
    const t = TYCOON_BOARD[i];
    return t.kind === 'property' && st.value.owner[i] === me.value && st.value.houses[i] < 3 && TYCOON_BOARD.every((x, k) => x.group !== t.group || st.value.owner[k] === me.value);
  }),
);
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
    <div class="card p-3">
      <div class="grid grid-cols-7 grid-rows-6 gap-1 aspect-[7/6]">
        <div v-for="(t, i) in TYCOON_BOARD" :key="i" class="rounded-md bg-surface-container-low p-1 text-[10px] leading-tight relative overflow-hidden flex flex-col"
          :style="{ gridRow: POS[i][0] + 1, gridColumn: POS[i][1] + 1, borderTop: t.group ? `6px solid ${GROUP[t.group]}` : undefined, outline: st.owner[i] != null ? `2px solid ${COLORS[st.owner[i]!]}` : undefined }">
          <span class="font-semibold">{{ t.name }}</span>
          <span v-if="t.price" class="opacity-70">{{ t.price }}</span>
          <span v-if="st.houses[i]" class="mt-auto">{{ '🏠'.repeat(st.houses[i]) }}</span>
          <div class="absolute bottom-0.5 right-0.5 flex gap-0.5"><span v-for="(p, s) in st.players" v-show="!p.out && p.pos === i" :key="s" class="w-3 h-3 rounded-full ring-1 ring-white" :style="{ background: COLORS[s] }" /></div>
        </div>
        <div class="row-start-2 row-end-6 col-start-2 col-end-7 rounded-md bg-sunset/10 flex flex-col items-center justify-center text-center p-3 gap-2">
          <p class="text-headline-sm">🏙️ Round {{ st.round }}/{{ st.maxRounds }}</p>
          <p v-if="st.lastRoll" class="text-3xl">🎲 {{ st.lastRoll[0] }} + {{ st.lastRoll[1] }}</p>
          <div v-if="myTurn" class="flex flex-wrap justify-center gap-2">
            <button v-if="st.phase === 'roll'" class="btn-primary h-10" @click="emit('move', { type: 'roll' })">Roll</button>
            <template v-if="st.phase === 'buy' && st.pending != null">
              <button class="btn-primary h-10" @click="emit('move', { type: 'buy' })">Buy {{ TYCOON_BOARD[st.pending].name }} ({{ TYCOON_BOARD[st.pending].price }})</button>
              <button class="btn-secondary h-10" @click="emit('move', { type: 'pass' })">Pass</button>
            </template>
            <button v-if="st.phase === 'end'" class="btn-secondary h-10" @click="emit('move', { type: 'end' })">End turn</button>
          </div>
          <div v-if="myTurn && st.phase !== 'roll' && buildable.length" class="flex flex-wrap justify-center gap-1">
            <button v-for="i in buildable" :key="i" class="chip h-8 text-label-sm" @click="emit('move', { type: 'build', tile: i })">🏠 {{ TYCOON_BOARD[i].name }} (100)</button>
          </div>
          <ul class="text-body-sm text-on-surface-variant max-h-24 overflow-y-auto"><li v-for="(l, k) in [...st.log].reverse().slice(0, 4)" :key="k">{{ l }}</li></ul>
        </div>
      </div>
    </div>
    <PlayerStrip :arena="arena" :labels="st.players.map((_, s) => ['🟠 Orange', '🔵 Blue', '🟣 Purple', '🟢 Green'][s])" :extra="(s) => `💵 ${st.players[s].cash} · worth ${netWorth(st, s)}`" />
  </div>
</template>
