<script setup lang="ts">
import { TABS } from './nav';
import Icon from './Icon.vue';
defineEmits<{ (e: 'compose'): void }>();
</script>
<template>
  <nav class="lg:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none" aria-label="Tabs">
    <div class="pointer-events-auto mx-auto max-w-md glass rounded-full shadow-float ring-1 ring-white/40 flex items-center justify-around h-16 px-2">
      <RouterLink v-for="(t, i) in TABS" :key="t.to" :to="t.to" custom v-slot="{ href, navigate, isExactActive, isActive }">
        <a :href="href" @click="navigate" class="flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-full transition-all"
          :class="[(t.to === '/' ? isExactActive : isActive) ? 'text-flame' : 'text-on-surface-variant', i === 2 ? '-mt-7' : '']">
          <span v-if="i === 2" class="w-14 h-14 rounded-full bg-sunset text-white shadow-float flex items-center justify-center ring-4 ring-surface"><Icon :name="t.icon" fill /></span>
          <template v-else>
            <span class="px-4 py-1 rounded-full transition-colors" :class="(t.to === '/' ? isExactActive : isActive) ? 'bg-flame/15' : ''"><Icon :name="t.icon" :fill="(t.to === '/' ? isExactActive : isActive)" /></span>
            <span class="text-[10px] font-bold">{{ t.label }}</span>
          </template>
        </a>
      </RouterLink>
    </div>
  </nav>
</template>
