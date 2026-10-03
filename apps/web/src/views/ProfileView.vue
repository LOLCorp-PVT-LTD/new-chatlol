<script setup lang="ts">
import { loadFont } from '../lib/fonts';
import { confirmDialog, formDialog, reportDialog } from '../lib/dialog';
import { computed, onBeforeUnmount, onMounted, provide, ref, watch, watchEffect } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import type { Post, ProfileLayout, ProfileRatings, SectionType, Showcase, UserPublic, VibeScore, WallNote } from '@chatlol/shared';
import { CORNER_STYLES, LAYOUT_PRESETS, MAX_PROFILE_SECTIONS, PAGE_WIDTHS, PROFILE_FONTS, SHOWCASE_TYPES, defaultProfileLayout } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import { profileBg, bgIsDark } from '../lib/profileStyle';
import { PROFILE_CTX, type ProfileCtx } from '../components/profile/context';
import ProfileHeader from '../components/profile/ProfileHeader.vue';
import ProfileCanvas from '../components/profile/ProfileCanvas.vue';
import EditorPanel from '../components/profile/EditorPanel.vue';
import LockerModal from '../components/profile/LockerModal.vue';
import ProfileCustomizer from '../components/ProfileCustomizer.vue';
import ProfileSong from '../components/ProfileSong.vue';
import Empty from '../components/Empty.vue';
import Icon from '../components/Icon.vue';

/**
 * A member's profile page, laid out the way they built it: a header in their chosen style and their sections
 * on a grid. On your own profile, "Edit page" turns it into a drag-and-drop builder.
 */
const route = useRoute();
const router = useRouter();
const s = useSession();
const user = ref<UserPublic | null>(null);
const saved = ref<ProfileLayout>(defaultProfileLayout());
const layout = ref<ProfileLayout>(saved.value);
const posts = ref<Post[]>([]);
const ratings = ref<ProfileRatings | null>(null);
const counts = ref({ wall: 0, photos: 0 });
const gallery = ref<Post[]>([]);
const albums = ref<string[]>([]);
const album = ref<string | null>(null);
const wall = ref<WallNote[]>([]);
const showcase = ref<Showcase>({});
const uploading = ref(false);
const editing = ref(false);
const customizing = ref<null | 'look' | 'song' | 'about'>(null);
const locker = ref(route.path === '/locker');
const notFound = ref('');
const isMe = computed(() => !route.params.handle || route.params.handle === s.user?.handle);
const accent = computed(() => user.value?.profile.accent ?? '#ff5e00');
const darkBg = computed(() => bgIsDark(user.value?.profile));
const autoplay = computed(() => (s.user ? s.user.settings.autoplayMusic : true) && !isMe.value);
const loaded = { gallery: false, wall: false, showcase: new Set<string>() };

// ——— Loading: the profile, then only the data its sections need ———
async function load() {
  const handle = (route.params.handle as string) || s.user?.handle;
  if (!handle) return;
  try {
    const r = await api.user(handle);
    user.value = r.user;
    posts.value = r.posts;
    ratings.value = r.profileRatings;
    counts.value = { wall: r.wallCount, photos: r.photoCount };
    saved.value = r.user.profile.layout ?? defaultProfileLayout();
    layout.value = saved.value;
    loaded.gallery = loaded.wall = false;
    loaded.showcase.clear();
    showcase.value = {};
    await loadForSections();
    openEditorFromLink();
  } catch (e) { notFound.value = (e as Error).message; }
}
/** /page-builder and the account menu's "Edit my page" open your profile with ?edit=1. */
function openEditorFromLink() {
  if (!route.query.edit || !user.value || !isMe.value) return;
  if (!editing.value) startEditing();
  void router.replace({ query: { ...route.query, edit: undefined } });
}
watch(() => route.query.edit, openEditorFromLink);
async function loadForSections() {
  if (!user.value) return;
  const types = new Set(layout.value.sections.map((x) => x.type));
  const need = SHOWCASE_TYPES.filter((t) => types.has(t) && !loaded.showcase.has(t));
  need.forEach((t) => loaded.showcase.add(t));
  await Promise.all([
    types.has('gallery') && !loaded.gallery && ((loaded.gallery = true), loadGallery()),
    types.has('wall') && !loaded.wall && ((loaded.wall = true), loadWall()),
    need.length && api.showcase(user.value.id, need, 24).then((r) => (showcase.value = { ...showcase.value, ...r })),
  ]);
}
async function loadGallery() {
  const g = await api.gallery(user.value!.id, album.value ?? undefined);
  gallery.value = g.photos;
  albums.value = g.albums;
}
async function loadWall() { wall.value = (await api.wall(user.value!.id)).notes; }
watchEffect(load);
watch(() => layout.value.sections.map((x) => x.type).join(), () => void loadForSections());

// ——— What sections can do ———
const needAuth = () => { if (!s.user) { router.push('/join'); return true; } return false; };
const toastError = (e: unknown) => s.toast({ kind: 'error', title: (e as Error).message });
const ctx: ProfileCtx = {
  user: user as ProfileCtx['user'],
  layout,
  isMe,
  editing,
  accent,
  darkBg,
  autoplay,
  posts,
  ratings,
  counts,
  gallery,
  albums,
  album,
  uploading,
  wall,
  showcase,
  async rateProfile(score: VibeScore) {
    if (needAuth()) return;
    try { ratings.value = (await api.rateProfile(user.value!.id, score)).ratings; s.toast({ kind: 'info', title: 'Vibe locked in ⭐' }); } catch (e) { toastError(e); }
  },
  async postNote(body, mood, sticker = null) {
    if (needAuth()) return false;
    try {
      const r = await api.postWall(user.value!.id, { body, mood, sticker });
      wall.value.unshift(r.note);
      counts.value.wall++;
      return true;
    } catch (e) { toastError(e); return false; }
  },
  async deleteNote(id) {
    await api.deleteWallNote(id);
    wall.value = wall.value.filter((n) => n.id !== id);
    counts.value.wall--;
  },
  async setAlbum(a) {
    album.value = a;
    await loadGallery();
  },
  async addPhoto(f) {
    const answer = await formDialog({
      title: 'Add to your gallery',
      icon: 'add_a_photo',
      confirmText: 'Upload',
      fields: [
        { key: 'album', type: 'text', label: 'Album (optional)', placeholder: 'e.g. Golden Hour, Fits, Travel', value: album.value ?? '', maxLength: 40, suggestions: albums.value },
        { key: 'toFeed', type: 'toggle', label: 'Also share to the News Feed', hint: 'Off = it only shows in your gallery', value: false },
      ],
    });
    if (!answer) return;
    const albumName = String(answer.album ?? '');
    const toFeed = !!answer.toFeed;
    uploading.value = true;
    try {
      const mediaUrl = await uploadImage(f);
      const r = await api.createPost({ kind: 'photo', body: '', mediaUrl, album: albumName.trim() || null, inFeed: toFeed });
      s.reward(r.reward);
      await loadGallery();
      counts.value.photos++;
    } catch (e) { toastError(e); } finally { uploading.value = false; }
  },
};
provide(PROFILE_CTX, ctx);

// ——— Header actions ———
async function follow() {
  if (needAuth()) return;
  const r = await api.follow(user.value!.id);
  user.value = { ...user.value!, isFollowing: r.following, followersCount: user.value!.followersCount + (r.following ? 1 : -1) };
}
async function message() {
  if (needAuth()) return;
  try { router.push(`/messages/${(await api.openConversation(user.value!.id)).conversation.id}`); } catch (e) { toastError(e); }
}
async function block() {
  if (!(await confirmDialog({ title: `Block @${user.value!.handle}?`, body: 'They won’t be able to message you or see you in feeds. You can unblock them in Settings.', icon: 'block', danger: true, confirmText: 'Block' }))) return;
  await api.block(user.value!.id);
  router.push('/');
}
async function report() {
  const reason = await reportDialog(`@${user.value!.handle}`);
  if (!reason) return;
  await api.report({ targetType: 'user', targetId: user.value!.id, reason });
  s.toast({ kind: 'info', title: 'Thanks — LOLShield is reviewing it 🛡️' });
}
async function share() {
  const url = `${location.origin}/u/${user.value!.handle}`;
  if (navigator.share) await navigator.share({ title: user.value!.displayName, url }).catch(() => {});
  else { await navigator.clipboard.writeText(url); s.toast({ kind: 'info', title: 'Profile link copied 🔗' }); }
}
async function changeAvatar(f: File) {
  const url = await uploadImage(f);
  const r = await api.updateMe({ avatarUrl: url });
  s.applyUser(r.user);
  user.value = { ...user.value!, avatarUrl: url };
}

// ——— Page builder ———
const canvas = ref<InstanceType<typeof ProfileCanvas>>();
const selectedId = ref<string | null>(null);
const selected = computed(() => layout.value.sections.find((x) => x.id === selectedId.value) ?? null);
const history = ref<string[]>([]);
const cursor = ref(0);
const savingLayout = ref(false);
const panelOpen = ref(true);
const dirty = computed(() => editing.value && history.value[cursor.value] !== JSON.stringify(saved.value));
let snapTimer: ReturnType<typeof setTimeout> | undefined;

function startEditing() {
  layout.value = JSON.parse(JSON.stringify(saved.value));
  history.value = [JSON.stringify(layout.value)];
  cursor.value = 0;
  selectedId.value = null;
  editing.value = true;
  panelOpen.value = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
/** Records an undo step (typing is grouped into one step). */
function changed() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    const snap = JSON.stringify(layout.value);
    if (snap === history.value[cursor.value]) return;
    history.value = [...history.value.slice(0, cursor.value + 1), snap].slice(-80);
    cursor.value = history.value.length - 1;
  }, 250);
}
function restore(i: number) {
  clearTimeout(snapTimer);
  cursor.value = i;
  layout.value = JSON.parse(history.value[i]);
  if (selectedId.value && !layout.value.sections.some((x) => x.id === selectedId.value)) selectedId.value = null;
}
const undo = () => cursor.value > 0 && restore(cursor.value - 1);
const redo = () => cursor.value < history.value.length - 1 && restore(cursor.value + 1);
function applyPreset(key: string) {
  const p = LAYOUT_PRESETS.find((x) => x.key === key);
  if (!p) return;
  layout.value = p.build();
  selectedId.value = null;
  changed();
}
function removeSection(id: string) {
  layout.value.sections = layout.value.sections.filter((x) => x.id !== id);
  selectedId.value = null;
  changed();
}
async function cancelEditing() {
  if (dirty.value && !(await confirmDialog({ title: 'Discard your changes?', body: 'Your page goes back to how it was.', icon: 'undo', danger: true, confirmText: 'Discard' }))) return;
  layout.value = saved.value;
  editing.value = false;
  selectedId.value = null;
}
async function saveLayout() {
  clearTimeout(snapTimer);
  savingLayout.value = true;
  try {
    const r = await api.updateLayout(layout.value);
    s.applyUser(r.user);
    saved.value = r.layout;
    layout.value = r.layout;
    user.value = { ...user.value!, profile: { ...user.value!.profile, layout: r.layout } };
    editing.value = false;
    selectedId.value = null;
    if (r.premiumRemoved?.length) s.toast({ kind: 'info', title: 'Your page is live ✨', body: 'Premium-only looks and sections (👑) were left off. Get Premium to use them.' }, 6000);
    else s.toast({ kind: 'info', title: 'Your page is live ✨' });
  } catch (e) { toastError(e); } finally { savingLayout.value = false; }
}
function onKey(e: KeyboardEvent) {
  if (!editing.value) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saveLayout(); }
  else if (e.key === 'Escape' && !typing) selectedId.value = null;
}
const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty.value) e.preventDefault(); };
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', beforeUnload); });
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload); });
onBeforeRouteLeave(async () => !dirty.value || (await confirmDialog({ title: 'Leave without saving?', body: 'Your page changes will be lost.', icon: 'logout', danger: true, confirmText: 'Leave', cancelText: 'Keep editing' })));

/** After changing look/song/about: refresh the member's details, keeping any page edits in progress. */
async function lookSaved() {
  const r = await api.user(user.value!.handle);
  user.value = { ...r.user, profile: { ...r.user.profile, layout: saved.value } };
}

// ——— Page look ———
// Vault fonts come from Google Fonts: load the one this page uses.
watchEffect(() => loadFont(PROFILE_FONTS.find((f) => f.key === layout.value.font)?.family));
const pageStyle = computed(() => ({
  maxWidth: `${PAGE_WIDTHS.find((w) => w.key === layout.value.width)?.px ?? 1040}px`,
  fontFamily: PROFILE_FONTS.find((f) => f.key === layout.value.font)?.css,
  '--sec-radius': `${CORNER_STYLES.find((c) => c.key === layout.value.corners)?.px ?? 16}px`,
}));
// The member's background fills the whole window behind their page; the builder hides the site's top bar.
watchEffect(() => {
  const root = document.documentElement;
  if (user.value) {
    root.style.setProperty('--profile-bg', profileBg(user.value.profile));
    root.classList.add('has-profile-bg');
  }
  document.body.classList.toggle('profile-editing', editing.value);
});
onBeforeUnmount(() => {
  document.documentElement.classList.remove('has-profile-bg');
  document.documentElement.style.removeProperty('--profile-bg');
  document.body.classList.remove('profile-editing');
});
const songOutsideSections = computed(() => !!user.value?.profile.song && !layout.value.sections.some((x) => x.type === 'song'));
const full = () => s.toast({ kind: 'error', title: `A page can hold ${MAX_PROFILE_SECTIONS} sections` });
const addSection = (type: SectionType) => canvas.value?.addSection(type);
</script>

<template>
  <div v-if="user" :class="{ 'lg:pr-[380px] pt-14': editing }">

    <div class="mx-auto space-y-5" :style="pageStyle">
      <ProfileHeader
        @customize="customizing = 'look'"
        @edit-layout="startEditing"
        @locker="locker = true"
        @avatar="changeAvatar"
        @follow="follow"
        @message="message"
        @share="share"
        @report="report"
        @block="block"
      />
      <div v-if="songOutsideSections && !editing" class="max-w-md"><ProfileSong :song="user.profile.song!" :autoplay="autoplay" /></div>
      <ProfileCanvas ref="canvas" :selected="selectedId" @select="selectedId = $event" @changed="changed" @full="full" />
      <Empty v-if="!editing && !layout.sections.length" emoji="🧩" :title="isMe ? 'Your page is empty' : 'Nothing here yet'"><button v-if="isMe" class="btn-primary" @click="startEditing">Build your page</button></Empty>
    </div>

    <!-- Builder chrome -->
    <template v-if="editing">
      <div class="fixed top-0 inset-x-0 z-[60] h-14 bg-[#1a110c] text-white flex items-center gap-2 px-3 sm:px-5 shadow-float">
        <Icon name="dashboard_customize" class="text-tangerine" />
        <p class="text-label-lg hidden sm:block">Editing your page</p>
        <span v-if="dirty" class="text-label-sm text-inverse-primary hidden md:inline">· unsaved changes</span>
        <span class="flex-1" />
        <button class="w-10 h-10 rounded-full hover:bg-white/10 disabled:opacity-30 flex items-center justify-center" :disabled="cursor === 0" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo"><Icon name="undo" /></button>
        <button class="w-10 h-10 rounded-full hover:bg-white/10 disabled:opacity-30 flex items-center justify-center" :disabled="cursor >= history.length - 1" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" @click="redo"><Icon name="redo" /></button>
        <button class="lg:hidden h-10 px-3 rounded-full hover:bg-white/10 text-label-lg inline-flex items-center gap-1" @click="panelOpen = !panelOpen"><Icon :name="panelOpen ? 'expand_more' : 'add_box'" /> {{ panelOpen ? 'Hide' : 'Add & edit' }}</button>
        <button class="h-10 px-4 rounded-full hover:bg-white/10 text-label-lg" @click="cancelEditing">Cancel</button>
        <button class="h-10 px-5 rounded-full bg-sunset text-white text-label-lg disabled:opacity-60" :disabled="savingLayout" @click="saveLayout">{{ savingLayout ? 'Saving…' : 'Save' }}</button>
      </div>
      <aside
        v-show="panelOpen"
        class="fixed z-[55] bg-surface-container-lowest text-on-surface shadow-float inset-x-0 bottom-0 h-[52vh] rounded-t-xl lg:rounded-none lg:inset-x-auto lg:right-0 lg:top-14 lg:bottom-0 lg:h-auto lg:w-[360px] border-l border-outline-variant/40"
      >
        <EditorPanel :selected="selected" @add="addSection" @preset="applyPreset" @changed="changed" @deselect="selectedId = null" @remove="removeSection" @look="customizing = $event" />
      </aside>
    </template>

    <ProfileCustomizer v-if="customizing" :initial-tab="customizing" @close="customizing = null" @saved="lookSaved" />
    <LockerModal v-if="locker && isMe" @close="locker = false" @equipped="load" />
  </div>
  <div v-else-if="notFound" class="max-w-[820px] mx-auto"><Empty emoji="🔒" :title="notFound"><RouterLink v-if="!s.user" to="/login" class="btn-primary">Log in</RouterLink></Empty></div>
  <div v-else class="max-w-[820px] mx-auto card h-96 skeleton" />
</template>
