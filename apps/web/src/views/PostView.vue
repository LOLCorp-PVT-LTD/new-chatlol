<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import type { Post } from '@chatlol/shared';
import { api } from '../lib/api';
import PostCard from '../components/PostCard.vue';
import TierBars from '../components/TierBars.vue';
import Empty from '../components/Empty.vue';

const route = useRoute();
const post = ref<Post | null>(null);
const missing = ref(false);
watchEffect(async () => {
  try { post.value = (await api.post(route.params.id as string)).post; } catch { missing.value = true; }
});
</script>
<template>
  <div class="max-w-[640px] mx-auto space-y-5">
    <PostCard v-if="post" :key="post.id" :post="post" expanded />
    <div v-if="post && (post.myRating || post.ratings.count > 0)" class="card p-5"><h3 class="text-headline-sm mb-3">Vibe Tier Breakdown</h3><TierBars :ratings="post.ratings" /></div>
    <Empty v-if="missing" emoji="🌫️" title="That post vanished" />
    <div v-if="!post && !missing" class="card h-[500px] skeleton" />
  </div>
</template>
