<script setup lang="ts">
import VideoEmbeds from './VideoEmbeds.vue';
import { withoutVideos } from '@chatlol/shared';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { ChatMessage, Conversation } from '@chatlol/shared';
import { DM_SPARK_COST } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
import RichText from './RichText.vue';
import StickerView from './StickerView.vue';

/**
 * Floating DM chat heads on the right edge: one bubble per recent chat with a badge for unread messages. Tapping a
 * head opens a mini chat window next to it; the full inbox is one tap away. Hidden on the Messages page itself.
 */
const s = useSession();
const MAX = 4;
const KEY = 'chatlol:chat-heads';
const heads = ref<Conversation[]>([]);
const openId = ref<string | null>(null);
const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const sending = ref(false);
const list = ref<HTMLElement>();
const active = computed(() => heads.value.find((h) => h.id === openId.value) ?? null);
const other = (c: Conversation) => c.members[0];

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(heads.value.map((h) => h.id))); } catch { /* storage blocked */ }
}
function saved(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
const scroll = async () => { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight }); };

/** Puts a chat at the top of the stack (newest first), dropping the oldest past MAX. */
function bump(c: Conversation) {
  heads.value = [c, ...heads.value.filter((h) => h.id !== c.id)].slice(0, MAX);
  save();
}
function dismiss(id: string) {
  heads.value = heads.value.filter((h) => h.id !== id);
  if (openId.value === id) openId.value = null;
  save();
}

async function open(id: string) {
  if (openId.value === id) return void (openId.value = null);
  openId.value = id;
  messages.value = [];
  draft.value = '';
  try {
    const r = await api.messages(id);
    if (openId.value !== id) return;
    messages.value = r.messages.slice(-40);
    const h = heads.value.find((x) => x.id === id);
    if (h) { s.unreadDms = Math.max(0, s.unreadDms - h.unread); h.unread = 0; }
    s.socket().emit('dm:read', { conversationId: id });
    void scroll();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}

async function send() {
  const c = active.value;
  const body = draft.value.trim();
  if (!c || !body || sending.value) return;
  sending.value = true;
  draft.value = '';
  try {
    const r = await api.sendMessage(c.id, { body });
    if (!messages.value.some((x) => x.id === r.message.id)) messages.value.push(r.message);
    void scroll();
  } catch (e) { draft.value = body; s.toast({ kind: 'error', title: (e as Error).message }); } finally { sending.value = false; }
}

const off = s.onDm(async (m) => {
  const mine = m.author.id === s.user?.id;
  let c = heads.value.find((h) => h.id === m.roomId);
  if (!c) {
    if (mine) return; // something you sent from elsewhere doesn't need a head
    c = (await api.conversations()).conversations.find((x) => x.id === m.roomId);
    if (!c) return;
    c = { ...c, unread: 0 };
  }
  c.lastMessage = m;
  if (openId.value === m.roomId) {
    if (!messages.value.some((x) => x.id === m.id)) messages.value.push(m);
    if (!mine) { s.socket().emit('dm:read', { conversationId: m.roomId }); s.unreadDms = Math.max(0, s.unreadDms - 1); }
    void scroll();
  } else if (!mine) c.unread++;
  bump(c);
});

onMounted(async () => {
  try {
    const all = (await api.conversations()).conversations;
    const keep = saved();
    heads.value = all.filter((c) => c.unread > 0 || keep.includes(c.id)).slice(0, MAX);
  } catch { /* signed out or offline */ }
});
onUnmounted(() => off());

const preview = (c: Conversation) => c.lastMessage?.body || (c.lastMessage?.sticker ? 'Sticker' : c.lastMessage?.mediaUrl ? '📷 Photo' : '');
</script>

<template>
  <div v-if="heads.length" class="fixed z-[45] right-3 lg:right-5 bottom-44 lg:bottom-6 flex items-end gap-3 pointer-events-none">
    <!-- Mini chat window -->
    <Transition name="slide-up">
      <section v-if="active" :key="active.id" class="heads-glass pointer-events-auto w-[320px] max-w-[calc(100vw-96px)] h-[440px] max-h-[60dvh] rounded-lg flex flex-col overflow-hidden">
        <header class="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/30 dark:border-white/[0.06]">
          <Avatar :user="other(active)" :size="34" />
          <RouterLink :to="`/u/${other(active).handle}`" class="flex-1 min-w-0">
            <p class="text-label-lg truncate">{{ other(active).displayName }}</p>
            <p class="text-[11px] text-on-surface-variant truncate">{{ s.typing[active.id] ? 'typing…' : `@${other(active).handle}` }}</p>
          </RouterLink>
          <RouterLink :to="`/messages/${active.id}`" class="btn-icon w-8 h-8" aria-label="Open in Messages" @click="openId = null"><Icon name="open_in_new" :size="16" /></RouterLink>
          <button class="btn-icon w-8 h-8" aria-label="Minimise" @click="openId = null"><Icon name="close" :size="16" /></button>
        </header>
        <div ref="list" class="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          <div v-for="m in messages" :key="m.id" class="flex" :class="m.author.id === s.user?.id ? 'justify-end' : 'justify-start'">
            <StickerView v-if="m.sticker" :sticker="m.sticker" :size="88" />
            <img v-else-if="m.mediaUrl" :src="m.mediaUrl" alt="" class="max-w-[70%] rounded-md" loading="lazy" />
            <div v-else class="max-w-[85%] flex flex-col gap-1" :class="m.author.id === s.user?.id ? 'items-end' : 'items-start'">
              <p v-if="withoutVideos(m.body)" class="px-3 py-1.5 rounded-[18px] text-body-sm break-words"
                :class="m.author.id === s.user?.id ? 'bg-sunset text-white rounded-br-md' : 'bg-surface-container-low/80 rounded-bl-md'"><RichText :text="m.body" videos /></p>
              <VideoEmbeds :text="m.body" :max="1" compact class="w-[240px]" />
            </div>
          </div>
          <p v-if="!messages.length" class="text-center text-body-sm text-on-surface-variant pt-10">Say hi 👋</p>
        </div>
        <form class="p-2.5 flex gap-2 border-t border-white/30 dark:border-white/[0.06]" @submit.prevent="send">
          <input v-model="draft" class="input h-10 text-body-sm px-4" :placeholder="`Message… (⚡${DM_SPARK_COST})`" maxlength="2000" aria-label="Message" />
          <button class="btn-primary h-10 w-10 px-0 shrink-0" :disabled="!draft.trim() || sending" aria-label="Send"><Icon name="send" :size="18" /></button>
        </form>
      </section>
    </Transition>

    <!-- Heads -->
    <TransitionGroup tag="div" name="head" class="flex flex-col-reverse gap-3 pointer-events-auto">
      <div v-for="c in heads" :key="c.id" class="group relative">
        <button class="head block rounded-full" :class="{ 'is-open': openId === c.id }" :aria-label="`Chat with ${other(c).displayName}${c.unread ? `, ${c.unread} unread` : ''}`" @click="open(c.id)">
          <Avatar :user="other(c)" :size="52" />
        </button>
        <span v-if="c.unread" class="badge">{{ c.unread > 9 ? '9+' : c.unread }}</span>
        <button class="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-umber text-cream text-[11px] leading-none hidden group-hover:flex items-center justify-center" :aria-label="`Close chat head for ${other(c).displayName}`" @click="dismiss(c.id)">×</button>
        <span v-if="openId !== c.id && preview(c)" class="tip">{{ preview(c) }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.heads-glass {
  background: rgb(var(--c-surface-container-lowest) / 0.78);
  -webkit-backdrop-filter: blur(26px) saturate(170%);
  backdrop-filter: blur(26px) saturate(170%);
  border: 1px solid rgb(255 255 255 / 0.55);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.6), 0 24px 48px -18px rgb(0 0 0 / 0.35);
}
[data-theme='dark'] .heads-glass { border-color: rgb(255 255 255 / 0.08); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 24px 48px -18px rgb(0 0 0 / 0.8); }
.head { padding: 3px; background: rgb(255 255 255 / 0.7); box-shadow: 0 10px 24px -8px rgb(0 0 0 / 0.35); transition: transform 0.2s; }
[data-theme='dark'] .head { background: rgb(255 255 255 / 0.12); }
.head:hover { transform: scale(1.06); }
.head.is-open { background: linear-gradient(135deg, rgb(var(--c-tangerine)), rgb(var(--c-flame))); }
.badge {
  position: absolute; top: -3px; right: -3px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 9999px;
  display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, #ff4d4d, #e0002a); box-shadow: 0 0 0 2px rgb(var(--c-surface)), 0 4px 10px rgb(224 0 42 / 0.5);
  animation: badge-pop 0.35s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.tip {
  position: absolute; right: calc(100% + 10px); top: 50%; transform: translateY(-50%); max-width: 200px;
  padding: 6px 12px; border-radius: 14px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: rgb(var(--c-surface-container-lowest) / 0.85); backdrop-filter: blur(12px); box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.3);
  opacity: 0; pointer-events: none; transition: opacity 0.2s;
}
.group:hover .tip { opacity: 1; }
@keyframes badge-pop { from { transform: scale(0); } }
.head-enter-active, .head-leave-active { transition: all 0.3s cubic-bezier(0.2, 0.9, 0.3, 1); }
.head-enter-from, .head-leave-to { opacity: 0; transform: translateX(40px) scale(0.6); }
.head-move { transition: transform 0.3s; }
</style>
