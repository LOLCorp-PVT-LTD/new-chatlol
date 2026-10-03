<script setup lang="ts">
import ScrollRow from '../components/ScrollRow.vue';
import { confirmDialog, formDialog, promptDialog } from '../lib/dialog';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AdminPayment, AdminUser, Permission } from '@chatlol/shared';
import { PERMISSIONS, ROLE_DEFAULTS, ROLES, can, timeAgo } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import Empty from '../components/Empty.vue';
import AdminUserPanel from '../components/admin/AdminUserPanel.vue';
import AdminTournaments from '../components/admin/AdminTournaments.vue';
import AdminAds from '../components/admin/AdminAds.vue';
import AdminOversight from '../components/admin/AdminOversight.vue';
import AdminFestivals from '../components/admin/AdminFestivals.vue';
import TurnTest from '../components/admin/TurnTest.vue';
import MailTest from '../components/admin/MailTest.vue';

type Api = typeof api.admin;
type Awaited2<T> = T extends Promise<infer U> ? U : never;
const route = useRoute();
const router = useRouter();
const s = useSession();
const isAdmin = computed(() => s.user?.role === 'admin');
const has = (p: Permission) => can(s.user, p);
const ALL_TABS = [
  ['overview', 'dashboard', 'Overview', 'overview'],
  ['users', 'group', 'Users', null],
  ['payments', 'payments', 'Payments', 'payments'],
  ['staff', 'shield_person', 'Staff', 'staff'],
  ['reports', 'flag', 'Reports', 'reports'],
  ['flags', 'smart_toy', 'AI flags', 'reports'],
  ['modlog', 'history', 'Activity log', null],
  ['personas', 'face', 'Personas', 'personas'],
  ['features', 'monitoring', 'Features', 'overview'],
  ['tournaments', 'military_tech', 'Tournaments', 'tournaments'],
  ['ads', 'campaign', 'Ads', 'ads'],
  ['oversight', 'shield', 'Oversight', 'staff'],
  ['arenas', 'sports_esports', 'Arenas', 'overview'],
  ['gates', 'lock_open', 'Level gates', 'staff'],
  ['festivals', 'calendar_month', 'Festivals', 'overview'],
] as const;
const TABS = computed(() => ALL_TABS.filter((t) => !t[3] || has(t[3])));
const section = computed(() => (route.params.section as string) || TABS.value[0]?.[0] || 'users');

const overview = ref<Awaited2<ReturnType<Api['overview']>> | null>(null);
const users = ref<AdminUser[]>([]);
const userQuery = ref({ q: '', status: '', role: '' });
const staff = ref<AdminUser[]>([]);
const reports = ref<Awaited2<ReturnType<Api['reports']>>['items']>([]);
const reportStatus = ref<'open' | 'closed' | 'all'>('open');
const flags = ref<Awaited2<ReturnType<Api['flags']>>['items']>([]);
const modlog = ref<Awaited2<ReturnType<Api['modlog']>>['items']>([]);
const personas = ref<Awaited2<ReturnType<Api['personas']>>['items']>([]);
const payments = ref<Awaited2<ReturnType<Api['payments']>> | null>(null);
const payQuery = ref({ user: '', status: '', provider: '', days: '30' });
const features = ref<Awaited2<ReturnType<Api['features']>> | null>(null);
const arenaList = ref<Awaited2<ReturnType<Api['arenas']>> | null>(null);
async function toggleWagers() {
  try { const r = await api.admin.setWagers(!arenaList.value!.gemsGold); arenaList.value!.gemsGold = r.gemsGold; ok(r.gemsGold ? 'Gem & Gold stakes on' : 'Gem & Gold stakes off'); } catch (e) { err(e); }
}
const gates = ref<Awaited2<ReturnType<Api['levelGates']>> | null>(null);
async function saveGates() {
  try { gates.value = await api.admin.setLevelGates(gates.value!.values); ok('Level gates saved ✅'); } catch (e) { err(e); }
}

const err = (e: unknown) => s.toast({ kind: 'error', title: (e as Error).message });
const ok = (title = 'Done ✅') => s.toast({ kind: 'info', title });
async function load() {
  try {
    if (section.value === 'overview') overview.value = await api.admin.overview();
    if (section.value === 'gates') gates.value = await api.admin.levelGates();
    if (section.value === 'features') features.value = await api.admin.features();
    if (section.value === 'arenas') arenaList.value = await api.admin.arenas();
    if (section.value === 'users') users.value = (await api.admin.users({ q: userQuery.value.q || undefined, status: userQuery.value.status || undefined, role: userQuery.value.role || undefined })).items;
    if (section.value === 'staff') staff.value = (await api.admin.users({ staff: '1' })).items;
    if (section.value === 'payments') {
      const q = payQuery.value;
      payments.value = await api.admin.payments({ user: q.user || undefined, status: q.status || undefined, provider: q.provider || undefined, days: q.days ? Number(q.days) : undefined });
    }
    if (section.value === 'reports') reports.value = (await api.admin.reports(reportStatus.value)).items;
    if (section.value === 'flags') flags.value = (await api.admin.flags()).items;
    if (section.value === 'modlog') modlog.value = (await api.admin.modlog()).items;
    if (section.value === 'personas') personas.value = (await api.admin.personas()).items;
  } catch (e) { err(e); }
}
onMounted(load);
watch(section, load);
watch(reportStatus, load);
let t: ReturnType<typeof setTimeout>;
watch([userQuery, payQuery], () => { clearTimeout(t); t = setTimeout(load, 250); }, { deep: true });

const detailId = ref<string | null>(null);
function openUser(id: string) {
  detailId.value = id;
}
async function resolveReport(id: string, status: 'actioned' | 'dismissed', remove = false) { try { await api.admin.resolveReport(id, { status, removeContent: remove }); void load(); } catch (e) { err(e); } }
async function resolveFlag(id: string, status: 'resolved' | 'dismissed') { try { await api.admin.resolveFlag(id, status); void load(); } catch (e) { err(e); } }
async function generatePersonas() {
  const r = await formDialog({
    title: 'Generate new personas', icon: 'auto_awesome', confirmText: 'Generate',
    body: 'The AI invents new adult personas with their own bio, texting style and a generated profile picture. They start posting and chatting straight away.',
    fields: [
      { key: 'count', type: 'choices', label: 'How many', value: '1', options: ['1', '2', '3', '5'].map((v) => ({ value: v, label: v })) },
      { key: 'hint', type: 'textarea', label: 'Ideas (optional)', placeholder: 'e.g. a gamer from Manchester, a chef in Lagos', maxLength: 300 },
    ],
  });
  if (!r) return;
  try {
    await api.admin.generatePersonas({ count: Number(r.count), hint: String(r.hint ?? '') });
    ok('Generating… new personas appear here in a minute or two');
    setTimeout(() => void load(), 60_000);
    setTimeout(() => void load(), 120_000);
  } catch (e) { err(e); }
}
async function setPersona(id: string, b: { dmFrom?: 'everyone' | 'following' | 'nobody'; active?: boolean }) { try { await api.admin.updatePersona(id, b); void load(); } catch (e) { err(e); } }
async function refund(p: AdminPayment) {
  const stripe = p.provider === 'stripe';
  const body = stripe
    ? `${money(p.amountCents, p.currency)} goes back to their card through Stripe, and what they got is taken back.`
    : 'App Store and Google Play refunds are made in their consoles. This only takes back what they got.';
  if (!(await confirmDialog({ title: `Refund @${p.user.handle}?`, body, icon: 'currency_exchange', danger: true, confirmText: 'Refund' }))) return;
  try { const r = await api.admin.refund(p.id); ok(r.moneyBack ? 'Refunded through Stripe' : 'Credit taken back'); void load(); } catch (e) { err(e); }
}
async function findByHandle() {
  const h = await promptDialog({ title: 'Add staff member', label: 'Their @handle, name or email', icon: 'person_add', confirmText: 'Find' });
  if (!h) return;
  const r = await api.admin.users({ q: h.replace(/^@/, '') });
  if (!r.items.length) return err(new Error('Nobody matches that'));
  await openUser(r.items[0].id);
}
const money = (cents: number | null, cur: string | null) => (cents == null ? '—' : (cents / 100).toLocaleString(undefined, { style: 'currency', currency: (cur || 'usd').toUpperCase() }));
const product = (p: AdminPayment) => [p.gems ? `💎 ${p.gems.toLocaleString()} Gems` : '', p.premiumDays ? `👑 ${p.premiumDays} days Premium` : ''].filter(Boolean).join(' + ') || p.productId;
const payStatusColor = (st: string) => ({ completed: 'bg-online/15 text-green-700 dark:text-green-300', refunded: 'bg-surface-container text-on-surface-variant', pending: 'bg-yellow-400/20 text-yellow-800 dark:text-yellow-200', failed: 'bg-error/15 text-error' })[st] ?? '';
const statusColor = (st: string) => ({ active: 'bg-online/15 text-green-700 dark:text-green-300', muted: 'bg-yellow-400/20 text-yellow-800 dark:text-yellow-200', suspended: 'bg-orange-500/20 text-orange-800 dark:text-orange-200', banned: 'bg-error/15 text-error' })[st] ?? '';
const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label ?? r;
const INTEGRATION_LABELS: Record<string, string> = { database: 'Database', redis: 'Redis (optional)', sharedState: 'Shared state', smtp: 'Email (SMTP)', smtpServer: 'SMTP server', mailFrom: 'From address', mailError: 'Last email error', appUrl: 'Links in emails go to', stripe: 'Stripe', revenueCat: 'RevenueCat (in-app purchases)', nvidiaNim: 'NVIDIA NIM (AI)', safetyModel: 'AI safety model', turn: 'TURN server', s3: 'Object storage', songSearch: 'Song search', fullSongs: 'Full-length songs', pushIos: 'Push — iPhone', pushAndroid: 'Push — Android', pushWeb: 'Push — web browsers' };
</script>

<template>
  <div class="max-w-[1100px] mx-auto space-y-5">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-headline-xl flex items-center gap-2"><Icon name="admin_panel_settings" class="text-flame" /> Admin</h1>
      <span class="chip h-7 text-label-sm">{{ roleLabel(s.user?.role ?? 'user') }}</span>
    </div>
    <ScrollRow>
      <button v-for="x in TABS" :key="x[0]" class="chip" :class="{ 'chip-active': section === x[0] }" @click="router.push(`/admin/${x[0]}`)"><Icon :name="x[1]" :size="18" /> {{ x[2] }}</button>
    </ScrollRow>

    <!-- Overview -->
    <template v-if="section === 'overview' && overview">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="(v, k) in overview.counts" :key="k" class="card p-4"><p class="text-headline-lg tabular-nums">{{ v.toLocaleString() }}</p><p class="label">{{ String(k).replace(/([A-Z])/g, ' $1') }}</p></div>
      </div>
      <div class="grid md:grid-cols-2 gap-5">
        <section v-if="has('payments')" class="card p-5"><h2 class="text-headline-sm mb-3">Revenue (30 days)</h2>
          <p v-if="!overview.revenue30d.length" class="text-body-md text-on-surface-variant">No purchases yet.</p>
          <p v-for="r in overview.revenue30d" :key="r.currency" class="text-headline-md">{{ (r.cents / 100).toLocaleString(undefined, { style: 'currency', currency: (r.currency || 'usd').toUpperCase() }) }} <span class="text-body-sm text-on-surface-variant">{{ r.purchases }} purchases</span></p>
        </section>
        <section class="card p-5"><h2 class="text-headline-sm mb-1">Integrations</h2>
          <p class="text-body-sm text-on-surface-variant mb-3">Configured in <code>apps/server/.env</code> — secrets never reach the browser.</p>
          <div v-for="(v, k) in overview.integrations" :key="k" class="flex justify-between py-1 text-body-md"><span>{{ INTEGRATION_LABELS[k] ?? k }}</span>
            <span v-if="typeof v === 'boolean'" :class="v ? 'text-green-600' : 'text-error'">{{ v ? '✓ on' : '✗ not set' }}</span>
            <span v-else-if="v && typeof v === 'object'" class="text-error text-right max-w-[60%] break-words" :title="v.at">{{ v.error }}</span>
            <span v-else class="text-on-surface-variant truncate max-w-[55%]">{{ v ?? (k === 'mailError' ? '✓ none' : '—') }}</span></div>
          <MailTest />
          <TurnTest />
        </section>
      </div>
    </template>

    <AdminTournaments v-else-if="section === 'tournaments'" />
    <AdminAds v-else-if="section === 'ads'" />
    <AdminOversight v-else-if="section === 'oversight'" />
    <AdminFestivals v-else-if="section === 'festivals'" />

    <!-- Feature adoption -->
    <section v-else-if="section === 'features' && features" class="card p-5 space-y-3">
      <h2 class="text-headline-sm">Feature usage</h2>
      <p class="text-body-sm text-on-surface-variant">Every tracked feature: uses and how many different members used it in the last 7 and 30 days.</p>
      <table class="w-full text-body-sm"><thead><tr class="text-left text-on-surface-variant"><th class="py-1">Feature</th><th>Today</th><th>7 days</th><th>Members (7d)</th><th>30 days</th><th>Members (30d)</th></tr></thead>
        <tbody><tr v-for="f in features.month" :key="f.feature" class="border-t border-sandstone"><td class="py-1.5 font-semibold">{{ f.feature }}</td><td>{{ f.today }}</td><td>{{ features.week.find((w) => w.feature === f.feature)?.uses ?? 0 }}</td><td>{{ features.week.find((w) => w.feature === f.feature)?.users ?? 0 }}</td><td>{{ f.uses }}</td><td>{{ f.users }}</td></tr></tbody></table>
      <p v-if="!features.month.length" class="text-body-sm text-on-surface-variant">Nothing tracked yet.</p>
    </section>

    <!-- Arenas -->
    <section v-else-if="section === 'arenas' && arenaList" class="card p-5 space-y-3">
      <div class="flex items-center gap-3 flex-wrap"><h2 class="text-headline-sm flex-1">Game arenas</h2>
        <button v-if="has('staff')" class="chip" :class="{ 'chip-active': arenaList.gemsGold }" @click="toggleWagers">Gem & Gold stakes: {{ arenaList.gemsGold ? 'on' : 'off' }}</button></div>
      <div v-for="a in arenaList.items" :key="a.id" class="flex flex-wrap gap-x-3 text-body-sm py-1.5 border-b border-sandstone last:border-0">
        <b>{{ a.game }}</b><span>{{ a.name }}</span><span class="text-on-surface-variant">{{ a.status }} · {{ a.playerIds.length }} players · {{ a.stake.amount ? `${a.stake.amount} ${a.stake.currency}` : 'free' }}</span>
        <span v-if="a.payouts.length" class="text-on-surface-variant">paid: <button v-for="p in a.payouts" :key="p.userId" class="underline mr-1" @click="openUser(p.userId)">{{ p.amount }}</button></span>
        <span class="text-on-surface-variant ml-auto">{{ timeAgo(a.createdAt) }} ago</span>
      </div>
    </section>

    <!-- Level gates -->
    <section v-else-if="section === 'gates' && gates" class="card p-5 space-y-4 max-w-xl">
      <div><h2 class="text-headline-sm">Level gates</h2>
        <p class="text-body-sm text-on-surface-variant">The level members need before they can use each feature. Staff and anyone with an All-Access Pass skip them. Friends can always DM each other, and anyone can DM AI personas.</p></div>
      <label v-for="g in gates.gates" :key="g.key" class="flex items-center justify-between gap-3">
        <span class="text-body-md">{{ g.label }}</span>
        <input v-model.number="gates.values[g.key]" type="number" min="1" max="100" class="input w-24 h-10 text-center" />
      </label>
      <button class="btn-primary" @click="saveGates">Save</button>
    </section>

    <!-- Users -->
    <template v-else-if="section === 'users'">
      <div class="flex gap-2 flex-wrap">
        <input v-model="userQuery.q" class="input h-11 flex-1 min-w-[220px]" placeholder="Search name, @handle, email or id" />
        <select v-model="userQuery.status" class="input h-11 w-auto"><option value="">Any status</option><option v-for="x in ['active', 'muted', 'suspended', 'banned']" :key="x" :value="x">{{ x }}</option></select>
        <select v-model="userQuery.role" class="input h-11 w-auto"><option value="">Any role</option><option v-for="x in ['user', 'mod', 'admin']" :key="x" :value="x">{{ x }}</option></select>
      </div>
      <div class="card divide-y divide-sandstone">
        <button v-for="x in users" :key="x.id" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container-low" @click="openUser(x.id)">
          <Avatar :user="x" :size="40" />
          <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ x.displayName }} <span class="text-on-surface-variant font-medium">@{{ x.handle }}</span> <span v-if="x.isAI">✦</span> <span v-if="x.premiumUntil">👑</span> <span v-if="x.boostUntil" title="Boosted">🚀</span></p>
            <p class="text-body-sm text-on-surface-variant truncate">{{ x.email ?? '—' }} • joined {{ timeAgo(x.createdAt) }} ago • {{ x.strikes30d }} strikes • {{ x.reportsAgainst }} reports</p></div>
          <span class="rounded-full px-2.5 py-1 text-label-sm" :class="statusColor(x.standing.status)">{{ x.standing.status }}</span>
          <span v-if="x.role !== 'user'" class="chip h-7 text-label-sm">{{ roleLabel(x.role) }}</span>
        </button>
        <Empty v-if="!users.length" emoji="🔍" title="No users match" />
      </div>
    </template>

    <!-- Payments -->
    <template v-else-if="section === 'payments'">
      <div class="flex gap-2 flex-wrap">
        <input v-model="payQuery.user" class="input h-11 flex-1 min-w-[200px]" placeholder="Who paid? @handle, name or email" />
        <select v-model="payQuery.status" class="input h-11 w-auto"><option value="">Any status</option><option v-for="x in ['completed', 'refunded', 'pending', 'failed']" :key="x" :value="x">{{ x }}</option></select>
        <select v-model="payQuery.provider" class="input h-11 w-auto"><option value="">Any provider</option><option value="stripe">Stripe (web)</option><option value="app_store">App Store</option><option value="google_play">Google Play</option><option value="app_store_sandbox">App Store sandbox</option><option value="google_play_sandbox">Google Play sandbox</option></select>
        <select v-model="payQuery.days" class="input h-11 w-auto"><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="365">12 months</option><option value="">All time</option></select>
      </div>
      <template v-if="payments">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="tt in payments.totals" :key="tt.currency + tt.status" class="card p-4"><p class="text-headline-md tabular-nums">{{ money(tt.cents, tt.currency) }}</p><p class="label">{{ tt.status }} · {{ tt.count }} {{ tt.count === 1 ? 'payment' : 'payments' }}</p></div>
          <div v-if="!payments.totals.length" class="card p-4 col-span-2 md:col-span-4 text-body-md text-on-surface-variant">No payments in this range.</div>
        </div>
        <section v-if="payments.byProduct.length" class="card p-5"><h2 class="text-headline-sm mb-2">Best sellers</h2>
          <div v-for="b in payments.byProduct" :key="b.productId" class="flex justify-between py-1 text-body-md"><span>{{ b.productId }}</span><span class="tabular-nums text-on-surface-variant">{{ b.count }} × · {{ money(b.cents, null) }}</span></div></section>
        <div class="card overflow-x-auto">
          <table class="w-full text-body-md">
            <thead><tr class="text-left label"><th class="px-4 py-3">Who</th><th class="px-2">What</th><th class="px-2">Paid</th><th class="px-2">Via</th><th class="px-2">Status</th><th class="px-2">When</th><th /></tr></thead>
            <tbody>
              <tr v-for="p in payments.items" :key="p.id" class="border-t border-sandstone">
                <td class="px-4 py-2.5"><button class="flex items-center gap-2 text-left" @click="openUser(p.user.id)"><Avatar :user="p.user" :size="28" /><span class="font-bold">@{{ p.user.handle }}</span></button></td>
                <td class="px-2">{{ product(p) }}</td>
                <td class="px-2 tabular-nums font-bold">{{ money(p.amountCents, p.currency) }}</td>
                <td class="px-2 text-on-surface-variant">{{ p.provider.replace(/_/g, ' ') }}</td>
                <td class="px-2"><span class="rounded-full px-2 py-0.5 text-label-sm" :class="payStatusColor(p.status)">{{ p.status }}</span></td>
                <td class="px-2 text-on-surface-variant whitespace-nowrap" :title="new Date(p.createdAt).toLocaleString()">{{ timeAgo(p.createdAt) }} ago</td>
                <td class="px-3 text-right"><button v-if="p.status === 'completed'" class="btn-ghost h-8 text-error" @click="refund(p)">Refund</button></td>
              </tr>
            </tbody>
          </table>
          <Empty v-if="!payments.items.length" emoji="💳" title="No payments match" />
        </div>
      </template>
    </template>

    <!-- Staff -->
    <template v-else-if="section === 'staff'">
      <div class="flex items-center gap-3 flex-wrap">
        <p class="text-body-md text-on-surface-variant flex-1 min-w-[240px]">Admins can do everything. Moderators start with reports, warnings, mutes and suspensions — give anyone extra permissions from their card. You can only hand out permissions you have.</p>
        <button class="btn-primary" @click="findByHandle"><Icon name="person_add" /> Add staff member</button>
      </div>
      <div class="card divide-y divide-sandstone">
        <button v-for="x in staff" :key="x.id" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container-low" @click="openUser(x.id)">
          <Avatar :user="x" :size="40" />
          <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ x.displayName }} <span class="text-on-surface-variant font-medium">@{{ x.handle }}</span></p>
            <p class="text-body-sm text-on-surface-variant truncate">{{ x.role === 'admin' ? 'Everything' : x.allPerms.map((k) => PERMISSIONS.find((p) => p.key === k)?.label).join(' · ') }}</p></div>
          <span class="chip h-7 text-label-sm" :class="{ 'chip-active': x.role === 'admin' }">{{ roleLabel(x.role) }}</span>
        </button>
        <Empty v-if="!staff.length" emoji="🛡️" title="No staff yet" />
      </div>
    </template>

    <!-- Reports -->
    <template v-else-if="section === 'reports'">
      <div class="flex gap-2"><button v-for="x in (['open', 'closed', 'all'] as const)" :key="x" class="chip capitalize" :class="{ 'chip-active': reportStatus === x }" @click="reportStatus = x">{{ x }}</button></div>
      <div v-for="r in reports" :key="r.id" class="card p-4 space-y-2">
        <div class="flex items-center gap-2 flex-wrap text-body-sm"><span class="chip h-7 text-label-sm">{{ r.targetType }}</span><b>@{{ r.reporter.handle }}</b> reported <button v-if="r.target" class="font-bold text-primary" @click="openUser(r.target.id)">@{{ r.target.handle }}</button> • {{ timeAgo(r.createdAt) }} ago
          <span class="ml-auto rounded-full px-2 py-0.5 text-label-sm" :class="r.status === 'actioned' ? 'bg-online/15 text-green-700' : r.status === 'dismissed' ? 'bg-surface-container' : 'bg-yellow-400/20'">{{ r.status }}{{ r.resolvedBy === 'ai' ? ' by LOLShield' : '' }}</span></div>
        <p class="text-body-md"><b>Reason:</b> {{ r.reason }}</p>
        <p v-if="r.content" class="rounded-md bg-surface-container-low p-3 text-body-md" :class="{ 'line-through opacity-60': r.content.removed }">{{ r.content.text }}</p>
        <img v-if="r.content?.mediaUrl" :src="r.content.mediaUrl" alt="" class="max-h-48 rounded-md" />
        <div v-if="r.status === 'open' || r.status === 'reviewing'" class="flex gap-2 flex-wrap">
          <button v-if="r.targetType !== 'user'" class="btn-primary h-9" @click="resolveReport(r.id, 'actioned', true)">Remove content</button>
          <button v-if="r.target" class="btn-secondary h-9" @click="openUser(r.target.id)">Act on user</button>
          <button class="btn-ghost h-9" @click="resolveReport(r.id, 'dismissed')">Dismiss</button>
        </div>
      </div>
      <Empty v-if="!reports.length" emoji="🎉" title="No reports here" />
    </template>

    <!-- AI flags -->
    <template v-else-if="section === 'flags'">
      <p class="text-body-md text-on-surface-variant">LOLShield escalations: severe violations (already suspended) and repeat offenders it recommends terminating.</p>
      <div v-for="f in flags" :key="f.id" class="card p-4 space-y-2">
        <div class="flex items-center gap-2 text-body-sm flex-wrap"><span class="rounded-full px-2 py-0.5 text-label-sm" :class="f.priority === 'high' ? 'bg-error/15 text-error' : 'bg-surface-container'">{{ f.priority }}</span>
          <button class="font-bold text-primary" @click="openUser(f.user.id)">@{{ f.user.handle }}</button> • {{ f.category }} • {{ timeAgo(f.createdAt) }} ago</div>
        <p class="text-body-md font-bold">{{ f.reason }}</p>
        <p v-if="f.excerpt" class="rounded-md bg-surface-container-low p-3 text-body-md">{{ f.excerpt }}</p>
        <div class="flex gap-2"><button class="btn-primary h-9" @click="openUser(f.user.id)">Review user</button><button class="btn-ghost h-9" @click="resolveFlag(f.id, 'resolved')">Mark resolved</button><button class="btn-ghost h-9" @click="resolveFlag(f.id, 'dismissed')">Dismiss</button></div>
      </div>
      <Empty v-if="!flags.length" emoji="🛡️" title="Nothing flagged" />
    </template>

    <!-- Mod log -->
    <template v-else-if="section === 'modlog'">
      <div class="card divide-y divide-sandstone">
        <div v-for="e in modlog" :key="e.id" class="px-4 py-3 text-body-md flex items-center gap-3">
          <Avatar :user="e.user" :size="32" /><span class="flex-1 min-w-0"><b>{{ e.kind }}</b> @{{ e.user.handle }} — {{ e.reason }}<span v-if="e.until" class="text-on-surface-variant"> (until {{ new Date(e.until).toLocaleString() }})</span></span>
          <span class="text-body-sm text-on-surface-variant whitespace-nowrap">{{ e.by }} • {{ timeAgo(e.createdAt) }}</span>
        </div>
        <Empty v-if="!modlog.length" emoji="📜" title="No moderation actions yet" />
      </div>
    </template>

    <!-- Personas -->
    <template v-else-if="section === 'personas'">
      <div class="flex items-center gap-3 flex-wrap">
        <p class="text-body-md text-on-surface-variant flex-1 min-w-[200px]">Choose which AI personas accept DMs, or switch a persona off entirely.</p>
        <button class="btn-primary h-10" @click="generatePersonas"><Icon name="auto_awesome" /> Generate personas</button>
      </div>
      <div class="card divide-y divide-sandstone">
        <div v-for="p in personas" :key="p.id" class="flex items-center gap-3 px-4 py-3 flex-wrap">
          <img :src="p.avatarUrl" alt="" class="w-10 h-10 rounded-full object-cover" /><span class="flex-1 min-w-[140px]"><b>{{ p.displayName }}</b> <span class="text-on-surface-variant">@{{ p.handle }}</span><span v-if="p.generated" class="ml-2 rounded-full bg-surface-container-low px-2 py-0.5 text-label-sm">generated</span></span>
          <select :value="p.dmFrom" class="input h-10 w-auto" @change="setPersona(p.id, { dmFrom: ($event.target as HTMLSelectElement).value as 'everyone' })">
            <option value="everyone">DMs: everyone</option><option value="following">DMs: people it follows</option><option value="nobody">DMs: off</option></select>
          <button class="btn-ghost h-10" @click="setPersona(p.id, { active: !p.active })">{{ p.active ? 'Active ✓' : 'Switched off' }}</button>
        </div>
      </div>
    </template>

    <!-- User detail -->
    <Modal v-if="detailId" title="Member" wide @close="detailId = null">
      <div class="px-6 pb-6"><AdminUserPanel :user-id="detailId" @changed="load" @close="detailId = null" /></div>
    </Modal>
  </div>
</template>
