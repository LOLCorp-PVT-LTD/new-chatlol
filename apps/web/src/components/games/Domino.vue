<script setup lang="ts">
/** One domino tile drawn in SVG (pips), horizontal or vertical; `back` shows the face-down side. */
defineProps<{ a?: number; b?: number; vertical?: boolean; back?: boolean; size?: number; glow?: boolean }>();
const P: Record<number, [number, number][]> = {
  0: [], 1: [[25, 25]], 2: [[13, 13], [37, 37]], 3: [[13, 13], [25, 25], [37, 37]], 4: [[13, 13], [37, 13], [13, 37], [37, 37]],
  5: [[13, 13], [37, 13], [25, 25], [13, 37], [37, 37]], 6: [[13, 11], [37, 11], [13, 25], [37, 25], [13, 39], [37, 39]],
};
</script>
<template>
  <svg :viewBox="vertical ? '0 0 50 100' : '0 0 100 50'" :width="vertical ? (size ?? 34) : (size ?? 34) * 2" :height="vertical ? (size ?? 34) * 2 : (size ?? 34)" class="domino" :class="{ glow }">
    <rect x="1" y="1" :width="vertical ? 48 : 98" :height="vertical ? 98 : 48" rx="8" :fill="back ? 'url(#dback)' : '#fffdf8'" stroke="#2a211b" stroke-width="2" />
    <defs><linearGradient id="dback" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a3d" /><stop offset="1" stop-color="#b91c1c" /></linearGradient></defs>
    <template v-if="!back">
      <line v-if="vertical" x1="8" y1="50" x2="42" y2="50" stroke="#2a211b" stroke-width="2" />
      <line v-else x1="50" y1="8" x2="50" y2="42" stroke="#2a211b" stroke-width="2" />
      <circle v-for="(p, i) in P[a ?? 0]" :key="'a' + i" :cx="p[0]" :cy="p[1]" r="4.5" fill="#1f1a17" />
      <circle v-for="(p, i) in P[b ?? 0]" :key="'b' + i" :cx="vertical ? p[0] : p[0] + 50" :cy="vertical ? p[1] + 50 : p[1]" r="4.5" fill="#1f1a17" />
    </template>
  </svg>
</template>
<style scoped>
.domino { filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.25)); transition: transform 0.2s; }
.domino.glow { filter: drop-shadow(0 0 6px rgb(var(--c-flame))) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.25)); }
</style>
