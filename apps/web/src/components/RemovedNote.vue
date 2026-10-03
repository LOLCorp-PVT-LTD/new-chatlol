<script setup lang="ts">
/** Placeholder left where staff removed something: "This shout was removed by Admin for spam". */
defineProps<{ what: string; removed: { by: string; reason: string } }>();
</script>
<template>
  <p class="flex items-center gap-2 rounded-md border border-dashed border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">
    <span aria-hidden="true">🛡️</span>
    <span>This {{ what }} was removed by {{ removed.by === 'admin' ? 'Admin' : removed.by }} for <b class="font-semibold">{{ removed.reason }}</b>.</span>
  </p>
</template>
