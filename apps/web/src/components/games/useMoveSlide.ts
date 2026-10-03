import { ref, watch } from 'vue';

type Last = { from: number; to: number } | null | undefined;

/**
 * Slides the piece that just moved from its old square to its new one (FLIP), instead of it blinking into place.
 * `squares` is the board's on-screen order (so flipped boards slide the right way); the board is `cols` wide.
 * Bind `pieceStyle(i)` on the piece element, which must fill its square.
 */
export function useMoveSlide(last: () => Last, squares: () => number[], cols = 8) {
  const slide = ref<{ to: number; dx: number; dy: number; armed: boolean } | null>(null);
  watch(
    () => {
      const l = last();
      return l ? `${l.from}>${l.to}` : '';
    },
    (key) => {
      const l = last();
      if (!key || !l) return void (slide.value = null);
      const order = squares();
      const a = order.indexOf(l.from);
      const b = order.indexOf(l.to);
      if (a < 0 || b < 0) return;
      slide.value = { to: l.to, dx: (a % cols) - (b % cols), dy: Math.floor(a / cols) - Math.floor(b / cols), armed: true };
      // Two frames: paint at the old square first, then let the transition run.
      requestAnimationFrame(() => requestAnimationFrame(() => slide.value && (slide.value.armed = false)));
    },
  );
  return (i: number) => {
    const s = slide.value;
    if (!s || s.to !== i) return undefined;
    return s.armed
      ? { transform: `translate(${s.dx * 100}%, ${s.dy * 100}%)`, transition: 'none', zIndex: 3 }
      : { transform: 'translate(0, 0)', transition: 'transform 240ms cubic-bezier(.2,.8,.2,1)', zIndex: 3 };
  };
}
