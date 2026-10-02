<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Post, Drop } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import PostCard from '../components/PostCard.vue';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';
import Countdown from '../components/Countdown.vue';
import Empty from '../components/Empty.vue';

const props = defineProps<{ newPost?: Post | null }>();
defineEmits<{ (e: 'compose'): void }>();
const s = useSession();
const route = useRoute();
const router = useRouter();
const tab = ref<'foryou' | 'following' | 'top'>('foryou');
const posts = ref<Post[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const done = ref(false);
const fresh = ref<Post[]>([]);
const drop = ref<Drop | null>(null);
const sentinel = ref<HTMLElement>();
let obs: IntersectionObserver | null = null;

async function load(reset = false) {
  if (loading.value || (done.value && !reset)) return;
  loading.value = true;
  if (reset) { posts.value = []; cursor.value = null; done.value = false; fresh.value = []; }
  try {
    const r = await api.feed({ tab: tab.value, cursor: cursor.value ?? undefined, tag: (route.query.tag as string) || undefined });
    const seen = new Set(posts.value.map((p) => p.id));
    posts.value.push(...r.items.filter((p) => !seen.has(p.id)));
    cursor.value = r.nextCursor;
    done.value = !r.nextCursor;
  } finally { loading.value = false; }
}

function showFresh() {
  posts.value = [...fresh.value, ...posts.value];
  fresh.value = [];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const onRemoved = (r: { type: string; id: string }) => { if (r.type === 'post') posts.value = posts.value.filter((p) => p.id !== r.id); };
const onNew = (p: Post) => { if (p.author.id !== s.user?.id && !posts.value.some((x) => x.id === p.id)) fresh.value = [p, ...fresh.value].slice(0, 20); };

onMounted(async () => {
  void load(true);
  drop.value = (await api.drop()).drop;
  s.socket().on('feed:new', onNew);
  s.socket().on('content:removed', onRemoved);
  obs = new IntersectionObserver((e) => e[0]?.isIntersecting && load(), { rootMargin: '800px' });
  if (sentinel.value) obs.observe(sentinel.value);
});
onUnmounted(() => { obs?.disconnect(); s.socket().off('feed:new', onNew); s.socket().off('content:removed', onRemoved); });
watch([tab, () => route.query.tag], () => load(true));
watch(() => props.newPost, (p) => { if (p) posts.value.unshift(p); });
</script>

<template>
  <div class="space-y-5 max-w-[640px] mx-auto">
    <h1 class="text-headline-xl flex items-center gap-2"><Icon name="dynamic_feed" class="text-flame" /> News Feed</h1>
    <!-- Drop banner -->
    <RouterLink v-if="drop" to="/drops" class="block rounded-lg bg-sunset text-white p-5 shadow-float relative overflow-hidden group">
      <div class="absolute right-4 top-1/2 -translate-y-1/2 text-7xl opacity-30 group-hover:scale-110 transition">{{ drop.emoji }}</div>
      <p class="text-label-sm uppercase tracking-wider opacity-90 flex items-center gap-2"><Icon name="timer" :size="16" /> Daily Sunset Drop • <Countdown :to="drop.endsAt" /> left</p>
      <p class="text-headline-md mt-1 pr-20">“{{ drop.prompt }}”</p>
      <p class="text-body-sm mt-1 opacity-90">{{ drop.myEntryId ? '✅ You dropped today — go rate others' : `${drop.entries} drops so far • +120 Sparks & keep your 🔥 streak` }}</p>
    </RouterLink>

    <!-- Moments / quick compose -->
    <div v-if="s.user" class="card p-4 flex items-center gap-3">
      <Avatar :user="s.user" :size="44" :show-online="false" />
      <button class="flex-1 text-left input h-12 flex items-center text-outline text-body-md cursor-text" @click="$emit('compose')">Drop a photo or start a vibe rating…</button>
      <button class="btn-icon bg-sunlit text-flame" aria-label="Post photo" @click="$emit('compose')"><Icon name="photo_camera" /></button>
    </div>

    <div class="flex items-center gap-2 overflow-x-auto scrollbar-none">
      <button v-for="t in ([['foryou', 'Latest'], ['following', 'Following'], ['top', 'Top Rated']] as const)" :key="t[0]" class="chip" :class="{ 'chip-active': tab === t[0] }" @click="tab = t[0]">{{ t[1] }}</button>
      <span v-if="route.query.tag" class="chip border-flame text-flame">#{{ route.query.tag }} <button aria-label="Clear tag" @click="router.replace('/feed')"><Icon name="close" :size="16" /></button></span>
    </div>

    <button v-if="fresh.length" class="sticky top-24 z-20 mx-auto flex btn-primary h-10 shadow-float animate-pop" @click="showFresh">
      <Icon name="arrow_upward" :size="18" /> {{ fresh.length }} new vibe{{ fresh.length > 1 ? 's' : '' }}
    </button>

    <TransitionGroup name="fade" tag="div" class="space-y-5">
      <PostCard v-for="p in posts" :key="p.id" :post="p" @deleted="posts = posts.filter((x) => x.id !== $event)" />
    </TransitionGroup>
    <div v-if="loading" class="space-y-5"><div v-for="i in 2" :key="i" class="card h-96 skeleton" /></div>
    <Empty v-if="!loading && !posts.length" emoji="📸" :title="tab === 'following' ? 'Follow some people to fill this up' : 'Nothing here yet'" body="Be the first to drop a vibe." />
    <p v-if="done && posts.length" class="text-center text-body-sm text-on-surface-variant py-6">You’re all caught up 🌅 — try <RouterLink to="/roulette" class="text-primary font-bold">Vibe Roulette</RouterLink> for more.</p>
    <div ref="sentinel" class="h-1" />
  </div>
</template>
