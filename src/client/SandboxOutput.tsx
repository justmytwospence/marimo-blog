'use client';

import { useEffect, useRef, useState } from 'react';
import { safeAssetUrl } from '../react/safety.js';

function exactScriptUrls(urls: readonly string[]): string[] {
  return urls.filter((entry) => {
    try { const parsed = new URL(entry); return parsed.protocol === 'https:' && parsed.href === entry && !/[\s'"<>;]/.test(entry); } catch { return false; }
  });
}

export function SandboxOutput({ asset, caption, scriptUrls = [], allowEval = false }: { asset: string; caption?: string; scriptUrls?: string[]; allowEval?: boolean }) {
  const url = safeAssetUrl(asset);
  const frame = useRef<HTMLIFrameElement>(null);
  const channel = useRef<string | undefined>(undefined);
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState(false);
  const [height, setHeight] = useState(400);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !channel.current) return;
      const data: unknown = event.data;
      if (!data || typeof data !== 'object') return;
      const message = data as { channel?: unknown; height?: unknown };
      if (message.channel !== channel.current || typeof message.height !== 'number' || !Number.isFinite(message.height) || message.height < 160 || message.height > 2000) return;
      setHeight(message.height);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  return <figure className="mb-output mb-figure">{!html && <button className="mb-load" type="button" disabled={!url} onClick={async () => {
    if (!url) return;
    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw Error('Embedded output unavailable');
      const content = await response.text();
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      channel.current = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      const scripts = exactScriptUrls(scriptUrls).join(' ');
      const csp = `default-src 'none'; script-src 'unsafe-inline' ${allowEval ? "'unsafe-eval' " : ''}${scripts}; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; worker-src 'none'`;
      const bridge = `<script>new ResizeObserver(() => parent.postMessage({channel:'${channel.current}',height:Math.min(2000,Math.max(160,document.documentElement.scrollHeight))}, '*')).observe(document.documentElement)</script>`;
      setHtml(`<meta http-equiv="Content-Security-Policy" content="${csp}">${bridge}${content}`);
      setError(false);
    } catch { setError(true); }
  }}>{error ? 'Retry embedded output' : 'Load embedded output'}</button>}
    {html && <iframe ref={frame} className="mb-sandbox" title={caption || 'Embedded notebook output'} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} style={{ height }} />}
    {error && <p role="alert">Embedded output unavailable.</p>}
    {caption && <figcaption className="mb-caption">{caption}</figcaption>}</figure>;
}
