<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../../lib/api';
import { useSession } from '../../stores/session';

/** Sends a real test email and shows exactly where delivery fails: settings, connecting/logging in, or sending. */
const s = useSession();
const to = ref(s.user?.email ?? '');
const state = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle');
const detail = ref('');
const STEP = { config: 'Not configured', connect: 'Couldn’t connect or log in to the SMTP server', send: 'The server refused the message' };
async function test() {
  state.value = 'testing';
  try {
    const r = await api.adminTestEmail(to.value.trim() || undefined);
    state.value = r.ok ? 'ok' : 'fail';
    detail.value = r.ok ? `Sent from ${r.from}. Check the inbox (and spam). Email links go to ${r.appUrl}.` : `${STEP[r.step ?? 'send']}: ${r.error}`;
  } catch (e) {
    state.value = 'fail';
    detail.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="mt-3 pt-3 border-t border-sandstone space-y-2">
    <div class="flex gap-2"><input v-model="to" type="email" class="input h-9 flex-1" placeholder="Send a test email to…" />
      <button class="btn-secondary h-9" :disabled="state === 'testing'" @click="test">{{ state === 'testing' ? 'Sending…' : '✉️ Test email' }}</button></div>
    <p v-if="state === 'ok'" class="text-body-sm text-green-600">✓ {{ detail }}</p>
    <p v-else-if="state === 'fail'" class="text-body-sm text-error break-words">✗ {{ detail }}</p>
  </div>
</template>
