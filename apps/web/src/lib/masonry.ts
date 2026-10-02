import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

/**
 * Masonry packing for a CSS grid. Each child keeps its natural height, and we place it ourselves: it goes to the
 * spot where it can sit highest, so nothing ever waits for a taller neighbour to end and no empty space is left
 * under a short card. Children can be different widths: give them `data-cols` (how many grid columns they take;
 * default 1). They snap to clean positions for their width — thirds start at the ⅓ marks, halves at the ½ mark —
 * so mixed widths still line up. On a narrow screen (fewer columns) everything stacks in order.
 *
 * The grid needs `grid-auto-rows: <MASONRY_ROW>px; row-gap: 0` and children `align-self: start`.
 * Re-runs whenever any card changes size (images loading, new content, edits) or cards are added, removed or moved.
 */
export const MASONRY_ROW = 4;

export function useMasonry(el: Ref<HTMLElement | undefined>, gap: Ref<number> | (() => number), itemSelector?: string) {
  const gapPx = () => (typeof gap === 'function' ? gap() : gap.value);
  let resize: ResizeObserver | null = null;
  let mutate: MutationObserver | null = null;
  let frame = 0;
  const items = () => (el.value ? (Array.from(el.value.children) as HTMLElement[]).filter((c) => !itemSelector || c.matches(itemSelector)) : []);

  function layout() {
    frame = 0;
    const grid = el.value;
    if (!grid) return;
    const total = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    const heights = new Array<number>(total).fill(0); // how far down each column is filled, in rows
    for (const item of items()) {
      const want = Math.max(1, Number(item.dataset.cols) || 1);
      const cols = Math.min(want, total);
      // Clean starting columns for this width: multiples of its width, or of the remainder (⅔ = 8 of 12 → 0 or 4).
      const step = total % cols === 0 ? cols : total - cols;
      let best = 0;
      let bestTop = Infinity;
      for (let start = 0; start + cols <= total; start += Math.max(1, step)) {
        const top = Math.max(...heights.slice(start, start + cols));
        if (top < bestTop) [best, bestTop] = [start, top];
      }
      const rows = Math.max(1, Math.ceil((item.getBoundingClientRect().height + gapPx()) / MASONRY_ROW));
      item.style.gridColumn = `${best + 1} / span ${cols}`;
      item.style.gridRow = `${bestTop + 1} / span ${rows}`;
      for (let c = best; c < best + cols; c++) heights[c] = bestTop + rows;
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(layout);
  };
  function observe() {
    if (!resize) return;
    resize.disconnect();
    for (const c of items()) resize.observe(c);
    if (el.value) resize.observe(el.value); // the grid itself resizing can change the number of columns
    schedule();
  }
  onMounted(() => {
    resize = new ResizeObserver(schedule);
    // Cards added, removed or reordered, or a card's width (data-cols) changed. A width change alone never
    // fires the ResizeObserver, because the card is still pinned to its old span until we place it again.
    mutate = new MutationObserver(observe);
    if (el.value) mutate.observe(el.value, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-cols'] });
    observe();
  });
  watch(gapPx, schedule);
  onBeforeUnmount(() => {
    resize?.disconnect();
    mutate?.disconnect();
    if (frame) cancelAnimationFrame(frame);
  });
  return { relayout: schedule };
}
