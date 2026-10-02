<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { compact, isStaff } from '@chatlol/shared';
import { useSession } from '../stores/session';
import AccountMenu from './AccountMenu.vue';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
import ThemeSwitch from './ThemeSwitch.vue';

defineEmits<{ (e: 'menu'): void; (e: 'compose'): void; (e: 'notifications'): void }>();
const s = useSession();
const router = useRouter();
const q = ref('');
const search = () => q.value.trim() && router.push({ path: '/members', query: { q: q.value.trim() } });
</script>

<template>
  <header data-topbar class="sticky top-0 z-40 glass shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-[env(safe-area-inset-top)]">
    <div class="max-w-[1320px] mx-auto h-16 lg:h-20 px-4 lg:px-10 flex items-center gap-3">
      <button class="btn-icon w-10 h-10 bg-surface-container-low shadow-warm" aria-label="Open navigation menu" @click="$emit('menu')"><Icon name="menu" /></button>
      <RouterLink to="/" class="shrink-0" aria-label="ChatLOL home"><Logo /></RouterLink>
      <form class="hidden md:flex flex-1 max-w-md relative ml-4" role="search" @submit.prevent="search">
        <Icon name="search" class="absolute left-5 top-1/2 -translate-y-1/2 text-flame" :size="20" />
        <input v-model="q" class="input h-12 pl-12 text-body-md shadow-warm border-transparent" placeholder="Find friends, lounges, vibes…" aria-label="Search" />
      </form>
      <div class="flex-1 md:hidden" />
      <RouterLink to="/roulette" class="hidden lg:flex items-center gap-2 rounded-full border border-sandstone bg-surface-container-lowest px-4 h-12 text-label-md hover:border-flame">
        <Icon name="casino" class="text-flame" :size="20" /> Rate & Meet <span class="text-flame">● Live Deck</span>
      </RouterLink>
      <ThemeSwitch />
      <template v-if="s.user">
        <button class="btn-primary hidden sm:inline-flex" @click="$emit('compose')"><Icon name="add_a_photo" :size="20" /> Post Photo</button>
        <RouterLink to="/vault" class="flex items-center gap-1 bg-surface-container px-3 h-10 rounded-full shadow-warm" :title="`${s.user.sparks} Sparks`">
          <Icon name="local_fire_department" class="text-flame" fill :size="20" /><span class="text-label-md tabular-nums">{{ compact(s.user.sparks) }}</span>
          <span class="hidden sm:inline text-label-md tabular-nums ml-1.5">💎 {{ compact(s.user.gems) }}</span>
        </RouterLink>
        <RouterLink to="/messages" class="btn-icon relative" aria-label="Messages"><Icon name="mail" />
          <span v-if="s.unreadDms" class="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-coral text-white text-[10px] font-bold flex items-center justify-center">{{ s.unreadDms }}</span></RouterLink>
        <button class="btn-icon relative" data-notifications-bell aria-label="Notifications" @click="$emit('notifications')"><Icon name="notifications" />
          <span v-if="s.unread" class="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-flame ring-2 ring-surface animate-pulse-ring" /></button>
        <RouterLink v-if="isStaff(s.user)" to="/admin" class="btn-icon hidden md:inline-flex" aria-label="Admin panel" title="Admin panel"><Icon name="admin_panel_settings" /></RouterLink>
        <AccountMenu />
      </template>
      <template v-else>
        <RouterLink to="/login" class="btn-ghost">Log in</RouterLink>
        <RouterLink to="/join" class="btn-primary">Join</RouterLink>
      </template>
    </div>
  </header>
</template>
