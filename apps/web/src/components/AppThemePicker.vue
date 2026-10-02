<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AppThemeSetting } from '@chatlol/shared';
import { APP_THEMES, themeSwatch } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { appTheme } from '../stores/theme';
import Icon from './Icon.vue';

/**
 * App colours: preset gradients close to Sunset, or your own colour (softened so it never glares).
 * Picking one recolours the whole app at once; it's saved to your account so every device matches.
 */
const s = useSession();
const current = computed(() => appTheme.value);
const customColor = ref(current.value.custom ?? '#7c5cff');
const swatch = (t: AppThemeSetting) => {
  const [a, b] = themeSwatch(t);
  return { background: `linear-gradient(135deg, ${a}, ${b})` };
};

let timer: ReturnType<typeof setTimeout> | undefined;
function pick(t: AppThemeSetting) {
  appTheme.value = t; // instant
  if (s.user) s.user.settings.appTheme = t;
  clearTimeout(timer);
  // Dragging the colour picker fires many times: save once it settles.
  timer = setTimeout(async () => {
    if (!s.user) return;
    try { s.applyUser((await api.updateSettings({ appTheme: t })).user); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
  }, 400);
}
const onCustom = (e: Event) => {
  customColor.value = (e.target as HTMLInputElement).value;
  pick({ preset: 'custom', custom: customColor.value });
};
</script>

<template>
  <div>
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
      <button v-for="t in APP_THEMES" :key="t.key" type="button" class="group rounded-md border p-2 text-left transition hover:border-flame/60" :class="current.preset === t.key ? 'border-flame ring-2 ring-flame/30' : 'border-sandstone'" :aria-pressed="current.preset === t.key" @click="pick({ preset: t.key, custom: null })">
        <span class="block h-10 rounded-[10px] shadow-warm relative" :style="swatch({ preset: t.key, custom: null })">
          <Icon v-if="current.preset === t.key" name="check" :size="18" class="absolute right-1.5 top-1.5 text-white drop-shadow" />
        </span>
        <span class="block text-label-md mt-1.5">{{ t.label }}</span>
      </button>
      <label class="rounded-md border p-2 text-left transition cursor-pointer hover:border-flame/60" :class="current.preset === 'custom' ? 'border-flame ring-2 ring-flame/30' : 'border-sandstone border-dashed'">
        <span class="block h-10 rounded-[10px] shadow-warm relative overflow-hidden" :style="swatch({ preset: 'custom', custom: customColor })">
          <Icon :name="current.preset === 'custom' ? 'check' : 'colorize'" :size="18" class="absolute right-1.5 top-1.5 text-white drop-shadow" />
        </span>
        <span class="block text-label-md mt-1.5">Your colour</span>
        <input type="color" class="sr-only" :value="customColor" aria-label="Pick your own colour" @input="onCustom" />
      </label>
    </div>
    <p class="text-body-sm text-on-surface-variant mt-2">Your colours apply everywhere in ChatLOL, on every device you sign in on. People's profile pages keep the look their owner picked.</p>
  </div>
</template>
