<script setup lang="ts">
import { emojiOnly } from '../lib/richText';
import type { StickerInput } from '@chatlol/shared';
import EmojiButton from '../components/EmojiButton.vue';
import RichText from '../components/RichText.vue';
import StickerView from '../components/StickerView.vue';
import { insertAtCaret } from '../lib/insertAtCaret';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ChatMessage, Conversation } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Empty from '../components/Empty.vue';

const route = useRoute();
const router = useRouter();
const s = useSession();
const conversations = ref<Conversation[]>([]);
const messages = ref<ChatMessage[]>([]);
const active = computed(() => conversations.value.find((c) => c.id === route.params.id));
const other = computed(() => active.value?.members[0]);
const draft = ref('');
const list = ref<HTMLElement>();
const fileInput = ref<HTMLInputElement>();
const readAt = ref<string | null>(null);
const sending = ref(false);
const isTyping = computed(() => !!(active.value && s.typing[active.value.id]));

const scroll = async () => { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight }); };

async function loadList() { conversations.value = (await api.conversations()).conversations; }
async function open(id: string) {
  const r = await api.messages(id);
  messages.value = r.messages;
  readAt.value = null;
  conversations.value = conversations.value.map((c) => (c.id === id ? { ...r.conversation, unread: 0 } : c));
  if (!conversations.value.some((c) => c.id === id)) conversations.value.unshift(r.conversation);
  s.unreadDms = conversations.value.reduce((a, c) => a + c.unread, 0);
  void scroll();
}

const off = s.onDm((m) => {
  const c = conversations.value.find((x) => x.id === m.roomId);
  if (c) { c.lastMessage = m; c.updatedAt = m.createdAt; if (m.roomId !== route.params.id && m.author.id !== s.user?.id) c.unread++; }
  else void loadList();
  conversations.value.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (m.roomId === route.params.id) {
    if (!messages.value.some((x) => x.id === m.id)) messages.value.push(m);
    s.socket().emit('dm:read', { conversationId: m.roomId });
    s.unreadDms = Math.max(0, s.unreadDms - (m.author.id !== s.user?.id ? 1 : 0));
    void scroll();
  }
});
const onRead = (p: { conversationId: string; userId: string; at: string }) => { if (p.conversationId === route.params.id && p.userId !== s.user?.id) readAt.value = p.at; };

onMounted(async () => {
  await loadList();
  if (route.params.id) await open(route.params.id as string);
  s.socket().on('dm:read', onRead);
});
onUnmounted(() => { off(); s.socket().off('dm:read', onRead); });
watch(() => route.params.id, (id) => id && open(id as string));

let typingSent = 0;
function onInput() {
  if (!active.value || Date.now() - typingSent < 2000) return;
  typingSent = Date.now();
  s.socket().emit('dm:typing', { conversationId: active.value.id, typing: true });
}

const box = ref<HTMLInputElement>();
const addEmoji = (t: string) => (draft.value = insertAtCaret(box.value, draft.value, t));
async function send(sticker: StickerInput | null = null) {
  if (!active.value || (!draft.value.trim() && !sticker) || sending.value) return;
  sending.value = true;
  const body = sticker ? '' : draft.value.trim();
  if (!sticker) draft.value = '';
  try {
    const r = await api.sendMessage(active.value.id, { body, sticker });
    if (!messages.value.some((x) => x.id === r.message.id)) messages.value.push(r.message);
    void scroll();
  } catch (e) { draft.value = body; s.toast({ kind: 'error', title: (e as Error).message }); } finally { sending.value = false; }
}
async function sendPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f || !active.value) return;
  const url = await uploadImage(f);
  const r = await api.sendMessage(active.value.id, { body: '', mediaUrl: url, kind: 'image' });
  if (!messages.value.some((x) => x.id === r.message.id)) messages.value.push(r.message);
  void scroll();
}
const lastMine = computed(() => [...messages.value].reverse().find((m) => m.author.id === s.user?.id));
const seen = computed(() => !!readAt.value || (!!lastMine.value && messages.value.some((m) => m.author.id !== s.user?.id && m.createdAt > lastMine.value!.createdAt)));
</script>

<template>
  <div class="card overflow-hidden flex h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-10rem)] max-w-[1000px] mx-auto">
    <aside class="w-full md:w-[320px] md:border-r border-sandstone flex-col" :class="route.params.id ? 'hidden md:flex' : 'flex'">
      <h1 class="text-headline-lg px-5 pt-5 pb-3">Messages</h1>
      <div class="overflow-y-auto flex-1">
        <Empty v-if="!conversations.length" emoji="💌" title="No DMs yet" body="Find someone in Browse Members and say hi.">
          <RouterLink to="/members" class="btn-primary">Browse Members</RouterLink></Empty>
        <button v-for="c in conversations" :key="c.id" class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-container-low transition"
          :class="{ 'bg-sunlit': c.id === route.params.id }" @click="router.push(`/messages/${c.id}`)">
          <Avatar v-if="c.members[0]" :user="c.members[0]" :size="48" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2"><UserName v-if="c.members[0]" :user="c.members[0]" :link="false" class="text-body-md" /><span class="text-[11px] text-on-surface-variant shrink-0">{{ c.lastMessage ? timeAgo(c.lastMessage.createdAt) : '' }}</span></div>
            <p class="text-body-sm truncate" :class="c.unread ? 'text-on-surface font-bold' : 'text-on-surface-variant'">
              <template v-if="s.typing[c.id]"><span class="text-flame">typing…</span></template>
              <template v-else>{{ c.lastMessage?.author.id === s.user?.id ? 'You: ' : '' }}{{ c.lastMessage?.kind === 'image' ? '📷 Photo' : c.lastMessage?.body }}</template>
            </p>
          </div>
          <span v-if="c.unread" class="bg-flame text-white rounded-full min-w-5 h-5 px-1.5 text-label-sm flex items-center justify-center">{{ c.unread }}</span>
        </button>
      </div>
    </aside>

    <section class="flex-1 flex-col min-w-0" :class="route.params.id ? 'flex' : 'hidden md:flex'">
      <template v-if="active && other">
        <header class="flex items-center gap-3 px-4 py-3 border-b border-sandstone">
          <RouterLink to="/messages" class="btn-icon md:hidden" aria-label="Back"><Icon name="arrow_back" /></RouterLink>
          <RouterLink :to="`/u/${other.handle}`"><Avatar :user="other" :size="42" /></RouterLink>
          <div class="min-w-0 flex-1"><UserName :user="other" /><p class="text-body-sm text-on-surface-variant">{{ isTyping ? 'typing…' : other.online ? 'Active now' : `Active ${timeAgo(other.lastSeenAt)} ago` }}</p></div>
        </header>
        <p v-if="other.isAI" class="mx-4 mt-3 rounded-full bg-surface-container-low px-4 py-2 text-body-sm text-on-surface-variant text-center">✦ {{ other.displayName }} is an AI persona powered by NVIDIA NIM. Don’t share private info.</p>
        <div ref="list" class="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
          <div v-for="(m, i) in messages" :key="m.id" class="flex" :class="m.author.id === s.user?.id ? 'justify-end' : 'justify-start'">
            <div class="max-w-[75%]" :class="{ 'mt-3': i > 0 && messages[i - 1].author.id !== m.author.id }">
              <img v-if="m.mediaUrl" :src="m.mediaUrl" class="rounded-md max-h-72 mb-1" alt="Photo" />
              <StickerView v-if="m.sticker" :sticker="m.sticker" :size="140" class="block" :class="{ 'ml-auto': m.author.id === s.user?.id }" />
              <p v-if="m.body && emojiOnly(m.body)" :class="{ 'text-right': m.author.id === s.user?.id }"><RichText :text="m.body" /></p>
              <p v-else-if="m.body" class="px-4 py-2.5 rounded-[22px] text-body-md break-words"
                :class="m.author.id === s.user?.id ? 'bg-sunset text-white rounded-br-md' : 'bg-surface-container-low rounded-bl-md'"><RichText :text="m.body" /></p>
              <p v-if="m.id === lastMine?.id" class="text-[11px] text-on-surface-variant text-right mt-0.5">{{ seen ? 'Seen' : 'Sent' }}</p>
            </div>
          </div>
          <div v-if="isTyping" class="flex gap-1 px-4 py-3 bg-surface-container-low rounded-[22px] w-fit">
            <span v-for="d in 3" :key="d" class="w-2 h-2 rounded-full bg-outline animate-bounce" :style="{ animationDelay: d * 120 + 'ms' }" />
          </div>
        </div>
        <form class="p-3 flex gap-2 items-center border-t border-sandstone" @submit.prevent="send()">
          <button type="button" class="btn-icon bg-sunlit text-flame shrink-0" aria-label="Send photo" @click="fileInput?.click()"><Icon name="image" /></button>
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="sendPhoto" />
          <EmojiButton stickers align="left" @insert="addEmoji" @sticker="send" />
          <input ref="box" v-model="draft" class="input h-11 text-body-md" placeholder="Message…" maxlength="2000" @input="onInput" />
          <button class="btn-primary h-11 w-11 px-0 shrink-0" aria-label="Send" :disabled="!draft.trim()"><Icon name="send" /></button>
        </form>
      </template>
      <Empty v-else emoji="💬" title="Pick a conversation" body="Your DMs live here." />
    </section>
  </div>
</template>
