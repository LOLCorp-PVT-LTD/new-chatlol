<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { timeAgo } from '@chatlol/shared';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
import Empty from './Empty.vue';

const emit = defineEmits<{ (e: 'close'): void }>();
const s = useSession();
const router = useRouter();
const icons: Record<string, string> = { rating: 'star', gift: 'redeem', invite: 'live_tv', consensus: 'verified', drop: 'wb_twilight', follow: 'person_add', comment: 'chat_bubble', dm: 'mail', arena: 'swords', level: 'military_tech', system: 'campaign', mention: 'alternate_email', profile_view: 'visibility', profile_rating: 'star', wall: 'sticky_note_2', birthday: 'cake' };
onMounted(async () => {
  await s.loadNotifications();
  if (s.unread) { await api.markNotificationsRead(); s.unread = 0; }
});
const go = (link: string | null) => { if (link) router.push(link); emit('close'); };
const canAsk = ref('Notification' in window && Notification.permission === 'default');
const askPermission = async () => { await Notification.requestPermission(); canAsk.value = false; };
</script>
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70]" @click.self="emit('close')">
      <div class="absolute right-2 sm:right-6 top-[calc(env(safe-area-inset-top)+72px)] w-[min(96vw,400px)] max-h-[75dvh] overflow-y-auto card shadow-float animate-pop">
        <div class="sticky top-0 bg-surface-container-lowest px-5 py-4 flex items-center justify-between border-b border-sandstone">
          <h2 class="text-headline-md">Notifications</h2>
          <button class="btn-icon -mr-2" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
        </div>
        <button v-if="canAsk" class="m-3 w-[calc(100%-24px)] btn-secondary" @click="askPermission">
          <Icon name="notifications_active" /> Turn on desktop alerts</button>
        <Empty v-if="!s.notifications.length" emoji="🔔" title="All caught up" body="Ratings, gifts and invites land here." />
        <button v-for="n in s.notifications" :key="n.id" class="w-full text-left flex gap-3 px-5 py-3.5 hover:bg-surface-container-low transition" :class="{ 'bg-sunlit/60': !n.read }" @click="go(n.link)">
          <div class="relative">
            <Avatar v-if="n.actor" :user="n.actor" :size="44" :show-online="false" />
            <span v-else-if="n.anonymous" class="block w-11 h-11 rounded-full overflow-hidden"><img :src="n.teaserAvatar!" alt="Someone" class="w-full h-full object-cover blur-[6px] scale-125" /></span>
            <span v-else class="w-11 h-11 rounded-full bg-sunset text-white flex items-center justify-center"><Icon :name="icons[n.kind] ?? 'bolt'" /></span>
            <span v-if="n.actor || n.anonymous" class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-flame text-white flex items-center justify-center ring-2 ring-surface-container-lowest"><Icon :name="icons[n.kind] ?? 'bolt'" :size="14" fill /></span>
          </div>
          <div class="min-w-0 flex-1"><p class="text-label-lg">{{ n.title }}</p><p v-if="n.anonymous" class="text-label-sm text-flame">👑 See who with Premium</p><p class="text-body-sm text-on-surface-variant line-clamp-2">{{ n.body }}</p><p class="text-[11px] text-outline mt-0.5">{{ timeAgo(n.createdAt) }} ago</p></div>
        </button>
      </div>
    </div>
  </Teleport>
</template>
