<script setup lang="ts">
import type { UserPublic } from '@chatlol/shared';
import { statusFor } from '@chatlol/shared';
import { FLAIRS } from '../lib/cosmetics';
import AiBadge from './AiBadge.vue';
import { computed } from 'vue';
const props = defineProps<{ user: UserPublic; handle?: boolean; link?: boolean }>();
/** Every member has a status rank from their level; it shows as a badge next to their name. */
const rank = computed(() => statusFor(props.user.level ?? 1));
</script>
<template>
  <component :is="link === false ? 'span' : 'RouterLink'" :to="`/u/${user.handle}`" class="group/name inline-flex items-center gap-1.5 min-w-0">
    <span class="font-bold truncate decoration-flame/40" :class="{ 'group-hover/name:underline': link !== false }">{{ user.displayName }}</span>
    <span v-if="user.clan && user.clan.level >= 2" class="clan-tag shrink-0" :class="{ 'clan-legend': user.clan.legend, 'clan-glow': user.clan.glow >= 1 }" :style="user.clan.color ? { '--clan': user.clan.color } : undefined" :title="`Clan: ${user.clan.name}`">[{{ user.clan.tag }}]</span>
    <span v-if="user.cosmetics.flair" class="text-[0.9em]">{{ FLAIRS[user.cosmetics.flair] }}</span>
    <span v-if="user.isKing" class="text-[0.9em]" title="King of ChatLOL">👑</span>
    <span v-else-if="!user.isAI && rank" class="rank shrink-0" :class="`rank-${rank.style}`" :style="{ '--rank': rank.color }" :title="`${rank.label} · level ${user.level}`">{{ rank.emoji }} {{ rank.label }}</span>
    <AiBadge v-if="user.isAI" small />
    <span v-if="handle" class="text-on-surface-variant font-medium truncate">@{{ user.handle }}</span>
  </component>
</template>

<style scoped>
.clan-tag { font-size: 0.68em; font-weight: 800; letter-spacing: 0.04em; color: var(--clan, #7c3aed); text-decoration: none; }
.clan-glow { text-shadow: 0 0 6px color-mix(in srgb, var(--clan, #7c3aed) 70%, transparent); }
.clan-legend { background: linear-gradient(90deg, #ff5e00, #fcd34d, #ff5e00); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: rank-shine 2.5s linear infinite; }
.rank { font-size: 0.68em; line-height: 1.55; font-weight: 700; border-radius: 9999px; padding: 0 0.5em; white-space: nowrap; }
.rank-plain { color: var(--rank); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rank) 55%, transparent); background: color-mix(in srgb, var(--rank) 10%, transparent); }
.rank-filled { color: #fff; background: var(--rank); }
.rank-shine {
  color: #3b2a00; background: linear-gradient(110deg, #b8860b 0%, #fcd34d 35%, #fffbe6 50%, #fcd34d 65%, #b8860b 100%); background-size: 250% 100%;
  animation: rank-shine 3s linear infinite; box-shadow: 0 0 8px color-mix(in srgb, var(--rank) 60%, transparent);
}
@keyframes rank-shine { from { background-position: 120% 0; } to { background-position: -120% 0; } }
</style>
