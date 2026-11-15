import { describe, expect, it } from 'vitest';
import { compileMime } from '../../src/node/mime.js';
import { AssetCollector } from '../../src/node/assets.js';
import type { MimeContext } from '../../src/node/mime.js';

function context(): MimeContext {
  return { html: { title: 'Test', toc: [], usedIds: new Set(), consumedTitle: false, cellId: 'cell' }, assets: new AssetCollector({ files: {}, assetBase: '/assets' }), diagnostics: [], cellId: 'cell', outputIndex: 0 };
}
function encoded(value: unknown): string {
  return JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}
const output = (html: string) => ({ type: 'data', data: { 'text/html': html } });

describe('official marimo table output', () => {
  it('decodes the nested JSON string once per serialization layer, preserving typed rows and visibility', async () => {
    const rows = [{ Name: 'A', Score: 0, Hidden: 'private', Passed: false }, { Name: 'B', Score: 2, Hidden: 'private', Passed: true }];
    const html = `<marimo-ui-element><marimo-table data-data='${encoded(JSON.stringify(rows))}' data-total-rows='4' data-hidden-columns='${encoded(['Hidden'])}' data-show-download='false'></marimo-table></marimo-ui-element>`;
    const ctx = context();
    const nodes = await compileMime(output(html), ctx);
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    expect(node).toMatchObject({ type: 'table', preview: { headers: ['Name', 'Score', 'Passed'], rows: [['A', 0, false], ['B', 2, true]], totalRows: 4, download: false } });
    if (node?.type !== 'table') throw Error('Expected table');
    expect(JSON.parse(Buffer.from(ctx.assets.bytes.values().next().value!).toString())).toMatchObject({ headers: ['Name', 'Score', 'Passed'], rows: [['A', 0, false], ['B', 2, true]] });
    expect(ctx.diagnostics).toMatchObject([{ code: 'MB_TRUNCATED_TABLE', severity: 'warning' }]);
  });

  it('reads a bundled CSV virtual file without remote requests or evaluating cell HTML', async () => {
    const ctx = context();
    ctx.assets.context.files['/@file/table.csv'] = `data:text/csv;base64,${Buffer.from('Name,Score\nAlice,7\nBob,3\n').toString('base64')}`;
    const [node] = await compileMime(output(`<marimo-table data-data='${encoded('/@file/table.csv')}' data-total-rows='2'></marimo-table>`), ctx);
    expect(node).toMatchObject({ type: 'table', preview: { headers: ['Name', 'Score'], rows: [['Alice', '7'], ['Bob', '3']] } });
    expect(ctx.diagnostics).toEqual([]);
  });

  it('retains semantic multi-index spans and literal ellipsis in plain HTML tables', async () => {
    const ctx = context();
    const [node] = await compileMime(output('<table><thead><tr><th rowspan="2">Runner</th><th colspan="2">Result</th></tr></thead><tbody><tr><td>...</td><td></td></tr></tbody></table>'), ctx);
    expect(node).toMatchObject({ type: 'html' });
    if (node?.type !== 'html') throw Error('Expected HTML');
    expect(node.html).toMatch(/rowspan="2"/);
    expect(node.html).toMatch(/colspan="2"/);
    expect(node.html).toContain('>...</td>');
    expect(node.html).toContain('<td></td>');
  });

  it('rejects unsafe columns and malformed serialized table data', async () => {
    const ctx = context();
    await expect(compileMime(output(`<marimo-table data-data='${encoded('[{"__proto__":1}]')}'></marimo-table>`), ctx)).rejects.toThrow(/Unsafe table key/);
    await expect(compileMime(output('<marimo-table data-data="not-json"></marimo-table>'), context())).rejects.toThrow(/Invalid marimo data attribute/);
  });

  it('shows a Python-required notice for dataframes without captured row data', async () => {
    const ctx = context();
    const nodes = await compileMime(output('<marimo-ui-element><marimo-dataframe data-total="2"></marimo-dataframe></marimo-ui-element>'), ctx);
    expect(nodes).toMatchObject([{ type: 'runtime-required', value: 'Dataframe' }]);
    expect(ctx.diagnostics).toMatchObject([{ code: 'MB_RUNTIME_REQUIRED', severity: 'warning' }]);
  });
});
