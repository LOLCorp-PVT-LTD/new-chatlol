<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string; hint?: string; icon?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
</script>
<template>
  <label class="flex items-center gap-4 px-5 py-3.5 cursor-pointer">
    <span v-if="icon" class="w-10 h-10 rounded-full bg-sunlit text-flame flex items-center justify-center shrink-0"><span class="icon">{{ icon }}</span></span>
    <span class="flex-1 min-w-0"><span class="text-label-lg block">{{ label }}</span><span v-if="hint" class="text-body-sm text-on-surface-variant">{{ hint }}</span></span>
    <button type="button" role="switch" :aria-checked="modelValue" :aria-label="label" class="relative w-[54px] h-8 rounded-full transition-colors shrink-0" :class="modelValue ? 'bg-flame' : 'bg-sandstone'" @click.prevent="emit('update:modelValue', !modelValue)">
      <span class="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all" :class="modelValue ? 'left-[26px]' : 'left-1'" />
    </button>
  </label>
</template>
