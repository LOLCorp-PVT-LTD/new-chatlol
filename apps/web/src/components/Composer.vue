<script setup lang="ts">
import EmojiButton from './EmojiButton.vue';
import { insertAtCaret } from '../lib/insertAtCaret';
import { ref, computed } from 'vue';
import type { Post } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import Avatar from './Avatar.vue';

const props = defineProps<{ mode?: 'post' | 'drop'; prompt?: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'posted', p: Post): void }>();
const s = useSession();
const tab = ref<'photo' | 'text' | 'battle'>(props.mode === 'drop' ? 'photo' : 'photo');
const body = ref('');
const bodyBox = ref<HTMLTextAreaElement>();
const file = ref<File | null>(null);
const preview = ref<string | null>(null);
const soundtrack = ref('');
const options = ref(['', '']);
const busy = ref(false);
const error = ref('');
const input = ref<HTMLInputElement>();

const canPost = computed(() => {
  if (tab.value === 'photo') return !!file.value;
  if (tab.value === 'battle') return body.value.trim() && options.value.every((o) => o.trim());
  return !!body.value.trim();
});

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.size > 12 * 1024 * 1024) { error.value = 'Max 12MB'; return; }
  file.value = f;
  preview.value = URL.createObjectURL(f);
}
function onDrop(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith('image/')) { file.value = f; preview.value = URL.createObjectURL(f); tab.value = 'photo'; }
}

async function submit() {
  if (!canPost.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const mediaUrl = tab.value === 'photo' && file.value ? await uploadImage(file.value) : null;
    const r = props.mode === 'drop'
      ? await api.submitDrop({ body: body.value, mediaUrl, soundtrack: soundtrack.value || null })
      : await api.createPost({
          kind: tab.value, body: body.value, mediaUrl,
          soundtrack: soundtrack.value || null,
          battle: tab.value === 'battle' ? options.value.map((label) => ({ label })) : undefined,
        });
    s.reward(r.reward);
    emit('posted', r.post);
    emit('close');
  } catch (e) {
    error.value = (e as Error).message;
  } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="mode === 'drop' ? '🌅 Lock in your Sunset Drop' : 'New vibe'" @close="emit('close')">
    <div class="px-6 pb-6 space-y-4" @dragover.prevent @drop.prevent="onDrop">
      <p v-if="prompt" class="rounded-md bg-sunlit p-4 text-body-md"><span class="label block mb-1">Today’s prompt</span><b class="text-headline-sm">“{{ prompt }}”</b></p>
      <div v-if="mode !== 'drop'" class="flex gap-2">
        <button v-for="t in (['photo', 'text', 'battle'] as const)" :key="t" class="chip capitalize" :class="{ 'chip-active': tab === t }" @click="tab = t">
          <Icon :name="t === 'photo' ? 'photo_camera' : t === 'text' ? 'edit_note' : 'swords'" :size="18" /> {{ t === 'battle' ? 'This vs That' : t }}
        </button>
      </div>
      <div class="flex gap-3">
        <Avatar v-if="s.user" :user="s.user" :size="40" :show-online="false" />
        <textarea ref="bodyBox" v-model="body" rows="3" maxlength="1000" class="textarea flex-1"
          :placeholder="tab === 'battle' ? 'Ask the crowd… (e.g. Setup A or Setup B?)' : mode === 'drop' ? 'Caption your drop…' : 'What’s the vibe? Add #tags'" />
        <EmojiButton :up="false" class="self-start" @insert="(t) => (body = insertAtCaret(bodyBox, body, t))" />
      </div>
      <template v-if="tab === 'photo'">
        <button v-if="!preview" class="w-full aspect-[4/3] rounded-md border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-2 hover:border-flame hover:bg-sunlit transition" @click="input?.click()">
          <span class="w-14 h-14 rounded-full bg-sunset text-white flex items-center justify-center shadow-float"><Icon name="add_a_photo" /></span>
          <span class="text-label-lg">Add a photo</span><span class="text-body-sm text-on-surface-variant">or drag & drop • JPG, PNG, WEBP, HEIC</span>
        </button>
        <div v-else class="relative rounded-md overflow-hidden">
          <img :src="preview" class="w-full max-h-96 object-cover" alt="Preview" />
          <button class="absolute top-2 right-2 btn-icon bg-surface/80" aria-label="Remove photo" @click="file = null; preview = null"><Icon name="close" /></button>
        </div>
        <input ref="input" type="file" accept="image/*" capture="environment" class="hidden" @change="onFile" />
        <div class="relative"><Icon name="music_note" class="absolute left-5 top-1/2 -translate-y-1/2 text-flame" :size="20" />
          <input v-model="soundtrack" class="input pl-12 text-body-md" maxlength="80" placeholder="Add a soundtrack (e.g. Tycho — Awake)" /></div>
      </template>
      <template v-if="tab === 'battle'">
        <div v-for="(_, i) in options" :key="i" class="flex gap-2">
          <input v-model="options[i]" class="input text-body-md" :placeholder="`Option ${String.fromCharCode(65 + i)}`" maxlength="60" />
          <button v-if="options.length > 2" class="btn-icon" @click="options.splice(i, 1)" aria-label="Remove option"><Icon name="remove" /></button>
        </div>
        <button v-if="options.length < 4" class="btn-secondary h-10" @click="options.push('')"><Icon name="add" /> Add option</button>
      </template>
      <p v-if="error" class="text-error text-body-md">{{ error }}</p>
      <button class="btn-primary w-full h-[52px] text-body-lg" :disabled="!canPost || busy" @click="submit">
        <Icon :name="busy ? 'progress_activity' : 'bolt'" :class="{ 'animate-spin': busy }" />
        {{ mode === 'drop' ? 'Snap & Lock In Drop (+120 Sparks)' : 'Publish Post (+20 Sparks)' }}
      </button>
    </div>
  </Modal>
</template>
