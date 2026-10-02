<script setup lang="ts">
import { useSession } from '../stores/session';
const s = useSession();
</script>
<template>
  <div class="fixed z-[90] top-[max(16px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 w-[min(92vw,380px)] space-y-2 pointer-events-none" aria-live="polite">
    <TransitionGroup name="fade">
      <div v-for="t in s.toasts" :key="t.id" class="toast pointer-events-auto rounded-full shadow-float px-4 py-3 flex items-center gap-3" :class="`toast-${t.kind}`">
        <span class="text-xl">{{ t.kind === 'reward' ? '⚡' : t.kind === 'error' ? '⚠️' : '🔔' }}</span>
        <div class="min-w-0 flex-1">
          <p class="text-label-lg truncate">{{ t.title }}</p>
          <p v-if="t.body" class="text-body-sm opacity-90 truncate">{{ t.body }}</p>
        </div>
        <div v-if="t.sparks || t.xp" class="text-right shrink-0 leading-tight">
          <p v-if="t.sparks" class="text-label-lg">+{{ t.sparks }} ✦</p>
          <p v-if="t.xp" class="text-label-sm opacity-90">+{{ t.xp }} XP</p>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
<style scoped>
.toast-info,
.toast-level { background: rgb(var(--c-inverse-surface)); color: rgb(var(--c-inverse-on-surface)); }
.toast-reward { background: linear-gradient(135deg, rgb(var(--c-tangerine)), rgb(var(--c-flame))); color: #fff; }
.toast-error { background: rgb(var(--c-error)); color: #fff; }
/* Dark theme: toasts flip to light cards so they stand out against the dark UI. */
[data-theme='dark'] .toast-info,
[data-theme='dark'] .toast-level,
[data-theme='dark'] .toast-reward { background: #ffffff; color: #251911; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }
[data-theme='dark'] .toast-reward .text-label-lg:last-child,
[data-theme='dark'] .toast-reward p:first-child { color: inherit; }
[data-theme='dark'] .toast-reward { border: 1px solid #ffdbce; }
</style>
