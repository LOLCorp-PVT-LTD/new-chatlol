<script setup lang="ts">
import type { ProfileGame } from '@chatlol/shared';
/** A game's logo (Steam capsule art, or a colour tile with an emoji) and its name. */
defineProps<{ game: ProfileGame; small?: boolean }>();
</script>
<template>
  <div class="flex flex-col gap-1 min-w-0">
    <div class="relative w-full aspect-[231/87] rounded-md overflow-hidden flex items-center justify-center shadow-warm" :style="{ background: game.color ?? '#1b1b1b' }">
      <img v-if="game.logo" :src="game.logo" :alt="game.name" class="absolute inset-0 w-full h-full object-cover" loading="lazy" @error="($event.target as HTMLImageElement).style.display = 'none'" />
      <span v-else :class="small ? 'text-xl' : 'text-3xl'">{{ game.emoji }}</span>
    </div>
    <p class="truncate font-semibold" :class="small ? 'text-[11px]' : 'text-label-md'" :title="game.name">{{ game.name }}</p>
  </div>
</template>
