'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PresentationKind } from '../react/presentation.js';

export interface DisclosureProps {
  kind: PresentationKind;
  label: ReactNode;
  defaultOpen: boolean;
  variant?: string;
  preview?: ReactNode;
  children: ReactNode;
}

/** Change presentation without replacing (or unmounting) the saved output. */
export function setDisclosureOpen(details: HTMLDetailsElement, open: boolean, focusTarget?: HTMLElement) {
  const active = details.ownerDocument.activeElement;
  const summary = details.querySelector<HTMLElement>(':scope > summary');
  if (!open && active instanceof HTMLElement && active !== summary && details.contains(active)) {
    (focusTarget ?? summary)?.focus();
  }
  details.open = open;
}

export function Disclosure({ kind, label, defaultOpen, variant, preview, children }: DisclosureProps) {
  const id = useId();
  const ref = useRef<HTMLDetailsElement>(null);
  const failures = useRef(new Set<EventTarget>());
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const status = (event: Event) => {
      if (!(event instanceof CustomEvent) || !(event.target instanceof Element) || !details.contains(event.target)) return;
      const detail = event.detail as { state?: unknown } | undefined;
      if (detail?.state === 'error') {
        failures.current.add(event.target);
        setUnavailable(true);
        // Async errors expose the existing fallback, but must not steal focus.
        details.open = true;
      } else if (detail?.state === 'ready') {
        failures.current.delete(event.target);
        setUnavailable(failures.current.size > 0);
      }
    };
    details.addEventListener('mb:output-status', status);
    return () => details.removeEventListener('mb:output-status', status);
  }, []);
  return <details ref={ref} className={['mb-disclosure', variant && `mb-disclosure-${variant}`].filter(Boolean).join(' ')} open={defaultOpen}
    data-mb-disclosure="" data-mb-kind={kind} data-mb-default-open={String(defaultOpen)}>
    <summary id={`${id}-summary`} aria-controls={`${id}-body`}>
      {variant === 'stderr' && <span className="mb-disclosure-dot" aria-hidden="true" />}
      <span className="mb-disclosure-label">{label}</span>
      {preview && <span className="mb-disclosure-preview">{preview}</span>}
      {unavailable && <span className="mb-disclosure-status" role="status">Result unavailable</span>}
    </summary>
    <div id={`${id}-body`} className="mb-disclosure-body" aria-labelledby={`${id}-summary`}>{children}</div>
  </details>;
}
