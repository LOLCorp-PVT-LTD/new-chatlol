<script setup lang="ts">
import { computed } from 'vue';
import { TIERS, tierByKey } from '@chatlol/shared';
import TierPad from '../TierPad.vue';
import Icon from '../Icon.vue';
import { useProfileCtx } from './context';

/** Community vibe consensus for the profile, and the pad visitors rate it with. */
const ctx = useProfileCtx();
const r = computed(() => ctx.ratings.value);
const rows = computed(() => [...TIERS].reverse().map((t) => ({ ...t, pct: r.value?.count ? Math.round((r.value.dist[t.score - 1] / r.value.count) * 100) : 0 })));
const first = computed(() => ctx.user.value.displayName.split(' ')[0]);
</script>

<template>
  <div v-if="r" class="space-y-4">
    <div>
      <p class="text-headline-md">{{ r.count ? `${r.consensusPct}% ${tierByKey(r.tier).emoji} ${tierByKey(r.tier).label}` : 'No ratings yet' }}</p>
      <p class="text-body-sm muted">{{ r.count }} profile rating{{ r.count === 1 ? '' : 's' }}</p>
    </div>
    <div class="space-y-1.5">
      <div v-for="row in rows" :key="row.key" class="text-body-sm">
        <div class="flex justify-between mb-0.5"><span class="font-bold">{{ row.emoji }} {{ row.label }}</span><span class="font-bold">{{ row.pct }}%</span></div>
        <div class="h-2 rounded-full tile overflow-hidden"><div class="h-full rounded-full" :style="{ width: `${row.pct}%`, background: ctx.accent.value }" /></div>
      </div>
    </div>
    <div v-if="!ctx.isMe.value" class="pt-1">
      <p class="text-label-lg mb-2">Rate {{ first }}’s profile vibe</p>
      <TierPad :model-value="r.myRating" compact :disabled="ctx.editing.value" @rate="ctx.rateProfile" />
      <p class="text-body-sm muted mt-2">Ratings are anonymous unless they have Premium 👑</p>
    </div>
    <RouterLink v-else to="/insights" class="inline-flex items-center gap-1.5 text-label-lg underline underline-offset-4"><Icon name="visibility" :size="18" /> See who rated you</RouterLink>
  </div>
</template>
