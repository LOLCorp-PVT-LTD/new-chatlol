import { onMounted, onUnmounted, ref, type Ref } from 'vue';

/**
 * Fullscreen for a game area. Uses the browser's Fullscreen API where it exists; where it doesn't (iPhone Safari)
 * the element is pinned over the whole viewport with CSS instead (`.game-fs` in main.css).
 */
export function useFullscreen(el: Ref<HTMLElement | undefined>) {
  const on = ref(false);
  const native = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled;
  const sync = () => {
    on.value = !!document.fullscreenElement && document.fullscreenElement === el.value;
    el.value?.classList.toggle('game-fs', on.value);
    dispatchEvent(new Event('resize'));
  };
  async function toggle() {
    const node = el.value;
    if (!node) return;
    if (native()) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      else await node.requestFullscreen({ navigationUI: 'hide' }).catch(() => fallback(node));
      return;
    }
    fallback(node);
  }
  function fallback(node: HTMLElement) {
    on.value = !on.value;
    node.classList.toggle('game-fs', on.value);
    document.documentElement.style.overflow = on.value ? 'hidden' : '';
    dispatchEvent(new Event('resize'));
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && on.value && !document.fullscreenElement) fallback(el.value!); };
  onMounted(() => { document.addEventListener('fullscreenchange', sync); addEventListener('keydown', onKey); });
  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', sync);
    removeEventListener('keydown', onKey);
    if (document.fullscreenElement === el.value) void document.exitFullscreen().catch(() => {});
    document.documentElement.style.overflow = '';
  });
  return { on, toggle };
}
