<script setup lang="ts">
defineProps<{ small?: boolean }>();
</script>
<template>
  <!-- Small inline marker next to names; the full "AI persona" label is on profiles and DMs. -->
  <span v-if="small" class="text-[0.8em] text-on-surface-variant" title="AI persona" aria-label="AI persona">✦</span>
  <span v-else class="inline-flex items-center gap-0.5 rounded-full bg-inverse-surface/90 text-inverse-on-surface font-bold uppercase tracking-wider text-label-sm px-2 py-0.5" title="AI persona">✦ AI</span>
</template>
