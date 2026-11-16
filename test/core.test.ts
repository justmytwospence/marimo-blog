import { describe, expect, it } from 'vitest';
import { importMarimoHtml } from '../src/node/import-html.js';
import { compileSnapshot } from '../src/node/compile.js';
import { MarimoBlogError } from '../src/diagnostics.js';
import { getPlainText, parseDocument } from '../src/index.js';
import { parseMetadataYaml } from '../src/node/metadata.js';
import { compileHtml, normalizeMarimoMarkup } from '../src/node/html.js';

const notebook = { version: '1', metadata: { marimo_version: '0.25.1' }, cells: [{ id: 'one', code: 'mo.md("# Article")', code_hash: 'hash', name: '_', config: { hide_code: false, disabled: false } }, { id: 'two', code: null, code_hash: null, name: 'second', config: {} }] };
const session = { version: '1', metadata: { marimo_version: '0.25.1' }, cells: [{ id: 'one', code_hash: 'hash', outputs: [{ type: 'data', data: { 'text/html': '<h1>Article</h1><h2 id="section">Résumé</h2><p>Read <a href="https://example.org">here</a><script>globalThis.pwned=1</script></p>' } }, { type: 'data', data: { 'image/png': 'aGVsbG8=' } }], console: [{ type: 'stream', name: 'stdout', text: 'print output', mimetype: null }] }, { id: 'two', code_hash: null, outputs: [{ type: 'data', data: { 'text/plain': '0' } }], console: [] }] };
const freeze = (value: unknown): string => `Object.freeze(${JSON.stringify(value).replaceAll('<', '\\u003c')})`;
function exportHtml(changes: { mount?: string; static?: string; code?: string; extras?: string } = {}): string {
  const mount = changes.mount ?? freeze({ version: '0.25.1', notebook, session, layout: null });
  const staticState = changes.static ?? 'Object.freeze({files:Object.freeze({}),modelNotifications:Object.freeze([])})';
  const wrapper = (key: string, value: string): string => `<script data-marimo="true">Object.defineProperty(window, "${key}", {value:${value}, writable:false, configurable:false});</script>`;
  return `<!doctype html><html><head>${changes.extras ?? ''}${wrapper('__MARIMO_MOUNT_CONFIG__', mount)}${wrapper('__MARIMO_STATIC__', staticState)}<marimo-code hidden="">${changes.code ?? encodeURIComponent('print("hello")')}</marimo-code></head><body></body></html>`;
}
const config = { slug: 'article', title: 'Article', date: '2025-11-25', description: 'A reading experience.' };
describe('literal marimo export boundary', () => {
  it('extracts joined cells, preserves false/zero and compiles inert article content', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    expect(snapshot.notebook.cells[1]?.id).toBe('two');
    const { document, assets } = await compileSnapshot(snapshot, { metadata: { ...config, cells: { one: { allowDiagnostics: ['MB_SCRIPT_SANDBOX'] } } }, assetBase: '/notebooks/article/assets' });
    expect(document.toc).toEqual([{ id: 'section', title: 'Résumé', level: 2 }]);
    expect(getPlainText(document)).toContain('Résumé');
    expect(document.plainText).not.toContain('print output');
    expect(JSON.stringify(document)).not.toContain('globalThis.pwned');
    expect(document.cells[1]?.outputs).toEqual([{ type: 'text', text: '0' }]);
    expect(document.assets).toHaveLength(2); // source and image
    expect([...assets.values()].some((bytes) => Buffer.from(bytes).toString() === 'hello')).toBe(true);
    expect(parseDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined();
  });
  it('applies per-output HTML roles only to nested HTML leaves and retains strict validation', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    snapshot.session.cells[0]!.outputs = [
      { type: 'data', data: { 'text/html': '<div style="display:flex;flex-direction:column"><p>Intro</p><marimo-tabs data-tabs=\'["Panel"]\'><div data-kind="tab"><p>Inside</p></div></marimo-tabs><marimo-plotly data-figure=\'{"data":[]}\'></marimo-plotly></div>' } },
      { type: 'data', data: { 'text/markdown': '<p>Ordinary prose</p>' } },
    ];
    const yaml = `slug: article\ntitle: Article\ndate: 2025-11-25\ndescription: A reading experience.\ncells:\n  one:\n    outputs:\n      '0':\n        htmlRole: result\n      '1':\n        htmlRole: narrative\n`;
    const metadata = parseMetadataYaml(yaml);
    const { document } = await compileSnapshot(snapshot, { metadata, assetBase: '/assets' });
    expect(document.cells[0]!.outputs).toMatchObject([
      { type: 'layout', children: [{ type: 'html', role: 'result' }, { type: 'tabs', panels: [{ children: [{ type: 'html', role: 'result' }] }] }, { type: 'plotly' }] },
      { type: 'html', role: 'narrative' },
    ]);
    expect(parseDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    const unmarked = await compileSnapshot(snapshot, { metadata: config, assetBase: '/assets' });
    expect(unmarked.document.cells[0]!.outputs[1]).not.toHaveProperty('role');
    expect(() => parseMetadataYaml(yaml.replace('htmlRole: result', 'htmlRole: other'))).toThrow(/MB_SCHEMA/);
    for (const node of [{ type: 'html', html: '<p>Ok</p>', role: 'other' }, { type: 'text', text: 'x', role: 'result' }, { type: 'html', html: '<script>bad()</script>', role: 'result' }]) {
      expect(() => parseDocument({ ...document, cells: [{ ...document.cells[0], outputs: [node] }] })).toThrow(/MB_SCHEMA/);
    }
    snapshot.session.cells[0]!.outputs[0] = { type: 'data', data: { 'text/html': '<p onclick="bad()">Text</p><script>bad()</script>' } };
    await expect(compileSnapshot(snapshot, { metadata, assetBase: '/assets' })).rejects.toThrow(/MB_SCRIPT_SANDBOX/);
  });
  it('rejects unrendered and string-valued wrappers and executable expression trees', () => {
    expect(() => importMarimoHtml(exportHtml({ mount: 'Object.freeze("{\\"version\\":\\"0.25.1\\"}")' }))).toThrow(MarimoBlogError);
    expect(() => importMarimoHtml(exportHtml({ mount: 'Object.freeze({version:alert(1)})' }))).toThrow(MarimoBlogError);
    expect(() => importMarimoHtml(exportHtml({ mount: 'Object.freeze({version:"0.25.1", ...window.evil})' }))).toThrow(MarimoBlogError);
    expect(() => importMarimoHtml(exportHtml({ extras: '<script>Object.defineProperty(window,"__MARIMO_MOUNT_CONFIG__",{value:Object.freeze({})})</script>' }))).toThrow(MarimoBlogError);
    expect(() => importMarimoHtml('<html><script>Object.freeze("{{ mount_config }}")</script></html>')).toThrow(MarimoBlogError);
  });
  it('fails unknown versions, conflicting hashes, malformed code and strict output warnings', async () => {
    expect(() => importMarimoHtml(exportHtml({ mount: freeze({ version: '0.26.0', notebook, session }) }))).toThrow(/MB_EXPORT_VERSION/);
    const changed = { ...session, cells: [{ ...session.cells[0], code_hash: 'wrong' }, session.cells[1]] };
    expect(() => importMarimoHtml(exportHtml({ mount: freeze({ version: '0.25.1', notebook, session: changed }) }))).toThrow(/MB_CELL_HASH/);
    expect(() => importMarimoHtml(exportHtml({ code: '%E0%A4%A' }))).toThrow(/MB_SCHEMA/);
    await expect(compileSnapshot(importMarimoHtml(exportHtml()), { metadata: config, assetBase: '/assets' })).rejects.toThrow(/MB_SCRIPT_SANDBOX/);
  });
  it('compiles bounded KaTeX without trusting commands or executable CSS', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    snapshot.session.cells[0]!.outputs = [{ type: 'data', data: { 'text/latex': 'x^2+\\frac{1}{2}' } }];
    const { document } = await compileSnapshot(snapshot, { metadata: config, assetBase: '/assets' });
    expect(document.cells[0]?.outputs[0]?.type).toBe('math');
    expect(JSON.stringify(document.cells[0]?.outputs[0])).toContain('katex');
    expect(() => parseDocument({ ...document, cells: [{ ...document.cells[0], outputs: [{ type: 'html', html: '<p style="position:fixed;top:0">unsafe</p>' }] }] })).toThrow(/MB_SCHEMA/);
  });
  it('includes nested prose but not table rows or console prose in feed text', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    snapshot.session.cells[0]!.outputs = [{ type: 'data', data: { 'text/html': '<div style="display:flex;flex-direction:column"><p>Nested prose</p><table><tbody><tr><td>Private table row</td></tr></tbody></table></div>' } }];
    snapshot.session.cells[0]!.console = [{ type: 'data', data: { 'text/html': '<h2>Console heading</h2><img src="data:image/png;base64,aGVsbG8=">' } }];
    const { document } = await compileSnapshot(snapshot, { metadata: { ...config, includeSource: false }, assetBase: '/assets' });
    expect(document.plainText).toContain('Nested prose');
    expect(document.plainText).not.toContain('Private table row');
    expect(document.plainText).not.toContain('Console heading');
    expect(document.toc).toEqual([]);
    expect(document.assets).toHaveLength(1);
    expect(JSON.stringify(document.cells[0]!.consoleOutputs)).not.toContain('data:image');
  });

  it('rejects remote URLs impersonating local structured assets and duplicate cells', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    snapshot.session.cells[0]!.outputs = [{ type: 'data', data: { 'application/vnd.plotly.v1+json': { data: [] } } }];
    const { document } = await compileSnapshot(snapshot, { metadata: config, assetBase: '/assets' });
    const chart = document.cells[0]!.outputs[0]!;
    if (chart.type !== 'plotly') throw Error('Expected chart');
    for (const prefix of ['https://evil.example', '//evil.example']) {
      expect(() => parseDocument({ ...document, cells: [{ ...document.cells[0], outputs: [{ ...chart, asset: prefix + chart.asset }] }] })).toThrow(/External structured payload/);
    }
    expect(() => parseDocument({ ...document, cells: [document.cells[0], document.cells[0]] })).toThrow(/Duplicate document cell/);
    expect(() => parseDocument({ ...document, assetBase: '/assets/../assets' })).toThrow();
  });

  it('permits generated code only with a reviewed per-output sandbox exception', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    snapshot.session.cells[0]!.outputs = [{ type: 'data', data: { 'text/html': '<script>new Function("return 42")()</script>' } }];
    for (const allowEval of [false, true]) {
      const { document, assets } = await compileSnapshot(snapshot, { metadata: { ...config, includeSource: false, cells: { one: { outputs: { '0': { html: 'sandbox', sandboxAllowEval: allowEval } } } } }, assetBase: '/assets' });
      expect(document.cells[0]!.outputs[0]).toMatchObject({ type: 'sandbox', ...(allowEval ? { allowEval: true } : {}) });
      expect([...assets.values()].map((bytes) => Buffer.from(bytes).toString()).join('')).toContain(allowEval ? "script-src 'unsafe-inline' 'unsafe-eval'" : "script-src 'unsafe-inline' ;");
    }
    await expect(compileSnapshot(snapshot, { metadata: { ...config, cells: { one: { outputs: { '0': { sandboxAllowEval: true } } } } }, assetBase: '/assets' })).rejects.toThrow(/requires an explicit sandbox/);
  });

  it('runs only registered version-matched adapters and validates their returned nodes', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    snapshot.session.cells[0]!.outputs = [{ type: 'data', data: { 'application/x-example': false } }];
    const adapter = { name: 'example', exporterVersions: ['0.25.1'], matches: (output: unknown) => JSON.stringify(output).includes('application/x-example'), compile: () => [{ type: 'html' as const, html: '<p>Adapter result</p>' }] };
    const { document } = await compileSnapshot(snapshot, { metadata: config, assetBase: '/assets', adapters: [adapter] });
    expect(document.plainText).toContain('Adapter result');
    await expect(compileSnapshot(snapshot, { metadata: config, assetBase: '/assets', adapters: [{ ...adapter, exporterVersions: ['0.25.2'] }] })).rejects.toThrow(/Unsupported MIME/);
    await expect(compileSnapshot(snapshot, { metadata: config, assetBase: '/assets', adapters: [adapter, adapter] })).rejects.toThrow(/unique names/);
    await expect(compileSnapshot(snapshot, { metadata: config, assetBase: '/assets', adapters: [{ ...adapter, compile: () => [{ type: 'image', src: 'https://unreviewed.invalid/x.png', alt: '' }] }] })).rejects.toThrow(/not allowlisted/);
  });

  it('omits source and download when requested and rejects arbitrary manifest HTML', async () => {
    const { document } = await compileSnapshot(importMarimoHtml(exportHtml()), { metadata: { ...config, includeSource: false, cells: { one: { allowDiagnostics: ['MB_SCRIPT_SANDBOX'] } } }, assetBase: '/assets' });
    expect(document.sourceDownload).toBeUndefined();
    expect(document.cells[0]?.source).toBeUndefined();
    expect(() => parseDocument({ ...document, cells: [{ ...document.cells[0], outputs: [{ type: 'html', html: '<img src=x onerror="alert(1)">' }] }] })).toThrow(/MB_SCHEMA/);
  });
  it('maps marimo admonitions and task lists to inert, styled markup', () => {
    const marimo = '<span class="markdown prose dark:prose-invert contents"><div class="admonition warning">\n<span class="admonition-title">Careful</span>\n<span class="paragraph">body</span>\n</div><ul class="task-list">\n<li class="task-list-item"><input type="checkbox" disabled checked/> done</li>\n<li class="task-list-item"><input type="checkbox" disabled/> todo</li>\n</ul></span>';
    const { html } = compileHtml(marimo, { cellId: 'c', title: 'x', toc: [], usedIds: new Set(), consumedTitle: true });
    expect(html).toContain('class="mb-callout mb-callout-warning" role="note"');
    expect(html).toContain('<p class="mb-callout-title">Careful</p>');
    expect(html).toContain('class="mb-task-list"');
    expect(html).toContain('class="mb-task-box mb-task-checked"');
    expect(html).toContain('Done: ');
    expect(html).toContain('Not done: ');
    expect(html).not.toContain('<input');
    expect(normalizeMarimoMarkup(html)).toBe(html);
  });
  it('warns about figures without alt text or caption', async () => {
    const snapshot = importMarimoHtml(exportHtml());
    const base = { ...config, cells: { one: { allowDiagnostics: ['MB_SCRIPT_SANDBOX'] } } };
    const { document } = await compileSnapshot(snapshot, { metadata: base, assetBase: '/notebooks/article/assets' });
    expect(document.diagnostics).toContainEqual(expect.objectContaining({ code: 'MB_ALT_MISSING', severity: 'warning', cellId: 'one', outputIndex: 1 }));
    const described = await compileSnapshot(snapshot, { metadata: { ...base, cells: { one: { ...base.cells.one, outputs: { '1': { alt: 'A figure' } } } } }, assetBase: '/notebooks/article/assets' });
    expect(described.document.diagnostics.some((item) => item.code === 'MB_ALT_MISSING')).toBe(false);
  });
});
