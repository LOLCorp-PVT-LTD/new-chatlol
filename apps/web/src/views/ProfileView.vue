<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Post, ProfileRatings, StoreItem, UserPublic, VibeScore, WallNote } from '@chatlol/shared';
import { GENDERS, WALL_MOODS, compact, levelProgress, levelTitle, tierByKey, toTen, timeAgo } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import { BADGES } from '../lib/cosmetics';
import { profileBg, bgIsDark } from '../lib/profileStyle';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Progress from '../components/Progress.vue';
import PostCard from '../components/PostCard.vue';
import TierPad from '../components/TierPad.vue';
import TierBars from '../components/TierBars.vue';
import ProfileSong from '../components/ProfileSong.vue';
import ProfileCustomizer from '../components/ProfileCustomizer.vue';
import Empty from '../components/Empty.vue';

const route = useRoute();
const router = useRouter();
const s = useSession();
const user = ref<UserPublic | null>(null);
const posts = ref<Post[]>([]);
const ratings = ref<ProfileRatings | null>(null);
const counts = ref({ wall: 0, photos: 0 });
const gallery = ref<Post[]>([]);
const albums = ref<string[]>([]);
const album = ref<string | null>(null);
const wall = ref<WallNote[]>([]);
const note = ref({ body: '', mood: 'hyped' as string | null });
const locker = ref<StoreItem[]>([]);
const tab = ref<'photos' | 'posts' | 'wall' | 'locker'>('photos');
const customizing = ref(false);
const uploading = ref(false);
const notFound = ref('');
const isMe = computed(() => !route.params.handle || route.params.handle === s.user?.handle);
const prog = computed(() => (user.value ? levelProgress(user.value.xp) : null));
const dark = computed(() => bgIsDark(user.value?.profile));
const accent = computed(() => user.value?.profile.accent ?? '#ff5e00');
const gender = computed(() => GENDERS.find((g) => g.key === user.value?.gender));
const autoplay = computed(() => (s.user ? s.user.settings.autoplayMusic : true) && !isMe.value);

async function load() {
  const handle = (route.params.handle as string) || s.user?.handle;
  if (!handle) return;
  try {
    const r = await api.user(handle);
    user.value = r.user;
    posts.value = r.posts;
    ratings.value = r.profileRatings;
    counts.value = { wall: r.wallCount, photos: r.photoCount };
    await Promise.all([loadGallery(), loadWall()]);
    if (isMe.value) locker.value = (await api.inventory()).items;
  } catch (e) { notFound.value = (e as Error).message; }
}
async function loadGallery() {
  const g = await api.gallery(user.value!.id, album.value ?? undefined);
  gallery.value = g.photos;
  albums.value = g.albums;
}
async function loadWall() { wall.value = (await api.wall(user.value!.id)).notes; }
watchEffect(load);

const needAuth = () => { if (!s.user) { router.push('/join'); return true; } return false; };
async function follow() {
  if (needAuth()) return;
  const r = await api.follow(user.value!.id);
  user.value = { ...user.value!, isFollowing: r.following, followersCount: user.value!.followersCount + (r.following ? 1 : -1) };
}
async function dm() {
  if (needAuth()) return;
  try { router.push(`/messages/${(await api.openConversation(user.value!.id)).conversation.id}`); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function rateProfile(score: VibeScore) {
  if (needAuth()) return;
  try { ratings.value = (await api.rateProfile(user.value!.id, score)).ratings; s.toast({ kind: 'info', title: 'Vibe locked in ⭐' }); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function postNote() {
  if (needAuth() || !note.value.body.trim()) return;
  try {
    const r = await api.postWall(user.value!.id, { body: note.value.body.trim(), mood: note.value.mood });
    wall.value.unshift(r.note);
    counts.value.wall++;
    note.value.body = '';
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function deleteNote(id: string) {
  await api.deleteWallNote(id);
  wall.value = wall.value.filter((n) => n.id !== id);
}
async function block() {
  if (!confirm(`Block @${user.value!.handle}? They won’t be able to message you or see you in feeds.`)) return;
  await api.block(user.value!.id);
  router.push('/');
}
async function report() {
  const reason = prompt(`Why are you reporting @${user.value!.handle}?`);
  if (!reason) return;
  await api.report({ targetType: 'user', targetId: user.value!.id, reason });
  s.toast({ kind: 'info', title: 'Thanks — SafeShield is reviewing it 🛡️' });
}
async function share() {
  const url = `${location.origin}/u/${user.value!.handle}`;
  if (navigator.share) await navigator.share({ title: user.value!.displayName, url }).catch(() => {});
  else { await navigator.clipboard.writeText(url); s.toast({ kind: 'info', title: 'Profile link copied 🔗' }); }
}
async function changeAvatar(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const url = await uploadImage(f);
  const r = await api.updateMe({ avatarUrl: url });
  s.applyUser(r.user);
  user.value = { ...user.value!, avatarUrl: url };
}
async function addPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const albumName = prompt('Album (optional) — e.g. Golden Hour, Fits, Travel', album.value ?? '') ?? '';
  const toFeed = confirm('Also share this photo to the News Feed?');
  uploading.value = true;
  try {
    const mediaUrl = await uploadImage(f);
    const r = await api.createPost({ kind: 'photo', body: '', mediaUrl, album: albumName.trim() || null, inFeed: toFeed });
    s.reward(r.reward);
    await loadGallery();
    counts.value.photos++;
  } catch (err) { s.toast({ kind: 'error', title: (err as Error).message }); } finally { uploading.value = false; }
}
async function equip(i: StoreItem) {
  const r = await api.equip({ [i.kind]: i.equipped ? null : i.id });
  s.applyUser(r.user);
  user.value = { ...user.value!, cosmetics: r.user.cosmetics };
  locker.value = (await api.inventory()).items;
}
function customized() { void load(); }
</script>

<template>
  <div v-if="user" class="max-w-[880px] mx-auto space-y-5" :style="{ '--accent': accent }">
    <!-- Showcase header on the member's chosen background -->
    <section class="rounded-lg overflow-hidden shadow-float" :style="{ background: profileBg(user.profile) }">
      <div class="relative h-36 sm:h-48">
        <img v-if="user.profile.coverUrl" :src="user.profile.coverUrl" alt="" class="absolute inset-0 w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-b from-transparent to-black/25" />
        <div class="absolute top-4 right-4 flex gap-2">
          <span v-if="user.premium" class="rounded-full bg-black/40 text-white px-3 py-1 text-label-sm backdrop-blur">👑 Premium</span>
          <span v-if="user.isAI" class="rounded-full bg-black/40 text-white px-3 py-1 text-label-sm backdrop-blur" title="AI persona">✦ AI persona</span>
        </div>
      </div>
      <div class="px-5 sm:px-8 pb-6 -mt-16 relative" :class="dark ? 'text-white' : 'text-[#251911]'">
        <div class="flex items-end justify-between gap-3 flex-wrap">
          <label class="relative" :class="{ 'cursor-pointer group': isMe }">
            <Avatar :user="user" :size="120" class="ring-4 ring-white/80 rounded-full" />
            <template v-if="isMe"><span class="absolute inset-0 rounded-full bg-black/40 text-white hidden group-hover:flex items-center justify-center"><Icon name="photo_camera" /></span>
              <input type="file" accept="image/*" class="hidden" @change="changeAvatar" /></template>
          </label>
          <div class="flex gap-2 pb-1 flex-wrap">
            <template v-if="isMe">
              <button class="btn h-10 text-white" :style="{ background: accent }" @click="customizing = true"><Icon name="palette" :size="18" /> Customize</button>
              <RouterLink to="/insights" class="btn h-10 bg-white/90 text-[#251911]"><Icon name="visibility" :size="18" /> Who viewed me</RouterLink>
              <RouterLink to="/settings" class="btn-icon bg-white/90 text-[#251911]" aria-label="Settings"><Icon name="settings" /></RouterLink>
            </template>
            <template v-else>
              <button class="btn h-10 text-white" :style="{ background: user.isFollowing ? 'rgba(0,0,0,.35)' : accent }" @click="follow">{{ user.isFollowing ? 'Following ✓' : 'Follow' }}</button>
              <button class="btn h-10 bg-white/90 text-[#251911]" @click="dm"><Icon name="chat" :size="18" /> Message</button>
              <button class="btn-icon bg-white/90 text-[#251911]" aria-label="Share profile" @click="share"><Icon name="share" /></button>
              <button class="btn-icon bg-white/90 text-[#251911]" aria-label="Report" title="Report" @click="report"><Icon name="flag" /></button>
              <button class="btn-icon bg-white/90 text-[#251911]" aria-label="Block" title="Block" @click="block"><Icon name="block" /></button>
            </template>
          </div>
        </div>
        <h1 class="text-headline-xl mt-3 flex items-center gap-2 flex-wrap">{{ user.displayName }} <span v-if="gender" class="text-headline-sm" :title="gender.label">{{ gender.emoji }}</span>
          <span class="rounded-full px-3 py-1 text-label-md" :class="dark ? 'bg-white/20' : 'bg-black/10'">{{ tierByKey(user.vibeTier).emoji }} {{ tierByKey(user.vibeTier).label.toUpperCase() }}</span></h1>
        <p class="text-body-md opacity-90">@{{ user.handle }}<template v-if="user.pronouns"> • {{ user.pronouns }}</template><template v-if="user.city"> • 📍 {{ user.city }}</template> • {{ user.online ? '🟢 Online' : `Active ${timeAgo(user.lastSeenAt)} ago` }}</p>
        <p v-if="user.profile.headline" class="text-headline-sm mt-2">{{ user.profile.headline }}</p>
        <p v-if="user.bio" class="text-body-lg mt-1 opacity-95">{{ user.bio }}</p>
        <div class="flex flex-wrap gap-1.5 mt-3"><span v-for="i in user.interests" :key="i" class="rounded-full px-3 py-1 text-label-sm" :class="dark ? 'bg-white/20' : 'bg-black/10'">#{{ i }}</span></div>
        <div v-if="user.profile.song" class="mt-4 max-w-md"><ProfileSong :song="user.profile.song" :autoplay="autoplay" /></div>
        <p v-if="user.isAI" class="mt-3 text-body-sm opacity-90">✦ AI persona — it posts and chats like a regular, but it isn’t a person.</p>
      </div>
    </section>

    <!-- Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="card p-4 text-center"><p class="text-headline-md">{{ tierByKey(user.vibeTier).emoji }} {{ user.ratingsReceived ? toTen(user.vibeAvg) : '–' }}</p><p class="label">Photo vibe</p></div>
      <div class="card p-4 text-center"><p class="text-headline-md">{{ compact(user.followersCount) }}</p><p class="label">Followers</p></div>
      <div class="card p-4 text-center"><p class="text-headline-md">{{ compact(user.friendsCount) }}</p><p class="label">Friends</p></div>
      <div class="card p-4 text-center"><p class="text-headline-md">🔥 {{ user.streakDays }}</p><p class="label">Day streak</p></div>
    </div>

    <!-- Profile vibe consensus -->
    <section v-if="ratings" class="card p-5 grid sm:grid-cols-2 gap-5">
      <div>
        <p class="label">Community Vibe Consensus</p>
        <p class="text-headline-lg mt-1">{{ ratings.count ? `${ratings.consensusPct}% ${tierByKey(ratings.tier).label}` : 'No ratings yet' }}</p>
        <p class="text-body-sm text-on-surface-variant mb-3">{{ ratings.count }} profile rating{{ ratings.count === 1 ? '' : 's' }}</p>
        <TierBars :ratings="ratings" />
      </div>
      <div v-if="!isMe" class="flex flex-col justify-center">
        <p class="text-headline-sm mb-2">Rate {{ user.displayName.split(' ')[0] }}’s profile vibe</p>
        <TierPad :model-value="ratings.myRating" @rate="rateProfile" />
        <p class="text-body-sm text-on-surface-variant mt-2">Ratings are anonymous unless they have Premium 👑</p>
      </div>
      <div v-else class="flex flex-col justify-center gap-3">
        <div v-if="prog"><div class="flex justify-between text-label-md mb-1.5"><span>Level {{ prog.level }} • {{ levelTitle(prog.level) }}</span><span class="text-on-surface-variant">{{ prog.into }}/{{ prog.needed }} XP</span></div><Progress :value="prog.into" :max="prog.needed" /></div>
        <RouterLink to="/insights" class="btn-secondary"><Icon name="visibility" /> See who rated & viewed you</RouterLink>
      </div>
    </section>

    <div v-if="user.badges.length" class="flex flex-wrap gap-2">
      <span v-for="b in user.badges" :key="b" class="rounded-full bg-surface-container-low px-3 py-1 text-label-sm" :title="BADGES[b]?.label">{{ BADGES[b]?.emoji ?? '🏅' }} {{ BADGES[b]?.label ?? b }}</span>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 overflow-x-auto scrollbar-none">
      <button class="chip" :class="{ 'chip-active': tab === 'photos' }" @click="tab = 'photos'"><Icon name="photo_library" :size="18" /> Photos {{ counts.photos }}</button>
      <button class="chip" :class="{ 'chip-active': tab === 'posts' }" @click="tab = 'posts'"><Icon name="view_agenda" :size="18" /> Posts</button>
      <button class="chip" :class="{ 'chip-active': tab === 'wall' }" @click="tab = 'wall'"><Icon name="sticky_note_2" :size="18" /> Wall {{ counts.wall }}</button>
      <button v-if="isMe" class="chip" :class="{ 'chip-active': tab === 'locker' }" @click="tab = 'locker'"><Icon name="inventory_2" :size="18" /> Sparks Locker</button>
    </div>

    <!-- Gallery -->
    <div v-if="tab === 'photos'" class="space-y-3">
      <div class="flex gap-2 overflow-x-auto scrollbar-none items-center">
        <button class="chip" :class="{ 'chip-active': !album }" @click="album = null; loadGallery()">All photos</button>
        <button v-for="a in albums" :key="a" class="chip" :class="{ 'chip-active': album === a }" @click="album = a; loadGallery()">{{ a }}</button>
        <label v-if="isMe" class="chip cursor-pointer border-flame text-flame"><Icon name="add_a_photo" :size="18" /> {{ uploading ? 'Uploading…' : 'Add photo' }}<input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="addPhoto" /></label>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <RouterLink v-for="p in gallery" :key="p.id" :to="`/p/${p.id}`" class="relative aspect-[4/5] rounded-md overflow-hidden group">
          <img :src="p.mediaUrl!" alt="" class="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
          <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent text-white">
            <p v-if="p.album" class="text-label-sm opacity-90">{{ p.album }}</p>
            <p class="text-label-md">{{ p.ratings.count ? `${tierByKey(p.ratings.tier).emoji} ${tierByKey(p.ratings.tier).label} • ${p.ratings.count} votes` : 'Be the first to rate' }} • 💬 {{ p.commentCount }}</p>
          </div>
        </RouterLink>
      </div>
      <Empty v-if="!gallery.length" emoji="📷" title="No photos yet" :body="isMe ? 'Add photos to your showcase — people can rate each one.' : undefined" />
    </div>

    <div v-else-if="tab === 'posts'" class="space-y-5"><PostCard v-for="p in posts" :key="p.id" :post="p" /><Empty v-if="!posts.length" emoji="📝" title="No posts yet" /></div>

    <!-- Wall -->
    <div v-else-if="tab === 'wall'" class="space-y-3">
      <form v-if="s.user" class="card p-4 space-y-3" @submit.prevent="postNote">
        <textarea v-model="note.body" class="textarea" rows="2" maxlength="280" :placeholder="isMe ? 'Pin a note on your own wall…' : `Leave a note on ${user.displayName.split(' ')[0]}’s wall…`" />
        <div class="flex gap-2 flex-wrap items-center">
          <button v-for="m in WALL_MOODS" :key="m.key" type="button" class="chip h-8 text-label-sm" :class="{ 'chip-active': note.mood === m.key }" @click="note.mood = m.key">{{ m.emoji }} {{ m.label }}</button>
          <span class="flex-1" /><button class="btn h-10 text-white" :style="{ background: accent }" :disabled="!note.body.trim()"><Icon name="send" :size="18" /> Post note</button>
        </div>
      </form>
      <div v-for="n in wall" :key="n.id" class="card p-4 flex gap-3">
        <RouterLink :to="`/u/${n.author.handle}`"><Avatar :user="n.author" :size="40" /></RouterLink>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-body-sm"><UserName :user="n.author" /><span v-if="n.mood" class="text-label-sm">{{ WALL_MOODS.find((m) => m.key === n.mood)?.emoji }}</span><span class="text-on-surface-variant">{{ timeAgo(n.createdAt) }}</span></div>
          <p class="text-body-lg mt-0.5 break-words">{{ n.body }}</p>
        </div>
        <button v-if="isMe || n.author.id === s.user?.id" class="btn-icon w-8 h-8" aria-label="Delete note" @click="deleteNote(n.id)"><Icon name="delete" :size="18" /></button>
      </div>
      <Empty v-if="!wall.length" emoji="📝" title="The wall is empty" body="Leave the first note!" />
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <button v-for="i in locker.filter((x) => ['frame', 'flair', 'theme', 'banner'].includes(x.kind))" :key="i.id" class="card overflow-hidden text-left" :class="{ 'ring-2 ring-flame': i.equipped }" @click="equip(i)">
        <div class="h-20 flex items-center justify-center text-4xl" :style="{ background: i.preview }">{{ i.emoji }}</div>
        <div class="p-3"><p class="text-label-lg">{{ i.name }}</p><p class="text-body-sm" :class="i.equipped ? 'text-flame font-bold' : 'text-on-surface-variant'">{{ i.equipped ? 'Equipped ✓' : `Tap to equip ${i.kind}` }}</p></div>
      </button>
      <RouterLink to="/vault" class="card flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-outline-variant"><Icon name="add" class="text-flame" /><p class="text-label-lg mt-1">Get more in the Vault</p></RouterLink>
    </div>

    <ProfileCustomizer v-if="customizing" @close="customizing = false" @saved="customized" />
  </div>
  <div v-else-if="notFound" class="max-w-[820px] mx-auto"><Empty emoji="🔒" :title="notFound"><RouterLink v-if="!s.user" to="/login" class="btn-primary">Log in</RouterLink></Empty></div>
  <div v-else class="max-w-[820px] mx-auto card h-96 skeleton" />
</template>
