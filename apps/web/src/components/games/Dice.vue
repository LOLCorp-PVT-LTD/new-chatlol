<script setup lang="ts">
import { ref, watch } from 'vue';

/** A 3D-ish die that tumbles whenever its value (or `rollKey`) changes. Click-through unless `selectable`. */
const props = defineProps<{ value: number | null; size?: number; held?: boolean; selectable?: boolean; rollKey?: unknown; color?: string }>();
const emit = defineEmits<{ (e: 'toggle'): void }>();
const rolling = ref(false);
watch(() => [props.value, props.rollKey], () => {
  rolling.value = false;
  requestAnimationFrame(() => (rolling.value = true));
  setTimeout(() => (rolling.value = false), 650);
});
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};
</script>

<template>
  <button type="button" class="die" :class="{ rolling, held, 'cursor-pointer': selectable }" :style="{ width: (size ?? 48) + 'px', height: (size ?? 48) + 'px', '--die': color ?? '#fffaf5' }"
    :disabled="!selectable" :aria-label="`Die showing ${value ?? '?'}${held ? ', held' : ''}`" @click="emit('toggle')">
    <svg viewBox="0 0 100 100" class="w-full h-full">
      <circle v-for="(p, i) in PIPS[value ?? 1] ?? []" v-show="value" :key="i" :cx="p[0]" :cy="p[1]" r="9" :fill="value === 1 ? '#e11d48' : '#1f1a17'" />
      <text v-if="!value" x="50" y="62" text-anchor="middle" font-size="34" fill="#a8a29e">?</text>
    </svg>
    <span v-if="held" class="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold bg-flame text-white rounded-full px-1.5">HOLD</span>
  </button>
</template>

<style scoped>
.die {
  position: relative;
  display: inline-block;
  border-radius: 22%;
  background: linear-gradient(145deg, #ffffff, var(--die));
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.08), 0 6px 14px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s;
}
.die.held { transform: translateY(-6px); box-shadow: 0 0 0 3px rgb(var(--c-flame)), 0 10px 18px rgba(0, 0, 0, 0.2); }
.die.rolling { animation: tumble 0.65s cubic-bezier(0.3, 0.7, 0.4, 1); }
@keyframes tumble {
  0% { transform: translateY(-18px) rotate(-200deg) scale(0.8); }
  60% { transform: translateY(2px) rotate(20deg) scale(1.05); }
  100% { transform: translateY(0) rotate(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) { .die.rolling { animation: none; } }
</style>
