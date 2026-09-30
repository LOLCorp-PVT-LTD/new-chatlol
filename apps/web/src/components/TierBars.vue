<script setup lang="ts">
import { computed } from 'vue';
import type { RatingSummary } from '@chatlol/shared';
import { TIERS } from '@chatlol/shared';
const props = defineProps<{ ratings: RatingSummary }>();
const rows = computed(() => [...TIERS].reverse().map((t) => ({ ...t, pct: props.ratings.count ? Math.round((props.ratings.dist[t.score - 1] / props.ratings.count) * 100) : 0 })));
</script>
<template>
  <div class="space-y-2">
    <div v-for="r in rows" :key="r.key" class="text-body-sm">
      <div class="flex justify-between mb-1"><span class="font-bold">{{ r.emoji }} {{ r.label }}</span><span class="font-bold text-primary">{{ r.pct }}%</span></div>
      <div class="h-2 rounded-full bg-surface-container overflow-hidden">
        <div class="h-full rounded-full bg-sunset transition-[width] duration-700" :style="{ width: r.pct + '%' }" />
      </div>
    </div>
  </div>
</template>
