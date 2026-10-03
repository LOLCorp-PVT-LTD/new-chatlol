<script setup lang="ts">
import GameTile from './GameTile.vue';
import type { ProfileGame } from '@chatlol/shared';
import RichText from '../RichText.vue';
import { computed } from 'vue';
import type { ProfileSection } from '@chatlol/shared';
import { GENDERS, SPACER_HEIGHTS, compact, formatDate, levelProgress, levelTitle, statusFor, tierByKey, timeAgo, toTen } from '@chatlol/shared';
import { BADGES } from '../../lib/cosmetics';
import PostCard from '../PostCard.vue';
import ShoutItem from '../ShoutItem.vue';
import ProfileSong from '../ProfileSong.vue';
import Icon from '../Icon.vue';
import { useProfileCtx } from './context';
import RatingBlock from './RatingBlock.vue';
import WallBlock from './WallBlock.vue';
import GalleryBlock from './GalleryBlock.vue';
import PhotoGrid from './PhotoGrid.vue';
import PeopleGrid from './PeopleGrid.vue';

/** What's inside one profile section, by type. */
const props = defineProps<{ section: ProfileSection }>();
const ctx = useProfileCtx();
const u = computed(() => ctx.user.value);
const c = computed(() => props.section.config);
const limit = computed(() => c.value.limit ?? 6);
const columns = computed(() => c.value.columns ?? 3);
const sc = computed(() => ctx.showcase.value);
const prog = computed(() => levelProgress(u.value.xp));
const gender = computed(() => GENDERS.find((g) => g.key === u.value.gender));
const first = computed(() => u.value.displayName.split(' ')[0]);
const own = (yours: string, theirs: string) => (ctx.isMe.value ? yours : theirs);
</script>

<template>
  <!-- About -->
  <div v-if="section.type === 'about'" class="space-y-2">
    <p v-if="u.profile.headline" class="text-headline-sm">{{ u.profile.headline }}</p>
    <p v-if="u.bio" class="text-body-lg whitespace-pre-line break-words"><RichText :text="u.bio" /></p>
    <p class="text-body-md muted flex flex-wrap gap-x-3 gap-y-1">
      <span v-if="u.city">📍 {{ u.city }}</span>
    </p>
    <p v-if="!u.bio && !u.profile.headline" class="text-body-md muted">{{ own('Add a headline and bio in Customize → About.', `${first} hasn’t written a bio yet.`) }}</p>
    <p v-if="u.isAI" class="text-body-sm muted">✦ AI persona — it posts and chats like a regular, but it isn’t a person.</p>
  </div>

  <!-- Details -->
  <dl v-else-if="section.type === 'details'" class="space-y-2 text-body-md">
    <div v-if="gender" class="flex justify-between gap-3"><dt class="muted">Gender</dt><dd class="font-bold">{{ gender.emoji }} {{ gender.label }}</dd></div>
    <div class="flex justify-between gap-3"><dt class="muted">Level</dt><dd class="font-bold">{{ prog.level }} · {{ levelTitle(prog.level) }}</dd></div>
    <div class="flex justify-between gap-3"><dt class="muted">Status</dt><dd class="font-bold" :style="{ color: statusFor(prog.level).color }">{{ statusFor(prog.level).emoji }} {{ statusFor(prog.level).label }}</dd></div>
    <div class="flex justify-between gap-3"><dt class="muted">Vibe</dt><dd class="font-bold">{{ tierByKey(u.vibeTier).emoji }} {{ tierByKey(u.vibeTier).label }}</dd></div>
    <div class="flex justify-between gap-3"><dt class="muted">Member since</dt><dd class="font-bold">{{ formatDate(u.createdAt.slice(0, 10)) }}</dd></div>
    <div class="flex justify-between gap-3"><dt class="muted">Last active</dt><dd class="font-bold">{{ u.online ? '🟢 Online now' : `${timeAgo(u.lastSeenAt)} ago` }}</dd></div>
  </dl>

  <!-- Interests -->
  <div v-else-if="section.type === 'interests'" class="flex flex-wrap gap-1.5">
    <span v-for="i in u.interests" :key="i" class="rounded-full px-3 py-1 text-label-md tile">#{{ i }}</span>
    <p v-if="!u.interests.length" class="text-body-md muted">No interests yet.</p>
  </div>

  <!-- Song -->
  <div v-else-if="section.type === 'song'">
    <ProfileSong v-if="u.profile.song && !ctx.editing.value" :song="u.profile.song" :autoplay="ctx.autoplay.value" />
    <div v-else-if="u.profile.song" class="flex items-center gap-3 rounded-md tile p-3">
      <img v-if="u.profile.song.artUrl" :src="u.profile.song.artUrl" alt="" class="w-12 h-12 rounded object-cover" /><Icon v-else name="music_note" />
      <div class="min-w-0"><p class="text-label-lg truncate">{{ u.profile.song.title || 'Your song' }}</p><p class="text-body-sm muted truncate">{{ u.profile.song.artist }}</p></div>
    </div>
    <p v-else class="text-body-md muted">{{ own('Pick a song in Customize → Song.', 'No song picked yet.') }}</p>
  </div>

  <!-- Stats -->
  <div v-else-if="section.type === 'stats'" class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
    <div class="tile rounded-md p-3"><p class="text-headline-md">{{ tierByKey(u.vibeTier).emoji }} {{ u.ratingsReceived ? toTen(u.vibeAvg) : '–' }}</p><p class="text-label-sm muted">Photo vibe</p></div>
    <div class="tile rounded-md p-3"><p class="text-headline-md">{{ compact(u.followersCount) }}</p><p class="text-label-sm muted">Followers</p></div>
    <div class="tile rounded-md p-3"><p class="text-headline-md">{{ compact(u.friendsCount) }}</p><p class="text-label-sm muted">Friends</p></div>
    <div class="tile rounded-md p-3"><p class="text-headline-md">🔥 {{ u.streakDays }}</p><p class="text-label-sm muted">Day streak</p></div>
  </div>

  <RatingBlock v-else-if="section.type === 'rating'" />
  <WallBlock v-else-if="section.type === 'wall'" :limit="limit" />
  <GalleryBlock v-else-if="section.type === 'gallery'" :columns="columns" />
  <PhotoGrid v-else-if="section.type === 'photos'" :photos="(sc.photos ?? []).slice(0, limit)" :columns="columns" />
  <PhotoGrid v-else-if="section.type === 'topPhotos'" :photos="(sc.topPhotos ?? []).slice(0, limit)" :columns="columns" empty="No rated photos yet" />

  <!-- Posts -->
  <div v-else-if="section.type === 'feed'" class="space-y-4" :class="{ 'pointer-events-none': ctx.editing.value }">
    <PostCard v-for="p in ctx.posts.value.slice(0, limit)" :key="p.id" :post="p" />
    <p v-if="!ctx.posts.value.length" class="text-body-md muted py-4 text-center">No posts yet</p>
  </div>

  <!-- Shouts -->
  <div v-else-if="section.type === 'shouts'" class="space-y-2" :class="{ 'pointer-events-none': ctx.editing.value }">
    <ShoutItem v-for="x in (sc.shouts ?? []).slice(0, limit)" :key="x.id" :shout="x" compact />
    <p v-if="!(sc.shouts ?? []).length" class="text-body-md muted py-4 text-center">No shouts yet 📣</p>
  </div>

  <PeopleGrid v-else-if="section.type === 'friends'" :people="(sc.friends ?? []).slice(0, limit)" :total="u.friendsCount" :empty="own('Follow people back to make friends.', 'No friends yet')" />
  <PeopleGrid v-else-if="section.type === 'followers'" :people="(sc.followers ?? []).slice(0, limit)" :total="u.followersCount" empty="No followers yet" />
  <PeopleGrid v-else-if="section.type === 'following'" :people="(sc.following ?? []).slice(0, limit)" :total="u.followingCount" empty="Not following anyone yet" />

  <!-- Badges -->
  <div v-else-if="section.type === 'badges'" class="flex flex-wrap gap-2">
    <span v-for="b in u.badges" :key="b" class="rounded-full tile px-3 py-1 text-label-md" :title="BADGES[b]?.label">{{ BADGES[b]?.emoji ?? '🏅' }} {{ BADGES[b]?.label ?? b }}</span>
    <p v-if="!u.badges.length" class="text-body-md muted">No badges yet.</p>
  </div>

  <!-- Level -->
  <div v-else-if="section.type === 'level'">
    <p class="text-headline-md">Level {{ prog.level }}</p>
    <p class="text-body-md muted mb-3">{{ statusFor(prog.level).emoji }} {{ statusFor(prog.level).label }} · {{ levelTitle(prog.level) }} · {{ compact(u.xp) }} XP</p>
    <div class="h-2.5 rounded-full tile overflow-hidden"><div class="h-full rounded-full" :style="{ width: `${Math.round((prog.into / prog.needed) * 100)}%`, background: ctx.accent.value }" /></div>
    <p class="text-body-sm muted mt-1.5">{{ prog.needed - prog.into }} XP to level {{ prog.level + 1 }}</p>
  </div>

  <!-- Forum threads -->
  <div v-else-if="section.type === 'threads'" class="space-y-1.5">
    <RouterLink v-for="t in (sc.threads ?? []).slice(0, limit)" :key="t.id" :to="`/forums/${t.id}`" class="block tile rounded-md px-3 py-2 hover:scale-[1.01] transition">
      <p class="text-label-lg truncate">{{ t.title }}</p><p class="text-body-sm muted">{{ t.boardName }} · {{ t.replyCount }} replies · {{ timeAgo(t.createdAt) }}</p>
    </RouterLink>
    <p v-if="!(sc.threads ?? []).length" class="text-body-md muted py-4 text-center">No threads yet 🧵</p>
  </div>

  <!-- Text box -->
  <p v-else-if="section.type === 'text'" class="text-body-lg whitespace-pre-line break-words"><RichText v-if="c.body" :text="c.body" /><template v-else>{{ ctx.editing.value ? 'Write something in this box’s settings ✏️' : '' }}</template></p>

  <!-- Quote -->
  <figure v-else-if="section.type === 'quote'" class="text-center py-2">
    <blockquote class="text-headline-lg leading-snug break-words">“{{ c.text || (ctx.editing.value ? 'Your quote goes here' : '') }}”</blockquote>
    <figcaption v-if="c.by" class="text-body-md muted mt-2">— {{ c.by }}</figcaption>
  </figure>

  <!-- Links -->
  <div v-else-if="section.type === 'links'" class="space-y-1.5">
    <a v-for="(l, i) in c.items ?? []" :key="i" :href="l.url" target="_blank" rel="noopener nofollow ugc" class="flex items-center gap-2 tile rounded-md px-3 py-2 hover:scale-[1.01] transition">
      <Icon name="link" :size="18" /><span class="text-label-lg truncate flex-1">{{ l.label }}</span><Icon name="open_in_new" :size="16" class="muted" />
    </a>
    <p v-if="!(c.items ?? []).length" class="text-body-md muted">{{ ctx.editing.value ? 'Add links in this box’s settings.' : 'No links yet.' }}</p>
  </div>

  <!-- Games I play -->
  <div v-else-if="section.type === 'games'">
    <div v-if="(c.items ?? []).length" class="grid gap-3" :class="section.size === 'third' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'">
      <GameTile v-for="g in (c.items as ProfileGame[])" :key="g.id" :game="g" />
    </div>
    <p v-else class="text-body-md muted">{{ ctx.editing.value ? 'Add your games from this box’s settings 🎮' : 'No games yet.' }}</p>
  </div>

  <!-- Currently -->
  <dl v-else-if="section.type === 'currently'" class="space-y-2">
    <div v-for="(it, i) in c.items ?? []" :key="i"><dt class="text-label-sm muted uppercase tracking-wide">{{ it.label }}</dt><dd class="text-body-lg font-bold break-words">{{ it.value }}</dd></div>
    <p v-if="!(c.items ?? []).length" class="text-body-md muted">{{ ctx.editing.value ? 'Fill this in from the box’s settings.' : 'Nothing yet.' }}</p>
  </dl>

  <!-- YouTube -->
  <div v-else-if="section.type === 'video'">
    <div v-if="c.videoId" class="aspect-video rounded-md overflow-hidden bg-black">
      <iframe v-if="!ctx.editing.value" :src="`https://www.youtube-nocookie.com/embed/${c.videoId}`" title="YouTube video" class="w-full h-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" />
      <img v-else :src="`https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`" alt="" class="w-full h-full object-cover" />
    </div>
    <p v-else class="text-body-md muted">{{ ctx.editing.value ? 'Paste a YouTube link in this box’s settings.' : '' }}</p>
  </div>

  <!-- Spacer -->
  <div v-else-if="section.type === 'spacer'" :style="{ height: `${SPACER_HEIGHTS[c.height ?? 'md']}px` }" :class="{ 'rounded-md border-2 border-dashed border-current opacity-30': ctx.editing.value }" />
</template>
