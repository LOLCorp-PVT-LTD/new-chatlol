<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Sortable from 'sortablejs';
import type { ProfileSection, SectionSize, SectionType } from '@chatlol/shared';
import { MAX_PROFILE_SECTIONS, SECTION_GAPS, SECTION_SIZES, makeSection, sectionCols, sectionDef } from '@chatlol/shared';
import Icon from '../Icon.vue';
import { useMasonry } from '../../lib/masonry';
import { useProfileCtx } from './context';
import SectionFrame from './SectionFrame.vue';
import SectionBody from './SectionBody.vue';

/**
 * The profile's sections on a 12-column grid (one column on phones).
 * In edit mode: drag to reorder, drop new sections in from the palette, drag a section's right edge to resize,
 * click to select it for the settings panel.
 */
const props = defineProps<{ selected?: string | null }>();
const emit = defineEmits<{ (e: 'select', id: string | null): void; (e: 'changed'): void; (e: 'full'): void }>();
const ctx = useProfileCtx();
const grid = ref<HTMLElement>();
const sections = computed(() => ctx.layout.value.sections);
const gapPx = computed(() => SECTION_GAPS.find((g) => g.key === ctx.layout.value.gap)?.px ?? 20);
/** Bumped after a drag so Vue re-renders the list from the array (Sortable moved the DOM itself). */
const renderKey = ref(0);
// Sections pack like masonry: a short section never leaves empty space under it while a taller neighbour finishes.
useMasonry(grid, gapPx, '.sec-item, .sec-empty');
let sortable: Sortable | null = null;

function moveSection(from: number, to: number) {
  const list = ctx.layout.value.sections;
  const [s] = list.splice(from, 1);
  list.splice(to, 0, s);
  renderKey.value++;
  emit('changed');
}
/** Adds a section from the palette at a position (or the end). Single-use sections that already exist are just selected. */
function addSection(type: SectionType, at?: number) {
  const list = ctx.layout.value.sections;
  const def = sectionDef(type);
  const existing = !def?.multi && list.find((s) => s.type === type);
  if (existing) return emit('select', existing.id);
  if (list.length >= MAX_PROFILE_SECTIONS) return emit('full');
  const s = makeSection(type);
  list.splice(at ?? list.length, 0, s);
  renderKey.value++;
  emit('changed');
  emit('select', s.id);
  void nextTick(() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}
defineExpose({ addSection });

function enable() {
  if (sortable || !grid.value) return;
  sortable = Sortable.create(grid.value, {
    group: { name: 'profile', pull: false, put: true },
    draggable: '.sec-item',
    handle: '.sec-handle',
    filter: '.sec-resize',
    preventOnFilter: false,
    animation: 180,
    delay: 120,
    delayOnTouchOnly: true,
    ghostClass: 'sec-ghost',
    chosenClass: 'sec-chosen',
    scroll: true,
    bubbleScroll: true,
    onEnd: (e) => {
      if (e.oldDraggableIndex == null || e.newDraggableIndex == null || e.oldDraggableIndex === e.newDraggableIndex) return;
      moveSection(e.oldDraggableIndex, e.newDraggableIndex);
    },
    onAdd: (e) => {
      const type = (e.item as HTMLElement).dataset.type as SectionType | undefined;
      e.item.remove(); // the palette's clone; Vue renders the real section
      if (type) addSection(type, e.newDraggableIndex ?? undefined);
    },
  });
}
function disable() {
  sortable?.destroy();
  sortable = null;
}
watch(
  () => ctx.editing.value,
  (on) => void nextTick(() => (on ? enable() : disable())),
  { immediate: true },
);
onBeforeUnmount(disable);

// ——— Resize by dragging the right edge: snaps to the widths the section allows ———
const resizing = ref<string | null>(null);
function startResize(e: PointerEvent, s: ProfileSection) {
  const item = (e.currentTarget as HTMLElement).closest('.sec-item') as HTMLElement | null;
  if (!item || !grid.value) return;
  e.preventDefault();
  e.stopPropagation();
  const gridBox = grid.value.getBoundingClientRect();
  const left = item.getBoundingClientRect().left;
  const col = (gridBox.width - 11 * gapPx.value) / 12;
  const allowed = SECTION_SIZES.filter((z) => sectionDef(s.type)?.sizes.includes(z.key));
  resizing.value = s.id;
  const move = (ev: PointerEvent) => {
    const cols = Math.max(1, Math.min(12, Math.round((ev.clientX - left + gapPx.value) / (col + gapPx.value))));
    const best = allowed.reduce((a, b) => (Math.abs(b.cols - cols) < Math.abs(a.cols - cols) ? b : a));
    if (best.key !== s.size) {
      s.size = best.key as SectionSize;
      emit('changed');
    }
  };
  const up = () => {
    resizing.value = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function remove(s: ProfileSection) {
  const list = ctx.layout.value.sections;
  list.splice(list.indexOf(s), 1);
  renderKey.value++;
  emit('changed');
  if (props.selected === s.id) emit('select', null);
}
function duplicate(s: ProfileSection) {
  const list = ctx.layout.value.sections;
  if (list.length >= MAX_PROFILE_SECTIONS) return emit('full');
  const copy = makeSection(s.type, { size: s.size, style: s.style, title: s.title, config: JSON.parse(JSON.stringify(s.config)) });
  list.splice(list.indexOf(s) + 1, 0, copy);
  renderKey.value++;
  emit('changed');
  emit('select', copy.id);
}
</script>

<template>
  <div ref="grid" class="sec-grid" :class="{ editing: ctx.editing.value }" :style="{ columnGap: `${gapPx}px`, marginBottom: `${-gapPx}px` }">
    <div
      v-for="s in sections"
      :id="`sec-${s.id}`"
      :key="`${s.id}-${renderKey}`"
      class="sec-item relative"
      :class="{ 'is-selected': selected === s.id, 'is-resizing': resizing === s.id }"
      :data-cols="sectionCols(s.size)"
      @click="ctx.editing.value && emit('select', s.id)"
    >
      <!-- Edit toolbar -->
      <div v-if="ctx.editing.value" class="sec-toolbar">
        <span class="sec-handle" title="Drag to move"><Icon name="drag_indicator" :size="18" /> {{ sectionDef(s.type)?.emoji }} {{ s.title || sectionDef(s.type)?.label }}</span>
        <span class="flex-1" />
        <span class="hidden sm:inline text-[11px] font-bold opacity-80 px-1">{{ SECTION_SIZES.find((z) => z.key === s.size)?.label }}</span>
        <button class="sec-tb-btn" title="Settings" aria-label="Section settings" @click.stop="emit('select', s.id)"><Icon name="tune" :size="16" /></button>
        <button v-if="sectionDef(s.type)?.multi" class="sec-tb-btn" title="Duplicate" aria-label="Duplicate section" @click.stop="duplicate(s)"><Icon name="content_copy" :size="16" /></button>
        <button class="sec-tb-btn" title="Remove" aria-label="Remove section" @click.stop="remove(s)"><Icon name="close" :size="16" /></button>
      </div>
      <div :class="{ 'sec-content-locked': ctx.editing.value }" class="h-full">
        <SectionFrame :section="s"><SectionBody :section="s" /></SectionFrame>
      </div>
      <div v-if="ctx.editing.value" class="sec-resize hidden md:flex" title="Drag to resize" @pointerdown="startResize($event, s)"><span /></div>
    </div>
    <div v-if="ctx.editing.value && !sections.length" class="sec-empty" data-cols="12">
      <Icon name="dashboard_customize" :size="36" />
      <p class="text-headline-sm mt-2">Your page is empty</p>
      <p class="text-body-md opacity-80">Drag sections here from the panel, or tap one to add it.</p>
    </div>
  </div>
</template>

<style scoped>
/* Positions come from useMasonry (lib/masonry.ts); one column on phones, a 12-column grid from tablets up. */
.sec-grid { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 4px; align-items: start; }
@media (min-width: 768px) { .sec-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); } }
.sec-item { align-self: start; min-width: 0; }
.editing .sec-item { outline: 2px dashed rgb(255 255 255 / 0.55); outline-offset: 3px; border-radius: var(--sec-radius, 16px); cursor: pointer; padding-top: 34px; }
.editing .sec-item.is-selected { outline: 3px solid #ff5e00; }
.sec-toolbar { position: absolute; top: 0; left: 0; right: 0; height: 30px; display: flex; align-items: center; gap: 4px; padding: 0 4px 0 8px; border-radius: 10px; background: rgb(20 12 8 / 0.82); color: #fff; font-size: 12px; font-weight: 700; z-index: 2; }
.is-selected .sec-toolbar { background: #ff5e00; }
.sec-handle { display: inline-flex; align-items: center; gap: 4px; cursor: grab; user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; touch-action: none; }
.sec-handle:active { cursor: grabbing; }
.sec-tb-btn { width: 24px; height: 24px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; }
.sec-tb-btn:hover { background: rgb(255 255 255 / 0.2); }
/* In edit mode the section is a preview: links, players and forms don't react to clicks. */
.sec-content-locked { pointer-events: none; user-select: none; }
.sec-resize { position: absolute; top: 34px; bottom: 0; right: -10px; width: 20px; cursor: ew-resize; align-items: center; justify-content: center; z-index: 3; touch-action: none; }
.sec-resize span { width: 6px; height: 44px; border-radius: 99px; background: #ff5e00; box-shadow: 0 0 0 2px #fff; opacity: 0; transition: opacity 0.15s; }
.sec-item:hover .sec-resize span, .is-selected .sec-resize span, .is-resizing .sec-resize span { opacity: 1; }
.sec-ghost { opacity: 0.35; }
.sec-chosen { transform: scale(1.01); }
.sec-empty { align-self: start; border: 3px dashed rgb(255 255 255 / 0.6); border-radius: 20px; padding: 56px 24px; text-align: center; color: #fff; background: rgb(0 0 0 / 0.25); display: flex; flex-direction: column; align-items: center; }
</style>
