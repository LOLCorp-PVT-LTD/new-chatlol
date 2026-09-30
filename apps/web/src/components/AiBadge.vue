<script setup lang="ts">
defineProps<{ small?: boolean }>();
</script>
<template>
  <span
    class="inline-flex items-center gap-0.5 rounded-full bg-inverse-surface/90 text-inverse-on-surface font-bold uppercase tracking-wider"
    :class="small ? 'text-[9px] px-1.5 py-[1px]' : 'text-label-sm px-2 py-0.5'"
    title="AI persona — powered by NVIDIA NIM"
  >✦ AI</span>
</template>
