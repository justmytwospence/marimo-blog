'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PresentationInventory, PresentationKind } from '../react/presentation.js';
import { setDisclosureOpen } from './Disclosure.js';
import { contentsModeEvent, setContentsMode } from './contents-mode.js';

type Kind = PresentationKind | 'contents';
// Visible labels are short; the accessible name is completed where it differs.
const rows: { kind: Kind; label: string; suffix?: string }[] = [
  { kind: 'contents', label: 'Table of contents' },
  { kind: 'code', label: 'Code' },
  { kind: 'results', label: 'Results' },
  { kind: 'logs', label: 'Logs' },
  { kind: 'warnings', label: 'Warnings', suffix: ' and stderr' },
  { kind: 'errors', label: 'Errors', suffix: ' details' },
];
type State = 'on' | 'off' | 'mixed';

function owned(article: Element, kind: string): HTMLDetailsElement[] {
  // Exclude disclosures that belong to a nested article.
  return Array.from(article.querySelectorAll<HTMLDetailsElement>(`details[data-mb-disclosure][data-mb-kind="${kind}"]`))
    .filter((details) => details.closest('.marimo-blog') === article);
}
const stateOf = (open: number, total: number): State => open === 0 ? 'off' : open === total ? 'on' : 'mixed';

/** Labeled switches over the same native disclosures readers use locally; state is read from the DOM. */
export function ArticleControls({ inventory, placement = 'bar' }: { inventory: PresentationInventory; placement?: 'bar' | 'rail' }) {
  const root = useRef<HTMLDivElement>(null);
  const hint = useId();
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const available = rows.filter((row) => row.kind === 'contents' ? placement === 'bar' && inventory.contents : inventory.categories[row.kind].total > 0);
  const initial = (kind: Kind): State => {
    if (kind === 'contents') return 'off';
    const { total, expanded } = inventory.categories[kind];
    return stateOf(expanded, total);
  };
  const [states, setStates] = useState<Record<string, State>>(() => Object.fromEntries(available.map((row) => [row.kind, initial(row.kind)])));
  const [counts, setCounts] = useState<Record<string, [number, number]>>(() => Object.fromEntries(available.filter((row) => row.kind !== 'contents').map((row) => [row.kind, [inventory.categories[row.kind as PresentationKind].expanded, inventory.categories[row.kind as PresentationKind].total]])));
  const kinds = available.map((row) => row.kind).join(',');
  const recompute = useCallback(() => {
    const scope = root.current?.closest('.marimo-blog');
    if (!scope) return;
    const next: Record<string, State> = {};
    const nextCounts: Record<string, [number, number]> = {};
    let changed = scope.getAttribute('data-mb-contents-mode') !== null && scope.getAttribute('data-mb-contents-mode') !== 'auto';
    for (const kind of kinds.split(',').filter(Boolean) as Kind[]) {
      const items = owned(scope, kind);
      const open = items.filter((details) => details.open).length;
      next[kind] = stateOf(open, items.length);
      nextCounts[kind] = [open, items.length];
    }
    // Reset is offered when a category differs from its server default.
    for (const kind of (Object.keys(inventory.categories) as PresentationKind[])) {
      const items = owned(scope, kind);
      if (items.length && stateOf(items.filter((details) => details.open).length, items.length) !== initial(kind)) changed = true;
    }
    setStates(next);
    setCounts(nextCounts);
    setDirty(changed);
  }, [kinds, inventory]);
  useEffect(() => {
    const scope = root.current?.closest('.marimo-blog');
    if (!scope) return;
    const toggle = () => recompute();
    scope.addEventListener('toggle', toggle, true);
    scope.addEventListener(contentsModeEvent, toggle);
    recompute();
    setReady(true);
    return () => { scope.removeEventListener('toggle', toggle, true); scope.removeEventListener(contentsModeEvent, toggle); };
  }, [recompute]);
  if (!available.length) return null;
  const apply = (kind: Kind, open: boolean, focusTarget: HTMLElement) => {
    const scope = root.current?.closest('.marimo-blog');
    if (!scope) return;
    if (kind === 'contents') { setContentsMode(scope, open ? 'expanded' : 'collapsed'); return; }
    for (const details of owned(scope, kind)) setDisclosureOpen(details, open, focusTarget);
    recompute();
  };
  return <div ref={root} className={`mb-switches mb-switches-${placement}`} role="group" aria-label={placement === 'bar' ? 'Article view' : 'Article view in contents'} data-ready={ready || undefined}>
    <span id={hint} className="mb-sr-only">Some expanded</span>
    {available.map((row) => {
      const state = states[row.kind] ?? 'off';
      return <button key={row.kind} type="button" role="switch" className="mb-switch" aria-checked={state === 'on'} data-state={state}
        aria-describedby={state === 'mixed' ? hint : undefined} onClick={(event) => apply(row.kind, state !== 'on', event.currentTarget)}>
        <span className="mb-switch-label">{row.label}{row.suffix && <span className="mb-sr-only">{row.suffix}</span>}</span>
        {state === 'mixed' && counts[row.kind] && <span className="mb-switch-count" aria-hidden="true">{counts[row.kind]![0]}/{counts[row.kind]![1]}</span>}
        <span className="mb-switch-track" aria-hidden="true"><span className="mb-switch-thumb" /></span>
      </button>;
    })}
    {placement === 'bar' && dirty && <button type="button" className="mb-switch-reset" onClick={(event) => {
      const scope = root.current?.closest('.marimo-blog');
      if (!scope) return;
      for (const details of Array.from(scope.querySelectorAll<HTMLDetailsElement>('details[data-mb-disclosure]'))) {
        if (details.closest('.marimo-blog') !== scope || details.dataset.mbKind === 'contents') continue;
        setDisclosureOpen(details, details.dataset.mbDefaultOpen === 'true', event.currentTarget);
      }
      setContentsMode(scope, 'auto');
      recompute();
    }}>Reset view</button>}
  </div>;
}
