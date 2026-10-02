<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Friendship, UserPublic } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import FriendButton from '../components/FriendButton.vue';
import Empty from '../components/Empty.vue';
import Icon from '../components/Icon.vue';

/** Friend requests you've received, ones you've sent, and your friends. */
type Tab = 'requests' | 'sent' | 'friends';
const route = useRoute();
const router = useRouter();
const s = useSession();
const tab = ref<Tab>((route.query.tab as Tab) || 'requests');
const incoming = ref<{ user: UserPublic; at: string }[]>([]);
const outgoing = ref<{ user: UserPublic; at: string }[]>([]);
const friends = ref<{ user: UserPublic; since: string }[]>([]);
const loading = ref(true);
async function load() {
  loading.value = true;
  try {
    const [r, f] = await Promise.all([api.friendRequests(), api.friends()]);
    incoming.value = r.incoming;
    outgoing.value = r.outgoing;
    friends.value = f.items;
    if (!route.query.tab && !incoming.value.length) tab.value = 'friends';
  } finally { loading.value = false; }
}
onMounted(load);
function changed(list: { user: UserPublic }[], id: string, f: Friendship) {
  const row = list.find((x) => x.user.id === id);
  if (row) row.user = { ...row.user, friendship: f };
  if (f === 'friends' || f === 'none') setTimeout(load, 600);
}
const tabs = computed(() => [
  ['requests', 'Requests', incoming.value.length],
  ['sent', 'Sent', outgoing.value.length],
  ['friends', 'Friends', friends.value.length],
] as [Tab, string, number][]);
</script>

<template>
  <div class="max-w-[760px] mx-auto space-y-5">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 class="text-headline-xl">Friends</h1><p class="text-body-md text-on-surface-variant">Requests, and the people you’re friends with.</p></div>
      <RouterLink to="/members" class="btn-secondary"><Icon name="person_search" /> Find people</RouterLink>
    </header>
    <div class="flex gap-2">
      <button v-for="t in tabs" :key="t[0]" class="chip" :class="{ 'chip-active': tab === t[0] }" @click="tab = t[0]; router.replace({ query: { tab: t[0] } })">
        {{ t[1] }}<span v-if="t[2]" class="ml-1 rounded-full px-1.5 text-[11px] font-bold" :class="t[0] === 'requests' ? 'bg-coral text-white' : 'bg-surface-container'">{{ t[2] }}</span>
      </button>
    </div>
    <div v-if="loading" class="space-y-2"><div v-for="i in 4" :key="i" class="h-20 card skeleton" /></div>
    <template v-else>
      <div v-if="tab === 'requests'" class="space-y-2">
        <div v-for="r in incoming" :key="r.user.id" class="card p-4 flex items-center gap-3 flex-wrap">
          <RouterLink :to="`/u/${r.user.handle}`"><Avatar :user="r.user" :size="52" /></RouterLink>
          <div class="flex-1 min-w-[160px]"><UserName :user="r.user" /><p class="text-body-sm text-on-surface-variant">@{{ r.user.handle }} · {{ timeAgo(r.at) }} ago</p></div>
          <FriendButton :user="r.user" size="sm" @change="(f) => changed(incoming, r.user.id, f)" />
        </div>
        <Empty v-if="!incoming.length" emoji="🤝" title="No friend requests" body="When someone wants to be friends, it shows up here." />
      </div>
      <div v-else-if="tab === 'sent'" class="space-y-2">
        <div v-for="r in outgoing" :key="r.user.id" class="card p-4 flex items-center gap-3 flex-wrap">
          <RouterLink :to="`/u/${r.user.handle}`"><Avatar :user="r.user" :size="52" /></RouterLink>
          <div class="flex-1 min-w-[160px]"><UserName :user="r.user" /><p class="text-body-sm text-on-surface-variant">Sent {{ timeAgo(r.at) }} ago</p></div>
          <FriendButton :user="r.user" size="sm" @change="(f) => changed(outgoing, r.user.id, f)" />
        </div>
        <Empty v-if="!outgoing.length" emoji="📨" title="No pending requests" />
      </div>
      <div v-else class="grid sm:grid-cols-2 gap-2">
        <div v-for="f in friends" :key="f.user.id" class="card p-4 flex items-center gap-3">
          <RouterLink :to="`/u/${f.user.handle}`"><Avatar :user="f.user" :size="48" /></RouterLink>
          <div class="flex-1 min-w-0"><UserName :user="f.user" /><p class="text-body-sm text-on-surface-variant truncate">Friends since {{ new Date(f.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) }}</p></div>
          <button class="btn-icon" aria-label="Message" @click="api.openConversation(f.user.id).then((r) => router.push(`/messages/${r.conversation.id}`))"><Icon name="chat" /></button>
        </div>
        <Empty v-if="!friends.length" class="sm:col-span-2" emoji="🫶" title="No friends yet" body="Send a friend request from anyone’s profile."><RouterLink v-if="s.user" to="/members" class="btn-primary">Find people</RouterLink></Empty>
      </div>
    </template>
  </div>
</template>
