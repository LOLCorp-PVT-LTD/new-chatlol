<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Gender, ProfileSong } from '@chatlol/shared';
import { GENDERS, INTEREST_GROUPS, MAX_INTERESTS, PROFILE_ACCENTS, PROFILE_BACKGROUNDS } from '@chatlol/shared';
import { api, uploadImage } from '../lib/api';
import { useSession } from '../stores/session';
import { profileBg, bgIsDark } from '../lib/profileStyle';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import Avatar from './Avatar.vue';

/** Edit everything about your profile: look (background, accent, cover), song, and about-me details. */
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();
const s = useSession();
const u = s.user!;
const tab = ref<'look' | 'song' | 'about'>('look');
const busy = ref(false);
const look = ref({ background: { ...u.profile.background }, accent: u.profile.accent, coverUrl: u.profile.coverUrl, headline: u.profile.headline });
const about = ref({ displayName: u.displayName, bio: u.bio, pronouns: u.pronouns, city: u.city, gender: u.gender as Gender | null, interests: [...u.interests] });
const song = ref<ProfileSong | null>(u.profile.song);
const songInput = ref('');
const results = ref<ProfileSong[]>([]);
const searchEnabled = ref(true);
const preview = computed(() => ({ ...u.profile, ...look.value }));

let t: ReturnType<typeof setTimeout>;
watch(songInput, (v) => {
  clearTimeout(t);
  if (!v.trim() || v.includes('spotify')) return (results.value = []);
  t = setTimeout(async () => {
    const r = await api.spotifySearch(v.trim());
    searchEnabled.value = r.enabled;
    results.value = r.tracks;
  }, 300);
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
      song: song.value ? { type: song.value.type, id: song.value.id, title: song.value.title, artist: song.value.artist, artUrl: song.value.artUrl } : null,
    });
    s.applyUser(r.user);
    s.toast({ kind: 'info', title: 'Profile updated ✨' });
    emit('saved');
    emit('close');
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { busy.value = false; }
}
</script>

<template>
  <Modal title="Customize your profile" wide @close="emit('close')">
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
          <p class="label mb-2">{{ searchEnabled ? 'Search Spotify or paste a link' : 'Paste a Spotify link' }}</p>
          <div class="flex gap-2"><input v-model="songInput" class="input" placeholder="https://open.spotify.com/track/…" />
            <button v-if="songInput.includes('spotify')" class="btn-primary" @click="useLink">Use</button></div>
          <p v-if="!searchEnabled" class="text-body-sm text-on-surface-variant mt-2">In Spotify: Share → Copy Song Link, then paste it here.</p>
        </div>
        <button v-for="r in results" :key="r.id" class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-surface-container-low text-left" @click="song = r; results = []; songInput = ''">
          <img v-if="r.artUrl" :src="r.artUrl" alt="" class="w-11 h-11 rounded object-cover" /><div class="min-w-0"><p class="text-label-lg truncate">{{ r.title }}</p><p class="text-body-sm text-on-surface-variant truncate">{{ r.artist }}</p></div>
        </button>
        <p class="text-body-sm text-on-surface-variant">Your song starts playing when people open your profile (they can turn autoplay off in their settings).</p>
      </template>

      <template v-else>
        <input v-model="about.displayName" class="input" placeholder="Name" maxlength="40" />
        <div class="grid grid-cols-2 gap-2">
          <button v-for="g in GENDERS" :key="g.key" type="button" class="h-11 rounded-full border font-bold" :class="about.gender === g.key ? 'bg-sunset text-white border-transparent' : 'border-sandstone'" @click="about.gender = g.key">{{ g.emoji }} {{ g.label }}</button>
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
