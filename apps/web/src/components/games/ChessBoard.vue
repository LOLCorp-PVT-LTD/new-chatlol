<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Arena, ChessState } from '@chatlol/shared';
import { inCheck, legalMoves } from '@chatlol/shared';
import PlayerStrip from './PlayerStrip.vue';
import { useMoveSlide } from './useMoveSlide';

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
// U+FE0E asks for the text (filled) glyphs, not emoji, so every piece renders the same way.
const GLYPH: Record<string, string> = { K: '♚\uFE0E', Q: '♛\uFE0E', R: '♜\uFE0E', B: '♝\uFE0E', N: '♞\uFE0E', P: '♟\uFE0E' };
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
const pieceStyle = useMoveSlide(() => st.value.last, () => squares.value);
const FILES = 'abcdefgh';
</script>

<template>
  <div class="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
    <div class="card p-3 sm:p-5">
      <!-- Fixed 8×8 grid: every square is exactly 1/8 of the board, whatever is on it. Sizes scale with the board (cqw). -->
      <div class="board-frame mx-auto w-full max-w-[min(680px,calc(100dvh-230px))] min-w-[280px]">
        <div class="relative aspect-square w-full [container-type:inline-size] rounded-md overflow-hidden select-none">
          <div class="absolute inset-0 grid grid-cols-8 grid-rows-8">
            <button v-for="(i, pos) in squares" :key="i" type="button" class="relative min-w-0 min-h-0 outline-none"
              :class="[dark(i) ? 'bg-[#b58863]' : 'bg-[#f0d9b5]', myTurn && st.board[i]?.[0] === mySide ? 'cursor-pointer' : '']"
              :aria-label="`${FILES[i & 7]}${(i >> 3) + 1}${st.board[i] ? ` ${st.board[i]}` : ''}`" @click="tap(i)">
              <span v-if="st.last && (st.last.from === i || st.last.to === i)" class="absolute inset-0 bg-[#f7e463]/55" />
              <span v-if="checkSq === i" class="absolute inset-0 bg-[radial-gradient(circle,#ff3b3b_0%,#ff3b3b80_45%,transparent_75%)]" />
              <span v-if="sel === i" class="absolute inset-0 bg-flame/35 shadow-[inset_0_0_0_3px_rgb(var(--c-flame))]" />
              <!-- coordinates on the edge squares -->
              <span v-if="pos % 8 === 0" class="coord top-[0.4cqw] left-[0.6cqw]" :class="dark(i) ? 'text-[#f0d9b5]' : 'text-[#b58863]'">{{ (i >> 3) + 1 }}</span>
              <span v-if="pos >= 56" class="coord bottom-[0.3cqw] right-[0.7cqw]" :class="dark(i) ? 'text-[#f0d9b5]' : 'text-[#b58863]'">{{ FILES[i & 7] }}</span>
              <span v-if="st.board[i]" class="piece absolute inset-0 flex items-center justify-center" :style="pieceStyle(i)">
                <span :class="st.board[i]![0] === 'w' ? 'text-white [text-shadow:0_0_1px_#000,0_0_2px_#000,0_2px_3px_rgb(0_0_0/.45)]' : 'text-[#1b1410] [text-shadow:0_1px_1px_rgb(255_255_255/.25)]'">{{ GLYPH[st.board[i]![1]] }}</span>
              </span>
              <span v-if="targets.has(i)" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span v-if="st.board[i]" class="w-[92%] h-[92%] rounded-full border-[0.7cqw] border-black/25" />
                <span v-else class="w-[30%] h-[30%] rounded-full bg-black/25" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <PlayerStrip :arena="arena" :labels="['White', 'Black']" />
  </div>
</template>

<style scoped>
.board-frame { padding: 1.4%; border-radius: 16px; background: linear-gradient(145deg, #7a5537, #4a3120); box-shadow: inset 0 1px 0 rgb(255 255 255 / .2), 0 18px 40px -18px rgb(0 0 0 / .7); }
.piece { font-size: 9.6cqw; line-height: 1; will-change: transform; font-variant-emoji: text; }
.coord { position: absolute; font-size: 1.7cqw; font-weight: 700; line-height: 1; pointer-events: none; }
</style>
