'use client';

import type { ReactNode } from 'react';

export function Accordion({ panels }: { panels: { title: string; content: ReactNode }[] }) {
  return <div className="mb-output mb-accordion">{panels.map((panel, index) => <details className="mb-panel" key={index} open><summary>{panel.title}</summary>{panel.content}</details>)}</div>;
}
