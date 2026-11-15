'use client';

import { useEffect, useRef, useState } from 'react';
import { emitOutputStatus } from './presentation-events.js';
import { safeAssetUrl } from '../react/safety.js';

export function JsonTree({ asset, caption }: { asset: string; caption?: string }) {
  const url = safeAssetUrl(asset);
  const [value, setValue] = useState<unknown>();
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (root.current && (error || value !== undefined)) emitOutputStatus(root.current, { state: error ? 'error' : 'ready' });
  }, [error, value]);
  return <div ref={root} className="mb-output mb-notice"><details><summary>{caption || 'JSON output'}</summary>
    {value === undefined && <button type="button" disabled={!url} onClick={async () => {
      if (!url) return;
      try { const response = await fetch(url, { credentials: 'omit' }); if (!response.ok) throw Error('JSON unavailable'); setValue(await response.json() as unknown); setError(false); }
      catch { setError(true); }
    }}>Load captured JSON</button>}
    {url && <a href={url} download>Download captured JSON</a>}
    {value !== undefined && <pre>{JSON.stringify(value, null, 2)}</pre>}
    {error && <p role="alert">Captured JSON unavailable.</p>}
  </details></div>;
}
