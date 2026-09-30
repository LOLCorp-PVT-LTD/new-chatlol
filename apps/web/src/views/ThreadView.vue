<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import type { ShoutThread, ShoutReply } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';

const route = useRoute();
const s = useSession();
const thread = ref<ShoutThread | null>(null);
const replies = ref<ShoutReply[]>([]);
const draft = ref('');
let poll: ReturnType<typeof setInterval> | undefined;
async function load() {
  const r = await api.thread(route.params.id as string);
  thread.value = r.thread;
  replies.value = r.replies;
}
watchEffect(() => { void load(); clearInterval(poll); poll = setInterval(load, 20_000); });
async function send() {
  if (!draft.value.trim()) return;
  try {
    const r = await api.replyThread(thread.value!.id, draft.value.trim());
    replies.value.push(r.reply);
    draft.value = '';
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>
<template>
  <div v-if="thread" class="max-w-[720px] mx-auto space-y-4">
    <RouterLink to="/shouts" class="btn-ghost -ml-3"><Icon name="arrow_back" /> Shouts</RouterLink>
    <article class="card p-6">
      <div class="flex items-center gap-3"><Avatar :user="thread.author" :size="44" /><div><UserName :user="thread.author" /><p class="text-body-sm text-on-surface-variant">{{ timeAgo(thread.createdAt) }} ago</p></div></div>
      <h1 class="text-headline-lg mt-4">{{ thread.title }}</h1>
      <p class="text-body-lg mt-2 whitespace-pre-line">{{ thread.body }}</p>
      <p class="text-label-md text-on-surface-variant mt-4">⬆ {{ thread.upvotes }} • 💬 {{ replies.length }}</p>
    </article>
    <div v-for="r in replies" :key="r.id" class="flex gap-3">
      <Avatar :user="r.author" :size="36" :show-online="false" />
      <div class="card px-4 py-3 flex-1 min-w-0 rounded-md">
        <div class="flex items-center gap-2 text-body-sm"><UserName :user="r.author" /><span class="text-on-surface-variant">{{ timeAgo(r.createdAt) }}</span></div>
        <p class="text-body-md mt-0.5 whitespace-pre-line break-words">{{ r.body }}</p>
      </div>
    </div>
    <form v-if="s.user" class="sticky bottom-24 lg:bottom-4 flex gap-2 card p-2 shadow-float" @submit.prevent="send">
      <input v-model="draft" class="input h-12 border-transparent" placeholder="Add to the shout…" maxlength="2000" />
      <button class="btn-primary h-12 w-12 px-0 shrink-0" aria-label="Reply" :disabled="!draft.trim()"><Icon name="send" /></button>
    </form>
  </div>
</template>
