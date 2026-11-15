'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Plotly from 'plotly.js';
import { safeAssetUrl } from '../react/safety.js';
import { FigureFrame } from './FigureFrame.js';
import { onRenderableReveal, waitForRenderable } from './waitForRenderable.js';

const LIMIT = 5 * 1024 * 1024;
type Figure = { data: Plotly.Data[]; layout?: Partial<Plotly.Layout>; config?: Partial<Plotly.Config>; frames?: Array<Partial<Plotly.Frame>> };
type PlotlyApi = Pick<typeof Plotly, 'newPlot' | 'addFrames' | 'purge' | 'Plots'>;

export function PlotlyChart({ asset, alt, caption, poster }: { asset: string; alt?: string; caption?: string; poster?: string }) {
  const url = safeAssetUrl(asset);
  const posterUrl = poster && safeAssetUrl(poster);
  const holder = useRef<HTMLElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [load, setLoad] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState<number>();
  const [error, setError] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [rendered, setRendered] = useState<{ url: string; attempt: number }>();
  const ready = rendered?.url === url && rendered?.attempt === attempt;
  const busy = load && !ready && !error;
  useEffect(() => {
    const element = holder.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '250px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !url) return;
    const controller = new AbortController();
    void fetch(url, { method: 'HEAD', signal: controller.signal, credentials: 'omit' }).then((response) => {
      if (!response.ok) throw Error('Unable to inspect figure');
      const bytes = Number(response.headers.get('content-length'));
      if (Number.isFinite(bytes) && bytes > 0) setSize(bytes);
      else setLoad(false);
      if (bytes > 0 && bytes <= LIMIT) setLoad(true);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [url, visible]);
  useEffect(() => {
    const element = plot.current;
    if (!element || !url || !load) return;
    let disposed = false;
    let api: PlotlyApi | undefined;
    let observer: ResizeObserver | undefined;
    const controller = new AbortController();
    setRendered(undefined);
    setError(false);
    setFailure(undefined);
    void (async () => {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw Error('Figure unavailable');
      const figure = await response.json() as Figure;
      if (!Array.isArray(figure.data)) throw Error('Invalid figure');
      if (figure.data.some((trace) => ['scatter3d', 'surface', 'mesh3d', 'volume', 'isosurface', 'cone', 'streamtube'].includes(String(trace.type)))) {
        const canvas = document.createElement('canvas');
        if (!canvas.getContext('webgl') && !canvas.getContext('webgl2')) {
          throw Error('This 3D figure requires a WebGL-capable browser.');
        }
      }
      const module = await import('plotly.js-dist-min');
      const loaded: { default?: PlotlyApi } & Partial<PlotlyApi> = module;
      api = loaded.newPlot ? loaded as PlotlyApi : loaded.default;
      if (!api) throw Error('Plotly unavailable');
      if (disposed) return;
      await waitForRenderable(element, controller.signal);
      if (disposed) return;
      await api.newPlot(element, figure.data, { ...figure.layout, autosize: true, width: undefined }, { ...figure.config, responsive: false });
      if (disposed) { api.purge(element); return; }
      if (figure.frames?.length) await api.addFrames(element, figure.frames);
      if (disposed) { api.purge(element); return; }
      if (typeof ResizeObserver !== 'undefined') {
        let width = element.clientWidth;
        observer = new ResizeObserver(() => { const next = element.clientWidth; if (!disposed && next > 0 && next !== width) { width = next; api?.Plots.resize(element); } });
        observer.observe(element);
      }
      // A reader may fold the result while Plotly initializes; size it when shown.
      onRenderableReveal(element, controller.signal, () => api?.Plots.resize(element));
      await waitForRenderable(element, controller.signal);
      if (disposed) return;
      api.Plots.resize(element);
      setRendered({ url, attempt });
    })().catch((cause: unknown) => { if (!disposed && !controller.signal.aborted) { setFailure(cause instanceof Error && cause.message.startsWith('This 3D figure') ? cause.message : 'Interactive figure unavailable.'); setError(true); setRendered(undefined); } });
    return () => { disposed = true; controller.abort(); observer?.disconnect(); if (api) api.purge(element); };
  }, [url, load, attempt]);
  return <FigureFrame ref={holder} caption={caption} state={error ? 'error' : ready ? 'ready' : busy ? 'loading' : 'idle'} fallback={<>
    <p className="mb-muted" role="status">{error ? failure || 'Interactive figure unavailable.' : busy ? 'Loading interactive figure…' : alt || 'Interactive figure available on request.'}</p>
    {url && (!load || error) && <button className="mb-load" type="button" onClick={() => { setRendered(undefined); setError(false); setLoad(true); setAttempt((value) => value + 1); }}>{error ? 'Retry figure' : size && size > LIMIT ? `Load interactive figure (${(size / 1048576).toFixed(1)} MB)` : 'Load interactive figure'}</button>}
    {posterUrl && (!load || error) && <img className="mb-media" src={posterUrl} alt={alt || caption || 'Saved figure'} />}
  </>}>
    <div ref={plot} className="mb-chart" aria-label={alt || caption || 'Interactive Plotly figure'} aria-busy={busy} role="group" />
  </FigureFrame>;
}
