<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Friendship, UserPublic } from '@chatlol/shared';
import { api } from '../lib/api';
import { confirmDialog } from '../lib/dialog';
import { useSession } from '../stores/session';
import Icon from './Icon.vue';

/** Add friend / Requested / Accept + Decline / Friends ✓ — whatever fits how you stand with this person. */
const props = defineProps<{ user: Pick<UserPublic, 'id' | 'handle' | 'displayName' | 'friendship'>; accent?: string; size?: 'sm' | 'md' }>();
const emit = defineEmits<{ (e: 'change', f: Friendship): void }>();
const s = useSession();
const router = useRouter();
const busy = ref(false);
const first = () => props.user.displayName.split(' ')[0];

async function run(fn: () => Promise<{ friendship: Friendship }>, toast?: string) {
  if (!s.user) return router.push('/join');
  busy.value = true;
  try {
    const r = await fn();
    emit('change', r.friendship);
    if (toast) s.toast({ kind: 'info', title: toast });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = false; }
}
const add = () => run(() => api.addFriend(props.user.id), 'Friend request sent 🤝');
const accept = () => run(() => api.acceptFriend(props.user.id), `You and ${first()} are friends now 🤝`);
const decline = () => run(() => api.declineFriend(props.user.id));
async function cancel() {
  if (await confirmDialog({ title: 'Cancel friend request?', body: `${first()} won’t see it any more.`, icon: 'person_remove', confirmText: 'Cancel request', cancelText: 'Keep it' })) await run(() => api.cancelFriendRequest(props.user.id));
}
async function remove() {
  if (await confirmDialog({ title: `Unfriend ${first()}?`, body: 'You’ll still follow each other unless you unfollow too.', icon: 'person_remove', danger: true, confirmText: 'Unfriend' })) await run(() => api.unfriend(props.user.id));
}
const h = () => (props.size === 'sm' ? 'h-9' : 'h-10');
</script>

<template>
  <span class="inline-flex gap-2">
    <template v-if="user.friendship === 'incoming'">
      <button class="btn text-white" :class="h()" :style="{ background: accent ?? '#ff5e00' }" :disabled="busy" @click="accept"><Icon name="how_to_reg" :size="18" /> Accept</button>
      <button class="btn bg-white/90 text-[#251911]" :class="h()" :disabled="busy" @click="decline">Decline</button>
    </template>
    <button v-else-if="user.friendship === 'outgoing'" class="btn bg-white/90 text-[#251911]" :class="h()" :disabled="busy" title="Cancel request" @click="cancel"><Icon name="schedule" :size="18" /> Requested</button>
    <button v-else-if="user.friendship === 'friends'" class="btn bg-white/90 text-[#251911]" :class="h()" :disabled="busy" title="Unfriend" @click="remove"><Icon name="group" :size="18" /> Friends ✓</button>
    <button v-else class="btn bg-white/90 text-[#251911]" :class="h()" :disabled="busy" @click="add"><Icon name="person_add" :size="18" /> Add friend</button>
  </span>
</template>
