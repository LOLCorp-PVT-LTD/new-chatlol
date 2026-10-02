<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import Sidebar from './Sidebar.vue';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
/** The navigation sidebar, opened from the ☰ button as a slide-in drawer (as in the Stitch design). */
const emit = defineEmits<{ (e: 'close'): void }>();
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close');
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[75] flex">
      <div class="fixed inset-0 bg-inverse-surface/60 backdrop-blur-md" @click="emit('close')" />
      <aside class="relative w-80 max-w-[85vw] h-full bg-surface-container-lowest shadow-float overflow-y-auto border-r border-sandstone p-4 pt-[max(16px,env(safe-area-inset-top))] animate-[pop_.25s_ease-out]" aria-label="Navigation">
        <div class="flex items-center justify-between pb-3 mb-3 border-b border-sandstone">
          <Logo variant="wordmark" size="sm" />
          <button class="btn-icon w-9 h-9 bg-surface-container-low" aria-label="Close navigation" @click="emit('close')"><Icon name="close" :size="20" /></button>
        </div>
        <Sidebar class="!w-full" @navigate="emit('close')" />
      </aside>
    </div>
  </Teleport>
</template>
