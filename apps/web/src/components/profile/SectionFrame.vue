<script setup lang="ts">
import { computed } from 'vue';
import type { ProfileSection } from '@chatlol/shared';
import { sectionDef } from '@chatlol/shared';
import { useProfileCtx } from './context';

/** The box around one section, in the member's chosen style. Text colour follows what's behind it. */
const props = defineProps<{ section: ProfileSection }>();
const ctx = useProfileCtx();
const def = computed(() => sectionDef(props.section.type));
const heading = computed(() => props.section.title || def.value?.label || '');
const showHeading = computed(() => !['spacer', 'quote'].includes(props.section.type) || !!props.section.title);
const tone = computed(() => {
  const st = props.section.style;
  if (st === 'accent') return 'on-dark';
  if (st === 'glass' || st === 'plain') return ctx.darkBg.value ? 'on-dark' : 'on-light';
  return 'themed';
});
const boxStyle = computed(() => {
  const st = props.section.style;
  const accent = ctx.accent.value;
  if (st === 'accent') return { background: accent };
  if (st === 'outline') return { borderColor: accent };
  return {};
});
</script>

<template>
  <section class="sec-frame h-full" :class="[`sec-${section.style}`, `tone-${tone}`, section.type === 'spacer' ? 'sec-spacer' : '']" :style="boxStyle">
    <h2 v-if="showHeading" class="sec-title">{{ heading }}</h2>
    <slot />
  </section>
</template>

<style scoped>
.sec-frame { border-radius: var(--sec-radius, 16px); padding: 18px; min-width: 0; }
.sec-spacer { padding: 0; }
.sec-card { background: rgb(var(--c-surface-container-lowest)); box-shadow: 0 6px 24px rgb(0 0 0 / 0.07); color: rgb(var(--c-on-surface)); }
.sec-outline { background: rgb(var(--c-surface-container-lowest) / 0.85); border-width: 2px; border-style: solid; color: rgb(var(--c-on-surface)); }
.sec-glass { backdrop-filter: blur(18px) saturate(1.3); -webkit-backdrop-filter: blur(18px) saturate(1.3); border: 1px solid rgb(255 255 255 / 0.25); }
.sec-glass.tone-on-dark { background: rgb(0 0 0 / 0.28); }
.sec-glass.tone-on-light { background: rgb(255 255 255 / 0.55); }
.sec-accent { color: #fff; }
.sec-plain { padding-left: 2px; padding-right: 2px; }
.tone-on-dark { color: #fff; }
.tone-on-light { color: #251911; }
.sec-title { font-size: 1.05rem; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.01em; }
/* Secondary text inside any section — readable on every background. */
.sec-frame :deep(.muted) { opacity: 0.72; }
.tone-on-dark :deep(.tile), .tone-on-light :deep(.tile) { background: rgb(255 255 255 / 0.14); }
.tone-on-light :deep(.tile) { background: rgb(0 0 0 / 0.06); }
.tone-themed :deep(.tile) { background: rgb(var(--c-surface-container-low)); }
.sec-accent :deep(.tile) { background: rgb(255 255 255 / 0.18); }
</style>
