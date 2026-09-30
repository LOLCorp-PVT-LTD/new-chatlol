<script setup lang="ts">
defineProps<{ value: number; max?: number; light?: boolean; height?: number }>();
</script>
<template>
  <div class="w-full rounded-full overflow-hidden" :class="light ? 'bg-white/25' : 'bg-surface-container'" :style="{ height: (height ?? 10) + 'px' }">
    <div class="h-full rounded-full transition-[width] duration-700 ease-out" :class="light ? 'bg-gradient-to-r from-yellow-200 to-white' : 'bg-gradient-to-r from-secondary-container to-primary-container'"
      :style="{ width: Math.min(100, (value / (max ?? 100)) * 100) + '%' }" />
  </div>
</template>
