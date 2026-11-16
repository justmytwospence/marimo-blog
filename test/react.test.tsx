// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MarimoDocument, MarimoNode } from '../src/types.js';
import { CodeBlock } from '../src/react/CodeBlock.js';
import { MarimoArticle } from '../src/react/index.js';
import { SandboxOutput } from '../src/client/SandboxOutput.js';
import { DataTable } from '../src/client/DataTable.js';
import { PlotlyChart } from '../src/client/PlotlyChart.js';
import { FigureFrame } from '../src/client/FigureFrame.js';

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
function staticArticle(props: Parameters<typeof MarimoArticle>[0]) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<MarimoArticle {...props} />);
  return container;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('figure presentation', () => {
  it('renders authored callouts as visible notes, never folded warnings', () => {
    const article = staticArticle({ document: documentWith([{ type: 'callout', kind: 'danger', children: [{ type: 'html', html: '<p>Careful</p>' }] }]) });
    const note = article.querySelector('aside.mb-callout.mb-callout-danger[role="note"]')!;
    expect(note.querySelector('.mb-callout-title')!.textContent).toBe('Danger');
    expect(note.textContent).toContain('Careful');
    expect(article.querySelector('details[data-mb-kind="warnings"]')).toBeNull();
  });

  it('preserves the author chart host while status and caption stay outside it', () => {
    const frame = (state: 'idle' | 'loading' | 'ready' | 'error') => <FigureFrame state={state} caption="Saved evidence" fallback={<p role="status">Figure status</p>}><div data-testid="author-chart" /></FigureFrame>;
    const view = render(frame('idle'));
    const host = screen.getByTestId('author-chart');
    const viewport = host.parentElement;
    for (const state of ['loading', 'ready', 'error', 'idle'] as const) {
      view.rerender(frame(state));
      expect(screen.getByTestId('author-chart')).toBe(host);
      expect(host.parentElement).toBe(viewport);
      expect(viewport?.getAttribute('aria-busy')).toBe(String(state === 'loading'));
      expect(screen.queryByRole('status') !== null).toBe(state !== 'ready');
      expect(viewport?.contains(screen.getByText('Saved evidence'))).toBe(false);
    }
  });
});

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

describe('reading-first article structure', () => {
  it('renders folded source after saved content in its originating cell', () => {
    const doc = documentWith([{ type: 'html', html: '<p>Read this first.</p>' }]);
    doc.cells.push({ ...doc.cells[0]!, id: 'named', ordinal: 3, source: 'result = 42', outputs: [] });
    const article = staticArticle({ document: doc });
    expect(article.querySelector('.mb-source-appendix')).toBeNull();
    const cells = article.querySelectorAll('.mb-cell');
    expect(cells).toHaveLength(2);
    const source = cells[0]!.querySelector<HTMLDetailsElement>('details[data-mb-kind="code"]')!;
    expect(source.open).toBe(false);
    expect(source.textContent).toContain('print(42)');
    expect(cells[0]!.textContent!.indexOf('Read this first.')).toBeLessThan(cells[0]!.textContent!.indexOf('print(42)'));
    expect(cells[1]!.textContent).toContain('result = 42');
    expect(article.querySelector('a[download]')).toBeNull();
  });

  for (const code of ['folded', 'visible', 'hidden'] as const) {
    for (const cellCode of ['folded', 'visible', 'hidden'] as const) {
      it.each([false, true])(`respects host ${code}, cell ${cellCode}, hideCode=%s`, (hideCode) => {
        const doc = documentWith();
        Object.assign(doc.cells[0]!, { code: cellCode, hideCode });
        const article = staticArticle({ document: doc, code });
        const hidden = code === 'hidden' || cellCode === 'hidden' || hideCode;
        const details = article.querySelector<HTMLDetailsElement>('details[data-mb-kind="code"]');
        expect(details !== null).toBe(!hidden);
        if (hidden) expect(article.textContent).not.toContain('print(42)');
        else expect(details!.open).toBe(code === 'visible' || cellCode === 'visible');
        expect(article.querySelector('a[download]')).toBeNull();
      });
    }
  }

  it('keeps published code expanded independently of folded source', () => {
    const article = staticArticle({ document: documentWith([{ type: 'html', html: '<p>Inline <code>x</code>.</p><pre><code>example()</code></pre>' }]) });
    const details = article.querySelectorAll<HTMLDetailsElement>('details[data-mb-kind="code"]');
    expect(details).toHaveLength(2);
    expect(Array.from(details, (item) => item.open)).toEqual([true, false]);
    expect(article.querySelector('p code')?.textContent).toBe('x');
  });

  it('omits absent source, empty cells, empty tools and an empty appendix', () => {
    const doc = documentWith();
    delete doc.cells[0]!.source;
    delete doc.sourceDownload;
    delete doc.interactive;
    doc.toc = [];
    const article = staticArticle({ document: doc });
    expect(article.querySelector('.mb-cell')).toBeNull();
    expect(article.querySelector('.mb-code-details, .mb-source-appendix, .mb-article-tools, .mb-article-aside')).toBeNull();
    expect(article.querySelector('button, a[download]')).toBeNull();
  });

  it('retains output, visible console and disabled notices with original IDs and ordinals', () => {
    const doc = documentWith();
    const base = { ...doc.cells[0]!, source: undefined };
    doc.cells = [
      { ...base, id: 'empty', ordinal: 0 },
      { ...base, id: 'output', ordinal: 4, outputs: [{ type: 'text', text: 'Saved output' }] },
      { ...base, id: 'console', ordinal: 6, consoleOutputs: [{ type: 'text', text: 'Saved log' }] },
      { ...base, id: 'hidden-console', ordinal: 7, console: 'hidden', consoleOutputs: [{ type: 'text', text: 'Hidden log' }] },
      { ...base, id: 'disabled', ordinal: 9, disabled: true },
    ];
    const article = staticArticle({ document: doc });
    expect(Array.from(article.querySelectorAll('.mb-cell'), (cell) => [cell.getAttribute('data-cell-id'), cell.getAttribute('aria-label')])).toEqual([
      ['output', 'Cell 5'], ['console', 'Cell 7'], ['disabled', 'Cell 10'],
    ]);
    expect(article.querySelector<HTMLDetailsElement>('details[data-mb-kind="logs"]')!.open).toBe(false);
    expect(article.textContent).toContain('Saved log');
    const transcript = article.querySelector('details[data-mb-kind="logs"] .mb-codeblock[data-mb-header]')!;
    expect(transcript.querySelector('.mb-codeblock-lang')!.textContent).toBe('Console output');
    expect(transcript.querySelector('[data-mb-code-action="wrap"]')).not.toBeNull();
    expect(transcript.querySelector('[data-mb-code-action="lines"]')).toBeNull();
    expect(article.textContent).not.toContain('Hidden log');
    expect(article.textContent).toContain('This cell was disabled in the export.');
  });

  it('renders a custom header and footer only once without adding another title', () => {
    const article = staticArticle({ document: documentWith(), header: <header><h1>Host title</h1></header>, footer: <p>Host footer</p> });
    expect(article.querySelectorAll('h1')).toHaveLength(1);
    expect(article.querySelector('.mb-article-header h1')?.textContent).toBe('Host title');
    expect(article.querySelector('.mb-header')).toBeNull();
    expect(article.querySelector('.mb-article-footer')?.textContent).toBe('Host footer');
    expect(article.textContent).not.toContain('Sample ');
  });

  it('server-renders one closed auto contents disclosure outside the main column', () => {
    const article = staticArticle({ document: documentWith([{ type: 'html', html: '<h2 id="chapter">Chapter</h2>' }]) });
    expect(article.querySelectorAll('h1')).toHaveLength(1);
    expect(article.querySelectorAll('nav')).toHaveLength(1);
    const contents = article.querySelector<HTMLDetailsElement>('.mb-article-aside nav > details')!;
    expect(contents.open).toBe(false);
    expect(contents.querySelector('summary')?.textContent).toContain('On this page');
    expect(contents.querySelector('a')?.getAttribute('href')).toBe('#chapter');
    expect(article.querySelector('.mb-article-main nav')).toBeNull();
    expect(staticArticle({ document: documentWith(), toc: false }).querySelector('nav')).toBeNull();
  });
});

describe('client islands', () => {
  it('renders hidden switches on the server, without a rail Contents switch', () => {
    const article = staticArticle({ document: documentWith([{ type: 'html', html: '<p>x</p><pre><code>e()</code></pre>' }, { type: 'plotly', asset: '/notebooks/sample/f.json' }]) });
    const bar = article.querySelector('.mb-switches-bar')!;
    const rail = article.querySelector('.mb-toc .mb-switches-rail')!;
    expect(bar.hasAttribute('data-ready')).toBe(false);
    expect(rail.hasAttribute('data-ready')).toBe(false);
    expect(Array.from(bar.querySelectorAll('[role=switch]'), (s) => s.querySelector('.mb-switch-label')?.textContent)).toEqual(['Table of contents', 'Code', 'Results']);
    expect(Array.from(rail.querySelectorAll('[role=switch]'), (s) => s.querySelector('.mb-switch-label')?.textContent)).toEqual(['Code', 'Results']);
    const mixed = bar.querySelector('[role=switch][data-state=mixed]')!;
    expect(mixed.querySelector('.mb-switch-label')?.textContent).toBe('Code');
    expect(mixed.querySelector('.mb-switch-count')?.textContent).toBe('1/2');
    expect(bar.querySelectorAll('.mb-switch-count')).toHaveLength(1);
    expect(bar.querySelector('.mb-switch-reset')).toBeNull();
  });
  it('omits empty plain-text results', () => {
    const article = staticArticle({ document: documentWith([{ type: 'text', text: '' } as MarimoNode, { type: 'text', text: '  \n' } as MarimoNode]) });
    expect(article.querySelector('details[data-mb-kind="results"]')).toBeNull();
  });
  it('renders highlighted standalone code blocks', () => {
    const html = renderToStaticMarkup(<CodeBlock code="def f(): pass" language="python" />);
    expect(html).toContain('mb-hl-keyword');
    expect(html).toContain('>Python<');
  });
  it('renders closed-card summary parts without separator text', () => {
    const article = staticArticle({ document: documentWith([{ type: 'plotly', asset: '/notebooks/sample/f.json', caption: 'Cap' } as MarimoNode]), presentation: { results: 'collapsed' } });
    const result = article.querySelector('details[data-mb-kind="results"] > summary')!;
    expect(result.querySelector('.mb-disclosure-label')?.textContent).toContain('Figure');
    expect(result.querySelector('.mb-disclosure-preview')?.textContent).toBe('Cap');
    expect(result.textContent).not.toContain(' — Cap');
    expect(article.querySelector('details[data-mb-kind="code"] > summary .mb-disclosure-preview')?.textContent).toBe('1 line');
    const label = article.querySelector('details[data-mb-kind="code"] > summary .mb-disclosure-label')?.textContent ?? '';
    expect(label).toContain('Python');
    expect(label).not.toContain('Source');
  });
  it('renders the rail switches before the contents summary', () => {
    const article = staticArticle({ document: documentWith([{ type: 'plotly', asset: '/notebooks/sample/f.json' } as MarimoNode]) });
    const rail = article.querySelector('nav.mb-toc > .mb-switches-rail')!;
    const details = article.querySelector('nav.mb-toc > details')!;
    expect(rail.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('keeps bar and rail switches in sync and offers reset only after a change', async () => {
    render(<MarimoArticle document={documentWith([])} />);
    const bar = document.querySelector<HTMLElement>('.mb-switches-bar')!;
    const rail = document.querySelector<HTMLElement>('.mb-switches-rail')!;
    await waitFor(() => expect(bar.hasAttribute('data-ready') && rail.hasAttribute('data-ready')).toBe(true));
    expect(within(bar).queryByText('Reset view')).toBeNull();
    fireEvent.click(within(rail).getByRole('switch', { name: 'Code' }));
    await waitFor(() => expect(within(bar).getByRole('switch', { name: 'Code' }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(within(bar).getByText('Reset view'));
    await waitFor(() => expect(within(bar).getByRole('switch', { name: 'Code' }).getAttribute('aria-checked')).toBe('false'));
    expect(within(bar).queryByText('Reset view')).toBeNull();
  });
  it('scopes view switches to each article and resets on document replacement', async () => {
    const { rerender } = render(<><MarimoArticle document={documentWith([], '-a')} /><MarimoArticle document={documentWith([], '-b')} /></>);
    const articles = screen.getAllByRole('article');
    fireEvent.click(within(articles[0]!.querySelector<HTMLElement>('.mb-switches-bar')!).getByRole('switch', { name: 'Code' }));
    await waitFor(() => expect(articles[0]!.querySelector<HTMLDetailsElement>('details[data-mb-kind="code"]')?.open).toBe(true));
    expect(articles[1]!.querySelector<HTMLDetailsElement>('details[data-mb-kind="code"]')?.open).toBe(false);
    rerender(<><MarimoArticle document={documentWith([], '-c')} /><MarimoArticle document={documentWith([], '-b')} /></>);
    expect(screen.getAllByRole('article')[0]!.querySelector<HTMLDetailsElement>('details[data-mb-kind="code"]')?.open).toBe(false);
  });
  it('observes and activates headings only in the owning article when IDs repeat', () => {
    const observed: Element[] = [];
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    vi.stubGlobal('IntersectionObserver', class {
      observe(element: Element) { observed.push(element); }
      disconnect() { /* no-op */ }
    });
    const first = documentWith([{ type: 'html', html: '<details><summary>First section</summary><h2 id="chapter">Chapter</h2></details>' }], '-a');
    const second = documentWith([{ type: 'html', html: '<details><summary>Second section</summary><h2 id="chapter">Chapter</h2></details>' }], '-b');
    first.toc = second.toc = [{ id: 'chapter', title: 'Chapter', level: 2 }];
    render(<><MarimoArticle document={first} /><MarimoArticle document={second} /></>);
    const articles = screen.getAllByRole('article');
    expect(observed).toEqual(articles.map((article) => article.querySelector('#chapter')));
    const firstPanel = articles[0]!.querySelector<HTMLDetailsElement>('.mb-prose details')!;
    const secondPanel = articles[1]!.querySelector<HTMLDetailsElement>('.mb-prose details')!;
    fireEvent.click(within(articles[1]!).getByRole('link', { name: 'Chapter' }));
    expect(firstPanel.open).toBe(false);
    expect(secondPanel.open).toBe(true);
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
  it('autoloads the sandbox only near the viewport and uses an opaque origin', async () => {
    let intersect: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() { /* reader has not scrolled near the figure */ }
      disconnect() { /* no-op */ }
    });
    // jsdom has no layout; give the figure a real width so it is renderable.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 640 } as DOMRect);
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<script>document.body.textContent="inside"</script>' });
    vi.stubGlobal('fetch', fetch);
    render(<SandboxOutput asset="/notebooks/sample/embed.html" caption="Reviewed output" />);
    expect(screen.queryByTitle('Reviewed output')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Load embedded output' })).toBeNull();
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    const iframe = await screen.findByTitle<HTMLIFrameElement>('Reviewed output');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('srcdoc')).toContain("default-src 'none'");
    expect(iframe.getAttribute('srcdoc')).toContain("connect-src 'none'");
    window.dispatchEvent(new MessageEvent('message', { data: { channel: 'forged', height: 9999 }, source: window }));
    expect(iframe.style.height).toBe('400px');
    fireEvent.load(iframe);
    expect(iframe.closest('figure')?.getAttribute('data-state')).toBe('ready');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('offers retry after an automatic sandbox load fails', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 640 } as DOMRect);
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, text: async () => '<p>Saved output</p>' });
    vi.stubGlobal('fetch', fetch);
    render(<SandboxOutput asset="/notebooks/sample/embed.html" caption="Retried output" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry embedded output' }));
    await screen.findByTitle('Retried output');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Retry embedded output' })).toBeNull();
  });
});
