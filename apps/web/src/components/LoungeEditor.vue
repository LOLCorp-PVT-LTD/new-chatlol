<script setup lang="ts">
import { ref } from 'vue';
import type { Lounge } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import Modal from './Modal.vue';

/** Create a lounge, or edit one you own (staff: any). */
const props = defineProps<{ lounge?: Lounge | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', l: Lounge): void }>();
const s = useSession();
const f = ref({
  name: props.lounge?.name ?? '',
  emoji: props.lounge?.emoji ?? '💬',
  topic: props.lounge?.topic ?? '',
  nowPlaying: props.lounge?.nowPlaying ?? '',
  coverUrl: props.lounge?.coverUrl ?? (null as string | null),
});
const official = ref(false);
const busy = ref(false);
const isStaff = () => (s.user?.perms ?? []).includes('lounges');
async function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) f.value.coverUrl = await uploadImage(file);
}
async function save() {
  busy.value = true;
  try {
    const body = { ...f.value, name: f.value.name.trim() };
    const r = props.lounge ? await api.updateLounge(props.lounge.id, body) : await api.createLounge({ ...body, official: official.value });
    s.toast({ kind: 'reward', title: props.lounge ? 'Lounge updated' : `🛋️ ${r.lounge.name} is open!` });
    emit('saved', r.lounge);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="lounge ? 'Edit lounge' : 'Open a lounge'" @close="emit('close')">
    <form class="px-6 pb-6 space-y-3" @submit.prevent="save">
      <label class="block relative h-32 rounded-md overflow-hidden bg-surface-container-low cursor-pointer group">
        <img v-if="f.coverUrl" :src="f.coverUrl" alt="" class="w-full h-full object-cover" />
        <span class="absolute inset-0 flex items-center justify-center text-label-lg text-white bg-black/30 opacity-80 group-hover:opacity-100">📷 {{ f.coverUrl ? 'Change cover' : 'Add a cover photo' }}</span>
        <input type="file" accept="image/*" class="hidden" @change="upload" />
      </label>
      <div class="flex gap-2">
        <div class="w-16 shrink-0"><input v-model="f.emoji" class="input text-center text-xl px-0" maxlength="8" aria-label="Emoji" /></div>
        <input v-model="f.name" class="input" placeholder="Lounge name" maxlength="40" required minlength="3" />
      </div>
      <input v-model="f.topic" class="input" placeholder="What’s it about? e.g. Late-night lo-fi & study vibes" maxlength="120" />
      <input v-model="f.nowPlaying" class="input" placeholder="Now playing (optional) — e.g. Frank Ocean — Pink + White" maxlength="80" />
      <label v-if="!lounge && isStaff()" class="flex items-center gap-2 text-body-sm"><input v-model="official" type="checkbox" /> Official ChatLOL lounge (no owner)</label>
      <p v-if="!lounge" class="text-body-sm text-on-surface-variant">You can have 1 lounge (3 with Premium). You can edit or close it any time.</p>
      <button class="btn-primary w-full" :disabled="busy || f.name.trim().length < 3">{{ lounge ? 'Save' : 'Open lounge' }}</button>
    </form>
  </Modal>
</template>
