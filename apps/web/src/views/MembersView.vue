<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { UserPublic } from '@chatlol/shared';
import { tierByKey, toTen } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Empty from '../components/Empty.vue';

const route = useRoute();
const router = useRouter();
const s = useSession();
const q = ref((route.query.q as string) ?? '');
const interest = ref<string | undefined>();
const onlineOnly = ref(false);
const sort = ref<'vibe' | 'new' | 'streak'>('vibe');
const users = ref<UserPublic[]>([]);
const loading = ref(false);
const INTERESTS = ['photography', 'music', 'lofi', 'gaming', 'fashion', 'food', 'fitness', 'travel', 'art', 'tech'];
let t: ReturnType<typeof setTimeout>;

async function load() {
  loading.value = true;
  users.value = (await api.members({ q: q.value || undefined, interest: interest.value, online: onlineOnly.value ? 1 : undefined, sort: sort.value })).items;
  loading.value = false;
}
onMounted(load);
watch([interest, onlineOnly, sort], load);
watch(q, () => { clearTimeout(t); t = setTimeout(load, 250); });

async function follow(u: UserPublic) {
  if (!s.user) return router.push('/join');
  const r = await api.follow(u.id);
  u.isFollowing = r.following;
}
async function dm(u: UserPublic) {
  if (!s.user) return router.push('/join');
  try { router.push(`/messages/${(await api.openConversation(u.id)).conversation.id}`); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>
<template>
  <div class="max-w-[960px] mx-auto space-y-4">
    <h1 class="text-headline-xl">Browse Members</h1>
    <div class="relative"><Icon name="search" class="absolute left-5 top-1/2 -translate-y-1/2 text-flame" />
      <input v-model="q" class="input pl-14" placeholder="Search by name, @handle or city" aria-label="Search members" /></div>
    <div class="flex gap-2 overflow-x-auto scrollbar-none pb-1">
      <button class="chip" :class="{ 'chip-active': onlineOnly }" @click="onlineOnly = !onlineOnly"><span class="w-2 h-2 rounded-full bg-online" /> Online now</button>
      <button v-for="x in (['vibe', 'new', 'streak'] as const)" :key="x" class="chip capitalize" :class="{ 'chip-active': sort === x }" @click="sort = x">{{ x === 'vibe' ? '⭐ Top vibe' : x === 'new' ? '✨ New' : '🔥 Streak' }}</button>
      <span class="w-px bg-sandstone mx-1" />
      <button v-for="i in INTERESTS" :key="i" class="chip" :class="{ 'chip-active': interest === i }" @click="interest = interest === i ? undefined : i">#{{ i }}</button>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="u in users" :key="u.id" class="card p-5 text-center hover:shadow-pop transition">
        <RouterLink :to="`/u/${u.handle}`" class="flex flex-col items-center">
          <Avatar :user="u" :size="84" />
          <UserName :user="u" :link="false" class="mt-3 text-body-lg justify-center" />
          <p class="text-body-sm text-on-surface-variant">@{{ u.handle }}<template v-if="u.city"> • {{ u.city }}</template></p>
        </RouterLink>
        <div class="flex justify-center gap-2 mt-3 text-label-sm">
          <span class="bg-sunlit text-flame rounded-full px-2.5 py-1">{{ tierByKey(u.vibeTier).emoji }} {{ u.ratingsReceived ? toTen(u.vibeAvg) : '–' }}</span>
          <span class="bg-surface-container rounded-full px-2.5 py-1">Lv {{ u.level }}</span>
          <span v-if="u.streakDays" class="bg-surface-container rounded-full px-2.5 py-1">🔥 {{ u.streakDays }}</span>
        </div>
        <p class="text-body-sm text-on-surface-variant line-clamp-2 mt-3 min-h-[2.5rem]">{{ u.bio }}</p>
        <div class="flex gap-2 mt-4">
          <button class="flex-1" :class="u.isFollowing ? 'btn-secondary h-10' : 'btn-primary h-10'" @click="follow(u)">{{ u.isFollowing ? 'Following' : 'Follow' }}</button>
          <button class="btn-icon bg-sunlit text-flame" aria-label="Message" @click="dm(u)"><Icon name="chat" /></button>
        </div>
      </div>
    </div>
    <div v-if="loading && !users.length" class="grid sm:grid-cols-3 gap-4"><div v-for="i in 6" :key="i" class="card h-72 skeleton" /></div>
    <Empty v-if="!loading && !users.length" emoji="🔍" title="No one matches that" />
  </div>
</template>
