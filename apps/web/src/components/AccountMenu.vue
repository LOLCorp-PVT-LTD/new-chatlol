<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { isStaff } from '@chatlol/shared';
import { useSession } from '../stores/session';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';

/** The avatar in the top bar: a menu with your profile, friends, settings and log out. */
const s = useSession();
const route = useRoute();
const open = ref(false);
const root = ref<HTMLElement>();
const close = () => (open.value = false);
const onDoc = (e: MouseEvent) => { if (!root.value?.contains(e.target as Node)) close(); };
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
watch(open, (v) => {
  if (v) { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); }
  else { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); }
});
watch(() => route.fullPath, close);
onBeforeUnmount(() => (open.value = false));
const items = [
  ['/me', 'person', 'My profile'],
  ['/me?edit=1', 'dashboard_customize', 'Edit my page'],
  ['/friends', 'diversity_3', 'Friends'],
  ['/insights', 'visibility', 'Who viewed me'],
  ['/vault', 'local_fire_department', 'Sparks Vault'],
  ['/premium', 'workspace_premium', 'Premium'],
  ['/settings', 'settings', 'Settings'],
] as const;
</script>

<template>
  <div v-if="s.user" ref="root" class="relative">
    <button class="flex items-center gap-1 rounded-full pr-1 hover:bg-surface-container-low" aria-haspopup="menu" :aria-expanded="open" aria-label="Account menu" @click="open = !open">
      <Avatar :user="s.user" :size="36" :show-online="false" />
      <Icon name="expand_more" :size="18" class="hidden sm:block text-on-surface-variant transition-transform" :class="{ 'rotate-180': open }" />
    </button>
    <Transition enter-from-class="opacity-0 -translate-y-1" leave-to-class="opacity-0 -translate-y-1" enter-active-class="transition duration-150" leave-active-class="transition duration-100">
      <div v-if="open" role="menu" class="absolute right-0 top-full mt-2 w-64 card p-2 shadow-float z-50">
        <RouterLink to="/me" class="flex items-center gap-3 rounded-md p-2 hover:bg-surface-container-low">
          <Avatar :user="s.user" :size="40" :show-online="false" />
          <div class="min-w-0"><p class="text-label-lg truncate">{{ s.user.displayName }}</p><p class="text-body-sm text-on-surface-variant truncate">@{{ s.user.handle }}</p></div>
        </RouterLink>
        <div class="h-px bg-outline-variant/40 my-1.5" />
        <RouterLink v-for="i in items" :key="i[0]" :to="i[0]" role="menuitem" class="flex items-center gap-3 rounded-md px-3 h-10 text-label-lg hover:bg-surface-container-low" :class="{ 'is-on': route.path === i[0] }">
          <Icon :name="i[1]" :size="20" class="text-on-surface-variant" /> {{ i[2] }}
        </RouterLink>
        <RouterLink v-if="isStaff(s.user)" to="/admin" role="menuitem" class="flex items-center gap-3 rounded-md px-3 h-10 text-label-lg hover:bg-surface-container-low" :class="{ 'is-on': route.path.startsWith('/admin') }">
          <Icon name="admin_panel_settings" :size="20" class="text-on-surface-variant" /> Admin panel
        </RouterLink>
        <div class="h-px bg-outline-variant/40 my-1.5" />
        <button role="menuitem" class="w-full flex items-center gap-3 rounded-md px-3 h-10 text-label-lg text-error hover:bg-surface-container-low" @click="close(); s.logout()"><Icon name="logout" :size="20" /> Log out</button>
      </div>
    </Transition>
  </div>
</template>
