<script setup lang="ts">
import type { Toast } from '../stores/session';
import { useSession } from '../stores/session';
const s = useSession();

/** Toasts: soft rounded cards stacked on the right, a big illustration emoji, title and text, and a close button. */
const LEAD = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;
const TRAIL = /\s*(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)$/u;
const FALLBACK: Record<Toast['kind'], string> = { reward: '✨', error: '⚠️', info: '🔔', level: '🏆' };
/** Uses an emoji from the title as the illustration (and drops it from the text), else one for the kind. */
function parts(t: Toast) {
  const m = t.title.match(LEAD) ?? t.title.match(TRAIL);
  return { art: m?.[1] ?? FALLBACK[t.kind], title: m ? t.title.replace(m[0], ' ').trim() : t.title };
}
</script>
<template>
  <div class="fixed z-[90] top-[max(16px,env(safe-area-inset-top))] right-4 left-4 sm:left-auto sm:w-[400px] space-y-3 pointer-events-none" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in s.toasts" :key="t.id" class="toast pointer-events-auto rounded-[24px] p-5 pr-14 flex items-center gap-4 relative" :class="`toast-${t.kind}`" role="status">
        <span class="text-[44px] leading-none shrink-0 drop-shadow-[0_6px_10px_rgba(0,0,0,.15)] select-none" aria-hidden="true">{{ parts(t).art }}</span>
        <div class="min-w-0 flex-1">
          <p class="toast-title">{{ parts(t).title }}</p>
          <p v-if="t.body" class="toast-body mt-1">{{ t.body }}</p>
          <p v-if="t.sparks || t.xp" class="mt-2 flex gap-2 text-label-md">
            <span v-if="t.sparks" class="toast-chip">+{{ t.sparks }} ✦</span>
            <span v-if="t.xp" class="toast-chip">+{{ t.xp }} XP</span>
          </p>
        </div>
        <button type="button" class="toast-close absolute top-3.5 right-3.5 w-9 h-9 rounded-[10px] flex items-center justify-center" aria-label="Dismiss" @click="s.dismissToast(t.id)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
<style scoped>
.toast {
  background: #ffffff;
  color: #17120e;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 14px 36px -8px rgba(40, 20, 0, 0.16);
}
.toast-title { font-size: 1.05rem; line-height: 1.3; font-weight: 600; letter-spacing: -0.01em; }
.toast-body { font-size: 0.92rem; line-height: 1.45; opacity: 0.78; }
/* Soft tints per kind, like pastel cards. */
.toast-reward { background: #eaf6e4; }
.toast-level { background: #eef0e2; }
.toast-error { background: #fdebe8; }
.toast-chip { background: rgba(0, 0, 0, 0.06); border-radius: 999px; padding: 2px 10px; font-weight: 600; }
.toast-close { border: 1px solid rgba(0, 0, 0, 0.1); background: rgba(255, 255, 255, 0.7); color: #3a302a; }
.toast-close:hover { background: #fff; }
[data-theme='dark'] .toast { background: #241b16; color: #f6ece6; box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5); }
[data-theme='dark'] .toast-reward { background: #1f2b1c; }
[data-theme='dark'] .toast-level { background: #2a2a1c; }
[data-theme='dark'] .toast-error { background: #34201d; }
[data-theme='dark'] .toast-chip { background: rgba(255, 255, 255, 0.1); }
[data-theme='dark'] .toast-close { border-color: rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.06); color: #f6ece6; }
.toast-enter-active, .toast-leave-active { transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.toast-enter-from { opacity: 0; transform: translateX(40px); }
.toast-leave-to { opacity: 0; transform: translateX(40px) scale(0.96); }
@media (prefers-reduced-motion: reduce) { .toast-enter-active, .toast-leave-active { transition: opacity 0.2s; } .toast-enter-from, .toast-leave-to { transform: none; } }
</style>
