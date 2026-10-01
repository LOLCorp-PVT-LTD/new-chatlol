<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { UserSettings } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { themeMode } from '../stores/theme';
import Icon from '../components/Icon.vue';

const s = useSession();
const router = useRouter();
const saving = ref(false);
const pw = ref({ current: '', next: '' });
const pwBusy = ref(false);
async function changePassword() {
  pwBusy.value = true;
  try {
    const r = await api.changePassword(pw.value.current, pw.value.next);
    await s.adoptSession(r.token);
    pw.value = { current: '', next: '' };
    s.toast({ kind: 'info', title: 'Password changed — other devices were signed out 🔐' });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { pwBusy.value = false; }
}
async function resend() {
  try { await api.resendVerification(); s.toast({ kind: 'info', title: `Verification link sent to ${s.user?.email}` }); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}

async function set<K extends keyof UserSettings>(k: K, v: UserSettings[K]) {
  if (!s.user) return;
  s.user.settings[k] = v;
  if (k === 'darkMode') themeMode.value = v as UserSettings['darkMode'];
  saving.value = true;
  try { s.applyUser((await api.updateSettings({ [k]: v })).user); } finally { saving.value = false; }
}
const toggles: { k: keyof UserSettings; label: string; hint: string; icon: string }[] = [
  { k: 'pushEnabled', label: 'Push notifications', hint: 'Ratings, DMs, gifts and invites', icon: 'notifications' },
  { k: 'showOnline', label: 'Show when I’m online', hint: 'Green dot on your avatar', icon: 'radio_button_checked' },
  { k: 'safeMode', label: 'SafeShield strict mode', hint: 'Hide posts flagged by the community', icon: 'shield' },
  { k: 'showAIPersonas', label: 'Show AI personas', hint: '✦ labeled AI members in directory & feeds', icon: 'smart_toy' },
  { k: 'soundEnabled', label: 'Sounds', hint: 'Reward chimes and match dings', icon: 'volume_up' },
  { k: 'hapticsEnabled', label: 'Haptics', hint: 'Vibration on supported devices', icon: 'vibration' },
];
async function logout() { s.logout(); router.replace('/welcome'); }
async function remove() {
  if (!confirm('Delete your account permanently? Your posts, streak and Sparks will be gone.')) return;
  await api.deleteAccount();
  s.logout();
  router.replace('/welcome');
}
</script>

<template>
  <div v-if="s.user" class="max-w-[640px] mx-auto space-y-5">
    <h1 class="text-headline-xl">Settings <span v-if="saving" class="text-body-sm text-on-surface-variant">saving…</span></h1>
    <section class="card divide-y divide-sandstone">
      <label v-for="t in toggles" :key="t.k" class="flex items-center gap-4 px-5 py-4 cursor-pointer">
        <span class="w-10 h-10 rounded-full bg-sunlit text-flame flex items-center justify-center"><Icon :name="t.icon" /></span>
        <span class="flex-1"><span class="text-label-lg block">{{ t.label }}</span><span class="text-body-sm text-on-surface-variant">{{ t.hint }}</span></span>
        <button role="switch" :aria-checked="!!s.user.settings[t.k]" class="relative w-[54px] h-8 rounded-full transition-colors" :class="s.user.settings[t.k] ? 'bg-flame' : 'bg-sandstone'"
          @click.prevent="set(t.k, !s.user.settings[t.k] as never)">
          <span class="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all" :class="s.user.settings[t.k] ? 'left-[26px]' : 'left-1'" />
        </button>
      </label>
    </section>
    <section class="card p-5 space-y-4">
      <div><p class="label mb-2">Who can DM me</p>
        <div class="flex gap-2"><button v-for="o in (['everyone', 'following', 'nobody'] as const)" :key="o" class="chip capitalize" :class="{ 'chip-active': s.user.settings.dmFrom === o }" @click="set('dmFrom', o)">{{ o === 'following' ? 'People who follow me' : o }}</button></div></div>
      <div><p class="label mb-2">Appearance</p>
        <div class="flex gap-2"><button v-for="o in (['system', 'light', 'dark'] as const)" :key="o" class="chip capitalize" :class="{ 'chip-active': s.user.settings.darkMode === o }" @click="set('darkMode', o)">{{ o === 'dark' ? '🌙 Midnight' : o === 'light' ? '☀️ Sunset' : '⚙️ System' }}</button></div></div>
      <div><p class="label mb-2">Wellbeing — take-a-break reminder</p>
        <div class="flex gap-2 flex-wrap"><button v-for="m in [0, 30, 60, 90]" :key="m" class="chip" :class="{ 'chip-active': s.user.settings.breakReminderMins === m }" @click="set('breakReminderMins', m)">{{ m ? `Every ${m} min` : 'Off' }}</button></div></div>
    </section>
    <section class="card p-5 space-y-3">
      <p class="label">Password</p>
      <form class="space-y-2" @submit.prevent="changePassword">
        <input v-model="pw.current" type="password" class="input" placeholder="Current password" autocomplete="current-password" />
        <input v-model="pw.next" type="password" class="input" placeholder="New password (8+ characters)" autocomplete="new-password" minlength="8" />
        <button class="btn-secondary w-full" :disabled="pwBusy || !pw.current || pw.next.length < 8">Change password</button>
      </form>
    </section>
    <section class="card p-5 space-y-2">
      <p class="text-body-md flex items-center gap-2"><b>Account:</b> {{ s.user.email }}
        <span v-if="s.user.emailVerified" class="text-label-sm bg-online/15 text-green-700 rounded-full px-2 py-0.5">✓ verified</span>
        <button v-else class="text-label-sm text-primary underline" @click="resend">verify email</button></p>
      <RouterLink to="/vault?tab=gems" class="btn-ghost w-full justify-start"><Icon name="receipt_long" /> Purchase history & Gems</RouterLink>
      <button class="btn-secondary w-full" @click="logout"><Icon name="logout" /> Log out</button>
      <button class="btn w-full text-error hover:bg-error-container" @click="remove"><Icon name="delete_forever" /> Delete account</button>
    </section>
  </div>
</template>
