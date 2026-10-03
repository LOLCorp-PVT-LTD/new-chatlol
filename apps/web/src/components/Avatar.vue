<script setup lang="ts">
import { computed } from 'vue';
import type { UserPublic } from '@chatlol/shared';
import { FRAMES } from '../lib/cosmetics';

const props = withDefaults(defineProps<{ user: Pick<UserPublic, 'avatarUrl' | 'displayName' | 'online' | 'cosmetics'> & Partial<UserPublic>; size?: number; live?: boolean; showOnline?: boolean }>(), { size: 40, showOnline: true });
const KING_RING = 'conic-gradient(from 0deg, #fde047, #d4a017, #fff3b0, #b8860b, #fde047)';
const ring = computed(() => (props.user.isKing ? KING_RING : props.live ? FRAMES.frame_sunset : props.user.cosmetics?.frame ? FRAMES[props.user.cosmetics.frame] : null));
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
    <!-- King of ChatLOL: golden crown on top -->
    <svg v-if="user.isKing" class="absolute left-1/2 -translate-x-1/2 drop-shadow-[0_2px_3px_rgba(120,80,0,.5)] pointer-events-none" :style="{ width: size * 0.62 + 'px', top: -size * 0.36 + 'px' }" viewBox="0 0 64 44" aria-label="King of ChatLOL" role="img">
      <defs><linearGradient id="kingGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0" /><stop offset=".45" stop-color="#fcd34d" /><stop offset="1" stop-color="#b8860b" /></linearGradient></defs>
      <path d="M4 14 L18 26 L32 4 L46 26 L60 14 L54 40 H10 Z" fill="url(#kingGold)" stroke="#8a6d00" stroke-width="2" stroke-linejoin="round" />
      <circle cx="32" cy="4" r="3.5" fill="#ef4444" stroke="#8a6d00" stroke-width="1.5" /><circle cx="4" cy="14" r="3" fill="#38bdf8" stroke="#8a6d00" stroke-width="1.5" /><circle cx="60" cy="14" r="3" fill="#38bdf8" stroke="#8a6d00" stroke-width="1.5" />
      <rect x="10" y="34" width="44" height="6" rx="1.5" fill="#d4a017" />
    </svg>
    <span v-if="showOnline && user.online" class="absolute bottom-0 right-0 rounded-full bg-online ring-2 ring-surface-container-lowest"
      :style="{ width: Math.max(8, size / 4.5) + 'px', height: Math.max(8, size / 4.5) + 'px' }" />
  </div>
</template>
