import katex from 'katex';
import { parseFragment, serialize, serializeOuter } from 'parse5';
import * as cssTree from 'css-tree';
import { parse as parseCsv } from 'csv-parse/sync';
import type { MarimoNode, MarimoDiagnostic } from '../types.js';
import { diagnostic, fail } from '../diagnostics.js';
import { compileHtml, normalizeMarimoMarkup, type HtmlContext } from './html.js';
import { AssetCollector } from './assets.js';
import { sanitizeOutput } from './sanitize.js';

type HtmlNode = { nodeName: string; childNodes?: HtmlNode[]; attrs?: { name: string; value: string }[]; value?: string };
/** What an output adapter may use while compiling one serialized output. */
export interface AdapterContext {
  readonly cellId: string;
  readonly outputIndex: number;
  readonly exporterVersion?: string;
  readonly caption?: string;
  readonly alt?: string;
  /** Store bytes as a hashed publication asset; returns its URL. */
  readonly assets: { add(data: Uint8Array, mime: string): string };
  /** Append diagnostics; errors fail strict builds unless acknowledged. */
  readonly diagnostics: MarimoDiagnostic[];
}
export interface OutputAdapter {
  name: string;
  exporterVersions: readonly string[];
  matches(output: unknown): boolean;
  compile(output: unknown, context: AdapterContext): MarimoNode[] | Promise<MarimoNode[]>;
}
export interface MimeContext { html: HtmlContext; assets: AssetCollector; diagnostics: MarimoDiagnostic[]; cellId: string; outputIndex: number; htmlMode?: 'sanitize' | 'sandbox'; htmlRole?: 'narrative' | 'result'; caption?: string; alt?: string; poster?: string; sandboxScriptUrls?: string[]; sandboxAllowEval?: boolean; depth?: number; exporterVersion?: string; adapters?: readonly OutputAdapter[] }
async function assetJson(value: unknown, type: 'plotly' | 'vega' | 'table' | 'json', context: MimeContext): Promise<MarimoNode> {
  if (type !== 'json' && (!value || typeof value !== 'object')) fail('MB_SCHEMA', 'Invalid structured MIME payload', 'Re-export with a valid chart/table payload.');
  if (value === undefined || typeof value === 'number' && !Number.isFinite(value)) fail('MB_SCHEMA', 'Invalid JSON payload', 'Re-export a JSON-compatible value.');
  const scan = (entry: unknown, depth: number): void => {
    if (depth > 100) fail('MB_SCHEMA', 'Structured payload nesting exceeds limit', 'Reduce chart/table nesting.');
    if (Array.isArray(entry)) { for (const item of entry) scan(item, depth + 1); return; }
    if (entry && typeof entry === 'object') for (const [key, item] of Object.entries(entry)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('MB_SCHEMA', 'Unsafe chart/table key', 'Remove prototype pollution keys.');
      scan(item, depth + 1);
    }
  };
  scan(value, 0);
  const payload: unknown = JSON.parse(JSON.stringify(value));
  if (type === 'vega') {
    const rewriteData = async (entry: unknown, key = ''): Promise<void> => {
      if (Array.isArray(entry)) { for (const item of entry) await rewriteData(item, key); return; }
      if (!entry || typeof entry !== 'object') return;
      const object = entry as Record<string, unknown>;
      if (key === 'data' && typeof object.url === 'string') object.url = await context.assets.url(object.url, 'resource');
      for (const [childKey, child] of Object.entries(object)) if (!['values', 'datasets'].includes(childKey)) await rewriteData(child, childKey);
    };
    await rewriteData(payload);
  }
  const asset = context.assets.add(Buffer.from(JSON.stringify(payload)), 'application/json');
  return { type, asset, caption: context.caption, alt: context.alt, ...((type === 'plotly' || type === 'vega') && context.poster ? { poster: context.poster } : {}) };
}
function attribute(node: HtmlNode, name: string): string | undefined { return node.attrs?.find((item) => item.name === name)?.value; }
function find(node: HtmlNode, predicate: (item: HtmlNode) => boolean): HtmlNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.childNodes ?? []) { const match = find(child, predicate); if (match) return match; }
  return undefined;
}
function text(node: HtmlNode): string { return (node.value ?? '') + (node.childNodes ?? []).map(text).join(''); }
// A text comparison cannot detect a second chart/image/control with empty text.
// Only unwrap neutral, single-child containers when extracting a special node.
function isOnlyOutput(root: HtmlNode, target: HtmlNode): boolean {
  if (root === target) return true;
  if (!['#document-fragment', 'div', 'span', 'marimo-ui-element'].includes(root.nodeName)) return false;
  const children = (root.childNodes ?? []).filter((child) => child.nodeName !== '#comment' && !(child.nodeName === '#text' && !child.value?.trim()));
  return children.length === 1 && isOnlyOutput(children[0]!, target);
}
function safeLabel(markup: string, fallback: string): string {
  const plain = (node: HtmlNode): string => ['script', 'style'].includes(node.nodeName) ? '' : (node.value ?? '') + (node.childNodes ?? []).map(plain).join('');
  return plain(parseFragment(markup) as unknown as HtmlNode).replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;
}
function decodeAttribute(node: HtmlNode, name: string): unknown {
  const value = attribute(node, `data-${name}`);
  if (value === undefined) return undefined;
  try { return JSON.parse(value) as unknown; }
  catch { fail('MB_SCHEMA', `Invalid marimo ${name} attribute`, 'Re-export an intact UI output.'); }
}
function tableRows(node: HtmlNode, context: MimeContext): MarimoNode {
  let serialized = decodeAttribute(node, 'data');
  if (typeof serialized !== 'string') fail('MB_SCHEMA', 'Table export has no captured data', 'Re-export a completed table or omit this cell.');
  if (serialized.startsWith('/@file/')) serialized = context.assets.context.files[serialized] ?? context.assets.context.files[`./${serialized.slice(1)}`];
  if (typeof serialized !== 'string') fail('MB_ASSET_MISSING', 'Table virtual file is missing', 'Re-export with its captured table file.');
  let records: unknown;
  if (serialized.startsWith('data:text/csv')) {
    const match = /^data:text\/csv(?:;charset=[a-zA-Z0-9-]+)?(;base64)?,([\s\S]*)$/i.exec(serialized);
    if (!match) fail('MB_SCHEMA', 'Invalid table CSV data URI', 'Re-export a valid table.');
    const body = match[2] ?? '';
    if (match[1] && (!/^[a-zA-Z0-9+/]*={0,2}$/.test(body) || body.length % 4 !== 0)) fail('MB_SCHEMA', 'Invalid base64 table data', 'Re-export a valid table.');
    let bytes: Buffer;
    try { bytes = match[1] ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body)); }
    catch { fail('MB_SCHEMA', 'Invalid encoded table data', 'Re-export a valid table.'); }
    if (bytes.byteLength > (context.assets.context.maxAssetBytes ?? 64 * 1024 * 1024)) fail('MB_SCHEMA', 'Table data exceeds asset byte limit', 'Reduce the captured rows.');
    try { records = parseCsv(bytes, { columns: (headers: string[]) => {
      if (new Set(headers).size !== headers.length || headers.some((name) => ['__proto__', 'constructor', 'prototype'].includes(name))) throw Error('Unsafe or duplicate CSV headers');
      return headers;
    }, bom: true, skip_empty_lines: true, relax_column_count: false }) as unknown; }
    catch { fail('MB_SCHEMA', 'Invalid captured table CSV', 'Re-export a well-formed table.'); }
  } else {
    try { records = JSON.parse(serialized) as unknown; }
    catch { fail('MB_SCHEMA', 'Invalid captured table JSON', 'Re-export a well-formed table.'); }
  }
  if (!Array.isArray(records) || records.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) fail('MB_SCHEMA', 'Table rows must be records', 'Re-export a supported table.');
  const scan = (entry: unknown, depth = 0): void => {
    if (depth > 32) fail('MB_SCHEMA', 'Table cell nesting exceeds limit', 'Simplify the table output.');
    if (Array.isArray(entry)) { for (const item of entry) scan(item, depth + 1); return; }
    if (entry && typeof entry === 'object') for (const [key, value] of Object.entries(entry)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('MB_SCHEMA', 'Unsafe table key', 'Remove prototype pollution keys.');
      scan(value, depth + 1);
    }
  };
  scan(records);
  const hidden = decodeAttribute(node, 'hidden-columns');
  if (hidden !== undefined && (!Array.isArray(hidden) || hidden.some((name) => typeof name !== 'string'))) fail('MB_SCHEMA', 'Invalid hidden columns', 'Re-export a supported table.');
  const excluded = new Set(['_marimo_row_id', ...(hidden as string[] | undefined ?? [])]);
  const headers = [...new Set(records.flatMap((row) => Object.keys(row)))].filter((name) => !excluded.has(name));
  const scalar = (value: unknown): string | number | boolean | null => value === null || value === undefined ? null : typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) ? value as string | number | boolean : JSON.stringify(value);
  const rows = records.map((row) => headers.map((name) => scalar((row as Record<string, unknown>)[name])));
  const total = decodeAttribute(node, 'total-rows');
  if (total !== undefined && total !== 'too_many' && (!Number.isSafeInteger(total) || (total as number) < rows.length)) fail('MB_SCHEMA', 'Invalid table total', 'Re-export a table with valid row count.');
  const download = decodeAttribute(node, 'show-download');
  if (download !== undefined && typeof download !== 'boolean') fail('MB_SCHEMA', 'Invalid table download setting', 'Re-export a supported table.');
  const payload = { headers, rows, ...(typeof total === 'number' ? { totalRows: total } : {}), download: download !== false };
  if (total === 'too_many' || typeof total === 'number' && total > rows.length) context.diagnostics.push({ ...diagnostic('MB_TRUNCATED_TABLE', `Only ${rows.length} exported rows are searchable`, 'Use WASM for Python-backed pagination.', context.cellId, context.outputIndex), severity: 'warning' });
  return { type: 'table', asset: context.assets.add(Buffer.from(JSON.stringify(payload)), 'application/json'), caption: context.caption, alt: context.alt, preview: { ...payload, rows: rows.slice(0, 20) } };
}
export async function compileMime(output: unknown, context: MimeContext): Promise<MarimoNode[]> {
  if ((context.depth ?? 0) > 100) fail('MB_SCHEMA', 'Nested layout exceeds depth limit', 'Simplify the exported layout.');
  if (!output || typeof output !== 'object' || !('type' in output)) fail('MB_SCHEMA', 'Invalid session output', 'Re-export a valid notebook.');
  const data = output as { type: string; data?: Record<string, unknown>; text?: string; name?: string; ename?: string; evalue?: string; traceback?: string[]; mimetype?: string };
  if (data.type === 'error') {
    context.diagnostics.push(diagnostic('MB_OUTPUT_ERROR', data.evalue ?? 'Cell execution failed', 'Fix and re-export, or explicitly allow this teaching error.', context.cellId, context.outputIndex));
    return [{ type: 'error', name: data.ename ?? 'Error', message: data.evalue ?? '', traceback: data.traceback ?? [] }];
  }
  if (data.type === 'stream') return [{ type: 'text', text: data.text ?? '', stream: data.name === 'stderr' ? 'stderr' : 'stdout' }];
  if (data.type === 'streamMedia' && typeof data.data === 'string') return [{ type: 'media', src: await context.assets.url(data.data, 'resource'), mime: data.mimetype ?? 'application/octet-stream' }];
  if (data.type !== 'data' || !data.data || typeof data.data !== 'object') fail('MB_SCHEMA', 'Unknown session output record', 'Re-export a supported notebook.');
  for (const adapter of context.adapters ?? []) {
    if (context.exporterVersion && adapter.exporterVersions.includes(context.exporterVersion) && adapter.matches(output)) return adapter.compile(output, context);
  }
  const bundle = data.data;
  for (const mime of ['application/vnd.plotly.v1+json', 'application/vnd.vega.v6+json', 'application/vnd.vega.v5+json', 'application/vnd.vegalite.v6+json', 'application/vnd.vegalite.v5+json']) {
    if (!(mime in bundle)) continue;
    const value = typeof bundle[mime] === 'string' ? JSON.parse(bundle[mime]) as unknown : bundle[mime];
    return [await assetJson(value, mime.includes('plotly') ? 'plotly' : 'vega', context)];
  }
  const inputHtml = bundle['text/html'] ?? bundle['text/markdown'];
  if (typeof inputHtml === 'string') {
    let html = context.htmlMode === 'sandbox' ? inputHtml : normalizeMarimoMarkup(inputHtml);
    const tree = parseFragment(html) as unknown as HtmlNode;
    // Official Markdown serializes TeX as ||(...||) / ||[...||], including
    // inline formulas within prose. Replace in place, not by extracting a
    // descendant and losing its surrounding paragraph.
    const replaceMath = (node: HtmlNode): void => {
      node.childNodes = node.childNodes?.flatMap((child) => {
        if (child.nodeName !== 'marimo-tex') { replaceMath(child); return [child]; }
        let source = attribute(child, 'data-tex') ?? text(child);
        const display = source.startsWith('||[') && source.endsWith('||]');
        if (display || source.startsWith('||(') && source.endsWith('||)')) source = source.slice(3, -3);
        try {
          const rendered = katex.renderToString(source, { trust: false, throwOnError: true, output: 'mathml', displayMode: display });
          return (parseFragment(sanitizeOutput(rendered)) as unknown as HtmlNode).childNodes ?? [];
        } catch { fail('MB_UNSUPPORTED', 'Invalid exported TeX expression', 'Correct and re-export the formula.'); }
      });
    };
    if (find(tree, (node) => node.nodeName === 'marimo-tex')) { replaceMath(tree); html = serialize(tree as never); }
    // marimo's hstack/vstack serialize as a flex div, not a custom element.
    // Parse CSS declarations instead of reusing untrusted inline styles.
    const roots = (tree.childNodes ?? []).filter((node) => node.nodeName !== '#text' || node.value?.trim());
    const root = roots.length === 1 ? roots[0] : undefined;
    if (root?.nodeName === 'div' && attribute(root, 'style')) {
      try {
        const declarations = new Map<string, string>();
        cssTree.walk(cssTree.parse(attribute(root, 'style')!, { context: 'declarationList' }), { visit: 'Declaration', enter(declaration) {
          declarations.set(declaration.property.toLowerCase(), cssTree.generate(declaration.value).trim().toLowerCase());
        } });
        if (declarations.get('display') === 'flex' && ['row', 'column'].includes(declarations.get('flex-direction') ?? '')) {
          const children: MarimoNode[] = [];
          for (const child of root.childNodes ?? []) {
            if (child.nodeName === '#text' && !child.value?.trim()) continue;
            children.push(...await compileMime({ type: 'data', data: { 'text/html': serializeOuter(child as never) } }, { ...context, depth: (context.depth ?? 0) + 1 }));
          }
          return [{ type: 'layout', layout: declarations.get('flex-direction') === 'column' ? 'stack' : 'grid', children }];
        }
      } catch (cause) { if (cause instanceof Error && cause.name === 'MarimoBlogError') throw cause; }
    }
    const tabContainer = find(tree, (node) => node.nodeName === 'marimo-tabs' || node.nodeName === 'marimo-accordion');
    if (tabContainer) {
      if (!isOnlyOutput(tree, tabContainer)) fail('MB_UNSUPPORTED', 'Panels mixed with other output', 'Split panels into their own output.');
      const tabs = tabContainer.nodeName === 'marimo-tabs';
      const names = decodeAttribute(tabContainer, tabs ? 'tabs' : 'labels');
      const panelNodes = (tabContainer.childNodes ?? []).filter((child) => child.nodeName === 'div' && (!tabs || attribute(child, 'data-kind') === 'tab'));
      if (!Array.isArray(names) || !names.every((value) => typeof value === 'string') || names.length !== panelNodes.length || panelNodes.length === 0) fail('MB_SCHEMA', 'Panel labels and contents differ', 'Re-export a completed tabs/accordion output.');
      const panels: { title: string; children: MarimoNode[] }[] = [];
      for (const [index, panel] of panelNodes.entries()) panels.push({
        title: safeLabel(names[index] as string, `Panel ${index + 1}`),
        children: await compileMime({ type: 'data', data: { 'text/html': serialize(panel as never) } }, { ...context, depth: (context.depth ?? 0) + 1 }),
      });
      return [{ type: tabs ? 'tabs' : 'accordion', panels }];
    }
    const carousel = find(tree, (node) => node.nodeName === 'marimo-carousel');
    if (carousel) {
      if (!isOnlyOutput(tree, carousel)) fail('MB_UNSUPPORTED', 'Carousel mixed with other output', 'Use a supported stack or separate output.');
      const panels: { title: string; children: MarimoNode[] }[] = [];
      for (const child of carousel.childNodes ?? []) {
        if (child.nodeName === '#text' && !child.value?.trim()) continue;
        panels.push({ title: `Slide ${panels.length + 1}`, children: await compileMime({ type: 'data', data: { 'text/html': serializeOuter(child as never) } }, { ...context, depth: (context.depth ?? 0) + 1 }) });
      }
      return [{ type: 'tabs', panels }];
    }
    const plot = find(tree, (node) => node.nodeName === 'marimo-plotly');
    const vega = find(tree, (node) => node.nodeName === 'marimo-vega');
    if (plot || vega) {
      const node = (plot ?? vega)!;
      if (!isOnlyOutput(tree, node) || find(node, (item) => item.nodeName === 'script')) {
        context.diagnostics.push(diagnostic('MB_UNSUPPORTED', 'Chart mixed with additional HTML or author scripts', 'Split chart and prose into separate outputs; sandbox reviewed scripts.', context.cellId, context.outputIndex));
        return [{ type: 'unsupported', mime: 'text/html', message: 'Mixed chart output is not safely supported.' }];
      }
      const spec = attribute(node, 'data-figure') ?? attribute(node, 'data-spec');
      if (spec) {
        try {
          const figure = JSON.parse(spec) as unknown;
          const config = attribute(node, 'data-config');
          const value = plot && config && figure && typeof figure === 'object' && !Array.isArray(figure) ? { ...figure, config: JSON.parse(config) as unknown } : figure;
          return [await assetJson(value, plot ? 'plotly' : 'vega', context)];
        }
        catch { fail('MB_SCHEMA', 'Invalid chart attribute JSON', 'Re-export a valid chart.'); }
      }
      context.diagnostics.push(diagnostic('MB_UNSUPPORTED', `Unrecognized ${node.nodeName} serialization`, 'Inspect an authentic exporter fixture and implement its tested adapter.', context.cellId, context.outputIndex));
      return [{ type: 'unsupported', mime: 'text/html', message: 'This chart export has no supported static specification.' }];
    }
    const table = find(tree, (node) => node.nodeName === 'marimo-table');
    if (table) {
      if (!isOnlyOutput(tree, table)) fail('MB_UNSUPPORTED', 'Table mixed with other output', 'Split the table into a separate output.');
      return [tableRows(table, context)];
    }
    const callout = find(tree, (node) => node.nodeName === 'marimo-callout-output');
    if (callout) {
      if (!isOnlyOutput(tree, callout)) fail('MB_UNSUPPORTED', 'Callout mixed with other output', 'Use a supported stack or separate output.');
      const body = decodeAttribute(callout, 'html');
      const kind = decodeAttribute(callout, 'kind');
      if (typeof body !== 'string' || typeof kind !== 'string') fail('MB_SCHEMA', 'Invalid callout attributes', 'Re-export a complete callout.');
      return [{ type: 'callout', kind, children: await compileMime({ type: 'data', data: { 'text/html': body } }, { ...context, depth: (context.depth ?? 0) + 1 }) }];
    }
    const statistic = find(tree, (node) => node.nodeName === 'marimo-stat');
    if (statistic) {
      if (!isOnlyOutput(tree, statistic)) fail('MB_UNSUPPORTED', 'Statistic mixed with other output', 'Use a supported stack or separate output.');
      const value = decodeAttribute(statistic, 'value');
      const label = decodeAttribute(statistic, 'label');
      const caption = decodeAttribute(statistic, 'caption');
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) fail('MB_SCHEMA', 'Invalid statistic value', 'Re-export a scalar statistic.');
      return [{ type: 'statistic', value: String(value ?? ''), label: typeof label === 'string' ? safeLabel(label, '') : '', ...(typeof caption === 'string' ? { caption: safeLabel(caption, '') } : {}) }];
    }
    const json = find(tree, (node) => node.nodeName === 'marimo-json-output');
    if (json) {
      if (!isOnlyOutput(tree, json)) fail('MB_UNSUPPORTED', 'JSON mixed with other output', 'Use a supported stack or separate output.');
      return [await assetJson(decodeAttribute(json, 'json-data'), 'json', context)];
    }
    const dataframe = find(tree, (node) => node.nodeName === 'marimo-dataframe');
    if (dataframe) {
      if (!isOnlyOutput(tree, dataframe)) fail('MB_UNSUPPORTED', 'Dataframe mixed with other output', 'Split the dataframe into a separate output.');
      context.diagnostics.push({ ...diagnostic('MB_RUNTIME_REQUIRED', 'Dataframe transforms and row queries need Python', 'Publish a WASM version for live dataframe operations.', context.cellId, context.outputIndex), severity: 'warning' });
      return [{ type: 'runtime-required', value: 'Dataframe', message: 'This control needs Python. Showing the exported value.' }];
    }
    const widget = find(tree, (node) => node.nodeName === 'marimo-anywidget');
    if (widget) {
      if (!isOnlyOutput(tree, widget)) fail('MB_UNSUPPORTED', 'Widget mixed with other output', 'Split the widget into a separate output.');
      context.diagnostics.push(diagnostic('MB_UNSUPPORTED', 'anywidget requires its own runtime and is not statically rendered', 'Omit the cell or acknowledge its visible fallback explicitly.', context.cellId, context.outputIndex));
      return [{ type: 'unsupported', mime: 'text/html', message: 'Custom widget output is unavailable in the static article.' }];
    }
    const control = find(tree, (node) => node.nodeName.startsWith('marimo-') && node.nodeName !== 'marimo-ui-element');
    if (control) {
      if (!isOnlyOutput(tree, control)) fail('MB_UNSUPPORTED', 'Control mixed with other output', 'Split the control into a separate output.');
      if (!/^(?:marimo-(?:slider|text|number|checkbox|dropdown|radio|button|form|switch|date|ui-)|marimo-ui-)/.test(control.nodeName)) {
        context.diagnostics.push(diagnostic('MB_UNSUPPORTED', `Unrecognized ${control.nodeName} output`, 'Use a supported static output or acknowledge this cell.', context.cellId, context.outputIndex));
        return [{ type: 'unsupported', mime: 'text/html', message: `Unrecognized ${control.nodeName} output.` }];
      }
      context.diagnostics.push({ ...diagnostic('MB_RUNTIME_REQUIRED', `Interactive ${control.nodeName} needs Python`, 'Publish a separate WASM export for live controls.', context.cellId, context.outputIndex), severity: 'warning' });
      const initial = decodeAttribute(control, 'initial-value');
      const label = decodeAttribute(control, 'label');
      const captured = initial === undefined ? text(control) : typeof initial === 'string' ? initial : JSON.stringify(initial);
      const title = typeof label === 'string' ? safeLabel(label, '') : '';
      return [{ type: 'runtime-required', value: title ? `${title}: ${captured}` : captured, message: 'This control needs Python. Showing the exported value.' }];
    }
    if (context.htmlMode === 'sandbox') {
      const safeTree = parseFragment(html) as unknown as HtmlNode;
      const clean = (node: HtmlNode): void => {
        node.childNodes = node.childNodes?.filter((child) => !['iframe', 'object', 'embed', 'form', 'base', 'meta', 'link'].includes(child.nodeName));
        for (const child of node.childNodes ?? []) {
          if (child.nodeName === 'script') {
            const scriptUrl = attribute(child, 'src');
            if (scriptUrl && !context.sandboxScriptUrls?.includes(scriptUrl)) fail('MB_UNSAFE_URL', 'Sandbox script URL not on exact allowlist', 'Review and list every script URL.');
          }
          clean(child);
        }
      };
      clean(safeTree);
      const csp = `default-src 'none'; script-src 'unsafe-inline' ${context.sandboxAllowEval ? "'unsafe-eval' " : ''}${(context.sandboxScriptUrls ?? []).join(' ')}; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'`;
      const document = `<html><head><meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}"><meta name="referrer" content="no-referrer"></head><body>${serialize(safeTree as never)}</body></html>`;
      const asset = context.assets.add(Buffer.from(document), 'text/html');
      context.diagnostics.push({ ...diagnostic('MB_SCRIPT_SANDBOX', 'Scripted HTML isolated in an opaque-origin sandbox', 'Review the output and its exact script allowlist.', context.cellId, context.outputIndex), severity: 'warning' });
      return [{ type: 'sandbox', asset, caption: context.caption, alt: context.alt, scriptUrls: context.sandboxScriptUrls ?? [], ...(context.sandboxAllowEval ? { allowEval: true } : {}) }];
    }
    const unknownElement = find(tree, (node) => node.nodeName.includes('-') && !node.nodeName.startsWith('#'));
    if (unknownElement) {
      context.diagnostics.push(diagnostic('MB_UNSUPPORTED', `Unknown custom element ${unknownElement.nodeName}`, 'Implement a tested static adapter or allow this exact cell diagnostic.', context.cellId, context.outputIndex));
      return [{ type: 'unsupported', mime: 'text/html', message: `Cannot render ${unknownElement.nodeName} statically.` }];
    }
    if (/<script\b|<iframe\b|\son\w+\s*=/i.test(html)) context.diagnostics.push(diagnostic('MB_SCRIPT_SANDBOX', 'Script/iframe/event handler removed from output HTML', 'Explicitly sandbox reviewed scripted output.', context.cellId, context.outputIndex));
    const compiled = compileHtml(html, context.html);
    return [{ type: 'html', html: compiled.html, ...(context.htmlRole ? { role: context.htmlRole } : {}) }];
  }
  if (typeof bundle['text/latex'] === 'string') {
    const source = bundle['text/latex'];
    try { return [{ type: 'math', source, html: sanitizeOutput(katex.renderToString(source, { trust: false, throwOnError: true, output: 'mathml' })), display: false }]; }
    catch { context.diagnostics.push(diagnostic('MB_UNSUPPORTED', 'Invalid TeX', 'Fix and re-export the expression.', context.cellId, context.outputIndex)); }
  }
  for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']) if (typeof bundle[mime] === 'string') {
    const raw = bundle[mime] as string;
    const src = mime === 'image/svg+xml' && raw.trimStart().startsWith('<') ? `data:image/svg+xml,${encodeURIComponent(raw)}` : raw;
    return [{ type: 'image', src: await context.assets.url(src.startsWith('data:') ? src : `data:${mime};base64,${src}`, 'resource'), alt: context.alt ?? '' , caption: context.caption }];
  }
  if ('application/json' in bundle) return [await assetJson(bundle['application/json'], 'json', context)];
  if ('text/plain' in bundle) {
    const text = String(bundle['text/plain']);
    // An empty return value has nothing to show.
    return text.trim() === '' ? [] : [{ type: 'text', text }];
  }
  const mime = Object.keys(bundle)[0] ?? 'unknown';
  context.diagnostics.push(diagnostic('MB_UNSUPPORTED', `Unsupported MIME ${mime}`, 'Use a supported output or allow this exact cell diagnostic.', context.cellId, context.outputIndex));
  return [{ type: 'unsupported', mime, message: 'This exported output cannot be presented statically.' }];
}
