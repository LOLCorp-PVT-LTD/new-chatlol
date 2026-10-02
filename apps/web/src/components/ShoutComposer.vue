<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { Shout, UserPublic } from '@chatlol/shared';
import { SHOUT_MAX, SHOUT_MOODS } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';

/** Write a shout: 140 characters, optional mood, @mentions with autocomplete, one every 45 seconds. */
const props = defineProps<{ replyTo?: Shout | null; nextShoutAt?: string | null; compact?: boolean }>();
const emit = defineEmits<{ (e: 'posted', s: Shout, nextAt: string): void; (e: 'cancelReply'): void }>();
const s = useSession();
const body = ref('');
const mood = ref<string | null>(null);
const busy = ref(false);
const nextAt = ref<string | null>(props.nextShoutAt ?? null);
const nowTick = ref(Date.now());
const timer = setInterval(() => (nowTick.value = Date.now()), 500);
onUnmounted(() => clearInterval(timer));
watch(() => props.nextShoutAt, (v) => (nextAt.value = v ?? null));
watch(() => props.replyTo, (r) => { if (r && !body.value.includes(`@${r.author.handle}`)) body.value = `@${r.author.handle} ${body.value}`; });
const wait = computed(() => (nextAt.value ? Math.max(0, Math.ceil((Date.parse(nextAt.value) - nowTick.value) / 1000)) : 0));
const left = computed(() => SHOUT_MAX - body.value.length);

// @mention autocomplete
const suggestions = ref<UserPublic[]>([]);
let searchSeq = 0;
watch(body, async (v) => {
  const m = v.match(/@([\w.]{1,20})$/);
  if (!m) return (suggestions.value = []);
  const seq = ++searchSeq;
  const r = await api.members({ q: m[1] });
  if (seq === searchSeq) suggestions.value = r.items.slice(0, 5);
});
function pickMention(u: UserPublic) {
  body.value = body.value.replace(/@([\w.]{1,20})$/, `@${u.handle} `);
  suggestions.value = [];
}

async function send() {
  if (!body.value.trim() || busy.value || wait.value) return;
  busy.value = true;
  try {
    const r = await api.shout({ body: body.value.trim(), mood: mood.value, replyToId: props.replyTo?.id ?? null });
    nextAt.value = r.nextShoutAt;
    body.value = '';
    mood.value = null;
    emit('posted', r.shout, r.nextShoutAt);
    s.reward(r.reward);
  } catch (e) {
    s.toast({ kind: 'error', title: (e as Error).message });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form v-if="s.user" class="card p-4 space-y-3 relative" @submit.prevent="send">
    <div class="flex gap-3">
      <Avatar :user="s.user" :size="40" :show-online="false" />
      <div class="flex-1 min-w-0">
        <div v-if="replyTo" class="flex items-center gap-2 text-body-sm text-on-surface-variant mb-1.5">
          <Icon name="reply" :size="16" /> Replying to <b>@{{ replyTo.author.handle }}</b>
          <button type="button" class="text-primary font-bold" @click="emit('cancelReply')">cancel</button>
        </div>
        <textarea v-model="body" :maxlength="SHOUT_MAX" rows="2" class="textarea py-3" :placeholder="compact ? 'Shout something to everyone…' : 'Shout to the whole of ChatLOL… tag people with @handle'" @keydown.enter.exact.prevent="send" />
        <div v-if="suggestions.length" class="absolute z-20 mt-1 card shadow-float w-64 py-1">
          <button v-for="u in suggestions" :key="u.id" type="button" class="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-container-low text-left" @click="pickMention(u)">
            <Avatar :user="u" :size="28" :show-online="false" /><span class="text-label-md truncate">{{ u.displayName }}</span><span class="text-body-sm text-on-surface-variant truncate">@{{ u.handle }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <button v-for="m in compact ? [] : SHOUT_MOODS" :key="m.key" type="button" class="chip h-8 text-label-sm" :class="{ 'chip-active': mood === m.key }" @click="mood = mood === m.key ? null : m.key">{{ m.emoji }} {{ m.label }}</button>
      <span class="flex-1" />
      <span class="text-label-md tabular-nums" :class="left < 15 ? 'text-error' : 'text-on-surface-variant'">{{ left }}</span>
      <button class="btn-primary h-10" :disabled="!body.trim() || busy || wait > 0">
        <template v-if="wait"><Icon name="hourglass_top" :size="18" /> {{ wait }}s</template>
        <template v-else><Icon name="campaign" :size="18" /> Shout</template>
      </button>
    </div>
  </form>
  <div v-else class="card p-4 flex items-center gap-3">
    <span class="text-2xl">📣</span><p class="flex-1 text-body-md">Join to shout to everyone on ChatLOL.</p><RouterLink to="/join" class="btn-primary h-10">Join</RouterLink>
  </div>
</template>
