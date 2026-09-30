<script setup lang="ts">
defineProps<{ emoji?: string; title: string; body?: string }>();
</script>
<template>
  <div class="text-center py-14 px-6">
    <div class="text-5xl mb-3">{{ emoji ?? '🌅' }}</div>
    <h3 class="text-headline-sm">{{ title }}</h3>
    <p v-if="body" class="text-body-md text-on-surface-variant mt-1 max-w-xs mx-auto">{{ body }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
