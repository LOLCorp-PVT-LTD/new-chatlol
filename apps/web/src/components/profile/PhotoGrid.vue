<script setup lang="ts">
import type { Post } from '@chatlol/shared';
import { tierByKey } from '@chatlol/shared';

/** A grid of photo posts linking to each photo, with its rating. Thumbnails are square and never bigger than 250×250. */
defineProps<{ photos: Post[]; columns: number; empty?: string }>();
</script>

<template>
  <div v-if="photos.length" class="grid gap-2" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 250px))` }">
    <RouterLink v-for="p in photos" :key="p.id" :to="`/p/${p.id}`" class="relative aspect-square w-full max-w-[250px] max-h-[250px] rounded-md overflow-hidden group">
      <img :src="p.mediaUrl!" alt="" class="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
      <div class="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] font-bold">
        {{ p.ratings.count ? `${tierByKey(p.ratings.tier).emoji} ${p.ratings.count}` : '✨ new' }} · 💬 {{ p.commentCount }}
      </div>
    </RouterLink>
  </div>
  <p v-else class="text-body-md muted py-4 text-center">{{ empty ?? 'No photos yet' }}</p>
</template>
