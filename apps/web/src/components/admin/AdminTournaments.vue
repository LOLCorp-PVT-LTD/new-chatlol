<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TournamentPrize } from '@chatlol/shared';
import { ARCADE, GAMES } from '@chatlol/shared';
import { api, uploadImage } from '../../lib/api';
import { useSession } from '../../stores/session';
import { confirmDialog } from '../../lib/dialog';
import TournamentCard from '../TournamentCard.vue';

/** Staff: create tournaments (banner, game, level, entry, prizes, schedule), cancel / finish them, pay cash prizes. */
const s = useSession();
const list = ref<Awaited<ReturnType<typeof api.admin.tournaments>>['tournaments']>([]);
const load = async () => (list.value = (await api.admin.tournaments()).tournaments);
onMounted(load);
const err = (e: unknown) => s.toast({ kind: 'error', title: (e as Error).message });

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const blank = () => ({
  title: '', description: '', bannerUrl: null as string | null, kind: 'arcade' as 'arcade' | 'arena', game: 'snake', minLevel: 15, entryGold: 0, maxEntrants: null as number | null,
  prizes: [{ gold: 50 }, { gold: 20 }, { gold: 10 }] as TournamentPrize[], startsAt: local(new Date(Date.now() + 3_600_000)), endsAt: local(new Date(Date.now() + 7 * 86_400_000)), featured: true,
});
const f = ref(blank());
const games = computed(() => (f.value.kind === 'arcade' ? Object.values(ARCADE).map((g) => ({ key: g.key, label: `${g.emoji} ${g.name}` })) : Object.values(GAMES).map((g) => ({ key: g.key, label: `${g.emoji} ${g.name}` }))));
const uploading = ref(false);
async function onBanner(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploading.value = true;
  try { f.value.bannerUrl = await uploadImage(file); } catch (x) { err(x); } finally { uploading.value = false; }
}
const clean = (p: TournamentPrize) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== 0)) as TournamentPrize;
async function create() {
  try {
    await api.admin.createTournament({ ...f.value, prizes: f.value.prizes.map(clean), startsAt: new Date(f.value.startsAt).toISOString(), endsAt: new Date(f.value.endsAt).toISOString() });
    s.toast({ kind: 'reward', title: '🏆 Tournament created' });
    f.value = blank();
    await load();
  } catch (e) { err(e); }
}
async function cancel(id: string) {
  if (await confirmDialog({ title: 'Cancel this tournament?', body: 'Gold entries are refunded.', danger: true })) try { await api.admin.cancelTournament(id); await load(); } catch (e) { err(e); }
}
async function finish(id: string) {
  if (await confirmDialog({ title: 'End it now and pay prizes?' })) try { await api.admin.finishTournament(id); await load(); } catch (e) { err(e); }
}
async function paid(id: string, place: number) {
  try { await api.admin.markCashPaid(id, place); await load(); } catch (e) { err(e); }
}
const preview = computed(() => ({ id: 'preview', ...f.value, prizes: f.value.prizes.map((p, i) => ({ place: i + 1, ...p, text: Object.entries(clean(p)).map(([k, v]) => `${v} ${k}`).join(' + ') })), status: 'upcoming' as const, entrants: 0, joined: false, myScore: null, results: null, startsAt: new Date(f.value.startsAt).toISOString(), endsAt: new Date(f.value.endsAt).toISOString() }));
</script>

<template>
  <div class="space-y-5">
    <section class="card p-5 space-y-3">
      <h2 class="text-headline-sm">New tournament</h2>
      <TournamentCard :t="preview" wide />
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="text-label-md">Title<input v-model="f.title" class="input h-10 mt-1" maxlength="80" /></label>
        <label class="text-label-md">Banner image<input type="file" accept="image/*" class="input h-10 mt-1 py-2" @change="onBanner" /><span v-if="uploading" class="text-body-sm">Uploading…</span></label>
        <label class="text-label-md sm:col-span-2">Description<textarea v-model="f.description" class="input min-h-[70px] mt-1 py-2" maxlength="1000" /></label>
        <label class="text-label-md">Format<select v-model="f.kind" class="input h-10 mt-1" @change="f.game = f.kind === 'arcade' ? 'snake' : 'chess'"><option value="arcade">Arcade high score</option><option value="arena">Arena wins</option></select></label>
        <label class="text-label-md">Game<select v-model="f.game" class="input h-10 mt-1"><option v-for="g in games" :key="g.key" :value="g.key">{{ g.label }}</option></select></label>
        <label class="text-label-md">Minimum level<input v-model.number="f.minLevel" type="number" min="1" max="100" class="input h-10 mt-1" /></label>
        <label class="text-label-md">Entry (Gold, 0 = free)<input v-model.number="f.entryGold" type="number" min="0" class="input h-10 mt-1" /></label>
        <label class="text-label-md">Starts<input v-model="f.startsAt" type="datetime-local" class="input h-10 mt-1" /></label>
        <label class="text-label-md">Ends<input v-model="f.endsAt" type="datetime-local" class="input h-10 mt-1" /></label>
        <label class="text-label-md">Max entrants (blank = no limit)<input v-model.number="f.maxEntrants" type="number" min="2" class="input h-10 mt-1" /></label>
        <label class="text-label-md flex items-center gap-2 mt-6"><input v-model="f.featured" type="checkbox" class="accent-flame" /> Show as a banner on the home page</label>
      </div>
      <div><p class="label mb-2">Prizes</p>
        <div v-for="(p, i) in f.prizes" :key="i" class="grid grid-cols-3 sm:grid-cols-7 gap-2 items-end mb-2">
          <span class="text-label-lg">#{{ i + 1 }}</span>
          <label class="text-[11px]">Gold<input v-model.number="p.gold" type="number" min="0" class="input h-9" /></label>
          <label class="text-[11px]">Gems<input v-model.number="p.gems" type="number" min="0" class="input h-9" /></label>
          <label class="text-[11px]">Sparks<input v-model.number="p.sparks" type="number" min="0" class="input h-9" /></label>
          <label class="text-[11px]">Premium days<input v-model.number="p.premiumDays" type="number" min="0" class="input h-9" /></label>
          <label class="text-[11px]">Item key<input v-model="p.item" class="input h-9" placeholder="cover_holo" /></label>
          <label class="text-[11px]">Cash (free entry only)<input v-model="p.cash" class="input h-9" placeholder="£50" :disabled="f.entryGold > 0" /></label>
        </div>
        <div class="flex gap-2"><button class="chip h-8" @click="f.prizes.push({})">+ place</button><button v-if="f.prizes.length > 1" class="chip h-8" @click="f.prizes.pop()">− place</button></div>
        <p class="text-body-sm text-on-surface-variant mt-2">Cash prizes are only allowed with free entry: a paid-in contest that pays real money would count as gambling. Cash wins are listed below for you to pay out and mark as paid.</p>
      </div>
      <button class="btn-primary" :disabled="f.title.trim().length < 3" @click="create">Create tournament</button>
    </section>

    <section class="card p-5 space-y-3">
      <h2 class="text-headline-sm">All tournaments</h2>
      <div v-for="t in list" :key="t.id" class="border-b border-sandstone last:border-0 py-3 space-y-1">
        <div class="flex items-center gap-2 flex-wrap"><b class="text-label-lg">{{ t.title }}</b><span class="chip h-6 text-[10px]">{{ t.cancelled ? 'cancelled' : t.status }}</span><span class="text-body-sm text-on-surface-variant">{{ t.kind }} · {{ t.game }} · {{ t.entrants }} entrants</span>
          <span class="flex-1" /><RouterLink :to="`/tournaments/${t.id}`" class="btn-ghost h-8 px-3">Open</RouterLink>
          <button v-if="!t.cancelled && t.status !== 'ended'" class="btn-ghost h-8 px-3" @click="finish(t.id)">End & pay</button>
          <button v-if="!t.cancelled && t.status !== 'ended'" class="btn-ghost h-8 px-3 text-error" @click="cancel(t.id)">Cancel</button></div>
        <div v-for="c in t.cashToPay" :key="c.place" class="flex items-center gap-2 text-body-sm rounded-md bg-yellow-400/15 px-3 py-1.5">💵 #{{ c.place }} won {{ c.prize.cash }} — pay them, then <button class="underline" @click="paid(t.id, c.place)">mark as paid</button></div>
      </div>
      <p v-if="!list.length" class="text-body-sm text-on-surface-variant">None yet.</p>
    </section>
  </div>
</template>
