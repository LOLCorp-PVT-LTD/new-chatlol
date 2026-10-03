<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { Lounge } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confirmDialog, promptDialog } from '../lib/dialog';
import LoungeEditor from '../components/LoungeEditor.vue';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';

const lounges = ref<Lounge[]>([]);
const load = async () => { lounges.value = (await api.lounges()).lounges; };
let t: ReturnType<typeof setInterval>;
onMounted(() => { void load(); t = setInterval(load, 15_000); });
onUnmounted(() => clearInterval(t));

/** Create / edit / delete (owners, and staff with the Lounges permission). */
const s = useSession();
const editing = ref<Lounge | null | 'new'>(null);
const menu = ref<string | null>(null);
async function remove(l: Lounge) {
  menu.value = null;
  const mine = l.owner?.id === s.user?.id;
  let reason = '';
  if (!mine && l.owner) {
    const r = await promptDialog({ title: `Delete “${l.name}”?`, body: `It belongs to @${l.owner.handle}. Tell them why (they’ll be notified).`, placeholder: 'Reason', confirmText: 'Delete', danger: true, required: true });
    if (r == null) return;
    reason = r;
  } else if (!(await confirmDialog({ title: `Delete “${l.name}”?`, body: 'The lounge and its chat history are removed for everyone.', danger: true }))) return;
  try {
    await api.deleteLounge(l.id, reason);
    lounges.value = lounges.value.filter((x) => x.id !== l.id);
    s.toast({ kind: 'info', title: 'Lounge deleted' });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
function saved(l: Lounge) {
  const i = lounges.value.findIndex((x) => x.id === l.id);
  if (i >= 0) lounges.value[i] = l;
  else lounges.value.unshift(l);
  editing.value = null;
}
</script>
<template>
  <div class="max-w-[900px] mx-auto space-y-5">
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex-1 min-w-0"><h1 class="text-headline-xl">Hangout Lounges 🛋️</h1><p class="text-body-md text-on-surface-variant">Drop into a room. Real-time chat, shared soundtrack, zero pressure.</p></div>
      <button v-if="s.user" class="btn-primary" @click="editing = 'new'"><Icon name="add" :size="20" /> Open a lounge</button>
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
      <RouterLink v-for="l in lounges" :key="l.id" :to="`/lounges/${l.id}`" class="rounded-lg bg-sunlit overflow-hidden shadow-warm hover:shadow-pop transition group">
        <div class="relative h-36 overflow-hidden">
          <img :src="l.coverUrl" alt="" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <span v-if="l.isLive" class="absolute top-3 left-3 bg-flame text-white rounded-full px-2.5 py-1 text-label-sm flex items-center gap-1"><span class="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE</span>
          <span class="absolute bottom-3 left-3 text-white text-headline-md drop-shadow">{{ l.emoji }} {{ l.name }}</span>
          <span v-if="l.festival" class="absolute top-3 right-3 rounded-full px-2.5 py-1 text-label-sm font-bold bg-white/90 text-[#3b2a00]">🎉 Festival lounge</span>
          <div v-else-if="l.canManage" class="absolute top-2 right-2" @click.prevent.stop>
            <button class="w-9 h-9 rounded-full bg-black/45 text-white backdrop-blur-sm flex items-center justify-center" aria-label="Manage lounge" @click="menu = menu === l.id ? null : l.id"><Icon name="more_horiz" :size="20" /></button>
            <div v-if="menu === l.id" class="absolute right-0 mt-1 w-40 card p-1 z-10 text-body-md">
              <button class="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low" @click="(editing = l), (menu = null)">✏️ Edit</button>
              <button class="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low text-error" @click="remove(l)">🗑️ Delete</button>
            </div>
          </div>
        </div>
        <div class="p-4">
          <p class="text-body-md text-on-surface-variant">{{ l.topic }}</p>
          <p v-if="l.owner" class="text-label-sm text-on-surface-variant mt-1">Hosted by @{{ l.owner.handle }}{{ l.owner.id === s.user?.id ? ' (you)' : '' }}</p>
          <p class="text-body-sm mt-2 flex items-center gap-1.5 text-secondary"><Icon name="graphic_eq" :size="16" /> {{ l.nowPlaying }}</p>
          <div class="flex items-center mt-3">
            <div class="flex -space-x-2"><Avatar v-for="m in l.memberPreview" :key="m.id" :user="m" :size="30" :show-online="false" class="ring-2 ring-sunlit rounded-full" /></div>
            <span class="text-label-md ml-3">{{ l.onlineCount }} here</span>
            <span class="btn-primary h-9 px-4 ml-auto text-label-md">Jump In</span>
          </div>
        </div>
      </RouterLink>
    </div>
    <LoungeEditor v-if="editing" :lounge="editing === 'new' ? null : editing" @close="editing = null" @saved="saved" />
  </div>
</template>
