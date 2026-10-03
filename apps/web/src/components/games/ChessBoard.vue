<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Arena, ChessState } from '@chatlol/shared';
import { inCheck, legalMoves } from '@chatlol/shared';
import PlayerStrip from './PlayerStrip.vue';

/** Chess board: tap a piece, then a highlighted square. Black sees the board from their side. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
const st = computed(() => props.arena.state as ChessState);
const flipped = computed(() => props.arena.mySeat === 1);
const squares = computed(() => {
  const out: number[] = [];
  for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) out.push(r * 8 + f);
  return flipped.value ? out.reverse() : out;
});
const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const sel = ref<number | null>(null);
const mySide = computed(() => (props.arena.mySeat === 0 ? 'w' : props.arena.mySeat === 1 ? 'b' : null));
const moves = computed(() => (props.myTurn ? legalMoves(st.value) : []));
const targets = computed(() => new Set(moves.value.filter((m) => m.from === sel.value).map((m) => m.to)));
const checkSq = computed(() => (inCheck(st.value) ? st.value.board.indexOf(`${st.value.turn}K`) : -1));

function tap(i: number) {
  if (!props.myTurn) return;
  if (sel.value != null && targets.value.has(i)) {
    const promo = moves.value.some((m) => m.from === sel.value && m.to === i && m.promo) ? 'Q' : undefined;
    emit('move', { from: sel.value, to: i, promo });
    sel.value = null;
    return;
  }
  sel.value = st.value.board[i]?.[0] === mySide.value ? i : null;
}
const dark = (i: number) => ((i >> 3) + (i & 7)) % 2 === 0;
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <div class="card p-3 sm:p-4">
      <div class="grid grid-cols-8 aspect-square w-full max-w-[560px] mx-auto rounded-md overflow-hidden select-none">
        <button v-for="i in squares" :key="i" type="button" class="relative flex items-center justify-center text-[min(9vw,52px)] leading-none"
          :class="[dark(i) ? 'bg-[#b58863]' : 'bg-[#f0d9b5]', { 'ring-4 ring-inset ring-flame': sel === i, '!bg-[#f6e27f]': st.last && (st.last.from === i || st.last.to === i), '!bg-[#e57373]': checkSq === i }]"
          :aria-label="`square ${i}`" @click="tap(i)">
          <span v-if="st.board[i]" :class="st.board[i]![0] === 'w' ? 'text-white [text-shadow:0_0_2px_#000,0_1px_2px_#000]' : 'text-[#1b1410]'">{{ GLYPH[st.board[i]![1]] }}</span>
          <span v-if="targets.has(i)" class="absolute w-1/3 h-1/3 rounded-full bg-black/25" />
        </button>
      </div>
    </div>
    <PlayerStrip :arena="arena" :labels="['White', 'Black']" />
  </div>
</template>
