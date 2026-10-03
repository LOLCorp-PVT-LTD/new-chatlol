<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EXCHANGE, KING, powerByKey, ticketByKey, type GemPack, type PowerKey, type StoreItem, type StoreItemKind, type TicketKey } from '@chatlol/shared';
import { confirmDialog, promptDialog } from '../lib/dialog';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confetti, ding } from '../lib/fx';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';

const s = useSession();
const route = useRoute();
const router = useRouter();
const items = ref<StoreItem[]>([]);
const packs = ref<GemPack[]>([]);
const cardsEnabled = ref(false);
const history = ref<{ id: string; product_id: string; gems: number; amount_cents: number | null; currency: string | null; status: string; created_at: string }[]>([]);
const checkingOut = ref<string | null>(null);
const odds = ref<Record<string, number>>({});
type Tab = StoreItemKind | 'all' | 'gems' | 'exchange';
const tab = ref<Tab>((['gems', 'power', 'ticket', 'king', 'exchange'] as string[]).includes(String(route.query.tab)) ? (route.query.tab as Tab) : 'all');
const won = ref<StoreItem | null>(null);
const buying = ref<string | null>(null);
const chest = ref<{ claimed: boolean; nextAt: string } | null>(null);
const TABS: [Tab, string][] = [['king', '👑 King'], ['ticket', '🎫 Tickets'], ['power', '⚡ Power-ups'], ['exchange', '🔄 Exchange'], ['gems', '💎 Get Gems'], ['all', '✨ All'], ['frame', '⭕ Frames'], ['flair', '🔥 Flairs'], ['theme', '🎨 Themes'], ['banner', '🏙️ Banners'], ['crate', '🎁 Crates'], ['streak_freeze', '🧊 Boosts']];
const rarityStyle: Record<string, string> = { common: 'bg-surface-container text-on-surface-variant', rare: 'bg-sky-100 text-sky-700', epic: 'bg-violet-100 text-violet-700', legendary: 'bg-sunset text-white' };
const shown = computed(() => items.value.filter((i) => tab.value === 'all' || i.kind === tab.value || (tab.value === 'streak_freeze' && i.kind === 'boost')));

async function load() {
  const r = await api.store();
  if (r.items.some((i) => i.kind === 'king')) void api.king().then((k) => (king.value = k.king)).catch(() => {});
  items.value = r.items;
  odds.value = r.crateOdds;
  if (s.user) Object.assign(s.user, { sparks: r.sparks, gems: r.gems, gold: r.gold });
}
// ——— Exchange: Sparks → Gems → Gold ———
const swap = ref({ gems: 1, gold: 1 });
const swapping = ref(false);
async function doExchange(to: 'gems' | 'gold') {
  if (!s.user) return router.push('/join');
  const amount = Math.max(1, Math.floor(swap.value[to] || 1));
  const cost = to === 'gems' ? amount * EXCHANGE.sparksPerGem : amount * EXCHANGE.gemsPerGold;
  if (!(await confirmDialog({ title: `Exchange for ${amount.toLocaleString()} ${to === 'gems' ? '💎 Gems' : '🪙 Gold'}?`, body: `Costs ${cost.toLocaleString()} ${to === 'gems' ? 'Sparks' : 'Gems'}. Exchanges are one way.` }))) return;
  swapping.value = true;
  try {
    Object.assign(s.user, await api.exchange(to, amount));
    ding('reward');
    s.toast({ kind: 'reward', title: `+${amount.toLocaleString()} ${to === 'gems' ? '💎 Gems' : '🪙 Gold'}` });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { swapping.value = false; }
}
// ——— Tickets ———
async function useTicket(i: StoreItem) {
  const t = ticketByKey(i.id)!;
  if (t.key === 'kick_ticket') return s.toast({ kind: 'info', title: 'Use Kick Tickets inside a lounge', body: 'Open the lounge and tap the person’s name.' }, 5000);
  const handle = (await promptDialog({ title: `${t.emoji} Use ${t.name}`, body: t.desc, label: 'Who?', placeholder: '@handle', required: true }))?.replace(/^@/, '').trim();
  if (!handle) return;
  try {
    const { user } = await api.user(handle);
    if (!(await confirmDialog({ title: `${t.name} on @${user.handle}?`, body: t.key === 'premium_gift' ? 'They get 1 day of Premium.' : 'This can’t be undone. Staff can see every ticket used.', danger: t.key !== 'premium_gift' }))) return;
    const r = await api.useTicket(t.key as TicketKey, user.id);
    ding('reward');
    s.toast({ kind: 'reward', title: `${t.emoji} ${t.name} used on @${r.target.handle}${r.free ? ' (King’s freebie 👑)' : ''}` });
    await load();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function loadGems() {
  const p = await api.gemPacks();
  packs.value = p.packs;
  cardsEnabled.value = p.stripe;
  if (s.user) history.value = (await api.purchaseHistory()).purchases;
}
onMounted(async () => {
  await Promise.all([load(), loadGems()]);
  // Checkout started from the desktop app: hand the result back to it.
  if (route.query.app === '1' && route.query.purchase) {
    location.href = `chatlol://vault?purchase=${route.query.purchase === 'success' ? 'success' : 'cancelled'}`;
  }
  if (route.query.purchase === 'success') {
    s.toast({ kind: 'reward', title: 'Payment received 💎', body: 'Your Gems land in a few seconds.' }, 5000);
    confetti();
    setTimeout(() => void Promise.all([load(), loadGems()]), 3000);
    router.replace({ query: { tab: 'gems' } });
  } else if (route.query.purchase === 'cancelled') {
    s.toast({ kind: 'info', title: 'Checkout cancelled — no charge made' });
    router.replace({ query: { tab: 'gems' } });
  }
});

async function checkout(p: GemPack) {
  if (!s.user) return router.push('/join');
  if (!s.user.emailVerified) return s.toast({ kind: 'info', title: 'Verify your email first ✉️', body: 'Check your inbox or resend from Settings.' });
  checkingOut.value = p.id;
  try {
    const { url } = await api.stripeCheckout(p.id, `${location.origin}/vault`);
    location.href = url;
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); checkingOut.value = null; }
}
const money = (cents: number | null, cur: string | null) => (cents == null ? '' : new Intl.NumberFormat(undefined, { style: 'currency', currency: (cur ?? 'usd').toUpperCase() }).format(cents / 100));

async function buy(i: StoreItem, currency: 'sparks' | 'gems' | 'gold' = 'sparks') {
  if (!s.user) return;
  if (currency === 'gold' && !(await confirmDialog({ title: `Buy ${i.emoji} ${i.name}?`, body: `Costs 🪙 ${i.goldPrice?.toLocaleString()} Gold.` }))) return;
  buying.value = i.id;
  try {
    const r = await api.buy(i.id, currency);
    Object.assign(s.user, { sparks: r.sparks, gems: r.gems, gold: r.gold });
    if (i.kind === 'king') { confetti(); ding('level'); s.toast({ kind: 'reward', title: '👑 You are the King of ChatLOL!' }, 6000); await load(); return; }
    if (r.won) { won.value = r.won; confetti(); ding('level'); } else { ding('reward'); s.toast({ kind: 'reward', title: `${i.emoji} ${i.name} unlocked!` }); }
    await load();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { buying.value = null; }
}
const using = ref<string | null>(null);
const king = ref<Awaited<ReturnType<typeof api.king>>['king']>(null);
const tickNow = ref(Date.now());
const ticker = setInterval(() => (tickNow.value = Date.now()), 30_000);
onUnmounted(() => clearInterval(ticker));
/** Running power-ups with minutes left, soonest-ending first. */
const running = computed(() =>
  Object.entries(s.user?.powers ?? {})
    .map(([k, until]) => ({ p: powerByKey(k), left: Math.ceil((Date.parse(until as string) - tickNow.value) / 60_000) }))
    .filter((r) => r.p && r.left > 0)
    .sort((a, b) => a.left - b.left),
);
const leftLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
async function usePower(i: StoreItem) {
  if (!s.user) return;
  using.value = i.id;
  try {
    const r = await api.usePower(i.id as PowerKey);
    s.user.powers = r.powers;
    ding('reward');
    s.toast({ kind: 'reward', title: `${i.emoji} ${i.name} is on!`, body: i.description });
    await load();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { using.value = null; }
}
async function equip(i: StoreItem) {
  const key = i.kind as 'frame' | 'flair' | 'theme' | 'banner';
  const r = await api.equip({ [key]: i.equipped ? null : i.id });
  s.applyUser(r.user);
  await load();
}
async function claim() {
  const r = await api.claimDaily();
  chest.value = r;
  if (r.claimed) { s.reward(r.reward); confetti(); } else s.toast({ kind: 'info', title: 'Chest already opened — back tomorrow 🌅' });
}
</script>

<template>
  <div class="max-w-[960px] mx-auto space-y-5">
    <section class="rounded-lg bg-sunset text-white p-6 shadow-float relative overflow-hidden">
      <div class="absolute -right-8 -bottom-12 text-[160px] opacity-20 rotate-12">💎</div>
      <p class="label !text-white/80">Sparks Vault</p>
      <h1 class="text-headline-xl">✦ {{ s.user?.sparks.toLocaleString() ?? 0 }} <span class="text-headline-md opacity-90 ml-2">💎 {{ s.user?.gems.toLocaleString() ?? 0 }}</span> <span class="text-headline-md opacity-90 ml-2">🪙 {{ s.user?.gold.toLocaleString() ?? 0 }}</span></h1>
      <p class="text-body-md opacity-90 max-w-md">Earn ✦ Sparks by dropping daily, matching the crowd and winning Hot Takes. 💎 Gems are the premium shortcut for cosmetics.</p>
      <button class="btn bg-white text-flame mt-4 shadow-float" @click="claim"><Icon name="redeem" /> Open Daily Sunset Chest</button>
    </section>
    <section v-if="running.length" class="card p-4 flex flex-wrap gap-2 items-center">
      <span class="label">Active now</span>
      <span v-for="r in running" :key="r.p!.key" class="chip chip-active">{{ r.p!.emoji }} {{ r.p!.name }} · {{ leftLabel(r.left) }} left</span>
    </section>
    <div class="flex gap-2 overflow-x-auto scrollbar-none pb-1">
      <button v-for="t in TABS" :key="t[0]" class="chip" :class="{ 'chip-active': tab === t[0] }" @click="tab = t[0]">{{ t[1] }}</button>
    </div>
    <section v-if="tab === 'exchange'" class="grid md:grid-cols-2 gap-4">
      <div class="card p-5 space-y-3">
        <p class="text-headline-sm">✦ Sparks → 💎 Gems</p>
        <p class="text-body-sm text-on-surface-variant">{{ EXCHANGE.sparksPerGem.toLocaleString() }} Sparks = 1 Gem</p>
        <div class="flex gap-2"><input v-model.number="swap.gems" type="number" min="1" class="input h-11 w-28" /><button class="btn-primary h-11 flex-1" :disabled="swapping || !s.user || s.user.sparks < swap.gems * EXCHANGE.sparksPerGem" @click="doExchange('gems')">Get {{ swap.gems || 1 }} 💎 for ✦ {{ ((swap.gems || 1) * EXCHANGE.sparksPerGem).toLocaleString() }}</button></div>
      </div>
      <div class="card p-5 space-y-3">
        <p class="text-headline-sm">💎 Gems → 🪙 Gold</p>
        <p class="text-body-sm text-on-surface-variant">{{ EXCHANGE.gemsPerGold.toLocaleString() }} Gems = 1 Gold. Gold buys tickets and the King’s crown.</p>
        <div class="flex gap-2"><input v-model.number="swap.gold" type="number" min="1" class="input h-11 w-28" /><button class="btn-primary h-11 flex-1" :disabled="swapping || !s.user || s.user.gems < swap.gold * EXCHANGE.gemsPerGold" @click="doExchange('gold')">Get {{ swap.gold || 1 }} 🪙 for 💎 {{ ((swap.gold || 1) * EXCHANGE.gemsPerGold).toLocaleString() }}</button></div>
      </div>
    </section>
    <section v-else-if="tab === 'king'" class="space-y-4">
      <div class="rounded-lg p-6 text-[#3b2a00] bg-[linear-gradient(135deg,#fff3b0,#fcd34d_45%,#d4a017)] shadow-float">
        <p class="text-label-sm uppercase tracking-[.2em] font-bold">👑 {{ KING.name }}</p>
        <p v-if="king" class="text-headline-md mt-1">Current King: @{{ king.user.handle }} <span class="text-body-sm">· until {{ new Date(king.until).toLocaleDateString() }}</span></p>
        <p v-else class="text-headline-md mt-1">The throne is empty.</p>
        <ul class="text-body-md mt-3 space-y-1">
          <li>👑 Golden crown on your picture everywhere, and top of the home page</li>
          <li>💎 Premium for your whole {{ KING.reignDays }}-day reign</li>
          <li>🔨🔇🥾 A free Ban, Mute and Kick ticket every day</li>
          <li>🛡️ Nobody can use tickets on you</li>
          <li>⚔️ One King at a time: anyone who buys the crown takes your throne</li>
        </ul>
      </div>
    </section>
    <template v-if="tab === 'gems'">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button v-for="p in packs" :key="p.id" class="card p-5 text-center relative hover:shadow-pop transition active:scale-[.98] disabled:opacity-60"
          :class="{ 'ring-2 ring-flame': p.best }" :disabled="!!checkingOut || !cardsEnabled" @click="checkout(p)">
          <span v-if="p.best" class="absolute -top-2 left-1/2 -translate-x-1/2 bg-sunset text-white rounded-full px-3 py-0.5 text-label-sm">BEST VALUE</span>
          <p class="text-4xl">💎</p>
          <p class="text-headline-md mt-2">{{ (p.gems + p.bonus).toLocaleString() }}</p>
          <p v-if="p.bonus" class="text-label-sm text-primary">incl. +{{ p.bonus }} bonus</p>
          <p class="text-body-sm text-on-surface-variant">{{ p.label }}</p>
          <span class="btn-primary h-10 mt-3 w-full">{{ checkingOut === p.id ? 'Opening…' : `$${p.usd.toFixed(2)}` }}</span>
        </button>
      </div>
      <p v-if="!cardsEnabled" class="text-body-sm text-on-surface-variant text-center">Card payments aren’t switched on for this server yet. On iPhone and Android, buy Gems in the app.</p>
      <p class="text-body-sm text-on-surface-variant text-center">Gems buy cosmetics and power-ups. They can’t be used for loot crates or cashed out. Secure checkout by Stripe.</p>
      <section v-if="history.length" class="card p-5">
        <h3 class="text-headline-sm mb-3">Purchase history</h3>
        <div v-for="h in history" :key="h.id" class="flex items-center justify-between py-2 border-b border-sandstone last:border-0 text-body-md">
          <span>💎 {{ h.gems.toLocaleString() }} <span class="text-on-surface-variant">• {{ new Date(h.created_at).toLocaleDateString() }}</span></span>
          <span :class="h.status === 'refunded' ? 'text-error' : 'text-on-surface-variant'">{{ h.status === 'refunded' ? 'Refunded' : money(h.amount_cents, h.currency) }}</span>
        </div>
      </section>
    </template>
    <div v-else-if="tab !== 'exchange'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <div v-for="i in shown" :key="i.id" class="card overflow-hidden flex flex-col">
        <div class="h-28 flex items-center justify-center text-5xl relative" :style="{ background: i.preview }">
          <span class="drop-shadow">{{ i.emoji }}</span>
          <span class="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" :class="rarityStyle[i.rarity]">{{ i.rarity }}</span>
          <span v-if="i.limited" class="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold bg-black/60 text-white">LIMITED</span>
        </div>
        <div class="p-3 flex-1 flex flex-col">
          <p class="text-label-lg">{{ i.name }}</p>
          <p class="text-body-sm text-on-surface-variant flex-1">{{ i.description }}</p>
          <button v-if="i.owned && ['frame', 'flair', 'theme', 'banner'].includes(i.kind)" class="mt-3 h-9" :class="i.equipped ? 'btn-secondary' : 'btn-primary'" @click="equip(i)">{{ i.equipped ? 'Equipped ✓' : 'Equip' }}</button>
          <template v-else-if="i.goldPrice">
            <p v-if="i.qty && i.kind === 'ticket'" class="text-label-sm text-primary mt-2">You have {{ i.qty }}</p>
            <button v-if="i.qty && i.kind === 'ticket'" class="btn-secondary h-9 mt-2" @click="useTicket(i)">Use</button>
            <button class="h-9 mt-2 px-2 rounded-full font-bold text-[#3b2a00] bg-[linear-gradient(135deg,#fde047,#d4a017)] disabled:opacity-50" :disabled="!s.user || buying === i.id || (s.user && s.user.gold < i.goldPrice)" @click="buy(i, 'gold')">🪙 {{ i.goldPrice.toLocaleString() }} Gold</button>
          </template>
          <template v-else-if="i.kind === 'power'">
            <p v-if="i.qty" class="text-label-sm text-primary mt-2">You have {{ i.qty }}</p>
            <button v-if="i.qty && !powerByKey(i.id)?.auto" class="btn-secondary h-9 mt-2" :disabled="using === i.id" @click="usePower(i)">Use now</button>
            <p v-else-if="i.qty" class="text-body-sm text-on-surface-variant mt-1">Kicks in by itself when you need it.</p>
            <div class="flex gap-1.5 mt-2">
              <button class="btn-primary h-9 flex-1 px-2" :disabled="!s.user || buying === i.id || (s.user && s.user.sparks < i.price)" @click="buy(i)">✦ {{ i.price.toLocaleString() }}</button>
              <button v-if="i.gemPrice !== null" class="btn-secondary h-9 px-3" :disabled="!s.user || buying === i.id || (s.user && s.user.gems < i.gemPrice)" :title="`${i.gemPrice} Gems`" @click="buy(i, 'gems')">💎 {{ i.gemPrice }}</button>
            </div>
          </template>
          <div v-else class="flex gap-1.5 mt-3">
            <button class="btn-primary h-9 flex-1 px-2" :disabled="!s.user || buying === i.id || (s.user && s.user.sparks < i.price)" @click="buy(i)">✦ {{ i.price.toLocaleString() }}</button>
            <button v-if="i.gemPrice !== null" class="btn-secondary h-9 px-3" :disabled="!s.user || buying === i.id || (s.user && s.user.gems < i.gemPrice)" :title="`${i.gemPrice} Gems`" @click="buy(i, 'gems')">💎 {{ i.gemPrice }}</button>
          </div>
        </div>
      </div>
    </div>
    <p class="text-body-sm text-on-surface-variant text-center">Loot crate odds: <template v-for="(p, r) in odds" :key="r">{{ r }} {{ Math.round(p * 100) }}% · </template>duplicates convert to 40% Sparks back. Sparks have no cash value.</p>
    <Modal v-if="won" @close="won = null">
      <div class="p-8 text-center">
        <p class="label">You pulled a</p>
        <p class="text-headline-lg uppercase text-gradient">{{ won.rarity }}</p>
        <div class="mx-auto mt-4 w-32 h-32 rounded-lg flex items-center justify-center text-6xl shadow-float animate-pop" :style="{ background: won.preview }">{{ won.emoji }}</div>
        <p class="text-headline-md mt-4">{{ won.name }}</p>
        <button class="btn-primary w-full mt-6" @click="won = null">Nice!</button>
      </div>
    </Modal>
  </div>
</template>
