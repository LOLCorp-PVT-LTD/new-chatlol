<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CLAN_ACHIEVEMENTS, CLAN_CUSTOM_ROLES, CLAN_JOIN_POLICIES, CLAN_LEVELS, CLAN_PERMS, CLAN_RANKS, CLAN_WAR, clanRank, type ClanPerm, type ClanPolicy, type ClanRank, HQ_BUILDINGS, HQ_LEVELS, TERRITORIES, clanEventFor, hqLevel, siegeFor, clanSeasonFor, CLAN_WAR_MODES, CLAN_PRESTIGE, WAR_HOURS, prestigeStars, clanCosmetic, type HqKey, type WarModeKey } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confirmDialog, promptDialog } from '../lib/dialog';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import Countdown from '../components/Countdown.vue';
import ScrollRow from '../components/ScrollRow.vue';
import ClanWarCard from '../components/ClanWarCard.vue';
import ClanHQ from '../components/ClanHQ.vue';

/** One clan: level and perks, members and roles, join requests, treasury, wars, and settings for its leader. */
const route = useRoute();
const router = useRouter();
const s = useSession();
const d = ref<Awaited<ReturnType<typeof api.clan>> | null>(null);
const load = async () => (d.value = await api.clan(route.params.id as string));
onMounted(load);
watch(() => route.params.id, (id) => id && load());

const c = computed(() => d.value?.clan);
const can = (p: ClanPerm) => !!d.value?.myPerms.includes(p);
const officer = computed(() => can('recruit'));
const leader = computed(() => !!d.value?.myRole && clanRank(d.value.myRole).key === 'founder');
const rankOf = (role: string) => clanRank(role, c.value?.customRoles ?? []);
const myRank = computed(() => (d.value?.myRole ? rankOf(d.value.myRole).rank : -1));
/** Every rank (built-in and custom), highest first. */
const allRanks = computed<ClanRank[]>(() => [...CLAN_RANKS, ...(c.value?.customRoles ?? [])].sort((a, b) => b.rank - a.rank));
const members = computed(() => [...(d.value?.members ?? [])].sort((a, b) => rankOf(b.role).rank - rankOf(a.role).rank || b.rep - a.rep));
/** Ranks I can give someone (below mine; the Founder can also hand over the clan). */
const assignable = computed(() => allRanks.value.filter((r) => r.rank < myRank.value || (leader.value && r.key === 'founder')));
const canManage = (role: string) => rankOf(role).rank < myRank.value;
async function setRole(userId: string, role: string) {
  if (role === 'founder' && !(await confirmDialog({ title: 'Hand over the clan?', body: 'They become Founder and you become a Commander.', danger: true }))) return void load();
  await run(api.clanRole(c.value!.id, userId, role), 'Rank updated');
}
const policyLabel = (p: ClanPolicy) => CLAN_JOIN_POLICIES.find((x) => x.key === p)?.label.split(' —')[0] ?? p;
const pct = computed(() => {
  const cl = c.value;
  if (!cl?.nextLevel) return 100;
  const cur = CLAN_LEVELS.find((l) => l.level === cl.level)!.rep;
  return Math.min(100, ((cl.rep - cur) / (cl.nextLevel.rep - cur)) * 100);
});
const event = clanEventFor();

async function run(p: Promise<unknown>, ok?: string) {
  try { await p; if (ok) s.toast({ kind: 'info', title: ok }); await load(); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function join() {
  let message: string | undefined;
  if (c.value!.policy === 'application' && !d.value?.myRequest?.invited) {
    const m = await promptDialog({ title: `Apply to ${c.value!.name}`, body: 'Tell the officers why you want to join.', placeholder: 'A few words about you…', confirmText: 'Send application', required: true });
    if (m == null) return;
    message = m;
  }
  try {
    const r = await api.joinClan(c.value!.id, message);
    s.toast({ kind: 'reward', title: r.joined ? `🏰 Welcome to ${c.value!.name}! You start as a Recruit.` : 'Application sent — an officer will review it' });
    await load();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function leave() {
  if (await confirmDialog({ title: `Leave ${c.value!.name}?`, body: leader.value ? 'Leadership passes to your top officer.' : undefined, danger: true })) await run(api.leaveClan(c.value!.id), 'You left the clan');
}
async function disband() {
  if (await confirmDialog({ title: `Disband ${c.value!.name}?`, body: 'Everyone is removed and the treasury is lost. This can’t be undone.', danger: true })) {
    try { await api.disbandClan(c.value!.id); void router.push('/clans'); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
  }
}
async function donate() {
  const v = await promptDialog({ title: 'Donate to the treasury', body: 'Sparks in the treasury fund Clan War stakes.', placeholder: 'Sparks (min 10)', confirmText: 'Donate' });
  const n = Math.floor(Number(v));
  if (n >= 10) await run(api.clanDonate(c.value!.id, n), `✦ ${n.toLocaleString()} donated`);
}
async function invite() {
  const h = await promptDialog({ title: 'Invite someone', placeholder: '@handle', confirmText: 'Invite' });
  if (!h) return;
  try {
    const u = (await api.user(h.replace(/^@/, '').trim())).user;
    await api.clanInvite(c.value!.id, u.id);
    s.toast({ kind: 'info', title: `Invited @${u.handle}` });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function openLounge() {
  try { const r = await api.clanLounge(c.value!.id); void router.push(`/lounges/${r.loungeId}`); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}

// Settings (leader)
const editing = ref(false);
const e = ref({ name: '', emoji: '', description: '', policy: 'open' as ClanPolicy, color: '', minLevel: 0, minAgeDays: 0, minVibe: 0 });
function startEdit() {
  const cl = c.value!;
  e.value = { name: cl.name, emoji: cl.emoji, description: cl.description, policy: cl.policy, color: cl.color ?? '#7c3aed', ...cl.requirements };
  editing.value = true;
}
async function saveEdit() {
  const body: Parameters<typeof api.updateClan>[1] = { name: e.value.name, emoji: e.value.emoji, description: e.value.description, policy: e.value.policy, minLevel: Math.max(0, Math.floor(e.value.minLevel || 0)), minAgeDays: Math.max(0, Math.floor(e.value.minAgeDays || 0)), minVibe: Math.min(5, Math.max(0, Number(e.value.minVibe) || 0)) };
  if (d.value?.perks.banner) body.color = e.value.color;
  await run(api.updateClan(c.value!.id, body), 'Saved');
  editing.value = false;
}

// Custom roles (Founder, clan level 5+)
const SLOTS = [{ v: 3.5, label: 'Between Officer and Commander' }, { v: 2.5, label: 'Between Veteran and Officer' }, { v: 1.5, label: 'Between Member and Veteran' }, { v: 0.5, label: 'Between Recruit and Member' }];
const rolesOpen = ref(false);
const roles = ref<{ key?: string; name: string; emoji: string; rank: number; perms: ClanPerm[] }[]>([]);
function editRoles() {
  roles.value = (c.value?.customRoles ?? []).map((r) => ({ ...r, perms: [...r.perms] }));
  rolesOpen.value = true;
}
async function saveRoles() {
  await run(api.updateClanRoles(c.value!.id, roles.value), 'Roles saved');
  rolesOpen.value = false;
}

// Contributors
const period = ref<'week' | 'season' | 'lifetime'>('week');
const season = clanSeasonFor();

// Tabs
const TABS = [
  { key: 'overview', label: '🏰 Overview' },
  { key: 'hq', label: '🏯 HQ' },
  { key: 'quests', label: '📜 Quests' },
  { key: 'upgrades', label: '🛠️ Upgrades' },
  { key: 'achievements', label: '🏅 Achievements' },
  { key: 'treasury', label: '🏦 Treasury' },
] as const;
const tab = ref<(typeof TABS)[number]['key']>('overview');
const siege = siegeFor();
const held = computed(() => TERRITORIES.filter((t) => d.value?.world.territories.includes(t.key)));
const target = computed(() => TERRITORIES.find((t) => t.key === d.value?.world.siegeTarget) ?? null);
const earned = computed(() => new Map((d.value?.world.achievements ?? []).map((a) => [a.key, a.at])));
const lvlOf = (k: HqKey) => hqLevel(d.value?.world.hq, k);
async function build(k: HqKey, name: string) {
  const next = HQ_LEVELS[lvlOf(k)];
  if (next && (await confirmDialog({ title: `Upgrade ${name} to level ${next.level}?`, body: `Costs ✦ ${next.cost.toLocaleString()} from the treasury.` })))
    await run(api.buildClanHq(c.value!.id, k), `✨ ${name} upgraded`);
}

// War
const warring = ref(false);
const opponents = ref<Awaited<ReturnType<typeof api.clans>>['clans']>([]);
const war = ref({ opponentId: '', stake: 0, mode: 'total' as WarModeKey, hours: 48 });
async function openWar() {
  opponents.value = (await api.clans()).clans.filter((x) => x.id !== c.value!.id && x.level >= CLAN_WAR.minLevel);
  warring.value = true;
}
const myClanId = computed(() => s.user?.clan?.id ?? null);
async function prestige() {
  if (await confirmDialog({ title: `Prestige ${c.value!.name}?`, body: `Clan XP and level go back to the start and you climb again. You keep Reputation, upgrades, achievements, trophies and every perk, and gain a Prestige star and ${CLAN_PRESTIGE.reputation} Reputation.`, confirmText: '✦ Prestige' }))
    await run(api.prestigeClan(c.value!.id), '✦ Prestige reached!');
}
async function nameRival() {
  if (!myClanId.value || !c.value) return;
  if (await confirmDialog({ title: `Name ${c.value.name} your rival?`, body: 'Your head-to-head record shows on both clan pages.' })) await run(api.setClanRival(myClanId.value, c.value.id), `😤 ${c.value.name} is now your rival`);
}
async function declare() {
  await run(api.declareWar(c.value!.id, war.value.opponentId, war.value.stake, war.value.mode, war.value.hours), '⚔️ War declared — waiting for them to accept');
  warring.value = false;
}
</script>

<template>
  <div v-if="d && c" class="max-w-[1000px] mx-auto space-y-5">
    <section class="rounded-lg p-6 text-white shadow-float relative overflow-hidden" :style="{ background: clanCosmetic(c.equipped.banner)?.css ?? (c.color ? `linear-gradient(135deg, ${c.color}, #1b1036)` : 'linear-gradient(135deg,#5b21b6,#1b1036 60%,#ff5e00)') }">
      <div class="absolute -right-4 -bottom-8 text-[140px] opacity-25 select-none">{{ c.emoji }}</div>
      <p class="label !text-white/80">Clan · level {{ c.level }}</p>
      <h1 class="text-headline-xl">{{ c.emoji }} {{ c.name }} <span class="opacity-80">[{{ c.tag }}]</span></h1>
      <p v-if="c.prestige" class="text-headline-sm tracking-widest text-[#fcd34d]" :title="`Prestige ${c.prestige}`">Prestige {{ ['I', 'II', 'III', 'IV', 'V'][c.prestige - 1] }} {{ prestigeStars(c.prestige) }}</p>
      <p v-if="c.description" class="text-body-md opacity-90 max-w-xl mt-1 whitespace-pre-line">{{ c.description }}</p>
      <div class="flex flex-wrap gap-2 mt-3">
        <span class="chip h-8 bg-white/20 text-white border-white/30">⭐ {{ c.reputation.toLocaleString() }} Reputation</span>
        <span class="chip h-8 bg-white/20 text-white border-white/30">🏆 Season {{ d.season.number }}: {{ d.season.points.toLocaleString() }} pts<template v-if="d.season.rank"> · #{{ d.season.rank }}</template></span>
        <span v-for="t in held" :key="t.key" class="chip h-8 bg-white/20 text-white border-white/30" :title="t.label">{{ t.emoji }} {{ t.name }}</span>
        <span class="chip h-8 bg-white/20 text-white border-white/30">{{ policyLabel(c.policy) }}</span>
        <span v-if="c.requirements.minLevel" class="chip h-8 bg-white/20 text-white border-white/30">Level {{ c.requirements.minLevel }}+</span>
        <span v-if="c.requirements.minAgeDays" class="chip h-8 bg-white/20 text-white border-white/30">Account {{ c.requirements.minAgeDays }}+ days</span>
        <span v-if="c.requirements.minVibe" class="chip h-8 bg-white/20 text-white border-white/30">Vibe {{ c.requirements.minVibe }}+</span>
      </div>
      <p class="text-body-sm opacity-90 mt-2">{{ c.memberCount }}/{{ c.maxMembers }} members · {{ c.wins }} wars won · {{ c.losses }} lost · 🏦 {{ c.treasury.toLocaleString() }} ✦ treasury<template v-if="c.trophies.length"> · 🏆 {{ c.trophies.length }}</template></p>
      <div class="mt-3 max-w-md">
        <div class="h-2 rounded-full bg-white/25 overflow-hidden"><div class="h-full bg-white" :style="{ width: `${pct}%` }" /></div>
        <p class="text-body-sm opacity-90 mt-1">{{ c.rep.toLocaleString() }} Clan XP<template v-if="c.nextLevel"> · {{ (c.nextLevel.rep - c.rep).toLocaleString() }} to level {{ c.nextLevel.level }}: {{ c.nextLevel.perk }}</template></p>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <template v-if="!d.myRole && s.user">
          <button v-if="d.myRequest && !d.myRequest.invited" class="btn bg-white/25 text-white" disabled>Application sent</button>
          <button v-else-if="d.myRequest?.invited || c.policy === 'open' || c.policy === 'application'" class="btn bg-white text-[#3b0764]" @click="join">{{ c.policy === 'open' || d.myRequest?.invited ? 'Join clan' : 'Apply to join' }}</button>
          <span v-else class="chip h-10 bg-white/20 text-white border-white/30">{{ c.policy === 'closed' ? 'Not recruiting' : 'Invite only' }}</span>
        </template>
        <template v-if="d.myRole">
          <button class="btn bg-white text-[#3b0764]" @click="donate">🏦 Donate Sparks</button>
          <RouterLink v-if="c.loungeId" :to="`/lounges/${c.loungeId}`" class="btn bg-white/20 text-white">🛋️ Clan lounge</RouterLink>
          <button v-else-if="can('settings') && d.perks.lounge" class="btn bg-white/20 text-white" @click="openLounge">🛋️ Open the clan lounge</button>
          <button v-if="can('invite')" class="btn bg-white/20 text-white" @click="invite">➕ Invite</button>
          <button v-if="can('wars') && d.perks.wars" class="btn bg-white/20 text-white" @click="openWar">⚔️ Declare war</button>
          <button v-if="can('settings')" class="btn bg-white/20 text-white" @click="startEdit">⚙️ Settings</button>
          <button v-if="leader && c.level >= CLAN_PRESTIGE.minLevel && c.prestige < CLAN_PRESTIGE.max" class="btn bg-[#fcd34d] text-[#3b0764]" @click="prestige">✦ Prestige</button>
          <button v-if="leader && (c.level >= CLAN_CUSTOM_ROLES.minLevel || c.prestige)" class="btn bg-white/20 text-white" @click="editRoles">🎭 Roles</button>
          <button class="btn bg-white/10 text-white" @click="leave">Leave</button>
        </template>
      </div>
    </section>

    <ScrollRow>
      <button v-for="t in TABS" :key="t.key" class="chip h-10 shrink-0" :class="{ 'chip-active': tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
    </ScrollRow>

    <ClanHQ v-if="tab === 'hq'" :d="d" :can="can" :founder="leader" @reload="load" @tab="(t) => (tab = t)" />

    <!-- Quests -->
    <div v-else-if="tab === 'quests'" class="space-y-5">
      <section class="card p-5 space-y-3">
        <div class="flex items-center gap-2"><p class="text-headline-sm flex-1">📜 This week’s Clan Quests · tier {{ d.world.tier }}</p><span class="chip h-8">New quests in <Countdown :to="event.endsAt" /></span></div>
        <p v-if="!d.myRole" class="text-body-md text-on-surface-variant">Join the clan to see its quests.</p>
        <div v-for="o in d.world.objectives" :key="o.key" class="rounded-md bg-surface-container-low p-3" :class="{ 'ring-2 ring-green-500/50': o.done }">
          <div class="flex items-center gap-3"><span class="text-2xl">{{ o.emoji }}</span>
            <div class="flex-1 min-w-0"><p class="text-label-lg">{{ o.name }} <span v-if="o.done">✅</span></p><p class="text-body-sm text-on-surface-variant">{{ o.desc }}</p></div>
            <span class="tabular-nums text-label-lg">{{ o.progress.toLocaleString() }}/{{ o.target.toLocaleString() }}</span></div>
          <div class="h-2 rounded-full bg-surface-container-high overflow-hidden mt-2"><div class="h-full bg-primary" :style="{ width: `${Math.min(100, (o.progress / o.target) * 100)}%` }" /></div>
          <p class="text-body-sm text-on-surface-variant mt-1">Reward: +{{ o.reward.xp }} Clan XP · ✦ {{ o.reward.treasury.toLocaleString() }} to the treasury · ⭐ +{{ o.reward.reputation }} Reputation</p>
        </div>
        <p class="text-body-sm text-on-surface-variant">Quests get harder — and pay more — as your clan levels up.</p>
      </section>
      <section v-if="d.bounties.length" class="card p-5 space-y-2">
        <p class="text-headline-sm">🎯 Today’s bounties</p>
        <div v-for="b in d.bounties" :key="b.key" class="flex items-center gap-3 rounded-md bg-surface-container-low p-3" :class="{ 'ring-2 ring-green-500/50': b.done }">
          <span class="text-2xl">{{ b.emoji }}</span><p class="flex-1 text-label-lg">{{ b.label }} <span v-if="b.done">✅</span></p>
          <span class="tabular-nums text-label-md">{{ b.progress.toLocaleString() }}/{{ b.target.toLocaleString() }}</span>
        </div>
        <p class="text-body-sm text-on-surface-variant">Each pays ⭐ +25 Reputation, ✦ 5,000 to the treasury and 150 season points. New bounties every day.</p>
      </section>
      <section class="card p-5 space-y-2">
        <div class="flex items-center gap-2"><p class="text-headline-sm flex-1">🗺️ The Siege</p><RouterLink to="/clans/map" class="btn-secondary h-9">Open the Social Map</RouterLink></div>
        <p class="text-body-md">{{ siege.live ? '🔥 Siege live — ends in' : 'Next Siege in' }} <Countdown :to="siege.live ? siege.endsAt : siege.startsAt" /> · Saturday 18:00 → Sunday 18:00 UTC</p>
        <p class="text-body-md">{{ target ? `Your clan fights for ${target.emoji} ${target.name}` : 'Your clan hasn’t picked a territory yet.' }}<template v-if="can('siege')"> Pick the target on the map.</template></p>
      </section>
    </div>

    <!-- Upgrades -->
    <section v-else-if="tab === 'upgrades'" class="card p-5 space-y-3">
      <div class="flex items-center gap-2"><p class="text-headline-sm flex-1">🛠️ Upgrades</p><span class="chip h-8">🏦 ✦ {{ c.treasury.toLocaleString() }}</span></div>
      <p class="text-body-sm text-on-surface-variant">Spend the treasury to shape your clan: which trees you grow decides what kind of clan you are.</p>
      <div class="grid sm:grid-cols-2 gap-3">
        <div v-for="b in HQ_BUILDINGS" :key="b.key" class="rounded-md bg-surface-container-low p-4 space-y-2">
          <div class="flex items-center gap-2"><span class="text-2xl">{{ b.emoji }}</span><p class="text-label-lg flex-1">{{ b.name }}</p>
            <span class="flex gap-1"><span v-for="i in HQ_LEVELS.length" :key="i" class="w-3 h-3 rounded-full" :class="i <= lvlOf(b.key) ? 'bg-primary' : 'bg-surface-container-high'" /></span></div>
          <p class="text-body-sm text-on-surface-variant">{{ b.desc }} per level</p>
          <template v-if="HQ_LEVELS[lvlOf(b.key)]">
            <button v-if="can('treasury')" class="btn-secondary h-9 w-full" :disabled="c.level < HQ_LEVELS[lvlOf(b.key)].clanLevel || c.treasury < HQ_LEVELS[lvlOf(b.key)].cost" @click="build(b.key, b.name)">
              Level {{ lvlOf(b.key) + 1 }} · ✦ {{ HQ_LEVELS[lvlOf(b.key)].cost.toLocaleString() }}<template v-if="c.level < HQ_LEVELS[lvlOf(b.key)].clanLevel"> · 🔒 clan Lv {{ HQ_LEVELS[lvlOf(b.key)].clanLevel }}</template>
            </button>
            <p v-else class="text-body-sm text-on-surface-variant">Next: ✦ {{ HQ_LEVELS[lvlOf(b.key)].cost.toLocaleString() }} (clan Lv {{ HQ_LEVELS[lvlOf(b.key)].clanLevel }})</p>
          </template>
          <p v-else class="text-label-md text-primary">✨ Fully upgraded</p>
        </div>
      </div>
    </section>

    <!-- Achievements -->
    <section v-else-if="tab === 'achievements'" class="card p-5 space-y-3">
      <div v-if="d.season.trophies.length || c.trophies.length" class="space-y-1">
        <p class="text-headline-sm">🏆 Trophy room</p>
        <div class="flex flex-wrap gap-2">
          <span v-for="t in d.season.trophies" :key="`s${t.season}`" class="chip h-9" :title="`${t.points.toLocaleString()} season points`">🏆 Season {{ t.season }} · #{{ t.place }} {{ t.title }}</span>
          <span v-for="t in c.trophies" :key="`w${t.week}`" class="chip h-9">{{ ['🥇', '🥈', '🥉'][t.place - 1] }} Weekly event · week {{ t.week }}</span>
        </div>
      </div>
      <p class="text-headline-sm">🏅 Achievements · {{ earned.size }}/{{ CLAN_ACHIEVEMENTS.length }}</p>
      <div class="grid sm:grid-cols-2 gap-2">
        <div v-for="a in CLAN_ACHIEVEMENTS" :key="a.key" class="flex items-center gap-3 rounded-md p-3" :class="earned.has(a.key) ? (a.rare ? 'bg-[linear-gradient(135deg,rgb(252_211_77/.35),rgb(255_94_0/.2))]' : 'bg-surface-container-low') : 'bg-surface-container-low opacity-50'">
          <span class="text-3xl" :class="{ grayscale: !earned.has(a.key) }">{{ a.emoji }}</span>
          <div class="flex-1 min-w-0"><p class="text-label-lg">{{ a.name }} <span v-if="a.rare" class="text-label-sm text-primary">RARE</span></p><p class="text-body-sm text-on-surface-variant">{{ a.desc }}<template v-if="a.reputation"> · ⭐ +{{ a.reputation }}</template></p>
            <p v-if="earned.get(a.key)" class="text-label-sm text-on-surface-variant">Unlocked {{ new Date(earned.get(a.key)!).toLocaleDateString() }}</p></div>
        </div>
      </div>
    </section>

    <!-- Treasury -->
    <section v-else-if="tab === 'treasury'" class="card p-5 space-y-2">
      <div class="flex items-center gap-2"><p class="text-headline-sm flex-1">🏦 Treasury · ✦ {{ c.treasury.toLocaleString() }}</p><button v-if="d.myRole" class="btn-primary h-9" @click="donate">Deposit</button></div>
      <p v-if="!d.myRole" class="text-body-md text-on-surface-variant">Only members can see the treasury ledger.</p>
      <p v-else-if="!d.ledger.length" class="text-body-md text-on-surface-variant">No activity yet.</p>
      <div v-for="(l, i) in d.ledger" :key="i" class="flex items-center gap-3 py-1.5 border-b border-sandstone last:border-0 text-body-md">
        <span class="flex-1 min-w-0 truncate"><b>{{ l.user?.displayName ?? 'The clan' }}</b> {{ l.amount > 0 ? 'deposited' : '' }} {{ l.what === 'Deposit' ? '' : l.what }}</span>
        <span class="tabular-nums font-bold" :class="l.amount > 0 ? 'text-green-600' : 'text-error'">{{ l.amount > 0 ? '+' : '' }}{{ l.amount.toLocaleString() }} ✦</span>
        <span class="text-body-sm text-on-surface-variant w-20 text-right">{{ new Date(l.at).toLocaleDateString() }}</span>
      </div>
    </section>

    <div v-else class="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div class="space-y-5 min-w-0">
        <!-- Wars -->
        <section v-if="d.wars.length" class="card p-5 space-y-2">
          <p class="text-headline-sm">⚔️ Wars</p>
          <div v-for="w in d.wars" :key="w.id" class="space-y-2">
            <ClanWarCard :war="w" :me="c.id" />
            <div v-if="w.incoming && can('wars')" class="flex justify-center gap-2">
              <button class="btn-primary h-9" @click="run(api.answerWar(w.id, 'accept'), '⚔️ War on!')">Accept</button>
              <button class="btn-ghost h-9" @click="run(api.answerWar(w.id, 'decline'))">Decline</button>
            </div>
          </div>
        </section>

        <!-- MVP & contributors -->
        <section class="card p-5 space-y-3">
          <div v-if="d.mvp" class="rounded-md p-4 text-white bg-[linear-gradient(135deg,#7c3aed,#ff5e00)] flex items-center gap-4">
            <Avatar :user="d.mvp.user" :size="56" class="ring-2 ring-white/70 rounded-full" />
            <div class="min-w-0 flex-1">
              <p class="label !text-white/80">🏅 Clan MVP · last week</p>
              <p class="text-headline-sm truncate">{{ d.mvp.user.displayName }}</p>
              <p class="text-body-sm opacity-90">{{ d.mvp.points.toLocaleString() }} Contribution · {{ d.mvp.quests }} quests · {{ d.mvp.wars }} war victories · {{ d.mvp.reputation.toLocaleString() }} Reputation earned</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap"><p class="text-headline-sm flex-1">🔥 Top contributors</p>
            <button v-for="p in (['week', 'season', 'lifetime'] as const)" :key="p" class="chip h-8" :class="{ 'chip-active': period === p }" @click="period = p">{{ p === 'week' ? 'This week' : p === 'season' ? `Season ${season.number}` : 'All time' }}</button></div>
          <p v-if="!d.contributors[period].length" class="text-body-md text-on-surface-variant">Nobody yet — earn Clan XP, finish quests or deposit to the treasury to top this board.</p>
          <div v-for="(x, i) in d.contributors[period]" :key="x.user.id" class="flex items-center gap-3 py-1.5">
            <span class="w-6 text-center font-bold">{{ ['🥇', '🥈', '🥉'][i] ?? i + 1 }}</span>
            <Avatar :user="x.user" :size="32" />
            <div class="flex-1 min-w-0"><UserName :user="x.user" /><p class="text-body-sm text-on-surface-variant">{{ x.xp.toLocaleString() }} XP · {{ x.quests }} quests · {{ x.wars }} wars<template v-if="x.recruits"> · {{ x.recruits }} recruits</template><template v-if="x.donated"> · ✦ {{ x.donated.toLocaleString() }} given</template></p></div>
            <span class="tabular-nums text-label-lg">{{ x.points.toLocaleString() }}</span>
          </div>
        </section>

        <!-- Members -->
        <section class="card p-5">
          <p class="text-headline-sm mb-2">Members</p>
          <div v-for="m in members" :key="m.user.id" class="flex items-center gap-3 py-2 border-b border-sandstone last:border-0">
            <Avatar :user="m.user" :size="38" />
            <div class="flex-1 min-w-0"><UserName :user="m.user" /><p class="text-body-sm text-on-surface-variant">{{ rankOf(m.role).emoji }} {{ rankOf(m.role).name }} · {{ m.contribution.toLocaleString() }} contribution<template v-if="m.mvpCount"> · 🏅 MVP ×{{ m.mvpCount }}</template></p></div>
            <select v-if="can('promote') && m.user.id !== s.user?.id && canManage(m.role)" class="input h-8 w-auto text-label-sm py-0" :value="rankOf(m.role).key" :aria-label="`Rank for ${m.user.displayName}`" @change="setRole(m.user.id, ($event.target as HTMLSelectElement).value)">
              <option v-for="r in assignable" :key="r.key" :value="r.key">{{ r.emoji }} {{ r.name }}</option>
              <option v-if="!assignable.some((r) => r.key === rankOf(m.role).key)" :value="rankOf(m.role).key" disabled>{{ rankOf(m.role).name }}</option>
            </select>
            <button v-if="can('kick') && m.user.id !== s.user?.id && canManage(m.role)" class="btn-ghost h-8 px-3 text-label-sm text-error" @click="run(api.clanKick(c.id, m.user.id), 'Removed')">Remove</button>
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        <section v-if="officer && d.requests.length" class="card p-5 space-y-2">
          <p class="text-headline-sm">Applications</p>
          <div v-for="r in d.requests" :key="r.user.id" class="rounded-md bg-surface-container-low p-2 space-y-1">
            <div class="flex items-center gap-2">
              <Avatar :user="r.user" :size="32" /><UserName :user="r.user" class="flex-1 min-w-0" />
              <button class="btn-primary h-8 px-3 text-label-sm" @click="run(api.clanRequest(c.id, r.user.id, 'accept'), 'Accepted')">✓</button>
              <button class="btn-ghost h-8 px-3 text-label-sm" @click="run(api.clanRequest(c.id, r.user.id, 'decline'))">✕</button>
            </div>
            <p v-if="r.message" class="text-body-sm italic">“{{ r.message }}”</p>
          </div>
        </section>
        <section v-if="d.rivalry.rival || d.rivalry.foes.length || (myClanId && myClanId !== c.id)" class="card p-5 space-y-2">
          <p class="text-headline-sm">😤 Rivalry</p>
          <div v-if="d.rivalry.rival" class="rounded-md p-3 text-center text-white bg-[linear-gradient(135deg,#991b1b,#1b1036)]">
            <p class="text-label-lg">{{ c.emoji }} {{ c.tag }} <span class="opacity-70">vs</span> <RouterLink :to="`/clans/${d.rivalry.rival.clan.id}`">{{ d.rivalry.rival.clan.emoji }} {{ d.rivalry.rival.clan.tag }}</RouterLink></p>
            <p class="text-headline-sm tabular-nums">{{ d.rivalry.rival.wins }} – {{ d.rivalry.rival.losses }}<span v-if="d.rivalry.rival.draws" class="text-body-sm"> ({{ d.rivalry.rival.draws }} draws)</span></p>
            <p class="text-label-sm opacity-80">Lifetime rivalry</p>
          </div>
          <p v-if="d.rivalry.foes.length" class="label">Frequent foes</p>
          <RouterLink v-for="f in d.rivalry.foes" :key="f.clan.id" :to="`/clans/${f.clan.id}`" class="flex text-body-md"><span class="flex-1 truncate">{{ f.clan.emoji }} {{ f.clan.name }}</span><span class="tabular-nums">{{ f.wins }}W {{ f.losses }}L</span></RouterLink>
          <button v-if="myClanId && myClanId !== c.id" class="btn-secondary w-full h-9" @click="nameRival">😤 Name as our rival</button>
          <button v-if="d.rivalry.rival && can('wars')" class="btn-ghost w-full h-9" @click="run(api.setClanRival(c.id, null), 'Rivalry ended')">End rivalry</button>
        </section>
        <section class="card p-5 space-y-1.5">
          <p class="text-headline-sm mb-1">Perks</p>
          <p v-for="l in CLAN_LEVELS" :key="l.level" class="text-body-sm flex gap-2" :class="c.level >= l.level ? '' : 'opacity-50'">
            <span>{{ c.level >= l.level ? '✅' : '🔒' }}</span><span><b>Lv {{ l.level }}</b> · {{ l.perk }}</span>
          </p>
        </section>
        <section class="card p-5">
          <p class="text-headline-sm">{{ event.emoji }} {{ event.name }}</p>
          <p class="text-body-sm text-on-surface-variant mt-1">{{ event.desc }}</p>
          <RouterLink to="/clans" class="text-label-md text-primary mt-2 inline-block">See this week’s standings →</RouterLink>
        </section>
        <button v-if="leader" class="btn-ghost w-full text-error" @click="disband">Disband clan</button>
      </aside>
    </div>

    <Modal v-if="editing" title="Clan settings" @close="editing = false">
      <form class="px-6 pb-6 space-y-3" @submit.prevent="saveEdit">
        <div class="flex gap-2"><input v-model="e.emoji" class="input w-16 text-center text-xl px-0" maxlength="8" /><input v-model="e.name" class="input" maxlength="24" /></div>
        <textarea v-model="e.description" class="textarea" rows="3" maxlength="300" />
        <select v-model="e.policy" class="input"><option v-for="p in CLAN_JOIN_POLICIES" :key="p.key" :value="p.key">{{ p.label }}</option></select>
        <p class="label">Requirements (0 = none)</p>
        <div class="grid grid-cols-3 gap-2">
          <label class="text-label-md">Level<input v-model.number="e.minLevel" type="number" min="0" max="100" class="input mt-1" /></label>
          <label class="text-label-md">Account days<input v-model.number="e.minAgeDays" type="number" min="0" max="3650" class="input mt-1" /></label>
          <label class="text-label-md">Vibe (0–5)<input v-model.number="e.minVibe" type="number" min="0" max="5" step="0.5" class="input mt-1" /></label>
        </div>
        <label v-if="d.perks.banner" class="flex items-center gap-3 text-label-lg">Clan colour <input v-model="e.color" type="color" class="w-12 h-9 rounded" /></label>
        <p v-else class="text-body-sm text-on-surface-variant">🔒 Custom colour unlocks at level 5.</p>
        <button class="btn-primary w-full">Save</button>
      </form>
    </Modal>

    <Modal v-if="rolesOpen" title="🎭 Custom roles" @close="rolesOpen = false">
      <form class="px-6 pb-6 space-y-3" @submit.prevent="saveRoles">
        <p class="text-body-sm text-on-surface-variant">Up to {{ CLAN_CUSTOM_ROLES.max }} roles of your own, each placed in the ladder with its own permissions.</p>
        <div v-for="(r, i) in roles" :key="i" class="rounded-md bg-surface-container-low p-3 space-y-2">
          <div class="flex gap-2"><input v-model="r.emoji" class="input w-14 text-center px-0" maxlength="8" required /><input v-model="r.name" class="input" placeholder="Role name" maxlength="20" required minlength="2" />
            <button type="button" class="btn-ghost h-11 px-3 text-error" aria-label="Delete role" @click="roles.splice(i, 1)">✕</button></div>
          <select v-model.number="r.rank" class="input"><option v-for="sl in SLOTS" :key="sl.v" :value="sl.v">{{ sl.label }}</option></select>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            <label v-for="p in CLAN_PERMS" :key="p.key" class="flex items-center gap-1.5 text-body-sm"><input v-model="r.perms" type="checkbox" :value="p.key" /> {{ p.label }}</label>
          </div>
        </div>
        <button v-if="roles.length < CLAN_CUSTOM_ROLES.max" type="button" class="btn-secondary w-full" @click="roles.push({ name: '', emoji: '⭐', rank: 1.5, perms: [] })">+ Add a role</button>
        <button class="btn-primary w-full">Save roles</button>
      </form>
    </Modal>

    <Modal v-if="warring" title="⚔️ Declare war" @close="warring = false">
      <form class="px-6 pb-6 space-y-3" @submit.prevent="declare">
        <p class="text-body-sm text-on-surface-variant">The clan with more War Points wins the pot (both stakes), {{ CLAN_WAR.winRep }} bonus Clan XP and Reputation. Both clans need level {{ CLAN_WAR.minLevel }}+.</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label v-for="m in CLAN_WAR_MODES" :key="m.key" class="rounded-md p-2 cursor-pointer border text-body-sm" :class="war.mode === m.key ? 'border-primary bg-primary/10' : 'border-sandstone'">
            <input v-model="war.mode" type="radio" :value="m.key" class="sr-only" /><b>{{ m.emoji }} {{ m.name }}</b><br /><span class="text-on-surface-variant">{{ m.desc }}</span>
          </label>
        </div>
        <div class="flex gap-2"><button v-for="h in WAR_HOURS" :key="h" type="button" class="chip h-9 flex-1 justify-center" :class="{ 'chip-active': war.hours === h }" @click="war.hours = h">{{ h }}h</button></div>
        <select v-model="war.opponentId" class="input" required>
          <option value="" disabled>Pick a rival clan</option>
          <option v-for="o in opponents" :key="o.id" :value="o.id">{{ o.emoji }} {{ o.name }} [{{ o.tag }}] · Lv {{ o.level }}</option>
        </select>
        <label class="block text-label-lg">Stake from your treasury (✦, 0 = for glory)<input v-model.number="war.stake" type="number" min="0" :max="Math.min(CLAN_WAR.maxStake, c.treasury)" class="input mt-1" /></label>
        <button class="btn-primary w-full" :disabled="!war.opponentId">Declare war</button>
      </form>
    </Modal>
  </div>
</template>
