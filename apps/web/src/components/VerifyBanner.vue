<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Icon from './Icon.vue';

const s = useSession();
const KEY = 'chatlol.verifyBanner.hiddenAt';
const hidden = ref((() => { try { return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < 86_400_000; } catch { return false; } })());
const sent = ref(false);
async function resend() {
  try { await api.resendVerification(); sent.value = true; } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
function hide() { hidden.value = true; try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } }
</script>
<template>
  <div v-if="s.user && !s.user.emailVerified && !hidden" class="rounded-lg bg-sunlit p-4 flex items-center gap-3 mb-5 max-w-[640px] mx-auto">
    <span class="text-2xl">✉️</span>
    <div class="flex-1 min-w-0">
      <p class="text-label-lg">Verify your email for +50 Sparks</p>
      <p class="text-body-sm text-on-surface-variant truncate">{{ sent ? `New link sent to ${s.user.email}` : `We sent a link to ${s.user.email}. Needed to go live & buy Gems.` }}</p>
    </div>
    <button v-if="!sent" class="btn-secondary h-9 px-4 text-label-md bg-surface-container-lowest" @click="resend">Resend</button>
    <button class="btn-icon w-9 h-9" aria-label="Dismiss" @click="hide"><Icon name="close" :size="18" /></button>
  </div>
</template>
