<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Arena, CheckersState } from '@chatlol/shared';
import PlayerStrip from './PlayerStrip.vue';
import { useMoveSlide } from './useMoveSlide';

/** Checkers board. The server sends the legal moves (captures are compulsory; multi-jumps keep the same piece). */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
const st = computed(() => props.arena.state as CheckersState);
const flipped = computed(() => props.arena.mySeat === 1);
const squares = computed(() => {
  const out: number[] = [];
  for (let r = 7; r >= 0; r--) for (let c = 0; c < 8; c++) out.push(r * 8 + c);
  return flipped.value ? out.reverse() : out;
});
const moves = computed(() => (props.myTurn ? (st.value.moves ?? []) : []));
const sel = ref<number | null>(null);
watch(() => st.value.chain, (c) => (sel.value = c ?? null), { immediate: true });
const targets = computed(() => new Set(moves.value.filter((m) => m.from === sel.value).map((m) => m.to)));
const movable = computed(() => new Set(moves.value.map((m) => m.from)));
function tap(i: number) {
  if (!props.myTurn) return;
  if (sel.value != null && targets.value.has(i)) return emit('move', { from: sel.value, to: i });
  if (movable.value.has(i)) sel.value = i;
}
const dark = (i: number) => ((i >> 3) + (i & 7)) % 2 === 1;
const pieceStyle = useMoveSlide(() => st.value.last, () => squares.value);
</script>

<template>
  <div class="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
    <div class="card p-3 sm:p-5">
      <div class="mx-auto w-full max-w-[min(680px,calc(100dvh-230px))] min-w-[280px] p-[1.4%] rounded-[16px] bg-gradient-to-br from-[#7a5537] to-[#3a2618] shadow-[0_18px_40px_-18px_rgb(0_0_0/.7)]">
      <div class="relative aspect-square w-full [container-type:inline-size] rounded-md overflow-hidden select-none">
      <div class="absolute inset-0 grid grid-cols-8 grid-rows-8">
        <button v-for="i in squares" :key="i" type="button" class="relative min-w-0 min-h-0 flex items-center justify-center" :class="[dark(i) ? 'bg-[#6b4f3a]' : 'bg-[#efe0c8]', { 'ring-4 ring-inset ring-flame': sel === i, 'ring-2 ring-inset ring-white/50': myTurn && movable.has(i) && sel !== i }]" :aria-label="`square ${i}`" @click="tap(i)">
          <span v-if="st.board[i]" class="absolute inset-0 flex items-center justify-center" :style="pieceStyle(i)"><span class="w-[72%] h-[72%] rounded-full shadow-[inset_0_-4px_0_rgba(0,0,0,.25),0_2px_4px_rgba(0,0,0,.35)] flex items-center justify-center text-[5cqw]"
            :class="st.board[i]!.toLowerCase() === 'r' ? 'bg-[#d64545]' : 'bg-[#2b2b2b]'">{{ st.board[i] === 'R' || st.board[i] === 'B' ? '👑' : '' }}</span></span>
          <span v-if="targets.has(i)" class="absolute w-1/3 h-1/3 rounded-full bg-white/40" />
        </button>
      </div>
      </div>
      </div>
    </div>
    <PlayerStrip :arena="arena" :labels="['Red', 'Black']" />
  </div>
</template>
