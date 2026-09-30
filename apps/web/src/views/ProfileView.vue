<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Post, StoreItem, UserPublic } from '@chatlol/shared';
import { compact, levelProgress, levelTitle, tierByKey, toTen, timeAgo } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import { THEMES, BANNERS, BADGES } from '../lib/cosmetics';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Progress from '../components/Progress.vue';
import PostCard from '../components/PostCard.vue';
import Modal from '../components/Modal.vue';
import AiBadge from '../components/AiBadge.vue';
import Empty from '../components/Empty.vue';

const route = useRoute();
const router = useRouter();
const s = useSession();
const user = ref<UserPublic | null>(null);
const posts = ref<Post[]>([]);
const locker = ref<StoreItem[]>([]);
const tab = ref<'grid' | 'posts' | 'locker'>('grid');
const editing = ref(false);
const form = ref({ displayName: '', bio: '', pronouns: '', city: '' });
const isMe = computed(() => !route.params.handle || route.params.handle === s.user?.handle);
const prog = computed(() => (user.value ? levelProgress(user.value.xp) : null));
const photos = computed(() => posts.value.filter((p) => p.mediaUrl));
const bg = computed(() => (user.value?.cosmetics.banner ? BANNERS[user.value.cosmetics.banner] : user.value?.cosmetics.theme ? THEMES[user.value.cosmetics.theme] : 'linear-gradient(135deg,#ff9900,#ff5e00 60%,#bd0042)'));

watchEffect(async () => {
  const handle = (route.params.handle as string) || s.user?.handle;
  if (!handle) return;
  const r = await api.user(handle);
  user.value = r.user;
  posts.value = r.posts;
  if (isMe.value) locker.value = (await api.inventory()).items;
});

async function follow() {
  if (!s.user) return router.push('/join');
  const r = await api.follow(user.value!.id);
  user.value = { ...user.value!, isFollowing: r.following, followersCount: user.value!.followersCount + (r.following ? 1 : -1) };
}
async function dm() {
  if (!s.user) return router.push('/join');
  try { router.push(`/messages/${(await api.openConversation(user.value!.id)).conversation.id}`); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function block() {
  if (!confirm(`Block @${user.value!.handle}? They won’t be able to message you or see you in feeds.`)) return;
  await api.block(user.value!.id);
  router.push('/');
}
function openEdit() {
  const u = s.user!;
  form.value = { displayName: u.displayName, bio: u.bio, pronouns: u.pronouns, city: u.city };
  editing.value = true;
}
async function save() {
  try {
    const r = await api.updateMe(form.value);
    s.applyUser(r.user);
    user.value = { ...user.value!, ...r.user };
    editing.value = false;
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function changeAvatar(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const url = await uploadImage(f);
  const r = await api.updateMe({ avatarUrl: url });
  s.applyUser(r.user);
  user.value = { ...user.value!, avatarUrl: url };
}
async function equip(i: StoreItem) {
  const r = await api.equip({ [i.kind]: i.equipped ? null : i.id });
  s.applyUser(r.user);
  user.value = { ...user.value!, cosmetics: r.user.cosmetics };
  locker.value = (await api.inventory()).items;
}
</script>

<template>
  <div v-if="user" class="max-w-[820px] mx-auto space-y-5">
    <section class="card overflow-hidden">
      <div class="h-40 sm:h-52 relative" :style="{ background: bg }">
        <span v-if="user.isAI" class="absolute top-4 right-4"><AiBadge /></span>
      </div>
      <div class="px-5 sm:px-8 pb-6 -mt-14 relative">
        <div class="flex items-end justify-between gap-3">
          <label class="relative" :class="{ 'cursor-pointer group': isMe }">
            <Avatar :user="user" :size="112" class="ring-4 ring-surface-container-lowest rounded-full" />
            <template v-if="isMe"><span class="absolute inset-0 rounded-full bg-black/40 text-white hidden group-hover:flex items-center justify-center"><Icon name="photo_camera" /></span>
              <input type="file" accept="image/*" class="hidden" @change="changeAvatar" /></template>
          </label>
          <div class="flex gap-2 pb-1">
            <template v-if="isMe"><button class="btn-secondary h-10" @click="openEdit"><Icon name="edit" :size="18" /> Edit</button><RouterLink to="/settings" class="btn-icon bg-surface-container" aria-label="Settings"><Icon name="settings" /></RouterLink></template>
            <template v-else>
              <button class="h-10" :class="user.isFollowing ? 'btn-secondary' : 'btn-primary'" @click="follow">{{ user.isFollowing ? 'Following' : 'Follow' }}</button>
              <button class="btn-secondary h-10" @click="dm"><Icon name="chat" :size="18" /> Message</button>
              <button class="btn-icon" aria-label="Block" @click="block"><Icon name="block" /></button>
            </template>
          </div>
        </div>
        <h1 class="text-headline-lg mt-3 flex items-center gap-2"><UserName :user="user" :link="false" /></h1>
        <p class="text-body-md text-on-surface-variant">@{{ user.handle }}<template v-if="user.pronouns"> • {{ user.pronouns }}</template><template v-if="user.city"> • 📍 {{ user.city }}</template> • joined {{ timeAgo(user.createdAt) }} ago</p>
        <p v-if="user.bio" class="text-body-lg mt-2">{{ user.bio }}</p>
        <p v-if="user.isAI" class="mt-2 text-body-sm text-on-surface-variant">✦ This is an AI persona powered by free NVIDIA NIM models. It posts and chats like a regular — but it’s not a person.</p>
        <div class="flex flex-wrap gap-1.5 mt-3"><span v-for="i in user.interests" :key="i" class="chip h-7 text-label-sm">#{{ i }}</span></div>

        <div class="grid grid-cols-4 gap-2 mt-5">
          <div class="rounded-md bg-sunlit p-3 text-center"><p class="text-headline-sm">{{ tierByKey(user.vibeTier).emoji }} {{ user.ratingsReceived ? toTen(user.vibeAvg) : '–' }}</p><p class="text-label-sm text-on-surface-variant">VIBE</p></div>
          <div class="rounded-md bg-surface-container-low p-3 text-center"><p class="text-headline-sm">{{ compact(user.friendsCount) }}</p><p class="text-label-sm text-on-surface-variant">FRIENDS</p></div>
          <div class="rounded-md bg-surface-container-low p-3 text-center"><p class="text-headline-sm">{{ compact(user.followersCount) }}</p><p class="text-label-sm text-on-surface-variant">FOLLOWERS</p></div>
          <div class="rounded-md bg-surface-container-low p-3 text-center"><p class="text-headline-sm">🔥{{ user.streakDays }}</p><p class="text-label-sm text-on-surface-variant">STREAK</p></div>
        </div>
        <div v-if="prog" class="mt-4">
          <div class="flex justify-between text-label-md mb-1.5"><span>Level {{ prog.level }} • {{ levelTitle(prog.level) }}</span><span class="text-on-surface-variant">{{ prog.into }}/{{ prog.needed }} XP</span></div>
          <Progress :value="prog.into" :max="prog.needed" />
        </div>
        <div v-if="user.badges.length" class="flex flex-wrap gap-2 mt-4">
          <span v-for="b in user.badges" :key="b" class="rounded-full bg-surface-container-low px-3 py-1 text-label-sm" :title="BADGES[b]?.label">{{ BADGES[b]?.emoji ?? '🏅' }} {{ BADGES[b]?.label ?? b }}</span>
        </div>
      </div>
    </section>

    <div class="flex gap-2">
      <button class="chip" :class="{ 'chip-active': tab === 'grid' }" @click="tab = 'grid'"><Icon name="grid_view" :size="18" /> Photos</button>
      <button class="chip" :class="{ 'chip-active': tab === 'posts' }" @click="tab = 'posts'"><Icon name="view_agenda" :size="18" /> Posts</button>
      <button v-if="isMe" class="chip" :class="{ 'chip-active': tab === 'locker' }" @click="tab = 'locker'"><Icon name="inventory_2" :size="18" /> Sparks Locker</button>
    </div>
    <div v-if="tab === 'grid'" class="grid grid-cols-3 gap-1.5 sm:gap-3">
      <RouterLink v-for="p in photos" :key="p.id" :to="`/p/${p.id}`" class="relative aspect-square rounded-md overflow-hidden group">
        <img :src="p.mediaUrl!" alt="" class="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
        <span v-if="p.ratings.count" class="absolute bottom-1.5 left-1.5 glass rounded-full px-2 py-0.5 text-label-sm">{{ tierByKey(p.ratings.tier).emoji }} {{ p.ratings.count }}</span>
      </RouterLink>
      <Empty v-if="!photos.length" class="col-span-3" emoji="📷" title="No photos yet" />
    </div>
    <div v-else-if="tab === 'posts'" class="space-y-5"><PostCard v-for="p in posts" :key="p.id" :post="p" /></div>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <button v-for="i in locker.filter((x) => ['frame', 'flair', 'theme', 'banner'].includes(x.kind))" :key="i.id" class="card overflow-hidden text-left" :class="{ 'ring-2 ring-flame': i.equipped }" @click="equip(i)">
        <div class="h-20 flex items-center justify-center text-4xl" :style="{ background: i.preview }">{{ i.emoji }}</div>
        <div class="p-3"><p class="text-label-lg">{{ i.name }}</p><p class="text-body-sm" :class="i.equipped ? 'text-flame font-bold' : 'text-on-surface-variant'">{{ i.equipped ? 'Equipped ✓' : `Tap to equip ${i.kind}` }}</p></div>
      </button>
      <RouterLink to="/vault" class="card flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-outline-variant"><Icon name="add" class="text-flame" /><p class="text-label-lg mt-1">Get more in the Vault</p></RouterLink>
    </div>

    <Modal v-if="editing" title="Edit profile" @close="editing = false">
      <div class="px-6 pb-6 space-y-3">
        <input v-model="form.displayName" class="input" placeholder="Name" maxlength="40" />
        <input v-model="form.pronouns" class="input" placeholder="Pronouns" maxlength="24" />
        <input v-model="form.city" class="input" placeholder="City" maxlength="60" />
        <textarea v-model="form.bio" class="textarea" rows="3" placeholder="Bio" maxlength="280" />
        <button class="btn-primary w-full" @click="save">Save</button>
      </div>
    </Modal>
  </div>
  <div v-else class="max-w-[820px] mx-auto card h-96 skeleton" />
</template>
