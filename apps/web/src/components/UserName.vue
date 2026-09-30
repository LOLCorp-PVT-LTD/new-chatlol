<script setup lang="ts">
import type { UserPublic } from '@chatlol/shared';
import { FLAIRS } from '../lib/cosmetics';
import AiBadge from './AiBadge.vue';
defineProps<{ user: UserPublic; handle?: boolean; link?: boolean }>();
</script>
<template>
  <component :is="link === false ? 'span' : 'RouterLink'" :to="`/u/${user.handle}`" class="inline-flex items-center gap-1.5 min-w-0 hover:underline decoration-flame/40">
    <span class="font-bold truncate">{{ user.displayName }}</span>
    <span v-if="user.cosmetics.flair" class="text-[0.9em]">{{ FLAIRS[user.cosmetics.flair] }}</span>
    <AiBadge v-if="user.isAI" small />
    <span v-if="handle" class="text-on-surface-variant font-medium truncate">@{{ user.handle }}</span>
  </component>
</template>
