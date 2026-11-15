'use client';

import { useEffect, useRef, useState } from 'react';
import { safeAssetUrl } from '../react/safety.js';

export function VegaChart({ asset, alt, caption, poster }: { asset: string; alt?: string; caption?: string; poster?: string }) {
  const url = safeAssetUrl(asset);
  const posterUrl = poster && safeAssetUrl(poster);
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [load, setLoad] = useState(false);
  const [size, setSize] = useState<number>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '250px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !url) return;
    const controller = new AbortController();
    void fetch(url, { method: 'HEAD', signal: controller.signal, credentials: 'omit' }).then((response) => {
      if (!response.ok) throw Error('Figure unavailable');
      const bytes = Number(response.headers.get('content-length'));
      if (bytes > 0) setSize(bytes);
      if (bytes > 0 && bytes <= 5 * 1048576) setLoad(true);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [visible, url]);
  useEffect(() => {
    const element = host.current;
    if (!load || !url || !element) return;
    let disposed = false;
    let finalize: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    const controller = new AbortController();
    setError(false);
    void (async () => {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw Error('Figure unavailable');
      const spec = await response.json() as Record<string, unknown>;
      const [{ default: embed }, vega] = await Promise.all([import('vega-embed'), import('vega')]);
      if (disposed) return;
      const loader = vega.loader({ http: { credentials: 'omit' } });
      const originalSanitize = loader.sanitize.bind(loader);
      const assetDirectory = url.slice(0, url.lastIndexOf('/') + 1);
      // Vega also calls sanitize directly for image marks and hyperlinks.
      // Guard that boundary, not just its data-fetch method.
      loader.sanitize = (path, options) => {
        const resource = safeAssetUrl(path);
        if (!resource || !resource.startsWith(assetDirectory) || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(resource.slice(assetDirectory.length))) return Promise.reject(Error('Only bundled chart resources are allowed'));
        return originalSanitize(resource, options?.context === 'image' ? { ...options, crossOrigin: 'anonymous' } : options);
      };
      const result = await embed(element, spec, { actions: false, loader });
      if (disposed) { result.view.finalize(); return; }
      finalize = () => result.view.finalize();
      if (typeof ResizeObserver !== 'undefined') {
        let width = element.clientWidth;
        observer = new ResizeObserver(() => { const next = element.clientWidth; if (!disposed && next > 0 && next !== width) { width = next; void result.view.resize().runAsync(); } });
        observer.observe(element);
      }
    })().catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; controller.abort(); observer?.disconnect(); finalize?.(); element.replaceChildren(); };
  }, [url, load, attempt]);
  return <figure ref={root} className="mb-output mb-figure"><div className="mb-chart" role="group" aria-label={alt || caption || 'Interactive Vega figure'}><div ref={host} /></div>
    {(!load || error) && <p className="mb-muted" role="status">{error ? 'Interactive figure unavailable.' : alt || 'Interactive figure available on request.'}</p>}
    {url && (!load || error) && <button className="mb-load" type="button" onClick={() => { setError(false); setLoad(true); setAttempt((n) => n + 1); }}>{error ? 'Retry figure' : size && size > 5 * 1048576 ? `Load interactive figure (${(size / 1048576).toFixed(1)} MB)` : 'Load interactive figure'}</button>}
    {posterUrl && (!load || error) && <img className="mb-media" src={posterUrl} alt={alt || caption || 'Saved figure'} />}
    {caption && <figcaption className="mb-caption">{caption}</figcaption>}</figure>;
}
