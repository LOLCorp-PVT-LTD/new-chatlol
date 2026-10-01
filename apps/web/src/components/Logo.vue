<script setup lang="ts">
/**
 * Brand mark. `auto` = mascot on phones, full CHATLOL wordmark from `sm` up.
 * Use `onColor` on orange/gradient backgrounds so the orange wordmark keeps contrast.
 */
withDefaults(defineProps<{ variant?: 'auto' | 'wordmark' | 'mascot'; size?: 'sm' | 'md' | 'lg'; onColor?: boolean }>(), { variant: 'auto', size: 'md' });
const heights = { sm: 'h-7', md: 'h-9', lg: 'h-12' };
</script>
<template>
  <span class="inline-flex items-center select-none" :class="onColor ? 'bg-white/95 rounded-full px-4 py-2 shadow-float' : ''">
    <img v-if="variant !== 'wordmark'" src="/brand/mascot.webp" alt="ChatLOL" width="512" height="493"
      :class="[heights[size], 'w-auto drop-shadow-[0_4px_10px_rgba(255,94,0,0.35)]', variant === 'auto' ? 'sm:hidden' : '']" />
    <img v-if="variant !== 'mascot'" src="/brand/wordmark.webp" alt="ChatLOL" width="1000" height="171"
      :class="[heights[size], 'w-auto', variant === 'auto' ? 'hidden sm:block' : '']" />
  </span>
</template>
