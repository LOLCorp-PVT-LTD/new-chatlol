<script setup lang="ts">
import { TIERS } from '@chatlol/shared';
import type { VibeScore } from '@chatlol/shared';
import { buzz, ding } from '../lib/fx';
const props = defineProps<{ modelValue: VibeScore | null; disabled?: boolean; compact?: boolean; showXp?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: VibeScore): void; (e: 'rate', v: VibeScore): void }>();
function pick(v: VibeScore) {
  if (props.disabled) return;
  buzz(v === 5 ? [10, 30, 20] : 10);
  ding('tap');
  emit('update:modelValue', v);
  emit('rate', v);
}
</script>
<template>
  <div class="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Rate this vibe">
    <button v-for="t in TIERS" :key="t.key" type="button" role="radio" :aria-checked="modelValue === t.score" :disabled="disabled"
      @click="pick(t.score)"
      class="group flex flex-col items-center justify-center rounded-[20px] transition-all active:scale-90 disabled:cursor-default"
      :class="[
        compact ? 'py-1.5' : 'py-2.5',
        modelValue === t.score
          ? 'is-on shadow-float scale-105'
          : t.score === 5 ? 'bg-gradient-to-b from-secondary-container/25 to-primary-container/25 text-primary hover:from-secondary-container/40' : 'bg-surface-container-low hover:bg-surface-container text-on-surface',
      ]">
      <span class="transition-transform group-hover:scale-125" :class="compact ? 'text-xl' : 'text-2xl'">{{ t.emoji }}</span>
      <span class="text-label-sm mt-0.5">{{ t.label }}</span>
      <span v-if="showXp" class="text-[10px] font-bold opacity-70">+{{ t.xp }} XP</span>
    </button>
  </div>
</template>
