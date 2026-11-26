/**
 * A sticky contents rail taller than the viewport scrolls with the page instead of being cut off:
 * it pins at its top edge while the reader scrolls up and at its bottom edge while they scroll
 * down, so every entry is reachable without an inner scrollbar.
 *
 * The stylesheet sets `top: calc(var(--mb-toc-offset) + var(--mb-toc-shift, 0px))`; this keeps
 * `--mb-toc-shift` between 0 (top edge at the offset) and the negative overflow (bottom edge
 * `gap` pixels above the viewport bottom). Where the rail is not sticky it does nothing.
 */

/** Lowest shift: how far above its offset the rail must rise for its bottom edge to show. */
export function minRailShift(viewportHeight: number, offset: number, height: number, gap: number): number {
  return Math.min(0, viewportHeight - offset - height - gap);
}

/** The shift after the page scrolls by `delta` pixels (positive is down). */
export function nextRailShift(shift: number, delta: number, min: number): number {
  return Math.min(0, Math.max(min, shift - delta));
}

export function followStickyRail(element: HTMLElement, gap = 16): () => void {
  const view = element.ownerDocument.defaultView;
  if (!view) return () => {};
  let shift = 0;
  let lastY = view.scrollY;
  let frame = 0;

  const set = (raw: number) => {
    // Whole pixels: sub-pixel layout noise would otherwise rewrite the style on every scroll.
    const value = Math.round(raw);
    if (value === shift) return;
    shift = value;
    element.style.setProperty('--mb-toc-shift', `${shift}px`);
  };
  const apply = (delta: number) => {
    const style = view.getComputedStyle(element);
    const top = Number.parseFloat(style.top);
    if (style.position !== 'sticky' || Number.isNaN(top)) return set(0);
    const min = minRailShift(view.innerHeight, top - shift, element.getBoundingClientRect().height, gap);
    set(nextRailShift(shift, delta, min));
  };
  const onScroll = () => {
    const y = view.scrollY;
    const delta = y - lastY;
    lastY = y;
    apply(delta);
  };
  const onResize = () => {
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => apply(0));
  };

  view.addEventListener('scroll', onScroll, { passive: true });
  view.addEventListener('resize', onResize);
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onResize);
  observer?.observe(element);
  apply(0);
  return () => {
    view.cancelAnimationFrame(frame);
    view.removeEventListener('scroll', onScroll);
    view.removeEventListener('resize', onResize);
    observer?.disconnect();
    element.style.removeProperty('--mb-toc-shift');
  };
}
