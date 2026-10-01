<script setup lang="ts">
import { NAV } from './nav';
import { useSession } from '../stores/session';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
const emit = defineEmits<{ (e: 'close'): void }>();
const s = useSession();
</script>
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[75] bg-inverse-surface/40 backdrop-blur-sm" @click.self="emit('close')">
      <nav class="absolute inset-y-0 left-0 w-[300px] bg-surface p-4 pt-[max(16px,env(safe-area-inset-top))] overflow-y-auto animate-[pop_.25s_ease-out]" aria-label="Menu">
        <div class="flex items-center justify-between mb-4"><Logo variant="wordmark" size="sm" /><button class="btn-icon" aria-label="Close menu" @click="emit('close')"><Icon name="close" /></button></div>
        <RouterLink v-for="n in NAV" :key="n.to" :to="n.to" class="flex items-center gap-3 px-3 py-3 rounded-full text-label-lg hover:bg-surface-container" active-class="bg-sunlit text-flame" @click="emit('close')">
          <Icon :name="n.icon" /> {{ n.label }}
          <span v-if="n.badge === 'dms' && s.unreadDms" class="ml-auto bg-coral text-white rounded-full px-2 text-label-sm">{{ s.unreadDms }}</span>
        </RouterLink>
        <hr class="my-3 border-sandstone" />
        <RouterLink to="/locker" class="flex items-center gap-3 px-3 py-3 rounded-full text-label-lg hover:bg-surface-container" @click="emit('close')"><Icon name="inventory_2" /> My Locker</RouterLink>
        <RouterLink to="/settings" class="flex items-center gap-3 px-3 py-3 rounded-full text-label-lg hover:bg-surface-container" @click="emit('close')"><Icon name="settings" /> Settings</RouterLink>
      </nav>
    </div>
  </Teleport>
</template>
