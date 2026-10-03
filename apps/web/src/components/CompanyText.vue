<script setup lang="ts">
import { computed } from 'vue';
import { COMPANY_NAME, COMPANY_URL } from '@chatlol/shared';

/** Text in which every mention of LOLCorp PVT LTD links (dofollow) to lolcorp.co.uk. */
const props = defineProps<{ text: string }>();
const parts = computed(() => props.text.split(new RegExp(`(${COMPANY_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?)`)));
</script>
<template>
  <template v-for="(p, i) in parts" :key="i">
    <a v-if="p.startsWith(COMPANY_NAME)" :href="COMPANY_URL" target="_blank" rel="noopener" class="underline decoration-current/40 hover:decoration-current">{{ p }}</a>
    <template v-else>{{ p }}</template>
  </template>
</template>
