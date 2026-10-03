<script setup lang="ts">
import { computed } from 'vue';
import type { AppThemeKey, AppThemeSetting } from '@chatlol/shared';
import { APP_THEMES, THEME_UNLOCK_GOLD, themeAllowed, themeSwatch } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { appTheme } from '../stores/theme';
import { confirmDialog } from '../lib/dialog';
import Icon from './Icon.vue';
import Logo from './Logo.vue';

/**
 * App colours: 30 fixed themes (no custom colours). Three are free; the rest come with Premium or can be unlocked
 * one at a time for Gold. Picking one recolours the whole app and the logo, and is saved to the account.
 */
const s = useSession();
const current = computed(() => appTheme.value);
const premium = computed(() => !!s.user?.premiumUntil);
const allowed = (key: string) => themeAllowed(key, { premium: premium.value, unlocked: s.user?.unlockedThemes ?? [] });
const swatch = (t: AppThemeSetting) => {
  const [a, b] = themeSwatch(t);
  return { background: `linear-gradient(135deg, ${a}, ${b})` };
};

async function pick(key: AppThemeKey) {
  const t: AppThemeSetting = { preset: key, custom: null };
  if (!allowed(key)) {
    if (!s.user) return;
    const label = APP_THEMES.find((x) => x.key === key)!.label;
    if (!(await confirmDialog({ title: `Unlock ${label}?`, body: `Keep it forever for 🪙 ${THEME_UNLOCK_GOLD} Gold — or get every theme with Premium.`, confirmText: `Unlock for 🪙 ${THEME_UNLOCK_GOLD}` }))) return;
    try { s.applyUser((await api.unlockTheme(key)).user); } catch (e) { return s.toast({ kind: 'error', title: (e as Error).message }); }
  }
  appTheme.value = t; // instant
  if (!s.user) return;
  s.user.settings.appTheme = t;
  try { s.applyUser((await api.updateSettings({ appTheme: t })).user); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>

<template>
  <div>
    <div class="rounded-md bg-surface-container-low p-3 mb-3 flex justify-center"><Logo variant="wordmark" size="sm" /></div>
    <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
      <button v-for="t in APP_THEMES" :key="t.key" type="button" class="group rounded-md border p-2 text-left transition hover:border-flame/60" :class="current.preset === t.key ? 'border-flame ring-2 ring-flame/30' : 'border-sandstone'" :aria-pressed="current.preset === t.key" @click="pick(t.key)">
        <span class="block h-10 rounded-[10px] shadow-warm relative" :style="swatch({ preset: t.key, custom: null })">
          <Icon v-if="current.preset === t.key" name="check" :size="18" class="absolute right-1.5 top-1.5 text-white drop-shadow" />
          <span v-else-if="!allowed(t.key)" class="absolute right-1 top-1 text-[11px] bg-black/45 text-white rounded-full px-1.5">{{ premium ? '' : '👑' }} 🔒</span>
        </span>
        <span class="block text-label-md mt-1.5 truncate">{{ t.label }}</span>
        <span v-if="t.free" class="block text-[10px] text-on-surface-variant">Free</span>
      </button>
    </div>
    <p class="text-body-sm text-on-surface-variant mt-2">Sunset, Ocean and Berry are free. Every other theme comes with 👑 Premium, or unlock one for good for 🪙 {{ THEME_UNLOCK_GOLD }} Gold. Your colours (and the logo) apply everywhere in ChatLOL, on every device.</p>
  </div>
</template>
