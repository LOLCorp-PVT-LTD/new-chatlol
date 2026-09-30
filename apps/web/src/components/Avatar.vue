<script setup lang="ts">
import { computed } from 'vue';
import type { UserPublic } from '@chatlol/shared';
import { FRAMES } from '../lib/cosmetics';

const props = withDefaults(defineProps<{ user: Pick<UserPublic, 'avatarUrl' | 'displayName' | 'online' | 'cosmetics'> & Partial<UserPublic>; size?: number; live?: boolean; showOnline?: boolean }>(), { size: 40, showOnline: true });
const ring = computed(() => (props.live ? FRAMES.frame_sunset : props.user.cosmetics?.frame ? FRAMES[props.user.cosmetics.frame] : null));
const pad = computed(() => (ring.value ? Math.max(2, Math.round(props.size / 18)) : 0));
const initials = computed(() => props.user.displayName?.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase());
</script>
<template>
  <div class="relative shrink-0" :style="{ width: size + 'px', height: size + 'px' }">
    <div class="w-full h-full rounded-full" :class="{ 'animate-pulse-ring': live, 'animate-[spin_6s_linear_infinite]': user.cosmetics?.frame === 'frame_god' }"
      :style="{ background: ring ?? 'transparent', padding: pad + 'px' }">
      <div class="w-full h-full rounded-full overflow-hidden bg-primary-fixed ring-2 ring-surface-container-lowest flex items-center justify-center"
        :class="{ 'animate-[spin_6s_linear_infinite_reverse]': user.cosmetics?.frame === 'frame_god' }">
        <img v-if="user.avatarUrl" :src="user.avatarUrl" :alt="user.displayName" class="w-full h-full object-cover" loading="lazy" />
        <span v-else class="text-on-primary-fixed font-bold" :style="{ fontSize: size * 0.36 + 'px' }">{{ initials }}</span>
      </div>
    </div>
    <span v-if="showOnline && user.online" class="absolute bottom-0 right-0 rounded-full bg-online ring-2 ring-surface-container-lowest"
      :style="{ width: Math.max(8, size / 4.5) + 'px', height: Math.max(8, size / 4.5) + 'px' }" />
  </div>
</template>
