<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../../lib/api';

/**
 * Checks, from this browser, whether the TURN server really relays: asks for relay-only ICE candidates with the
 * credentials the server hands out. No "relay" candidate = viewers behind strict networks can't see live video.
 */
const state = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle');
const detail = ref('');
async function test() {
  state.value = 'testing';
  detail.value = '';
  try {
    const ice = await api.iceServers();
    const hasTurn = ice.iceServers.some((s) => [s.urls].flat().some((u) => /^turns?:/.test(String(u))));
    if (!hasTurn) {
      state.value = 'fail';
      detail.value = 'No TURN server is configured: set TURN_URLS and TURN_SECRET (or TURN_USERNAME + TURN_CREDENTIAL) in apps/server/.env.';
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers as RTCIceServer[], iceTransportPolicy: 'relay' });
    pc.createDataChannel('t');
    const found: string[] = [];
    const errors: string[] = [];
    pc.onicecandidate = (e) => { if (e.candidate?.candidate.includes(' relay ')) found.push(e.candidate.candidate); };
    pc.addEventListener('icecandidateerror', (e) => { const x = e as RTCPeerConnectionIceErrorEvent; errors.push(`${x.url ?? ''} → ${x.errorCode} ${x.errorText ?? ''}`.trim()); });
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((r) => setTimeout(r, 6000));
    pc.close();
    if (found.length) {
      state.value = 'ok';
      detail.value = `TURN works — got ${found.length} relay route${found.length === 1 ? '' : 's'}.`;
    } else {
      state.value = 'fail';
      detail.value = `TURN gave no relay route. ${errors.length ? `Errors: ${[...new Set(errors)].join('; ')}. ` : ''}Check the TURN URL/host, that ports 3478 (and 5349 for turns:) plus coturn’s relay port range are open, and that TURN_SECRET matches coturn’s static-auth-secret (401 = wrong secret).`;
    }
  } catch (e) {
    state.value = 'fail';
    detail.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="mt-3 pt-3 border-t border-sandstone">
    <div class="flex items-center gap-2">
      <p class="text-label-lg flex-1">Live video relay (TURN)</p>
      <button class="btn-secondary h-9" :disabled="state === 'testing'" @click="test">{{ state === 'testing' ? 'Testing…' : 'Test TURN' }}</button>
    </div>
    <p v-if="detail" class="text-body-sm mt-1" :class="state === 'ok' ? 'text-green-600' : 'text-error'">{{ detail }}</p>
  </div>
</template>
