<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { CLAN_JOIN_POLICIES, CLAN_LEVELS, type ClanPolicy } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Modal from '../components/Modal.vue';
import Icon from '../components/Icon.vue';
import Countdown from '../components/Countdown.vue';
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
      <div class="flex items-center gap-3"><p class="text-headline-sm flex-1">🏆 Clan leaderboard</p>
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
