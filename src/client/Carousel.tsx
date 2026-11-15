'use client';

import type { ReactNode } from 'react';

/** Static slides remain readable without scripts; native details permit switching. */
export function Carousel({ panels }: { panels: { title: string; content: ReactNode }[] }) {
  return <div className="mb-output mb-carousel">{panels.map((panel, index) => <details key={index} className="mb-panel" open><summary>{panel.title}</summary>{panel.content}</details>)}</div>;
}
