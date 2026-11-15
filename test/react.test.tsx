// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MarimoDocument, MarimoNode } from '../src/types.js';
import { MarimoArticle } from '../src/react/index.js';
import { SandboxOutput } from '../src/client/SandboxOutput.js';
import { DataTable } from '../src/client/DataTable.js';
import { PlotlyChart } from '../src/client/PlotlyChart.js';

function documentWith(nodes: MarimoNode[] = [], suffix = ''): MarimoDocument {
  return {
    schemaVersion: 1,
    metadata: { slug: `sample${suffix}`, title: `Sample ${suffix}`, date: '2025-01-01', description: 'An exported notebook' },
    provenance: { exporterVersion: '0.25.2', notebookVersion: '1', sessionVersion: '1', inputSha256: suffix || 'a', publicationConfigSha256: 'b', producerVersion: '0.1.0', sourceHashes: {} },
    assetBase: '/notebooks/sample/', cells: [{ id: `cell${suffix}`, ordinal: 0, source: 'print(42)', sourceLanguage: 'python', hideCode: false, disabled: false, code: 'folded', console: 'collapsed', outputs: nodes, consoleOutputs: [] }],
    toc: [{ id: `chapter${suffix}`, title: 'Chapter', level: 2 }], plainText: 'Chapter', assets: [], diagnostics: [],
    sourceDownload: '/notebooks/sample/source.py', interactive: { url: '/notebooks/sample/interactive/index.html', exporterVersion: '0.25.2', sourceSha256: 'x' },
  };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('server article', () => {
  it('puts prose, title, headings and fallback panels in initial HTML without a document client boundary', () => {
    const html = renderToStaticMarkup(<MarimoArticle document={documentWith([
      { type: 'html', html: '<h2 id="chapter">Chapter</h2><p>Rendered prose</p>' },
      { type: 'tabs', panels: [{ title: 'First', children: [{ type: 'text', text: 'Saved result' }] }, { title: 'Second', children: [{ type: 'text', text: 'Other result' }] }] },
      { type: 'plotly', asset: '/notebooks/sample/figure.json', alt: 'Points on a chart' },
    ])} />);
    expect(html).toContain('Rendered prose');
    expect(html).toContain('Saved result');
    expect(html).toContain('Other result');
    expect(html).toContain('Points on a chart');
    expect(html).toContain('href="#chapter"');
    expect(html).toContain('Run interactively');
    expect(html).not.toContain('iframe');
    expect(html).not.toContain('figure.json'); // chart URL is not fetched or embedded as a spec
  });
  it('preserves semantic math and reviewed inline formatting through the render boundary', () => {
    const html = renderToStaticMarkup(<MarimoArticle document={documentWith([
      { type: 'math', source: 'sqrt(x)', display: false, html: '<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mi>x</mi></msqrt></math>' },
      { type: 'html', html: '<p style="color:red">Red text</p><p style="position:fixed;top:0">No overlay</p>' },
      { type: 'plotly', asset: '/notebooks/sample/figure.json', poster: '/notebooks/sample/poster.png', alt: 'Saved plot' },
    ])} />);
    expect(html).toContain('<msqrt>');
    expect(html).toContain('color:red');
    expect(html).not.toContain('position:fixed');
    expect(html).toContain('alt="Saved plot"');
  });
  it('sanitizes unchecked HTML and rejects unsafe asset URLs at the render boundary', () => {
    const doc = documentWith([
      { type: 'html', html: '<p onclick="alert(1)">Safe <img src="https://tracker.test/a" onerror="alert(1)"></p><script>alert(1)</script><a href="javascript:alert(1)">link</a>' },
      { type: 'image', src: '//tracker.test/x', alt: 'No tracking' },
      { type: 'image', src: '/%2e%2e/secret.png', alt: 'No traversal' },
      { type: 'math', html: '<svg onload="alert(1)"></svg><span>x</span>', source: 'x', display: false },
    ]);
    doc.interactive = { url: 'javascript:alert(1)', exporterVersion: '0.25.2', sourceSha256: 'x' };
    doc.sourceDownload = '//evil.test/source.py';
    const html = renderToStaticMarkup(<MarimoArticle document={doc} />);
    expect(html).not.toMatch(/<script|<svg|onclick|onerror|javascript:|tracker\.test|secret\.png|Run interactively|Download notebook/i);
    expect(html).toContain('No tracking');
  });
});

describe('client islands', () => {
  it('scopes code controls to each article and resets when the document changes', () => {
    const { rerender } = render(<><MarimoArticle document={documentWith([], '-a')} /><MarimoArticle document={documentWith([], '-b')} /></>);
    const articles = screen.getAllByRole('article');
    fireEvent.click(within(articles[0]!).getByRole('button', { name: 'Show code' }));
    expect(articles[0]!.querySelector('details.mb-code-details')?.open).toBe(true);
    expect(articles[1]!.querySelector('details.mb-code-details')?.open).toBe(false);
    rerender(<><MarimoArticle document={documentWith([], '-c')} /><MarimoArticle document={documentWith([], '-b')} /></>);
    expect(screen.getAllByRole('article')[0]!.querySelector('details.mb-code-details')?.open).toBe(false);
  });
  it('switches tab panels with keyboard while static markup includes both panels', async () => {
    render(<MarimoArticle document={documentWith([{ type: 'tabs', panels: [{ title: 'A', children: [{ type: 'text', text: 'One' }] }, { title: 'B', children: [{ type: 'text', text: 'Two' }] }] }])} />);
    await waitFor(() => expect(document.querySelectorAll('[role="tabpanel"]')[1]?.hasAttribute('hidden')).toBe(true));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'B' }).textContent).toContain('Two');
  });
  it('renders captured table rows in SSR and only searches the captured dataset', async () => {
    const preview = { headers: ['Name', 'Value'], rows: [['alpha', 2], ['beta', 1]], totalRows: 100 };
    const html = renderToStaticMarkup(<DataTable asset="/notebooks/sample/rows.json" caption="Results" preview={preview} />);
    expect(html).toContain('alpha');
    expect(html).toContain('Showing 2 exported rows of 100');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => preview }));
    render(<DataTable asset="/notebooks/sample/rows.json" preview={preview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search and sort exported rows' }));
    await screen.findByRole('searchbox', { name: 'Search exported rows' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } });
    expect(screen.getByText(/1 match/)).toBeTruthy();
    expect(screen.queryByText('alpha')).toBeNull();
  });
  it('explains when a 3D chart cannot render without WebGL instead of loading forever', async () => {
    vi.stubGlobal('IntersectionObserver', class {
      private callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
      observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
      disconnect() { /* no-op */ }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init?: { method?: string }) => Promise.resolve(init?.method === 'HEAD'
      ? { ok: true, headers: new Headers({ 'content-length': '128' }) }
      : { ok: true, json: async () => ({ data: [{ type: 'scatter3d' }] }) })));
    render(<PlotlyChart asset="/notebooks/sample/3d.json" alt="Core parameter space" />);
    expect(await screen.findByText('This 3D figure requires a WebGL-capable browser.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry figure' })).toBeTruthy();
  });
  it('keeps the sandbox unloaded until clicked and uses an opaque origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<script>document.body.textContent="inside"</script>' }));
    render(<SandboxOutput asset="/notebooks/sample/embed.html" caption="Reviewed output" />);
    expect(screen.queryByTitle('Reviewed output')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load embedded output' }));
    const iframe = await screen.findByTitle<HTMLIFrameElement>('Reviewed output');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('srcdoc')).toContain("default-src 'none'");
    expect(iframe.getAttribute('srcdoc')).toContain("connect-src 'none'");
    window.dispatchEvent(new MessageEvent('message', { data: { channel: 'forged', height: 9999 }, source: window }));
    expect(iframe.style.height).toBe('400px');
  });
});
