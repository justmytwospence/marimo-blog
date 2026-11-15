import { describe, expect, it } from 'vitest';
import { compileMime } from '../../src/node/mime.js';
import { AssetCollector } from '../../src/node/assets.js';
import type { MimeContext } from '../../src/node/mime.js';

function context(): MimeContext {
  return { html: { title: 'Test', toc: [], usedIds: new Set(), consumedTitle: false, cellId: 'layout' }, assets: new AssetCollector({ files: {}, assetBase: '/assets' }), diagnostics: [], cellId: 'layout', outputIndex: 0 };
}
const encoded = (value: unknown) => JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
const output = (html: string) => ({ type: 'data', data: { 'text/html': html } });

describe('precomputed marimo panels', () => {
  it('preserves tabs, panel headings and a chart nested inside a panel', async () => {
    const spec = { data: [{ x: [1, 2], y: [2, 3], type: 'scatter' }] };
    const html = `<marimo-ui-element><marimo-tabs data-tabs='${encoded(['<strong>First</strong>', 'Second'])}'><div data-kind='tab'><p>Saved prose</p></div><div data-kind='tab'><marimo-plotly data-figure='${encoded(spec)}'></marimo-plotly></div></marimo-tabs></marimo-ui-element>`;
    const ctx = context();
    const [node] = await compileMime(output(html), ctx);
    expect(node).toMatchObject({ type: 'tabs', panels: [{ title: 'First', children: [{ type: 'html' }] }, { title: 'Second', children: [{ type: 'plotly' }] }] });
    expect(ctx.assets.assets).toHaveLength(1);
  });

  it('shows all captured accordion panels, including nested precomputed tabs', async () => {
    const tabs = `<marimo-tabs data-tabs='${encoded(['A'])}'><div data-kind='tab'><p>Inside</p></div></marimo-tabs>`;
    const html = `<marimo-accordion data-labels='${encoded(['Results', '<script>alert(1)</script> More'])}'><div><p>Saved result</p></div><div>${tabs}</div></marimo-accordion>`;
    const [node] = await compileMime(output(html), context());
    expect(node).toMatchObject({ type: 'accordion', panels: [{ title: 'Results', children: [{ type: 'html' }] }, { title: 'More', children: [{ type: 'tabs' }] }] });
  });

  it('keeps marimo hstack/vstack child order as a safe responsive layout', async () => {
    const vertical = `<div style='display: flex;flex: 1;flex-direction: column;justify-content: flex-start;align-items: normal;flex-wrap: nowrap;gap: 0.5rem'><span><p>First</p></span><span><p>Second</p></span></div>`;
    const [stack] = await compileMime(output(vertical), context());
    expect(stack).toMatchObject({ type: 'layout', layout: 'stack', children: [{ type: 'html' }, { type: 'html' }] });
    if (stack?.type !== 'layout') throw Error('Expected layout');
    expect(stack.children.map((child) => child.type === 'html' ? child.html : '')).toEqual([expect.stringContaining('First'), expect.stringContaining('Second')]);
    const horizontal = vertical.replace('flex-direction: column', 'flex-direction: row');
    const [grid] = await compileMime(output(horizontal), context());
    expect(grid).toMatchObject({ type: 'layout', layout: 'grid' });
  });

  it('compiles the outer stack before its nested tabs without dropping siblings', async () => {
    const tabs = `<marimo-tabs data-tabs='${encoded(['A'])}'><div data-kind='tab'><p>Inside</p></div></marimo-tabs>`;
    const [node] = await compileMime(output(`<div style='display:flex;flex-direction:column'><p>Before</p>${tabs}<p>After</p></div>`), context());
    expect(node).toMatchObject({ type: 'layout', children: [{ type: 'html' }, { type: 'tabs' }, { type: 'html' }] });
  });

  it('does not discard textless sibling charts or images', async () => {
    const chart = `<marimo-plotly data-figure='${encoded({ data: [] })}'></marimo-plotly>`;
    const ctx = context();
    expect(await compileMime(output(`${chart}${chart}`), ctx)).toMatchObject([{ type: 'unsupported' }]);
    expect(ctx.diagnostics).toMatchObject([{ code: 'MB_UNSUPPORTED', severity: 'error' }]);
    await expect(compileMime(output(`<marimo-table data-data='${encoded('[]')}'></marimo-table><img src='/public/a.png'>`), context())).rejects.toThrow(/mixed with other output/);
  });

  it('rejects missing panels and contradictory labels rather than silently omitting outputs', async () => {
    await expect(compileMime(output(`<marimo-tabs data-tabs='${encoded(['First', 'Second'])}'><div data-kind='tab'>one</div></marimo-tabs>`), context())).rejects.toThrow(/labels and contents differ/);
  });
});
