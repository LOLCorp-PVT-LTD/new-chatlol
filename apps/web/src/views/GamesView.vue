<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Arena, GameInfo, GameKey, StakeCurrency } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';

/** Game Arenas lobby: create a room (public or invite-only, optional stake), join by code, see open games. */
const s = useSession();
const router = useRouter();
const games = ref<GameInfo[]>([]);
const currencies = ref<StakeCurrency[]>(['none', 'sparks']);
const limits = ref<Record<string, number>>({});
const rake = ref(5);
const arenas = ref<Arena[]>([]);
const creating = ref(false);
const busy = ref(false);
const joinCode = ref('');
const form = ref<{ name: string; game: GameKey; visibility: 'public' | 'private'; currency: StakeCurrency; amount: number }>({ name: '', game: 'chess', visibility: 'public', currency: 'none', amount: 100 });
const CUR: Record<StakeCurrency, string> = { none: 'Just for fun', sparks: '✦ Sparks', gems: '💎 Gems', gold: '🪙 Gold' };
const gameOf = (k: string) => games.value.find((g) => g.key === k);
const mine = computed(() => arenas.value.filter((a) => s.user && (a.playerIds.includes(s.user.id) || a.invitedIds.includes(s.user.id))));
const open = computed(() => arenas.value.filter((a) => !mine.value.includes(a)));

async function load() {
  const [g, a] = await Promise.all([api.games(), api.arenas()]);
  games.value = g.games;
  currencies.value = g.currencies;
  limits.value = g.stakeLimits;
  rake.value = g.rakePct;
  arenas.value = a.arenas;
}
onMounted(load);
// Arena leaderboard: most wins, overall or per game.
const lbGame = ref<string>('');
const leaders = ref<Awaited<ReturnType<typeof api.gamesLeaderboard>>['entries']>([]);
const loadLeaders = async () => (leaders.value = (await api.gamesLeaderboard(lbGame.value || undefined)).entries);
onMounted(loadLeaders);

async function create() {
  busy.value = true;
  try {
    const f = form.value;
    const { arena } = await api.createArena({
      name: f.name.trim() || `${s.user?.displayName}'s ${gameOf(f.game)?.name}`,
      game: f.game,
      visibility: f.visibility,
      stake: { currency: f.currency, amount: f.currency === 'none' ? 0 : Math.max(1, Math.floor(f.amount)) },
    });
    void router.push(`/arenas/${arena.id}`);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = false; }
}
async function byCode() {
  if (!joinCode.value.trim()) return;
  try {
    const { arena } = await api.joinArenaByCode(joinCode.value.trim());
    void router.push(`/arenas/${arena.id}`);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
const stakeLabel = (a: Arena) => (a.stake.amount ? `${a.stake.amount.toLocaleString()} ${CUR[a.stake.currency].split(' ')[0]}` : 'Free');
</script>

<template>
  <div class="max-w-[960px] mx-auto space-y-5">
    <section class="rounded-lg bg-sunset text-white p-6 shadow-float relative overflow-hidden">
      <div class="absolute -right-6 -bottom-10 text-[150px] opacity-20 rotate-12 select-none">🎮</div>
      <p class="label !text-white/80">Game Arenas</p>
      <h1 class="text-headline-lg">Play, bet, win big</h1>
      <p class="text-body-md opacity-90 max-w-lg">Chess, checkers, Texas Hold'em and Sunset Tycoon. Make your own room, invite friends, stake Sparks, Gems or Gold — winner takes the pot ({{ rake }}% house cut).</p>
      <div class="flex flex-wrap gap-2 mt-4">
        <button class="btn bg-white text-flame" :disabled="!s.user" @click="creating = true"><Icon name="add" /> Create an arena</button>
        <form class="flex gap-2" @submit.prevent="byCode">
          <input v-model="joinCode" class="input h-11 w-36 uppercase bg-white/90 text-on-surface" placeholder="Room code" maxlength="12" aria-label="Room code" />
          <button class="btn bg-white/20 h-11">Join</button>
        </form>
      </div>
    </section>

    <section v-if="mine.length" class="space-y-2">
      <h2 class="text-headline-sm">Your games & invites</h2>
      <div class="grid sm:grid-cols-2 gap-3"><RouterLink v-for="a in mine" :key="a.id" :to="`/arenas/${a.id}`" class="card p-4 flex items-center gap-3 hover:shadow-pop transition">
        <span class="text-3xl">{{ gameOf(a.game)?.emoji }}</span>
        <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ a.name }}</p><p class="text-body-sm text-on-surface-variant">{{ gameOf(a.game)?.name }} · {{ stakeLabel(a) }} · {{ a.status === 'lobby' ? `${a.players.length}/${gameOf(a.game)?.max} waiting` : 'in play' }}</p></div>
        <span v-if="s.user && a.invitedIds.includes(s.user.id) && !a.playerIds.includes(s.user.id)" class="chip chip-active">Invited</span>
      </RouterLink></div>
    </section>

    <section class="card p-4 space-y-3">
      <div class="flex items-center gap-2 flex-wrap"><h2 class="text-headline-sm flex-1">🏆 Top players</h2>
        <select v-model="lbGame" class="input h-9 w-auto" aria-label="Game" @change="loadLeaders"><option value="">All games</option><option v-for="g in games" :key="g.key" :value="g.key">{{ g.emoji }} {{ g.name }}</option></select>
        <RouterLink to="/arcade" class="chip h-9">🕹️ Arcade high scores</RouterLink></div>
      <ol class="grid sm:grid-cols-2 gap-x-6 gap-y-1">
        <li v-for="e in leaders.slice(0, 10)" :key="e.user.id" class="flex items-center gap-2 py-1">
          <span class="w-6 text-center font-semibold">{{ e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank }}</span>
          <Avatar :user="e.user" :size="28" :show-online="false" /><span class="flex-1 truncate text-label-md">{{ e.user.displayName }}</span>
          <span class="text-label-md tabular-nums">{{ e.wins }} wins <span class="text-on-surface-variant">/ {{ e.played }}</span></span>
        </li>
      </ol>
      <p v-if="!leaders.length" class="text-body-sm text-on-surface-variant">No finished games yet.</p>
    </section>

    <section class="space-y-2">
      <h2 class="text-headline-sm">Open arenas</h2>
      <p v-if="!open.length" class="text-body-md text-on-surface-variant">No open games right now — start one!</p>
      <div class="grid sm:grid-cols-2 gap-3"><RouterLink v-for="a in open" :key="a.id" :to="`/arenas/${a.id}`" class="card p-4 flex items-center gap-3 hover:shadow-pop transition">
        <span class="text-3xl">{{ gameOf(a.game)?.emoji }}</span>
        <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ a.name }}</p><p class="text-body-sm text-on-surface-variant">{{ gameOf(a.game)?.name }} · {{ stakeLabel(a) }}</p></div>
        <div class="flex -space-x-2"><Avatar v-for="p in a.players.slice(0, 4)" :key="p.id" :user="p" :size="28" :show-online="false" /></div>
      </RouterLink></div>
    </section>

    <Modal v-if="creating" @close="creating = false">
      <form class="p-6 space-y-4" @submit.prevent="create">
        <h2 class="text-headline-md">New arena</h2>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="g in games" :key="g.key" type="button" class="rounded-md border p-3 text-left" :class="form.game === g.key ? 'border-flame ring-2 ring-flame/30' : 'border-sandstone'" @click="form.game = g.key">
            <p class="text-2xl">{{ g.emoji }}</p><p class="text-label-lg">{{ g.name }}</p><p class="text-[11px] text-on-surface-variant">{{ g.min === g.max ? `${g.min} players` : `${g.min}–${g.max} players` }}</p>
          </button>
        </div>
        <p class="text-body-sm text-on-surface-variant">{{ gameOf(form.game)?.desc }}</p>
        <label class="block text-label-md">Room name<input v-model="form.name" class="input h-11 mt-1" maxlength="40" :placeholder="`${s.user?.displayName}'s ${gameOf(form.game)?.name}`" /></label>
        <div class="flex gap-2"><button v-for="v in (['public', 'private'] as const)" :key="v" type="button" class="chip" :class="{ 'chip-active': form.visibility === v }" @click="form.visibility = v">{{ v === 'public' ? '🌍 Public' : '🔒 Invite-only' }}</button></div>
        <div><p class="text-label-md mb-1">Stake (each player)</p>
          <div class="flex flex-wrap gap-2"><button v-for="c in currencies" :key="c" type="button" class="chip" :class="{ 'chip-active': form.currency === c }" @click="form.currency = c">{{ CUR[c] }}</button></div>
          <input v-if="form.currency !== 'none'" v-model.number="form.amount" type="number" min="1" :max="limits[form.currency]" class="input h-11 mt-2 w-40" />
        </div>
        <button class="btn-primary w-full" :disabled="busy">Create & open the room</button>
      </form>
    </Modal>
  </div>
</template>
