<script setup lang="ts">
import { confirmDialog } from '../lib/dialog';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GiphySticker, StickerCatalog, StickerInput } from '@chatlol/shared';
import { customEmojiUri, notoAnimatedUrl } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { themeMode } from '../stores/theme';
import Icon from './Icon.vue';
// The emoji list ships with the app (no CDN): Vite serves it as a static file.
import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url';

/**
 * The emoji & sticker picker used everywhere you can type: every standard emoji (emoji-picker-element, with search
 * and skin tones), ChatLOL custom emoji, and animated stickers (Noto packs + GIPHY search). Locked packs show their
 * Sparks price and unlock right here.
 */
const props = defineProps<{ stickers?: boolean }>();
const emit = defineEmits<{ (e: 'insert', text: string): void; (e: 'sticker', s: StickerInput): void; (e: 'close'): void }>();
const s = useSession();
const tab = ref<'emoji' | 'custom' | 'stickers'>('emoji');
const host = ref<HTMLElement>();
const pickerHost = ref<HTMLElement>();
const catalog = ref<StickerCatalog | null>(null);
const buying = ref<string | null>(null);
const giphyQ = ref('');
const giphy = ref<GiphySticker[]>([]);
const giphyLoading = ref(false);
const dark = computed(() => document.documentElement.dataset.theme === 'dark' || themeMode.value === 'dark');

let cached: StickerCatalog | null = null;
async function loadCatalog(force = false) {
  if (cached && !force) return (catalog.value = cached);
  catalog.value = cached = await api.stickers();
}
const owned = computed(() => new Set(catalog.value?.owned ?? []));
type Tab = 'emoji' | 'custom' | 'stickers';
const tabs = computed(() => [['emoji', 'mood', 'Emoji'], ['custom', 'apps', 'ChatLOL'], ...(props.stickers ? [['stickers', 'sticky_note_2', 'Stickers']] : [])] as [Tab, string, string][]);

// ——— Standard emoji (web component, loaded on first open) ———
async function mountEmoji() {
  await import('emoji-picker-element');
  await nextTick();
  if (!pickerHost.value || pickerHost.value.firstChild) return;
  const el = document.createElement('emoji-picker') as HTMLElement & { dataSource: string };
  el.dataSource = emojiDataUrl;
  el.className = dark.value ? 'dark' : 'light';
  el.addEventListener('emoji-click', (e) => {
    const u = (e as unknown as CustomEvent<{ unicode?: string }>).detail.unicode;
    if (u) emit('insert', u);
  });
  pickerHost.value.appendChild(el);
}
watch(tab, (t) => { if (t === 'emoji') void mountEmoji(); else void loadCatalog(); });

// ——— Buying packs with Sparks ———
async function unlock(key: string, name: string, price: number) {
  if (!s.user) return s.toast({ kind: 'info', title: 'Sign in to unlock packs' });
  emit('close');
  if (!(await confirmDialog({ title: `Unlock ${name}?`, body: `${price.toLocaleString()} Sparks · yours forever.`, icon: 'lock_open', confirmText: `Unlock for ${price.toLocaleString()} ✦` }))) return;
  buying.value = key;
  try {
    await api.buy(key);
    s.toast({ kind: 'reward', title: `${name} unlocked ✨` });
    await loadCatalog(true);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { buying.value = null; }
}

// ——— GIPHY search ———
let t: ReturnType<typeof setTimeout>;
async function searchGiphy() {
  giphyLoading.value = true;
  try { giphy.value = (await api.giphySearch(giphyQ.value.trim())).results; } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { giphyLoading.value = false; }
}
watch(giphyQ, () => { clearTimeout(t); t = setTimeout(searchGiphy, 350); });
watch(() => [tab.value, catalog.value?.giphy.owned] as const, ([tb, own]) => { if (tb === 'stickers' && own && !giphy.value.length) void searchGiphy(); });

function pickSticker(input: StickerInput) {
  emit('sticker', input);
  emit('close');
}

const onDoc = (e: MouseEvent) => { if (host.value && !host.value.contains(e.target as Node)) emit('close'); };
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => {
  void mountEmoji();
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); });
</script>

<template>
  <div ref="host" class="picker card shadow-float overflow-hidden flex flex-col" role="dialog" aria-label="Emoji and stickers">
    <div class="flex gap-1 p-1.5 border-b border-outline-variant/40">
      <button type="button" v-for="x in tabs" :key="x[0]" class="flex-1 h-9 rounded-md text-label-md inline-flex items-center justify-center gap-1" :class="tab === x[0] ? 'is-on' : 'hover:bg-surface-container-low'" @click="tab = x[0]"><Icon :name="x[1]" :size="16" /> {{ x[2] }}</button>
    </div>

    <div v-show="tab === 'emoji'" ref="pickerHost" class="emoji-host" />

    <div v-if="tab !== 'emoji'" class="flex-1 overflow-y-auto p-3 space-y-4">
      <p v-if="!catalog" class="text-body-sm text-on-surface-variant text-center py-8">Loading…</p>

      <!-- ChatLOL custom emoji -->
      <template v-else-if="tab === 'custom'">
        <section v-for="p in catalog.emojiPacks" :key="p.key">
          <div class="flex items-center justify-between mb-1.5">
            <p class="text-label-lg">{{ p.name }} <span v-if="!p.price" class="text-label-sm text-on-surface-variant">· free</span></p>
            <button type="button" v-if="!owned.has(p.key)" class="h-7 px-3 rounded-full bg-sunset text-white text-label-sm disabled:opacity-60" :disabled="buying === p.key" @click="unlock(p.key, p.name, p.price)">🔓 {{ p.price.toLocaleString() }} ✦</button>
          </div>
          <div class="grid grid-cols-7 gap-1.5" :class="{ 'opacity-45': !owned.has(p.key) }">
            <button type="button" v-for="e in p.emojis" :key="e.code" class="aspect-square rounded-[24%] hover:scale-110 transition disabled:cursor-not-allowed" :title="`:${e.code}:`" :disabled="!owned.has(p.key)" @click="emit('insert', `:${e.code}:`)"><img :src="customEmojiUri(e)" :alt="`:${e.code}:`" class="w-full h-full" /></button>
          </div>
        </section>
      </template>

      <!-- Stickers -->
      <template v-else>
        <section v-for="p in catalog.stickerPacks" :key="p.key">
          <div class="flex items-center justify-between mb-1.5">
            <p class="text-label-lg">{{ p.name }} <span v-if="!p.price" class="text-label-sm text-on-surface-variant">· free</span></p>
            <button type="button" v-if="!owned.has(p.key)" class="h-7 px-3 rounded-full bg-sunset text-white text-label-sm disabled:opacity-60" :disabled="buying === p.key" @click="unlock(p.key, p.name, p.price)">🔓 {{ p.price.toLocaleString() }} ✦</button>
          </div>
          <div class="grid grid-cols-5 gap-1" :class="{ 'opacity-45': !owned.has(p.key) }">
            <button type="button" v-for="st in p.stickers" :key="st.id" class="aspect-square rounded-md hover:bg-surface-container-low p-0.5 disabled:cursor-not-allowed" :title="st.label" :disabled="!owned.has(p.key)" @click="pickSticker({ kind: 'noto', id: `${p.key}/${st.id}` })"><img :src="notoAnimatedUrl(st.cp)" :alt="st.label" class="w-full h-full object-contain" loading="lazy" /></button>
          </div>
        </section>
        <section v-if="catalog.giphy.available">
          <div class="flex items-center justify-between mb-1.5">
            <p class="text-label-lg">GIPHY stickers</p>
            <button type="button" v-if="!catalog.giphy.owned" class="h-7 px-3 rounded-full bg-sunset text-white text-label-sm disabled:opacity-60" :disabled="buying === catalog.giphy.key" @click="unlock(catalog.giphy.key, 'GIPHY Sticker Search', catalog.giphy.price)">🔓 {{ catalog.giphy.price.toLocaleString() }} ✦</button>
          </div>
          <template v-if="catalog.giphy.owned">
            <input v-model="giphyQ" class="input h-10 mb-2" placeholder="Search GIPHY stickers" />
            <p v-if="giphyLoading" class="text-body-sm text-on-surface-variant">Searching…</p>
            <div class="grid grid-cols-3 gap-1">
              <button type="button" v-for="g in giphy" :key="g.id" class="aspect-square rounded-md hover:bg-surface-container-low p-0.5" :title="g.title" @click="pickSticker({ kind: 'giphy', id: g.id, url: g.url, w: g.w, h: g.h })"><img :src="g.preview" :alt="g.title" class="w-full h-full object-contain" loading="lazy" /></button>
            </div>
            <p class="text-[10px] text-on-surface-variant text-right mt-1">Powered by GIPHY</p>
          </template>
          <p v-else class="text-body-sm text-on-surface-variant">Search millions of animated stickers.</p>
        </section>
        <p class="text-[10px] text-on-surface-variant">Animated stickers: Noto Animated Emoji by Google (CC BY 4.0)</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.picker { width: 352px; max-width: calc(100vw - 24px); height: 420px; }
.emoji-host { flex: 1; min-height: 0; }
.emoji-host :deep(emoji-picker) { width: 100%; height: 100%; --border-size: 0; --background: rgb(var(--c-surface-container-lowest)); --input-border-radius: 999px; --outline-color: #ff5e00; --indicator-color: #ff5e00; --num-columns: 8; }
</style>
