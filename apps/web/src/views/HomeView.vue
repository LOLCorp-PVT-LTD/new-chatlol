<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { HomeData, Post, RatingSummary, Shout, VibeScore } from '@chatlol/shared';
import { compact, tierByKey, toTen, timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import SectionHead from '../components/SectionHead.vue';
import ShoutItem from '../components/ShoutItem.vue';
import ShoutComposer from '../components/ShoutComposer.vue';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import TierPad from '../components/TierPad.vue';
import TierBars from '../components/TierBars.vue';
import Icon from '../components/Icon.vue';
import Countdown from '../components/Countdown.vue';

/** Home: a slice of every part of ChatLOL, each with an arrow to its full page. */
const s = useSession();
const h = ref<HomeData | null>(null);
const shouts = ref<Shout[]>([]);
const rateCard = ref<Post | null>(null);
const rated = ref<{ score: VibeScore; ratings: RatingSummary } | null>(null);
const greeting = computed(() => {
  const hr = new Date().getHours();
  return hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
});

onMounted(async () => {
  h.value = await api.home();
  shouts.value = h.value.shouts;
  rateCard.value = h.value.rate;
  s.socket().on('shout:new', onShout);
});
onUnmounted(() => s.socket().off('shout:new', onShout));
const onShout = (sh: Shout) => (shouts.value = [sh, ...shouts.value.filter((x) => x.id !== sh.id)].slice(0, 6));

async function rate(score: VibeScore) {
  if (!rateCard.value) return;
  if (!s.user) return s.toast({ kind: 'info', title: 'Sign in to rate' });
  try {
    const r = await api.rate(rateCard.value.id, score);
    rated.value = { score, ratings: r.post.ratings };
    s.reward(r.reward);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function nextRate() {
  rated.value = null;
  const r = await api.rouletteNext().catch(() => null);
  rateCard.value = r?.post ?? null;
}
</script>

<template>
  <div v-if="h" class="space-y-6 w-full">
    <!-- Greeting -->
    <section class="rounded-lg bg-sunset-v text-white p-6 shadow-float relative overflow-hidden">
      <div class="absolute -right-12 -top-16 w-56 h-56 rounded-full bg-white/10" />
      <p class="text-label-sm uppercase tracking-wider opacity-90">{{ compact(h.stats.members) }} members • <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-white animate-pulse-ring" /> {{ compact(h.stats.online) }} online now</span></p>
      <h1 class="text-headline-xl mt-1">{{ greeting }}{{ s.user ? `, ${s.user.displayName.split(' ')[0]}` : '' }} 🌅</h1>
      <div class="flex flex-wrap gap-2 mt-4">
        <RouterLink to="/shouts" class="btn bg-white text-flame h-10"><Icon name="campaign" :size="18" /> Shout</RouterLink>
        <RouterLink to="/roulette" class="btn bg-white/20 h-10"><Icon name="casino" :size="18" /> Rate & Meet</RouterLink>
        <RouterLink to="/drops" class="btn bg-white/20 h-10"><Icon name="wb_twilight" :size="18" /> Today’s Drop</RouterLink>
        <RouterLink to="/feed" class="btn bg-white/20 h-10"><Icon name="dynamic_feed" :size="18" /> News Feed</RouterLink>
      </div>
    </section>

    <!-- Birthdays today -->
    <section v-if="h.birthdays.length" class="card p-5 bg-[linear-gradient(135deg,rgba(255,94,0,.08),rgba(255,209,102,.18))]">
      <SectionHead title="Birthdays today 🎂" icon="cake" hint="Send them a wish!" />
      <div class="flex gap-4 overflow-x-auto scrollbar-none">
        <RouterLink v-for="b in h.birthdays" :key="b.user.id" :to="`/p/${b.postId}`" class="w-24 shrink-0 text-center group">
          <div class="relative mx-auto w-fit"><Avatar :user="b.user" :size="72" class="group-hover:scale-105 transition" /><span class="absolute -top-2 -right-1 text-2xl">🎈</span></div>
          <p class="text-label-md mt-2 truncate">{{ b.user.displayName }}</p>
          <p class="text-label-sm text-flame">Wish them 🎉</p>
        </RouterLink>
      </div>
    </section>

    <!-- Popular members -->
    <section class="card p-5">
      <SectionHead title="Popular Members" icon="local_fire_department" to="/members" hint="Best-rated this week" />
      <div class="flex gap-4 overflow-x-auto scrollbar-none pb-1">
        <RouterLink v-for="u in h.popularMembers" :key="u.id" :to="`/u/${u.handle}`" class="w-24 shrink-0 text-center group">
          <Avatar :user="u" :size="80" class="mx-auto group-hover:scale-105 transition" />
          <p class="text-label-md mt-2 truncate">{{ u.displayName }}</p>
          <p class="text-label-sm text-flame">{{ tierByKey(u.vibeTier).emoji }} {{ toTen(u.vibeAvg) }}</p>
        </RouterLink>
      </div>
    </section>

    <div class="grid md:grid-cols-2 gap-6">
      <!-- Rate & Meet -->
      <section class="card p-5">
        <SectionHead title="Rate & Meet" icon="star" to="/roulette" hint="Pick a vibe tier, see if you match the crowd" />
        <template v-if="rateCard">
          <RouterLink :to="`/u/${rateCard.author.handle}`" class="flex items-center gap-2 mb-2"><Avatar :user="rateCard.author" :size="32" /><UserName :user="rateCard.author" :link="false" class="text-body-md" /></RouterLink>
          <div class="relative rounded-md overflow-hidden aspect-[4/5] max-h-[560px] mx-auto bg-surface-container">
            <img :src="rateCard.mediaUrl!" alt="" class="w-full h-full object-cover" />
            <p v-if="rateCard.body" class="absolute bottom-0 inset-x-0 p-3 text-white text-body-sm bg-gradient-to-t from-black/70 to-transparent">{{ rateCard.body }}</p>
          </div>
          <div class="mt-3">
            <div v-if="rated" class="space-y-3">
              <TierBars :ratings="rated.ratings" />
              <button class="btn-primary w-full" @click="nextRate">Next photo <Icon name="arrow_forward" /></button>
            </div>
            <TierPad v-else :model-value="null" compact @rate="rate" />
          </div>
        </template>
        <p v-else class="text-body-md text-on-surface-variant py-8 text-center">You’ve rated everything new 🙌</p>
      </section>

      <!-- Shoutbox -->
      <section class="card p-5">
        <SectionHead title="Shoutbox" icon="campaign" to="/shouts" hint="Live notice board for everyone" />
        <ShoutComposer compact @posted="(sh) => onShout(sh)" />
        <div class="divide-y divide-sandstone mt-1">
          <ShoutItem v-for="sh in shouts" :key="sh.id" :shout="sh" compact @update="(x) => (shouts = shouts.map((y) => (y.id === x.id ? x : y)))" @reply="$router.push(`/shouts?focus=${sh.id}`)" />
        </div>
      </section>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <!-- Forums -->
      <section class="card p-5">
        <SectionHead title="Forums" icon="groups" to="/forums" hint="Hot discussions right now" />
        <RouterLink v-for="t in h.forums" :key="t.id" :to="`/forums/${t.id}`" class="flex gap-3 py-2.5 border-b border-sandstone last:border-0 group">
          <Avatar :user="t.author" :size="36" />
          <div class="min-w-0 flex-1"><p class="text-label-lg truncate group-hover:text-primary">{{ t.title }}</p>
            <p class="text-body-sm text-on-surface-variant">▲ {{ t.upvotes }} • 💬 {{ t.replyCount }} • {{ timeAgo(t.lastActivityAt) }}</p></div>
        </RouterLink>
      </section>

      <!-- Hall of Fame -->
      <section class="card p-5">
        <SectionHead title="Hall of Fame" icon="emoji_events" to="/leaderboard" hint="All-time top vibes" />
        <RouterLink v-for="e in h.hallOfFame" :key="e.user.id" :to="`/u/${e.user.handle}`" class="flex items-center gap-3 py-2">
          <span class="w-8 h-8 rounded-full flex items-center justify-center font-bold" :class="e.rank === 1 ? 'bg-sunset text-white' : 'bg-surface-container-low'">{{ e.rank === 1 ? '👑' : e.rank }}</span>
          <Avatar :user="e.user" :size="40" />
          <UserName :user="e.user" :link="false" class="flex-1 min-w-0 text-body-md" />
          <span class="text-label-lg text-flame">{{ e.score }}/10</span>
        </RouterLink>
      </section>
    </div>

    <!-- Live streams -->
    <section class="card p-5">
      <SectionHead title="Popular Streams" icon="live_tv" to="/live" :hint="h.streams.length ? `${h.streams.length} live now` : 'Nobody’s live — be the first'" />
      <div v-if="h.streams.length" class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RouterLink v-for="st in h.streams" :key="st.id" :to="`/live/${st.id}`" class="rounded-md overflow-hidden relative aspect-[3/4] group">
          <img :src="st.coverUrl" alt="" class="w-full h-full object-cover group-hover:scale-105 transition" />
          <span class="absolute top-2 left-2 bg-coral text-white rounded-full px-2 py-0.5 text-label-sm">● LIVE {{ st.viewers }}</span>
          <div class="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/75 to-transparent text-white"><p class="text-label-md truncate">{{ st.title }}</p><p class="text-body-sm opacity-80 truncate">{{ st.host.displayName }}</p></div>
        </RouterLink>
      </div>
      <RouterLink v-else to="/live" class="btn-secondary w-full"><Icon name="videocam" /> Go live</RouterLink>
    </section>

    <div class="grid md:grid-cols-2 gap-6">
      <!-- Today's drop -->
      <section class="card p-5">
        <SectionHead title="Today’s Sunset Drop" icon="wb_twilight" to="/drops" />
        <p class="text-headline-sm">{{ h.drop.emoji }} “{{ h.drop.prompt }}”</p>
        <p class="text-body-sm text-on-surface-variant mb-3"><Countdown :to="h.drop.endsAt" /> left</p>
        <div class="grid grid-cols-3 gap-1.5">
          <RouterLink v-for="p in h.drop.entries" :key="p.id" :to="`/p/${p.id}`" class="aspect-square rounded-md overflow-hidden"><img :src="p.mediaUrl!" alt="" class="w-full h-full object-cover" loading="lazy" /></RouterLink>
        </div>
      </section>

      <!-- Arena -->
      <section class="card p-5">
        <SectionHead title="Hot Take Arena" icon="swords" to="/arena" hint="Stake Sparks on the crowd" />
        <RouterLink v-for="t in h.arena" :key="t.id" to="/arena" class="block rounded-md bg-surface-container-low p-3 mb-2">
          <p class="text-label-sm text-flame">{{ t.category }}</p><p class="text-label-lg">{{ t.statement }}</p>
          <div class="h-2 rounded-full bg-surface-container mt-2 overflow-hidden"><div class="h-full bg-sunset" :style="{ width: `${Math.round((t.agreeCount / Math.max(1, t.agreeCount + t.disagreeCount)) * 100)}%` }" /></div>
          <p class="text-body-sm text-on-surface-variant mt-1">{{ t.agreeCount }} agree • {{ t.disagreeCount }} disagree • ⚡{{ compact(t.agreePool + t.disagreePool) }}</p>
        </RouterLink>
      </section>
    </div>

    <!-- Lounges -->
    <section class="card p-5">
      <SectionHead title="Hangout Lounges" icon="forum" to="/lounges" hint="Drop in and chat" />
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RouterLink v-for="l in h.lounges" :key="l.id" :to="`/lounges/${l.id}`" class="rounded-md overflow-hidden relative aspect-video group">
          <img :src="l.coverUrl" alt="" class="w-full h-full object-cover group-hover:scale-105 transition" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent p-2 flex flex-col justify-end text-white">
            <p class="text-label-md truncate">{{ l.emoji }} {{ l.name }}</p><p class="text-body-sm opacity-80">{{ l.onlineCount }} here</p>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- New members -->
    <section class="card p-5">
      <SectionHead title="Say Hi to New Members" icon="waving_hand" to="/members?sort=new" />
      <div class="flex gap-4 overflow-x-auto scrollbar-none">
        <RouterLink v-for="u in h.newMembers" :key="u.id" :to="`/u/${u.handle}`" class="w-20 shrink-0 text-center">
          <Avatar :user="u" :size="64" class="mx-auto" /><p class="text-label-sm mt-1.5 truncate">{{ u.displayName }}</p>
        </RouterLink>
      </div>
    </section>
  </div>
  <div v-else class="space-y-6 w-full"><div class="h-40 card skeleton" /><div class="h-48 card skeleton" /><div class="grid md:grid-cols-2 gap-6"><div class="h-96 card skeleton" /><div class="h-96 card skeleton" /></div></div>
</template>
