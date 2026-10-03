<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, onUpdated, ref } from 'vue';
import Icon from './Icon.vue';

/**
 * A horizontally scrolling row (tabs, chips) with ‹ › buttons and soft edge fades whenever it overflows. The mouse
 * wheel scrolls it sideways, and the active item (`.chip-active`, `.is-on` or `[aria-current]`) is kept in view.
 */
defineProps<{ innerClass?: string }>();
const row = ref<HTMLElement>();
const canLeft = ref(false);
const canRight = ref(false);

function measure() {
  const el = row.value;
  if (!el) return;
  canLeft.value = el.scrollLeft > 2;
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
}
function by(dir: -1 | 1) {
  const el = row.value;
  if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
}
function onWheel(e: WheelEvent) {
  const el = row.value;
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  el.scrollLeft += e.deltaY;
}
let lastActive: Element | null = null;
function revealActive() {
  const a = row.value?.querySelector('.chip-active, .is-on, [aria-current="page"], [aria-selected="true"]');
  if (a && a !== lastActive) {
    lastActive = a;
    a.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}
let ro: ResizeObserver | undefined;
onMounted(async () => {
  await nextTick();
  measure();
  revealActive();
  ro = new ResizeObserver(measure);
  if (row.value) ro.observe(row.value);
});
onUpdated(() => { measure(); revealActive(); });
onUnmounted(() => ro?.disconnect());
</script>

<template>
  <div class="relative group/row">
    <div ref="row" class="flex overflow-x-auto scrollbar-none scroll-smooth" :class="innerClass ?? 'gap-2'"
      :style="{ maskImage: `linear-gradient(90deg, ${canLeft ? 'transparent 0, #000 48px' : '#000 0'}, ${canRight ? '#000 calc(100% - 48px), transparent 100%' : '#000 100%'})` }"
      @scroll.passive="measure" @wheel="onWheel">
      <slot />
    </div>
    <Transition name="fade">
      <button v-if="canLeft" type="button" class="arrow left-0" aria-label="Scroll left" @click="by(-1)"><Icon name="chevron_left" :size="18" /></button>
    </Transition>
    <Transition name="fade">
      <button v-if="canRight" type="button" class="arrow right-0" aria-label="Scroll right" @click="by(1)"><Icon name="chevron_right" :size="18" /></button>
    </Transition>
  </div>
</template>

<style scoped>
.arrow {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
  width: 32px; height: 32px; border-radius: 9999px; display: grid; place-items: center;
  color: rgb(var(--c-on-surface));
  background: rgb(var(--c-surface-container-lowest) / 0.8);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  border: 1px solid rgb(255 255 255 / 0.35);
  box-shadow: 0 4px 14px -4px rgb(0 0 0 / 0.35);
  transition: transform 0.15s;
}
[data-theme='dark'] .arrow { border-color: rgb(255 255 255 / 0.1); }
.arrow:hover { transform: translateY(-50%) scale(1.08); }
</style>
