<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import type { StoreItem } from '@chatlol/shared';
import { buttonStyleByKey, coverByKey, shopFontByKey } from '@chatlol/shared';
import { useSession } from '../stores/session';
import { BANNERS, FLAIRS, FRAMES, THEMES } from '../lib/cosmetics';
import { loadFont } from '../lib/fonts';
import Avatar from './Avatar.vue';

/**
 * A live preview of a Vault item instead of an emoji: your own picture in a frame, the real cover art, the font
 * set in itself, the button in its style, a name with the flair. Items with no look (power-ups, tickets) get art.
 */
const props = defineProps<{ item: StoreItem }>();
const s = useSession();
const me = computed(() => s.user ?? { avatarUrl: '', displayName: 'You', online: false, cosmetics: { frame: null, flair: null, theme: null, banner: null } });
const font = computed(() => (props.item.kind === 'font' ? shopFontByKey(props.item.id) : undefined));
watchEffect(() => loadFont(font.value?.family));
const cover = computed(() => coverByKey(props.item.id)?.css ?? props.item.preview);
const btn = computed(() => buttonStyleByKey(props.item.id)?.css);
const tile = computed(() => THEMES[props.item.id] ?? BANNERS[props.item.id] ?? props.item.preview);
</script>

<template>
  <div class="h-28 relative overflow-hidden flex items-center justify-center select-none">
    <!-- Frame: your avatar wearing it -->
    <template v-if="item.kind === 'frame'">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgb(var(--c-sunlit)),rgb(var(--c-surface-container-low)))]" />
      <Avatar :user="{ ...me, cosmetics: { ...me.cosmetics, frame: FRAMES[item.id] ? item.id : null } }" :size="76" :show-online="false" class="relative" />
    </template>
    <!-- Flair: your name with it -->
    <template v-else-if="item.kind === 'flair'">
      <div class="absolute inset-0 bg-surface-container-low" />
      <p class="relative text-label-lg rounded-full bg-surface-container-lowest px-4 py-2 shadow-warm">{{ me.displayName.split(' ')[0] }} <span class="text-lg">{{ FLAIRS[item.id] ?? item.emoji }}</span></p>
    </template>
    <!-- Cover / theme / banner: the real art -->
    <div v-else-if="item.kind === 'cover' || item.kind === 'theme' || item.kind === 'banner'" class="absolute inset-0" :style="{ background: item.kind === 'cover' ? cover : tile }">
      <div v-if="item.kind === 'cover'" class="absolute left-3 bottom-2 flex items-center gap-2"><Avatar :user="me" :size="34" :show-online="false" class="ring-2 ring-white rounded-full" /><span class="h-2 w-16 rounded-full bg-white/80" /></div>
    </div>
    <!-- Font: set in itself -->
    <template v-else-if="item.kind === 'font'">
      <div class="absolute inset-0 bg-surface-container-low" />
      <div class="relative text-center" :style="{ fontFamily: font?.css }"><p class="text-[34px] leading-none">Aa Gg</p><p class="text-body-md mt-1">{{ me.displayName.split(' ')[0] }}’s page</p></div>
    </template>
    <!-- Button style -->
    <template v-else-if="item.kind === 'button'">
      <div class="absolute inset-0 bg-[linear-gradient(135deg,#ff9a6b,#7c5cff)]" />
      <span class="relative inline-flex items-center gap-1 h-10 px-5 rounded-full text-label-lg" :style="btn">Follow</span>
    </template>
    <!-- Everything else: illustrated tile -->
    <template v-else>
      <div class="absolute inset-0" :style="{ background: item.preview || 'linear-gradient(135deg,rgb(var(--c-tangerine)),rgb(var(--c-flame)))' }" />
      <div class="absolute -right-4 -bottom-6 text-[96px] opacity-25 rotate-12">{{ item.emoji }}</div>
      <span class="relative text-5xl drop-shadow-[0_6px_10px_rgba(0,0,0,.25)]">{{ item.emoji }}</span>
    </template>
  </div>
</template>
