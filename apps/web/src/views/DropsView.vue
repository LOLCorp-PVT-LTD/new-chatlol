<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Drop, Post } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Countdown from '../components/Countdown.vue';
import Composer from '../components/Composer.vue';
import PostCard from '../components/PostCard.vue';
import Icon from '../components/Icon.vue';
import Empty from '../components/Empty.vue';

const s = useSession();
const drop = ref<Drop | null>(null);
const entries = ref<Post[]>([]);
const composing = ref(false);
const sort = ref<'fire' | 'new'>('fire');
const atRisk = computed(() => s.user && s.user.streakDays > 0 && !drop.value?.myEntryId);
const sorted = computed(() => sort.value === 'new' ? [...entries.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : entries.value);

async function load() {
  const r = await api.drop();
  drop.value = r.drop;
  entries.value = r.entries;
}
onMounted(load);
function onPosted(p: Post) {
  entries.value.unshift(p);
  if (drop.value) drop.value = { ...drop.value, myEntryId: p.id, entries: drop.value.entries + 1 };
  void s.refresh();
}
</script>

<template>
  <div class="max-w-[640px] mx-auto space-y-5">
    <section v-if="drop" class="rounded-lg bg-inverse-surface text-inverse-on-surface p-6 relative overflow-hidden shadow-float">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_80%_120%,rgb(var(--c-flame)/0.7),transparent_55%)]" />
      <div class="relative">
        <div class="flex items-center justify-between text-label-md">
          <span class="bg-white/10 rounded-full px-3 py-1">🌅 Sunset Ritual</span>
          <span class="flex items-center gap-1 bg-flame text-white rounded-full px-3 py-1"><Icon name="timer" :size="16" /><Countdown :to="drop.endsAt" /> left</span>
        </div>
        <p class="label !text-inverse-on-surface/70 mt-6">Today’s prompt</p>
        <h1 class="text-headline-xl mt-1">“{{ drop.prompt }}” {{ drop.emoji }}</h1>
        <div v-if="atRisk" class="mt-4 flex items-center gap-3 rounded-md bg-white/10 p-3">
          <span class="text-3xl">🔥</span>
          <div class="flex-1"><p class="text-label-lg">{{ s.user!.streakDays }}-Day Sunset Streak at risk!</p><p class="text-body-sm opacity-80">Drop before twilight to keep your badge & Sparks.</p></div>
        </div>
        <button v-if="!drop.myEntryId && s.user" class="btn-primary w-full h-14 mt-5 text-body-lg" @click="composing = true"><Icon name="photo_camera" /> Snap & Lock In Drop <span class="opacity-90">+120 ✦</span></button>
        <RouterLink v-else-if="!s.user" to="/join" class="btn-primary w-full h-14 mt-5">Join to drop</RouterLink>
        <p v-else class="mt-5 rounded-full bg-white/10 px-4 py-3 text-center text-label-lg">✅ Dropped! Streak: 🔥 {{ s.user?.streakDays }} — now rate the crew below</p>
      </div>
    </section>

    <div class="flex items-center justify-between">
      <h2 class="text-headline-lg">Today’s Drops <span class="text-body-md text-on-surface-variant">{{ drop?.entries ?? 0 }} live</span></h2>
      <div class="flex gap-2">
        <button class="chip" :class="{ 'chip-active': sort === 'fire' }" @click="sort = 'fire'">🔥 Most Fire</button>
        <button class="chip" :class="{ 'chip-active': sort === 'new' }" @click="sort = 'new'">New</button>
      </div>
    </div>
    <PostCard v-for="p in sorted" :key="p.id" :post="p" />
    <Empty v-if="drop && !entries.length" emoji="📸" title="No drops yet today" body="Be the first — early drops get the most eyes." />
    <Composer v-if="composing && drop" mode="drop" :prompt="drop.prompt" @close="composing = false" @posted="onPosted" />
  </div>
</template>
