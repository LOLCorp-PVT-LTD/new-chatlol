<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { ShoutThread } from '@chatlol/shared';
import { timeAgo, compact } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';

const s = useSession();
const router = useRouter();
const boards = ref<{ id: string; name: string; emoji: string; threads: number }[]>([]);
const board = ref<string | undefined>();
const sort = ref<'hot' | 'new' | 'top'>('hot');
const threads = ref<ShoutThread[]>([]);
const composing = ref(false);
const draft = ref({ board: 'daily', title: '', body: '' });

async function load() { threads.value = (await api.threads({ board: board.value, sort: sort.value })).items; }
onMounted(async () => { boards.value = (await api.boards()).boards; await load(); });
watch([board, sort], load);

async function vote(t: ShoutThread, v: 1 | -1) {
  if (!s.user) return;
  const r = await api.voteThread(t.id, t.myVote === v ? 0 : v);
  threads.value = threads.value.map((x) => (x.id === t.id ? r.thread : x));
}
async function create() {
  try {
    const r = await api.createThread(draft.value);
    s.reward(r.reward);
    router.push(`/forums/${r.thread.id}`);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>

<template>
  <div class="max-w-[720px] mx-auto space-y-5">
    <div class="flex items-end justify-between gap-3">
      <div><h1 class="text-headline-xl">Forums 💬</h1><p class="text-body-md text-on-surface-variant">The public discussion board. Ask, debate, share.</p></div>
      <button v-if="s.user" class="btn-primary" @click="composing = true; draft.board = board ?? 'daily'"><Icon name="forum" /> New Forum Post</button>
    </div>
    <div class="flex gap-2 overflow-x-auto scrollbar-none pb-1">
      <button class="chip" :class="{ 'chip-active': !board }" @click="board = undefined">🌐 All</button>
      <button v-for="b in boards" :key="b.id" class="chip" :class="{ 'chip-active': board === b.id }" @click="board = b.id">{{ b.emoji }} {{ b.name }}</button>
    </div>
    <div class="flex gap-2">
      <button v-for="x in (['hot', 'new', 'top'] as const)" :key="x" class="chip capitalize" :class="{ 'chip-active': sort === x }" @click="sort = x">{{ x === 'hot' ? '🔥' : x === 'new' ? '✨' : '🏆' }} {{ x }}</button>
    </div>
    <article v-for="t in threads" :key="t.id" class="card p-4 flex gap-3 hover:shadow-pop transition">
      <div class="flex flex-col items-center gap-0.5 pt-1">
        <button class="btn-icon w-8 h-8" :class="{ 'text-flame': t.myVote === 1 }" aria-label="Upvote" @click="vote(t, 1)"><Icon name="arrow_upward" :fill="t.myVote === 1" /></button>
        <span class="text-label-lg tabular-nums">{{ compact(t.upvotes) }}</span>
        <button class="btn-icon w-8 h-8" :class="{ 'text-tertiary': t.myVote === -1 }" aria-label="Downvote" @click="vote(t, -1)"><Icon name="arrow_downward" /></button>
      </div>
      <RouterLink :to="`/forums/${t.id}`" class="min-w-0 flex-1">
        <div class="flex items-center gap-2 text-body-sm text-on-surface-variant">
          <span v-if="t.pinned" class="text-flame font-bold">📌 Pinned</span>
          <span class="bg-surface-container rounded-full px-2 py-0.5 text-label-sm">{{ boards.find((b) => b.id === t.board)?.emoji }} {{ boards.find((b) => b.id === t.board)?.name }}</span>
          <span>{{ timeAgo(t.lastActivityAt) }}</span>
        </div>
        <h2 class="text-headline-sm mt-1.5">{{ t.title }}</h2>
        <p class="text-body-md text-on-surface-variant line-clamp-2 mt-0.5">{{ t.body }}</p>
        <div class="flex items-center gap-2 mt-3 text-body-sm">
          <Avatar :user="t.author" :size="24" :show-online="false" /><UserName :user="t.author" :link="false" />
          <span class="ml-auto flex items-center gap-1 text-on-surface-variant"><Icon name="chat_bubble" :size="16" /> {{ t.replyCount }}</span>
        </div>
      </RouterLink>
    </article>

    <Modal v-if="composing" title="New Forum Post" @close="composing = false">
      <div class="px-6 pb-6 space-y-3">
        <select v-model="draft.board" class="input text-body-md" aria-label="Board">
          <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.emoji }} {{ b.name }}</option>
        </select>
        <input v-model="draft.title" class="input" placeholder="Title" maxlength="120" />
        <textarea v-model="draft.body" class="textarea" rows="5" placeholder="What’s on your mind?" maxlength="4000" />
        <button class="btn-primary w-full" :disabled="draft.title.length < 4 || !draft.body.trim()" @click="create">Post to Forums (+20 ✦)</button>
      </div>
    </Modal>
  </div>
</template>
