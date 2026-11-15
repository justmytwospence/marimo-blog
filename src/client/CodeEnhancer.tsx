'use client';

import { useEffect, useRef } from 'react';

/** Reveals and drives code-block controls through one delegated listener scoped to the owning article. */
export function CodeEnhancer() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const article = ref.current?.closest('.marimo-blog');
    if (!article) return;
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const owns = (block: Element) => block.closest('.marimo-blog') === article;
    // The computed ::before content is the single source of truth for whether numbers show.
    const syncLines = (block: Element) => {
      const line = block.querySelector('.mb-code-line');
      const on = !!line && getComputedStyle(line, '::before').content !== 'none';
      block.querySelector('[data-mb-code-action="lines"]')?.setAttribute('aria-pressed', String(on));
    };
    const blocks = () => Array.from(article.querySelectorAll('[data-mb-codeblock]')).filter(owns);
    for (const block of blocks()) {
      block.setAttribute('data-enhanced', '');
      block.querySelectorAll('.mb-codeblock-tools, .mb-codeblock-more').forEach((element) => element.removeAttribute('hidden'));
      const details = block.closest('details');
      if (details && (details.getAttribute('data-mb-kind') === 'code' || block.hasAttribute('data-mb-header'))) {
        details.setAttribute('data-mb-code-header', '');
        block.setAttribute('data-collapsible', '');
        block.querySelector('button[data-mb-code-action="collapse"]')?.removeAttribute('hidden');
      }
      syncLines(block);
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      for (const block of blocks()) if (block.getAttribute('data-numbers') === 'auto') syncLines(block);
    });
    observer?.observe(article);
    const feedback = (block: Element, label: string, status: string) => {
      const target = block.querySelector('.mb-codeblock-copy-label');
      const live = block.querySelector('[role="status"]');
      if (target) target.textContent = label;
      if (live) live.textContent = status;
      clearTimeout(timers.get(block));
      timers.set(block, setTimeout(() => {
        if (target) target.textContent = 'Copy';
        block.querySelector('[data-mb-code-action="copy"]')?.removeAttribute('data-copied');
        if (live) live.textContent = '';
      }, 2000));
    };
    const click = async (event: Event) => {
      const button = (event.target as Element | null)?.closest<HTMLElement>('[data-mb-code-action]');
      const block = button?.closest('[data-mb-codeblock]');
      if (!button || !block || !owns(block)) return;
      const action = button.dataset.mbCodeAction;
      if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(block.querySelector('code')?.textContent ?? '');
          button.setAttribute('data-copied', '');
          feedback(block, 'Copied', 'Copied');
        } catch { feedback(block, 'Copy failed', 'Could not copy'); }
      } else if (action === 'lines') {
        block.setAttribute('data-numbers', button.getAttribute('aria-pressed') === 'true' ? 'off' : 'on');
        syncLines(block);
      } else if (action === 'collapse') {
        const details = block.closest('details');
        if (!block.hasAttribute('data-collapsible') || !details) return;
        details.open = false;
        details.querySelector<HTMLElement>(':scope > summary')?.focus();
      } else if (action === 'wrap') {
        const on = !block.hasAttribute('data-wrap');
        block.toggleAttribute('data-wrap', on);
        button.setAttribute('aria-pressed', String(on));
      } else if (action === 'expand') {
        const expanded = !block.hasAttribute('data-expanded');
        block.toggleAttribute('data-expanded', expanded);
        button.setAttribute('aria-expanded', String(expanded));
        button.textContent = expanded ? 'Show fewer lines' : `Show all ${block.getAttribute('data-lines')} lines`;
        if (!expanded) block.scrollIntoView({ block: 'nearest' });
      }
    };
    article.addEventListener('click', click);
    return () => { observer?.disconnect(); article.removeEventListener('click', click); timers.forEach((timer) => clearTimeout(timer)); };
  }, []);
  return <span ref={ref} hidden />;
}
