<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CLAN_LEVELS, CLAN_ROLES, CLAN_WAR, clanEventFor } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confirmDialog, promptDialog } from '../lib/dialog';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import Countdown from '../components/Countdown.vue';

/** One clan: level and perks, members and roles, join requests, treasury, wars, and settings for its leader. */
const route = useRoute();
const router = useRouter();
const s = useSession();
const d = ref<Awaited<ReturnType<typeof api.clan>> | null>(null);
const load = async () => (d.value = await api.clan(route.params.id as string));
onMounted(load);
watch(() => route.params.id, (id) => id && load());

const c = computed(() => d.value?.clan);
const officer = computed(() => d.value?.myRole === 'leader' || d.value?.myRole === 'officer');
const leader = computed(() => d.value?.myRole === 'leader');
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
  try {
    const r = await api.joinClan(c.value!.id);
    s.toast({ kind: 'reward', title: r.joined ? `🏰 Welcome to ${c.value!.name}!` : 'Request sent — an officer will review it' });
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
const e = ref({ name: '', emoji: '', description: '', policy: 'open' as 'open' | 'request' | 'invite', color: '' });
function startEdit() {
  const cl = c.value!;
  e.value = { name: cl.name, emoji: cl.emoji, description: cl.description, policy: cl.policy, color: cl.color ?? '#7c3aed' };
  editing.value = true;
}
async function saveEdit() {
  const body: Parameters<typeof api.updateClan>[1] = { name: e.value.name, emoji: e.value.emoji, description: e.value.description, policy: e.value.policy };
  if (d.value?.perks.banner) body.color = e.value.color;
  await run(api.updateClan(c.value!.id, body), 'Saved');
  editing.value = false;
}

// War
const warring = ref(false);
const opponents = ref<Awaited<ReturnType<typeof api.clans>>['clans']>([]);
const war = ref({ opponentId: '', stake: 0 });
async function openWar() {
  opponents.value = (await api.clans()).clans.filter((x) => x.id !== c.value!.id && x.level >= CLAN_WAR.minLevel);
  warring.value = true;
}
async function declare() {
  await run(api.declareWar(c.value!.id, war.value.opponentId, war.value.stake), '⚔️ War declared — waiting for them to accept');
  warring.value = false;
}
</script>

<template>
  <div v-if="d && c" class="max-w-[1000px] mx-auto space-y-5">
    <section class="rounded-lg p-6 text-white shadow-float relative overflow-hidden" :style="{ background: c.color ? `linear-gradient(135deg, ${c.color}, #1b1036)` : 'linear-gradient(135deg,#5b21b6,#1b1036 60%,#ff5e00)' }">
      <div class="absolute -right-4 -bottom-8 text-[140px] opacity-25 select-none">{{ c.emoji }}</div>
      <p class="label !text-white/80">Clan · level {{ c.level }}</p>
      <h1 class="text-headline-xl">{{ c.emoji }} {{ c.name }} <span class="opacity-80">[{{ c.tag }}]</span></h1>
      <p v-if="c.description" class="text-body-md opacity-90 max-w-xl mt-1 whitespace-pre-line">{{ c.description }}</p>
      <p class="text-body-sm opacity-90 mt-2">{{ c.memberCount }}/{{ c.maxMembers }} members · {{ c.wins }} wars won · {{ c.losses }} lost · 🏦 {{ c.treasury.toLocaleString() }} ✦ treasury<template v-if="c.trophies.length"> · 🏆 {{ c.trophies.length }}</template></p>
      <div class="mt-3 max-w-md">
        <div class="h-2 rounded-full bg-white/25 overflow-hidden"><div class="h-full bg-white" :style="{ width: `${pct}%` }" /></div>
        <p class="text-body-sm opacity-90 mt-1">{{ c.rep.toLocaleString() }} Rep<template v-if="c.nextLevel"> · {{ (c.nextLevel.rep - c.rep).toLocaleString() }} to level {{ c.nextLevel.level }}: {{ c.nextLevel.perk }}</template></p>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <template v-if="!d.myRole && s.user">
          <button v-if="d.myRequest && !d.myRequest.invited" class="btn bg-white/25 text-white" disabled>Request sent</button>
          <button v-else-if="c.policy !== 'invite' || d.myRequest?.invited" class="btn bg-white text-[#3b0764]" @click="join">{{ c.policy === 'open' || d.myRequest?.invited ? 'Join clan' : 'Ask to join' }}</button>
          <span v-else class="chip h-10 bg-white/20 text-white border-white/30">Invite only</span>
        </template>
        <template v-if="d.myRole">
          <button class="btn bg-white text-[#3b0764]" @click="donate">🏦 Donate Sparks</button>
          <RouterLink v-if="c.loungeId" :to="`/lounges/${c.loungeId}`" class="btn bg-white/20 text-white">🛋️ Clan lounge</RouterLink>
          <button v-else-if="leader && d.perks.lounge" class="btn bg-white/20 text-white" @click="openLounge">🛋️ Open the clan lounge</button>
          <button v-if="officer" class="btn bg-white/20 text-white" @click="invite">➕ Invite</button>
          <button v-if="officer && d.perks.wars" class="btn bg-white/20 text-white" @click="openWar">⚔️ Declare war</button>
          <button v-if="leader" class="btn bg-white/20 text-white" @click="startEdit">⚙️ Settings</button>
          <button class="btn bg-white/10 text-white" @click="leave">Leave</button>
        </template>
      </div>
    </section>

    <div class="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div class="space-y-5 min-w-0">
        <!-- Wars -->
        <section v-if="d.wars.length" class="card p-5 space-y-2">
          <p class="text-headline-sm">⚔️ Wars</p>
          <div v-for="w in d.wars" :key="w.id" class="rounded-md bg-surface-container-low px-3 py-2">
            <div class="flex items-center gap-3">
              <span class="flex-1 text-right truncate text-label-lg">{{ w.a.emoji }} {{ w.a.name }}</span>
              <span class="tabular-nums font-bold">{{ w.a.score.toLocaleString() }} – {{ w.b.score.toLocaleString() }}</span>
              <span class="flex-1 truncate text-label-lg">{{ w.b.emoji }} {{ w.b.name }}</span>
            </div>
            <p class="text-body-sm text-on-surface-variant text-center mt-0.5">
              <template v-if="w.status === 'active'">Live · ends in <Countdown :to="w.endsAt!" /></template>
              <template v-else-if="w.status === 'pending'">{{ w.incoming ? 'They challenged you' : 'Waiting for them to accept' }}</template>
              <template v-else-if="w.status === 'finished'">{{ w.winnerId ? (w.winnerId === c.id ? '🏆 Victory' : 'Defeat') : 'Draw' }}</template>
              <template v-else>{{ w.status }}</template>
              <template v-if="w.stake"> · stake ✦ {{ w.stake.toLocaleString() }} each</template>
            </p>
            <div v-if="w.incoming && officer" class="flex justify-center gap-2 mt-2">
              <button class="btn-primary h-9" @click="run(api.answerWar(w.id, 'accept'), '⚔️ War on!')">Accept</button>
              <button class="btn-ghost h-9" @click="run(api.answerWar(w.id, 'decline'))">Decline</button>
            </div>
          </div>
        </section>

        <!-- Members -->
        <section class="card p-5">
          <p class="text-headline-sm mb-2">Members</p>
          <div v-for="m in d.members" :key="m.user.id" class="flex items-center gap-3 py-2 border-b border-sandstone last:border-0">
            <Avatar :user="m.user" :size="38" />
            <div class="flex-1 min-w-0"><UserName :user="m.user" /><p class="text-body-sm text-on-surface-variant">{{ CLAN_ROLES[m.role] }} · {{ m.rep.toLocaleString() }} Rep earned</p></div>
            <template v-if="leader && m.user.id !== s.user?.id">
              <button v-if="m.role === 'member'" class="btn-ghost h-8 px-3 text-label-sm" @click="run(api.clanRole(c.id, m.user.id, 'officer'), 'Promoted')">Promote</button>
              <button v-else-if="m.role === 'officer'" class="btn-ghost h-8 px-3 text-label-sm" @click="run(api.clanRole(c.id, m.user.id, 'member'), 'Demoted')">Demote</button>
            </template>
            <button v-if="officer && m.role !== 'leader' && m.user.id !== s.user?.id && (leader || m.role === 'member')" class="btn-ghost h-8 px-3 text-label-sm text-error" @click="run(api.clanKick(c.id, m.user.id), 'Removed')">Remove</button>
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        <section v-if="officer && d.requests.length" class="card p-5 space-y-2">
          <p class="text-headline-sm">Join requests</p>
          <div v-for="r in d.requests" :key="r.user.id" class="flex items-center gap-2">
            <Avatar :user="r.user" :size="32" /><UserName :user="r.user" class="flex-1 min-w-0" />
            <button class="btn-primary h-8 px-3 text-label-sm" @click="run(api.clanRequest(c.id, r.user.id, 'accept'), 'Accepted')">✓</button>
            <button class="btn-ghost h-8 px-3 text-label-sm" @click="run(api.clanRequest(c.id, r.user.id, 'decline'))">✕</button>
          </div>
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
        <select v-model="e.policy" class="input"><option value="open">Open — anyone can join</option><option value="request">Request — officers approve</option><option value="invite">Invite only</option></select>
        <label v-if="d.perks.banner" class="flex items-center gap-3 text-label-lg">Clan colour <input v-model="e.color" type="color" class="w-12 h-9 rounded" /></label>
        <p v-else class="text-body-sm text-on-surface-variant">🔒 Custom colour unlocks at level 5.</p>
        <button class="btn-primary w-full">Save</button>
      </form>
    </Modal>

    <Modal v-if="warring" title="⚔️ Declare war" @close="warring = false">
      <form class="px-6 pb-6 space-y-3" @submit.prevent="declare">
        <p class="text-body-sm text-on-surface-variant">{{ CLAN_WAR.hours }} hours. Whichever clan’s members earn more Rep wins the pot (both stakes) and {{ CLAN_WAR.winRep }} bonus Rep. Both clans need level {{ CLAN_WAR.minLevel }}+.</p>
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
