<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { MONTHS, WEEKDAYS, formatDate, monthGrid, parseIsoDate, toIsoDate } from '@chatlol/shared';
import Icon from './Icon.vue';

/**
 * Sunset-styled date picker: tap the field, pick a year, a month, then a day.
 * `startView="years"` suits birthdays (jump decades instead of clicking back month by month).
 */
const props = withDefaults(
  defineProps<{ modelValue: string; min?: string; max?: string; placeholder?: string; startView?: 'days' | 'months' | 'years'; defaultYear?: number; label?: string }>(),
  { min: '1900-01-01', placeholder: 'Pick a date', startView: 'days' },
);
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();
const open = ref(false);
const view = ref<'days' | 'months' | 'years'>(props.startView);
const today = new Date().toISOString().slice(0, 10);
const maxIso = computed(() => props.max ?? '9999-12-31');
const initial = () => parseIsoDate(props.modelValue) ?? { y: props.defaultYear ?? Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1, d: 1 };
const cursor = ref(initial());
const root = ref<HTMLElement>();
const grid = ref<HTMLElement>();

const yearPageStart = computed(() => cursor.value.y - (cursor.value.y % 20));
const years = computed(() => Array.from({ length: 20 }, (_, i) => yearPageStart.value + i));
const cells = computed(() => monthGrid(cursor.value.y, cursor.value.m));
const minY = computed(() => Number(props.min.slice(0, 4)));
const maxY = computed(() => Number(maxIso.value.slice(0, 4)));
const disabledIso = (iso: string) => iso < props.min || iso > maxIso.value;
const monthDisabled = (m: number) => toIsoDate(cursor.value.y, m, 1) > maxIso.value || toIsoDate(cursor.value.y, m + 1, 0) < props.min;

function toggle() {
  open.value = !open.value;
  if (open.value) {
    cursor.value = initial();
    view.value = props.modelValue ? 'days' : props.startView;
  }
}
function pickYear(y: number) { cursor.value = { ...cursor.value, y }; view.value = 'months'; }
function pickMonth(m: number) { cursor.value = { ...cursor.value, m }; view.value = 'days'; }
function pickDay(iso: string) {
  if (disabledIso(iso)) return;
  emit('update:modelValue', iso);
  open.value = false;
}
function shift(delta: number) {
  if (view.value === 'years') cursor.value = { ...cursor.value, y: cursor.value.y + delta * 20 };
  else if (view.value === 'months') cursor.value = { ...cursor.value, y: cursor.value.y + delta };
  else {
    const d = new Date(Date.UTC(cursor.value.y, cursor.value.m + delta, 1));
    cursor.value = { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: 1 };
  }
}
const canPrev = computed(() => (view.value === 'years' ? yearPageStart.value > minY.value : view.value === 'months' ? cursor.value.y > minY.value : toIsoDate(cursor.value.y, cursor.value.m, 1) > props.min));
const canNext = computed(() => (view.value === 'years' ? yearPageStart.value + 19 < maxY.value : view.value === 'months' ? cursor.value.y < maxY.value : toIsoDate(cursor.value.y, cursor.value.m + 1, 1) <= maxIso.value));

// Keyboard: arrows move the selected day, Enter picks, Escape closes.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') return (open.value = false);
  if (view.value !== 'days') return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (step) {
    e.preventDefault();
    const d = new Date(Date.UTC(cursor.value.y, cursor.value.m, cursor.value.d + step));
    cursor.value = { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
    void nextTick(() => (grid.value?.querySelector('[data-focus="true"]') as HTMLElement | null)?.focus());
  } else if (e.key === 'Enter') {
    e.preventDefault();
    pickDay(toIsoDate(cursor.value.y, cursor.value.m, cursor.value.d));
  }
}
const onDoc = (e: MouseEvent) => { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false; };
watch(open, (o) => (o ? document.addEventListener('mousedown', onDoc) : document.removeEventListener('mousedown', onDoc)));
onUnmounted(() => document.removeEventListener('mousedown', onDoc));
</script>

<template>
  <div ref="root" class="relative" @keydown="onKey">
    <button type="button" class="input flex items-center gap-3 text-left" :class="{ 'border-flame ring-2 ring-flame/20': open }" :aria-label="label ?? placeholder" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
      <Icon name="calendar_month" class="text-flame" />
      <span :class="modelValue ? 'text-on-surface' : 'text-outline'">{{ modelValue ? formatDate(modelValue) : placeholder }}</span>
      <Icon name="expand_more" class="ml-auto text-on-surface-variant transition" :class="{ 'rotate-180': open }" />
    </button>
    <Transition name="fade">
      <div v-if="open" role="dialog" :aria-label="label ?? 'Choose a date'" class="absolute z-50 mt-2 w-full min-w-[300px] max-w-[380px] card shadow-float p-4 animate-pop">
        <div class="flex items-center gap-2 mb-3">
          <button type="button" class="btn-icon w-9 h-9" :disabled="!canPrev" aria-label="Previous" @click="shift(-1)"><Icon name="chevron_left" /></button>
          <button v-if="view === 'days'" type="button" class="flex-1 h-9 rounded-full text-label-lg hover:bg-surface-container-low" @click="view = 'months'">{{ MONTHS[cursor.m] }} {{ cursor.y }}</button>
          <button v-else-if="view === 'months'" type="button" class="flex-1 h-9 rounded-full text-label-lg hover:bg-surface-container-low" @click="view = 'years'">{{ cursor.y }}</button>
          <span v-else class="flex-1 text-center text-label-lg">{{ years[0] }} – {{ years[19] }}</span>
          <button type="button" class="btn-icon w-9 h-9" :disabled="!canNext" aria-label="Next" @click="shift(1)"><Icon name="chevron_right" /></button>
        </div>

        <div v-if="view === 'years'" class="grid grid-cols-4 gap-1.5">
          <button v-for="y in years" :key="y" type="button" :disabled="y < minY || y > maxY" class="h-11 rounded-full text-label-lg transition disabled:opacity-30"
            :class="y === (parseIsoDate(modelValue)?.y ?? -1) ? 'bg-sunset text-white shadow-glow' : 'hover:bg-sunlit'" @click="pickYear(y)">{{ y }}</button>
        </div>

        <div v-else-if="view === 'months'" class="grid grid-cols-3 gap-1.5">
          <button v-for="(name, m) in MONTHS" :key="name" type="button" :disabled="monthDisabled(m)" class="h-12 rounded-full text-label-lg transition disabled:opacity-30"
            :class="m === cursor.m && cursor.y === parseIsoDate(modelValue)?.y ? 'bg-sunset text-white shadow-glow' : 'hover:bg-sunlit'" @click="pickMonth(m)">{{ name.slice(0, 3) }}</button>
        </div>

        <template v-else>
          <div class="grid grid-cols-7 text-center label mb-1"><span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span></div>
          <div ref="grid" class="grid grid-cols-7 gap-0.5" role="grid">
            <button v-for="c in cells" :key="c.iso" type="button" role="gridcell" :disabled="disabledIso(c.iso)" :aria-selected="c.iso === modelValue" :aria-label="formatDate(c.iso)"
              :data-focus="c.y === cursor.y && c.m === cursor.m && c.d === cursor.d" :tabindex="c.y === cursor.y && c.m === cursor.m && c.d === cursor.d ? 0 : -1"
              class="aspect-square rounded-full text-body-md font-bold transition disabled:opacity-25 focus:outline-none focus:ring-2 focus:ring-flame/40"
              :class="[c.iso === modelValue ? 'bg-sunset text-white shadow-glow' : c.iso === today ? 'ring-1 ring-flame text-flame' : 'hover:bg-sunlit', !c.inMonth && c.iso !== modelValue ? 'text-outline/60' : '']"
              @click="pickDay(c.iso)">{{ c.d }}</button>
          </div>
        </template>
        <div class="flex justify-between mt-3 text-label-md">
          <button type="button" class="text-on-surface-variant hover:text-primary" @click="view = 'years'">Jump to year</button>
          <button v-if="modelValue" type="button" class="text-primary" @click="open = false">Done</button>
        </div>
      </div>
    </Transition>
  </div>
</template>
