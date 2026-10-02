<script setup lang="ts">
import type { StickerInput } from '@chatlol/shared';
import EmojiButton from '../EmojiButton.vue';
import RichText from '../RichText.vue';
import StickerView from '../StickerView.vue';
import { insertAtCaret } from '../../lib/insertAtCaret';
import { computed, ref } from 'vue';
import { WALL_MOODS, timeAgo } from '@chatlol/shared';
import { useSession } from '../../stores/session';
import Avatar from '../Avatar.vue';
import Icon from '../Icon.vue';
import { useProfileCtx } from './context';

/** Comments on the profile (the wall): visitors leave notes, the owner can remove any of them. */
const props = defineProps<{ limit: number }>();
const ctx = useProfileCtx();
const s = useSession();
const body = ref('');
const mood = ref<string | null>('hyped');
const showAll = ref(false);
const notes = computed(() => (showAll.value ? ctx.wall.value : ctx.wall.value.slice(0, props.limit)));
const first = computed(() => ctx.user.value.displayName.split(' ')[0]);
const box = ref<HTMLTextAreaElement>();
const addEmoji = (t: string) => (body.value = insertAtCaret(box.value, body.value, t));
async function send(sticker: StickerInput | null = null) {
  if (!body.value.trim() && !sticker) return;
  if (await ctx.postNote(sticker ? '' : body.value.trim(), mood.value, sticker) && !sticker) body.value = '';
}
</script>

<template>
  <div class="space-y-3">
    <form v-if="s.user && !ctx.editing.value" class="space-y-2" @submit.prevent="send()">
      <textarea ref="box" v-model="body" class="w-full rounded-md tile px-4 py-3 text-body-md outline-none focus:ring-2 resize-none placeholder:opacity-60 bg-transparent" rows="2" maxlength="280" :placeholder="ctx.isMe.value ? 'Pin a note on your own profile…' : `Leave a comment for ${first}…`" />
      <div class="flex gap-1.5 flex-wrap items-center">
        <button v-for="m in WALL_MOODS" :key="m.key" type="button" class="h-8 px-3 rounded-full text-label-sm tile" :class="{ 'ring-2': mood === m.key }" :style="mood === m.key ? { '--tw-ring-color': ctx.accent.value } : {}" @click="mood = m.key">{{ m.emoji }} {{ m.label }}</button>
        <span class="flex-1" />
        <EmojiButton stickers @insert="addEmoji" @sticker="send" />
        <button class="h-9 px-4 rounded-full text-white text-label-lg inline-flex items-center gap-1.5 disabled:opacity-50" :style="{ background: ctx.accent.value }" :disabled="!body.trim()"><Icon name="send" :size="16" /> Post</button>
      </div>
    </form>
    <div v-for="n in notes" :key="n.id" class="flex gap-3 rounded-md tile p-3">
      <RouterLink :to="`/u/${n.author.handle}`" class="shrink-0"><Avatar :user="n.author" :size="38" /></RouterLink>
      <div class="min-w-0 flex-1">
        <p class="text-body-sm"><RouterLink :to="`/u/${n.author.handle}`" class="font-bold hover:underline">{{ n.author.displayName }}</RouterLink>
          <span v-if="n.mood" class="ml-1">{{ WALL_MOODS.find((m) => m.key === n.mood)?.emoji }}</span> <span class="muted">· {{ timeAgo(n.createdAt) }}</span></p>
        <p v-if="n.body" class="text-body-md mt-0.5 break-words"><RichText :text="n.body" /></p>
        <StickerView v-if="n.sticker" :sticker="n.sticker" :size="96" />
      </div>
      <button v-if="(ctx.isMe.value || n.author.id === s.user?.id) && !ctx.editing.value" class="w-8 h-8 rounded-full hover:bg-black/10 flex items-center justify-center shrink-0" aria-label="Delete comment" @click="ctx.deleteNote(n.id)"><Icon name="delete" :size="18" /></button>
    </div>
    <p v-if="!ctx.wall.value.length" class="text-body-md muted py-4 text-center">No comments yet — be the first 💬</p>
    <button v-if="ctx.wall.value.length > limit && !showAll" class="text-label-lg underline underline-offset-4" @click="showAll = true">Show all {{ ctx.counts.value.wall }} comments</button>
  </div>
</template>
