<script setup lang="ts">
import VideoEmbeds from '../components/VideoEmbeds.vue';
import { withoutVideos } from '@chatlol/shared';
import RemovedNote from '../components/RemovedNote.vue';
import ReactionBar from '../components/ReactionBar.vue';
import { emojiOnly } from '../lib/richText';
import type { StickerInput } from '@chatlol/shared';
import EmojiButton from '../components/EmojiButton.vue';
import RichText from '../components/RichText.vue';
import StickerView from '../components/StickerView.vue';
import { insertAtCaret } from '../lib/insertAtCaret';
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { confirmDialog } from '../lib/dialog';
import type { ChatMessage, Lounge, UserPublic } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';

const route = useRoute();
const router = useRouter();
const s = useSession();
const id = route.params.id as string;
const lounge = ref<Lounge | null>(null);
/** Chat lines plus "X joined / left the chat" notes (local only, not stored). */
type SystemRow = { id: string; system: 'join' | 'leave'; user: UserPublic; createdAt: string };
const messages = ref<(ChatMessage | SystemRow)[]>([]);
const isSys = (m: ChatMessage | SystemRow): m is SystemRow => 'system' in m;
const members = ref<UserPublic[]>([]);
const showMembers = ref(false);
const online = ref(0);
const draft = ref('');
const list = ref<HTMLElement>();
const EMOJI = ['🔥', '😂', '🧡', '💀', '👑', '✨'];

const scroll = async () => { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }); };
const onMsg = (m: ChatMessage) => { if (m.roomId === id) { messages.value.push(m); void scroll(); } };
const onPresence = (p: { loungeId: string; onlineCount: number; joined?: UserPublic; left?: UserPublic }) => {
  if (p.loungeId !== id) return;
  online.value = p.onlineCount;
  const u = p.joined ?? p.left;
  if (!u) return;
  members.value = members.value.filter((x) => x.id !== u.id);
  if (p.joined) members.value.unshift(p.joined);
  if (u.id === s.user?.id) return;
  messages.value.push({ id: `sys-${u.id}-${Date.now()}`, system: p.joined ? 'join' : 'leave', user: u, createdAt: new Date().toISOString() });
  void scroll();
};
const onMembers = (p: { loungeId: string; members: UserPublic[] }) => { if (p.loungeId === id) members.value = p.members; };

const onKicked = (k: { loungeId: string; by: string; minutes: number }) => {
  if (k.loungeId !== id) return;
  s.toast({ kind: 'error', title: `🥾 @${k.by} kicked you out`, body: `You can come back in ${k.minutes} minutes.` }, 6000);
  void router.push('/lounges');
};
const onReactions = (p: { id: string; reactions: ChatMessage['reactions'] }) => {
  const m = messages.value.find((x): x is ChatMessage => !isSys(x) && x.id === p.id);
  if (m) m.reactions = p.reactions;
};
/** Kick Ticket: tap someone's name in the room. */
async function kick(m: { author: UserPublic }) {
  if (!(await confirmDialog({ title: `🥾 Kick @${m.author.handle}?`, body: 'Uses one Kick Ticket: they’re out of this lounge for an hour.', danger: true }))) return;
  try {
    const r = await api.useTicket('kick_ticket', m.author.id, id);
    s.toast({ kind: 'reward', title: `🥾 @${r.target.handle} was kicked${r.free ? ' (King’s freebie 👑)' : ''}` });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}

onMounted(async () => {
  const r = await api.lounge(id);
  lounge.value = r.lounge;
  online.value = r.lounge.onlineCount;
  const sock = s.socket();
  sock.emit('lounge:join', id, (history) => {
    if (!Array.isArray(history)) return onKicked({ loungeId: id, by: 'someone', minutes: 60 });
    messages.value = history;
    void scroll();
  });
  sock.on('lounge:kicked', onKicked);
  sock.on('message:reactions', onReactions);
  sock.on('lounge:message', onMsg);
  sock.on('lounge:presence', onPresence);
  sock.on('lounge:members', onMembers);
});
onUnmounted(() => {
  const sock = s.socket();
  sock.emit('lounge:leave', id);
  sock.off('lounge:message', onMsg);
  sock.off('lounge:presence', onPresence);
  sock.off('lounge:members', onMembers);
  sock.off('lounge:kicked', onKicked);
  sock.off('message:reactions', onReactions);
});
const box = ref<HTMLInputElement>();
const addEmoji = (t: string) => (draft.value = insertAtCaret(box.value, draft.value, t));
function send(text = draft.value, sticker: StickerInput | null = null) {
  if ((!text.trim() && !sticker) || !s.user) return;
  s.socket().emit('lounge:send', { loungeId: id, body: sticker ? '' : text.trim(), sticker });
  if (!sticker) draft.value = '';
}
</script>

<template>
  <div class="max-w-[900px] mx-auto card overflow-hidden flex flex-col h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-10rem)]">
    <header v-if="lounge" class="flex items-center gap-3 px-5 py-4 bg-sunlit">
      <RouterLink to="/lounges" class="btn-icon -ml-2" aria-label="Back"><Icon name="arrow_back" /></RouterLink>
      <span class="text-3xl">{{ lounge.emoji }}</span>
      <div class="min-w-0 flex-1"><h1 class="text-headline-sm truncate">{{ lounge.name }}</h1>
        <p class="text-body-sm text-on-surface-variant truncate flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-online" /> {{ online }} here • <Icon name="graphic_eq" :size="14" class="text-flame" /> {{ lounge.nowPlaying }}</p></div>
      <button class="flex items-center -space-x-2 shrink-0 rounded-full pr-1 hover:opacity-90" :aria-expanded="showMembers" aria-label="Who’s here" @click="showMembers = !showMembers">
        <Avatar v-for="u in members.slice(0, 4)" :key="u.id" :user="u" :size="30" class="ring-2 ring-sunlit rounded-full" />
        <span class="w-[30px] h-[30px] rounded-full bg-surface-container-high ring-2 ring-sunlit flex items-center justify-center text-[11px] font-bold">{{ members.length > 4 ? `+${members.length - 4}` : members.length }}</span>
      </button>
    </header>
    <Transition name="fade">
      <section v-if="showMembers" class="px-5 py-3 border-b border-sandstone/60 bg-surface-container-lowest/50 backdrop-blur-md">
        <p class="label mb-2">In the room · {{ members.length }}</p>
        <div class="flex gap-3 overflow-x-auto scrollbar-none pb-1">
          <RouterLink v-for="u in members" :key="u.id" :to="`/u/${u.handle}`" class="flex flex-col items-center gap-1 w-14 shrink-0">
            <span class="relative"><Avatar :user="u" :size="44" /><span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online ring-2 ring-surface-container-lowest" /></span>
            <span class="text-[11px] truncate w-full text-center">{{ u.displayName }}</span>
          </RouterLink>
          <p v-if="!members.length" class="text-body-sm text-on-surface-variant">Just you (and the lurkers 👀)</p>
        </div>
      </section>
    </Transition>
    <div ref="list" class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
      <template v-for="m in messages" :key="m.id">
      <p v-if="isSys(m)" class="flex items-center justify-center gap-2 text-label-sm text-on-surface-variant">
        <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-surface-container-low/70 backdrop-blur-sm">
          <Avatar :user="m.user" :size="18" /><b class="font-bold text-on-surface">{{ m.user.displayName }}</b>
          {{ m.system === 'join' ? 'joined the chat 👋' : 'left the chat' }}
        </span>
      </p>
      <div v-else class="flex gap-2.5" :class="{ 'flex-row-reverse': m.author.id === s.user?.id }">
        <RouterLink :to="`/u/${m.author.handle}`"><Avatar :user="m.author" :size="34" /></RouterLink>
        <div class="max-w-[75%]">
          <div class="flex items-center gap-1.5 text-label-sm text-on-surface-variant mb-0.5" :class="{ 'justify-end': m.author.id === s.user?.id }">
            <UserName :user="m.author" :link="false" /><span>{{ timeAgo(m.createdAt) }}</span>
            <button v-if="s.user && m.author.id !== s.user.id && !m.author.isAI" class="opacity-50 hover:opacity-100" title="Kick (uses a Kick Ticket)" :aria-label="`Kick @${m.author.handle}`" @click="kick(m)">🥾</button></div>
          <RemovedNote v-if="m.removed" what="message" :removed="m.removed" />
          <StickerView v-if="m.sticker" :sticker="m.sticker" :size="128" class="block" :class="{ 'ml-auto': m.author.id === s.user?.id }" />
          <p v-if="m.body && emojiOnly(m.body)" :class="{ 'text-right': m.author.id === s.user?.id }"><RichText :text="m.body" /></p>
          <p v-else-if="withoutVideos(m.body)" class="px-4 py-2 rounded-[20px] text-body-md break-words"
            :class="m.author.id === s.user?.id ? 'bg-sunset text-white rounded-tr-md' : 'bg-surface-container-low rounded-tl-md'"><RichText :text="m.body" videos /></p>
          <VideoEmbeds v-if="!m.removed" :text="m.body" :max="1" compact class="mt-1.5" :class="{ 'ml-auto': m.author.id === s.user?.id }" />
          <ReactionBar type="message" :id="m.id" :reactions="m.reactions ?? {}" :mine="m.myReaction" compact class="mt-1" :class="{ 'justify-end': m.author.id === s.user?.id }" @update="Object.assign(m, $event)" />
        </div>
      </div>
      </template>
    </div>
    <form v-if="s.user" class="border-t border-sandstone p-3 space-y-2" @submit.prevent="send()">
      <div class="flex gap-1.5"><button v-for="e in EMOJI" :key="e" type="button" class="w-9 h-9 rounded-full bg-surface-container-low hover:scale-110 transition" @click="send(e)">{{ e }}</button></div>
      <div class="flex gap-2 items-center">
        <EmojiButton stickers align="left" @insert="addEmoji" @sticker="(st) => send('', st)" />
        <input ref="box" v-model="draft" class="input h-12 text-body-md" placeholder="Say something to the lounge… (@mention people)" maxlength="500" />
        <button class="btn-primary h-12 w-12 px-0 shrink-0" aria-label="Send" :disabled="!draft.trim()"><Icon name="send" /></button>
      </div>
    </form>
    <RouterLink v-else to="/join" class="btn-primary m-3">Join to chat</RouterLink>
  </div>
</template>
