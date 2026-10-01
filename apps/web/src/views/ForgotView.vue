<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../lib/api';
import Logo from '../components/Logo.vue';
import Icon from '../components/Icon.vue';

const email = ref('');
const sent = ref(false);
const busy = ref(false);
const error = ref('');
async function submit() {
  busy.value = true; error.value = '';
  try { await api.forgotPassword(email.value.trim()); sent.value = true; } catch (e) { error.value = (e as Error).message; } finally { busy.value = false; }
}
</script>
<template>
  <div class="min-h-dvh flex items-center justify-center p-5">
    <form class="card p-8 max-w-sm w-full space-y-4" @submit.prevent="submit">
      <Logo />
      <template v-if="!sent">
        <h1 class="text-headline-lg">Forgot your password?</h1>
        <p class="text-body-md text-on-surface-variant">Enter your email and we’ll send a reset link.</p>
        <input v-model="email" type="email" class="input" placeholder="Email" autocomplete="email" required />
        <p v-if="error" class="text-error text-body-md">{{ error }}</p>
        <button class="btn-primary w-full" :disabled="busy">{{ busy ? 'Sending…' : 'Send reset link' }}</button>
      </template>
      <template v-else>
        <div class="text-5xl">📬</div>
        <h1 class="text-headline-lg">Check your inbox</h1>
        <p class="text-body-md text-on-surface-variant">If an account exists for <b>{{ email }}</b>, a reset link is on its way. It expires in 1 hour.</p>
      </template>
      <RouterLink to="/login" class="btn-ghost w-full"><Icon name="arrow_back" /> Back to log in</RouterLink>
    </form>
  </div>
</template>
