import { onUnmounted, ref } from 'vue';

/** A ticking "now" for countdowns and animations (requestAnimationFrame, or a slower interval). */
export function useNow(fps: 'frame' | number = 4) {
  const now = ref(Date.now());
  let raf = 0;
  let int: ReturnType<typeof setInterval> | undefined;
  if (fps === 'frame') {
    const loop = () => {
      now.value = Date.now();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  } else int = setInterval(() => (now.value = Date.now()), 1000 / fps);
  onUnmounted(() => {
    cancelAnimationFrame(raf);
    clearInterval(int);
  });
  return now;
}
