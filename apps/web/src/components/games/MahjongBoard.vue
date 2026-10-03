<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Arena } from '@chatlol/shared';
import { MAHJONG_SLOTS, mahjongFree } from '@chatlol/shared';
import Avatar from '../Avatar.vue';
import { useNow } from './useServerClock';

/** Mahjong Race: your own layout of stacked tiles. Free tiles light up; matched pairs fly away. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type M = { faces: string[]; board: boolean[]; pairs: number[]; endsAt: number };
const st = computed(() => props.arena.state as unknown as M);
const now = useNow(2);
const sel = ref<number | null>(null);
const shake = ref<number | null>(null);
const free = computed(() => new Set(st.value.board.map((p, i) => i).filter((i) => mahjongFree(st.value.board, i))));
const total = MAHJONG_SLOTS.length / 2;
function tap(i: number) {
  if (props.arena.mySeat == null || !free.value.has(i)) return;
  if (sel.value === null || sel.value === i) return void (sel.value = sel.value === i ? null : i);
  if (st.value.faces[sel.value] === st.value.faces[i]) emit('move', { type: 'pair', a: sel.value, b: i });
  else {
    shake.value = i;
    setTimeout(() => (shake.value = null), 400);
  }
  sel.value = null;
}
const left = computed(() => Math.max(0, Math.ceil((st.value.endsAt - now.value) / 1000)));
// Draw order: lower layers first, then left-to-right so the 3D edges overlap correctly.
const order = computed(() => MAHJONG_SLOTS.map((s, i) => ({ ...s, i })).sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x));
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <section class="card p-4">
      <p class="text-center text-label-lg mb-2">⏱ {{ Math.floor(left / 60) }}:{{ String(left % 60).padStart(2, '0') }} · {{ st.pairs[arena.mySeat ?? 0] }}/{{ total }} pairs</p>
      <div class="relative mx-auto select-none" style="width: min(100%, 560px); aspect-ratio: 8.6 / 7.2">
        <TransitionGroup name="tile">
          <button v-for="t in order.filter((o) => st.board[o.i])" :key="t.i" type="button" class="mtile" :class="{ free: free.has(t.i), sel: sel === t.i, shake: shake === t.i }"
            :style="{ left: `${(t.x / 8.6) * 100 + t.z * 0.9}%`, top: `${(t.y / 7.2) * 100 - t.z * 1.4}%`, zIndex: t.z * 100 + t.y * 10 + t.x }" @click="tap(t.i)">
            <span>{{ st.faces[t.i] }}</span>
          </button>
        </TransitionGroup>
      </div>
    </section>
    <aside class="card p-4 space-y-3">
      <p class="label">Race</p>
      <div v-for="(p, i) in arena.players" :key="p.id" class="space-y-1">
        <div class="flex items-center gap-2"><Avatar :user="p" :size="26" :show-online="false" /><span class="flex-1 text-label-md truncate">{{ p.displayName }}</span><span class="text-label-sm">{{ st.pairs[i] }}/{{ total }}</span></div>
        <div class="h-2 rounded-full bg-surface-container-low overflow-hidden"><div class="h-full bg-sunset transition-[width] duration-500" :style="{ width: `${(st.pairs[i] / total) * 100}%` }" /></div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.mtile {
  position: absolute; width: 11.2%; height: 13.4%;
  display: grid; place-items: center; font-size: clamp(18px, 4.2vw, 34px); line-height: 1;
  background: linear-gradient(160deg, #fffdf6, #efe6d2); border-radius: 8px;
  box-shadow: 3px 4px 0 #c9b98f, 4px 6px 8px rgba(0, 0, 0, 0.3);
  filter: brightness(0.82); transition: transform 0.15s, filter 0.2s, box-shadow 0.2s;
}
.mtile.free { filter: none; cursor: pointer; }
.mtile.free:hover { transform: translateY(-3px); }
.mtile.sel { box-shadow: 0 0 0 3px rgb(var(--c-flame)), 3px 4px 0 #c9b98f; transform: translateY(-5px); }
.mtile.shake { animation: shake 0.35s; }
@keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
.tile-leave-active { transition: all 0.45s cubic-bezier(0.5, 0, 0.75, 0); }
.tile-leave-to { opacity: 0; transform: translateY(-60px) scale(0.6) rotate(15deg); }
</style>
