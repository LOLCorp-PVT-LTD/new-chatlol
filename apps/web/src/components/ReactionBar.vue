<script setup lang="ts">
import type { ReactionKind } from '@chatlol/shared';
import { REACTIONS } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';

/**
 * Emoji reactions for comments, forum replies, wall notes and chat messages. Shows counts; tapping your current
 * reaction removes it. `compact` hides unused emojis until hovered (for chat bubbles).
 */
const props = defineProps<{
  type: 'comment' | 'reply' | 'wall' | 'message';
  id: string;
  reactions: Partial<Record<ReactionKind, number>>;
  mine?: ReactionKind | null;
  compact?: boolean;
}>();
const emit = defineEmits<{ (e: 'update', v: { reactions: Partial<Record<ReactionKind, number>>; myReaction: ReactionKind | null }): void }>();
const s = useSession();

async function toggle(kind: ReactionKind) {
  if (!s.user) return s.toast({ kind: 'info', title: 'Sign in to react' });
  const next = props.mine === kind ? null : kind;
  // Optimistic: move the count straight away, then take the server's numbers.
  const r = { ...props.reactions };
  if (props.mine) r[props.mine] = Math.max(0, (r[props.mine] ?? 1) - 1);
  if (next) r[next] = (r[next] ?? 0) + 1;
  emit('update', { reactions: r, myReaction: next });
  try {
    emit('update', await api.reactTo(props.type, props.id, next));
  } catch (e) {
    s.toast({ kind: 'error', title: (e as Error).message });
  }
}
</script>

<template>
  <div class="flex items-center gap-1 flex-wrap group/react">
    <button v-for="r in REACTIONS" :key="r.key" type="button"
      class="rounded-full px-1.5 h-7 text-body-sm flex items-center gap-0.5 transition active:scale-90"
      :class="[mine === r.key ? 'is-on' : 'bg-surface-container-low hover:bg-surface-container', compact && !reactions[r.key] && mine !== r.key ? 'hidden group-hover/react:flex' : '']"
      :aria-label="`React ${r.key}`" :aria-pressed="mine === r.key" @click="toggle(r.key)">
      <span>{{ r.emoji }}</span><span v-if="reactions[r.key]" class="font-bold tabular-nums text-label-sm">{{ reactions[r.key] }}</span>
    </button>
    <span v-if="compact && !Object.values(reactions).some(Boolean)" class="text-label-sm text-on-surface-variant opacity-60 group-hover/react:hidden">＋😊</span>
  </div>
</template>
