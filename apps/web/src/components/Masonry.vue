<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Masonry: cards keep their own height and each one settles into the shortest column, so a short card next to a
 * tall one never leaves a hole underneath it. Every child spans as many 4px grid rows as its real height needs;
 * the grid's dense auto-placement then drops the next card wherever there's room. Heights are re-measured
 * whenever a card changes size (images loading, new shouts, rating results…). One column on phones.
 */
const props = withDefaults(defineProps<{ gap?: number }>(), { gap: 24 });
const el = ref<HTMLElement>();
const ROW = 4;
let resize: ResizeObserver | null = null;
let mutate: MutationObserver | null = null;

function fit(item: HTMLElement) {
  const h = item.getBoundingClientRect().height;
  item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((h + props.gap) / ROW))}`;
}
function watchChildren() {
  if (!el.value || !resize) return;
  resize.disconnect();
  for (const c of Array.from(el.value.children) as HTMLElement[]) {
    resize.observe(c);
    fit(c);
  }
}
onMounted(() => {
  resize = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target as HTMLElement)));
  mutate = new MutationObserver(watchChildren); // cards added or removed (v-if)
  if (el.value) mutate.observe(el.value, { childList: true });
  watchChildren();
});
onBeforeUnmount(() => {
  resize?.disconnect();
  mutate?.disconnect();
});
</script>

<template>
  <div ref="el" class="masonry" :style="{ columnGap: `${gap}px`, marginBottom: `${-gap}px` }"><slot /></div>
</template>

<style scoped>
.masonry { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 4px; grid-auto-flow: row dense; align-items: start; }
@media (min-width: 768px) { .masonry { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* Cards keep their natural height; the spacing below each one comes from its row span. */
.masonry > :deep(*) { align-self: start; min-width: 0; }
</style>
