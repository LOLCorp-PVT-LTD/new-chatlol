<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { Shout, UserPublic } from '@chatlol/shared';
import { SHOUT_COOLDOWN_SEC, SHOUT_MOODS, compact } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import ShoutItem from '../components/ShoutItem.vue';
import ShoutComposer from '../components/ShoutComposer.vue';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';
import Empty from '../components/Empty.vue';

/** The Global Shoutbox: a live notice board for everyone. New shouts slide in as they're posted. */
const route = useRoute();
const s = useSession();
const items = ref<Shout[]>([]);
const cursor = ref<string | null>(null);
const nextShoutAt = ref<string | null>(null);
const mood = ref<string | undefined>();
const replyTo = ref<Shout | null>(null);
const loading = ref(false);
const trends = ref<{ tags: { tag: string; count: number }[]; top: { rank: number; user: UserPublic; shouts: number; reps: number }[] }>({ tags: [], top: [] });
const highlight = ref<string | null>((route.query.focus as string) ?? null);

async function load(reset = false) {
  if (loading.value) return;
  loading.value = true;
  try {
    const r = await api.shouts({ before: reset ? undefined : (cursor.value ?? undefined), mood: mood.value });
    items.value = reset ? r.items : [...items.value, ...r.items.filter((x) => !items.value.some((y) => y.id === x.id))];
    cursor.value = r.nextCursor;
    nextShoutAt.value = r.nextShoutAt;
  } finally {
    loading.value = false;
  }
}
const upsert = (sh: Shout) => {
  const i = items.value.findIndex((x) => x.id === sh.id);
  if (i >= 0) items.value[i] = sh;
  else if (!mood.value || sh.mood === mood.value) items.value.unshift(sh);
};
const onNew = (sh: Shout) => upsert(sh);
const onReact = (p: { id: string; reactions: Shout['reactions'] }) => {
  const x = items.value.find((y) => y.id === p.id);
  if (x) x.reactions = p.reactions;
};
// Staff removals (with a reason) turn into a "removed by Admin" card; other removals just disappear.
const onRemoved = (r: { type: string; id: string; reason?: string }) => {
  if (r.type !== 'shout') return;
  if (r.reason) items.value = items.value.map((x) => (x.id === r.id ? { ...x, body: '', sticker: null, removed: { by: 'admin', reason: r.reason!, at: new Date().toISOString() } } : x));
  else items.value = items.value.filter((x) => x.id !== r.id);
};

function posted(sh: Shout, nextAt: string) {
  upsert(sh);
  nextShoutAt.value = nextAt;
  replyTo.value = null;
}
function reply(sh: Shout) {
  replyTo.value = sh;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(async () => {
  await load(true);
  trends.value = await api.shoutTrends();
  s.socket().on('shout:new', onNew);
  s.socket().on('shout:reactions', onReact);
  s.socket().on('content:removed', onRemoved);
  if (highlight.value) {
    await nextTick();
    document.getElementById(`shout-${highlight.value}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => (highlight.value = null), 4000);
  }
});
onUnmounted(() => {
  s.socket().off('shout:new', onNew);
  s.socket().off('shout:reactions', onReact);
  s.socket().off('content:removed', onRemoved);
});
watch(mood, () => load(true));
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_280px] gap-5 max-w-[1000px] mx-auto">
    <div class="space-y-4 min-w-0">
      <header class="rounded-lg bg-sunset text-white p-5 shadow-float">
        <p class="text-label-sm uppercase tracking-wider opacity-90 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-white animate-pulse-ring" /> Live • updates instantly</p>
        <h1 class="text-headline-xl mt-1 flex items-center gap-2"><Icon name="campaign" fill /> The Global Shoutbox</h1>
        <p class="text-body-md opacity-90">One message to the whole of ChatLOL. React, reply with your own shout, tag friends with @handle. One shout every {{ SHOUT_COOLDOWN_SEC }} seconds.</p>
      </header>
      <ShoutComposer :reply-to="replyTo" :next-shout-at="nextShoutAt" @posted="posted" @cancel-reply="replyTo = null" />
      <div class="flex gap-2 overflow-x-auto scrollbar-none">
        <button class="chip" :class="{ 'chip-active': !mood }" @click="mood = undefined">All</button>
        <button v-for="m in SHOUT_MOODS" :key="m.key" class="chip" :class="{ 'chip-active': mood === m.key }" @click="mood = m.key">{{ m.emoji }} {{ m.label }}</button>
      </div>
      <TransitionGroup name="fade" tag="div" class="space-y-3">
        <div v-for="sh in items" :id="`shout-${sh.id}`" :key="sh.id" :class="{ 'ring-2 ring-flame rounded-lg': highlight === sh.id }">
          <ShoutItem :shout="sh" @reply="reply" @update="upsert" @removed="(id) => (items = items.filter((x) => x.id !== id))" />
        </div>
      </TransitionGroup>
      <div v-if="loading && !items.length" class="space-y-3"><div v-for="i in 4" :key="i" class="card h-28 skeleton" /></div>
      <Empty v-if="!loading && !items.length" emoji="📣" title="It’s quiet… too quiet" body="Be the first to shout." />
      <button v-if="cursor" class="btn-secondary w-full" :disabled="loading" @click="load()"><Icon name="refresh" /> Load older shouts</button>
    </div>
    <aside class="space-y-4 hidden lg:block">
      <div class="card p-4">
        <p class="label mb-3 flex items-center gap-1.5"><Icon name="trending_up" :size="16" class="text-flame" /> Trending in Shouts</p>
        <p v-if="!trends.tags.length" class="text-body-sm text-on-surface-variant">No #tags yet today.</p>
        <div v-for="t in trends.tags" :key="t.tag" class="flex justify-between py-1.5 text-body-md"><span class="font-bold text-primary">#{{ t.tag }}</span><span class="text-on-surface-variant">{{ compact(t.count) }} shouts</span></div>
      </div>
      <div class="card p-4">
        <p class="label mb-3 flex items-center gap-1.5"><Icon name="emoji_events" :size="16" class="text-flame" /> Top Shouters Today</p>
        <RouterLink v-for="t in trends.top" :key="t.user.id" :to="`/u/${t.user.handle}`" class="flex items-center gap-3 py-2">
          <span class="w-6 text-center font-bold text-flame">{{ t.rank }}</span><Avatar :user="t.user" :size="36" />
          <span class="min-w-0 flex-1"><span class="text-label-lg block truncate">{{ t.user.displayName }}</span><span class="text-body-sm text-on-surface-variant">{{ t.shouts }} shouts • {{ t.reps }} reps</span></span>
        </RouterLink>
      </div>
    </aside>
  </div>
</template>
