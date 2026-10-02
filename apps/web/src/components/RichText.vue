<script setup lang="ts">
import { computed } from 'vue';
import { customEmojiUri, isJumbo, parseRich } from '@chatlol/shared';

/**
 * User text with ChatLOL custom emoji (:code:) drawn as rounded tiles, @mentions linked to profiles and,
 * optionally, #tags highlighted. Text that's only 1–3 custom emoji is shown big.
 */
const props = withDefaults(defineProps<{ text: string | null | undefined; tags?: boolean; jumbo?: boolean }>(), { jumbo: true });
const parts = computed(() => parseRich(props.text));
const big = computed(() => props.jumbo && isJumbo(parts.value));
const split = (v: string) => (props.tags ? v.split(/(#[\p{L}\p{N}_]+)/u).filter(Boolean) : [v]);
</script>

<template>
  <template v-for="(p, i) in parts" :key="i">
    <img v-if="p.t === 'emoji'" :src="customEmojiUri(p.code)" :alt="`:${p.code}:`" :title="`:${p.code}:`" class="cemoji" :class="{ 'cemoji-big': big }" draggable="false" />
    <RouterLink v-else-if="p.t === 'mention'" :to="`/u/${p.handle}`" class="font-bold hover:underline text-primary">@{{ p.handle }}</RouterLink>
    <template v-else>
      <template v-for="(seg, j) in split(p.v)" :key="j">
        <RouterLink v-if="tags && seg.startsWith('#')" :to="`/feed?tag=${seg.slice(1).toLowerCase()}`" class="text-primary font-bold hover:underline">{{ seg }}</RouterLink>
        <template v-else>{{ seg }}</template>
      </template>
    </template>
  </template>
</template>

<style scoped>
.cemoji { display: inline-block; width: 1.35em; height: 1.35em; vertical-align: -0.3em; margin: 0 0.05em; border-radius: 24%; }
.cemoji-big { width: 3.4rem; height: 3.4rem; vertical-align: middle; margin: 2px; }
</style>
