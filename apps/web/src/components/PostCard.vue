<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Post, VibeScore, Comment, ReactionKind } from '@chatlol/shared';
import { REACTIONS, TIERS, tierByKey, timeAgo, compact, toTen, levelTitle } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confetti } from '../lib/fx';
import Avatar from './Avatar.vue';
import UserName from './UserName.vue';
import TierPad from './TierPad.vue';
import Icon from './Icon.vue';

const props = defineProps<{ post: Post; expanded?: boolean }>();
const emit = defineEmits<{ (e: 'update', p: Post): void; (e: 'deleted', id: string): void }>();
const s = useSession();
const post = ref(props.post);
const comments = ref<Comment[] | null>(null);
const draft = ref('');
const showComments = ref(!!props.expanded);
const busy = ref(false);
const menu = ref(false);
const burst = ref(false);

const mine = computed(() => s.user?.id === post.value.author.id);
const revealed = computed(() => mine.value || !!post.value.myRating);
const tier = computed(() => tierByKey(post.value.ratings.tier));
const totalReactions = computed(() => Object.values(post.value.reactions).reduce((a, b) => a + b, 0));
const battleTotal = computed(() => post.value.battle?.reduce((a, o) => a + o.votes, 0) ?? 0);

function requireAuth() {
  if (!s.isAuthed) { s.toast({ kind: 'info', title: 'Join ChatLOL to rate & react ✨' }); return false; }
  return true;
}

async function rate(v: VibeScore, ev?: MouseEvent) {
  if (!requireAuth() || mine.value) return;
  const prev = post.value.myRating;
  post.value = { ...post.value, myRating: v };
  try {
    const r = await api.rate(post.value.id, v);
    post.value = r.post;
    emit('update', r.post);
    s.reward(r.reward);
    if (v === 5 && !prev) { burst.value = true; setTimeout(() => (burst.value = false), 900); confetti(ev?.clientX, ev?.clientY, 24); }
  } catch (e) {
    post.value = { ...post.value, myRating: prev };
    s.toast({ kind: 'error', title: (e as Error).message });
  }
}

async function react(k: ReactionKind) {
  if (!requireAuth()) return;
  const next = post.value.myReaction === k ? null : k;
  const r = await api.react(post.value.id, next);
  post.value = r.post;
}

async function vote(optionId: string) {
  if (!requireAuth() || post.value.myBattleVote) return;
  const r = await api.voteBattle(post.value.id, optionId);
  post.value = r.post;
}

async function toggleComments() {
  showComments.value = !showComments.value;
  if (showComments.value && !comments.value) comments.value = (await api.post(post.value.id)).comments;
}
if (props.expanded) void api.post(props.post.id).then((r) => (comments.value = r.comments));

async function sendComment() {
  if (!requireAuth() || !draft.value.trim() || busy.value) return;
  busy.value = true;
  try {
    const r = await api.comment(post.value.id, draft.value.trim());
    comments.value = [...(comments.value ?? []), r.comment];
    post.value = { ...post.value, commentCount: post.value.commentCount + 1 };
    draft.value = '';
    s.reward(r.reward);
  } catch (e) {
    s.toast({ kind: 'error', title: (e as Error).message });
  } finally { busy.value = false; }
}

async function share() {
  const url = `${location.origin}/p/${post.value.id}`;
  if (navigator.share) await navigator.share({ title: 'ChatLOL', text: post.value.body, url }).catch(() => {});
  else { await navigator.clipboard.writeText(url); s.toast({ kind: 'info', title: 'Link copied 🔗' }); }
}

async function report() {
  menu.value = false;
  await api.report({ targetType: 'post', targetId: post.value.id, reason: 'Reported from feed' });
  s.toast({ kind: 'info', title: 'Thanks — SafeShield will review it 🛡️' });
}
async function remove() {
  menu.value = false;
  await api.deletePost(post.value.id);
  emit('deleted', post.value.id);
}
</script>

<template>
  <article class="card overflow-hidden">
    <header class="flex items-center gap-3 px-5 pt-5 pb-3">
      <RouterLink :to="`/u/${post.author.handle}`"><Avatar :user="post.author" :size="44" /></RouterLink>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 text-body-lg">
          <UserName :user="post.author" />
          <span class="text-label-sm bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant shrink-0">Lv. {{ post.author.level }}</span>
        </div>
        <p class="text-body-sm text-on-surface-variant truncate">
          @{{ post.author.handle }} • {{ timeAgo(post.createdAt) }}
          <template v-if="post.kind === 'drop'"> • <span class="text-primary font-bold">🌅 Sunset Drop</span></template>
          <template v-else-if="post.kind === 'birthday'"> • <span class="text-primary font-bold">🎂 Birthday</span></template>
          <template v-else-if="post.author.streakDays > 2"> • 🔥 {{ post.author.streakDays }}</template>
        </p>
      </div>
      <div class="relative">
        <button class="btn-icon" aria-label="More" @click="menu = !menu"><Icon name="more_horiz" /></button>
        <div v-if="menu" class="absolute right-0 top-11 z-20 w-44 card shadow-pop p-1.5" @mouseleave="menu = false">
          <button class="w-full text-left px-3 py-2 rounded-full hover:bg-surface-container text-body-md flex gap-2" @click="share"><Icon name="ios_share" :size="18" /> Share</button>
          <button v-if="!mine" class="w-full text-left px-3 py-2 rounded-full hover:bg-surface-container text-body-md flex gap-2" @click="report"><Icon name="flag" :size="18" /> Report</button>
          <button v-if="mine" class="w-full text-left px-3 py-2 rounded-full hover:bg-error-container text-error text-body-md flex gap-2" @click="remove"><Icon name="delete" :size="18" /> Delete</button>
        </div>
      </div>
    </header>

    <!-- System birthday card -->
    <div v-if="post.kind === 'birthday'" class="mx-3 mb-1 rounded-md bg-[linear-gradient(135deg,#ff5e00,#ff8c42_45%,#ffd166)] text-white text-center px-6 py-8 relative overflow-hidden">
      <div class="absolute inset-0 opacity-25 text-5xl leading-[1.6] select-none pointer-events-none" aria-hidden="true">🎈 🎉 🎂 🎁 🎈 🎉 🎂 🎁 🎈 🎉</div>
      <Avatar :user="post.author" :size="88" class="mx-auto ring-4 ring-white/80 rounded-full" />
      <p class="text-headline-lg mt-3 relative">Happy birthday, {{ post.author.displayName.split(' ')[0] }}! 🎂</p>
      <p class="text-body-md opacity-95 relative">Leave a wish below — it means a lot 🧡</p>
      <button v-if="!mine" class="btn bg-white text-flame h-10 mt-4 relative" @click="!showComments && toggleComments()">🎉 Send a birthday wish</button>
    </div>
    <p v-else-if="post.body" class="px-5 pb-3 text-body-lg whitespace-pre-line break-words">
      <template v-for="(part, i) in post.body.split(/(#[\p{L}\p{N}_]+)/u)" :key="i">
        <RouterLink v-if="part.startsWith('#')" :to="`/feed?tag=${part.slice(1).toLowerCase()}`" class="text-primary font-bold hover:underline">{{ part }}</RouterLink>
        <template v-else>{{ part }}</template>
      </template>
    </p>

    <!-- Media -->
    <div v-if="post.mediaUrl" class="relative mx-3 rounded-md overflow-hidden bg-surface-container group" @dblclick="rate(5, $event)">
      <img :src="post.mediaUrl" :alt="post.body || 'Photo'" class="w-full max-h-[640px] object-cover" loading="lazy" />
      <div v-if="post.soundtrack" class="absolute top-3 left-3 glass rounded-full px-3 py-1.5 text-label-sm flex items-center gap-1.5">
        <Icon name="graphic_eq" :size="16" class="text-flame" /> {{ post.soundtrack }}
      </div>
      <div v-if="revealed && post.ratings.count" class="absolute bottom-3 right-3 glass rounded-full px-4 py-2 shadow-pop flex items-center gap-2 animate-pop">
        <span class="text-xl">{{ tier.emoji }}</span>
        <span class="text-label-lg uppercase text-primary">{{ tier.label }}</span>
        <span class="text-label-sm text-on-surface-variant">{{ post.ratings.consensusPct }}% • {{ compact(post.ratings.count) }} votes</span>
      </div>
      <div v-else-if="!revealed && post.ratings.count" class="absolute bottom-0 inset-x-0 glass px-4 py-2.5 flex items-center justify-between">
        <span class="text-label-sm flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-secondary-container text-white flex items-center justify-center"><Icon name="lock" :size="14" /></span>Rate to unveil the consensus</span>
        <span class="text-label-sm text-primary uppercase tracking-wider">Blind Verdict</span>
      </div>
      <div v-if="burst" class="absolute inset-0 flex items-center justify-center pointer-events-none"><span class="text-8xl animate-pop">👑</span></div>
    </div>

    <!-- Battle -->
    <div v-if="post.battle" class="px-5 grid gap-2" :class="post.battle.length === 2 ? 'grid-cols-2' : 'grid-cols-1'">
      <button v-for="o in post.battle" :key="o.id" @click="vote(o.id)"
        class="relative overflow-hidden rounded-md border-2 p-4 text-left transition-all active:scale-[.98]"
        :class="post.myBattleVote === o.id ? 'border-flame bg-sunlit' : 'border-sandstone hover:border-flame/50'">
        <div v-if="post.myBattleVote" class="absolute inset-y-0 left-0 bg-flame/10 transition-[width] duration-700" :style="{ width: (battleTotal ? (o.votes / battleTotal) * 100 : 0) + '%' }" />
        <div class="relative">
          <p class="text-headline-sm">{{ o.label }}</p>
          <p v-if="post.myBattleVote" class="text-label-md text-primary mt-1">{{ battleTotal ? Math.round((o.votes / battleTotal) * 100) : 0 }}% • {{ compact(o.votes) }} votes</p>
          <p v-else class="text-label-sm text-on-surface-variant mt-1">Tap to vote</p>
        </div>
      </button>
    </div>

    <!-- Rating pad -->
    <div v-if="post.kind !== 'text' && post.kind !== 'battle' && post.kind !== 'birthday' && !mine" class="px-5 pt-4">
      <div class="flex items-center justify-between mb-2">
        <span class="label">{{ post.myRating ? 'Your vibe' : 'Lock in your vibe' }}</span>
        <span class="text-label-sm text-primary flex items-center gap-0.5"><Icon name="bolt" :size="14" />+XP per vote</span>
      </div>
      <TierPad :model-value="post.myRating" compact @rate="rate" />
    </div>
    <div v-else-if="mine && post.ratings.count" class="px-5 pt-4 text-body-sm text-on-surface-variant">
      Your vibe score: <b class="text-primary">{{ toTen(post.ratings.avg) }}/10</b> from {{ post.ratings.count }} ratings — {{ levelTitle(post.author.level) }} energy.
    </div>

    <!-- Actions -->
    <footer class="flex items-center gap-1 px-3 py-3 mt-1">
      <div class="flex items-center bg-surface-container-low rounded-full p-1">
        <button v-for="r in REACTIONS" :key="r.key" @click="react(r.key)" :aria-label="r.key"
          class="w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all hover:scale-125 active:scale-90"
          :class="post.myReaction === r.key ? 'bg-flame/15 scale-110' : ''">{{ r.emoji }}</button>
        <span v-if="totalReactions" class="text-label-md px-2 text-on-surface-variant">{{ compact(totalReactions) }}</span>
      </div>
      <button class="btn-ghost h-10 px-3 text-on-surface-variant" @click="toggleComments"><Icon name="chat_bubble" :size="20" />{{ post.commentCount || '' }}</button>
      <button class="btn-ghost h-10 px-3 text-on-surface-variant ml-auto" @click="share" aria-label="Share"><Icon name="send" :size="20" /></button>
    </footer>

    <!-- Comments -->
    <section v-if="showComments" class="px-5 pb-5 space-y-3 border-t border-sandstone pt-4">
      <div v-if="!comments" class="h-10 skeleton rounded-full" />
      <div v-for="c in comments" :key="c.id" class="flex gap-2.5">
        <RouterLink :to="`/u/${c.author.handle}`"><Avatar :user="c.author" :size="32" :show-online="false" /></RouterLink>
        <div class="bg-surface-container-low rounded-[20px] px-4 py-2 min-w-0">
          <div class="flex items-center gap-2 text-body-sm">
            <UserName :user="c.author" />
            <span v-if="c.rating" class="text-label-sm text-primary">{{ TIERS[c.rating - 1].emoji }} {{ TIERS[c.rating - 1].label }}</span>
            <span class="text-on-surface-variant">{{ timeAgo(c.createdAt) }}</span>
          </div>
          <p class="text-body-md break-words">{{ c.body }}</p>
        </div>
      </div>
      <form class="flex gap-2 pt-1" @submit.prevent="sendComment">
        <input v-model="draft" class="input h-11 text-body-md" placeholder="Add your take or a sweet compliment…" maxlength="500" />
        <button class="btn-primary h-11 w-11 px-0 shrink-0" :disabled="!draft.trim() || busy" aria-label="Send"><Icon name="arrow_upward" /></button>
      </form>
      <p class="text-[11px] text-on-surface-variant text-center">SafeShield auto-checks words for kindness 🛡️</p>
    </section>
  </article>
</template>
