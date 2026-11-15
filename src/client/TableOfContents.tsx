'use client';

import { useEffect, useRef, useState } from 'react';
import type { TocEntry } from '../types.js';

export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState<string>();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const root = navRef.current?.closest('.marimo-blog');
    const headings = entries.map((entry) => document.getElementById(entry.id)).filter((el): el is HTMLElement => !!el && !!root?.contains(el));
    const observer = new IntersectionObserver((items) => {
      for (const item of items) if (item.isIntersecting) setActive(item.target.id);
    }, { rootMargin: '-15% 0px -65% 0px' });
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [entries]);
  return <nav ref={navRef} className="mb-toc" aria-label="Table of contents"><details open><summary>Contents</summary><ol>{entries.map((entry) => <li key={entry.id} style={{ marginInlineStart: `${Math.max(0, entry.level - 2)}em` }}><a href={`#${encodeURIComponent(entry.id)}`} aria-current={active === entry.id ? 'location' : undefined} onClick={(event) => {
    const root = event.currentTarget.closest('.marimo-blog');
    const candidate = document.getElementById(entry.id);
    const heading = candidate && root?.contains(candidate) ? candidate : null;
    if (!heading) return;
    let ancestor: Element | null = heading;
    while (ancestor && ancestor !== root) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      const panel: Element | null = ancestor.closest('.mb-panel[data-panel-index]');
      if (panel && panel !== ancestor) {
        const tab = panel.parentElement?.parentElement?.querySelector<HTMLButtonElement>(`[role="tab"][data-tab-index="${panel.getAttribute('data-panel-index')}"]`);
        tab?.click();
      }
      ancestor = ancestor.parentElement;
    }
  }}>{entry.title}</a></li>)}</ol></details></nav>;
}
