'use client';

import { useEffect, useRef, useState } from 'react';
import { safeAssetUrl } from '../shared/url.js';
import { FigureFrame } from './FigureFrame.js';
import { waitForRenderable } from './waitForRenderable.js';

function exactScriptUrls(urls: readonly string[]): string[] {
  return urls.filter((entry) => {
    try { const parsed = new URL(entry); return parsed.protocol === 'https:' && parsed.href === entry && !/[\s'"<>;]/.test(entry); } catch { return false; }
  });
}

export function SandboxOutput({ asset, caption, scriptUrls = [], allowEval = false }: { asset: string; caption?: string; scriptUrls?: string[]; allowEval?: boolean }) {
  const url = safeAssetUrl(asset);
  const holder = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const scripts = exactScriptUrls(scriptUrls).join(' ');
  const channel = useRef<string | undefined>(undefined);
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
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
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '250px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    if (!url) { setError(true); return; }
    const controller = new AbortController();
    setBusy(true);
    setReady(false);
    setError(false);
    setHtml(undefined);
    void (async () => {
      const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw Error('Embedded output unavailable');
      const content = await response.text();
      const element = holder.current;
      if (!element) return;
      await waitForRenderable(element, controller.signal);
      if (controller.signal.aborted) return;
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      channel.current = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      const csp = `default-src 'none'; script-src 'unsafe-inline' ${allowEval ? "'unsafe-eval' " : ''}${scripts}; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; worker-src 'none'`;
      const bridge = `<script>new ResizeObserver(() => parent.postMessage({channel:'${channel.current}',height:Math.min(2000,Math.max(160,document.documentElement.scrollHeight))}, '*')).observe(document.documentElement)</script>`;
      setHtml(`<meta http-equiv="Content-Security-Policy" content="${csp}">${bridge}${content}`);
    })().catch(() => { if (!controller.signal.aborted) { setError(true); setBusy(false); } });
    return () => controller.abort();
  }, [url, visible, attempt, scripts, allowEval]);
  return <FigureFrame ref={holder} caption={caption} state={error ? 'error' : ready ? 'ready' : busy ? 'loading' : 'idle'} fallback={<>
    {error && <button className="mb-load" type="button" disabled={!url} onClick={() => setAttempt((value) => value + 1)}>Retry embedded output</button>}
    {!error && <p className="mb-muted" role="status">{busy ? 'Loading embedded output…' : 'Embedded output loads as you scroll.'}</p>}
    {error && <p role="alert">Embedded output unavailable.</p>}
  </>}>
    {html && <iframe ref={frame} className="mb-sandbox" title={caption || 'Embedded notebook output'} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} onLoad={() => { setReady(true); setBusy(false); }} style={{ height }} />}
  </FigureFrame>;
}
