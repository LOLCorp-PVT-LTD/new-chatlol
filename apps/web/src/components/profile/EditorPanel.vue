<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Sortable from 'sortablejs';
import type { ProfileSection, SectionType } from '@chatlol/shared';
import { CORNER_STYLES, HEADER_STYLES, LAYOUT_PRESETS, PAGE_WIDTHS, PROFILE_FONTS, PROFILE_SECTIONS, SECTION_GAPS } from '@chatlol/shared';
import Icon from '../Icon.vue';
import { useProfileCtx } from './context';
import SectionSettings from './SectionSettings.vue';

/** The page builder's side panel: add sections (drag or tap), page layout & presets, selected section's settings. */
const props = defineProps<{ selected: ProfileSection | null }>();
const emit = defineEmits<{
  (e: 'add', type: SectionType): void;
  (e: 'preset', key: string): void;
  (e: 'changed'): void;
  (e: 'deselect'): void;
  (e: 'remove', id: string): void;
  (e: 'look', tab: 'look' | 'song' | 'about'): void;
}>();
const ctx = useProfileCtx();
const tab = ref<'add' | 'page' | 'section'>('add');
const palette = ref<HTMLElement>();
const used = computed(() => new Set(ctx.layout.value.sections.map((s) => s.type)));
let sortable: Sortable | null = null;

watch(
  () => props.selected?.id,
  (id) => (tab.value = id ? 'section' : tab.value === 'section' ? 'add' : tab.value),
);
watch(
  [tab, palette],
  () =>
    void nextTick(() => {
      sortable?.destroy();
      sortable = null;
      if (tab.value === 'add' && palette.value)
        sortable = Sortable.create(palette.value, {
          group: { name: 'profile', pull: 'clone', put: false },
          sort: false,
          draggable: '.pal-item',
          delay: 120,
          delayOnTouchOnly: true,
          animation: 150,
        });
    }),
  { immediate: true },
);
onBeforeUnmount(() => sortable?.destroy());

const set = <K extends 'header' | 'width' | 'gap' | 'corners' | 'font'>(k: K, v: string) => {
  (ctx.layout.value as unknown as Record<string, string>)[k] = v;
  emit('changed');
};
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex gap-1 p-2 border-b border-outline-variant/40 shrink-0">
      <button v-for="t in ([['add', 'add_box', 'Add'], ['page', 'view_quilt', 'Page'], ['section', 'tune', 'Section']] as const)" :key="t[0]" class="flex-1 h-10 rounded-md text-label-lg inline-flex items-center justify-center gap-1.5 disabled:opacity-40" :class="tab === t[0] ? 'bg-sunset text-white' : 'hover:bg-surface-container-low'" :disabled="t[0] === 'section' && !selected" @click="tab = t[0]"><Icon :name="t[1]" :size="18" /> {{ t[2] }}</button>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <!-- Add sections -->
      <div v-if="tab === 'add'">
        <p class="text-body-sm text-on-surface-variant mb-3">Drag a section onto your page, or tap to add it at the end.</p>
        <div ref="palette" class="grid grid-cols-2 gap-2">
          <button v-for="d in PROFILE_SECTIONS" :key="d.key" :data-type="d.key" class="pal-item text-left rounded-md border p-2.5 hover:border-flame hover:bg-sunlit transition cursor-grab active:cursor-grabbing" :class="used.has(d.key) && !d.multi ? 'border-transparent bg-surface-container-low opacity-60' : 'border-sandstone bg-surface-container-lowest'" @click="emit('add', d.key)">
            <span class="text-xl">{{ d.emoji }}</span>
            <p class="text-label-lg leading-tight mt-1">{{ d.label }}</p>
            <p class="text-[11px] text-on-surface-variant leading-snug mt-0.5 line-clamp-2">{{ used.has(d.key) && !d.multi ? 'On your page — tap to find it' : d.desc }}</p>
          </button>
        </div>
      </div>

      <!-- Page layout -->
      <div v-else-if="tab === 'page'" class="space-y-5">
        <div><p class="label mb-2">Start from a preset</p>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="p in LAYOUT_PRESETS" :key="p.key" class="text-left rounded-md border border-sandstone p-2.5 hover:border-flame" @click="emit('preset', p.key)"><p class="text-label-lg">{{ p.label }}</p><p class="text-[11px] text-on-surface-variant">{{ p.desc }}</p></button>
          </div>
          <p class="text-body-sm text-on-surface-variant mt-1.5">Replaces your sections — you can undo.</p></div>
        <div><p class="label mb-2">Header</p>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="h in HEADER_STYLES" :key="h.key" class="text-left rounded-md border p-2.5" :class="ctx.layout.value.header === h.key ? 'border-flame ring-2 ring-flame/30 bg-sunlit' : 'border-sandstone'" @click="set('header', h.key)"><p class="text-label-lg">{{ h.label }}</p><p class="text-[11px] text-on-surface-variant">{{ h.desc }}</p></button>
          </div></div>
        <div v-for="g in ([['width', 'Page width', PAGE_WIDTHS], ['gap', 'Spacing', SECTION_GAPS], ['corners', 'Corners', CORNER_STYLES], ['font', 'Font', PROFILE_FONTS]] as const)" :key="g[0]">
          <p class="label mb-2">{{ g[1] }}</p>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="o in g[2]" :key="o.key" class="chip h-9" :class="{ 'chip-active': ctx.layout.value[g[0]] === o.key }" :style="g[0] === 'font' ? { fontFamily: (o as { css?: string }).css } : {}" @click="set(g[0], o.key)">{{ o.label }}</button>
          </div>
        </div>
        <div><p class="label mb-2">Background, colours, cover & song</p>
          <div class="grid grid-cols-3 gap-2">
            <button class="btn-secondary h-11 px-2" @click="emit('look', 'look')"><Icon name="palette" :size="18" /> Look</button>
            <button class="btn-secondary h-11 px-2" @click="emit('look', 'song')"><Icon name="music_note" :size="18" /> Song</button>
            <button class="btn-secondary h-11 px-2" @click="emit('look', 'about')"><Icon name="person" :size="18" /> About</button>
          </div></div>
      </div>

      <!-- Selected section -->
      <SectionSettings v-else-if="selected" :key="selected.id" :section="selected" @changed="emit('changed')" @remove="emit('remove', selected.id)" @close="emit('deselect')" />
    </div>
  </div>
</template>
