<script setup lang="ts">
import { confirmDialog, reportDialog } from '../lib/dialog';
import RichText from './RichText.vue';
import StickerView from './StickerView.vue';
import { computed } from 'vue';
import type { Shout, ReactionKind } from '@chatlol/shared';
import { REACTIONS, SHOUT_MOODS, timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from './Avatar.vue';
import UserName from './UserName.vue';
import Icon from './Icon.vue';

const props = defineProps<{ shout: Shout; compact?: boolean }>();
const emit = defineEmits<{ (e: 'reply', s: Shout): void; (e: 'update', s: Shout): void; (e: 'removed', id: string): void }>();
const s = useSession();
const mood = computed(() => SHOUT_MOODS.find((m) => m.key === props.shout.mood));
const mine = computed(() => s.user?.id === props.shout.author.id);
const canDelete = computed(() => mine.value || s.user?.role === 'admin' || s.user?.role === 'mod');
/** Splits text so @mentions and #tags render as links. */

async function react(kind: ReactionKind) {
  if (!s.user) return s.toast({ kind: 'info', title: 'Sign in to react' });
  try {
    emit('update', (await api.reactShout(props.shout.id, props.shout.myReaction === kind ? null : kind)).shout);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function remove() {
  if (!(await confirmDialog({ title: 'Delete this shout?', body: 'It disappears from the Shoutbox for everyone.', icon: 'delete', danger: true, confirmText: 'Delete' }))) return;
  await api.deleteShout(props.shout.id);
  emit('removed', props.shout.id);
}
async function report() {
  const reason = await reportDialog('this shout');
  if (!reason) return;
  await api.report({ targetType: 'shout', targetId: props.shout.id, reason });
  s.toast({ kind: 'info', title: 'Thanks — SafeShield is reviewing it 🛡️' });
}
</script>

<template>
  <article class="flex gap-3" :class="compact ? 'py-2.5' : 'card p-4'">
    <RouterLink :to="`/u/${shout.author.handle}`" class="shrink-0"><Avatar :user="shout.author" :size="compact ? 36 : 44" /></RouterLink>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2 flex-wrap text-body-sm">
        <UserName :user="shout.author" />
        <span v-if="shout.author.premium" title="Premium" class="text-[13px]">👑</span>
        <span v-if="mood" class="rounded-full bg-sunlit text-flame px-2 py-0.5 text-label-sm">{{ mood.emoji }} {{ mood.label }}</span>
        <span class="text-on-surface-variant">{{ timeAgo(shout.createdAt) }}</span>
      </div>
      <RouterLink v-if="shout.replyTo" :to="`/shouts?focus=${shout.replyTo.id}`" class="mt-1.5 block border-l-4 border-flame/40 bg-surface-container-low rounded-r-md px-3 py-1.5 text-body-sm text-on-surface-variant truncate">
        ↪ <b>@{{ shout.replyTo.author.handle }}</b> {{ shout.replyTo.body }}
      </RouterLink>
      <p v-if="shout.body" class="mt-1 break-words" :class="compact ? 'text-body-md' : 'text-body-lg'"><RichText :text="shout.body" tags /></p>
      <StickerView v-if="shout.sticker" :sticker="shout.sticker" :size="compact ? 96 : 128" class="mt-1" />
      <div class="flex items-center gap-1 mt-2 flex-wrap">
        <button v-for="r in REACTIONS" :key="r.key" class="rounded-full px-2 h-8 text-body-sm flex items-center gap-1 transition active:scale-90"
          :class="shout.myReaction === r.key ? 'bg-sunset text-white' : 'bg-surface-container-low hover:bg-surface-container'"
          :aria-label="`React ${r.key}`" @click="react(r.key)">
          <span>{{ r.emoji }}</span><span v-if="shout.reactions[r.key]" class="font-bold tabular-nums">{{ shout.reactions[r.key] }}</span>
        </button>
        <button v-if="s.user" class="btn-ghost h-8 px-3 text-label-md" @click="emit('reply', shout)"><Icon name="reply" :size="18" /> Reply<span v-if="shout.replyCount" class="text-on-surface-variant">· {{ shout.replyCount }}</span></button>
        <span class="flex-1" />
        <button v-if="canDelete" class="btn-icon w-8 h-8" aria-label="Delete shout" @click="remove"><Icon name="delete" :size="18" /></button>
        <button v-else-if="s.user" class="btn-icon w-8 h-8" aria-label="Report shout" @click="report"><Icon name="flag" :size="18" /></button>
      </div>
    </div>
  </article>
</template>
