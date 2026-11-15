// visibility:hidden is intentional on loading FigureFrame hosts; do not test it.
function isRenderable(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden]')) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) return false;
  }
  return element.getBoundingClientRect().width > 0;
}

/** Resize an existing output on native disclosure or hidden-panel reveals. */
export function onRenderableReveal(element: HTMLElement, signal: AbortSignal, callback: () => void): void {
  if (signal.aborted) return;
  const document = element.ownerDocument;
  const check = () => { if (!signal.aborted && isRenderable(element)) callback(); };
  const toggle = (event: Event) => {
    if (event.target instanceof Element && event.target.contains(element)) check();
  };
  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.target instanceof Element && record.target.contains(element))) check();
  });
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('toggle', toggle, true);
  signal.addEventListener('abort', () => {
    observer.disconnect();
    document.removeEventListener('toggle', toggle, true);
  }, { once: true });
}

/** Wait without polling for a connected, expanded, positive-width output host. */
export function waitForRenderable(element: HTMLElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    if (isRenderable(element)) { resolve(); return; }
    const document = element.ownerDocument;
    let resize: ResizeObserver | undefined;
    let intersection: IntersectionObserver | undefined;
    const mutation = new MutationObserver(() => check());
    const cleanup = () => {
      resize?.disconnect();
      intersection?.disconnect();
      mutation.disconnect();
      document.removeEventListener('toggle', check, true);
      signal.removeEventListener('abort', abort);
    };
    const check = () => { if (isRenderable(element)) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('toggle', check, true);
    // Also cover panel changes and hosts connected after the initial check.
    mutation.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'style', 'class'] });
    if (typeof ResizeObserver !== 'undefined') { resize = new ResizeObserver(check); resize.observe(element); }
    if (typeof IntersectionObserver !== 'undefined') { intersection = new IntersectionObserver(check); intersection.observe(element); }
    check();
  });
}
