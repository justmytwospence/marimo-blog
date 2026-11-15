'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

export function Tabs({ panels }: { panels: { title: string; content: ReactNode }[] }) {
  const id = useId();
  const [enhanced, setEnhanced] = useState(false);
  const [selected, setSelected] = useState(0);
  useEffect(() => { setEnhanced(true); }, []);
  return <div className="mb-output mb-tabs" data-enhanced={enhanced}>
    <div className="mb-tab-list" role="tablist" aria-label="Output panels" hidden={!enhanced}>{panels.map((panel, index) => <button type="button" key={index} role="tab" id={`${id}-tab-${index}`} data-tab-index={index} aria-controls={`${id}-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => {
      const next = event.key === 'ArrowRight' ? (index + 1) % panels.length : event.key === 'ArrowLeft' ? (index - 1 + panels.length) % panels.length : event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1 : null;
      if (next !== null) { event.preventDefault(); setSelected(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus(); }
    }}>{panel.title}</button>)}</div>
    <div className="mb-tab-panels">{panels.map((panel, index) => <section key={index} className="mb-panel" data-panel-index={index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={enhanced && selected !== index}><strong className="mb-panel-title">{panel.title}</strong>{panel.content}</section>)}</div>
  </div>;
}
