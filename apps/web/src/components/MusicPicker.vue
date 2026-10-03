<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MusicTrack } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Modal from './Modal.vue';
import Icon from './Icon.vue';

/** Find a song on YouTube (search, or paste a YouTube link). Emits the picked track. */
const props = defineProps<{ title?: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'pick', t: MusicTrack): void }>();
const s = useSession();
const q = ref('');
const results = ref<MusicTrack[]>([]);
const busy = ref(false);
const note = ref('');
let t: ReturnType<typeof setTimeout>;
const isLink = (v: string) => /youtu\.?be/i.test(v);
watch(q, (v) => {
  clearTimeout(t);
  note.value = '';
  if (!v.trim() || isLink(v)) return (results.value = []);
  t = setTimeout(async () => {
    busy.value = true;
    try {
      const r = await api.songSearch(v.trim());
      results.value = r.source === 'youtube' ? r.tracks : [];
      if (r.source !== 'youtube') note.value = 'YouTube search isn’t set up on this server yet — paste a YouTube link instead.';
    } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = false; }
  }, 350);
});
async function useLink() {
  try { emit('pick', (await api.youtubeResolve(q.value.trim())).song); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
const len = (d?: number) => (d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}` : '');
</script>

<template>
  <Modal :title="props.title ?? '🎵 Add a song'" @close="emit('close')">
    <div class="px-6 pb-6 space-y-3">
      <div class="relative"><Icon name="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" :size="20" />
        <input v-model="q" class="input pl-11" placeholder="Song or artist, or paste a YouTube link" autocomplete="off" autofocus />
        <button v-if="isLink(q)" class="btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 h-10" @click="useLink">Use link</button></div>
      <p v-if="busy" class="text-body-sm text-on-surface-variant">Searching YouTube…</p>
      <p v-if="note" class="text-body-sm text-on-surface-variant">{{ note }}</p>
      <div class="max-h-96 overflow-y-auto -mx-2">
        <button v-for="r in results" :key="r.id" type="button" class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-surface-container-low text-left" @click="emit('pick', r)">
          <img :src="r.artUrl ?? ''" alt="" class="w-16 h-9 rounded object-cover shrink-0 bg-black" />
          <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ r.title }}</p><p class="text-body-sm text-on-surface-variant truncate">{{ r.artist }}<template v-if="r.duration"> · {{ len(r.duration) }}</template></p></div>
          <span class="chip h-8 shrink-0">Pick</span>
        </button>
      </div>
    </div>
  </Modal>
</template>
