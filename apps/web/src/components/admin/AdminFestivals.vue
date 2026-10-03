<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { useSession } from '../../stores/session';

/**
 * Festival seasons: what's on now and the upcoming calendar. Admins can switch any festival off (its drops,
 * quiz, lounge and banner then don't appear).
 */
const s = useSession();
const data = ref<Awaited<ReturnType<typeof api.adminFestivals>> | null>(null);
const load = async () => (data.value = await api.adminFestivals());
onMounted(load);
const canEdit = computed(() => (s.user?.perms ?? []).includes('staff'));
/** The calendar covers a full year (every festival appears), so the switched-off list comes straight from it. */
const disabled = computed(() => [...new Set((data.value?.upcoming ?? []).filter((f) => !f.enabled).map((f) => f.key))]);
async function toggle(key: string, on: boolean) {
  const next = on ? disabled.value.filter((k) => k !== key) : [...disabled.value, key];
  try {
    const r = await api.adminSetFestivals(next);
    if (data.value) Object.assign(data.value, r);
    s.toast({ kind: 'info', title: on ? 'Festival switched on' : 'Festival switched off' });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<template>
  <div v-if="data" class="space-y-4">
    <section class="card p-5 space-y-2">
      <h2 class="text-headline-sm">🎉 Festival seasons</h2>
      <p class="text-body-sm text-on-surface-variant">While a festival is on, ChatLOL themes the Daily Drop, runs a daily festival quiz (Sparks for right answers), opens a seasonal lounge, mixes festival questions into Trivia and shows a banner on Home. Seasons start a few days before the big day.</p>
      <p v-if="data.current" class="text-body-md">On now: <b>{{ data.current.emoji }} {{ data.current.name }}</b> — until {{ fmt(data.current.endsAt) }}</p>
      <p v-else class="text-body-md text-on-surface-variant">No festival is on right now.</p>
    </section>
    <section class="card p-5">
      <p class="label mb-2">Coming up</p>
      <div v-for="f in data.upcoming" :key="f.key + f.day" class="flex items-center gap-3 py-2 border-b border-sandstone last:border-0">
        <span class="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0" :style="{ background: f.gradient }">{{ f.emoji }}</span>
        <div class="flex-1 min-w-0">
          <p class="text-label-lg">{{ f.name }}</p>
          <p class="text-body-sm text-on-surface-variant">{{ fmt(f.day) }} · season {{ fmt(f.startsAt) }} – {{ fmt(f.endsAt) }}</p>
        </div>
        <label class="flex items-center gap-2 text-body-sm"><input type="checkbox" :checked="f.enabled" :disabled="!canEdit" @change="toggle(f.key, ($event.target as HTMLInputElement).checked)" /> {{ f.enabled ? 'On' : 'Off' }}</label>
      </div>
    </section>
  </div>
</template>
