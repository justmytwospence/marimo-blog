'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { TocEntry } from '../types.js';
import type { PresentationInventory } from '../react/presentation.js';
import { ArticleControls } from './ArticleControls.js';
import { setDisclosureOpen } from './Disclosure.js';
import { contentsModeEvent, setContentsMode, type ContentsMode } from './contents-mode.js';

export { setContentsMode };
export type { ContentsMode };

function findHeading(article: Element, id: string) {
  // Comparing IDs avoids document-wide lookups and does not require CSS.escape.
  return Array.from(article.querySelectorAll<HTMLElement>('[id]')).find((element) => element.id === id);
}

function revealHeading(heading: HTMLElement, article: Element) {
  let ancestor: HTMLElement | null = heading;
  while (ancestor && ancestor !== article) {
    if (ancestor instanceof HTMLDetailsElement) setDisclosureOpen(ancestor, true);
    if (ancestor.matches('.mb-panel[data-panel-index]')) {
      const index = ancestor.getAttribute('data-panel-index');
      const tabs = ancestor.parentElement?.parentElement;
      tabs?.querySelector<HTMLButtonElement>(`[role="tab"][data-tab-index="${index}"]`)?.click();
    }
    ancestor = ancestor.parentElement;
  }
}

export function TableOfContents({ entries, initialMode = 'auto', controls }: { entries: TocEntry[]; initialMode?: ContentsMode; controls?: PresentationInventory }) {
  const [active, setActive] = useState<string>();
  const navRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const expectedOpen = useRef(initialMode === 'expanded');
  const id = useId();
  useEffect(() => {
    const article = navRef.current?.closest('.marimo-blog');
    const details = detailsRef.current;
    if (!article || !details) return;
    let mode: ContentsMode = initialMode;
    let measuredWidth = article.getBoundingClientRect().width;
    const apply = () => {
      const rem = Number.parseFloat(getComputedStyle(article.ownerDocument.documentElement).fontSize) || 16;
      const open = mode === 'auto' ? measuredWidth >= 68 * rem : mode === 'expanded';
      expectedOpen.current = open;
      setDisclosureOpen(details, open);
    };
    const changeMode = (event: Event) => {
      const next = (event as CustomEvent<{ mode: ContentsMode }>).detail?.mode;
      if (next !== 'auto' && next !== 'expanded' && next !== 'collapsed') return;
      mode = next;
      apply();
    };
    const nativeToggle = () => {
      // A native keyboard/summary action is explicit; automatic changes are not.
      if (details.open !== expectedOpen.current) {
        expectedOpen.current = details.open;
        setContentsMode(article, details.open ? 'expanded' : 'collapsed');
      }
    };
    article.setAttribute('data-mb-contents-mode', mode);
    article.addEventListener(contentsModeEvent, changeMode);
    details.addEventListener('toggle', nativeToggle);
    apply();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver((items) => {
      const item = items.find((entry) => entry.target === article);
      measuredWidth = item?.contentRect.width ?? article.getBoundingClientRect().width;
      if (mode === 'auto') apply();
    });
    resize?.observe(article);
    return () => {
      resize?.disconnect();
      article.removeEventListener(contentsModeEvent, changeMode);
      details.removeEventListener('toggle', nativeToggle);
    };
  }, [initialMode]);
  useEffect(() => {
    const article = navRef.current?.closest('.marimo-blog');
    if (!article) return;
    const headings = entries.map((entry) => findHeading(article, entry.id)).filter((el): el is HTMLElement => !!el);
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((items) => {
      for (const item of items) if (item.isIntersecting) setActive(item.target.id);
    }, { rootMargin: '-15% 0px -65% 0px' });
    headings.forEach((heading) => observer?.observe(heading));
    const revealHash = () => {
      let target: string;
      try { target = decodeURIComponent(article.ownerDocument.defaultView?.location.hash.slice(1) ?? ''); } catch { return; }
      // A deep link belongs only to an article whose TOC actually names it.
      if (!entries.some((entry) => entry.id === target)) return;
      const heading = findHeading(article, target);
      if (!heading) return;
      revealHeading(heading, article);
      heading.scrollIntoView?.();
    };
    revealHash();
    const window = article.ownerDocument.defaultView;
    window?.addEventListener('hashchange', revealHash);
    return () => { observer?.disconnect(); window?.removeEventListener('hashchange', revealHash); };
  }, [entries]);
  return <nav ref={navRef} className="mb-toc" aria-label="Table of contents">{controls && <ArticleControls inventory={controls} placement="rail" />}<details ref={detailsRef} open={initialMode === 'expanded'}
    data-mb-disclosure="" data-mb-kind="contents" data-mb-default-open={String(initialMode === 'expanded')}>
    <summary id={`${id}-summary`} aria-controls={`${id}-entries`} onClick={(event) => {
      const article = event.currentTarget.closest('.marimo-blog');
      const details = detailsRef.current;
      if (!article || !details) return;
      // Prevent the native default only to record the choice synchronously.
      event.preventDefault();
      setContentsMode(article, details.open ? 'collapsed' : 'expanded');
    }}>On this page</summary>
    <ol id={`${id}-entries`} aria-labelledby={`${id}-summary`}>{entries.map((entry) => <li key={entry.id} style={{ marginInlineStart: `${Math.max(0, entry.level - 2)}em` }}><a href={`#${encodeURIComponent(entry.id)}`} aria-current={active === entry.id ? 'location' : undefined} onClick={(event) => {
      const article = event.currentTarget.closest('.marimo-blog');
      const heading = article && findHeading(article, entry.id);
      if (!article || !heading) return;
      event.preventDefault();
      revealHeading(heading, article);
      article.ownerDocument.defaultView?.history.pushState(null, '', `#${encodeURIComponent(entry.id)}`);
      heading.scrollIntoView?.();
      setActive(entry.id);
    }}>{entry.title}</a></li>)}</ol>
  </details></nav>;
}
