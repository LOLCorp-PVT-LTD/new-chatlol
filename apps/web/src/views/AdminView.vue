<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AdminUser } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
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
const section = computed(() => (route.params.section as string) || 'overview');
const TABS = [['overview', 'dashboard', 'Overview'], ['users', 'group', 'Users'], ['reports', 'flag', 'Reports'], ['flags', 'smart_toy', 'AI flags'], ['modlog', 'history', 'Mod log'], ['personas', 'face', 'Personas']] as const;

const overview = ref<Awaited2<ReturnType<Api['overview']>> | null>(null);
const users = ref<AdminUser[]>([]);
const userQuery = ref({ q: '', status: '', role: '' });
const reports = ref<Awaited2<ReturnType<Api['reports']>>['items']>([]);
const reportStatus = ref<'open' | 'closed' | 'all'>('open');
const flags = ref<Awaited2<ReturnType<Api['flags']>>['items']>([]);
const modlog = ref<Awaited2<ReturnType<Api['modlog']>>['items']>([]);
const personas = ref<Awaited2<ReturnType<Api['personas']>>['items']>([]);
const detail = ref<Awaited2<ReturnType<Api['user']>> | null>(null);
const action = ref({ action: 'mute', minutes: 60, reason: '' });

const err = (e: unknown) => s.toast({ kind: 'error', title: (e as Error).message });
async function load() {
  try {
    if (section.value === 'overview') overview.value = await api.admin.overview();
    if (section.value === 'users') users.value = (await api.admin.users({ q: userQuery.value.q || undefined, status: userQuery.value.status || undefined, role: userQuery.value.role || undefined })).items;
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
watch(userQuery, () => { clearTimeout(t); t = setTimeout(load, 250); }, { deep: true });

async function openUser(id: string) { try { detail.value = await api.admin.user(id); action.value = { action: 'mute', minutes: 60, reason: '' }; } catch (e) { err(e); } }
async function act() {
  if (!detail.value) return;
  if (action.value.action === 'ban' && !confirm(`Terminate @${detail.value.user.handle}? They won’t be able to sign in.`)) return;
  try {
    const needsTime = ['mute', 'suspend'].includes(action.value.action);
    await api.admin.action(detail.value.user.id, { action: action.value.action, reason: action.value.reason, minutes: needsTime ? action.value.minutes : undefined });
    await openUser(detail.value.user.id);
    s.toast({ kind: 'info', title: 'Done ✅' });
    void load();
  } catch (e) { err(e); }
}
async function setRole(role: 'user' | 'mod' | 'admin') { try { await api.admin.setRole(detail.value!.user.id, role); await openUser(detail.value!.user.id); } catch (e) { err(e); } }
async function grant(days: number) { try { await api.admin.grantPremium(detail.value!.user.id, days); await openUser(detail.value!.user.id); } catch (e) { err(e); } }
async function removeItem(type: string, id: string) { try { await api.admin.removeContent(type, id); s.toast({ kind: 'info', title: 'Removed' }); if (detail.value) await openUser(detail.value.user.id); } catch (e) { err(e); } }
async function resolveReport(id: string, status: 'actioned' | 'dismissed', remove = false) { try { await api.admin.resolveReport(id, { status, removeContent: remove }); void load(); } catch (e) { err(e); } }
async function resolveFlag(id: string, status: 'resolved' | 'dismissed') { try { await api.admin.resolveFlag(id, status); void load(); } catch (e) { err(e); } }
async function setPersona(id: string, b: { dmFrom?: 'everyone' | 'following' | 'nobody'; active?: boolean }) { try { await api.admin.updatePersona(id, b); void load(); } catch (e) { err(e); } }
const statusColor = (st: string) => ({ active: 'bg-online/15 text-green-700 dark:text-green-300', muted: 'bg-yellow-400/20 text-yellow-800 dark:text-yellow-200', suspended: 'bg-orange-500/20 text-orange-800 dark:text-orange-200', banned: 'bg-error/15 text-error' })[st] ?? '';
const DURATIONS = [[60, '1 hour'], [24 * 60, '1 day'], [3 * 24 * 60, '3 days'], [7 * 24 * 60, '7 days'], [30 * 24 * 60, '30 days']] as const;
const INTEGRATION_LABELS: Record<string, string> = { database: 'Database', redis: 'Redis', smtp: 'Email (SMTP)', mailFrom: 'From address', stripe: 'Stripe', revenueCat: 'RevenueCat (in-app purchases)', nvidiaNim: 'NVIDIA NIM (AI)', safetyModel: 'AI safety model', turn: 'TURN server', s3: 'Object storage', spotifySearch: 'Spotify search', push: 'Expo push' };
</script>

<template>
  <div class="max-w-[1100px] mx-auto space-y-5">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-headline-xl flex items-center gap-2"><Icon name="admin_panel_settings" class="text-flame" /> Admin</h1>
      <span class="chip h-7 text-label-sm">{{ s.user?.role }}</span>
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
        <section class="card p-5"><h2 class="text-headline-sm mb-3">Revenue (30 days)</h2>
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
          <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ x.displayName }} <span class="text-on-surface-variant font-medium">@{{ x.handle }}</span> <span v-if="x.isAI">✦</span> <span v-if="x.premiumUntil">👑</span></p>
            <p class="text-body-sm text-on-surface-variant truncate">{{ x.email ?? '—' }} • joined {{ timeAgo(x.createdAt) }} ago • {{ x.strikes30d }} strikes • {{ x.reportsAgainst }} reports</p></div>
          <span class="rounded-full px-2.5 py-1 text-label-sm" :class="statusColor(x.standing.status)">{{ x.standing.status }}</span>
          <span v-if="x.role !== 'user'" class="chip h-7 text-label-sm">{{ x.role }}</span>
        </button>
        <Empty v-if="!users.length" emoji="🔍" title="No users match" />
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
          <select :value="p.dmFrom" class="input h-10 w-auto" :disabled="!isAdmin" @change="setPersona(p.id, { dmFrom: ($event.target as HTMLSelectElement).value as 'everyone' })">
            <option value="everyone">DMs: everyone</option><option value="following">DMs: people it follows</option><option value="nobody">DMs: off</option></select>
          <button class="btn-ghost h-10" :disabled="!isAdmin" @click="setPersona(p.id, { active: !p.active })">{{ p.active ? 'Active ✓' : 'Switched off' }}</button>
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

        <section class="rounded-md bg-surface-container-low p-4 space-y-3">
          <p class="label">Moderation action</p>
          <div class="flex gap-2 flex-wrap">
            <button v-for="a in ['warn', 'mute', 'suspend', 'ban', 'unmute', 'unsuspend', 'unban', 'strike_clear']" :key="a" class="chip h-8 text-label-sm" :class="{ 'chip-active': action.action === a }" :disabled="(a === 'ban' || a === 'unban') && !isAdmin" @click="action.action = a">{{ a === 'ban' ? 'ban / terminate' : a === 'strike_clear' ? 'clear strikes' : a }}</button>
          </div>
          <div v-if="action.action === 'mute' || action.action === 'suspend'" class="flex gap-2 flex-wrap">
            <button v-for="d in DURATIONS" :key="d[0]" class="chip h-8 text-label-sm" :class="{ 'chip-active': action.minutes === d[0] }" @click="action.minutes = d[0]">{{ d[1] }}</button>
          </div>
          <input v-model="action.reason" class="input h-11" placeholder="Reason (shown to the member)" maxlength="300" />
          <button class="btn-primary" :disabled="action.reason.trim().length < 3" @click="act">Apply</button>
        </section>

        <section v-if="isAdmin" class="flex gap-2 flex-wrap items-center">
          <span class="label">Role</span><button v-for="r in (['user', 'mod', 'admin'] as const)" :key="r" class="chip h-8 text-label-sm" :class="{ 'chip-active': detail.user.role === r }" @click="setRole(r)">{{ r }}</button>
          <span class="label ml-3">Premium</span><button class="chip h-8 text-label-sm" @click="grant(7)">+7 days</button><button class="chip h-8 text-label-sm" @click="grant(30)">+30 days</button><button class="chip h-8 text-label-sm" @click="grant(0)">remove</button>
        </section>

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
