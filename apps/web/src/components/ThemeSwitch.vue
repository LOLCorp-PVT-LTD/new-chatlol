<script setup lang="ts">
import { computed } from 'vue';
import { themeMode } from '../stores/theme';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import Icon from './Icon.vue';

/** One tap cycles Light → Dark → System; signed-in members keep the choice on every device. */
const s = useSession();
const ORDER = ['light', 'dark', 'system'] as const;
const META = { light: { icon: 'light_mode', label: 'Light' }, dark: { icon: 'dark_mode', label: 'Dark' }, system: { icon: 'contrast', label: 'System' } };
const current = computed(() => META[themeMode.value]);
async function cycle() {
  const next = ORDER[(ORDER.indexOf(themeMode.value) + 1) % ORDER.length];
  themeMode.value = next;
  if (s.user) {
    s.user.settings.darkMode = next;
    try { s.applyUser((await api.updateSettings({ darkMode: next })).user); } catch { /* keep local choice */ }
  }
}
</script>
<template>
  <button class="btn-icon" :aria-label="`Theme: ${current.label}. Switch theme`" :title="`Theme: ${current.label}`" @click="cycle">
    <Icon :name="current.icon" />
  </button>
</template>
