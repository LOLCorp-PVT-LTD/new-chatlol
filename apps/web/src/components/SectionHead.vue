<script setup lang="ts">
import Icon from './Icon.vue';
/** Section title with an arrow button that opens the section's full page. */
defineProps<{ title: string; icon: string; to?: string; hint?: string }>();
</script>
<template>
  <div class="flex items-center gap-3 mb-3">
    <span class="w-9 h-9 rounded-full bg-sunlit text-flame flex items-center justify-center shrink-0"><Icon :name="icon" :size="20" fill /></span>
    <div class="min-w-0 flex-1">
      <h2 class="text-headline-sm truncate">{{ title }}</h2>
      <p v-if="hint" class="text-body-sm text-on-surface-variant truncate">{{ hint }}</p>
    </div>
    <slot />
    <RouterLink v-if="to" :to="to" class="btn-icon bg-surface-container-low hover:bg-sunset hover:text-white shrink-0" :aria-label="`Open ${title}`" :title="`Open ${title}`">
      <Icon name="arrow_forward" />
    </RouterLink>
  </div>
</template>
