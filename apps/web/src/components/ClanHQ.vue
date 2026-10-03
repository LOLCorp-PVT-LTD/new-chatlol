<script setup lang="ts">
import { computed } from 'vue';
import { CLAN_ACHIEVEMENTS, CLAN_COSMETICS, HQ_STAGES, TERRITORIES, clanEventFor, clanSeasonFor, hqLevel, hqStageFor, siegeFor, type ClanCosmetic } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confirmDialog, promptDialog } from '../lib/dialog';
import Avatar from './Avatar.vue';
import Countdown from './Countdown.vue';

/**
 * The Clan HQ: a home that grows with the clan (Camp → Hideout → Fortress → Citadel → Sky Palace) with its lobby (who's
 * online), mission board, war room, trophy room, hall of fame, stats, what's coming up, the clan shop and the alliance.
 */
type ClanData = Awaited<ReturnType<typeof api.clan>>;
const props = defineProps<{ d: ClanData; can: (p: 'treasury' | 'settings' | 'wars') => boolean; founder: boolean }>();
const emit = defineEmits<{ (e: 'reload'): void; (e: 'tab', t: 'quests' | 'upgrades' | 'achievements' | 'treasury'): void }>();
const s = useSession();
const c = computed(() => props.d.clan);
const stage = computed(() => hqStageFor(c.value.level, c.value.prestige));
const online = computed(() => props.d.members.filter((m) => m.user.online));
const liveWars = computed(() => props.d.wars.filter((w) => w.status === 'active'));
const held = computed(() => TERRITORIES.filter((t) => props.d.world.territories.includes(t.key)));
const siege = siegeFor();
const season = clanSeasonFor();
const week = clanEventFor();
const questsLeft = computed(() => props.d.world.objectives.filter((o) => !o.done).length + props.d.bounties.filter((b) => !b.done).length);

// Shop
const owned = (k: string) => c.value.cosmetics.includes(k);
const locked = (x: ClanCosmetic) =>
  (c.value.level < x.minLevel && !c.value.prestige) ? `Clan level ${x.minLevel}` : x.upgrade && hqLevel(props.d.world.hq, 'prestige') < x.upgrade ? `Prestige upgrade ${x.upgrade}` : x.prestige && c.value.prestige < x.prestige ? 'Prestige clans' : '';
async function act(p: Promise<unknown>, ok: string) {
  try { await p; s.toast({ kind: 'info', title: ok }); emit('reload'); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function buy(x: ClanCosmetic) {
  if (await confirmDialog({ title: `Buy ${x.name}?`, body: `✦ ${x.cost.toLocaleString()} from the treasury. It’s equipped straight away.` })) await act(api.buyClanCosmetic(c.value.id, x.key), `✨ ${x.name} unlocked`);
}
const equip = (x: ClanCosmetic) => act(api.equipClanCosmetic(c.value.id, x.kind, c.value.equipped[x.kind] === x.key ? null : x.key), c.value.equipped[x.kind] === x.key ? 'Unequipped' : 'Equipped');

// Alliance
const al = computed(() => props.d.alliance);
async function createAlliance() {
  const name = await promptDialog({ title: '🤝 Found an alliance', body: 'Up to three clans band together for big events — allies can’t war each other.', placeholder: 'Alliance name', confirmText: 'Found it', required: true });
  if (name) await act(api.createAlliance(c.value.id, name, '🤝'), `🤝 ${name} founded`);
}
async function inviteAlly() {
  const tag = (await promptDialog({ title: 'Invite a clan', placeholder: 'Clan tag, e.g. CATS', confirmText: 'Invite', required: true }))?.trim().toUpperCase();
  if (!tag || !al.value) return;
  const found = (await api.clans(tag)).clans.find((x) => x.tag === tag);
  if (!found) return void s.toast({ kind: 'error', title: `No clan with the tag ${tag}` });
  await act(api.inviteToAlliance(al.value.id, found.id), `Invited ${found.name}`);
}
async function leaveAlliance() {
  if (al.value && (await confirmDialog({ title: `Leave ${al.value.name}?`, danger: true }))) await act(api.leaveAlliance(al.value.id, c.value.id), 'Left the alliance');
}
</script>

<template>
  <div class="space-y-5">
    <!-- The building -->
    <section class="hq rounded-lg overflow-hidden relative text-white shadow-float" :class="`hq-${stage.stage}`">
      <div class="absolute inset-0 hq-sky" />
      <div class="absolute inset-x-0 bottom-0 h-[34%] hq-ground" />
      <span v-for="i in stage.stage + 1" :key="`f${i}`" class="absolute bottom-[30%] text-2xl sm:text-3xl hq-flag" :style="{ left: `${6 + ((i - 1) * 86) / stage.stage}%`, animationDelay: `${i * 0.4}s` }">{{ i % 2 ? '🚩' : '🔥' }}</span>
      <div class="relative flex flex-col items-center justify-end h-[260px] sm:h-[320px] pb-6">
        <span class="hq-building select-none" :style="{ fontSize: `${70 + stage.stage * 22}px` }">{{ stage.emoji }}</span>
        <p class="text-headline-md mt-1">{{ c.emoji }} {{ c.name }} {{ stage.name }}</p>
        <p class="text-body-sm opacity-90 text-center px-4">{{ stage.desc }}</p>
      </div>
      <div class="relative flex justify-center gap-1.5 pb-4">
        <span v-for="st in HQ_STAGES" :key="st.stage" class="w-8 h-1.5 rounded-full" :class="st.stage <= stage.stage ? 'bg-white' : 'bg-white/25'" :title="`${st.name} (level ${st.minLevel}${st.prestige ? ', Prestige' : ''})`" />
      </div>
    </section>

    <div class="grid md:grid-cols-2 gap-5">
      <!-- Lobby -->
      <section class="card p-5 space-y-2">
        <p class="text-headline-sm">🛋️ Lobby · {{ online.length }} online</p>
        <p v-if="!online.length" class="text-body-md text-on-surface-variant">Nobody’s around right now.</p>
        <div class="flex flex-wrap gap-2"><RouterLink v-for="m in online" :key="m.user.id" :to="`/u/${m.user.handle}`" :title="m.user.displayName"><Avatar :user="m.user" :size="40" /></RouterLink></div>
        <RouterLink v-if="c.loungeId" :to="`/lounges/${c.loungeId}`" class="btn-secondary h-9 inline-flex">Go to the clan lounge</RouterLink>
      </section>
      <!-- Mission board -->
      <section class="card p-5 space-y-2 cursor-pointer" @click="emit('tab', 'quests')">
        <p class="text-headline-sm">📜 Mission board</p>
        <p class="text-body-md">{{ questsLeft ? `${questsLeft} quests and bounties open` : 'All done for now 🎉' }}</p>
        <p v-for="o in d.world.objectives" :key="o.key" class="text-body-sm flex gap-2"><span>{{ o.done ? '✅' : o.emoji }}</span><span class="flex-1 truncate">{{ o.name }}</span><span class="tabular-nums">{{ Math.floor((o.progress / o.target) * 100) }}%</span></p>
      </section>
      <!-- War room -->
      <section class="card p-5 space-y-2">
        <p class="text-headline-sm">🗺️ War room</p>
        <p class="text-body-md">{{ liveWars.length ? `${liveWars.length} war${liveWars.length > 1 ? 's' : ''} on now` : 'No war right now' }} · {{ c.wins }}W {{ c.losses }}L · streak {{ c.stats.streak }} (best {{ c.stats.bestStreak }})</p>
        <p class="text-body-md">Districts: {{ held.length ? held.map((t) => `${t.emoji} ${t.name}`).join(', ') : 'none yet' }}</p>
        <RouterLink to="/clans/map" class="text-label-md text-primary">Open the Social Map →</RouterLink>
      </section>
      <!-- Treasury -->
      <section class="card p-5 space-y-2 cursor-pointer" @click="emit('tab', 'treasury')">
        <p class="text-headline-sm">🏦 Treasury</p>
        <p class="text-headline-md tabular-nums">✦ {{ c.treasury.toLocaleString() }}</p>
        <p v-for="(l, i) in d.ledger.slice(0, 3)" :key="i" class="text-body-sm truncate">{{ l.user?.displayName ?? 'Clan' }} · {{ l.what }} · {{ l.amount > 0 ? '+' : '' }}{{ l.amount.toLocaleString() }}</p>
      </section>
      <!-- Hall of fame -->
      <section class="card p-5 space-y-2">
        <p class="text-headline-sm">🏛️ Hall of Fame</p>
        <p v-if="!d.hallOfFame.length" class="text-body-md text-on-surface-variant">The first Clan MVP is crowned on Monday.</p>
        <div v-for="h in d.hallOfFame" :key="h.week" class="flex items-center gap-2"><Avatar :user="h.user" :size="30" /><span class="flex-1 truncate text-label-lg">🏅 {{ h.user.displayName }}</span><span class="text-body-sm text-on-surface-variant">week {{ h.week }} · {{ h.points.toLocaleString() }}</span></div>
      </section>
      <!-- Trophy room -->
      <section class="card p-5 space-y-2 cursor-pointer" @click="emit('tab', 'achievements')">
        <p class="text-headline-sm">🏆 Trophy room</p>
        <p class="text-headline-md">{{ d.season.trophies.length + c.trophies.length }} trophies · {{ d.world.achievements.length }}/{{ CLAN_ACHIEVEMENTS.length }} achievements</p>
        <p class="text-2xl">{{ d.world.achievements.map((a) => CLAN_ACHIEVEMENTS.find((x) => x.key === a.key)?.emoji).join(' ') || '—' }}</p>
      </section>
      <!-- Stats -->
      <section class="card p-5">
        <p class="text-headline-sm mb-2">📊 Statistics</p>
        <div class="grid grid-cols-2 gap-2 text-body-md">
          <p>⭐ {{ c.reputation.toLocaleString() }} Reputation</p><p>⚡ {{ c.rep.toLocaleString() }} Clan XP</p>
          <p>👥 {{ c.memberCount }}/{{ c.maxMembers }} members</p><p>📜 {{ c.stats.quests }} quests done</p>
          <p>🚩 {{ c.stats.captured }} captures</p><p>✦ Prestige {{ c.prestige }}</p>
          <p>🏆 Season {{ d.season.number }}: {{ d.season.points.toLocaleString() }}</p><p>📅 Since {{ new Date(c.createdAt).toLocaleDateString() }}</p>
        </div>
      </section>
      <!-- Upcoming -->
      <section class="card p-5 space-y-1.5 text-body-md">
        <p class="text-headline-sm mb-1">📅 Coming up</p>
        <p>🗺️ Siege {{ siege.live ? 'ends' : 'starts' }} in <Countdown :to="siege.live ? siege.endsAt : siege.startsAt" /></p>
        <p>📜 New quests &amp; MVP in <Countdown :to="week.endsAt" /></p>
        <p>🏆 Season {{ season.number }} ends in <Countdown :to="season.endsAt" /></p>
        <p>{{ week.emoji }} {{ week.weekend ? 'Double Clan XP weekend is on!' : `${week.name} this week` }}</p>
      </section>
    </div>

    <!-- Shop -->
    <section class="card p-5 space-y-3">
      <div class="flex items-center gap-2"><p class="text-headline-sm flex-1">🛍️ Clan shop</p><span class="chip h-8">🏦 ✦ {{ c.treasury.toLocaleString() }}</span></div>
      <p class="text-body-sm text-on-surface-variant">Badges show on every member’s profile; banners theme the clan page and HQ. Bought once from the treasury.</p>
      <div class="grid sm:grid-cols-2 gap-2">
        <div v-for="x in CLAN_COSMETICS" :key="x.key" class="flex items-center gap-3 rounded-md bg-surface-container-low p-3">
          <span v-if="x.kind === 'banner'" class="w-12 h-9 rounded-md shrink-0" :style="{ background: x.css }" />
          <span v-else class="clan-badge-chip shrink-0" :class="`cb-${x.key}`">{{ c.emoji }} {{ c.tag }}</span>
          <div class="flex-1 min-w-0"><p class="text-label-lg truncate">{{ x.name }}</p><p class="text-body-sm text-on-surface-variant">{{ owned(x.key) ? (c.equipped[x.kind] === x.key ? 'Equipped' : 'Owned') : locked(x) ? `🔒 ${locked(x)}` : `✦ ${x.cost.toLocaleString()}` }}</p></div>
          <button v-if="owned(x.key) && can('settings')" class="btn-ghost h-8 px-3 text-label-sm" @click="equip(x)">{{ c.equipped[x.kind] === x.key ? 'Unequip' : 'Equip' }}</button>
          <button v-else-if="!owned(x.key) && can('treasury')" class="btn-secondary h-8 px-3 text-label-sm" :disabled="!!locked(x) || c.treasury < x.cost" @click="buy(x)">Buy</button>
        </div>
      </div>
    </section>

    <!-- Alliance -->
    <section class="card p-5 space-y-2">
      <p class="text-headline-sm">🤝 Alliance</p>
      <template v-if="al">
        <p class="text-headline-md">{{ al.emoji }} {{ al.name }} <span class="text-body-sm text-on-surface-variant">· ⭐ {{ al.reputation.toLocaleString() }} combined Reputation</span></p>
        <div class="flex flex-wrap gap-2"><RouterLink v-for="x in al.clans" :key="x.id" :to="`/clans/${x.id}`" class="chip h-9">{{ x.emoji }} {{ x.name }} [{{ x.tag }}]<span v-if="x.id === al.leaderClanId"> 👑</span></RouterLink></div>
        <div v-if="founder" class="flex gap-2 flex-wrap">
          <button v-if="al.leaderClanId === c.id && al.clans.length + al.invites.length < 3" class="btn-secondary h-9" @click="inviteAlly">Invite a clan</button>
          <button class="btn-ghost h-9 text-error" @click="leaveAlliance">Leave alliance</button>
        </div>
      </template>
      <template v-else>
        <p class="text-body-md text-on-surface-variant">Up to three clans can ally for big server events. Allies can’t declare war on each other. Unlocks at clan level 5.</p>
        <div v-for="inv in d.allianceInvites" :key="inv.id" class="flex items-center gap-2 rounded-md bg-surface-container-low p-2">
          <span class="flex-1">{{ inv.emoji }} <b>{{ inv.name }}</b> invited your clan</span>
          <template v-if="founder"><button class="btn-primary h-8 px-3 text-label-sm" @click="act(api.answerAlliance(inv.id, c.id, true), '🤝 Joined the alliance')">Join</button><button class="btn-ghost h-8 px-3 text-label-sm" @click="act(api.answerAlliance(inv.id, c.id, false), 'Declined')">Decline</button></template>
        </div>
        <button v-if="founder && (c.level >= 5 || c.prestige)" class="btn-secondary h-9" @click="createAlliance">Found an alliance</button>
      </template>
    </section>
  </div>
</template>

<style scoped>
.hq-sky { background: linear-gradient(180deg, #1b1036, #5b21b6 70%, #ff9900); }
.hq-3 .hq-sky { background: linear-gradient(180deg, #0f172a, #7c3aed 60%, #ff5e00); }
.hq-4 .hq-sky { background: linear-gradient(180deg, #0b1026, #a21caf 55%, #fcd34d); }
.hq-5 .hq-sky { background: radial-gradient(circle at 50% 20%, #fcd34d55, transparent 40%), linear-gradient(180deg, #020617, #312e81 55%, #a855f7); }
.hq-ground { background: linear-gradient(180deg, #1f2937, #0b0716); clip-path: polygon(0 30%, 20% 10%, 45% 25%, 70% 5%, 100% 22%, 100% 100%, 0 100%); }
.hq-5 .hq-ground { background: linear-gradient(180deg, #e9d5ff55, transparent); clip-path: ellipse(40% 30% at 50% 60%); }
.hq-building { line-height: 1; filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.45)); animation: hq-bob 5s ease-in-out infinite; }
.hq-5 .hq-building { animation-duration: 3.5s; }
.hq-flag { animation: hq-flick 1.6s ease-in-out infinite; }
@keyframes hq-bob { 50% { transform: translateY(-6px); } }
@keyframes hq-flick { 50% { transform: scale(1.12) rotate(-4deg); } }
@media (prefers-reduced-motion: reduce) { .hq-building, .hq-flag { animation: none; } }
</style>
