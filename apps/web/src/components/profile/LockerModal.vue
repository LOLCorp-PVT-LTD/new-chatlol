<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { StoreItem } from '@chatlol/shared';
import { api } from '../../lib/api';
import { useSession } from '../../stores/session';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

/** Your Sparks Locker: equip frames, flair, themes and banners you own. */
const emit = defineEmits<{ (e: 'close'): void; (e: 'equipped'): void }>();
const s = useSession();
const items = ref<StoreItem[]>([]);
const load = async () => (items.value = (await api.inventory()).items.filter((x) => ['frame', 'flair', 'theme', 'banner'].includes(x.kind)));
onMounted(load);
async function equip(i: StoreItem) {
  const r = await api.equip({ [i.kind]: i.equipped ? null : i.id });
  s.applyUser(r.user);
  await load();
  emit('equipped');
}
</script>

<template>
  <Modal title="Sparks Locker" wide @close="emit('close')">
    <div class="px-6 pb-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
      <button v-for="i in items" :key="i.id" class="card overflow-hidden text-left" :class="{ 'ring-2 ring-flame': i.equipped }" @click="equip(i)">
        <div class="h-20 flex items-center justify-center text-4xl" :style="{ background: i.preview }">{{ i.emoji }}</div>
        <div class="p-3"><p class="text-label-lg">{{ i.name }}</p><p class="text-body-sm" :class="i.equipped ? 'text-flame font-bold' : 'text-on-surface-variant'">{{ i.equipped ? 'Equipped ✓' : `Tap to equip ${i.kind}` }}</p></div>
      </button>
      <RouterLink to="/vault" class="card flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-outline-variant" @click="emit('close')"><Icon name="add" class="text-flame" /><p class="text-label-lg mt-1">Get more in the Vault</p></RouterLink>
    </div>
  </Modal>
</template>
