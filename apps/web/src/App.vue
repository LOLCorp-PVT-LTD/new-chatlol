<script setup lang="ts">
import DialogHost from './components/DialogHost.vue';
import Icon from './components/Icon.vue';
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';

// Invite links (?ref=CODE): remember the code until sign-up, whichever page they land on.
try {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref)) localStorage.setItem('chatlol.ref', ref);
} catch { /* storage blocked */ }
import type { Post } from '@chatlol/shared';
import { useSession } from './stores/session';
import TopBar from './components/TopBar.vue';
import RightRail from './components/RightRail.vue';
import TabBar from './components/TabBar.vue';
import Toasts from './components/Toasts.vue';
import ChatHeads from './components/ChatHeads.vue';
import LevelUp from './components/LevelUp.vue';
import Composer from './components/Composer.vue';
import Notifications from './components/Notifications.vue';
import Drawer from './components/Drawer.vue';
import Modal from './components/Modal.vue';
import VerifyBanner from './components/VerifyBanner.vue';
import { appTheme, themeMode } from './stores/theme';
import { COPYRIGHT } from '@chatlol/shared';
import CompanyText from './components/CompanyText.vue';
import { api } from './lib/api';

const route = useRoute();
const s = useSession();
const composing = ref(false);
const showNotifs = ref(false);
const drawer = ref(false);
const breakDue = ref(false);
const bare = computed(() => route.meta.layout === 'bare');
// The right rail is opt-in per page; everything else gets the full width (navigation lives in the ☰ drawer).
const rails = computed(() => route.meta.rails === true);
watch(() => route.fullPath, () => (drawer.value = false));
const posted = ref<Post | null>(null);
// Remount a view only when its route changes, not its params: /messages → /messages/:id keeps the inbox
// (and its loaded messages) mounted. Pages that show a different entity per param opt in with meta.remount.
const viewKey = computed(() => (route.meta.remount ? route.path : (route.matched[0]?.path ?? route.path)));

// Sync theme with account preference.
watch(() => s.user?.settings.darkMode, (m) => { if (m) themeMode.value = m; }, { immediate: true });
watch(() => s.user?.settings.appTheme, (t) => { if (t) appTheme.value = t; }, { immediate: true, deep: true });

// Optional "take a break" nudge (Settings → Wellbeing).
let breakTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => s.user?.settings.breakReminderMins, (mins) => {
  clearTimeout(breakTimer);
  if (mins) breakTimer = setTimeout(() => (breakDue.value = true), mins * 60_000);
}, { immediate: true });
onUnmounted(() => clearTimeout(breakTimer));

function onPosted(p: Post) { posted.value = p; }
async function acceptTerms() {
  try { s.applyUser((await api.acceptTerms()).user); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>

<template>
  <ChatHeads v-if="s.user && !route.path.startsWith('/messages')" />
  <Toasts />
  <DialogHost />
  <LevelUp />
  <RouterView v-if="bare" />
  <template v-else>
    <TopBar @menu="drawer = true" @compose="composing = true" @notifications="showNotifs = !showNotifs" />
    <div class="max-w-[1320px] mx-auto px-4 lg:px-10 py-5 lg:py-8 flex gap-6 pb-8 lg:pb-10">
      <main class="flex-1 min-w-0">
        <VerifyBanner />
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in"><component :is="Component" :key="viewKey" :new-post="posted" @compose="composing = true" /></Transition>
        </RouterView>
      </main>
      <RightRail v-if="rails" class="hidden xl:block sticky top-28 self-start" />
    </div>
    <footer class="max-w-[1320px] mx-auto px-4 lg:px-10 pb-36 lg:pb-10 flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm text-on-surface-variant">
      <p class="flex items-center gap-2"><img src="/brand/mascot.webp" alt="" class="h-6 w-auto" /> <span><CompanyText :text="COPYRIGHT" /></span></p>
      <nav class="flex flex-wrap justify-center gap-4" aria-label="Footer"><RouterLink to="/guidelines" class="hover:text-primary">Community Guidelines</RouterLink><RouterLink to="/safety" class="hover:text-primary">Safety</RouterLink><RouterLink to="/terms" class="hover:text-primary">Terms</RouterLink><RouterLink to="/privacy" class="hover:text-primary">Privacy</RouterLink><RouterLink to="/premium" class="hover:text-primary">Premium</RouterLink></nav>
    </footer>
    <!-- Updated Terms / Guidelines: members accept once per version. -->
    <div v-if="s.user && s.user.termsAccepted === false" class="fixed inset-x-0 bottom-24 lg:bottom-6 z-[80] px-4 flex justify-center">
      <div class="card p-4 max-w-[560px] w-full shadow-float flex flex-col sm:flex-row items-center gap-3">
        <p class="text-body-md flex-1">We’ve updated our <RouterLink to="/terms" class="underline">Terms</RouterLink> and <RouterLink to="/guidelines" class="underline">Community Guidelines</RouterLink>. Please take a look and accept to keep using ChatLOL.</p>
        <button class="btn-primary h-10 shrink-0" @click="acceptTerms">I accept</button>
      </div>
    </div>
    <TabBar @compose="composing = true" />
    <button v-if="s.user && route.path === '/feed'" class="lg:hidden fixed right-5 bottom-28 z-30 w-14 h-14 rounded-full bg-sunset text-white shadow-float flex items-center justify-center active:scale-95" aria-label="New post" @click="composing = true">
      <Icon name="add" />
    </button>
    <Composer v-if="composing" @close="composing = false" @posted="onPosted" />
    <Notifications v-if="showNotifs" @close="showNotifs = false" />
    <Drawer v-if="drawer" @close="drawer = false" />
    <Modal v-if="breakDue" @close="breakDue = false">
      <div class="p-8 text-center">
        <div class="text-6xl">🌇</div>
        <h2 class="text-headline-lg mt-3">Golden hour check-in</h2>
        <p class="text-body-lg text-on-surface-variant mt-2">You’ve been vibing for {{ s.user?.settings.breakReminderMins }} minutes. Stretch, hydrate, look at a real sunset — your streak will wait.</p>
        <button class="btn-primary w-full mt-6" @click="breakDue = false">Got it</button>
      </div>
    </Modal>
  </template>
</template>
