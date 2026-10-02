<script setup lang="ts">
import { confirmDialog } from '../lib/dialog';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { PremiumPlan } from '@chatlol/shared';
import { PREMIUM_PERKS } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Icon from '../components/Icon.vue';

/** ChatLOL Premium: week / month / season passes, paid by card (Stripe) or — at a steep rate — Sparks. */
const s = useSession();
const route = useRoute();
const router = useRouter();
const info = ref<{ plans: PremiumPlan[]; premiumUntil: string | null; sparks: number; stripe: boolean } | null>(null);
const busy = ref<string | null>(null);
const active = computed(() => info.value?.premiumUntil ?? s.user?.premiumUntil ?? null);

onMounted(async () => {
  info.value = await api.premium();
  if (route.query.purchase === 'success') {
    s.toast({ kind: 'reward', title: 'Welcome to Premium 👑' });
    await s.refresh();
    info.value = await api.premium();
  }
});
async function card(p: PremiumPlan) {
  if (!s.user) return router.push('/join');
  busy.value = p.id;
  try { location.href = (await api.stripeCheckout(p.id, `${location.origin}/premium`)).url; } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); busy.value = null; }
}
async function sparks(p: PremiumPlan) {
  if (!s.user) return router.push('/join');
  if (!(await confirmDialog({ title: `Premium ${p.label}`, body: `Spend ${p.sparks.toLocaleString()} Sparks on ${p.label} of Premium?`, icon: 'workspace_premium', confirmText: `Spend ${p.sparks.toLocaleString()} ✦` }))) return;
  busy.value = p.id;
  try {
    const r = await api.buyPremium(p.id);
    s.applyUser(r.user);
    info.value = await api.premium();
    s.toast({ kind: 'reward', title: 'Welcome to Premium 👑' });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = null; }
}
</script>

<template>
  <div class="max-w-[860px] mx-auto space-y-6">
    <section class="rounded-lg bg-[linear-gradient(135deg,#1a110c,rgb(var(--c-flame)/0.55)_55%,rgb(var(--c-flame)))] text-white p-7 shadow-float">
      <p class="text-label-sm uppercase tracking-wider opacity-80">ChatLOL Premium</p>
      <h1 class="text-headline-xl mt-1">👑 Know who’s into your vibe</h1>
      <p v-if="active" class="mt-2 text-body-lg">You’re Premium until <b>{{ new Date(active).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) }}</b>. Buying again adds more days.</p>
      <ul class="mt-4 grid sm:grid-cols-2 gap-2">
        <li v-for="p in PREMIUM_PERKS" :key="p.title" class="flex items-center gap-2 text-body-md"><span class="text-xl">{{ p.emoji }}</span> {{ p.title }}</li>
      </ul>
    </section>
    <div v-if="info" class="grid md:grid-cols-3 gap-4">
      <div v-for="p in info.plans" :key="p.id" class="card p-5 flex flex-col" :class="{ 'ring-2 ring-flame': p.best }">
        <p v-if="p.best" class="label text-flame">Most popular</p>
        <h2 class="text-headline-md">{{ p.label }}</h2>
        <p class="text-body-sm text-on-surface-variant">{{ p.days }} days of Premium</p>
        <p class="text-display-sm font-bold mt-3">${{ p.usd.toFixed(2) }}</p>
        <div class="mt-auto pt-4 space-y-2">
          <button class="btn-primary w-full" :disabled="!!busy || !info.stripe" :title="info.stripe ? '' : 'Card payments are not set up yet'" @click="card(p)"><Icon name="credit_card" /> {{ busy === p.id ? 'Opening…' : 'Pay by card' }}</button>
          <button class="btn-secondary w-full" :disabled="!!busy" @click="sparks(p)">⚡ {{ p.sparks.toLocaleString() }} Sparks</button>
          <p v-if="s.user" class="text-body-sm text-on-surface-variant text-center">You have {{ s.user.sparks.toLocaleString() }} Sparks</p>
        </div>
      </div>
    </div>
    <p class="text-body-sm text-on-surface-variant text-center">Passes don’t renew automatically. On iPhone and Android, Premium is bought in the app.</p>
  </div>
</template>
