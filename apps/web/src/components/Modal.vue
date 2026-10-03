<script setup lang="ts">
import Icon from './Icon.vue';
import { onMounted, onUnmounted } from 'vue';
const props = defineProps<{ title?: string; wide?: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close');
onMounted(() => { document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'; });
onUnmounted(() => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; });
void props;
</script>
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-inverse-surface/50 backdrop-blur-sm" @click.self="emit('close')">
      <div role="dialog" aria-modal="true" :aria-label="title"
        class="w-full bg-surface-container-lowest/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/40 dark:border-white/10 shadow-float rounded-t-lg sm:rounded-lg max-h-[92dvh] overflow-y-auto animate-pop pb-[env(safe-area-inset-bottom)]"
        :class="wide ? 'sm:max-w-2xl' : 'sm:max-w-md'">
        <div v-if="title" class="sticky top-0 z-10 flex items-center justify-between px-6 pt-5 pb-3 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-sandstone/50 dark:border-white/[0.06]">
          <h2 class="text-headline-md">{{ title }}</h2>
          <button class="btn-icon -mr-2" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
        </div>
        <!-- Breathing room between a titled header and the content (content panels often start with a field). -->
        <div :class="title ? 'pt-4' : ''"><slot /></div>
      </div>
    </div>
  </Teleport>
</template>
