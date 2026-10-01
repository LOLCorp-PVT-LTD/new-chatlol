<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Logo from '../components/Logo.vue';

const route = useRoute();
const s = useSession();
const state = ref<'working' | 'done' | 'error'>('working');
const error = ref('');
onMounted(async () => {
  try {
    await api.verifyEmail(String(route.query.token ?? ''));
    state.value = 'done';
    if (s.isAuthed) await s.refresh();
  } catch (e) { state.value = 'error'; error.value = (e as Error).message; }
});
</script>
<template>
  <div class="min-h-dvh flex items-center justify-center p-5">
    <div class="card p-8 max-w-sm w-full text-center space-y-3">
      <div class="flex justify-center"><Logo /></div>
      <template v-if="state === 'working'"><div class="text-5xl animate-pulse">✉️</div><p class="text-headline-sm">Verifying…</p></template>
      <template v-else-if="state === 'done'">
        <div class="text-5xl animate-pop">✅</div>
        <h1 class="text-headline-lg">Email verified!</h1>
        <p class="text-body-md text-on-surface-variant">+50 Sparks are in your wallet. You can now go live and buy Gems.</p>
        <RouterLink to="/" class="btn-primary w-full">Back to the vibe</RouterLink>
      </template>
      <template v-else>
        <div class="text-5xl">😕</div>
        <h1 class="text-headline-lg">Link didn’t work</h1>
        <p class="text-body-md text-on-surface-variant">{{ error }}</p>
        <RouterLink :to="s.isAuthed ? '/settings' : '/login'" class="btn-secondary w-full">{{ s.isAuthed ? 'Send a new link' : 'Log in' }}</RouterLink>
      </template>
    </div>
  </div>
</template>
