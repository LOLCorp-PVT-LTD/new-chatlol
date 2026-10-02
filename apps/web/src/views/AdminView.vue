<script setup lang="ts">
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
const detail = ref<Awaited2<ReturnType<Api['user']>> | null>(null);
const action = ref({ action: 'mute', minutes: 60, reason: '' });
const wallet = ref({ sparks: 0, gems: 0, reason: '' });
const storeItems = ref<Awaited2<ReturnType<Api['items']>>['items']>([]);
const itemKey = ref('');

const err = (e: unknown) => s.toast({ kind: 'error', title: (e as Error).message });
const ok = (title = 'Done ✅') => s.toast({ kind: 'info', title });
async function load() {
  try {
    if (section.value === 'overview') overview.value = await api.admin.overview();
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

async function openUser(id: string) {
  try {
    detail.value = await api.admin.user(id);
    action.value = { action: has('mute') ? 'mute' : 'ban', minutes: 60, reason: '' };
    wallet.value = { sparks: 0, gems: 0, reason: '' };
    if (has('items') && !storeItems.value.length) storeItems.value = (await api.admin.items()).items;
  } catch (e) { err(e); }
}
const refresh = async (u?: AdminUser) => { if (u && detail.value) detail.value = { ...detail.value, user: u }; else if (detail.value) await openUser(detail.value.user.id); void load(); };
async function run(fn: () => Promise<unknown>, msg?: string) { try { const r = (await fn()) as { user?: AdminUser } | undefined; await refresh(r?.user); ok(msg); } catch (e) { err(e); } }

async function act() {
  if (!detail.value) return;
  if (action.value.action === 'ban' && !(await confirmDialog({ title: `Ban @${detail.value.user.handle}?`, body: 'They won’t be able to sign in until unbanned.', icon: 'gavel', danger: true, confirmText: 'Ban' }))) return;
  const needsTime = ['mute', 'suspend'].includes(action.value.action);
  await run(() => api.admin.action(detail.value!.user.id, { action: action.value.action, reason: action.value.reason, minutes: needsTime ? action.value.minutes : undefined }));
}
async function terminate() {
  const u = detail.value!.user;
  const r = await formDialog({
    title: `Terminate @${u.handle}?`, icon: 'delete_forever', danger: true, confirmText: 'Terminate account',
    body: 'Closes the account for good: banned, personal data scrubbed, posts hidden, follows and friends removed. This can’t be undone.',
    fields: [{ key: 'reason', type: 'text', label: 'Reason (kept in the activity log)', required: true, maxLength: 300 }],
  });
  if (r) await run(() => api.admin.terminate(u.id, String(r.reason)), 'Account terminated');
}
async function setRole(role: 'user' | 'mod' | 'admin') {
  const u = detail.value!.user;
  if (role === 'admin' && !(await confirmDialog({ title: `Make @${u.handle} an admin?`, body: 'Admins can do everything, including making other admins.', icon: 'shield_person', confirmText: 'Make admin' }))) return;
  await run(() => api.admin.setRole(u.id, role));
}
const roleDefaults = computed(() => new Set<Permission>(detail.value ? ROLE_DEFAULTS[detail.value.user.role] : []));
async function togglePerm(p: Permission) {
  const u = detail.value!.user;
  const next = u.perms.includes(p) ? u.perms.filter((x) => x !== p) : [...u.perms, p];
  await run(() => api.admin.setPerms(u.id, next), 'Permissions saved');
}
async function sendWallet(sign: 1 | -1) {
  const w = wallet.value;
  if (!w.sparks && !w.gems) return err(new Error('Enter an amount'));
  await run(() => api.admin.wallet(detail.value!.user.id, { sparks: sign * Math.abs(w.sparks || 0), gems: sign * Math.abs(w.gems || 0), reason: w.reason }), sign > 0 ? 'Sent 🎁' : 'Taken away');
  wallet.value = { sparks: 0, gems: 0, reason: '' };
}
const grant = (days: number) => run(() => api.admin.grantPremium(detail.value!.user.id, days));
const boost = (hours: number) => run(() => api.admin.boost(detail.value!.user.id, hours), hours ? 'Boosted 🚀' : 'Boost ended');
async function giveItem() { if (itemKey.value) await run(() => api.admin.giveItem(detail.value!.user.id, itemKey.value), 'Item given 🎁'); }
async function removeItem(type: string, id: string) { try { await api.admin.removeContent(type, id); ok('Removed'); if (detail.value) await openUser(detail.value.user.id); } catch (e) { err(e); } }
async function resolveReport(id: string, status: 'actioned' | 'dismissed', remove = false) { try { await api.admin.resolveReport(id, { status, removeContent: remove }); void load(); } catch (e) { err(e); } }
async function resolveFlag(id: string, status: 'resolved' | 'dismissed') { try { await api.admin.resolveFlag(id, status); void load(); } catch (e) { err(e); } }
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
const DURATIONS = [[60, '1 hour'], [24 * 60, '1 day'], [3 * 24 * 60, '3 days'], [7 * 24 * 60, '7 days'], [30 * 24 * 60, '30 days']] as const;
const BOOSTS = [[1, '1 hour'], [24, '1 day'], [24 * 7, '7 days'], [24 * 30, '30 days']] as const;
const MOD_ACTIONS = computed(() => [
  ...(has('mute') ? ['warn', 'mute', 'suspend', 'unmute', 'unsuspend', 'strike_clear'] : []),
  ...(has('ban') ? ['ban', 'unban'] : []),
]);
const PERM_GROUPS = ['Moderation', 'Economy', 'Panel'] as const;
const INTEGRATION_LABELS: Record<string, string> = { database: 'Database', redis: 'Redis (optional)', sharedState: 'Shared state', smtp: 'Email (SMTP)', smtpServer: 'SMTP server', mailFrom: 'From address', stripe: 'Stripe', revenueCat: 'RevenueCat (in-app purchases)', nvidiaNim: 'NVIDIA NIM (AI)', safetyModel: 'AI safety model', turn: 'TURN server', s3: 'Object storage', songSearch: 'Song search', pushIos: 'Push — iPhone', pushAndroid: 'Push — Android', pushWeb: 'Push — web browsers' };
</script>

<template>
  <div class="max-w-[1100px] mx-auto space-y-5">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-headline-xl flex items-center gap-2"><Icon name="admin_panel_settings" class="text-flame" /> Admin</h1>
      <span class="chip h-7 text-label-sm">{{ roleLabel(s.user?.role ?? 'user') }}</span>
    </div>
    <div class="flex gap-2 overflow-x-auto scrollbar-none">
      <button v-for="x in TABS" :key="x[0]" class="chip" :class="{ 'chip-active': section === x[0] }" @click="router.push(`/admin/${x[0]}`)"><Icon :name="x[1]" :size="18" /> {{ x[2] }}</button>
    </div>

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
            <span v-if="typeof v === 'boolean'" :class="v ? 'text-green-600' : 'text-error'">{{ v ? '✓ on' : '✗ not set' }}</span><span v-else class="text-on-surface-variant truncate max-w-[55%]">{{ v ?? '—' }}</span></div>
        </section>
      </div>
    </template>

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
          <span class="ml-auto rounded-full px-2 py-0.5 text-label-sm" :class="r.status === 'actioned' ? 'bg-online/15 text-green-700' : r.status === 'dismissed' ? 'bg-surface-container' : 'bg-yellow-400/20'">{{ r.status }}{{ r.resolvedBy === 'ai' ? ' by SafeShield' : '' }}</span></div>
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
      <p class="text-body-md text-on-surface-variant">SafeShield escalations: severe violations (already suspended) and repeat offenders it recommends terminating.</p>
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
      <p class="text-body-md text-on-surface-variant">Choose which AI personas accept DMs, or switch a persona off entirely.</p>
      <div class="card divide-y divide-sandstone">
        <div v-for="p in personas" :key="p.id" class="flex items-center gap-3 px-4 py-3 flex-wrap">
          <img :src="p.avatarUrl" alt="" class="w-10 h-10 rounded-full object-cover" /><span class="flex-1 min-w-[140px]"><b>{{ p.displayName }}</b> <span class="text-on-surface-variant">@{{ p.handle }}</span></span>
          <select :value="p.dmFrom" class="input h-10 w-auto" @change="setPersona(p.id, { dmFrom: ($event.target as HTMLSelectElement).value as 'everyone' })">
            <option value="everyone">DMs: everyone</option><option value="following">DMs: people it follows</option><option value="nobody">DMs: off</option></select>
          <button class="btn-ghost h-10" @click="setPersona(p.id, { active: !p.active })">{{ p.active ? 'Active ✓' : 'Switched off' }}</button>
        </div>
      </div>
    </template>

    <!-- User detail -->
    <Modal v-if="detail" :title="`@${detail.user.handle}`" wide @close="detail = null">
      <div class="px-6 pb-6 space-y-5">
        <div class="flex items-center gap-4">
          <Avatar :user="detail.user" :size="64" />
          <div class="min-w-0 flex-1"><p class="text-headline-sm">{{ detail.user.displayName }} <span v-if="detail.user.isAI">✦ AI</span></p>
            <p class="text-body-sm text-on-surface-variant">{{ detail.user.email ?? 'no email' }} {{ detail.user.emailVerified ? '✓' : '' }} • {{ detail.user.gender ?? '—' }} • born {{ detail.user.birthdate }} • ⚡{{ detail.user.sparks }} 💎{{ detail.user.gems }}</p>
            <p class="text-body-sm mt-1"><span class="rounded-full px-2 py-0.5 text-label-sm" :class="statusColor(detail.user.standing.status)">{{ detail.user.standing.status }}</span>
              <template v-if="detail.user.standing.until"> until {{ new Date(detail.user.standing.until).toLocaleString() }}</template> • {{ detail.user.strikes30d }} strikes (30d) • role {{ detail.user.role }}
              <template v-if="detail.user.premiumUntil"> • 👑 until {{ new Date(detail.user.premiumUntil).toLocaleDateString() }}</template></p></div>
          <RouterLink :to="`/u/${detail.user.handle}`" class="btn-icon" aria-label="Open profile" @click="detail = null"><Icon name="open_in_new" /></RouterLink>
        </div>

        <p v-if="detail.user.deleted" class="rounded-md bg-error/10 text-error p-3 text-body-md">This account is closed.</p>

        <section v-if="MOD_ACTIONS.length && !detail.user.deleted" class="rounded-md bg-surface-container-low p-4 space-y-3">
          <p class="label">Moderation</p>
          <div class="flex gap-2 flex-wrap">
            <button v-for="a in MOD_ACTIONS" :key="a" class="chip h-8 text-label-sm" :class="{ 'chip-active': action.action === a }" @click="action.action = a">{{ a === 'strike_clear' ? 'clear strikes' : a }}</button>
          </div>
          <div v-if="action.action === 'mute' || action.action === 'suspend'" class="flex gap-2 flex-wrap">
            <button v-for="d in DURATIONS" :key="d[0]" class="chip h-8 text-label-sm" :class="{ 'chip-active': action.minutes === d[0] }" @click="action.minutes = d[0]">{{ d[1] }}</button>
          </div>
          <input v-model="action.reason" class="input h-11" placeholder="Reason (shown to the member)" maxlength="300" />
          <div class="flex gap-2 flex-wrap">
            <button class="btn-primary" :disabled="action.reason.trim().length < 3" @click="act">Apply</button>
            <button v-if="has('terminate') && !detail.user.isAI" class="btn-ghost text-error ml-auto" @click="terminate"><Icon name="delete_forever" /> Terminate account</button>
          </div>
        </section>

        <div v-if="!detail.user.deleted" class="grid md:grid-cols-2 gap-4">
          <section v-if="has('wallet')" class="rounded-md bg-surface-container-low p-4 space-y-2.5">
            <p class="label">Sparks & Gems <span class="normal-case font-normal text-on-surface-variant">· has ⚡{{ detail.user.sparks.toLocaleString() }} 💎{{ detail.user.gems.toLocaleString() }}</span></p>
            <div class="grid grid-cols-2 gap-2">
              <label class="text-body-sm">⚡ Sparks<input v-model.number="wallet.sparks" type="number" min="0" class="input h-10 mt-1" /></label>
              <label class="text-body-sm">💎 Gems<input v-model.number="wallet.gems" type="number" min="0" class="input h-10 mt-1" /></label>
            </div>
            <div class="flex gap-1.5 flex-wrap"><button v-for="n in [100, 1000, 10000]" :key="n" class="chip h-7 text-label-sm" @click="wallet.sparks = (wallet.sparks || 0) + n">+{{ n.toLocaleString() }} ⚡</button><button v-for="n in [50, 500]" :key="'g' + n" class="chip h-7 text-label-sm" @click="wallet.gems = (wallet.gems || 0) + n">+{{ n }} 💎</button></div>
            <input v-model="wallet.reason" class="input h-10" placeholder="Note (shown to them when giving)" maxlength="200" />
            <div class="flex gap-2"><button class="btn-primary h-10" @click="sendWallet(1)"><Icon name="redeem" :size="18" /> Give</button><button class="btn-ghost h-10 text-error" @click="sendWallet(-1)">Take away</button></div>
          </section>

          <section v-if="has('premium') || has('boost')" class="rounded-md bg-surface-container-low p-4 space-y-3">
            <div v-if="has('premium')"><p class="label mb-1.5">Premium <span v-if="detail.user.premiumUntil" class="normal-case font-normal text-on-surface-variant">· until {{ new Date(detail.user.premiumUntil).toLocaleDateString() }}</span></p>
              <div class="flex gap-1.5 flex-wrap"><button v-for="d in [7, 30, 365]" :key="d" class="chip h-8 text-label-sm" @click="grant(d)">+{{ d === 365 ? '1 year' : `${d} days` }}</button><button v-if="detail.user.premiumUntil" class="chip h-8 text-label-sm text-error" @click="grant(0)">Remove</button></div></div>
            <div v-if="has('boost')"><p class="label mb-1.5">Boost 🚀 <span v-if="detail.user.boostUntil" class="normal-case font-normal text-on-surface-variant">· until {{ new Date(detail.user.boostUntil).toLocaleString() }}</span></p>
              <p class="text-body-sm text-on-surface-variant mb-1.5">First in Browse Members, and shows up more in Rate & Meet.</p>
              <div class="flex gap-1.5 flex-wrap"><button v-for="b in BOOSTS" :key="b[0]" class="chip h-8 text-label-sm" @click="boost(b[0])">+{{ b[1] }}</button><button v-if="detail.user.boostUntil" class="chip h-8 text-label-sm text-error" @click="boost(0)">End boost</button></div></div>
          </section>

          <section v-if="has('items')" class="rounded-md bg-surface-container-low p-4 space-y-2">
            <p class="label">Give an item</p>
            <div class="flex gap-2"><select v-model="itemKey" class="input h-10 flex-1"><option value="" disabled>Pick a store item…</option><option v-for="it in storeItems" :key="it.key" :value="it.key">{{ it.emoji ?? '' }} {{ it.name }} · {{ it.kind }}</option></select>
              <button class="btn-primary h-10" :disabled="!itemKey" @click="giveItem">Give</button></div>
          </section>

          <section v-if="has('staff') && !detail.user.isAI" class="rounded-md bg-surface-container-low p-4 space-y-3 md:col-span-2">
            <div class="flex items-center gap-2 flex-wrap"><p class="label mr-1">Role</p>
              <button v-for="r in ROLES" :key="r.key" class="chip h-8 text-label-sm" :class="{ 'chip-active': detail.user.role === r.key }" :disabled="r.key === 'admin' && !isAdmin" @click="setRole(r.key)">{{ r.label }}</button></div>
            <div v-if="detail.user.role !== 'admin'">
              <p class="label mb-1.5">Permissions</p>
              <div class="grid sm:grid-cols-3 gap-3">
                <div v-for="g in PERM_GROUPS" :key="g"><p class="text-label-sm text-on-surface-variant mb-1">{{ g }}</p>
                  <label v-for="p in PERMISSIONS.filter((x) => x.group === g)" :key="p.key" class="flex items-start gap-2 py-1 text-body-sm" :class="{ 'opacity-50': !has(p.key) && !roleDefaults.has(p.key) }" :title="p.desc">
                    <input type="checkbox" class="mt-0.5 accent-flame" :checked="roleDefaults.has(p.key) || detail.user.perms.includes(p.key)" :disabled="roleDefaults.has(p.key) || !has(p.key)" @change="togglePerm(p.key)" />
                    <span>{{ p.label }}<span v-if="roleDefaults.has(p.key)" class="text-on-surface-variant"> · with role</span></span>
                  </label></div>
              </div>
            </div>
            <p v-else class="text-body-sm text-on-surface-variant">Admins have every permission.</p>
          </section>
        </div>

        <section><p class="label mb-2">History</p>
          <div v-for="e in detail.events" :key="e.id" class="text-body-sm py-1.5 border-b border-sandstone last:border-0"><b>{{ e.kind }}</b>{{ e.severe ? ' (severe)' : '' }} — {{ e.reason }} <span class="text-on-surface-variant">• {{ e.by }} • {{ timeAgo(e.createdAt) }} ago{{ e.cleared ? ' • cleared' : '' }}</span></div>
          <p v-if="!detail.events.length" class="text-body-sm text-on-surface-variant">Clean record.</p></section>

        <section><p class="label mb-2">Recent content</p>
          <div v-for="c in detail.recent" :key="c.type + c.id" class="flex items-start gap-2 py-1.5 border-b border-sandstone last:border-0 text-body-sm">
            <span class="chip h-6 text-[10px] shrink-0">{{ c.type }}</span><span class="flex-1 min-w-0 break-words" :class="{ 'line-through opacity-60': c.hidden }">{{ c.text || '(photo)' }}</span>
            <span class="text-on-surface-variant shrink-0">{{ timeAgo(c.createdAt) }}</span>
            <button v-if="!c.hidden" class="text-error font-bold shrink-0" @click="removeItem(c.type, c.id)">remove</button>
          </div></section>
      </div>
    </Modal>
  </div>
</template>
