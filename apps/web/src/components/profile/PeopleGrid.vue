<script setup lang="ts">
import type { UserPublic } from '@chatlol/shared';
import Avatar from '../Avatar.vue';

/** Friends / followers / following as avatar tiles. */
defineProps<{ people: UserPublic[]; total?: number; empty: string }>();
</script>

<template>
  <div v-if="people.length">
    <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(78px, 1fr))">
      <RouterLink v-for="p in people" :key="p.id" :to="`/u/${p.handle}`" class="tile rounded-md p-2 text-center hover:scale-[1.03] transition min-w-0">
        <Avatar :user="p" :size="52" class="mx-auto" />
        <p class="text-label-sm mt-1 truncate">{{ p.displayName.split(' ')[0] }}</p>
      </RouterLink>
    </div>
    <p v-if="total && total > people.length" class="text-body-sm muted mt-2">+ {{ total - people.length }} more</p>
  </div>
  <p v-else class="text-body-md muted py-4 text-center">{{ empty }}</p>
</template>
