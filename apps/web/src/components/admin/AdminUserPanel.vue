<script setup lang="ts">
import ScrollRow from '../ScrollRow.vue';
import { computed, ref, watch } from 'vue';
import type { AdminUser, Permission } from '@chatlol/shared';
import { PERMISSIONS, ROLE_DEFAULTS, ROLES, can, statusFor, timeAgo } from '@chatlol/shared';
import { api } from '../../lib/api';
import { useSession } from '../../stores/session';
import { confirmDialog, formDialog, promptDialog } from '../../lib/dialog';
import Avatar from '../Avatar.vue';
import Icon from '../Icon.vue';

/**
 * Everything about one member, split into tabs: profile (edit), content (incl. removed), reports, moderation,
 * wallet, Premium & boost, items, role & permissions and feature activity. Every action is logged server-side.
 */
type Detail = Awaited<ReturnType<typeof api.admin.user>>;
type Activity = Awaited<ReturnType<typeof api.admin.userActivity>>;
type Content = Awaited<ReturnType<typeof api.admin.userContent>>['items'];
type StoreItem = Awaited<ReturnType<typeof api.admin.items>>['items'][number];
const props = defineProps<{ userId: string }>();
const emit = defineEmits<{ (e: 'changed'): void; (e: 'close'): void }>();
const s = useSession();
const has = (p: Permission) => can(s.user, p);
const isAdmin = computed(() => s.user?.role === 'admin');

const detail = ref<Detail | null>(null);
const activity = ref<Activity | null>(null);
const content = ref<Content>([]);
const contentKind = ref<'posts' | 'photos' | 'shouts' | 'comments' | 'threads' | 'replies' | 'wall' | 'messages'>('posts');
const nextBefore = ref<string | null>(null);
const items = ref<StoreItem[]>([]);
const itemFilter = ref('all');
const u = computed(() => detail.value?.user as AdminUser | undefined);

const TABS = computed(() =>
  (
    [
      ['profile', 'person', 'Profile', null],
      ['content', 'photo_library', 'Content', 'reports'],
      ['reports', 'flag', 'Reports', null],
      ['moderation', 'gavel', 'Moderation', 'mute'],
      ['wallet', 'account_balance_wallet', 'Sparks & Gems', 'wallet'],
      ['premium', 'workspace_premium', 'Premium & boost', 'premium'],
      ['items', 'redeem', 'Items', 'items'],
      ['role', 'shield_person', 'Role', 'staff'],
      ['activity', 'monitoring', 'Activity', null],
    ] as const
  ).filter((t) => !t[3] || has(t[3] as Permission)),
);
const tab = ref<string>('profile');

const err = (e: unknown) => s.toast({ kind: 'error', title: (e as Error).message });
const ok = (title = 'Done ✅') => s.toast({ kind: 'info', title });
async function loadUser() {
  try { detail.value = await api.admin.user(props.userId); } catch (e) { err(e); }
}
async function run(fn: () => Promise<unknown>, msg?: string) {
  try { const r = (await fn()) as { user?: AdminUser }; if (r?.user && detail.value) detail.value = { ...detail.value, user: r.user }; else await loadUser(); ok(msg); emit('changed'); } catch (e) { err(e); }
}
watch(() => props.userId, loadUser, { immediate: true });
watch(tab, async (t) => {
  try {
    if (t === 'activity' && !activity.value) activity.value = await api.admin.userActivity(props.userId);
    if (t === 'content' && !content.value.length) await loadContent();
    if (t === 'items' && !items.value.length) items.value = (await api.admin.items()).items;
  } catch (e) { err(e); }
});

// ——— Profile ———
const edit = ref({ displayName: '', handle: '', bio: '', city: '' });
watch(u, (x) => x && (edit.value = { displayName: x.displayName, handle: x.handle, bio: x.bio, city: x.city }), { immediate: true });
async function saveProfile() {
  const x = u.value!;
  const b: Record<string, string> = {};
  for (const k of Object.keys(edit.value) as (keyof typeof edit.value)[]) if (edit.value[k] !== (x as unknown as Record<string, string>)[k]) b[k] = edit.value[k];
  if (!Object.keys(b).length) return ok('Nothing changed');
  const reason = await promptDialog({ title: 'Reason for the change', label: 'Kept in the activity log', required: false });
  if (reason === null) return;
  await run(() => api.admin.editProfile(x.id, { ...b, reason }), 'Profile saved');
}
async function removePart(part: 'removeAvatar' | 'removeCover' | 'removeBackground' | 'removeSong', label: string) {
  const reason = await promptDialog({ title: `Remove their ${label}?`, label: 'Reason (shown to them)', required: true, danger: true });
  if (reason) await run(() => api.admin.editProfile(u.value!.id, { [part]: true, reason }), `${label} removed`);
}

// ——— Content ———
async function loadContent(more = false) {
  const r = await api.admin.userContent(props.userId, contentKind.value, more ? (nextBefore.value ?? undefined) : undefined);
  content.value = more ? [...content.value, ...r.items] : r.items;
  nextBefore.value = r.nextBefore;
}
watch(contentKind, () => void loadContent().catch(err));
async function removeItem(c: Content[number]) {
  const r = await formDialog({
    title: `Remove this ${c.type}?`, danger: true, confirmText: 'Remove',
    body: 'It stays in place as “removed by Admin for <reason>”. The author is told and it goes on their record.',
    fields: [{ key: 'reason', type: 'text', label: 'Reason', required: true, maxLength: 200, suggestions: ['spam', 'harassment', 'nudity', 'hate speech', 'scam', 'copyright'] }],
  });
  if (!r) return;
  try { await api.admin.removeContent(c.type, c.id, String(r.reason)); ok('Removed'); await loadContent(); emit('changed'); } catch (e) { err(e); }
}

// ——— Moderation ———
const action = ref({ action: 'mute', minutes: 60, reason: '' });
const MOD_ACTIONS = computed(() => [...(has('mute') ? ['warn', 'mute', 'suspend', 'unmute', 'unsuspend', 'strike_clear'] : []), ...(has('ban') ? ['ban', 'unban'] : [])]);
const DURATIONS = [[60, '1 hour'], [24 * 60, '1 day'], [3 * 24 * 60, '3 days'], [7 * 24 * 60, '7 days'], [30 * 24 * 60, '30 days']] as const;
async function act() {
  if (action.value.action === 'ban' && !(await confirmDialog({ title: `Ban @${u.value!.handle}?`, body: 'They won’t be able to sign in until unbanned.', danger: true, confirmText: 'Ban' }))) return;
  const timed = ['mute', 'suspend'].includes(action.value.action);
  await run(() => api.admin.action(u.value!.id, { action: action.value.action, reason: action.value.reason, minutes: timed ? action.value.minutes : undefined }));
  action.value.reason = '';
}
async function terminate() {
  const r = await formDialog({
    title: `Terminate @${u.value!.handle}?`, danger: true, confirmText: 'Terminate account',
    body: 'Closes the account for good: banned, personal data scrubbed, posts hidden. This can’t be undone.',
    fields: [{ key: 'reason', type: 'text', label: 'Reason (kept in the activity log)', required: true, maxLength: 300 }],
  });
  if (r) await run(() => api.admin.terminate(u.value!.id, String(r.reason)), 'Account terminated');
}

// ——— Wallet / Premium / Items / Role ———
const wallet = ref({ sparks: 0, gems: 0, gold: 0, reason: '' });
async function sendWallet(sign: 1 | -1) {
  const w = wallet.value;
  if (!w.sparks && !w.gems && !w.gold) return err(new Error('Enter an amount'));
  await run(() => api.admin.wallet(u.value!.id, { sparks: sign * Math.abs(w.sparks || 0), gems: sign * Math.abs(w.gems || 0), gold: sign * Math.abs(w.gold || 0), reason: w.reason }), sign > 0 ? 'Sent 🎁' : 'Taken away');
  wallet.value = { sparks: 0, gems: 0, gold: 0, reason: '' };
}
const grant = (days: number) => run(() => api.admin.grantPremium(u.value!.id, days));
const boost = (hours: number) => run(() => api.admin.boost(u.value!.id, hours), hours ? 'Boosted 🚀' : 'Boost ended');
const ITEM_KINDS = computed(() => ['all', ...new Set(items.value.map((i) => i.kind))]);
const shownItems = computed(() => items.value.filter((i) => itemFilter.value === 'all' || i.kind === itemFilter.value));
async function give(it: StoreItem) {
  if (!(await confirmDialog({ title: `Give ${it.emoji ?? ''} ${it.name} to @${u.value!.handle}?`, confirmText: 'Give' }))) return;
  await run(() => api.admin.giveItem(u.value!.id, it.key), 'Item given 🎁');
}
const roleDefaults = computed(() => new Set<Permission>(u.value ? ROLE_DEFAULTS[u.value.role] : []));
async function setRole(role: 'user' | 'mod' | 'admin') {
  if (role === 'admin' && !(await confirmDialog({ title: `Make @${u.value!.handle} an admin?`, body: 'Admins can do everything.', confirmText: 'Make admin' }))) return;
  await run(() => api.admin.setRole(u.value!.id, role));
}
async function togglePerm(p: Permission) {
  const x = u.value!;
  await run(() => api.admin.setPerms(x.id, x.perms.includes(p) ? x.perms.filter((y) => y !== p) : [...x.perms, p]), 'Permissions saved');
}
const statusColor = (st: string) => ({ active: 'bg-online/15 text-green-700 dark:text-green-300', muted: 'bg-yellow-400/20 text-yellow-800 dark:text-yellow-200', suspended: 'bg-orange-500/20 text-orange-800 dark:text-orange-200', banned: 'bg-error/15 text-error' })[st] ?? '';
const FEATURE_LABEL: Record<string, string> = { post: 'Posts', shout: 'Shouts', comment: 'Comments', dm: 'DMs sent', reaction: 'Reactions', forum: 'Forum posts', live: 'Went live', checkin: 'Daily check-ins', power: 'Power-ups used', ticket: 'Tickets used', exchange: 'Currency exchanges', theme_unlock: 'Themes unlocked', arena_create: 'Arenas created', arena_play: 'Games played', king: 'Crowned King', store_buy: 'Vault purchases', username_change: 'Username changes', referral: 'Friends referred' };
</script>

<template>
  <div v-if="u && detail" class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <Avatar :user="u" :size="64" />
      <div class="min-w-0 flex-1">
        <p class="text-headline-sm truncate">{{ u.displayName }} <span v-if="u.isAI" class="text-label-sm">✦ AI</span></p>
        <p class="text-body-sm text-on-surface-variant truncate">@{{ u.handle }} · {{ u.email ?? 'no email' }} {{ u.emailVerified ? '✓' : '' }} · Lv {{ u.level }} {{ statusFor(u.level).emoji }} {{ statusFor(u.level).label }}</p>
        <p class="text-body-sm mt-1 flex flex-wrap gap-x-3 gap-y-1 items-center">
          <span class="rounded-full px-2 py-0.5 text-label-sm" :class="statusColor(u.standing.status)">{{ u.standing.status }}<template v-if="u.standing.until"> until {{ new Date(u.standing.until).toLocaleString() }}</template></span>
          <span>✦ {{ u.sparks.toLocaleString() }}</span><span>💎 {{ u.gems.toLocaleString() }}</span><span>🪙 {{ u.gold.toLocaleString() }}</span>
          <span v-if="u.premiumUntil">👑 until {{ new Date(u.premiumUntil).toLocaleDateString() }}</span>
          <span>{{ u.strikes30d }} strikes (30d)</span>
        </p>
      </div>
      <RouterLink :to="`/u/${u.handle}`" class="btn-icon" aria-label="Open profile" @click="emit('close')"><Icon name="open_in_new" /></RouterLink>
    </div>
    <p v-if="u.deleted" class="rounded-md bg-error/10 text-error p-3 text-body-md">This account is closed.</p>

    <ScrollRow class="border-b border-sandstone" inner-class="gap-1.5 -mx-1 px-1 pb-1">
      <button v-for="t in TABS" :key="t[0]" class="chip h-9 shrink-0" :class="{ 'chip-active': tab === t[0] }" @click="tab = t[0]"><Icon :name="t[1]" :size="16" /> {{ t[2] }}</button>
    </ScrollRow>

    <!-- Profile -->
    <section v-if="tab === 'profile'" class="space-y-3">
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="text-label-md">Display name<input v-model="edit.displayName" class="input h-10 mt-1" maxlength="40" :disabled="!has('profiles')" /></label>
        <label class="text-label-md">Username (@)<input v-model="edit.handle" class="input h-10 mt-1" maxlength="20" :disabled="!has('profiles')" /></label>
        <label class="text-label-md">City<input v-model="edit.city" class="input h-10 mt-1" maxlength="60" :disabled="!has('profiles')" /></label>
        <label class="text-label-md sm:col-span-2">Bio<textarea v-model="edit.bio" class="input min-h-[80px] mt-1 py-2" maxlength="280" :disabled="!has('profiles')" /></label>
      </div>
      <div v-if="has('profiles')" class="flex flex-wrap gap-2">
        <button class="btn-primary h-10" @click="saveProfile">Save changes</button>
        <button class="btn-ghost h-10 text-error" @click="removePart('removeAvatar', 'profile picture')">Remove picture</button>
        <button class="btn-ghost h-10 text-error" @click="removePart('removeCover', 'cover')">Remove cover</button>
        <button class="btn-ghost h-10 text-error" @click="removePart('removeBackground', 'background')">Reset background</button>
        <button class="btn-ghost h-10 text-error" @click="removePart('removeSong', 'profile song')">Remove song</button>
      </div>
      <p class="text-body-sm text-on-surface-variant">Born {{ u.birthdate }} · {{ u.gender ?? '—' }} · joined {{ new Date(u.createdAt).toLocaleDateString() }} · last seen {{ timeAgo(u.lastSeenAt) }} ago</p>
    </section>

    <!-- Content -->
    <section v-else-if="tab === 'content'" class="space-y-3">
      <div class="flex gap-1.5 flex-wrap"><button v-for="k in (['posts', 'photos', 'shouts', 'comments', 'threads', 'replies', 'wall', 'messages'] as const)" :key="k" class="chip h-8 text-label-sm capitalize" :class="{ 'chip-active': contentKind === k }" @click="contentKind = k">{{ k }}</button></div>
      <div :class="contentKind === 'photos' ? 'grid grid-cols-3 sm:grid-cols-4 gap-2' : 'space-y-1'">
        <div v-for="c in content" :key="c.id" :class="contentKind === 'photos' ? 'relative rounded-md overflow-hidden aspect-square bg-surface-container-low' : 'flex items-start gap-2 py-2 border-b border-sandstone last:border-0 text-body-sm'">
          <template v-if="contentKind === 'photos'">
            <img v-if="c.mediaUrl" :src="c.mediaUrl" class="w-full h-full object-cover" :class="{ 'opacity-40 grayscale': c.removed || c.hidden }" alt="" loading="lazy" />
            <button v-if="!c.removed" class="absolute top-1 right-1 btn-icon w-8 h-8 bg-black/60 text-white" aria-label="Remove photo" @click="removeItem(c)"><Icon name="delete" :size="16" /></button>
            <span v-else class="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[10px] p-1">Removed: {{ c.removed.reason }}</span>
          </template>
          <template v-else>
            <img v-if="c.mediaUrl" :src="c.mediaUrl" class="w-12 h-12 rounded object-cover shrink-0" alt="" loading="lazy" />
            <div class="flex-1 min-w-0">
              <p class="break-words" :class="{ 'line-through opacity-60': c.removed || c.hidden }"><b v-if="c.title">{{ c.title }} — </b>{{ c.text || '(no text)' }}</p>
              <p class="text-label-sm text-on-surface-variant">{{ timeAgo(c.createdAt) }} ago<template v-if="c.removed"> · removed by {{ c.removed.by }}: {{ c.removed.reason }}</template><template v-else-if="c.hidden"> · hidden</template></p>
            </div>
            <button v-if="!c.removed" class="btn-ghost h-8 px-3 text-error shrink-0" @click="removeItem(c)">Remove</button>
          </template>
        </div>
      </div>
      <p v-if="!content.length" class="text-body-sm text-on-surface-variant">Nothing here.</p>
      <button v-if="nextBefore" class="btn-secondary h-9" @click="loadContent(true)">Load more</button>
    </section>

    <!-- Reports -->
    <section v-else-if="tab === 'reports'" class="grid md:grid-cols-2 gap-4">
      <div v-for="side in [true, false]" :key="String(side)">
        <p class="label mb-2">{{ side ? 'Reports against them' : 'Reports they made' }}</p>
        <div v-for="r in detail.reports.filter((x) => x.against === side)" :key="r.id" class="text-body-sm py-2 border-b border-sandstone last:border-0">
          <span class="chip h-6 text-[10px]">{{ r.targetType }}</span> {{ r.reason }} <span class="text-on-surface-variant">· {{ r.status }} · {{ timeAgo(r.createdAt) }} ago</span>
        </div>
        <p v-if="!detail.reports.some((x) => x.against === side)" class="text-body-sm text-on-surface-variant">None.</p>
      </div>
    </section>

    <!-- Moderation -->
    <section v-else-if="tab === 'moderation'" class="space-y-4">
      <div v-if="!u.deleted" class="rounded-md bg-surface-container-low p-4 space-y-3">
        <div class="flex gap-2 flex-wrap"><button v-for="a in MOD_ACTIONS" :key="a" class="chip h-8 text-label-sm" :class="{ 'chip-active': action.action === a }" @click="action.action = a">{{ a === 'strike_clear' ? 'clear strikes' : a }}</button></div>
        <div v-if="action.action === 'mute' || action.action === 'suspend'" class="flex gap-2 flex-wrap"><button v-for="d in DURATIONS" :key="d[0]" class="chip h-8 text-label-sm" :class="{ 'chip-active': action.minutes === d[0] }" @click="action.minutes = d[0]">{{ d[1] }}</button></div>
        <input v-model="action.reason" class="input h-11" placeholder="Reason (shown to the member)" maxlength="300" />
        <div class="flex gap-2 flex-wrap">
          <button class="btn-primary" :disabled="action.reason.trim().length < 3" @click="act">Apply</button>
          <button v-if="has('terminate') && !u.isAI" class="btn-ghost text-error ml-auto" @click="terminate"><Icon name="delete_forever" /> Terminate account</button>
        </div>
      </div>
      <div><p class="label mb-2">Record</p>
        <div v-for="e in detail.events" :key="e.id" class="text-body-sm py-1.5 border-b border-sandstone last:border-0"><b>{{ e.kind }}</b>{{ e.severe ? ' (severe)' : '' }} — {{ e.reason }} <span class="text-on-surface-variant">· {{ e.by }} · {{ timeAgo(e.createdAt) }} ago{{ e.cleared ? ' · cleared' : '' }}</span></div>
        <p v-if="!detail.events.length" class="text-body-sm text-on-surface-variant">Clean record.</p>
      </div>
    </section>

    <!-- Wallet -->
    <section v-else-if="tab === 'wallet'" class="rounded-md bg-surface-container-low p-4 space-y-3 max-w-xl">
      <div class="grid grid-cols-3 gap-2">
        <label class="text-body-sm">✦ Sparks<input v-model.number="wallet.sparks" type="number" min="0" class="input h-10 mt-1" /></label>
        <label class="text-body-sm">💎 Gems<input v-model.number="wallet.gems" type="number" min="0" class="input h-10 mt-1" /></label>
        <label class="text-body-sm">🪙 Gold<input v-model.number="wallet.gold" type="number" min="0" class="input h-10 mt-1" /></label>
      </div>
      <div class="flex gap-1.5 flex-wrap">
        <button v-for="n in [100, 1000, 10000]" :key="n" class="chip h-7 text-label-sm" @click="wallet.sparks = (wallet.sparks || 0) + n">+{{ n.toLocaleString() }} ✦</button>
        <button v-for="n in [50, 500]" :key="'g' + n" class="chip h-7 text-label-sm" @click="wallet.gems = (wallet.gems || 0) + n">+{{ n }} 💎</button>
        <button v-for="n in [1, 10, 100]" :key="'o' + n" class="chip h-7 text-label-sm" @click="wallet.gold = (wallet.gold || 0) + n">+{{ n }} 🪙</button>
      </div>
      <input v-model="wallet.reason" class="input h-10" placeholder="Note (shown to them when giving)" maxlength="200" />
      <div class="flex gap-2"><button class="btn-primary h-10" @click="sendWallet(1)"><Icon name="redeem" :size="18" /> Give</button><button class="btn-ghost h-10 text-error" @click="sendWallet(-1)">Take away</button></div>
    </section>

    <!-- Premium & boost -->
    <section v-else-if="tab === 'premium'" class="space-y-4">
      <div><p class="label mb-1.5">Premium <span v-if="u.premiumUntil" class="normal-case font-normal text-on-surface-variant">· until {{ new Date(u.premiumUntil).toLocaleDateString() }}</span></p>
        <div class="flex gap-1.5 flex-wrap"><button v-for="d in [1, 7, 30, 365]" :key="d" class="chip h-8 text-label-sm" @click="grant(d)">+{{ d === 365 ? '1 year' : d === 1 ? '1 day' : `${d} days` }}</button><button v-if="u.premiumUntil" class="chip h-8 text-label-sm text-error" @click="grant(0)">Remove</button></div></div>
      <div v-if="has('boost')"><p class="label mb-1.5">Boost 🚀 <span v-if="u.boostUntil" class="normal-case font-normal text-on-surface-variant">· until {{ new Date(u.boostUntil).toLocaleString() }}</span></p>
        <div class="flex gap-1.5 flex-wrap"><button v-for="b in ([[1, '1 hour'], [24, '1 day'], [168, '7 days'], [720, '30 days']] as const)" :key="b[0]" class="chip h-8 text-label-sm" @click="boost(b[0])">+{{ b[1] }}</button><button v-if="u.boostUntil" class="chip h-8 text-label-sm text-error" @click="boost(0)">End boost</button></div></div>
    </section>

    <!-- Items -->
    <section v-else-if="tab === 'items'" class="space-y-3">
      <div class="flex gap-1.5 flex-wrap"><button v-for="k in ITEM_KINDS" :key="k" class="chip h-8 text-label-sm capitalize" :class="{ 'chip-active': itemFilter === k }" @click="itemFilter = k">{{ k }}</button></div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <button v-for="it in shownItems" :key="it.key" class="card overflow-hidden text-left hover:shadow-pop transition" @click="give(it)">
          <div class="h-20 flex items-center justify-center text-4xl" :style="{ background: it.preview ?? undefined }">{{ it.emoji }}</div>
          <div class="p-2"><p class="text-label-md truncate">{{ it.name }}</p><p class="text-[11px] text-on-surface-variant">{{ it.kind }} · {{ it.goldPrice ? `🪙 ${it.goldPrice}` : `✦ ${it.price}` }}</p></div>
        </button>
      </div>
    </section>

    <!-- Role -->
    <section v-else-if="tab === 'role' && !u.isAI" class="space-y-3">
      <div class="flex items-center gap-2 flex-wrap"><p class="label mr-1">Role</p><button v-for="r in ROLES" :key="r.key" class="chip h-8 text-label-sm" :class="{ 'chip-active': u.role === r.key }" :disabled="r.key === 'admin' && !isAdmin" @click="setRole(r.key)">{{ r.label }}</button></div>
      <div v-if="u.role !== 'admin'" class="grid sm:grid-cols-3 gap-3">
        <div v-for="g in ['Moderation', 'Economy', 'Panel']" :key="g"><p class="text-label-sm text-on-surface-variant mb-1">{{ g }}</p>
          <label v-for="p in PERMISSIONS.filter((x) => x.group === g)" :key="p.key" class="flex items-start gap-2 py-1 text-body-sm" :title="p.desc">
            <input type="checkbox" class="mt-0.5 accent-flame" :checked="roleDefaults.has(p.key) || u.perms.includes(p.key)" :disabled="roleDefaults.has(p.key) || !has(p.key)" @change="togglePerm(p.key)" />
            <span>{{ p.label }}<span v-if="roleDefaults.has(p.key)" class="text-on-surface-variant"> · with role</span></span>
          </label></div>
      </div>
      <p v-else class="text-body-sm text-on-surface-variant">Admins have every permission.</p>
    </section>

    <!-- Activity -->
    <section v-else-if="tab === 'activity'" class="space-y-4">
      <p v-if="!activity" class="text-body-sm text-on-surface-variant">Loading…</p>
      <template v-else>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div class="rounded-md bg-surface-container-low p-3"><p class="text-headline-sm">{{ activity.progression.level }}</p><p class="label">Level</p></div>
          <div class="rounded-md bg-surface-container-low p-3"><p class="text-headline-sm">{{ activity.progression.loginStreak }}🔥</p><p class="label">Check-in streak</p></div>
          <div class="rounded-md bg-surface-container-low p-3"><p class="text-headline-sm">{{ activity.progression.gameStats.wins }}/{{ activity.progression.gameStats.played }}</p><p class="label">Games won</p></div>
          <div class="rounded-md bg-surface-container-low p-3"><p class="text-headline-sm">{{ Object.keys(activity.progression.powers).length }}</p><p class="label">Power-ups running</p></div>
        </div>
        <div><p class="label mb-2">Features used</p>
          <div v-for="f in activity.features" :key="f.feature" class="flex justify-between text-body-sm py-1.5 border-b border-sandstone last:border-0"><span>{{ FEATURE_LABEL[f.feature] ?? f.feature }}</span><span class="text-on-surface-variant">{{ f.total.toLocaleString() }} · {{ f.days }} days · last {{ f.last }}</span></div>
          <p v-if="!activity.features.length" class="text-body-sm text-on-surface-variant">No tracked activity yet.</p></div>
        <div class="grid md:grid-cols-2 gap-4">
          <div><p class="label mb-2">Inventory</p>
            <div v-for="i in activity.inventory" :key="i.key" class="text-body-sm py-1 flex justify-between"><span>{{ i.emoji }} {{ i.name }} ×{{ i.qty }}</span><span class="text-on-surface-variant">{{ i.via ?? '—' }}</span></div>
            <p v-if="!activity.inventory.length" class="text-body-sm text-on-surface-variant">Empty.</p></div>
          <div><p class="label mb-2">Games</p>
            <div v-for="a in activity.arenas" :key="a.id" class="text-body-sm py-1 flex justify-between"><span>{{ a.game }} · {{ a.name }}</span><span class="text-on-surface-variant">{{ a.stake.amount ? `${a.stake.amount} ${a.stake.currency}` : 'free' }}<template v-if="a.payout"> · won {{ a.payout }}</template> · {{ a.status }}</span></div>
            <p v-if="!activity.arenas.length" class="text-body-sm text-on-surface-variant">No games.</p></div>
          <div><p class="label mb-2">Tickets used on them</p>
            <div v-for="(t, k) in activity.tickets.against" :key="k" class="text-body-sm py-1">{{ t.kind }} — {{ t.reason }} <span class="text-on-surface-variant">· {{ timeAgo(t.at) }} ago</span></div>
            <p v-if="!activity.tickets.against.length" class="text-body-sm text-on-surface-variant">None.</p></div>
          <div><p class="label mb-2">Tickets they used</p>
            <div v-for="(t, k) in activity.tickets.used" :key="k" class="text-body-sm py-1">{{ t.kind }} <span class="text-on-surface-variant">· {{ timeAgo(t.at) }} ago</span></div>
            <p v-if="!activity.tickets.used.length" class="text-body-sm text-on-surface-variant">None.</p></div>
        </div>
        <p v-if="activity.progression.handleHistory.length" class="text-body-sm text-on-surface-variant">Previous usernames: {{ activity.progression.handleHistory.map((h) => '@' + h.from).join(', ') }}</p>
      </template>
    </section>
  </div>
</template>
