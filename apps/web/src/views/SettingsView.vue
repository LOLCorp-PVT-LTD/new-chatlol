<script setup lang="ts">
import { promptDialog } from '../lib/dialog';
import { disableWebPush, enableWebPush, webPushState, type WebPushState } from '../lib/webPush';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { UserSettings } from '@chatlol/shared';
import { GENDERS } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { themeMode } from '../stores/theme';
import Icon from '../components/Icon.vue';
import Toggle from '../components/Toggle.vue';

const s = useSession();
const router = useRouter();
const saving = ref(false);
const u = computed(() => s.user!);

async function set<K extends keyof UserSettings>(k: K, v: UserSettings[K]) {
  s.user!.settings[k] = v;
  if (k === 'darkMode') themeMode.value = v as UserSettings['darkMode'];
  saving.value = true;
  try { s.applyUser((await api.updateSettings({ [k]: v })).user); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { saving.value = false; }
}
const toast = (title: string, kind: 'info' | 'error' = 'info') => s.toast({ kind, title });

// Account
const emailForm = ref({ email: '', password: '' });
const emailBusy = ref(false);
async function changeEmail() {
  emailBusy.value = true;
  try {
    s.applyUser((await api.changeEmail(emailForm.value.email.trim(), emailForm.value.password)).user);
    emailForm.value = { email: '', password: '' };
    toast('Email updated — check your inbox to verify it 📬');
  } catch (e) { toast((e as Error).message, 'error'); } finally { emailBusy.value = false; }
}
const pw = ref({ current: '', next: '' });
const pwBusy = ref(false);
async function changePassword() {
  pwBusy.value = true;
  try {
    await s.adoptSession((await api.changePassword(pw.value.current, pw.value.next)).token);
    pw.value = { current: '', next: '' };
    toast('Password changed — other devices were signed out 🔐');
  } catch (e) { toast((e as Error).message, 'error'); } finally { pwBusy.value = false; }
}
async function resend() {
  try { await api.resendVerification(); toast(`Verification link sent to ${u.value.email}`); } catch (e) { toast((e as Error).message, 'error'); }
}
async function setGender(g: 'male' | 'female') {
  try { s.applyUser((await api.updateProfile({ gender: g })).user); } catch (e) { toast((e as Error).message, 'error'); }
}

// ——— Web Push on this browser ———
const webPush = ref<WebPushState>('off');
const webPushBusy = ref(false);
const webPushHint = computed(() => ({
  on: 'You’ll get notifications here even when ChatLOL isn’t open.',
  off: 'Get notifications here even when ChatLOL isn’t open.',
  blocked: 'Blocked in your browser — allow notifications for this site in the address bar’s site settings, then reload.',
  unsupported: 'This browser can’t receive push notifications. On iPhone, add ChatLOL to your Home Screen first.',
})[webPush.value]);
void webPushState().then((st) => (webPush.value = st));
async function toggleWebPush(on: boolean) {
  webPushBusy.value = true;
  try { webPush.value = on ? await enableWebPush() : await disableWebPush(); } catch (e) { toast((e as Error).message, 'error'); } finally { webPushBusy.value = false; }
}

const notifyToggles: { k: keyof UserSettings; label: string; hint: string; icon: string }[] = [
  { k: 'pushEnabled', label: 'Push & desktop alerts', hint: 'Master switch for alerts outside the app', icon: 'notifications' },
  { k: 'notifyDms', label: 'Messages', hint: 'New DMs', icon: 'mail' },
  { k: 'notifyMentions', label: 'Mentions & shout replies', hint: 'When someone @mentions or replies to you', icon: 'alternate_email' },
  { k: 'notifyRatings', label: 'Ratings & profile views', hint: 'Photo ratings, profile ratings, who viewed you', icon: 'star' },
  { k: 'notifyComments', label: 'Comments & wall notes', hint: 'On your posts and your wall', icon: 'chat_bubble' },
  { k: 'notifyFollows', label: 'New followers', hint: 'And new friends', icon: 'person_add' },
  { k: 'notifyLive', label: 'Live streams', hint: 'When people you follow go live', icon: 'live_tv' },
  { k: 'notifyArena', label: 'Hot Take results', hint: 'Arena wins and losses', icon: 'swords' },
  { k: 'emailDigest', label: 'Weekly email digest', hint: 'A recap of your week', icon: 'forward_to_inbox' },
];
const privacyToggles: { k: keyof UserSettings; label: string; hint: string; icon: string }[] = [
  { k: 'showOnline', label: 'Show when I’m online', hint: 'Green dot on your avatar', icon: 'radio_button_checked' },
  { k: 'showGender', label: 'Show my gender', hint: 'On your profile and in member search', icon: 'wc' },
  { k: 'showCity', label: 'Show my city', hint: 'On your profile', icon: 'location_on' },
  { k: 'showInRoulette', label: 'Appear in Rate & Meet', hint: 'Let your photos show up in the rating deck', icon: 'casino' },
  { k: 'celebrateBirthday', label: 'Celebrate my birthday', hint: 'A birthday post + a heads-up to your followers on the day (shows your birthday, never your age)', icon: 'cake' },
  { k: 'ghostMode', label: 'Ghost mode in lounges', hint: 'Read lounges without showing up in “who’s here”', icon: 'visibility_off' },
  { k: 'showAIPersonas', label: 'Show AI personas', hint: 'Include ✦ AI personas in member search', icon: 'smart_toy' },
];
const expToggles: { k: keyof UserSettings; label: string; hint: string; icon: string }[] = [
  { k: 'autoplayMusic', label: 'Autoplay profile songs', hint: 'Play people’s songs when you open their profile', icon: 'music_note' },
  { k: 'soundEnabled', label: 'Sounds', hint: 'Reward chimes and match dings', icon: 'volume_up' },
  { k: 'hapticsEnabled', label: 'Haptics', hint: 'Vibration on supported devices', icon: 'vibration' },
  { k: 'reduceMotion', label: 'Reduce motion', hint: 'Fewer animations and confetti', icon: 'motion_photos_off' },
  { k: 'safeMode', label: 'SafeShield strict mode', hint: 'Hide posts the community flagged', icon: 'shield' },
];
const choice = <K extends keyof UserSettings>(k: K, options: [UserSettings[K], string][]) => ({ k, options });
const privacyChoices = [
  { title: 'Who can message me', ...choice('dmFrom', [['everyone', 'Everyone'], ['following', 'People I follow'], ['nobody', 'Nobody']]) },
  { title: 'Who can comment on my posts', ...choice('whoCanComment', [['everyone', 'Everyone'], ['following', 'People I follow']]) },
  { title: 'Who can post on my wall', ...choice('wallFrom', [['everyone', 'Everyone'], ['following', 'People I follow'], ['nobody', 'Nobody']]) },
  { title: 'Who can send me friend requests', ...choice('friendRequestsFrom', [['everyone', 'Everyone'], ['friends_of_friends', 'Friends of friends'], ['nobody', 'Nobody']]) },
  { title: 'Who can see my profile', ...choice('profileVisibility', [['everyone', 'Everyone'], ['members', 'Signed-in members']]) },
];
const standing = computed(() => u.value.moderation);

async function logout() { s.logout(); router.replace('/welcome'); }
async function remove() {
  const typed = await promptDialog({ title: 'Delete your account?', body: 'This is permanent: your posts, photos, streak, Sparks and Gems are gone for good. Type DELETE to confirm.', icon: 'delete_forever', danger: true, confirmText: 'Delete forever', placeholder: 'DELETE', required: true });
  if (typed?.trim().toUpperCase() !== 'DELETE') return;
  await api.deleteAccount();
  s.logout();
  router.replace('/welcome');
}
const SECTIONS = [['account', 'person', 'Account'], ['privacy', 'lock', 'Privacy'], ['notifications', 'notifications_active', 'Notifications'], ['appearance', 'palette', 'Appearance'], ['wellbeing', 'self_improvement', 'Wellbeing'], ['safety', 'verified_user', 'Safety'], ['danger', 'warning', 'Account actions']] as const;
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
</script>

<template>
  <div v-if="s.user" class="max-w-[960px] mx-auto grid lg:grid-cols-[220px_1fr] gap-6">
    <nav class="hidden lg:block sticky top-28 self-start card p-2" aria-label="Settings sections">
      <button v-for="x in SECTIONS" :key="x[0]" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-label-lg hover:bg-surface-container-low text-left" @click="go(x[0])"><Icon :name="x[1]" :size="20" class="text-flame" /> {{ x[2] }}</button>
    </nav>
    <div class="space-y-5 min-w-0">
      <h1 class="text-headline-xl">Settings <span v-if="saving" class="text-body-sm text-on-surface-variant">saving…</span></h1>

      <!-- Account -->
      <section id="account" class="card p-5 space-y-5 scroll-mt-28">
        <h2 class="text-headline-md flex items-center gap-2"><Icon name="person" class="text-flame" /> Account</h2>
        <div class="flex items-center gap-2 flex-wrap text-body-md"><b>Email:</b> {{ u.email }}
          <span v-if="u.emailVerified" class="text-label-sm bg-online/15 text-green-700 dark:text-green-300 rounded-full px-2 py-0.5">✓ verified</span>
          <button v-else class="text-label-sm text-primary underline" @click="resend">verify email</button></div>
        <form class="space-y-2" @submit.prevent="changeEmail">
          <p class="label">Change email</p>
          <input v-model="emailForm.email" type="email" class="input" placeholder="New email address" autocomplete="email" />
          <input v-model="emailForm.password" type="password" class="input" placeholder="Your password (to confirm)" autocomplete="current-password" />
          <button class="btn-secondary w-full" :disabled="emailBusy || !emailForm.email.includes('@') || !emailForm.password">Change email</button>
          <p class="text-body-sm text-on-surface-variant px-2">We’ll email the new address to verify it, and let your old address know it changed.</p>
        </form>
        <form class="space-y-2" @submit.prevent="changePassword">
          <p class="label">Change password</p>
          <input v-model="pw.current" type="password" class="input" placeholder="Current password" autocomplete="current-password" />
          <input v-model="pw.next" type="password" class="input" placeholder="New password (8+ characters)" autocomplete="new-password" minlength="8" />
          <button class="btn-secondary w-full" :disabled="pwBusy || !pw.current || pw.next.length < 8">Change password</button>
        </form>
        <div><p class="label mb-2">Gender</p>
          <div class="grid grid-cols-2 gap-2"><button v-for="g in GENDERS" :key="g.key" class="h-11 rounded-full border font-bold" :class="u.gender === g.key ? 'is-on' : 'border-sandstone'" @click="setGender(g.key)">{{ g.emoji }} {{ g.label }}</button></div></div>
        <div class="grid sm:grid-cols-2 gap-2">
          <RouterLink to="/locker" class="btn-ghost justify-start"><Icon name="palette" /> Customize profile, song & background</RouterLink>
          <RouterLink to="/premium" class="btn-ghost justify-start"><Icon name="workspace_premium" /> {{ u.premiumUntil ? `Premium until ${new Date(u.premiumUntil).toLocaleDateString()}` : 'Get Premium' }}</RouterLink>
          <RouterLink to="/vault?tab=gems" class="btn-ghost justify-start"><Icon name="receipt_long" /> Purchases & Gems</RouterLink>
          <RouterLink to="/insights" class="btn-ghost justify-start"><Icon name="visibility" /> Who viewed me</RouterLink>
        </div>
      </section>

      <!-- Privacy -->
      <section id="privacy" class="card scroll-mt-28">
        <h2 class="text-headline-md flex items-center gap-2 px-5 pt-5"><Icon name="lock" class="text-flame" /> Privacy</h2>
        <div class="px-5 py-4 space-y-4">
          <div v-for="c in privacyChoices" :key="c.k"><p class="label mb-2">{{ c.title }}</p>
            <div class="flex gap-2 flex-wrap"><button v-for="o in c.options" :key="String(o[0])" class="chip" :class="{ 'chip-active': u.settings[c.k] === o[0] }" @click="set(c.k, o[0] as never)">{{ o[1] }}</button></div></div>
        </div>
        <div class="divide-y divide-sandstone border-t border-sandstone">
          <Toggle v-for="t in privacyToggles" :key="t.k" :model-value="!!u.settings[t.k]" :label="t.label" :hint="t.hint" :icon="t.icon" @update:model-value="set(t.k, $event as never)" />
        </div>
      </section>

      <!-- Notifications -->
      <section id="notifications" class="card scroll-mt-28">
        <h2 class="text-headline-md flex items-center gap-2 px-5 pt-5 pb-2"><Icon name="notifications_active" class="text-flame" /> Notifications</h2>
        <!-- This browser: free Web Push straight from the browser -->
        <div class="mx-5 my-3 rounded-md bg-surface-container-low p-4 flex items-center gap-3 flex-wrap">
          <Icon name="web" class="text-flame" />
          <div class="flex-1 min-w-[200px]">
            <p class="text-label-lg">Notifications on this browser</p>
            <p class="text-body-sm text-on-surface-variant">{{ webPushHint }}</p>
          </div>
          <button v-if="webPush === 'off'" class="btn-primary h-10" :disabled="webPushBusy" @click="toggleWebPush(true)">Turn on</button>
          <button v-else-if="webPush === 'on'" class="btn-secondary h-10" :disabled="webPushBusy" @click="toggleWebPush(false)">Turn off</button>
        </div>
        <div class="divide-y divide-sandstone"><Toggle v-for="t in notifyToggles" :key="t.k" :model-value="!!u.settings[t.k]" :label="t.label" :hint="t.hint" :icon="t.icon" @update:model-value="set(t.k, $event as never)" /></div>
      </section>

      <!-- Appearance -->
      <section id="appearance" class="card scroll-mt-28">
        <h2 class="text-headline-md flex items-center gap-2 px-5 pt-5"><Icon name="palette" class="text-flame" /> Appearance & sound</h2>
        <div class="px-5 py-4"><p class="label mb-2">Theme</p>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="o in ([['light', '☀️', 'Light'], ['dark', '🌙', 'Dark'], ['system', '⚙️', 'System']] as const)" :key="o[0]" class="rounded-md border p-4 text-center transition" :class="u.settings.darkMode === o[0] ? 'border-flame ring-2 ring-flame/30 bg-sunlit' : 'border-sandstone'" @click="set('darkMode', o[0])">
              <span class="text-2xl block">{{ o[1] }}</span><span class="text-label-lg">{{ o[2] }}</span></button>
          </div></div>
        <div class="divide-y divide-sandstone border-t border-sandstone"><Toggle v-for="t in expToggles" :key="t.k" :model-value="!!u.settings[t.k]" :label="t.label" :hint="t.hint" :icon="t.icon" @update:model-value="set(t.k, $event as never)" /></div>
      </section>

      <!-- Wellbeing -->
      <section id="wellbeing" class="card p-5 scroll-mt-28">
        <h2 class="text-headline-md flex items-center gap-2 mb-3"><Icon name="self_improvement" class="text-flame" /> Wellbeing</h2>
        <p class="label mb-2">Take-a-break reminder</p>
        <div class="flex gap-2 flex-wrap"><button v-for="m in [0, 30, 60, 90, 120]" :key="m" class="chip" :class="{ 'chip-active': u.settings.breakReminderMins === m }" @click="set('breakReminderMins', m)">{{ m ? `Every ${m} min` : 'Off' }}</button></div>
      </section>

      <!-- Safety -->
      <section id="safety" class="card p-5 space-y-2 scroll-mt-28">
        <h2 class="text-headline-md flex items-center gap-2"><Icon name="verified_user" class="text-flame" /> Safety & account standing</h2>
        <p class="text-body-md">
          <template v-if="standing.status === 'active'">✅ Your account is in good standing.</template>
          <template v-else-if="standing.status === 'muted'">🔇 You’re muted until {{ new Date(standing.until!).toLocaleString() }} — you can read but not post. <span class="text-on-surface-variant">{{ standing.reason }}</span></template>
          <template v-else>⚠️ {{ standing.status }} — {{ standing.reason }}</template>
        </p>
        <p class="text-body-sm text-on-surface-variant">SafeShield AI screens posts, shouts, comments and messages 24/7. Harassment, threats and illegal activity lead to mutes, suspensions or termination. Block or report anyone from their profile.</p>
      </section>

      <section id="danger" class="card p-5 space-y-2 scroll-mt-28">
        <button class="btn-secondary w-full" @click="logout"><Icon name="logout" /> Log out</button>
        <button class="btn w-full text-error hover:bg-error-container" @click="remove"><Icon name="delete_forever" /> Delete account</button>
      </section>
    </div>
  </div>
</template>
