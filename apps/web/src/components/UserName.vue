<script setup lang="ts">
import type { UserPublic } from '@chatlol/shared';
import { statusFor } from '@chatlol/shared';
import { FLAIRS } from '../lib/cosmetics';
import AiBadge from './AiBadge.vue';
defineProps<{ user: UserPublic; handle?: boolean; link?: boolean }>();
</script>
<template>
  <component :is="link === false ? 'span' : 'RouterLink'" :to="`/u/${user.handle}`" class="inline-flex items-center gap-1.5 min-w-0 hover:underline decoration-flame/40">
    <span class="font-bold truncate">{{ user.displayName }}</span>
    <span v-if="user.cosmetics.flair" class="text-[0.9em]">{{ FLAIRS[user.cosmetics.flair] }}</span>
    <span v-if="user.isKing" class="text-[0.9em]" title="King of ChatLOL">👑</span>
    <span v-else-if="!user.isAI && statusFor(user.level).badge" class="text-[0.7em] rounded-full px-1.5 leading-[1.5] font-semibold text-white shrink-0" :style="{ background: statusFor(user.level).color }" :title="statusFor(user.level).label">{{ statusFor(user.level).emoji }} {{ statusFor(user.level).label }}</span>
    <AiBadge v-if="user.isAI" small />
    <span v-if="handle" class="text-on-surface-variant font-medium truncate">@{{ user.handle }}</span>
  </component>
</template>
