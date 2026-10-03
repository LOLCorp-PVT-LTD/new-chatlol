<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { CLAN_BOARDS, CLAN_JOIN_POLICIES, CLAN_LEVELS, CLAN_LIVE_EVENTS, can as canPerm, clanSeasonFor, prestigeStars, type ClanBoardKey, type ClanLiveEvent, type ClanPolicy } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Modal from '../components/Modal.vue';
import Icon from '../components/Icon.vue';
import Countdown from '../components/Countdown.vue';
import ScrollRow from '../components/ScrollRow.vue';
import Avatar from '../components/Avatar.vue';
import ClanWarCard from '../components/ClanWarCard.vue';

/** Clans: this week's event, wars going on right now, the clan leaderboard, and founding your own. */
const s = useSession();
const router = useRouter();
const data = ref<Awaited<ReturnType<typeof api.clans>> | null>(null);
const wars = ref<Awaited<ReturnType<typeof api.clanWars>>['wars']>([]);
const q = ref('');
const sort = ref<'rep' | 'reputation'>('rep');
const load = async () => {
  [data.value, wars.value] = await Promise.all([api.clans(q.value.trim() || undefined, sort.value), api.clanWars().then((r) => r.wars)]);
};
onMounted(load);
let t: ReturnType<typeof setTimeout>;
watch([q, sort], () => { clearTimeout(t); t = setTimeout(() => void load(), 300); });

// Season, leaderboards, live events
const season = clanSeasonFor();
const board = ref<ClanBoardKey>('season');
const rows = ref<Awaited<ReturnType<typeof api.clanLeaderboard>>['rows']>([]);
const loadBoard = async () => (rows.value = (await api.clanLeaderboard(board.value)).rows);
watch(board, () => void loadBoard());
const live = ref<ClanLiveEvent | null>(null);
const nextAt = ref<string | null>(null);
const loadLive = async () => { const r = await api.clanLiveEvent(); live.value = r.event; nextAt.value = r.nextAt; };
const onEvent = (e: ClanLiveEvent) => (live.value = e);
onMounted(() => { void loadBoard(); void loadLive(); s.socket().on('clan:event', onEvent); });
onUnmounted(() => s.socket().off('clan:event', onEvent));
const staff = () => !!s.user && canPerm(s.user, 'tournaments');
async function fire(key: string) {
  try { live.value = (await api.startClanLiveEvent(key)).event; } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}

const founding = ref(false);
const f = ref({ name: '', tag: '', emoji: '🏰', description: '', policy: 'open' as ClanPolicy });
const busy = ref(false);
async function found() {
  busy.value = true;
  try {
    const r = await api.createClan({ ...f.value, tag: f.value.tag.toUpperCase() });
    s.toast({ kind: 'reward', title: `🏰 ${r.clan.name} is born!` });
    void router.push(`/clans/${r.clan.id}`);
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = false; }
}
</script>

<template>
  <div class="max-w-[1000px] mx-auto space-y-5">
    <section class="rounded-lg p-6 text-white shadow-float relative overflow-hidden bg-[linear-gradient(135deg,#1b1036,#5b21b6_55%,#ff5e00)]">
      <div class="absolute -right-6 -bottom-10 text-[150px] opacity-20 rotate-12 select-none">🏰</div>
      <p class="label !text-white/80">Clans</p>
      <h1 class="text-headline-xl">Team up. Level up. Go to war.</h1>
      <p class="text-body-md opacity-90 max-w-xl mt-1">Everything your members do earns Clan XP and levels you up. Quests, wars, achievements and territories earn Reputation — your clan’s standing.</p>
      <div class="flex flex-wrap gap-2 mt-4">
        <RouterLink to="/clans/map" class="btn bg-white/20 text-white">🗺️ Social Map</RouterLink>
        <RouterLink v-if="data?.myClanId" :to="`/clans/${data.myClanId}`" class="btn bg-white text-[#3b0764]"><Icon name="shield" :size="18" /> My clan</RouterLink>
        <button v-else-if="s.user" class="btn bg-white text-[#3b0764]" @click="founding = true">🏰 Found a clan · 🪙 {{ data?.found.gold ?? 5 }}</button>
      </div>
    </section>

    <!-- Live server event -->
    <section v-if="live" class="rounded-lg p-5 text-white shadow-float bg-[linear-gradient(135deg,#ff3d6e,#ff9900)] flex flex-wrap items-center gap-3 live-ev">
      <span class="text-5xl">{{ live.emoji }}</span>
      <div class="flex-1 min-w-[200px]"><p class="label !text-white/80">Live now</p><p class="text-headline-md">{{ live.name }}</p><p class="text-body-md opacity-90">{{ live.desc }}</p></div>
      <span class="chip h-9 bg-white/25 text-white border-white/30">Ends in <Countdown :to="live.endsAt" /></span>
    </section>
    <p v-else-if="nextAt" class="text-body-sm text-on-surface-variant text-center">⚡ Next surprise clan event in about <Countdown :to="nextAt" /></p>
    <details v-if="staff()" class="card p-4 text-body-sm"><summary class="cursor-pointer text-label-lg">🎛️ Start a live clan event (staff)</summary>
      <div class="flex flex-wrap gap-2 mt-2"><button v-for="e in CLAN_LIVE_EVENTS" :key="e.key" class="chip h-9" @click="fire(e.key)">{{ e.emoji }} {{ e.name }}</button></div>
    </details>

    <!-- Season & leaderboards -->
    <section class="card p-5 space-y-3">
      <div class="flex flex-wrap items-center gap-2"><p class="text-headline-sm flex-1">🏆 Clan Season {{ season.number }}</p><span class="chip h-8">Ends in <Countdown :to="season.endsAt" /></span></div>
      <p class="text-body-sm text-on-surface-variant">Season points come from Clan XP, quests, wars, territories, bounties and events. The top 10 win trophies, Reputation and Gems for every member. Levels, Prestige and history are forever.</p>
      <ScrollRow><button v-for="b in CLAN_BOARDS" :key="b.key" class="chip h-9 shrink-0" :class="{ 'chip-active': board === b.key }" @click="board = b.key">{{ b.emoji }} {{ b.name }}</button></ScrollRow>
      <p v-if="!rows.length" class="text-body-md text-on-surface-variant">Nobody on this board yet.</p>
      <component :is="r.clan ? 'RouterLink' : 'div'" v-for="r in rows" :key="r.rank" :to="r.clan ? `/clans/${r.clan.id}` : undefined" class="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-container-low">
        <span class="w-7 text-center font-bold">{{ ['🥇', '🥈', '🥉'][r.rank - 1] ?? r.rank }}</span>
        <template v-if="r.alliance"><span class="text-xl">{{ r.alliance.emoji }}</span><span class="flex-1 truncate text-label-lg">{{ r.alliance.name }} <span class="text-on-surface-variant">{{ r.alliance.tags.map((t) => `[${t}]`).join(' ') }}</span></span></template>
        <template v-else-if="r.user"><Avatar :user="r.user" :size="32" /><span class="flex-1 truncate text-label-lg">{{ r.user.displayName }} <span v-if="r.clan" class="text-on-surface-variant">{{ r.clan.emoji }} [{{ r.clan.tag }}]</span></span></template>
        <template v-else-if="r.clan"><span class="text-xl">{{ r.clan.emoji }}</span><span class="flex-1 truncate text-label-lg">{{ r.clan.name }} <span class="text-on-surface-variant">[{{ r.clan.tag }}]</span> <span v-if="r.clan.prestige" class="text-primary" :title="`Prestige ${r.clan.prestige}`">{{ prestigeStars(r.clan.prestige) }}</span></span></template>
        <span class="text-right"><span class="block tabular-nums text-label-lg">{{ r.value.toLocaleString() }}</span><span v-if="r.sub" class="block text-body-sm text-on-surface-variant">{{ r.sub }}</span></span>
      </component>
    </section>

    <!-- This week's event -->
    <section v-if="data" class="card p-5">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-headline-sm flex-1">{{ data.event.emoji }} This week: {{ data.event.name }}</p>
        <span class="chip h-8">{{ data.event.weekend ? '🔥 Double Clan XP weekend — on now!' : 'Double Clan XP this weekend' }}</span>
        <span class="chip h-8">Ends in <Countdown :to="data.event.endsAt" /></span>
      </div>
      <p class="text-body-md text-on-surface-variant mt-1">{{ data.event.desc }} Top 3 clans of the week: 💎 30 / 15 / 8 for every member.</p>
      <div v-if="data.event.standings.length" class="mt-3 space-y-1">
        <RouterLink v-for="r in data.event.standings.slice(0, 5)" :key="r.clanId" :to="`/clans/${r.clanId}`" class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-container-low">
          <span class="w-7 text-center font-bold">{{ ['🥇', '🥈', '🥉'][r.rank - 1] ?? r.rank }}</span><span class="text-xl">{{ r.emoji }}</span>
          <span class="flex-1 truncate text-label-lg">{{ r.name }} <span class="text-on-surface-variant">[{{ r.tag }}]</span></span><span class="tabular-nums text-label-lg">{{ r.rep.toLocaleString() }} XP</span>
        </RouterLink>
      </div>
    </section>

    <!-- Wars on now -->
    <section v-if="wars.length" class="card p-5 space-y-2">
      <p class="text-headline-sm">⚔️ Clan Wars on now</p>
      <ClanWarCard v-for="w in wars" :key="w.id" :war="w" />
    </section>

    <!-- Leaderboard -->
    <section class="card p-5 space-y-3">
      <div class="flex items-center gap-3"><p class="text-headline-sm flex-1">🔎 Browse clans</p>
        <button class="chip h-9" :class="{ 'chip-active': sort === 'rep' }" @click="sort = 'rep'">Level</button><button class="chip h-9" :class="{ 'chip-active': sort === 'reputation' }" @click="sort = 'reputation'">⭐ Reputation</button>
        <input v-model="q" class="input h-10 max-w-[240px]" placeholder="Search name or tag" /></div>
      <RouterLink v-for="(c, i) in data?.clans ?? []" :key="c.id" :to="`/clans/${c.id}`" class="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-container-low">
        <span class="w-7 text-center font-bold text-on-surface-variant">{{ i + 1 }}</span>
        <span class="w-11 h-11 rounded-full flex items-center justify-center text-2xl shrink-0" :style="{ background: c.color ?? 'rgb(var(--c-surface-container-high))' }">{{ c.emoji }}</span>
        <div class="flex-1 min-w-0">
          <p class="text-label-lg truncate">{{ c.name }} <span class="text-on-surface-variant">[{{ c.tag }}]</span></p>
          <p class="text-body-sm text-on-surface-variant">Level {{ c.level }} · {{ c.memberCount }}/{{ c.maxMembers }} members · {{ c.wins }}W {{ c.losses }}L · {{ CLAN_JOIN_POLICIES.find((p) => p.key === c.policy)?.label.split(' —')[0] }}</p>
        </div>
        <span class="text-right"><span class="block tabular-nums text-label-lg">⭐ {{ c.reputation.toLocaleString() }}</span><span class="block tabular-nums text-body-sm text-on-surface-variant">{{ c.rep.toLocaleString() }} XP</span></span>
      </RouterLink>
      <p v-if="data && !data.clans.length" class="text-body-md text-on-surface-variant">No clans yet — found the first one!</p>
    </section>

    <Modal v-if="founding" title="🏰 Found a clan" @close="founding = false">
      <form class="px-6 pb-6 space-y-3" @submit.prevent="found">
        <div class="flex gap-2"><input v-model="f.emoji" class="input w-16 text-center text-xl px-0" maxlength="8" aria-label="Emoji" /><input v-model="f.name" class="input" placeholder="Clan name" maxlength="24" required minlength="3" /></div>
        <input v-model="f.tag" class="input uppercase" placeholder="Tag (2–5 letters, e.g. LOL)" maxlength="5" required minlength="2" />
        <textarea v-model="f.description" class="textarea" rows="3" maxlength="300" placeholder="What’s your clan about?" />
        <select v-model="f.policy" class="input"><option v-for="p in CLAN_JOIN_POLICIES" :key="p.key" :value="p.key">{{ p.label }}</option></select>
        <div class="rounded-md bg-surface-container-low p-3 text-body-sm space-y-1">
          <p class="font-bold">What your clan unlocks as it levels up</p>
          <p v-for="l in CLAN_LEVELS" :key="l.level">Lv {{ l.level }} ({{ l.rep.toLocaleString() }} XP): {{ l.perk }} · {{ l.members }} members</p>
        </div>
        <button class="btn-primary w-full" :disabled="busy">Found it · 🪙 {{ data?.found.gold ?? 5 }} Gold</button>
        <p class="text-body-sm text-on-surface-variant text-center">Needs level {{ data?.found.minLevel ?? 8 }}+</p>
      </form>
    </Modal>
  </div>
</template>
<style scoped>
.live-ev { animation: live-pulse 2.4s ease-in-out infinite; }
@keyframes live-pulse { 50% { box-shadow: 0 0 0 6px rgb(255 94 0 / 0.25), 0 20px 50px -10px rgb(255 61 110 / 0.6); } }
@media (prefers-reduced-motion: reduce) { .live-ev { animation: none; } }
</style>
