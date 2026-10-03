<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { adSlots, loadAds } from '../lib/ads';

/**
 * One ad placement. Staff-set ad code runs in a sandboxed iframe (scripts and pop-ups allowed, but no access to
 * the page, cookies or the member's session). 'direct' slots inject the code into the page instead, for ad networks
 * that refuse to run sandboxed. A house ad is a plain image link.
 */
const props = defineProps<{ placement: string }>();
const ad = computed(() => adSlots.value[props.placement] ?? null);
const host = ref<HTMLElement>();
onMounted(() => void loadAds());

const doc = computed(() =>
  ad.value?.code
    ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;display:flex;justify-content:center}</style></head><body>${ad.value.code}</body></html>`
    : '',
);

// Direct mode: insert the code and re-create its <script> tags so they run.
watch([ad, host], () => {
  if (!host.value || ad.value?.mode !== 'direct' || !ad.value.code) return;
  host.value.innerHTML = ad.value.code;
  host.value.querySelectorAll('script').forEach((old) => {
    const s = document.createElement('script');
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    s.text = old.text;
    old.replaceWith(s);
  });
}, { immediate: true });
</script>

<template>
  <aside v-if="ad" class="ad-slot rounded-lg overflow-hidden relative" :aria-label="'Advertisement'">
    <span class="absolute top-1 right-2 text-[10px] uppercase tracking-wider text-on-surface-variant/70 z-10">Ad</span>
    <a v-if="ad.imageUrl && !ad.code" :href="ad.linkUrl ?? '#'" target="_blank" rel="noopener sponsored" class="block"><img :src="ad.imageUrl" alt="Sponsored" class="w-full h-auto block" loading="lazy" /></a>
    <iframe v-else-if="ad.mode !== 'direct'" :srcdoc="doc" class="w-full block border-0" :style="{ height: (ad.height ?? 120) + 'px' }"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer-when-downgrade" loading="lazy" title="Advertisement" />
    <div v-else ref="host" class="flex justify-center" :style="{ minHeight: (ad.height ?? 90) + 'px' }" />
  </aside>
</template>
