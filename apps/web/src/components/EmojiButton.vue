<script setup lang="ts">
import { ref } from 'vue';
import type { StickerInput } from '@chatlol/shared';
import EmojiPicker from './EmojiPicker.vue';
import Icon from './Icon.vue';

/**
 * A 😊 button that opens the emoji & sticker picker. `insert` gives text to add at the caret (use insertAtCaret);
 * `sticker` only fires where stickers make sense (chats, comments, shouts, profile comments).
 */
withDefaults(defineProps<{ stickers?: boolean; up?: boolean; align?: 'left' | 'right' }>(), { up: true, align: 'right' });
const emit = defineEmits<{ (e: 'insert', text: string): void; (e: 'sticker', s: StickerInput): void }>();
const open = ref(false);
</script>

<template>
  <span class="relative inline-flex">
    <button type="button" class="btn-icon w-9 h-9 shrink-0" :class="{ 'text-flame': open }" aria-label="Emoji and stickers" title="Emoji & stickers" @click="open = !open"><Icon name="add_reaction" :size="22" /></button>
    <EmojiPicker
      v-if="open"
      class="absolute z-50"
      :class="[up ? 'bottom-full mb-2' : 'top-full mt-2', align === 'right' ? 'right-0' : 'left-0']"
      :stickers="stickers"
      @insert="emit('insert', $event)"
      @sticker="emit('sticker', $event)"
      @close="open = false"
    />
  </span>
</template>
