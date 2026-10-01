<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '../stores/session';
import Logo from '../components/Logo.vue';
import Icon from '../components/Icon.vue';

const s = useSession();
const router = useRouter();
const route = useRoute();
const login = ref('');
const password = ref('');
const show = ref(false);
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await s.login(login.value.trim(), password.value);
    router.replace((route.query.next as string) || '/');
  } catch (e) { error.value = (e as Error).message; } finally { busy.value = false; }
}
function demo() { login.value = 'demo@chatlol.app'; password.value = 'sunset123'; void submit(); }
</script>
<template>
  <div class="min-h-dvh grid lg:grid-cols-2">
    <div class="hidden lg:flex bg-sunset-v text-white p-14 flex-col justify-between relative overflow-hidden">
      <div class="absolute -right-24 -bottom-24 w-[520px] h-[520px] rounded-full bg-white/10" />
      <Logo variant="wordmark" on-color class="self-start" />
      <img src="/brand/mascot.webp" alt="" class="absolute right-12 top-24 w-60 drop-shadow-2xl animate-[wiggle_3s_ease-in-out_infinite]" />
      <div class="relative"><h1 class="text-[64px] leading-none font-extrabold tracking-tight">Welcome<br />back ✨</h1><p class="mt-4 text-body-lg opacity-90 max-w-sm">Your streak, your crew and today’s Sunset Drop are waiting.</p></div>
      <p class="text-body-sm opacity-80">🔥 12,480 drops posted today</p>
    </div>
    <div class="flex items-center justify-center p-6">
      <form class="w-full max-w-sm space-y-4" @submit.prevent="submit">
        <div class="lg:hidden mb-6"><Logo variant="wordmark" /></div>
        <h2 class="text-headline-xl">Log in</h2>
        <p class="text-body-md text-on-surface-variant">New here? <RouterLink to="/join" class="text-primary font-bold">Create an account</RouterLink></p>
        <input v-model="login" class="input" placeholder="Email or @handle" autocomplete="username" required />
        <div class="relative">
          <input v-model="password" :type="show ? 'text' : 'password'" class="input pr-14" placeholder="Password" autocomplete="current-password" required />
          <button type="button" class="btn-icon absolute right-1 top-1" :aria-label="show ? 'Hide password' : 'Show password'" @click="show = !show"><Icon :name="show ? 'visibility_off' : 'visibility'" /></button>
        </div>
        <div class="text-right -mt-1"><RouterLink to="/forgot" class="text-label-md text-primary">Forgot password?</RouterLink></div>
        <p v-if="error" class="text-error text-body-md">{{ error }}</p>
        <button class="btn-primary w-full h-[52px]" :disabled="busy">{{ busy ? 'Logging in…' : 'Log in' }}</button>
        <button type="button" class="btn-secondary w-full" @click="demo">Try the demo account</button>
      </form>
    </div>
  </div>
</template>
