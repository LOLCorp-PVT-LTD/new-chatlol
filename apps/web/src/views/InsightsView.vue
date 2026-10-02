<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Insights } from '@chatlol/shared';
import { tierByScore, timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import Someone from '../components/Someone.vue';
import TierBars from '../components/TierBars.vue';
import Icon from '../components/Icon.vue';
import Empty from '../components/Empty.vue';

/** Who viewed, rated and mentioned you. Names are a Premium perk; everyone else sees "Someone". */
const ins = ref<Insights | null>(null);
const tab = ref<'views' | 'raters' | 'mentions'>('views');
onMounted(async () => (ins.value = await api.insights()));
</script>

<template>
  <div v-if="ins" class="max-w-[720px] mx-auto space-y-5">
    <h1 class="text-headline-xl flex items-center gap-2"><Icon name="visibility" class="text-flame" /> Who’s checking you out</h1>
    <RouterLink v-if="!ins.premium" to="/premium" class="block rounded-lg bg-sunset text-white p-5 shadow-float">
      <p class="text-headline-md">👑 {{ ins.viewCount }} {{ ins.viewCount === 1 ? 'person' : 'people' }} viewed your profile this month</p>
      <p class="text-body-md opacity-90 mt-1">Go Premium to see exactly who viewed you, who rated you, and who mentioned you in shouts.</p>
      <span class="btn bg-white text-flame h-10 mt-3">See who — from $4.99</span>
    </RouterLink>
    <div class="grid grid-cols-3 gap-3">
      <div class="card p-4 text-center"><p class="text-headline-lg">{{ ins.viewCount }}</p><p class="label">Views (30d)</p></div>
      <div class="card p-4 text-center"><p class="text-headline-lg">{{ ins.ratings.count }}</p><p class="label">Profile ratings</p></div>
      <div class="card p-4 text-center"><p class="text-headline-lg">{{ ins.mentions.length }}</p><p class="label">Mentions</p></div>
    </div>
    <section v-if="ins.ratings.count" class="card p-5"><p class="label mb-3">Your profile vibe</p><TierBars :ratings="ins.ratings" /></section>
    <div class="flex gap-2">
      <button class="chip" :class="{ 'chip-active': tab === 'views' }" @click="tab = 'views'">👀 Viewed you</button>
      <button class="chip" :class="{ 'chip-active': tab === 'raters' }" @click="tab = 'raters'">⭐ Rated you</button>
      <button class="chip" :class="{ 'chip-active': tab === 'mentions' }" @click="tab = 'mentions'">📣 Mentioned you</button>
    </div>
    <div class="card divide-y divide-sandstone">
      <template v-if="tab === 'views'">
        <div v-for="(v, i) in ins.views" :key="i" class="flex items-center gap-3 px-5 py-3"><Someone :user="v.user" :teaser="v.teaserAvatar" class="flex-1" /><span class="text-body-sm text-on-surface-variant">{{ timeAgo(v.at) }}</span></div>
        <Empty v-if="!ins.views.length" emoji="👀" title="No views yet" body="Post photos and shout to get noticed." />
      </template>
      <template v-else-if="tab === 'raters'">
        <div v-for="(r, i) in ins.raters" :key="i" class="flex items-center gap-3 px-5 py-3"><Someone :user="r.user" :teaser="r.teaserAvatar" class="flex-1" /><span class="text-label-lg">{{ tierByScore(r.score).emoji }} {{ tierByScore(r.score).label }}</span></div>
        <Empty v-if="!ins.raters.length" emoji="⭐" title="No profile ratings yet" />
      </template>
      <template v-else>
        <RouterLink v-for="(m, i) in ins.mentions" :key="i" :to="ins.premium ? `/shouts?focus=${m.shoutId}` : '/premium'" class="flex items-start gap-3 px-5 py-3">
          <Someone :user="m.user" :teaser="m.teaserAvatar" class="flex-1" />
          <span class="text-body-sm text-on-surface-variant text-right max-w-[45%]">{{ m.body ?? 'mentioned you in a shout' }}<br />{{ timeAgo(m.at) }}</span>
        </RouterLink>
        <Empty v-if="!ins.mentions.length" emoji="📣" title="No mentions yet" />
      </template>
    </div>
  </div>
  <div v-else class="max-w-[720px] mx-auto card h-96 skeleton" />
</template>
