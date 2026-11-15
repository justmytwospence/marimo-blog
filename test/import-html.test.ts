import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { importMarimoHtml, readExportGlobals } from '../src/node/import-html.js';
import { compileSnapshot } from '../src/node/compile.js';

describe.each(['0.25.0', '0.25.1', '0.25.2'])('official serializer %s', (version) => {
  it.each(['', '-no-code'])('imports and compiles the checked-in %s fixture without Python', async (suffix) => {
    const html = await readFile(new URL(`./fixtures/marimo-${version}${suffix}.html`, import.meta.url), 'utf8');
    const snapshot = importMarimoHtml(html);
    expect(snapshot.exporterVersion).toBe(version);
    const { document } = await compileSnapshot(snapshot, { metadata: { slug: 'synthetic', title: 'Synthetic export', date: '2026-01-01', description: 'Synthetic serializer fixture' }, assetBase: '/assets/synthetic' });
    expect(document.cells.map((cell) => cell.outputs[0]?.type)).toEqual(['html', 'table', 'tabs', 'accordion', 'layout', 'runtime-required', 'callout', 'statistic', 'json', 'tabs', 'html']);
    expect(document.cells.find((cell) => cell.id === 'slider')?.outputs[0]).toMatchObject({ value: 'Captured setting: 0' });
    expect(document.cells.find((cell) => cell.id === 'stat')?.outputs[0]).toMatchObject({ value: '0', label: 'Count' });
    expect(document.plainText).toContain('Saved first panel');
    expect(document.plainText).toContain('Stack second');
    const math = document.cells.find((cell) => cell.id === 'math')?.outputs[0];
    expect(math?.type === 'html' && math.html).toContain('<math');
    expect(math?.type === 'html' && math.html).toContain('<msqrt>');
    expect(math?.type === 'html' && math.html).toContain('Before');
    expect(math?.type === 'html' && math.html).not.toContain('||[');
    expect(document.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(JSON.stringify(document)).not.toContain('synthetic-test-token');
    expect(document.sourceDownload !== undefined).toBe(suffix === '');
  });
});

// Set MARIMO_BLOG_AUTHENTIC_HTML to a completed official static HTML export.
// Never commit private article exports or execute notebooks in npm tests.
describe.skipIf(!process.env.MARIMO_BLOG_AUTHENTIC_HTML)('official marimo HTML export regression', () => {
  it('extracts the frozen object globals and identical encoded source without evaluating scripts', async () => {
    const html = await readFile(process.env.MARIMO_BLOG_AUTHENTIC_HTML!, 'utf8');
    const snapshot = importMarimoHtml(html);
    const { found, code } = readExportGlobals(html);
    expect(snapshot.exporterVersion).toMatch(/^0\.25\.[012]$/);
    expect(snapshot.notebook.version).toBe('1');
    expect(snapshot.session.version).toBe('1');
    expect(code).toBe((found.get('__MARIMO_EXPORT_CONTEXT__') as { notebookCode: string }).notebookCode.replace(/\r\n/g, '\n'));
    expect(snapshot.session.cells.every((cell) => snapshot.notebook.cells.some((item) => item.id === cell.id))).toBe(true);
    expect(snapshot.session.cells.some((cell) => cell.outputs.some((output) => output && typeof output === 'object' && 'data' in output && output.data && typeof output.data === 'object' && 'text/markdown' in output.data))).toBe(true);
  });
  it('externalizes K-Core figures and isolates the reviewed scripted network without silent fallbacks', async () => {
    const html = await readFile(process.env.MARIMO_BLOG_AUTHENTIC_HTML!, 'utf8');
    const snapshot = importMarimoHtml(html);
    if (!snapshot.notebook.cells.some((cell) => cell.id === 'ROlb')) return;
    await expect(compileSnapshot(snapshot, { metadata: { slug: 'kcore', title: 'K-Core Decomposition for Ultramarathon Data', date: '2025-11-25', description: 'Current K-core analysis' }, assetBase: '/notebooks/kcore/assets' })).rejects.toThrow(/MB_UNSUPPORTED|MB_SCRIPT_SANDBOX/);
    const { document } = await compileSnapshot(snapshot, { metadata: {
      slug: 'kcore', title: 'K-Core Decomposition for Ultramarathon Data', date: '2025-11-25', description: 'Current K-core analysis', includeSource: false,
      cells: { Hbol: { include: false }, ROlb: { outputs: { '0': { html: 'sandbox', caption: 'Interactive network' } } } },
      sandboxScriptUrls: ['https://cdn.plot.ly/plotly-3.3.0.min.js'],
    }, assetBase: '/notebooks/kcore/assets' });
    expect(document.cells.find((cell) => cell.id === 'BYtC')?.outputs[0]?.type).toBe('plotly');
    expect(document.cells.find((cell) => cell.id === 'nWHF')?.outputs[0]?.type).toBe('plotly');
    const sandbox = document.cells.find((cell) => cell.id === 'ROlb')?.outputs[0];
    expect(sandbox).toMatchObject({ type: 'sandbox', scriptUrls: ['https://cdn.plot.ly/plotly-3.3.0.min.js'] });
    expect(sandbox?.type === 'sandbox' && sandbox.asset.endsWith('.txt')).toBe(true);
    expect(document.cells.some((cell) => cell.id === 'Hbol')).toBe(false);
    expect(document.cells.find((cell) => cell.id === 'vblA')?.outputs[0]?.type).toBe('html');
    expect(Buffer.byteLength(JSON.stringify(document))).toBeLessThan(1024 * 1024);
    expect(document.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  });
});
