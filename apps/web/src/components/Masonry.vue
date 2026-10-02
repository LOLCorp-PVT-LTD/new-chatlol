<script setup lang="ts">
import { ref } from 'vue';
import { useMasonry } from '../lib/masonry';

/**
 * Masonry: cards keep their own height and each one settles into the shortest column, so a short card next to a
 * tall one never leaves a hole underneath it. One column on phones.
 */
const props = withDefaults(defineProps<{ gap?: number }>(), { gap: 24 });
const el = ref<HTMLElement>();
useMasonry(el, () => props.gap);
</script>

<template>
  <div ref="el" class="masonry" :style="{ columnGap: `${gap}px`, marginBottom: `${-gap}px` }"><slot /></div>
</template>

<style scoped>
.masonry { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 4px; align-items: start; }
@media (min-width: 768px) { .masonry { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* Cards keep their natural height; the spacing below each one comes from its row span. */
.masonry > :deep(*) { align-self: start; min-width: 0; }
</style>
