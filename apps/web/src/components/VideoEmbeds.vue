<script setup lang="ts">
import { computed, ref } from 'vue';
import { youtubeVideos } from '@chatlol/shared';

/**
 * YouTube players for the videos linked in a piece of text. Each shows the thumbnail first and only loads the
 * player when tapped (privacy-enhanced youtube-nocookie.com), so long feeds stay fast and nobody is tracked
 * just by scrolling past.
 */
const props = withDefaults(defineProps<{ text: string | null | undefined; max?: number; compact?: boolean }>(), { max: 2 });
const videos = computed(() => youtubeVideos(props.text, props.max));
const playing = ref<Record<string, boolean>>({});
const src = (id: string, start: number) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1${start ? `&start=${start}` : ''}`;
</script>

<template>
  <div v-if="videos.length" class="space-y-2" :class="compact ? 'max-w-[340px]' : ''" @click.stop>
    <div v-for="v in videos" :key="v.id" class="yt relative overflow-hidden rounded-md bg-black shadow-warm"
      :class="v.shorts ? 'aspect-[9/16] max-h-[520px] max-w-[300px]' : 'aspect-video w-full'">
      <iframe v-if="playing[v.id]" :src="src(v.id, v.start)" class="absolute inset-0 w-full h-full" title="YouTube video" loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" />
      <button v-else type="button" class="group absolute inset-0 w-full h-full" :aria-label="`Play YouTube video${v.start ? ` from ${v.start}s` : ''}`" @click="playing[v.id] = true">
        <img :src="`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
        <span class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/25" />
        <span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[68px] h-12 rounded-[14px] bg-[#ff0033] shadow-[0_6px_20px_rgb(0_0_0/.45)] flex items-center justify-center transition-transform group-hover:scale-110">
          <svg viewBox="0 0 24 24" class="w-6 h-6 fill-white ml-0.5"><path d="M8 5v14l11-7z" /></svg>
        </span>
        <span class="absolute left-3 bottom-2.5 flex items-center gap-1.5 text-white text-label-sm font-bold drop-shadow">
          <svg viewBox="0 0 28 20" class="h-3.5"><rect width="28" height="20" rx="5" fill="#ff0033" /><path d="M11 6v8l7-4z" fill="#fff" /></svg>
          {{ v.shorts ? 'YouTube Shorts' : 'YouTube' }}<template v-if="v.start"> · from {{ Math.floor(v.start / 60) }}:{{ String(v.start % 60).padStart(2, '0') }}</template>
        </span>
      </button>
      <a :href="v.url" target="_blank" rel="noopener noreferrer nofollow" class="absolute right-2 top-2 rounded-full bg-black/55 text-white text-[11px] font-semibold px-2.5 py-1 backdrop-blur-sm hover:bg-black/75">Open ↗</a>
    </div>
  </div>
</template>
