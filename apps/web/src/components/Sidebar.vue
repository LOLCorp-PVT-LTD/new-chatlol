<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { levelTitle, levelProgress, compact, tierByKey } from '@chatlol/shared';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import { NAV } from './nav';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
import Progress from './Progress.vue';

const s = useSession();
defineEmits<{ (e: 'navigate'): void }>();
const tags = ref<{ tag: string; count: number }[]>([]);
const prog = computed(() => (s.user ? levelProgress(s.user.xp) : null));
onMounted(async () => { tags.value = (await api.trending()).tags.slice(0, 6); });
</script>

<template>
  <aside class="w-[280px] shrink-0 space-y-4">
    <!-- Tier card -->
    <div v-if="s.user" class="rounded-lg bg-sunset-v text-white p-5 shadow-float relative overflow-hidden">
      <div class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
      <span class="absolute top-4 right-4 bg-black/20 rounded-full px-2.5 py-1 text-label-sm">⭐ {{ tierByKey(s.user.vibeTier).label.toUpperCase() }}</span>
      <RouterLink to="/locker" class="flex flex-col items-center text-center" @click="$emit('navigate')">
        <Avatar :user="s.user" :size="76" />
        <p class="text-headline-md mt-3">{{ s.user.displayName }}</p>
        <p class="text-body-sm opacity-90">@{{ s.user.handle }}<template v-if="s.user.pronouns"> • {{ s.user.pronouns }}</template></p>
        <span class="mt-2 bg-white/20 rounded-full px-3 py-1 text-label-sm">● Level {{ s.user.level }} {{ levelTitle(s.user.level) }}</span>
      </RouterLink>
      <div class="grid grid-cols-3 gap-2 text-center mt-4 pt-4 border-t border-white/20">
        <div><p class="text-headline-sm">{{ compact(s.user.friendsCount) }}</p><p class="text-label-sm opacity-80">FRIENDS</p></div>
        <div><p class="text-headline-sm">{{ compact(s.user.followersCount) }}</p><p class="text-label-sm opacity-80">FOLLOWERS</p></div>
        <div><p class="text-headline-sm">🔥{{ s.user.streakDays }}</p><p class="text-label-sm opacity-80">STREAK</p></div>
      </div>
      <div class="mt-4 rounded-md bg-black/15 p-3">
        <div class="flex justify-between text-label-md mb-2"><span>⚡ Daily Vibe Goal</span><span>{{ s.user.dailyGoal.done }} / {{ s.user.dailyGoal.target }}</span></div>
        <Progress :value="s.user.dailyGoal.done" :max="s.user.dailyGoal.target" light />
      </div>
      <div v-if="prog" class="mt-3 text-label-sm opacity-90 flex justify-between"><span>XP to Lv {{ prog.level + 1 }}</span><span>{{ prog.into }}/{{ prog.needed }}</span></div>
    </div>
    <div v-else class="card p-5 text-center">
      <p class="text-headline-md">Join the vibe 🌅</p>
      <p class="text-body-md text-on-surface-variant mt-1">Rate, drop and hang out with people who get it.</p>
      <RouterLink to="/join" class="btn-primary w-full mt-4">Create account</RouterLink>
      <RouterLink to="/login" class="btn-ghost w-full mt-1">Log in</RouterLink>
    </div>

    <nav class="card p-3" aria-label="Main">
      <p class="label px-3 pt-1 pb-2">Navigation Sparks</p>
      <RouterLink v-for="n in NAV" :key="n.to" :to="n.to" custom v-slot="{ href, navigate, isExactActive, isActive }">
        <a :href="href" @click="navigate($event); $emit('navigate')" class="flex items-center gap-3 px-3 py-1.5 rounded-full text-label-lg transition-colors"
          :class="(n.to === '/' ? isExactActive : isActive) ? 'bg-sunlit text-on-surface ring-1 ring-flame/20' : 'hover:bg-surface-container-low text-on-surface-variant'">
          <span class="w-8 h-8 rounded-full flex items-center justify-center" :class="(n.to === '/' ? isExactActive : isActive) ? 'bg-sunset text-white shadow-glow' : 'bg-surface-container-low'">
            <Icon :name="n.icon" :size="20" :fill="(n.to === '/' ? isExactActive : isActive)" />
          </span>
          <span class="flex-1">{{ n.label }}</span>
          <span v-if="n.badge === 'dms' && s.unreadDms" class="bg-coral text-white rounded-full px-2 text-label-sm">{{ s.unreadDms }}</span>
          <span v-else-if="n.badge === 'live'" class="w-2 h-2 rounded-full bg-flame animate-pulse-ring" />
        </a>
      </RouterLink>
    </nav>

    <div class="card p-4">
      <div class="flex items-center justify-between px-1 mb-3"><p class="label">Hot Vibe Tags</p><Icon name="trending_up" class="text-flame" :size="18" /></div>
      <div class="flex flex-wrap gap-2">
        <RouterLink v-for="t in tags" :key="t.tag" :to="`/feed?tag=${t.tag}`" class="chip h-8 hover:border-flame" @click="$emit('navigate')">#{{ t.tag }} <span class="text-on-surface-variant font-medium">{{ compact(t.count) }}</span></RouterLink>
      </div>
    </div>
    <p class="text-body-sm text-on-surface-variant px-3">ChatLOL is moderated in real time by SafeShield 🛡️ • <RouterLink to="/settings" class="underline" @click="$emit('navigate')">Settings</RouterLink></p>
  </aside>
</template>
