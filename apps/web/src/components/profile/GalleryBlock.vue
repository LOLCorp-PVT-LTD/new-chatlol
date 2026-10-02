<script setup lang="ts">
import { useProfileCtx } from './context';
import PhotoGrid from './PhotoGrid.vue';
import Icon from '../Icon.vue';

/** Photo albums: switch album, and (on your own profile) add photos. */
defineProps<{ columns: number }>();
const ctx = useProfileCtx();
function pickFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void ctx.addPhoto(f);
  (e.target as HTMLInputElement).value = '';
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2 overflow-x-auto scrollbar-none items-center">
      <button class="h-8 px-3 rounded-full text-label-md tile shrink-0" :class="{ 'ring-2': !ctx.album.value }" @click="ctx.setAlbum(null)">All</button>
      <button v-for="a in ctx.albums.value" :key="a" class="h-8 px-3 rounded-full text-label-md tile shrink-0" :class="{ 'ring-2': ctx.album.value === a }" @click="ctx.setAlbum(a)">{{ a }}</button>
      <label v-if="ctx.isMe.value && !ctx.editing.value" class="h-8 px-3 rounded-full text-label-md text-white inline-flex items-center gap-1 cursor-pointer shrink-0" :style="{ background: ctx.accent.value }">
        <Icon name="add_a_photo" :size="16" /> {{ ctx.uploading.value ? 'Uploading…' : 'Add photo' }}<input type="file" accept="image/*" class="hidden" :disabled="ctx.uploading.value" @change="pickFile" /></label>
    </div>
    <PhotoGrid :photos="ctx.gallery.value" :columns="columns" :empty="ctx.isMe.value ? 'Add photos — people can rate each one.' : 'No photos yet'" />
  </div>
</template>
