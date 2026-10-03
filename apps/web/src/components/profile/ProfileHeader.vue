<script setup lang="ts">
import { computed } from 'vue';
import { GENDERS, buttonStyleByKey, coverByKey, tierByKey, timeAgo } from '@chatlol/shared';
import Avatar from '../Avatar.vue';
import Icon from '../Icon.vue';
import FriendButton from '../FriendButton.vue';
import { useProfileCtx } from './context';

/** The top of a profile, in the member's chosen header style (cover / centered / split / compact). */
const emit = defineEmits<{
  (e: 'customize'): void;
  (e: 'edit-layout'): void;
  (e: 'locker'): void;
  (e: 'avatar', f: File): void;
  (e: 'follow'): void;
  (e: 'message'): void;
  (e: 'share'): void;
  (e: 'report'): void;
  (e: 'block'): void;
}>();
const ctx = useProfileCtx();
const u = computed(() => ctx.user.value);
const style = computed(() => ctx.layout.value.header);
const gender = computed(() => GENDERS.find((g) => g.key === u.value.gender));
const tier = computed(() => tierByKey(u.value.vibeTier));
const avatarSize = computed(() => (style.value === 'compact' ? 72 : style.value === 'split' ? 148 : 120));
const centered = computed(() => style.value === 'centered');
function pickAvatar(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) emit('avatar', f);
}
// Vault cosmetics: a designed cover (when no photo cover is set) and the member's button style.
const coverArt = computed(() => coverByKey(u.value.cosmetics.cover)?.css ?? null);
const btnStyle = computed(() => buttonStyleByKey(u.value.cosmetics.button)?.css ?? null);
</script>

<template>
  <header class="hdr overflow-hidden" :class="[`hdr-${style}`, ctx.darkBg.value ? 'hdr-dark' : 'hdr-light']">
    <!-- Cover -->
    <div v-if="style !== 'compact'" :class="style === 'split' ? 'absolute inset-0' : 'relative h-36 sm:h-52'">
      <img v-if="u.profile.coverUrl" :src="u.profile.coverUrl" alt="" class="absolute inset-0 w-full h-full object-cover" />
      <div v-else-if="coverArt" class="absolute inset-0" :style="{ background: coverArt }" />
      <div v-else class="absolute inset-0" :style="{ background: `linear-gradient(135deg, ${ctx.accent.value}cc, transparent)` }" />
      <div class="absolute inset-0" :class="style === 'split' ? 'bg-black/45' : 'bg-gradient-to-b from-transparent to-black/25'" />
      <div v-if="style !== 'split'" class="absolute top-3 right-3 flex gap-2">
        <span v-if="u.premium" class="rounded-full bg-black/45 text-white px-3 py-1 text-label-sm backdrop-blur">👑 Premium</span>
        <span v-if="u.isAI" class="rounded-full bg-black/45 text-white px-3 py-1 text-label-sm backdrop-blur" title="AI persona">✦ AI persona</span>
      </div>
    </div>

    <div class="hdr-body relative" :class="[style === 'split' ? 'text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-4 items-center sm:items-end' : 'px-5 sm:px-8 pb-6', style === 'compact' ? 'pt-5 flex flex-wrap items-center gap-4' : '', centered ? 'text-center' : '']">
      <div :class="[style === 'cover' || centered ? '-mt-16' : '', centered ? 'flex justify-center' : '']">
        <label class="relative inline-block" :class="{ 'cursor-pointer group': ctx.isMe.value && !ctx.editing.value }">
          <Avatar :user="u" :size="avatarSize" class="ring-4 ring-white/80 rounded-full" />
          <template v-if="ctx.isMe.value && !ctx.editing.value">
            <span class="absolute inset-0 rounded-full bg-black/40 text-white hidden group-hover:flex items-center justify-center"><Icon name="photo_camera" /></span>
            <input type="file" accept="image/*" class="hidden" @change="pickAvatar" />
          </template>
        </label>
      </div>

      <div class="min-w-0 flex-1" :class="{ 'mt-3': style === 'cover' || centered, 'basis-[260px] text-center sm:text-left': style === 'split', 'basis-[220px]': style === 'compact' }">
        <h1 class="text-headline-xl flex items-center gap-2 flex-wrap" :class="{ 'justify-center': centered, 'sm:justify-start justify-center': style === 'split', '!text-headline-lg': style === 'compact' }">
          {{ u.displayName }} <span v-if="gender" class="text-headline-sm" :title="gender.label">{{ gender.emoji }}</span>
          <span class="rounded-full px-3 py-1 text-label-md hdr-chip">{{ tier.emoji }} {{ tier.label.toUpperCase() }}</span>
          <RouterLink v-if="u.clan" :to="`/clans/${u.clan.id}`" class="rounded-full px-3 py-1 text-label-md hdr-chip hdr-clan" :class="{ 'hdr-clan-glow': u.clan.glow >= 2 }" :style="u.clan.color ? { '--clan': u.clan.color } : undefined" :title="`Member of ${u.clan.name} · clan level ${u.clan.level}`">{{ u.clan.emoji }} {{ u.clan.name }} <b>[{{ u.clan.tag }}]</b></RouterLink>
          <span v-if="style === 'compact' && u.premium" class="text-label-md">👑</span>
        </h1>
        <p class="text-body-md opacity-90">@{{ u.handle }} · {{ u.online ? '🟢 Online' : `Active ${timeAgo(u.lastSeenAt)} ago` }}<template v-if="style === 'compact' && u.isAI"> · ✦ AI persona</template></p>
        <p v-if="u.profile.headline && style !== 'compact'" class="text-headline-sm mt-1.5">{{ u.profile.headline }}</p>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 flex-wrap" :class="[centered ? 'justify-center w-full mt-4' : style === 'compact' ? '' : style === 'split' ? 'w-full justify-center sm:justify-start' : 'mt-4']">
        <template v-if="ctx.isMe.value">
          <button class="btn h-10 text-white" :style="{ background: ctx.accent.value }" @click="emit('edit-layout')"><Icon name="dashboard_customize" :size="18" /> Edit page</button>
          <button class="btn h-10 bg-white/90 text-[#251911]" @click="emit('customize')"><Icon name="palette" :size="18" /> Look & song</button>
          <button class="btn-icon bg-white/90 text-[#251911]" aria-label="Sparks Locker" title="Sparks Locker" @click="emit('locker')"><Icon name="inventory_2" /></button>
          <RouterLink to="/insights" class="btn-icon bg-white/90 text-[#251911]" aria-label="Who viewed me" title="Who viewed me"><Icon name="visibility" /></RouterLink>
          <RouterLink to="/settings" class="btn-icon bg-white/90 text-[#251911]" aria-label="Settings" title="Settings"><Icon name="settings" /></RouterLink>
        </template>
        <template v-else>
          <FriendButton :user="u" :accent="ctx.accent.value" @change="(f) => (ctx.user.value = { ...ctx.user.value, friendship: f, isFollowing: f === 'friends' ? true : ctx.user.value.isFollowing })" />
          <button class="btn h-10 text-white" :style="btnStyle ?? { background: u.isFollowing ? 'rgba(0,0,0,.4)' : ctx.accent.value }" @click="emit('follow')">{{ u.isFollowing ? 'Following ✓' : 'Follow' }}</button>
          <button class="btn h-10 bg-white/90 text-[#251911]" @click="emit('message')"><Icon name="chat" :size="18" /> Message</button>
          <button class="btn-icon bg-white/90 text-[#251911]" aria-label="Share profile" @click="emit('share')"><Icon name="share" /></button>
          <button class="btn-icon bg-white/90 text-[#251911]" aria-label="Report" title="Report" @click="emit('report')"><Icon name="flag" /></button>
          <button class="btn-icon bg-white/90 text-[#251911]" aria-label="Block" title="Block" @click="emit('block')"><Icon name="block" /></button>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hdr { border-radius: var(--sec-radius, 16px); position: relative; }
.hdr-cover, .hdr-centered, .hdr-compact { backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
.hdr-dark:not(.hdr-split) { background: rgb(0 0 0 / 0.3); color: #fff; }
.hdr-light:not(.hdr-split) { background: rgb(255 255 255 / 0.6); color: #251911; }
.hdr-split { min-height: 260px; display: flex; align-items: flex-end; }
.hdr-split .hdr-body { width: 100%; }
.hdr-clan { box-shadow: inset 0 0 0 1.5px var(--clan, #7c3aed); }
.hdr-clan-glow { box-shadow: inset 0 0 0 1.5px var(--clan, #7c3aed), 0 0 14px color-mix(in srgb, var(--clan, #7c3aed) 60%, transparent); animation: clan-pulse 2.4s ease-in-out infinite; }
@keyframes clan-pulse { 50% { box-shadow: inset 0 0 0 1.5px var(--clan, #7c3aed), 0 0 22px color-mix(in srgb, var(--clan, #7c3aed) 80%, transparent); } }
@media (prefers-reduced-motion: reduce) { .hdr-clan-glow { animation: none; } }
.hdr-dark .hdr-chip, .hdr-split .hdr-chip { background: rgb(255 255 255 / 0.2); }
.hdr-light:not(.hdr-split) .hdr-chip { background: rgb(0 0 0 / 0.08); }
</style>
