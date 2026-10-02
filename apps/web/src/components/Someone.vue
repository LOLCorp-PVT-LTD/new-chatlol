<script setup lang="ts">
import type { UserPublic } from '@chatlol/shared';
import Avatar from './Avatar.vue';
/** A person, or — without Premium — "Someone" with a blurred stranger photo. */
defineProps<{ user: UserPublic | null; teaser: string | null; size?: number }>();
</script>
<template>
  <RouterLink v-if="user" :to="`/u/${user.handle}`" class="flex items-center gap-3 min-w-0">
    <Avatar :user="user" :size="size ?? 44" /><span class="min-w-0"><span class="text-label-lg block truncate">{{ user.displayName }}</span><span class="text-body-sm text-on-surface-variant truncate">@{{ user.handle }}</span></span>
  </RouterLink>
  <RouterLink v-else to="/premium" class="flex items-center gap-3 min-w-0" title="Unlock with Premium">
    <span class="rounded-full overflow-hidden shrink-0" :style="{ width: (size ?? 44) + 'px', height: (size ?? 44) + 'px' }"><img :src="teaser ?? ''" alt="" class="w-full h-full object-cover blur-[7px] scale-125" /></span>
    <span><span class="text-label-lg block">Someone</span><span class="text-body-sm text-flame">👑 Unlock with Premium</span></span>
  </RouterLink>
</template>
