<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { Gender, ProfileSong } from '@chatlol/shared';
import { GENDERS, INTEREST_GROUPS, MAX_INTERESTS, PROFILE_ACCENTS, PROFILE_BACKGROUNDS } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import { profileBg, bgIsDark } from '../lib/profileStyle';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import Avatar from './Avatar.vue';

/** Edit everything about your profile: look (background, accent, cover), song, and about-me details. */
const props = defineProps<{ initialTab?: 'look' | 'song' | 'about' }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();
const s = useSession();
const u = s.user!;
const tab = ref<'look' | 'song' | 'about'>(props.initialTab ?? 'look');
const busy = ref(false);
const look = ref({ background: { ...u.profile.background }, accent: u.profile.accent, coverUrl: u.profile.coverUrl, headline: u.profile.headline });
const about = ref({ displayName: u.displayName, bio: u.bio, pronouns: u.pronouns, city: u.city, gender: u.gender as Gender | null, interests: [...u.interests] });
const song = ref<ProfileSong | null>(u.profile.song);
const songInput = ref('');
const results = ref<ProfileSong[]>([]);
const searchSource = ref<'spotify' | 'apple'>('spotify');
const searching = ref(false);
/** Hear a search result before picking it (Apple previews). */
const previewing = ref<string | null>(null);
const previewAudio = new Audio();
previewAudio.onended = () => (previewing.value = null);
function previewTrack(r: ProfileSong) {
  if (previewing.value === r.id) { previewAudio.pause(); previewing.value = null; return; }
  if (!r.previewUrl) return;
  previewAudio.src = r.previewUrl;
  void previewAudio.play().then(() => (previewing.value = r.id)).catch(() => {});
}
onUnmounted(() => previewAudio.pause());
function pick(r: ProfileSong) { previewAudio.pause(); previewing.value = null; song.value = r; results.value = []; songInput.value = ''; }
const preview = computed(() => ({ ...u.profile, ...look.value }));

let t: ReturnType<typeof setTimeout>;
watch(songInput, (v) => {
  clearTimeout(t);
  if (!v.trim() || v.includes('spotify')) return (results.value = []);
  t = setTimeout(async () => {
    searching.value = true;
    try {
      const r = await api.songSearch(v.trim());
      searchSource.value = r.source;
      results.value = r.tracks;
    } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { searching.value = false; }
  }, 350);
});
async function useLink() {
  try { song.value = (await api.spotifyResolve(songInput.value.trim())).song; songInput.value = ''; } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
async function upload(e: Event, target: 'cover' | 'background') {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const url = await uploadImage(f);
  if (target === 'cover') look.value.coverUrl = url;
  else look.value.background = { kind: 'image', value: url };
}
const toggleInterest = (i: string) =>
  (about.value.interests = about.value.interests.includes(i) ? about.value.interests.filter((x) => x !== i) : about.value.interests.length >= MAX_INTERESTS ? about.value.interests : [...about.value.interests, i]);

async function save() {
  busy.value = true;
  try {
    await api.updateMe({ displayName: about.value.displayName, bio: about.value.bio, pronouns: about.value.pronouns, city: about.value.city, interests: about.value.interests });
    const r = await api.updateProfile({
      ...look.value,
      gender: about.value.gender ?? undefined,
      song: song.value,
    });
    s.applyUser(r.user);
    s.toast({ kind: 'info', title: 'Profile updated ✨' });
    previewAudio.pause();
    emit('saved');
    emit('close');
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = false; }
}
</script>

<template>
  <Modal title="Customize your profile" wide @close="previewAudio.pause(); emit('close')">
    <div class="px-6 pb-6 space-y-5">
      <!-- Live preview -->
      <div class="rounded-lg overflow-hidden relative h-36" :style="{ background: profileBg(preview) }">
        <img v-if="look.coverUrl" :src="look.coverUrl" alt="" class="absolute inset-x-0 top-0 h-16 w-full object-cover opacity-90" />
        <div class="absolute bottom-3 left-4 flex items-center gap-3" :class="bgIsDark(preview) ? 'text-white' : 'text-[#251911]'">
          <Avatar :user="u" :size="56" /><div><p class="text-headline-sm">{{ about.displayName }}</p><p class="text-body-sm opacity-90">{{ look.headline || 'Your headline' }}</p></div>
        </div>
        <span class="absolute top-3 right-3 rounded-full px-3 py-1 text-label-sm text-white" :style="{ background: look.accent }">Accent</span>
      </div>

      <div class="flex gap-2">
        <button v-for="x in ([['look', 'palette', 'Look'], ['song', 'music_note', 'Song'], ['about', 'person', 'About']] as const)" :key="x[0]" class="chip" :class="{ 'chip-active': tab === x[0] }" @click="tab = x[0]"><Icon :name="x[1]" :size="18" /> {{ x[2] }}</button>
      </div>

      <template v-if="tab === 'look'">
        <div><p class="label mb-2">Background</p>
          <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
            <button v-for="b in PROFILE_BACKGROUNDS" :key="b.key" class="aspect-square rounded-md ring-offset-2 ring-offset-surface-container-lowest transition" :class="{ 'ring-2 ring-flame': look.background.kind === 'preset' && look.background.value === b.key }" :style="{ background: b.css }" :title="b.label" :aria-label="b.label" @click="look.background = { kind: 'preset', value: b.key }" />
            <label class="aspect-square rounded-md border-2 border-dashed border-outline-variant flex flex-col items-center justify-center cursor-pointer text-label-sm" :class="{ 'ring-2 ring-flame': look.background.kind === 'image' }">
              <Icon name="add_photo_alternate" /> Photo<input type="file" accept="image/*" class="hidden" @change="upload($event, 'background')" /></label>
            <label class="aspect-square rounded-md border border-sandstone flex flex-col items-center justify-center cursor-pointer text-label-sm" :class="{ 'ring-2 ring-flame': look.background.kind === 'color' }">
              <Icon name="format_color_fill" /> Color<input type="color" class="sr-only" :value="look.background.kind === 'color' ? look.background.value : '#ff5e00'" @input="look.background = { kind: 'color', value: ($event.target as HTMLInputElement).value }" /></label>
          </div></div>
        <div><p class="label mb-2">Accent colour</p>
          <div class="flex gap-2 flex-wrap">
            <button v-for="c in PROFILE_ACCENTS" :key="c" class="w-9 h-9 rounded-full ring-offset-2 ring-offset-surface-container-lowest" :class="{ 'ring-2 ring-on-surface': look.accent === c }" :style="{ background: c }" :aria-label="`Accent ${c}`" @click="look.accent = c" />
          </div></div>
        <div><p class="label mb-2">Cover photo</p>
          <div class="flex gap-2">
            <label class="btn-secondary cursor-pointer"><Icon name="photo_camera" /> {{ look.coverUrl ? 'Change' : 'Upload' }}<input type="file" accept="image/*" class="hidden" @change="upload($event, 'cover')" /></label>
            <button v-if="look.coverUrl" class="btn-ghost" @click="look.coverUrl = null">Remove</button>
          </div></div>
        <div><p class="label mb-2">Headline</p><input v-model="look.headline" class="input" maxlength="80" placeholder="📷 Aspiring photographer & lo-fi beatmaker" /></div>
      </template>

      <template v-else-if="tab === 'song'">
        <div v-if="song" class="flex items-center gap-3 rounded-md bg-surface-container-low p-3">
          <img v-if="song.artUrl" :src="song.artUrl" alt="" class="w-14 h-14 rounded-md object-cover" /><span v-else class="w-14 h-14 rounded-md bg-sunset text-white flex items-center justify-center"><Icon name="music_note" /></span>
          <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ song.title || 'Spotify ' + song.type }}</p><p class="text-body-sm text-on-surface-variant truncate">{{ song.artist || 'Plays on your profile' }}</p></div>
          <button class="btn-ghost" @click="song = null">Remove</button>
        </div>
        <div>
          <p class="label mb-2">Find your song</p>
          <div class="relative"><Icon name="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" :size="20" />
            <input v-model="songInput" class="input pl-11" placeholder="Song or artist — e.g. Blinding Lights" autocomplete="off" />
            <button v-if="songInput.includes('spotify')" class="btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 h-10" @click="useLink">Use link</button></div>
          <p class="text-body-sm text-on-surface-variant mt-2">
            <template v-if="searchSource === 'spotify'">Searching Spotify. Visitors signed in to Spotify hear the full song; everyone else hears a 30-second preview.</template>
            <template v-else>Searching Apple Music — a 30-second preview loops on your profile.</template>
            You can also paste a Spotify link.
          </p>
        </div>
        <p v-if="searching" class="text-body-sm text-on-surface-variant">Searching…</p>
        <div class="max-h-80 overflow-y-auto -mx-2">
          <div v-for="r in results" :key="r.id" class="flex items-center gap-3 p-2 rounded-md hover:bg-surface-container-low">
            <button v-if="r.previewUrl" class="relative w-12 h-12 rounded overflow-hidden shrink-0 group" :aria-label="previewing === r.id ? 'Stop preview' : 'Preview'" @click="previewTrack(r)">
              <img v-if="r.artUrl" :src="r.artUrl" alt="" class="w-full h-full object-cover" />
              <span class="absolute inset-0 bg-black/40 text-white flex items-center justify-center" :class="previewing === r.id ? '' : 'opacity-0 group-hover:opacity-100'"><Icon :name="previewing === r.id ? 'pause' : 'play_arrow'" fill /></span>
            </button>
            <img v-else-if="r.artUrl" :src="r.artUrl" alt="" class="w-12 h-12 rounded object-cover shrink-0" />
            <div class="min-w-0 flex-1"><p class="text-label-lg truncate">{{ r.title }}</p><p class="text-body-sm text-on-surface-variant truncate">{{ r.artist }}</p></div>
            <button class="btn h-9 px-4 bg-sunset text-white shrink-0" @click="pick(r)">{{ song?.id === r.id ? 'Picked ✓' : 'Pick' }}</button>
          </div>
        </div>
        <p v-if="songInput.trim() && !searching && !results.length && !songInput.includes('spotify')" class="text-body-sm text-on-surface-variant">No songs found — try another spelling.</p>
        <p class="text-body-sm text-on-surface-variant">Your song starts playing when people open your profile (they can turn autoplay off in their settings).</p>
      </template>

      <template v-else>
        <input v-model="about.displayName" class="input" placeholder="Name" maxlength="40" />
        <div class="grid grid-cols-2 gap-2">
          <button v-for="g in GENDERS" :key="g.key" type="button" class="h-11 rounded-full border font-bold" :class="about.gender === g.key ? 'is-on' : 'border-sandstone'" @click="about.gender = g.key">{{ g.emoji }} {{ g.label }}</button>
        </div>
        <div class="grid grid-cols-2 gap-2"><input v-model="about.pronouns" class="input" placeholder="Pronouns" maxlength="24" /><input v-model="about.city" class="input" placeholder="City" maxlength="60" /></div>
        <textarea v-model="about.bio" class="textarea" rows="3" placeholder="Bio" maxlength="280" />
        <p class="label">Interests • {{ about.interests.length }}/{{ MAX_INTERESTS }}</p>
        <div class="space-y-3 max-h-64 overflow-y-auto">
          <div v-for="g in INTEREST_GROUPS" :key="g.label"><p class="text-label-sm text-on-surface-variant mb-1">{{ g.label }}</p>
            <div class="flex flex-wrap gap-1.5"><button v-for="i in g.items" :key="i" type="button" class="chip h-8 text-label-sm" :class="{ 'chip-active': about.interests.includes(i) }" @click="toggleInterest(i)">#{{ i }}</button></div></div>
        </div>
      </template>

      <button class="btn-primary w-full h-12" :disabled="busy" @click="save"><Icon name="save" /> {{ busy ? 'Saving…' : 'Save & apply' }}</button>
    </div>
  </Modal>
</template>
