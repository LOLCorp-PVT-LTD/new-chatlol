import { ref } from 'vue';
import { api } from './api';

type Slots = Awaited<ReturnType<typeof api.ads>>['slots'];
/** The viewer's ad slots, fetched once per session (and again after sign-in, when Premium may hide them). */
export const adSlots = ref<Slots>({});
let loaded: Promise<void> | null = null;
export function loadAds(force = false) {
  if (!loaded || force) loaded = api.ads().then((r) => void (adSlots.value = r.slots)).catch(() => void (adSlots.value = {}));
  return loaded;
}
