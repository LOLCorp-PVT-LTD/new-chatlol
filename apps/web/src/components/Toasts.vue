<script setup lang="ts">
import { useSession } from '../stores/session';
const s = useSession();
</script>
<template>
  <div class="fixed z-[90] top-[max(16px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 w-[min(92vw,380px)] space-y-2 pointer-events-none" aria-live="polite">
    <TransitionGroup name="fade">
      <div v-for="t in s.toasts" :key="t.id" class="pointer-events-auto rounded-full shadow-float px-4 py-3 flex items-center gap-3"
        :class="t.kind === 'error' ? 'bg-error text-white' : t.kind === 'reward' ? 'bg-sunset text-white' : 'bg-inverse-surface text-inverse-on-surface'">
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
