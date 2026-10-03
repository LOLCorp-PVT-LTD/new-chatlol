<script setup lang="ts">
import type { Arena } from '@chatlol/shared';
import Avatar from '../Avatar.vue';

/** Seat list beside a board: who plays which side, whose turn it is, and any extra line per seat. */
defineProps<{ arena: Arena; labels?: string[]; extra?: (seat: number) => string }>();
</script>
<template>
  <aside class="card p-4 space-y-2">
    <div v-for="(p, seat) in arena.players" :key="p.id" class="flex items-center gap-3 rounded-md p-2 ring-2" :class="arena.turnSeat === seat && arena.status === 'playing' ? 'bg-sunlit/80 ring-flame/50' : 'ring-transparent'" style="transition: background-color .25s, box-shadow .25s">
      <Avatar :user="p" :size="36" />
      <div class="min-w-0 flex-1">
        <p class="text-label-lg truncate">{{ p.displayName }}<span v-if="arena.mySeat === seat" class="text-on-surface-variant"> (you)</span></p>
        <p class="text-body-sm text-on-surface-variant">{{ labels?.[seat] ?? `Seat ${seat + 1}` }}<template v-if="extra"> · {{ extra(seat) }}</template><template v-if="arena.forfeitIds.includes(p.id)"> · resigned</template></p>
      </div>
      <span class="w-6 text-center transition-opacity duration-200" :class="arena.turnSeat === seat && arena.status === 'playing' ? 'opacity-100 animate-pulse' : 'opacity-0'" :aria-hidden="!(arena.turnSeat === seat && arena.status === 'playing')" aria-label="their turn">⏳</span>
    </div>
  </aside>
</template>
