<script setup lang="ts">
import { computed } from 'vue';
import { appTheme } from '../stores/theme';
import { LOGO_RATIO, MASCOT_RATIO, logoSvg } from '../lib/brandLogo';

/**
 * Brand mark, drawn as inline SVG in the current app theme's colours. `auto` = mascot on phones, full CHATLOL
 * wordmark from `sm` up. `header` caps the wordmark at 130px wide (height follows, aspect ratio kept).
 * Use `onColor` on orange/gradient backgrounds so the wordmark keeps contrast.
 */
const props = withDefaults(defineProps<{ variant?: 'auto' | 'wordmark' | 'mascot'; size?: 'sm' | 'md' | 'lg'; onColor?: boolean; header?: boolean }>(), {
  variant: 'auto',
  size: 'md',
});
const heights = { sm: 28, md: 36, lg: 48 };
const h = computed(() => heights[props.size]);
const wordmark = computed(() => logoSvg(appTheme.value, 'wordmark'));
const mascot = computed(() => logoSvg(appTheme.value, 'mascot'));
const wordStyle = computed(() =>
  props.header
    ? { width: '100%', maxWidth: '130px', aspectRatio: String(LOGO_RATIO), height: 'auto', objectFit: 'contain' as const }
    : { height: `${h.value}px`, width: `${h.value * LOGO_RATIO}px` },
);
</script>
<template>
  <span class="inline-flex items-center select-none" :class="[onColor ? 'bg-white/95 rounded-full px-4 py-2 shadow-float' : '', header && variant !== 'mascot' ? 'sm:w-[130px]' : '']">
    <span v-if="variant !== 'wordmark'" class="block drop-shadow-[0_4px_10px_rgb(var(--c-flame)/0.35)]" :class="variant === 'auto' ? 'sm:hidden' : ''"
      :style="{ height: `${h}px`, width: `${h * MASCOT_RATIO}px` }" v-html="mascot" />
    <span v-if="variant !== 'mascot'" class="block" :class="variant === 'auto' ? 'hidden sm:block' : ''" :style="wordStyle" v-html="wordmark" />
  </span>
</template>
