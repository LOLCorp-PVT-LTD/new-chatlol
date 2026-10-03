<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Arena } from '@chatlol/shared';
import Dice from './Dice.vue';
import PlayerStrip from './PlayerStrip.vue';

/** Backgammon board: tap a checker (or the bar), then a highlighted point (or the off tray). */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type Move = { from: 'bar' | number; die: number; to: number | 'off' };
type BG = { points: number[]; bar: [number, number]; off: [number, number]; turn: number; dice: number[]; rolled: [number, number] | null; moves: Move[]; rolls: number; last: { note?: string } | null };
const st = computed(() => props.arena.state as unknown as BG);
const sel = ref<'bar' | number | null>(null);
const mineFrom = computed(() => new Set(props.myTurn ? st.value.moves.map((m) => m.from) : []));
const targets = computed(() => st.value.moves.filter((m) => m.from === sel.value));
// Board layout from white's view: top row 13→24, bottom row 12→1.
const top = Array.from({ length: 12 }, (_, i) => 13 + i);
const bottom = Array.from({ length: 12 }, (_, i) => 12 - i);
function tapPoint(p: number | 'off' | 'bar') {
  if (!props.myTurn) return;
  const m = targets.value.find((x) => x.to === p);
  if (m) {
    sel.value = null;
    return emit('move', { type: 'move', from: m.from, die: m.die });
  }
  if (p !== 'off' && mineFrom.value.has(p)) sel.value = p;
}
const count = (p: number) => Math.abs(st.value.points[p]);
const color = (p: number) => (st.value.points[p] > 0 ? 'w' : 'b');
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <div class="card p-3">
      <div class="board select-none">
        <div v-for="(row, ri) in [top, bottom]" :key="ri" class="row" :class="ri ? 'bottom' : 'top'">
          <button v-for="(p, i) in row" :key="p" type="button" class="point" :class="[(i + ri) % 2 ? 'dark' : 'light', { sel: sel === p, target: targets.some((t) => t.to === p), mid: i === 5 }]" @click="tapPoint(p)">
            <span v-for="k in Math.min(count(p), 5)" :key="k" class="checker" :class="[color(p), { lift: sel === p && k === Math.min(count(p), 5) }]" />
            <span v-if="count(p) > 5" class="more">{{ count(p) }}</span>
          </button>
        </div>
        <button type="button" class="bar" :class="{ sel: sel === 'bar' }" @click="tapPoint('bar')">
          <span v-for="k in st.bar[1]" :key="'b' + k" class="checker b" /><span v-for="k in st.bar[0]" :key="'w' + k" class="checker w" />
        </button>
        <button type="button" class="off" :class="{ target: targets.some((t) => t.to === 'off') }" @click="tapPoint('off')">
          <span class="text-[10px] text-white/80">OFF</span><span class="text-white text-label-md">⚪ {{ st.off[0] }}</span><span class="text-white text-label-md">⚫ {{ st.off[1] }}</span>
        </button>
      </div>
      <div class="flex items-center justify-center gap-3 mt-3">
        <Dice v-for="(d, i) in st.rolled ?? []" :key="i" :value="d" :roll-key="st.rolls" :size="46" />
        <button v-if="myTurn && !st.dice.length" class="btn-primary h-11" @click="emit('move', { type: 'roll' })">Roll</button>
        <p v-else-if="myTurn" class="text-label-md text-on-surface-variant">Dice left: {{ st.dice.join(', ') }}</p>
        <p v-if="st.last?.note" class="text-body-sm text-on-surface-variant">{{ st.last.note }}</p>
      </div>
    </div>
    <PlayerStrip :arena="arena" :labels="['⚪ White', '⚫ Black']" :extra="(s) => `${st.off[s]}/15 off`" />
  </div>
</template>

<style scoped>
.board { position: relative; aspect-ratio: 13 / 10; max-width: 680px; margin: 0 auto; border-radius: 16px; background: #5b3a1e; padding: 12px 52px 12px 12px; display: grid; grid-template-rows: 1fr 1fr; gap: 6%; box-shadow: inset 0 0 0 6px #3e2712; }
.row { display: grid; grid-template-columns: repeat(12, 1fr); }
.point { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; padding-top: 2px; }
.row.bottom .point { flex-direction: column-reverse; padding: 0 0 2px; }
.point.mid { margin-right: 14px; }
.point::before { content: ''; position: absolute; inset: 0 8%; z-index: 0; }
.row.top .point::before { clip-path: polygon(0 0, 100% 0, 50% 92%); }
.row.bottom .point::before { clip-path: polygon(50% 8%, 100% 100%, 0 100%); }
.point.light::before { background: #f3d9b1; }
.point.dark::before { background: #b5532a; }
.point.target::before { background: rgb(var(--c-flame)); animation: glow 0.9s ease-in-out infinite; }
@keyframes glow { 50% { opacity: 0.6; } }
.checker { position: relative; z-index: 1; width: 78%; aspect-ratio: 1; border-radius: 50%; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.25), 0 2px 3px rgba(0, 0, 0, 0.4); transition: transform 0.25s; }
.checker.w { background: radial-gradient(circle at 35% 30%, #fff, #e7e2d8); }
.checker.b { background: radial-gradient(circle at 35% 30%, #5b5b5b, #151515); }
.checker.lift { transform: translateY(-6px) scale(1.08); box-shadow: 0 0 0 3px rgb(var(--c-flame)); }
.more { position: relative; z-index: 1; color: #fff; font-size: 11px; font-weight: 600; }
.bar { position: absolute; left: calc(50% - 26px); top: 12px; bottom: 12px; width: 18px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px; background: #3e2712; border-radius: 6px; }
.bar .checker { width: 16px; }
.off { position: absolute; right: 8px; top: 12px; bottom: 12px; width: 38px; border-radius: 8px; background: #3e2712; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.off.target { box-shadow: 0 0 0 3px rgb(var(--c-flame)); }
.sel { outline: none; }
</style>
