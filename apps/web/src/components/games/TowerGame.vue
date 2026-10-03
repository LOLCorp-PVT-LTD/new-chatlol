<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Arena } from '@chatlol/shared';
import { TOWER, towerX } from '@chatlol/shared';
import PlayerStrip from './PlayerStrip.vue';
import { useNow } from './useServerClock';

/**
 * Tower Stack: the block slides over the tower; tap (or press Space) to drop it. Its position is computed from the
 * server's clock, so what you see is what the server judges. The camera rises with the tower.
 */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type T = { stack: { x: number; w: number; seat: number | null }[]; turn: number; out: boolean[]; drops: number[]; turnStartedAt: number; last: { seat: number; perfect?: boolean; miss?: boolean } | null };
const st = computed(() => props.arena.state as unknown as T);
const now = useNow('frame');
const COLORS = ['#ff5e00', '#3b82f6', '#22c55e', '#a855f7'];
const BLOCK_H = 26;
const top = computed(() => st.value.stack.at(-1)!);
const floor = computed(() => st.value.stack.length);
const slideX = computed(() => towerX(top.value.w, floor.value, Math.max(0, now.value - st.value.turnStartedAt)));
const camera = computed(() => Math.max(0, (floor.value - 9) * BLOCK_H));
const drop = () => props.myTurn && emit('move', { type: 'drop' });
const onKey = (e: KeyboardEvent) => e.code === 'Space' && (e.preventDefault(), drop());
onMounted(() => addEventListener('keydown', onKey));
onUnmounted(() => removeEventListener('keydown', onKey));
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <section class="card p-3">
      <div class="relative mx-auto overflow-hidden rounded-[22px] select-none cursor-pointer" style="width: min(100%, 600px); aspect-ratio: 600 / 420; background: linear-gradient(180deg, #1e1b4b, #7c3aed 60%, #f472b6)" @pointerdown="drop">
        <div class="absolute inset-0 transition-transform duration-500" :style="{ transform: `translateY(${camera / 4.2}%)` }">
          <div v-for="(b, i) in st.stack" :key="i" class="absolute block" :class="{ fresh: i === st.stack.length - 1 && i > 0 }"
            :style="{ left: `${(b.x / TOWER.W) * 100}%`, width: `${(b.w / TOWER.W) * 100}%`, bottom: `${(i * BLOCK_H * 100) / 420}%`, height: `${(BLOCK_H * 100) / 420}%`, '--c': b.seat == null ? '#94a3b8' : COLORS[b.seat] }" />
          <div v-if="arena.status === 'playing'" class="absolute block sliding"
            :style="{ left: `${(slideX / TOWER.W) * 100}%`, width: `${(top.w / TOWER.W) * 100}%`, bottom: `${((floor + 1.6) * BLOCK_H * 100) / 420}%`, height: `${(BLOCK_H * 100) / 420}%`, '--c': COLORS[st.turn] }" />
        </div>
        <p class="absolute top-3 left-0 right-0 text-center text-white text-headline-sm drop-shadow">Floor {{ floor - 1 }}<span v-if="st.last?.perfect" class="ml-2 animate-pop">✨ Perfect!</span></p>
        <p v-if="myTurn" class="absolute top-11 left-0 right-0 text-center text-white/90 text-label-md">Tap or press Space to drop</p>
      </div>
    </section>
    <PlayerStrip :arena="arena" :extra="(s) => (st.out[s] ? '💥 out' : `${st.drops[s]} drops`)" />
  </div>
</template>

<style scoped>
.block { border-radius: 4px; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c)); box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.3); }
.block.fresh { animation: land 0.3s cubic-bezier(0.3, 1.6, 0.5, 1); }
.sliding { opacity: 0.95; }
@keyframes land { 0% { transform: translateY(-30%) scaleY(1.1); } 100% { transform: none; } }
</style>
