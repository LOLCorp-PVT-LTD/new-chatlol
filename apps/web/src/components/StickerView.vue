<script setup lang="ts">
import { ref } from 'vue';
import type { Sticker } from '@chatlol/shared';

/** An animated sticker. If the animation can't load, it falls back to the still image. */
const props = withDefaults(defineProps<{ sticker: Sticker; size?: number }>(), { size: 128 });
const src = ref(props.sticker.url);
function fallback() {
  if (props.sticker.still && src.value !== props.sticker.still) src.value = props.sticker.still;
}
</script>

<template>
  <img :src="src" :alt="sticker.label || 'Sticker'" :title="sticker.label" :style="{ width: `${size}px`, height: sticker.kind === 'giphy' && sticker.w && sticker.h ? `${Math.round((size * sticker.h) / sticker.w)}px` : `${size}px` }" class="object-contain select-none" loading="lazy" draggable="false" @error="fallback" />
</template>
