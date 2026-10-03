<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Arena, UserPublic } from '@chatlol/shared';
import { GAMES } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confirmDialog } from '../lib/dialog';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import ChessBoard from '../components/games/ChessBoard.vue';
import CheckersBoard from '../components/games/CheckersBoard.vue';
import PokerTable from '../components/games/PokerTable.vue';
import TycoonBoard from '../components/games/TycoonBoard.vue';

/** One arena: the lobby (invite, start) and then the live game. Updates arrive over the socket. */
const s = useSession();
const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const code = (route.query.code as string) || undefined;
const arena = ref<Arena | null>(null);
const inviting = ref(false);
const friends = ref<UserPublic[]>([]);
const picked = ref<string[]>([]);
const now = ref(Date.now());
const CUR: Record<string, string> = { sparks: '✦', gems: '💎', gold: '🪙' };

const game = computed(() => (arena.value ? GAMES[arena.value.game] : null));
const isHost = computed(() => arena.value?.hostId === s.user?.id);
const seated = computed(() => arena.value?.mySeat != null);
const myTurn = computed(() => arena.value?.status === 'playing' && arena.value.turnSeat === arena.value.mySeat && seated.value);
const secondsLeft = computed(() => (arena.value?.turnDeadline ? Math.max(0, Math.ceil((Date.parse(arena.value.turnDeadline) - now.value) / 1000)) : null));
const err = (e: unknown) => s.toast({ kind: 'error', title: (e as Error).message });

async function load() {
  try { arena.value = (await api.arena(id, code)).arena; } catch (e) { err(e); void router.push('/games'); }
}
const onUpdate = (u: { id: string; version: number }) => { if (u.id === id && (!arena.value || u.version !== arena.value.version)) void load(); };
let tick: ReturnType<typeof setInterval>;
onMounted(async () => {
  await load();
  const sock = s.socket();
  sock.emit('arena:watch', id);
  sock.on('arena:update', onUpdate);
  sock.on('connect', () => sock.emit('arena:watch', id));
  tick = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => {
  const sock = s.socket();
  sock.emit('arena:unwatch', id);
  sock.off('arena:update', onUpdate);
  clearInterval(tick);
});

async function act<T extends { arena: Arena }>(p: Promise<T>) {
  try { arena.value = (await p).arena; } catch (e) { err(e); }
}
const join = () => act(api.joinArena(id, code));
const start = () => act(api.startArena(id));
const move = (action: Record<string, unknown>) => act(api.arenaMove(id, action));
async function leave() {
  const playing = arena.value?.status === 'playing';
  if (playing && !(await confirmDialog({ title: 'Resign?', body: 'You forfeit your stake.', danger: true }))) return;
  await act(api.leaveArena(id));
  if (!playing) void router.push('/games');
}
async function openInvite() {
  inviting.value = true;
  if (!friends.value.length && s.user) friends.value = (await api.friends()).items.map((f) => f.user);
}
async function sendInvites() {
  if (!picked.value.length) return;
  await act(api.inviteToArena(id, picked.value));
  s.toast({ kind: 'reward', title: `🎮 Invited ${picked.value.length} friend${picked.value.length > 1 ? 's' : ''}` });
  picked.value = [];
  inviting.value = false;
}
async function copyLink() {
  const link = `${location.origin}/arenas/${id}?code=${arena.value?.code}`;
  try { await navigator.clipboard.writeText(link); s.toast({ kind: 'info', title: '🔗 Invite link copied' }); } catch { s.toast({ kind: 'info', title: link }); }
}
const payout = (userId: string) => arena.value?.payouts.find((p) => p.userId === userId)?.amount ?? 0;
</script>

<template>
  <div v-if="arena && game" class="max-w-[1100px] mx-auto space-y-4">
    <header class="card p-4 flex flex-wrap items-center gap-3">
      <span class="text-4xl">{{ game.emoji }}</span>
      <div class="min-w-0 flex-1">
        <h1 class="text-headline-sm truncate">{{ arena.name }}</h1>
        <p class="text-body-sm text-on-surface-variant">{{ game.name }} · {{ arena.stake.amount ? `${CUR[arena.stake.currency]} ${arena.stake.amount.toLocaleString()} each` : 'Just for fun' }} · {{ arena.visibility === 'private' ? '🔒 Invite-only' : '🌍 Public' }}</p>
      </div>
      <span v-if="arena.status === 'playing'" class="chip" :class="{ 'chip-active': myTurn }">{{ myTurn ? 'Your turn' : 'Waiting' }}<template v-if="secondsLeft != null"> · ⏱ {{ secondsLeft }}s</template></span>
      <button v-if="arena.code" class="btn-secondary h-10" @click="copyLink"><Icon name="link" :size="18" /> {{ arena.code }}</button>
      <button v-if="seated && arena.status !== 'finished' && arena.status !== 'closed'" class="btn-ghost h-10 text-error" @click="leave">{{ arena.status === 'playing' ? 'Resign' : isHost ? 'Close room' : 'Leave' }}</button>
    </header>

    <!-- Lobby -->
    <section v-if="arena.status === 'lobby'" class="card p-5 space-y-4">
      <p class="label">Players {{ arena.players.length }}/{{ game.max }} (need {{ game.min }})</p>
      <div class="flex flex-wrap gap-3"><div v-for="p in arena.players" :key="p.id" class="flex items-center gap-2 rounded-full bg-surface-container-low pr-4"><Avatar :user="p" :size="36" /><UserName :user="p" /><span v-if="p.id === arena.hostId" class="text-label-sm text-primary">host</span></div></div>
      <div class="flex flex-wrap gap-2">
        <button v-if="!seated && s.user" class="btn-primary" @click="join">Join{{ arena.stake.amount ? ` (${CUR[arena.stake.currency]} ${arena.stake.amount.toLocaleString()})` : '' }}</button>
        <button v-if="seated" class="btn-secondary" @click="openInvite"><Icon name="person_add" :size="18" /> Invite friends</button>
        <button v-if="isHost" class="btn-primary" :disabled="arena.players.length < game.min" @click="start">Start game</button>
      </div>
      <p v-if="arena.stake.amount" class="text-body-sm text-on-surface-variant">Stakes are taken from everyone when the host starts. Winner takes the pot (5% house cut); a draw gives everyone their stake back.</p>
    </section>

    <!-- Game -->
    <template v-else-if="arena.state">
      <section v-if="arena.status === 'finished'" class="card p-5 text-center space-y-2">
        <p class="text-headline-md">🏁 Game over</p>
        <p class="text-body-md text-on-surface-variant">{{ arena.outcome?.reason }}</p>
        <div class="flex flex-wrap justify-center gap-3"><div v-for="p in arena.players" :key="p.id" class="flex items-center gap-2"><Avatar :user="p" :size="32" /><span class="text-label-lg">{{ p.displayName }}</span><span v-if="payout(p.id)" class="text-primary text-label-lg">+{{ payout(p.id).toLocaleString() }} {{ CUR[arena.stake.currency] }}</span></div></div>
        <RouterLink to="/games" class="btn-secondary inline-flex mt-2">Back to arenas</RouterLink>
      </section>
      <ChessBoard v-if="arena.game === 'chess'" :arena="arena" :my-turn="myTurn" @move="move" />
      <CheckersBoard v-else-if="arena.game === 'checkers'" :arena="arena" :my-turn="myTurn" @move="move" />
      <PokerTable v-else-if="arena.game === 'poker'" :arena="arena" :my-turn="myTurn" @move="move" />
      <TycoonBoard v-else-if="arena.game === 'tycoon'" :arena="arena" :my-turn="myTurn" @move="move" />
    </template>
    <p v-else-if="arena.status === 'closed'" class="card p-5 text-center">This room was closed.</p>

    <Modal v-if="inviting" @close="inviting = false">
      <div class="p-6 space-y-3">
        <h2 class="text-headline-md">Invite friends</h2>
        <p v-if="!friends.length" class="text-body-md text-on-surface-variant">No friends yet — share the room code instead.</p>
        <label v-for="f in friends" :key="f.id" class="flex items-center gap-3 rounded-md p-2 hover:bg-surface-container-low cursor-pointer">
          <input v-model="picked" type="checkbox" :value="f.id" :disabled="arena.invitedIds.includes(f.id) || arena.playerIds.includes(f.id)" />
          <Avatar :user="f" :size="32" /><span class="text-label-lg flex-1">{{ f.displayName }}</span>
          <span v-if="arena.invitedIds.includes(f.id)" class="text-label-sm text-on-surface-variant">invited</span>
        </label>
        <button class="btn-primary w-full" :disabled="!picked.length" @click="sendInvites">Send invites</button>
      </div>
    </Modal>
  </div>
</template>
