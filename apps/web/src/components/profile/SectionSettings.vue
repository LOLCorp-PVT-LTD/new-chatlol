<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProfileSection } from '@chatlol/shared';
import { CURRENTLY_LABELS, PREMIUM_PROFILE, SECTION_SIZES, SECTION_STYLES, parseYouTube, sectionDef } from '@chatlol/shared';
import { useSession } from '../../stores/session';
import Icon from '../Icon.vue';
import GameTile from './GameTile.vue';
import { api } from '../../lib/api';
import type { ProfileGame } from '@chatlol/shared';

/** Settings for the selected section: title, width, box style and whatever its type needs. */
const props = defineProps<{ section: ProfileSection }>();
const emit = defineEmits<{ (e: 'changed'): void; (e: 'remove'): void; (e: 'close'): void }>();
const def = computed(() => sectionDef(props.section.type)!);
const spec = computed(() => def.value.config ?? {});
const c = computed(() => props.section.config);
const touch = () => emit('changed');
const session = useSession();
const styleLocked = (key: string) => !session.user?.premiumUntil && PREMIUM_PROFILE.sectionStyles.includes(key);
function pickStyle(key: string) {
  if (styleLocked(key)) return session.toast({ kind: 'info', title: 'That box style is a Premium perk 👑' });
  props.section.style = key as typeof props.section.style;
  touch();
}

const videoInput = ref('');
watch(
  () => props.section.id,
  () => (videoInput.value = c.value.videoId ? `https://youtu.be/${c.value.videoId}` : ''),
  { immediate: true },
);
function setVideo() {
  const id = parseYouTube(videoInput.value);
  c.value.videoId = id ?? '';
  touch();
}
function addItem() {
  c.value.items ??= [];
  if (props.section.type === 'links') c.value.items.push({ label: '', url: 'https://' });
  else c.value.items.push({ label: CURRENTLY_LABELS[c.value.items.length % CURRENTLY_LABELS.length], value: '' });
  touch();
}
// Games I play: search Steam + popular non-Steam games, tap to add or remove.
const gameQ = ref('');
const gameResults = ref<ProfileGame[]>([]);
let gt: ReturnType<typeof setTimeout>;
async function searchGames() {
  try { gameResults.value = (await api.searchGames(gameQ.value.trim() || undefined)).games; } catch { gameResults.value = []; }
}
watch(gameQ, () => { clearTimeout(gt); gt = setTimeout(() => void searchGames(), 300); });
watch(() => props.section.type, (t) => t === 'games' && void searchGames(), { immediate: true });
const hasGame = (g: ProfileGame) => (c.value.items ?? []).some((x) => x.id === g.id);
function toggleGame(g: ProfileGame) {
  c.value.items ??= [];
  const i = c.value.items.findIndex((x) => x.id === g.id);
  if (i >= 0) c.value.items.splice(i, 1);
  else if (c.value.items.length < 24) c.value.items.push(g);
  touch();
}
function removeItem(i: number) {
  c.value.items?.splice(i, 1);
  touch();
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-start gap-3">
      <span class="text-3xl">{{ def.emoji }}</span>
      <div class="flex-1 min-w-0"><p class="text-headline-sm">{{ def.label }}</p><p class="text-body-sm text-on-surface-variant">{{ def.desc }}</p></div>
      <button class="btn-icon w-9 h-9" aria-label="Done" @click="emit('close')"><Icon name="close" /></button>
    </div>

    <label v-if="section.type !== 'spacer'" class="block"><span class="label">Title</span>
      <input v-model="section.title" class="input h-11 mt-1" maxlength="40" :placeholder="def.label" @input="touch" /></label>

    <div><p class="label mb-1.5">Width</p>
      <div class="grid grid-cols-4 gap-1.5">
        <button v-for="z in SECTION_SIZES" :key="z.key" class="h-10 rounded-md border text-label-lg disabled:opacity-30" :class="section.size === z.key ? 'is-on' : 'border-sandstone'" :disabled="!def.sizes.includes(z.key)" @click="section.size = z.key; touch()">{{ z.label }}</button>
      </div>
      <p class="text-body-sm text-on-surface-variant mt-1">Or drag the section’s right edge. On phones every section is full width.</p>
    </div>

    <div><p class="label mb-1.5">Box style</p>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="st in SECTION_STYLES" :key="st.key" class="chip h-9" :class="{ 'chip-active': section.style === st.key }" @click="pickStyle(st.key)">{{ st.label }}<span v-if="styleLocked(st.key)">&nbsp;👑</span></button>
      </div></div>

    <!-- Type-specific settings -->
    <label v-if="spec.limit" class="block"><span class="label">How many to show: {{ c.limit }}</span>
      <input v-model.number="c.limit" type="range" class="w-full accent-flame mt-1" :min="spec.limit.min" :max="spec.limit.max" @input="touch" /></label>
    <div v-if="spec.columns"><p class="label mb-1.5">Columns</p>
      <div class="flex gap-1.5"><button v-for="n in [2, 3, 4, 5]" :key="n" class="chip h-9 w-11 justify-center" :class="{ 'chip-active': c.columns === n }" @click="c.columns = n; touch()">{{ n }}</button></div></div>

    <label v-if="section.type === 'text'" class="block"><span class="label">Text</span>
      <textarea v-model="c.body" class="textarea mt-1" rows="7" maxlength="1500" placeholder="Anything you want people to know…" @input="touch" />
      <span class="text-body-sm text-on-surface-variant">{{ (c.body ?? '').length }}/1500</span></label>

    <template v-if="section.type === 'quote'">
      <label class="block"><span class="label">Quote</span><textarea v-model="c.text" class="textarea mt-1" rows="3" maxlength="200" @input="touch" /></label>
      <label class="block"><span class="label">Who said it (optional)</span><input v-model="c.by" class="input h-11 mt-1" maxlength="60" @input="touch" /></label>
    </template>

    <div v-if="section.type === 'video'"><p class="label mb-1.5">YouTube link</p>
      <div class="flex gap-2"><input v-model="videoInput" class="input h-11" placeholder="https://youtu.be/…" @keydown.enter.prevent="setVideo" /><button class="btn-primary h-11" @click="setVideo">Set</button></div>
      <p v-if="videoInput && !parseYouTube(videoInput)" class="text-body-sm text-error mt-1">That isn’t a YouTube link.</p></div>

    <div v-if="section.type === 'spacer'"><p class="label mb-1.5">Height</p>
      <div class="flex gap-1.5"><button v-for="h in (['sm', 'md', 'lg'] as const)" :key="h" class="chip h-9" :class="{ 'chip-active': c.height === h }" @click="c.height = h; touch()">{{ { sm: 'Small', md: 'Medium', lg: 'Large' }[h] }}</button></div></div>

    <div v-if="section.type === 'games'" class="space-y-2">
      <p class="label">Your games ({{ (c.items ?? []).length }}/24)</p>
      <div v-if="(c.items ?? []).length" class="grid grid-cols-3 gap-2">
        <button v-for="g in (c.items as ProfileGame[])" :key="g.id" class="relative text-left" :title="`Remove ${g.name}`" @click="toggleGame(g)"><GameTile :game="g" small /><span class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] flex items-center justify-center">✕</span></button>
      </div>
      <input v-model="gameQ" class="input h-10" placeholder="Search games (e.g. Fortnite, Counter-Strike)" />
      <div class="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
        <button v-for="g in gameResults" :key="g.id" class="relative text-left rounded-md p-1 transition" :class="hasGame(g) ? 'ring-2 ring-flame' : 'hover:bg-surface-container-low'" @click="toggleGame(g)"><GameTile :game="g" small /></button>
      </div>
    </div>

    <div v-if="section.type === 'links' || section.type === 'currently'" class="space-y-2">
      <p class="label">{{ section.type === 'links' ? 'Links' : 'Currently…' }}</p>
      <div v-for="(it, i) in c.items ?? []" :key="i" class="rounded-md bg-surface-container-low p-2 space-y-1.5">
        <div class="flex gap-1.5">
          <input v-if="section.type === 'links'" v-model="it.label" class="input h-10" placeholder="Label (e.g. Instagram)" maxlength="40" @input="touch" />
          <select v-else v-model="it.label" class="input h-10" @change="touch"><option v-for="l in CURRENTLY_LABELS" :key="l" :value="l">{{ l }}</option></select>
          <button class="btn-icon w-10 h-10 shrink-0" aria-label="Remove" @click="removeItem(i)"><Icon name="delete" :size="18" /></button>
        </div>
        <input v-if="section.type === 'links'" v-model="it.url" class="input h-10" placeholder="https://…" maxlength="300" @input="touch" />
        <input v-else v-model="it.value" class="input h-10" placeholder="e.g. The Bear, season 3" maxlength="80" @input="touch" />
      </div>
      <button v-if="(c.items ?? []).length < (spec.items?.max ?? 6)" class="btn-secondary w-full h-10" @click="addItem"><Icon name="add" /> Add {{ section.type === 'links' ? 'link' : 'line' }}</button>
      <p v-if="section.type === 'links'" class="text-body-sm text-on-surface-variant">Links must start with https://</p>
    </div>

    <button class="btn-ghost text-error w-full" @click="emit('remove')"><Icon name="delete" /> Remove section</button>
  </div>
</template>
