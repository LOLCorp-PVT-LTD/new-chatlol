<script setup lang="ts">
import { levelTitle } from '@chatlol/shared';
import { useSession } from '../stores/session';
import Modal from './Modal.vue';
const s = useSession();
</script>
<template>
  <Modal v-if="s.levelUp" @close="s.levelUp = null">
    <div class="p-8 text-center">
      <div class="mx-auto w-28 h-28 rounded-full bg-sunset shadow-glow flex items-center justify-center text-white text-headline-xl animate-pop">{{ s.levelUp.to }}</div>
      <p class="label mt-6">Level up!</p>
      <h2 class="text-headline-xl mt-1">You’re a <span class="text-gradient">{{ levelTitle(s.levelUp.to) }}</span></h2>
      <p class="text-body-lg text-on-surface-variant mt-2">+{{ s.levelUp.to * 10 }} bonus Sparks landed in your wallet. New flair unlocks in the Vault.</p>
      <div class="flex gap-2 mt-6">
        <RouterLink to="/vault" class="btn-secondary flex-1" @click="s.levelUp = null">Open Vault</RouterLink>
        <button class="btn-primary flex-1" @click="s.levelUp = null">Keep vibing</button>
      </div>
    </div>
  </Modal>
</template>
