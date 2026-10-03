<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import type { HomeData } from '@chatlol/shared';
import Icon from './Icon.vue';

/** Floating "Today's Sunset Drop": a glass card pinned under the header with a ring-timer badge. Collapses to a pill. */
const props = defineProps<{ drop: HomeData['drop'] }>();
const KEY = 'chatlol:drop-widget';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const open = ref(read() ? read() === 'open' : window.innerWidth >= 1024);
function toggle() {
  open.value = !open.value;
  try { localStorage.setItem(KEY, open.value ? 'open' : 'closed'); } catch { /* storage blocked */ }
}

const nowMs = ref(Date.now());
const t = setInterval(() => (nowMs.value = Date.now()), 1000);
onUnmounted(() => clearInterval(t));
const left = computed(() => Math.max(0, new Date(props.drop.endsAt).getTime() - nowMs.value));
const parts = computed(() => {
  const s = Math.floor(left.value / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0'));
});
/** Share of the 24-hour drop still to go, for the ring. */
const pct = computed(() => Math.min(100, (left.value / 86_400_000) * 100));
const urgent = computed(() => left.value < 3_600_000);
</script>

<template>
  <div class="fixed z-30 right-3 lg:right-6 top-[calc(env(safe-area-inset-top)+76px)] lg:top-24 pointer-events-none">
    <Transition name="fade" mode="out-in">
      <button v-if="!open" key="pill" class="pointer-events-auto drop-glass flex items-center gap-2 h-11 pl-1.5 pr-3.5 rounded-full" aria-label="Show today’s Sunset Drop" @click="toggle">
        <span class="ring-badge w-8 h-8 text-base" :style="{ '--p': pct }" :class="{ urgent }"><span>{{ drop.emoji }}</span></span>
        <span class="font-bold text-label-lg tabular-nums" :class="urgent ? 'text-red-500' : 'text-flame'">{{ parts.join(':') }}</span>
      </button>
      <section v-else key="card" class="pointer-events-auto drop-glass w-[300px] max-w-[calc(100vw-24px)] rounded-lg p-4 animate-pop">
        <header class="flex items-center gap-3">
          <span class="ring-badge w-12 h-12 text-2xl" :style="{ '--p': pct }" :class="{ urgent }"><span>{{ drop.emoji }}</span></span>
          <div class="flex-1 min-w-0">
            <p class="label flex items-center gap-1.5"><span class="live-dot shrink-0" />Sunset Drop · today</p>
            <p class="text-label-lg truncate">“{{ drop.prompt }}”</p>
          </div>
          <button class="btn-icon w-8 h-8 -mr-1 -mt-5" aria-label="Minimise" @click="toggle"><Icon name="close" :size="16" /></button>
        </header>
        <div class="mt-3 flex items-center justify-center gap-1.5" role="timer" :aria-label="`${parts.join(':')} left`">
          <template v-for="(p, i) in parts" :key="i">
            <span v-if="i" class="text-headline-sm font-bold text-flame/70 -mt-3">:</span>
            <span class="flex flex-col items-center">
              <span class="digit" :class="{ urgent }">{{ p }}</span>
              <span class="text-[9px] uppercase tracking-widest text-on-surface-variant mt-1">{{ ['hrs', 'min', 'sec'][i] }}</span>
            </span>
          </template>
        </div>
        <div v-if="drop.entries.length" class="grid grid-cols-3 gap-1.5 mt-3">
          <RouterLink v-for="p in drop.entries.slice(0, 3)" :key="p.id" :to="`/p/${p.id}`" class="aspect-square rounded-md overflow-hidden"><img :src="p.mediaUrl!" alt="" class="w-full h-full object-cover" loading="lazy" /></RouterLink>
        </div>
        <RouterLink to="/drops" class="btn-primary w-full h-10 mt-3">Join the drop</RouterLink>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.drop-glass {
  background: rgb(var(--c-surface-container-lowest) / 0.7);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  backdrop-filter: blur(24px) saturate(170%);
  border: 1px solid rgb(255 255 255 / 0.55);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.6), 0 18px 40px -16px rgb(var(--c-flame) / 0.45);
}
[data-theme='dark'] .drop-glass { border-color: rgb(255 255 255 / 0.08); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 18px 40px -16px rgb(0 0 0 / 0.7); }
/* Conic ring that drains as the drop runs out. */
.ring-badge {
  --p: 100;
  position: relative; flex-shrink: 0; border-radius: 9999px; display: grid; place-items: center;
  background: conic-gradient(rgb(var(--c-tangerine)), rgb(var(--c-flame)) calc(var(--p) * 1%), rgb(var(--c-surface-container-high)) 0);
  box-shadow: 0 0 16px rgb(var(--c-flame) / 0.45);
}
.ring-badge > span { position: absolute; inset: 3px; border-radius: inherit; display: grid; place-items: center; background: rgb(var(--c-surface-container-lowest)); }
.ring-badge.urgent { animation: pulse-ring 1.2s ease-in-out infinite; }
.digit {
  min-width: 52px; padding: 6px 8px; border-radius: 12px; text-align: center;
  font-size: 26px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; color: #fff;
  background: linear-gradient(160deg, rgb(var(--c-tangerine)), rgb(var(--c-flame)));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.4), inset 0 -10px 16px rgb(0 0 0 / 0.12), 0 6px 14px -6px rgb(var(--c-flame) / 0.7);
}
.digit.urgent { background: linear-gradient(160deg, #ff5a5a, #c4002b); }
.live-dot { width: 7px; height: 7px; border-radius: 9999px; background: rgb(var(--c-flame)); box-shadow: 0 0 0 0 rgb(var(--c-flame) / 0.6); animation: live 1.6s infinite; }
@keyframes live { 70% { box-shadow: 0 0 0 7px rgb(var(--c-flame) / 0); } 100% { box-shadow: 0 0 0 0 rgb(var(--c-flame) / 0); } }
@keyframes pulse-ring { 50% { box-shadow: 0 0 24px rgb(255 60 60 / 0.8); } }
</style>
