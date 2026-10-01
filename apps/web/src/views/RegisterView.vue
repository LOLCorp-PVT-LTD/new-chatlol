<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ageFrom, MIN_AGE } from '@chatlol/shared';
import { useSession } from '../stores/session';
import Logo from '../components/Logo.vue';
import Icon from '../components/Icon.vue';

const INTERESTS = ['photography', 'music', 'lofi', 'gaming', 'fashion', 'thrifted', 'food', 'fitness', 'travel', 'art', 'tech', 'books', 'skate', 'anime', 'movies', 'sports'];
const s = useSession();
const router = useRouter();
const step = ref(1);
const f = ref({ displayName: '', handle: '', email: '', password: '', birthdate: '', interests: [] as string[] });
const agree = ref(false);
const busy = ref(false);
const error = ref('');
const age = computed(() => (f.value.birthdate ? ageFrom(f.value.birthdate) : null));
const step1Ok = computed(() => f.value.displayName && /^[a-zA-Z0-9_.]{3,20}$/.test(f.value.handle) && f.value.email.includes('@') && f.value.password.length >= 8 && age.value !== null && age.value >= MIN_AGE && agree.value);
const toggle = (i: string) => (f.value.interests = f.value.interests.includes(i) ? f.value.interests.filter((x) => x !== i) : [...f.value.interests, i]);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await s.register({ ...f.value, handle: f.value.handle.trim(), email: f.value.email.trim() });
    router.replace('/drops');
  } catch (e) { error.value = (e as Error).message; step.value = 1; } finally { busy.value = false; }
}
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center p-5 bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,.18),transparent_60%)]">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center gap-3 mb-6"><img src="/brand/mascot.webp" alt="" class="h-20 w-auto drop-shadow-xl" /><Logo variant="wordmark" size="sm" /></div>
      <div class="card p-7">
        <div class="flex gap-1.5 mb-6"><span v-for="i in 2" :key="i" class="h-1.5 flex-1 rounded-full" :class="i <= step ? 'bg-sunset' : 'bg-surface-container'" /></div>
        <form v-if="step === 1" class="space-y-3" @submit.prevent="step = 2">
          <h1 class="text-headline-lg">Join the vibe 🌅</h1>
          <p class="text-body-md text-on-surface-variant pb-2">Already have an account? <RouterLink to="/login" class="text-primary font-bold">Log in</RouterLink></p>
          <input v-model="f.displayName" class="input" placeholder="Your name" maxlength="40" autocomplete="name" required />
          <div class="relative"><span class="absolute left-6 top-1/2 -translate-y-1/2 text-outline font-bold">@</span>
            <input v-model="f.handle" class="input pl-10" placeholder="handle" maxlength="20" autocomplete="username" required /></div>
          <input v-model="f.email" type="email" class="input" placeholder="Email" autocomplete="email" required />
          <input v-model="f.password" type="password" class="input" placeholder="Password (8+ characters)" autocomplete="new-password" minlength="8" required />
          <label class="block"><span class="label pl-6">Birthday</span>
            <input v-model="f.birthdate" type="date" class="input mt-1" required :max="new Date().toISOString().slice(0, 10)" /></label>
          <p v-if="age !== null && age < MIN_AGE" class="text-error text-body-sm px-2">ChatLOL is for adults {{ MIN_AGE }}+ only.</p>
          <label class="flex items-start gap-3 text-body-sm text-on-surface-variant px-2 pt-1">
            <input v-model="agree" type="checkbox" class="mt-0.5 w-5 h-5 accent-[#ff5e00]" />
            <span>I’m 18+ and agree to the Community Guidelines & Terms. I understand some members are clearly-labeled ✦ AI personas.</span>
          </label>
          <p v-if="error" class="text-error text-body-md">{{ error }}</p>
          <button class="btn-primary w-full h-[52px]" :disabled="!step1Ok">Next <Icon name="arrow_forward" /></button>
        </form>
        <div v-else class="space-y-4">
          <h1 class="text-headline-lg">Pick your vibes</h1>
          <p class="text-body-md text-on-surface-variant">We’ll match you with lounges and people who get it.</p>
          <div class="flex flex-wrap gap-2">
            <button v-for="i in INTERESTS" :key="i" type="button" class="chip" :class="{ 'chip-active': f.interests.includes(i) }" @click="toggle(i)">#{{ i }}</button>
          </div>
          <div class="flex gap-2 pt-2">
            <button class="btn-ghost" @click="step = 1"><Icon name="arrow_back" /></button>
            <button class="btn-primary flex-1 h-[52px]" :disabled="busy" @click="submit">{{ busy ? 'Creating…' : 'Start vibing (+250 Sparks)' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
