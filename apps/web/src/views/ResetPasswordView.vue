<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Logo from '../components/Logo.vue';

const route = useRoute();
const router = useRouter();
const s = useSession();
const pw = ref('');
const pw2 = ref('');
const busy = ref(false);
const error = ref('');
async function submit() {
  if (pw.value !== pw2.value) { error.value = 'Passwords don’t match'; return; }
  busy.value = true; error.value = '';
  try {
    const r = await api.resetPassword(String(route.query.token ?? ''), pw.value);
    await s.adoptSession(r.token);
    s.toast({ kind: 'info', title: 'Password updated — other devices were signed out 🔐' });
    router.replace('/');
  } catch (e) { error.value = (e as Error).message; } finally { busy.value = false; }
}
</script>
<template>
  <div class="min-h-dvh flex items-center justify-center p-5">
    <form class="card p-8 max-w-sm w-full space-y-4" @submit.prevent="submit">
      <Logo variant="wordmark" size="sm" />
      <h1 class="text-headline-lg">Choose a new password</h1>
      <input v-model="pw" type="password" class="input" placeholder="New password (8+ characters)" minlength="8" autocomplete="new-password" required />
      <input v-model="pw2" type="password" class="input" placeholder="Repeat it" minlength="8" autocomplete="new-password" required />
      <p v-if="error" class="text-error text-body-md">{{ error }}</p>
      <button class="btn-primary w-full" :disabled="busy || pw.length < 8">{{ busy ? 'Saving…' : 'Save & sign in' }}</button>
      <RouterLink to="/forgot" class="btn-ghost w-full">Need a new link?</RouterLink>
    </form>
  </div>
</template>
