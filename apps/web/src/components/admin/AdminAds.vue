<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, uploadImage } from '../../lib/api';
import { useSession } from '../../stores/session';
import { adSlots, loadAds } from '../../lib/ads';
import AdSlot from '../AdSlot.vue';

/** Staff: switch ads on, and for each slot paste an ad network code or set a house ad (image + link). */
type Cfg = Awaited<ReturnType<typeof api.admin.ads>>;
const s = useSession();
const cfg = ref<Cfg | null>(null);
const saving = ref(false);
const blank = () => ({ enabled: false, mode: 'sandboxed' as const, code: '', imageUrl: null, linkUrl: null, height: null, every: null });
onMounted(async () => {
  const c = await api.admin.ads();
  for (const a of c.available) c.slots[a.key] = { ...blank(), ...c.slots[a.key] };
  cfg.value = c;
});
async function save() {
  if (!cfg.value) return;
  saving.value = true;
  try {
    const { available, ...b } = cfg.value;
    void available;
    cfg.value = { ...(await api.admin.saveAds(b)), available: cfg.value.available, slots: { ...cfg.value.slots } };
    await loadAds(true);
    s.toast({ kind: 'info', title: 'Ads saved ✅' });
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { saving.value = false; }
}
async function onImage(key: string, e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f && cfg.value) cfg.value.slots[key].imageUrl = await uploadImage(f);
}
</script>

<template>
  <div v-if="cfg" class="space-y-4">
    <section class="card p-5 space-y-3">
      <h2 class="text-headline-sm">Ads</h2>
      <label class="flex items-center gap-2 text-body-md"><input v-model="cfg.enabled" type="checkbox" class="accent-flame" /> Show ads</label>
      <label class="flex items-center gap-2 text-body-md"><input v-model="cfg.premiumAdFree" type="checkbox" class="accent-flame" /> Premium members see no ads</label>
      <p class="text-body-sm text-on-surface-variant">Paste the code your ad network gives you (e.g. Google AdSense, Ezoic, Media.net) into a slot. <b>Sandboxed</b> (recommended) runs it in a locked-down frame so a bad ad can’t touch members’ accounts. Use <b>Direct</b> only if a network won’t serve sandboxed — it runs the code on the page itself.</p>
      <button class="btn-primary" :disabled="saving" @click="save">Save</button>
    </section>
    <section v-for="a in cfg.available" :key="a.key" class="card p-5 space-y-3">
      <div class="flex items-center gap-3 flex-wrap"><label class="flex items-center gap-2 text-label-lg"><input v-model="cfg.slots[a.key].enabled" type="checkbox" class="accent-flame" /> {{ a.label }}</label><span class="text-body-sm text-on-surface-variant">{{ a.size }}</span>
        <span class="flex-1" />
        <select v-model="cfg.slots[a.key].mode" class="input h-9 w-auto"><option value="sandboxed">Sandboxed</option><option value="direct">Direct ⚠️</option></select></div>
      <textarea v-model="cfg.slots[a.key].code" class="input min-h-[90px] py-2 font-mono text-[12px]" placeholder="<script async src=…></script>  (ad network code)" />
      <div class="grid sm:grid-cols-4 gap-2 items-end">
        <label class="text-[11px]">House ad image<input type="file" accept="image/*" class="input h-9 py-1.5" @change="onImage(a.key, $event)" /></label>
        <label class="text-[11px]">House ad link<input v-model="cfg.slots[a.key].linkUrl" class="input h-9" placeholder="https://…" /></label>
        <label class="text-[11px]">Height (px)<input v-model.number="cfg.slots[a.key].height" type="number" min="50" max="800" class="input h-9" /></label>
        <label v-if="a.every" class="text-[11px]">Every N posts<input v-model.number="cfg.slots[a.key].every" type="number" min="2" max="50" class="input h-9" :placeholder="String(a.every)" /></label>
      </div>
      <div v-if="adSlots[a.key]" class="rounded-md border border-dashed border-outline-variant p-2"><p class="text-label-sm text-on-surface-variant mb-1">Live preview</p><AdSlot :placement="a.key" /></div>
    </section>
  </div>
</template>
